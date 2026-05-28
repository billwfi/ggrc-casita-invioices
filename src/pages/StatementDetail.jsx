import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—'
const fmtCur = (v) => v != null ? `$${Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` : '—'
const fmtNeg = (v) => {
  if (v == null) return '—'
  const n = Number(v)
  return n < 0 ? `(${fmtCur(Math.abs(n))})` : fmtCur(n)
}

export default function StatementDetail() {
  const { lotId, statementId } = useParams()
  const navigate = useNavigate()
  const [stmt, setStmt] = useState(null)
  const [lot, setLot] = useState(null)
  const [adjustments, setAdjustments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('invoice')
  const [adjModal, setAdjModal] = useState(null)
  const [adjForm, setAdjForm] = useState({})

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [stmtData, lotData, adjData] = await Promise.all([
          api.statements.get(statementId),
          api.lots.get(lotId),
          api.adjustments.getByStatement(statementId).catch(() => [])
        ])
        setStmt(stmtData)
        setLot(lotData)
        setAdjustments(Array.isArray(adjData) ? adjData : (adjData?.data ?? []))
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [lotId, statementId])

  async function saveAdj() {
    try {
      if (adjForm.AdjustmentID) {
        await api.adjustments.update(adjForm.AdjustmentID, adjForm)
      } else {
        await api.adjustments.create({ ...adjForm, StatementID: statementId })
      }
      const res = await api.adjustments.getByStatement(statementId)
      setAdjustments(Array.isArray(res) ? res : (res?.data ?? []))
      setAdjModal(null)
    } catch (e) {
      alert(e.message)
    }
  }

  async function deleteAdj(a) {
    if (!confirm('Delete this adjustment?')) return
    try {
      await api.adjustments.delete(a.AdjustmentID)
      setAdjustments(adj => adj.filter(x => x.AdjustmentID !== a.AdjustmentID))
    } catch (e) {
      alert(e.message)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading statement...</div>
  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded">{error}</div>
  if (!stmt) return null

  const summary = stmt.Summary ?? {}
  const details = stmt.Details ?? []
  const fees = stmt.Fees ?? []
  const expenses = stmt.Expenses ?? []
  const stats = stmt.Statistics ?? {}

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/lots" className="hover:text-navy-700">Lots</Link>
        <span>/</span>
        <Link to={`/lots/${lotId}`} className="hover:text-navy-700">Lot #{lot?.LotNumber}</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">Statement #{stmt.StatementNumber}</span>
      </div>

      {/* Statement header */}
      <div className="card p-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Lot # / Account:</span>
            <span className="ml-2 font-medium">{lot?.LotNumber} / {lot?.AccountNo}</span>
          </div>
          <div>
            <span className="text-gray-500">Statement #:</span>
            <span className="ml-2 font-medium">{stmt.StatementNumber}</span>
          </div>
          <div>
            <span className="text-gray-500">Statement Date:</span>
            <span className="ml-2 font-medium">{fmtDate(stmt.StatementDate)}</span>
          </div>
          <div>
            <span className="text-gray-500">Address:</span>
            <span className="ml-2">{lot?.LotAddress}</span>
          </div>
          <div>
            <span className="text-gray-500">Activity Start:</span>
            <span className="ml-2 font-medium">{fmtDate(stmt.ActivityStartDate)}</span>
          </div>
          <div>
            <span className="text-gray-500">Activity End:</span>
            <span className="ml-2 font-medium">{fmtDate(stmt.ActivityEndDate)}</span>
          </div>
          {stmt.StatementNote && (
            <div className="col-span-3">
              <span className="text-gray-500">Note:</span>
              <span className="ml-2">{stmt.StatementNote}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-1">
        {[
          ['invoice', 'Lot Invoices'],
          ['statistics', 'Lot Invoice Statistics']
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-navy-700 text-navy-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'invoice' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="card p-4">
            <h3 className="section-title">Invoice Summary by Stay Dates</h3>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {[
                ['Gross Revenue', fmtCur(summary.GrossRevenue)],
                ['50% Owner Split', fmtCur(summary.OwnerSplit)],
                ['6.5% Reservation Fee', fmtNeg(summary.ReservationFee)],
                ['2.2% Credit Card Fee', fmtNeg(summary.CreditCardFee)],
                ['Cable/Internet Fee', fmtNeg(summary.CableInternetFee)],
                ['Maintenance & Cleaning', fmtNeg(summary.MaintenanceCleaningFee)],
                ['5% Reserve Amount', fmtNeg(summary.ReserveAmount)],
                ['Total Payout Adjustments', fmtNeg(summary.TotalAdjustments)],
                ['Total Reserve Adjustments', fmtNeg(summary.TotalReserveAdjustments)],
                ['Reserve Balance (After)', fmtCur(summary.ReserveBalance)],
                ['Owner Payout', fmtCur(summary.OwnerPayout)]
              ].map(([label, val]) => (
                <div key={label} className={`flex justify-between border-b border-gray-100 pb-1 ${label === 'Owner Payout' ? 'col-span-3 font-bold text-navy-700 text-base border-t border-gray-300 pt-2' : ''}`}>
                  <span className="text-gray-600">{label}</span>
                  <span className="font-medium">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Line items */}
          <div className="card overflow-hidden">
            <div className="p-3 border-b border-gray-200">
              <h3 className="section-title mb-0">Invoice Details by Stay Dates ({details.length} records)</h3>
            </div>
            <DataTable
              columns={[
                { key: 'ConfirmationNumber', label: 'Conf #' },
                { key: 'ArrivalDate', label: 'Arrival', render: fmtDate },
                { key: 'DepartureDate', label: 'Departure', render: fmtDate },
                { key: 'StayDate', label: 'Stay Date', render: fmtDate },
                { key: 'Nights', label: 'Nights' },
                { key: 'RoomType', label: 'Room Type' },
                { key: 'TransCode', label: 'Trans Code' },
                { key: 'RoomRevenue', label: 'Room Revenue', render: fmtCur },
                { key: 'OwnerSplit', label: 'Owner Split', render: fmtCur },
                { key: 'ReservationFee', label: 'Res. Fee', render: fmtCur },
                { key: 'CreditCardFee', label: 'CC Fee', render: fmtCur },
                { key: 'CableInternetFee', label: 'Cable/Net', render: fmtCur },
                { key: 'CleaningFee', label: 'Cleaning', render: fmtCur }
              ]}
              rows={details}
              emptyMessage="No detail records."
            />
          </div>

          {/* Fees by room */}
          {fees.length > 0 && (
            <div className="card overflow-hidden">
              <div className="p-3 border-b border-gray-200">
                <h3 className="section-title mb-0">Statement Fees by Room</h3>
              </div>
              <DataTable
                columns={[
                  { key: 'RoomNumber', label: 'Room #' },
                  { key: 'TotalRoomNights', label: 'Total Nights' },
                  { key: 'TotalReservationFees', label: 'Reservation Fees', render: fmtCur },
                  { key: 'TotalCreditCardFees', label: 'CC Fees', render: fmtCur }
                ]}
                rows={fees}
              />
            </div>
          )}

          {/* Expenses */}
          {expenses.length > 0 && (
            <div className="card overflow-hidden">
              <div className="p-3 border-b border-gray-200">
                <h3 className="section-title mb-0">Statement Expenses</h3>
              </div>
              <DataTable
                columns={[
                  { key: 'ExpenseCategory', label: 'Category' },
                  { key: 'CableInternetFee', label: 'Cable/Internet', render: fmtCur },
                  { key: 'MaintenanceCleaningFee', label: 'Maintenance & Cleaning', render: fmtCur }
                ]}
                rows={expenses}
              />
            </div>
          )}

          {/* Adjustments */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between p-3 border-b border-gray-200">
              <h3 className="section-title mb-0">Lot Invoice Adjustments</h3>
              <button
                className="btn-primary btn-sm"
                onClick={() => { setAdjForm({ AdjustmentDate: new Date().toISOString().split('T')[0] }); setAdjModal('create') }}
              >
                + Add Adjustment
              </button>
            </div>
            <DataTable
              columns={[
                { key: 'Category', label: 'Category' },
                { key: 'AdjustmentType', label: 'Type' },
                { key: 'AdjustmentName', label: 'Name' },
                { key: 'AdjustmentDate', label: 'Date', render: fmtDate },
                { key: 'AdjustmentAmount', label: 'Amount', render: fmtNeg }
              ]}
              rows={adjustments}
              actions={(a) => (
                <>
                  <button className="btn-secondary btn-sm" onClick={() => { setAdjForm({ ...a }); setAdjModal('edit') }}>Edit</button>
                  <button className="btn-danger btn-sm" onClick={() => deleteAdj(a)}>Del</button>
                </>
              )}
              emptyMessage="No adjustments."
            />
          </div>
        </div>
      )}

      {tab === 'statistics' && (
        <div className="space-y-4">
          {stats.NightsByRoom && (
            <div className="card overflow-hidden">
              <div className="p-3 border-b"><h3 className="section-title mb-0">Rental Nights by Room</h3></div>
              <DataTable
                columns={[
                  { key: 'Year', label: 'Year' },
                  { key: 'Month', label: 'Month' },
                  { key: 'RoomNumber', label: 'Room #' },
                  { key: 'StatCategory', label: 'Category' },
                  { key: 'TotalNights', label: 'Total Nights' },
                  { key: 'TotalForYearAndRoom', label: 'YTD for Room' }
                ]}
                rows={stats.NightsByRoom ?? []}
              />
            </div>
          )}
          {stats.ExpenseYTD && (
            <div className="card overflow-hidden">
              <div className="p-3 border-b"><h3 className="section-title mb-0">Expense Statistics YTD</h3></div>
              <DataTable
                columns={[
                  { key: 'Year', label: 'Year' },
                  { key: 'YTDReservationFees', label: 'Reservation Fees', render: fmtCur },
                  { key: 'YTDCreditCardFees', label: 'CC Fees', render: fmtCur },
                  { key: 'YTDCableInternetFees', label: 'Cable/Internet', render: fmtCur },
                  { key: 'YTDCleaningFees', label: 'Cleaning Fees', render: fmtCur },
                  { key: 'YTDTotalExpenses', label: 'Total Expenses', render: fmtCur }
                ]}
                rows={stats.ExpenseYTD ?? []}
              />
            </div>
          )}
          {stats.RevenueYTD && (
            <div className="card overflow-hidden">
              <div className="p-3 border-b"><h3 className="section-title mb-0">Revenue Statistics YTD</h3></div>
              <DataTable
                columns={[
                  { key: 'Year', label: 'Year' },
                  { key: 'YTDGross', label: 'YTD Gross', render: fmtCur },
                  { key: 'YTDOwnerSplit', label: 'YTD Owner Split', render: fmtCur },
                  { key: 'YTDAvgDailyRate', label: 'Avg Daily Rate', render: fmtCur },
                  { key: 'YTDReserveAdjustments', label: 'Reserve Adj', render: fmtCur },
                  { key: 'YTDAdjustments', label: 'Adjustments', render: fmtNeg },
                  { key: 'YTDOwnerPayout', label: 'YTD Payout', render: fmtCur }
                ]}
                rows={stats.RevenueYTD ?? []}
              />
            </div>
          )}
          {!stats.NightsByRoom && !stats.ExpenseYTD && !stats.RevenueYTD && (
            <div className="card p-8 text-center text-gray-400">No statistics available for this statement.</div>
          )}
        </div>
      )}

      {adjModal && (
        <Modal title={adjModal === 'create' ? 'New Adjustment' : 'Edit Adjustment'} onClose={() => setAdjModal(null)}>
          <div className="space-y-3">
            {[
              ['AdjustmentType', 'Adjustment Type'],
              ['AdjustmentName', 'Adjustment Name'],
              ['AdjustmentDate', 'Adjustment Date', 'date'],
              ['AdjustmentAmount', 'Amount (use negative for deductions)', 'number'],
              ['AdjustmentNote', 'Note (PMS data)']
            ].map(([key, label, type = 'text']) => (
              <div key={key}>
                <label className="label">{label}</label>
                {key === 'AdjustmentNote' ? (
                  <textarea
                    className="input font-mono text-xs"
                    rows={4}
                    value={adjForm[key] ?? ''}
                    onChange={(e) => setAdjForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                ) : (
                  <input
                    type={type}
                    className="input"
                    value={adjForm[key] ?? ''}
                    onChange={(e) => setAdjForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setAdjModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveAdj}>Save</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
