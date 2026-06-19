import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'

const LOGO_SRC = '/ggrc-logo.png'

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
  return isNaN(dt) ? '' : dt.toLocaleDateString()
}
const yearOf = (d) => (String(d).match(/^(\d{4})/) || [])[1] || ''
const monthOf = (d) => { const m = String(d).match(/^\d{4}-(\d{2})/); return m ? +m[1] : '' }

// Teal table styling to mirror the sample statement layout
const TH = { backgroundColor: '#1b6a8f', color: '#fff' }
const ALT = '#e8f1f6'

function Section({ title, children }) {
  return (
    <div className="mb-5 print-avoid-break">
      <h2 className="text-base font-semibold mb-1" style={{ color: '#1b6a8f' }}>{title}</h2>
      {children}
    </div>
  )
}

function Table({ headers, rows, aligns = [] }) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th key={i} className="px-2 py-1.5 font-semibold border border-white"
                style={{ ...TH, textAlign: aligns[i] || 'left' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri} style={{ backgroundColor: ri % 2 ? '#fff' : ALT }}>
            {r.map((c, ci) => (
              <td key={ci} className="px-2 py-1 border" style={{ borderColor: '#cde0ea', textAlign: aligns[ci] || 'left' }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function StatementPrint() {
  const { lotId, statementId } = useParams()
  const navigate = useNavigate()
  const [stmt, setStmt] = useState(null)
  const [lot, setLot] = useState(null)
  const [owner, setOwner] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [logoOk, setLogoOk] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [s, l, owners] = await Promise.all([
          api.statements.get(statementId),
          api.lots.get(lotId),
          api.owners.getByLot(lotId).catch(() => [])
        ])
        setStmt(s)
        setLot(l)
        const list = Array.isArray(owners) ? owners : (owners?.data ?? [])
        setOwner(list.find(o => !o.OwnershipEndDate) ?? list[0] ?? null)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [lotId, statementId])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading statement...</div>
  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded">{error}</div>
  if (!stmt) return null

  const summary = stmt.Summary ?? {}
  const details = stmt.Details ?? []
  const adjustments = stmt.Adjustments ?? []
  const feesByRoom = (stmt.Fees ?? []).slice().sort((a, b) => String(a.RoomNumber).localeCompare(String(b.RoomNumber)))

  // Line items come straight from the saved statement (existing base logic).
  const lines = details
    .filter(d => d.RoomNumber != null && d.RoomNumber !== '')
    .map(d => ({
      RoomNumber: d.RoomNumber,
      StayDate: d.StayDate,
      gross: Number(d.RoomRevenue) || 0,
      split: Number(d.OwnerSplit) || 0,
      resFee: Number(d.ReservationFee) || 0,
      ccFee: Number(d.CreditCardFee) || 0
    }))

  // Totals taken from the statement summary so the print matches the on-screen view.
  const totalGross = Number(summary.GrossRevenue) || 0
  const totalSplit = Number(summary.OwnerSplit) || 0
  const totalRes = Number(summary.ReservationFee) || 0
  const totalCc = Number(summary.CreditCardFee) || 0
  const cable = Number(summary.CableInternetFee) || 0
  const cleaning = Number(summary.MaintenanceCleaningFee) || 0
  const reserveAmount = Number(summary.ReserveAmount) || 0          // 5% of owner split
  const totalReserveAdj = Number(summary.TotalReserveAdjustments) || 0 // applied only when balance < $10k
  const totalFeesExpenses = Math.abs(totalRes) + Math.abs(totalCc) + cable + cleaning
  const totalAdjustments = Number(summary.TotalAdjustments) || 0
  const finalPayout = Number(summary.OwnerPayout) || 0

  const reserveYesNo = owner?.ReserveAccount || 'No'
  const currentReserve = Number(owner?.ReserveBalance ?? summary.CurrentReserveBalance ?? 0)
  const newReserveBalance = summary.ReserveBalance != null ? Number(summary.ReserveBalance) : (currentReserve + totalReserveAdj)

  // Statistics: rental nights by room for this statement period
  const yr = yearOf(stmt.ActivityStartDate)
  const mo = monthOf(stmt.ActivityStartDate)
  const totalNights = feesByRoom.reduce((a, r) => a + (r.TotalRoomNights || 0), 0)

  return (
    <div className="bg-white">
      {/* Toolbar (screen only) */}
      <div className="no-print flex items-center justify-between mb-4">
        <button className="btn-secondary btn-sm" onClick={() => navigate(`/lots/${lotId}/statements/${statementId}`)}>← Back</button>
        <button className="btn-primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <div className="max-w-4xl mx-auto px-2" style={{ color: '#222' }}>
        {/* Header */}
        <div className="text-center mb-4">
          {logoOk ? (
            <img
              src={LOGO_SRC}
              alt="Garden of the Gods Resort — Wellness Club"
              className="mx-auto mb-3"
              style={{ maxHeight: 90, maxWidth: '100%' }}
              onError={() => setLogoOk(false)}
            />
          ) : (
            <>
              <div className="text-2xl font-bold tracking-wide" style={{ color: '#1b6a8f' }}>
                GARDEN <span className="text-base align-middle">of the</span> GODS
              </div>
              <div className="text-xs tracking-[0.3em] mb-3" style={{ color: '#6b8fa3' }}>RESORT &nbsp;•&nbsp; WELLNESS &nbsp;•&nbsp; CLUB</div>
            </>
          )}
          <div className="text-lg font-semibold">Owner Statement</div>
          <div className="text-sm mt-1">Activity From: {fmtDate(stmt.ActivityStartDate)} To {fmtDate(stmt.ActivityEndDate)}</div>
        </div>

        <div className="flex justify-between text-sm mb-4">
          <span><strong>Statement Date:</strong> {fmtDate(stmt.StatementDate)}</span>
          <span><strong>Statement #:</strong> {stmt.StatementNumber}</span>
        </div>

        <Section title="Lot and Account Info">
          <Table headers={['Lot #', 'Account #', 'Lot Address']}
                 rows={[[lot?.LotNumber, lot?.AccountNo, lot?.LotAddress]]} />
        </Section>

        <Section title="Owner Info">
          <Table headers={['Owner Name', 'Address', 'City', 'ST', 'Zip']}
                 rows={[[owner?.OwnerName ?? '—', owner?.OwnerAddress ?? '', owner?.OwnerCity ?? '', owner?.OwnerState ?? '', owner?.OwnerZip ?? '']]} />
        </Section>

        <Section title="Fees">
          <Table headers={['Room #', 'Total Room Nights', 'Total Reservation Fees', 'Total Credit Card Fees']}
                 aligns={['left', 'right', 'right', 'right']}
                 rows={feesByRoom.map(r => [r.RoomNumber, r.TotalRoomNights, mag(r.TotalReservationFees), mag(r.TotalCreditCardFees)])} />
        </Section>

        <Section title="Expenses and Adjustments">
          <div className="mb-3">
            <Table headers={['Expense Category', 'Cable/Internet Fee', 'Maintenance and Cleaning']}
                   aligns={['left', 'right', 'right']}
                   rows={[['Standard Monthly', cur(cable), cur(cleaning)]]} />
          </div>
          <Table headers={['Category', 'Adjustment Type', 'Adjustment Name', 'Adjustment Date', 'Adjustment Amount']}
                 aligns={['left', 'left', 'left', 'left', 'right']}
                 rows={adjustments.length
                   ? adjustments.map(a => [a.Category, a.AdjustmentType, a.AdjustmentName, fmtDate(a.AdjustmentDate), cur(a.AdjustmentAmount)])
                   : [['—', '', '', '', '']]} />
        </Section>

        <Section title="Rental Activity Detail">
          <Table headers={['Room #', 'Stay Date', 'Room Revenue', '50% Owner Split', 'Reservation Fee', 'Credit Card Fee']}
                 aligns={['left', 'left', 'right', 'right', 'right', 'right']}
                 rows={lines.map(l => [l.RoomNumber, fmtDate(l.StayDate), cur(round(l.gross)), cur(round(l.split)), mag(l.resFee), mag(l.ccFee)])} />
        </Section>

        <Section title="Summary and Totals">
          <div className="text-xs font-semibold mb-1" style={{ color: '#1b6a8f' }}>Owner Share, Fees and Expenses</div>
          <div className="mb-3">
            <Table headers={['Reservation Fee', 'Credit Card Fee', 'Cable/Internet Fee', 'Maintenance and Cleaning', 'Total Fees and Expenses']}
                   aligns={['right', 'right', 'right', 'right', 'right']}
                   rows={[[mag(totalRes), mag(totalCc), cur(cable), cur(cleaning), cur(round(totalFeesExpenses))]]} />
          </div>

          <div className="text-xs font-semibold mb-1" style={{ color: '#1b6a8f' }}>
            Owner Share, Reserve and Adjustments
            <span className="font-normal italic"> (5% reserve is applied only when the reserve balance is under $10,000)</span>
          </div>
          <div className="mb-3">
            <Table headers={['Reserve Yes/No', 'Current Reserve Balance', '5% Reserve Amount', 'Total Reserve Adjustments', 'New Reserve Balance']}
                   aligns={['left', 'right', 'right', 'right', 'right']}
                   rows={[[reserveYesNo, cur(currentReserve), cur(round(reserveAmount)), cur(round(totalReserveAdj)), cur(round(newReserveBalance))]]} />
          </div>

          <div className="text-xs font-semibold mb-1" style={{ color: '#1b6a8f' }}>Total Payout</div>
          <Table headers={['Gross', '50% Owner Split', 'Total Fees and Expenses', 'Reserve Applied', 'Final Owner Payout']}
                 aligns={['right', 'right', 'right', 'right', 'right']}
                 rows={[[cur(round(totalGross)), cur(round(totalSplit)), cur(round(totalFeesExpenses)), cur(round(totalReserveAdj)), cur(round(finalPayout))]]} />
        </Section>

        <Section title="Statistics">
          <Table headers={['Year', 'Month', 'Room #', 'Stat Category', 'Total Nights']}
                 aligns={['left', 'left', 'left', 'left', 'right']}
                 rows={[
                   ...feesByRoom.map(r => [yr, mo, r.RoomNumber, 'Rental Nights', r.TotalRoomNights]),
                   [yr, mo, 'All Rooms', 'Total Nights', totalNights]
                 ]} />
        </Section>
      </div>
    </div>
  )
}
