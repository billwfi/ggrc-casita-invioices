import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import DataTable from '../components/DataTable'

const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—')

const COLS = [
  { key: 'OwnerName', label: 'Owner Name' },
  { key: 'LotNumber', label: 'Lot #' },
  { key: 'AccountNo', label: 'Account No' },
  { key: 'DateOfPurchase', label: 'Date of Purchase', render: fmtDate },
  { key: 'OwnerMainPhone', label: 'Phone' },
  { key: 'OwnerMainEmail', label: 'Email' }
]

export default function OwnerList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.owners.list()
      setRows(res.data ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const term = search.trim().toLowerCase()
  const filtered = term
    ? rows.filter(r =>
        (r.OwnerName || '').toLowerCase().includes(term) ||
        String(r.LotNumber ?? '').includes(term) ||
        (r.AccountNo || '').toLowerCase().includes(term))
    : rows

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">Owner Information</h1>
      </div>

      <div className="flex gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search owners..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn-secondary" onClick={load}>Refresh</button>
      </div>

      <div className="card overflow-hidden">
        {loading && <div className="p-8 text-center text-gray-400">Loading owners...</div>}
        {error && (
          <div className="p-4 bg-red-50 text-red-700 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}
        {!loading && !error && (
          <DataTable
            columns={COLS}
            rows={filtered}
            onRowClick={(row) => navigate(`/lots/${row.LotID}/owners/${row.OwnerID}`)}
          />
        )}
      </div>

      <div className="text-sm text-gray-500">{filtered.length} owners</div>
    </div>
  )
}
