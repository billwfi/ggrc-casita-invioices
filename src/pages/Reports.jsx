import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api'
import DataTable from '../components/DataTable'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—'
const fmtCur = (v) => v != null ? `$${Number(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` : '—'

const REPORT_CONFIGS = {
  'invoice-details': {
    title: 'Lot Invoice Details by Activity Dates',
    columns: [
      { key: 'LotNumber', label: 'Lot #' },
      { key: 'AccountNo', label: 'Account' },
      { key: 'ConfirmationNumber', label: 'Conf #' },
      { key: 'StayDate', label: 'Stay Date', render: fmtDate },
      { key: 'ArrivalDate', label: 'Arrival', render: fmtDate },
      { key: 'DepartureDate', label: 'Departure', render: fmtDate },
      { key: 'Nights', label: 'Nights' },
      { key: 'RoomType', label: 'Room Type' },
      { key: 'TransCode', label: 'Trans Code' },
      { key: 'RoomRevenue', label: 'Revenue', render: fmtCur },
      { key: 'OwnerSplit', label: 'Owner Split', render: fmtCur }
    ]
  },
  'trans-code-1032': {
    title: 'Trans Code 1032 Adjustments',
    columns: [
      { key: 'LotNumber', label: 'Lot #' },
      { key: 'AccountNo', label: 'Account' },
      { key: 'AdjustmentDate', label: 'Date', render: fmtDate },
      { key: 'RoomNumber', label: 'Room' },
      { key: 'RoomType', label: 'Room Type' },
      { key: 'AdjustmentAmount', label: 'Amount', render: fmtCur },
      { key: 'ConfirmationNumber', label: 'Conf #' },
      { key: 'AdjustmentNote', label: 'Note' }
    ]
  },
  'audit-data': {
    title: 'Lot Invoice Audit Data — By Stay Date',
    columns: [
      { key: 'LotNumber', label: 'Lot #' },
      { key: 'AccountNo', label: 'Account' },
      { key: 'StatementNumber', label: 'Statement #' },
      { key: 'StayDate', label: 'Stay Date', render: fmtDate },
      { key: 'RoomNumber', label: 'Room' },
      { key: 'RoomType', label: 'Type' },
      { key: 'ConfirmationNumber', label: 'Conf #' },
      { key: 'TransCode', label: 'Trans Code' },
      { key: 'RoomRevenue', label: 'Revenue', render: fmtCur },
      { key: 'ReservationStatus', label: 'Status' }
    ]
  },
  'general-revenue': {
    title: 'General Revenue — By Stay Date',
    // Reads imported revenue directly from casita_generalrevenue, so it shows
    // data even before any invoices/statements have been created.
    filterParam: 'roomNumber',
    filterLabel: 'Room # (optional)',
    totalKey: 'RoomRevenue',
    columns: [
      { key: 'RoomNumber', label: 'Room' },
      { key: 'ConfirmationNumber', label: 'Conf #' },
      { key: 'StayDate', label: 'Stay Date', render: fmtDate },
      { key: 'ArrivalDate', label: 'Arrival', render: fmtDate },
      { key: 'DepartureDate', label: 'Departure', render: fmtDate },
      { key: 'Nights', label: 'Nights' },
      { key: 'RoomType', label: 'Room Type' },
      { key: 'RateCode', label: 'Rate Code' },
      { key: 'TransCode', label: 'Trans Code' },
      { key: 'MarketGroupCode', label: 'Mkt Grp' },
      { key: 'ReservationStatus', label: 'Status' },
      { key: 'Rate', label: 'Rate', render: fmtCur },
      { key: 'RoomRevenue', label: 'Revenue', render: fmtCur }
    ]
  }
}

export default function Reports() {
  const { type } = useParams()
  const config = REPORT_CONFIGS[type] ?? REPORT_CONFIGS['invoice-details']
  const filterParam = config.filterParam ?? 'lotNumber'
  const filterLabel = config.filterLabel ?? 'Lot # (optional)'

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [ran, setRan] = useState(false)

  async function run() {
    if (!startDate || !endDate) {
      alert('Please select a start and end date.')
      return
    }
    setLoading(true)
    setError(null)
    setRan(false)
    try {
      const params = { startDate, endDate }
      if (filterValue) params[filterParam] = filterValue
      const res = await api.reports.run(type, params)
      setRows(Array.isArray(res) ? res : (res?.data ?? []))
      setRan(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-800">{config.title}</h1>

      <div className="card p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">Activity Start Date *</label>
            <input type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Activity End Date *</label>
            <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <label className="label">{filterLabel}</label>
            <input type="text" className="input w-24" value={filterValue} onChange={(e) => setFilterValue(e.target.value)} placeholder="All" />
          </div>
          <button className="btn-primary" onClick={run} disabled={loading}>
            {loading ? 'Running...' : 'Run Report'}
          </button>
          {ran && rows.length > 0 && (
            <button
              className="btn-secondary"
              onClick={() => {
                const csv = [config.columns.map(c => c.label).join(','),
                  ...rows.map(r => config.columns.map(c => JSON.stringify(r[c.key] ?? '')).join(','))
                ].join('\n')
                const a = document.createElement('a')
                a.href = 'data:text/csv,' + encodeURIComponent(csv)
                a.download = `${type}-${startDate}-${endDate}.csv`
                a.click()
              }}
            >
              Export CSV
            </button>
          )}
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

      {ran && (
        <div className="card overflow-hidden">
          <div className="p-3 border-b border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-600">{rows.length} records</span>
            {config.totalKey && (
              <span className="text-sm font-semibold text-gray-700">
                Total {config.columns.find(c => c.key === config.totalKey)?.label ?? 'Revenue'}:{' '}
                {fmtCur(rows.reduce((a, r) => a + (Number(r[config.totalKey]) || 0), 0))}
              </span>
            )}
          </div>
          <DataTable columns={config.columns} rows={rows} emptyMessage="No records for selected date range." />
        </div>
      )}

      {!ran && !loading && (
        <div className="card p-12 text-center text-gray-400">
          Select a date range and click Run Report.
        </div>
      )}
    </div>
  )
}
