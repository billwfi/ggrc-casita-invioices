const path = require('path')
const fs = require('fs')
const PDFDocument = require('pdfkit')

const LOGO_PATH = path.join(__dirname, 'assets', 'ggrc-logo.png')

// Brand colours pulled from the logo / app theme.
const NAVY = '#1b3a5c'
const SLATE = '#4a5568'
const RULE = '#d5dbe3'

const cur = (v) => {
  const n = Number(v) || 0
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return n < 0 ? `($${s})` : `$${s}`
}

const fmtDate = (d) => {
  if (!d) return ''
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`
  const dt = new Date(d)
  return isNaN(dt) ? '' : `${dt.getMonth() + 1}/${dt.getDate()}/${dt.getFullYear()}`
}

/**
 * Renders the statement to a PDF and resolves with the resulting Buffer.
 * Mirrors the on-screen statement summary so the attachment and the app agree.
 */
function buildStatementPdf(payload, owner, lot) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const s = payload.Summary || {}
    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right
    const width = right - left

    // ---- Header -----------------------------------------------------------
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, left, 42, { height: 34 })
    } else {
      doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY).text('GARDEN OF THE GODS', left, 48)
    }
    doc.font('Helvetica-Bold').fontSize(15).fillColor(NAVY)
       .text('Casita Owner Statement', left, 46, { width, align: 'right' })
    doc.font('Helvetica').fontSize(9).fillColor(SLATE)
       .text(payload.StatementNumber || '', left, 66, { width, align: 'right' })

    doc.moveTo(left, 92).lineTo(right, 92).lineWidth(1).strokeColor(NAVY).stroke()

    // ---- Meta block -------------------------------------------------------
    let y = 104
    const meta = [
      ['Lot / Account', `${lot?.LotNumber ?? payload.LotNumber ?? ''} / ${lot?.AccountNo ?? ''}`],
      ['Owner', owner?.OwnerFullName || owner?.OwnerName || ''],
      ['Property', lot?.LotAddress || ''],
      ['Statement Date', fmtDate(payload.StatementDate)],
      ['Activity Period', `${fmtDate(payload.ActivityStartDate)} — ${fmtDate(payload.ActivityEndDate)}`]
    ].filter(([, v]) => String(v).trim() && String(v).trim() !== '/')

    doc.fontSize(9)
    for (const [label, value] of meta) {
      doc.font('Helvetica').fillColor(SLATE).text(`${label}`, left, y, { width: 110 })
      doc.font('Helvetica-Bold').fillColor('#1a202c').text(String(value), left + 115, y, { width: width - 115 })
      y += 15
    }

    // ---- Summary ----------------------------------------------------------
    y += 10
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('STATEMENT SUMMARY BY STAY DATES', left, y)
    y += 16
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(RULE).stroke()
    y += 8

    const rows = [
      ['Gross Revenue', s.GrossRevenue],
      ['50% Owner Split', s.OwnerSplit],
      ['6.5% Reservation Fee', s.ReservationFee],
      ['2.2% Credit Card Fee', s.CreditCardFee],
      ['Cable/Internet Fee', -Math.abs(Number(s.CableInternetFee) || 0)],
      ['Maintenance & Cleaning', -Math.abs(Number(s.MaintenanceCleaningFee) || 0)],
      ['5% Reserve Amount', s.ReserveAmount],
      ['Reserve Amount Applied', s.ReserveAmountApplied],
      ['Total Payout Adjustments', s.TotalAdjustments],
      ['Total Rate Adjustments (in Gross)', s.TotalRateAdjustments],
      ['Total Reserve Adjustments', s.TotalReserveAdjustments],
      ['Reserve Balance (After)', s.ReserveBalanceAfter]
    ]

    doc.fontSize(9.5)
    for (const [label, value] of rows) {
      doc.font('Helvetica').fillColor(SLATE).text(label, left + 4, y, { width: width * 0.62 })
      doc.font('Helvetica').fillColor('#1a202c').text(cur(value), left, y, { width: width - 4, align: 'right' })
      y += 16
      doc.moveTo(left, y - 4).lineTo(right, y - 4).lineWidth(0.3).strokeColor('#eef1f5').stroke()
    }

    // ---- Owner payout -----------------------------------------------------
    y += 6
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(NAVY).stroke()
    y += 8
    doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('Owner Payout', left + 4, y)
    doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY)
       .text(cur(s.OwnerPayout), left, y, { width: width - 4, align: 'right' })
    y += 24

    // ---- Adjustments ------------------------------------------------------
    const adjustments = payload.Adjustments || []
    if (adjustments.length) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('LOT STATEMENT ADJUSTMENTS', left, y)
      y += 16
      const cols = [
        { key: 'Category', label: 'Category', w: 0.22 },
        { key: 'AdjustmentType', label: 'Type', w: 0.22 },
        { key: 'AdjustmentName', label: 'Name', w: 0.3 },
        { key: 'AdjustmentDate', label: 'Date', w: 0.13 },
        { key: 'AdjustmentAmount', label: 'Amount', w: 0.13 }
      ]
      doc.fontSize(8).font('Helvetica-Bold').fillColor(SLATE)
      let x = left
      for (const c of cols) {
        doc.text(c.label, x, y, { width: width * c.w, align: c.key === 'AdjustmentAmount' ? 'right' : 'left' })
        x += width * c.w
      }
      y += 12
      doc.moveTo(left, y - 2).lineTo(right, y - 2).lineWidth(0.5).strokeColor(RULE).stroke()

      doc.font('Helvetica').fillColor('#1a202c')
      for (const a of adjustments) {
        if (y > doc.page.height - 80) { doc.addPage(); y = 60 }
        x = left
        for (const c of cols) {
          let v = a[c.key]
          if (c.key === 'AdjustmentDate') v = fmtDate(v)
          else if (c.key === 'AdjustmentAmount') v = cur(v)
          doc.text(String(v ?? ''), x, y, {
            width: width * c.w - 4,
            align: c.key === 'AdjustmentAmount' ? 'right' : 'left',
            ellipsis: true,
            height: 11
          })
          x += width * c.w
        }
        y += 14
      }
    }

    // ---- Footer -----------------------------------------------------------
    doc.font('Helvetica').fontSize(8).fillColor(SLATE)
       .text('For questions, please contact Amy Giblin at amy.giblin@gardenofthegodsresort.com',
             left, doc.page.height - 62, { width, align: 'center' })

    doc.end()
  })
}

module.exports = { buildStatementPdf, cur, fmtDate }
