import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'

const today = () => new Date().toISOString().split('T')[0]

export default function LotDetail() {
  const { lotId } = useParams()
  const navigate = useNavigate()
  const [lot, setLot] = useState(null)
  const [owner, setOwner] = useState(null)
  const [rooms, setRooms] = useState([])
  const [statements, setStatements] = useState([])
  const [lotsList, setLotsList] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('overview')
  const [stmtModal, setStmtModal] = useState(false)
  const [stmtForm, setStmtForm] = useState({ StatementDate: today(), ActivityStartDate: '', ActivityEndDate: '' })
  const [savingStmt, setSavingStmt] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [lotData, ownerData, roomsData, stmtData, statsData, lotsData] = await Promise.all([
          api.lots.get(lotId),
          api.owners.getByLot(lotId).catch(() => null),
          api.rooms.getByLot(lotId).catch(() => []),
          api.statements.getByLot(lotId).catch(() => []),
          api.statistics(lotId).catch(() => null), // all-time, no date range
          api.lots.list({ pageSize: 500 }).catch(() => ({ data: [] })) // for prev/next lot nav
        ])
        setLot(lotData)
        setLotsList(lotsData?.data ?? [])
        setOwner(Array.isArray(ownerData) ? ownerData[0] : ownerData)
        setRooms(Array.isArray(roomsData) ? roomsData : (roomsData?.data ?? []))
        setStatements(Array.isArray(stmtData) ? stmtData : (stmtData?.data ?? []))
        setStats(statsData)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [lotId])

  function openNewStatement() {
    setStmtForm({ StatementDate: today(), ActivityStartDate: '', ActivityEndDate: '' })
    setStmtModal(true)
  }

  async function deleteStatement(s) {
    if (!confirm(`Delete statement ${s.StatementNumber}? This removes its saved line items.`)) return
    try {
      await api.statements.delete(s.StatementID)
      setStatements(list => list.filter(x => x.StatementID !== s.StatementID))
    } catch (e) {
      alert(e.message)
    }
  }

  async function createStatement() {
    if (!stmtForm.ActivityStartDate || !stmtForm.ActivityEndDate) {
      alert('Activity start and end dates are required.')
      return
    }
    if (stmtForm.ActivityStartDate > stmtForm.ActivityEndDate) {
      alert('Activity start date must be on or before the end date.')
      return
    }
    setSavingStmt(true)
    try {
      const created = await api.statements.create({ LotID: lotId, ...stmtForm })
      setStmtModal(false)
      navigate(`/lots/${lotId}/statements/${created.StatementID}`)
    } catch (e) {
      alert(e.message)
    } finally {
      setSavingStmt(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading lot...</div>
  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded">{error}</div>
  if (!lot) return null

  const fmtDate = (d) => {
    if (!d) return '—'
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${+m[2]}/${+m[3]}/${m[1]}`
    const dt = new Date(d)
    return isNaN(dt) ? '—' : dt.toLocaleDateString()
  }
  const fmtCurrency = (v) => v != null ? `$${Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` : '—'
  const fmtNeg = (v) => {
    if (v == null) return '—'
    const n = Number(v)
    return n < 0 ? `(${fmtCurrency(Math.abs(n))})` : fmtCurrency(n)
  }

  // Lot-level statistics (all statement time frames)
  const roomStats = stats?.RoomStats ?? []
  const revenueStats = stats?.RevenueStats ?? []
  const yrRoomTotals = {}
  roomStats.forEach(r => { const k = `${r.Year}|${r.RoomNumber}`; yrRoomTotals[k] = (yrRoomTotals[k] || 0) + r.TotalNights })
  const roomRows = roomStats.map(r => ({ ...r, TotalForYearAndRoom: yrRoomTotals[`${r.Year}|${r.RoomNumber}`] }))
  const grandNights = roomStats.reduce((a, r) => a + (r.TotalNights || 0), 0)

  // Prev/next lot navigation (lots ordered by LotNumber)
  const lotIdx = lotsList.findIndex(l => String(l.LotID) === String(lotId))
  const prevLot = lotIdx > 0 ? lotsList[lotIdx - 1] : null
  const nextLot = lotIdx >= 0 && lotIdx < lotsList.length - 1 ? lotsList[lotIdx + 1] : null

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/lots" className="hover:text-navy-700">Lot Information</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">Lot #{lot.LotNumber}</span>
      </div>

      {/* Header card */}
      <div className="card p-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-navy-700">Lot #{lot.LotNumber}</h1>
            <p className="text-gray-600 mt-0.5">{lot.LotAddress}, {lot.LotCity}, {lot.LotState} {lot.LotZip}</p>
            <p className="text-gray-500 text-xs mt-1">Account No: {lot.AccountNo}</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" disabled={!prevLot}
              onClick={() => prevLot && navigate(`/lots/${prevLot.LotID}`)}
              title={prevLot ? `Lot #${prevLot.LotNumber}` : ''}>← Prev Lot</button>
            <button className="btn-secondary btn-sm" disabled={!nextLot}
              onClick={() => nextLot && navigate(`/lots/${nextLot.LotID}`)}
              title={nextLot ? `Lot #${nextLot.LotNumber}` : ''}>Next Lot →</button>
            <button className="btn-secondary btn-sm" onClick={() => navigate('/lots')}>Back to List</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-1">
        {[
          ['overview', 'Owner & Room Info'],
          ['statements', `Statements (${statements.length})`],
          ['stats', 'Statistics']
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-navy-700 text-navy-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4">
          {/* Owner panel */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-700">Owner Information</h2>
              {owner && (
                <Link to={`/lots/${lotId}/owners/${owner.OwnerID}`} className="text-xs text-blue-600 hover:underline">
                  Open →
                </Link>
              )}
            </div>
            {owner ? (
              <dl className="space-y-1.5 text-sm">
                {[
                  ['Owner Name', owner.OwnerName],
                  ['Account No', owner.AccountNo],
                  ['Purchase Date', fmtDate(owner.DateOfPurchase)],
                  ['Ownership End', fmtDate(owner.OwnershipEndDate)],
                  ['Reserve Account', owner.ReserveAccount],
                  ['Reserve Balance', fmtCurrency(owner.ReserveBalance)],
                  ['Address', owner.OwnerAddress],
                  ['Email', owner.OwnerMainEmail],
                  ['Phone', owner.OwnerMainPhone]
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="w-32 text-gray-500 flex-shrink-0">{k}:</dt>
                    <dd className="text-gray-800">{v ?? '—'}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-gray-400 text-sm">No owner assigned.</p>
            )}
          </div>

          {/* Rooms panel */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-700">Rooms</h2>
            </div>
            {rooms.length > 0 ? (
              <DataTable
                columns={[
                  { key: 'RoomNumber', label: 'Room #' },
                  { key: 'RoomType', label: 'Type' },
                  { key: 'RoomNote', label: 'Note' }
                ]}
                rows={rooms}
                onRowClick={(r) => navigate(`/lots/${lotId}/rooms/${r.RoomID}`)}
              />
            ) : (
              <p className="text-gray-400 text-sm">No rooms assigned.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'statements' && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-700">Statements</h2>
            <button className="btn-primary btn-sm" onClick={openNewStatement}>+ New Statement</button>
          </div>
          <DataTable
            columns={[
              { key: 'StatementNumber', label: 'Statement #' },
              { key: 'StatementDate', label: 'Statement Date', render: fmtDate },
              { key: 'ActivityStartDate', label: 'Activity Start', render: fmtDate },
              { key: 'ActivityEndDate', label: 'Activity End', render: fmtDate },
              { key: 'GrossRevenue', label: 'Gross', render: fmtCurrency },
              { key: 'OwnerPayout', label: 'Owner Payout', render: fmtCurrency }
            ]}
            rows={statements}
            onRowClick={(s) => navigate(`/lots/${lotId}/statements/${s.StatementID}`)}
            actions={(s) => (
              <button className="btn-danger btn-sm" onClick={() => deleteStatement(s)}>Del</button>
            )}
            emptyMessage="No statements found."
          />
        </div>
      )}

      {tab === 'stats' && (
        <div className="space-y-4">
          {/* Room Statistics — all statement time frames */}
          <div className="card overflow-hidden">
            <div className="p-3 border-b"><h3 className="section-title mb-0">Room Statistics</h3></div>
            <DataTable
              columns={[
                { key: 'Year', label: 'Year' },
                { key: 'Month', label: 'Month' },
                { key: 'RoomNumber', label: 'Room #' },
                { key: 'TotalNights', label: 'Total Nights' },
                { key: 'TotalForYearAndRoom', label: 'Total for Year & Room' }
              ]}
              rows={roomRows}
              emptyMessage="No room statistics."
            />
            {roomRows.length > 0 && (
              <div className="px-3 py-2 text-sm font-semibold border-t bg-gray-50 flex justify-between">
                <span>Grand Total Nights</span>
                <span>{grandNights}</span>
              </div>
            )}
          </div>

          {/* Revenue & Expense Statistics — all statement time frames */}
          <div className="card overflow-hidden">
            <div className="p-3 border-b"><h3 className="section-title mb-0">Revenue &amp; Expense Statistics</h3></div>
            <DataTable
              columns={[
                { key: 'Year', label: 'Year' },
                { key: 'YTDGross', label: 'YTD Gross', render: fmtCurrency },
                { key: 'YTDOwnerSplit', label: 'YTD Owner Split', render: fmtCurrency },
                { key: 'YTDAvgDailyRate', label: 'YTD Avg Daily Rate', render: fmtCurrency },
                { key: 'YTDReserveAdjustments', label: 'YTD Reserve Adjustments', render: fmtNeg },
                { key: 'YTDAdjustments', label: 'YTD Adjustments', render: fmtNeg },
                { key: 'YTDOwnerPayout', label: 'YTD Owner Payout', render: fmtCurrency }
              ]}
              rows={revenueStats}
              emptyMessage="No revenue statistics."
            />
          </div>
        </div>
      )}

      {stmtModal && (
        <Modal title={`New Statement — Lot #${lot.LotNumber}`} onClose={() => setStmtModal(false)}>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Line items are pulled from General Revenue by stay date within the activity range below
              and saved with the statement.
            </p>
            {[
              ['StatementDate', 'Statement Date'],
              ['ActivityStartDate', 'Activity Start Date'],
              ['ActivityEndDate', 'Activity End Date']
            ].map(([key, label]) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input
                  type="date"
                  className="input"
                  value={stmtForm[key] ?? ''}
                  onChange={(e) => setStmtForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setStmtModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={createStatement} disabled={savingStmt}>
                {savingStmt ? 'Generating...' : 'Generate Statement'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
