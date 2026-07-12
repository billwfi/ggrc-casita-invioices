import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api'
import DataTable from '../components/DataTable'

export default function LotDetail() {
  const { lotId } = useParams()
  const navigate = useNavigate()
  const [lot, setLot] = useState(null)
  const [owner, setOwner] = useState(null)
  const [rooms, setRooms] = useState([])
  const [statements, setStatements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('overview')

  // New-statement form (per-lot invoice generation)
  const [showStmtForm, setShowStmtForm] = useState(false)
  const [stmtStart, setStmtStart] = useState('')
  const [stmtEnd, setStmtEnd] = useState('')
  const [creatingStmt, setCreatingStmt] = useState(false)
  const [stmtError, setStmtError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [lotData, ownerData, roomsData, stmtData] = await Promise.all([
          api.lots.get(lotId),
          api.owners.getByLot(lotId).catch(() => null),
          api.rooms.getByLot(lotId).catch(() => []),
          api.statements.getByLot(lotId).catch(() => [])
        ])
        setLot(lotData)
        setOwner(Array.isArray(ownerData) ? ownerData[0] : ownerData)
        setRooms(Array.isArray(roomsData) ? roomsData : (roomsData?.data ?? []))
        setStatements(Array.isArray(stmtData) ? stmtData : (stmtData?.data ?? []))
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [lotId])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading lot...</div>
  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded">{error}</div>
  if (!lot) return null

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—'
  const fmtCurrency = (v) => v != null ? `$${Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` : '—'

  async function createStatement() {
    if (!stmtStart || !stmtEnd) {
      alert('Please select an activity start and end date.')
      return
    }
    if (stmtEnd < stmtStart) {
      alert('End date must be on or after the start date.')
      return
    }
    setCreatingStmt(true)
    setStmtError(null)
    try {
      await api.statements.create({
        LotID: lotId,
        ActivityStartDate: stmtStart,
        ActivityEndDate: stmtEnd
      })
      const stmtData = await api.statements.getByLot(lotId).catch(() => [])
      setStatements(Array.isArray(stmtData) ? stmtData : (stmtData?.data ?? []))
      setShowStmtForm(false)
      setStmtStart('')
      setStmtEnd('')
    } catch (e) {
      setStmtError(e.message)
    } finally {
      setCreatingStmt(false)
    }
  }

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
          <button className="btn-secondary btn-sm" onClick={() => navigate('/lots')}>← Back</button>
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
            <button className="btn-primary btn-sm" onClick={() => { setShowStmtForm(v => !v); setStmtError(null) }}>
              {showStmtForm ? 'Cancel' : '+ New Statement'}
            </button>
          </div>

          {showStmtForm && (
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="label">Activity Start Date *</label>
                  <input type="date" className="input" value={stmtStart} onChange={(e) => setStmtStart(e.target.value)} />
                </div>
                <div>
                  <label className="label">Activity End Date *</label>
                  <input type="date" className="input" value={stmtEnd} onChange={(e) => setStmtEnd(e.target.value)} />
                </div>
                <button className="btn-primary btn-sm" onClick={createStatement} disabled={creatingStmt}>
                  {creatingStmt ? 'Creating…' : 'Create Statement'}
                </button>
              </div>
              {stmtError && (
                <div className="mt-3 p-2 bg-red-50 text-red-700 rounded text-sm">{stmtError}</div>
              )}
            </div>
          )}

          <DataTable
            columns={[
              { key: 'StatementNumber', label: 'Statement #' },
              { key: 'StatementDate', label: 'Statement Date', render: fmtDate },
              { key: 'ActivityStartDate', label: 'Activity Start', render: fmtDate },
              { key: 'ActivityEndDate', label: 'Activity End', render: fmtDate },
              { key: 'OwnerPayout', label: 'Owner Payout', render: fmtCurrency }
            ]}
            rows={statements}
            onRowClick={(s) => navigate(`/lots/${lotId}/statements/${s.StatementID}`)}
            emptyMessage="No statements found."
          />
        </div>
      )}

      {tab === 'stats' && (
        <div className="card p-8 text-center text-gray-400">
          Select a statement to view its statistics.
        </div>
      )}
    </div>
  )
}
