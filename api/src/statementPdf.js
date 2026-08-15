const path = require('path')
const fs = require('fs')
const PDFDocument = require('pdfkit')

const LOGO_PATH = path.join(__dirname, 'assets', 'ggrc-logo.png')

// Mirrors the on-screen print statement (src/pages/StatementPrint.jsx).
const TEAL = '#1b6a8f'
const ALT_ROW = '#e8f1f6'
const CELL_BORDER = '#cde0ea'
const INK = '#222222'

const round = (v) => Math.round((Number(v) || 0) * 100) / 100
const cur = (v) => {
  if (v == null || isNaN(v)) return '$0.00'
  const n = Number(v)
  const s = `$${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
  return n < 0 ? `(${s})` : s
}
// Fees/expenses are stored as signed deductions; show them as positive magnitudes.
const mag = (v) => cur(round(Math.abs(Number(v) || 0)))
const fmtDate = (d) => {
  if (!d) return ''
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${+m[2]}/${+m[3]}/${m[1]}`
  const dt = new Date(d)
  return isNaN(dt) ? '' : `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`
}
const yearOf = (d) => (String(d).match(/^(\d{4})/) || [])[1] || ''
const monthOf = (d) => { const m = String(d).match(/^\d{4}-(\d{2})/); return m ? +m[1] : '' }

const FONT_SIZE = 7.5
const PAD_X = 4
const PAD_Y = 3.5

function buildStatementPdf(payload, owner, lot) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 40, bufferPages: true })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right
    const width = right - left
    const bottom = doc.page.height - doc.page.margins.bottom - 24
    let y = doc.page.margins.top

    const summary = payload.Summary ?? {}
    const details = payload.Details ?? []
    const adjustments = payload.Adjustments ?? []
    const feesByRoom = (payload.Fees ?? []).slice()
      .sort((a, b) => String(a.RoomNumber).localeCompare(String(b.RoomNumber)))

    // ---- table primitives -------------------------------------------------
    const colX = (widths) => {
      const xs = []
      let x = left
      for (const w of widths) { xs.push(x); x += w }
      return xs
    }
    // Resolve proportional weights to absolute widths.
    const resolveWidths = (weights) => {
      const total = weights.reduce((a, b) => a + b, 0)
      return weights.map(w => (w / total) * width)
    }

    const rowHeight = (cells, widths) => {
      doc.fontSize(FONT_SIZE).font('Helvetica')
      let h = 0
      cells.forEach((c, i) => {
        const t = String(c ?? '')
        h = Math.max(h, doc.heightOfString(t, { width: widths[i] - PAD_X * 2 }))
      })
      return Math.max(h + PAD_Y * 2, 14)
    }

    const drawRow = (cells, widths, aligns, opts = {}) => {
      const { header = false, index = 0 } = opts
      const h = header
        ? Math.max(rowHeight(cells, widths), 15)
        : rowHeight(cells, widths)
      const xs = colX(widths)

      if (header) {
        doc.rect(left, y, width, h).fill(TEAL)
      } else if (index % 2 === 0) {
        doc.rect(left, y, width, h).fill(ALT_ROW)
      }

      cells.forEach((c, i) => {
        if (!header) {
          doc.rect(xs[i], y, widths[i], h).lineWidth(0.4).strokeColor(CELL_BORDER).stroke()
        }
        // `height` is what keeps pdfkit from paginating on our behalf: without it a
        // cell drawn near the bottom margin continues onto a page of its own.
        doc.font(header ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(FONT_SIZE)
           .fillColor(header ? '#ffffff' : INK)
           .text(String(c ?? ''), xs[i] + PAD_X, y + PAD_Y, {
             width: widths[i] - PAD_X * 2,
             height: h - PAD_Y * 2,
             align: aligns[i] || 'left'
           })
      })
      y += h
    }

    const newPage = () => { doc.addPage(); y = doc.page.margins.top }

    const drawTable = ({ headers, rows, aligns = [], weights }) => {
      const widths = resolveWidths(weights || headers.map(() => 1))
      if (y + 34 > bottom) newPage()
      drawRow(headers, widths, aligns, { header: true })
      rows.forEach((r, i) => {
        // Keep the header with its rows: repeat it after a break.
        if (y + rowHeight(r, widths) > bottom) {
          newPage()
          drawRow(headers, widths, aligns, { header: true })
        }
        drawRow(r, widths, aligns, { index: i })
      })
      y += 10
    }

    const section = (title) => {
      if (y + 40 > bottom) newPage()
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(TEAL).text(title, left, y)
      y += 15
    }

    // Never use `continued: true` here: pdfkit routes continued runs through
    // LineWrapper, which starts a new page at the end of the run whenever the
    // document's own cursor sits past the bottom margin — and this layout drives
    // `y` manually, so that cursor is routinely stale. Absolute draws with
    // lineBreak:false keep pagination entirely under our control.
    const subLabel = (text, italicTail = '') => {
      if (y + 30 > bottom) newPage()
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(TEAL)
         .text(text, left, y, { lineBreak: false })
      if (italicTail) {
        const w = doc.widthOfString(text)
        doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(TEAL)
           .text(italicTail, left + w, y, { lineBreak: false })
      }
      y += 12
    }

    // ---- header -----------------------------------------------------------
    if (fs.existsSync(LOGO_PATH)) {
      const logoW = 200
      doc.image(LOGO_PATH, left + (width - logoW) / 2, y, { width: logoW })
      y += 52
    } else {
      doc.font('Helvetica-Bold').fontSize(20).fillColor(TEAL)
         .text('GARDEN of the GODS', left, y, { width, align: 'center' })
      y += 24
      doc.font('Helvetica').fontSize(7).fillColor('#6b8fa3')
         .text('R E S O R T   •   W E L L N E S S   •   C L U B', left, y, { width, align: 'center' })
      y += 18
    }

    doc.font('Helvetica-Bold').fontSize(12).fillColor(INK)
       .text('Owner Statement', left, y, { width, align: 'center' })
    y += 16
    doc.font('Helvetica').fontSize(9).fillColor(INK)
       .text(`Activity From: ${fmtDate(payload.ActivityStartDate)} To ${fmtDate(payload.ActivityEndDate)}`,
             left, y, { width, align: 'center' })
    y += 20

    doc.fontSize(8.5)
    const dateLabel = 'Statement Date: '
    doc.font('Helvetica-Bold').fillColor(INK).text(dateLabel, left, y, { lineBreak: false })
    doc.font('Helvetica').text(fmtDate(payload.StatementDate), left + doc.widthOfString(dateLabel), y, { lineBreak: false })

    const numLabel = 'Statement #: '
    const numValue = String(payload.StatementNumber || '')
    doc.font('Helvetica')
    const numValueW = doc.widthOfString(numValue)
    doc.font('Helvetica-Bold')
    const numLabelW = doc.widthOfString(numLabel)
    doc.text(numLabel, right - numValueW - numLabelW, y, { lineBreak: false })
    doc.font('Helvetica').text(numValue, right - numValueW, y, { lineBreak: false })
    y += 20

    // ---- lot / owner ------------------------------------------------------
    section('Lot and Account Info')
    drawTable({
      headers: ['Lot #', 'Account #', 'Lot Address'],
      weights: [1, 1, 4],
      rows: [[lot?.LotNumber ?? payload.LotNumber ?? '', lot?.AccountNo ?? '', lot?.LotAddress ?? '']]
    })

    section('Owner Info')
    drawTable({
      headers: ['Owner Name', 'Address', 'City', 'ST', 'Zip'],
      weights: [2.2, 2.6, 1.4, 0.6, 0.9],
      rows: [[owner?.OwnerName ?? owner?.OwnerFullName ?? '—', owner?.OwnerAddress ?? '',
              owner?.OwnerCity ?? '', owner?.OwnerState ?? '', owner?.OwnerZip ?? '']]
    })

    // ---- fees by room -----------------------------------------------------
    section('Fees')
    drawTable({
      headers: ['Room #', 'Total Room Nights', 'Total Reservation Fees', 'Total Credit Card Fees'],
      aligns: ['left', 'right', 'right', 'right'],
      weights: [1, 1.3, 1.6, 1.6],
      rows: feesByRoom.map(r => [r.RoomNumber, r.TotalRoomNights, mag(r.TotalReservationFees), mag(r.TotalCreditCardFees)])
    })

    // ---- expenses and adjustments ----------------------------------------
    section('Expenses and Adjustments')
    drawTable({
      headers: ['Expense Category', 'Cable/Internet Fee', 'Maintenance and Cleaning'],
      aligns: ['left', 'right', 'right'],
      weights: [2, 1.3, 1.6],
      rows: [['Standard Monthly', cur(summary.CableInternetFee), cur(summary.MaintenanceCleaningFee)]]
    })
    if (adjustments.length) {
      drawTable({
        headers: ['Category', 'Adjustment Type', 'Adjustment Name', 'Adjustment Date', 'Adjustment Amount'],
        aligns: ['left', 'left', 'left', 'left', 'right'],
        weights: [1.2, 1.5, 2.6, 1, 1.2],
        rows: adjustments.map(a => [a.Category, a.AdjustmentType, a.AdjustmentName,
                                    fmtDate(a.AdjustmentDate), cur(a.AdjustmentAmount)])
      })
    }

    // ---- rental activity detail ------------------------------------------
    const lines = details.filter(d => d.RoomNumber != null && d.RoomNumber !== '')
    section(`Rental Activity Detail${lines.length ? ` (${lines.length} records)` : ''}`)
    drawTable({
      headers: ['Room #', 'Stay Date', 'Room Revenue', '50% Owner Split', 'Reservation Fee', 'Credit Card Fee'],
      aligns: ['left', 'left', 'right', 'right', 'right', 'right'],
      weights: [1, 1.2, 1.3, 1.4, 1.3, 1.3],
      rows: lines.map(l => [
        l.RoomNumber, fmtDate(l.StayDate),
        cur(round(Number(l.RoomRevenue) || 0)), cur(round(Number(l.OwnerSplit) || 0)),
        mag(l.ReservationFee), mag(l.CreditCardFee)
      ])
    })

    // ---- summary and totals ----------------------------------------------
    const totalRes = Number(summary.ReservationFee) || 0
    const totalCc = Number(summary.CreditCardFee) || 0
    const cable = Number(summary.CableInternetFee) || 0
    const cleaning = Number(summary.MaintenanceCleaningFee) || 0
    const totalFeesExpenses = Math.abs(totalRes) + Math.abs(totalCc) + cable + cleaning
    const totalReserveAdj = Number(summary.TotalReserveAdjustments) || 0
    const reserveYesNo = owner?.ReserveAccount || 'No'
    const currentReserve = Number(summary.ReserveBalanceBefore ?? owner?.ReserveBalance ?? summary.CurrentReserveBalance ?? 0)
    const newReserveBalance = summary.ReserveBalanceAfter != null
      ? Number(summary.ReserveBalanceAfter)
      : currentReserve + totalReserveAdj

    section('Summary and Totals')
    subLabel('Owner Share, Fees and Expenses')
    drawTable({
      headers: ['Reservation Fee', 'Credit Card Fee', 'Cable/Internet Fee', 'Maintenance and Cleaning', 'Total Fees and Expenses'],
      aligns: ['right', 'right', 'right', 'right', 'right'],
      weights: [1, 1, 1, 1.3, 1.3],
      rows: [[mag(totalRes), mag(totalCc), cur(cable), cur(cleaning), cur(round(totalFeesExpenses))]]
    })

    subLabel('Owner Share, Reserve and Adjustments',
             '  (5% reserve is applied only when the reserve balance is under $10,000)')
    drawTable({
      headers: ['Reserve Yes/No', 'Current Reserve Balance', '5% Reserve Amount', 'Total Reserve Adjustments', 'New Reserve Balance'],
      aligns: ['left', 'right', 'right', 'right', 'right'],
      weights: [1, 1.3, 1.2, 1.4, 1.3],
      rows: [[reserveYesNo, cur(currentReserve), cur(round(summary.ReserveAmount)),
              cur(round(totalReserveAdj)), cur(round(newReserveBalance))]]
    })

    subLabel('Total Payout')
    drawTable({
      headers: ['Gross', '50% Owner Split', 'Total Fees and Expenses', 'Reserve Applied', 'Final Owner Payout'],
      aligns: ['right', 'right', 'right', 'right', 'right'],
      weights: [1.1, 1.2, 1.4, 1.2, 1.3],
      rows: [[cur(round(summary.GrossRevenue)), cur(round(summary.OwnerSplit)),
              cur(round(totalFeesExpenses)), cur(round(summary.ReserveAmountApplied ?? totalReserveAdj)),
              cur(round(summary.OwnerPayout))]]
    })

    // ---- statistics -------------------------------------------------------
    const yr = yearOf(payload.ActivityStartDate)
    const mo = monthOf(payload.ActivityStartDate)
    const totalNights = feesByRoom.reduce((a, r) => a + (r.TotalRoomNights || 0), 0)
    section('Statistics')
    drawTable({
      headers: ['Year', 'Month', 'Room #', 'Stat Category', 'Total Nights'],
      aligns: ['left', 'left', 'left', 'left', 'right'],
      weights: [1, 1, 1.2, 2, 1.2],
      rows: [
        ...feesByRoom.map(r => [yr, mo, r.RoomNumber, 'Rental Nights', r.TotalRoomNights]),
        [yr, mo, 'All Rooms', 'Total Nights', totalNights]
      ]
    })

    // ---- page footers -----------------------------------------------------
    // The footer must sit *inside* the bottom margin. Any y past
    // page.height - margins.bottom counts as an overflow and pdfkit appends a
    // blank page for every footer drawn — lineBreak:false does not prevent it.
    // Table content stops at `bottom`, which is well above this line.
    const range = doc.bufferedPageRange()
    const footerY = doc.page.height - doc.page.margins.bottom - 12
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i)
      doc.font('Helvetica').fontSize(7).fillColor('#7a8a95')
         .text(`${payload.StatementNumber || ''}${payload.StatementNumber ? '  ·  ' : ''}Page ${i + 1} of ${range.count}`,
               left, footerY, { width, align: 'center', lineBreak: false })
    }

    doc.end()
  })
}

module.exports = { buildStatementPdf, cur, mag, fmtDate, round }
