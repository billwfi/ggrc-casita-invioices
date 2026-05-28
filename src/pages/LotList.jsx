import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'

const COLS = [
  { key: 'LotNumber', label: 'Lot #' },
  { key: 'AccountNo', label: 'Account No' },
  { key: 'LotAddress', label: 'Lot Address' },
  { key: 'LotCity', label: 'City' },
  { key: 'LotState', label: 'State' },
  { key: 'LotZip', label: 'Zip' }
]

const EMPTY = { LotNumber: '', AccountNo: '', LotAddress: '', LotCity: '', LotState: '', LotZip: '' }

export default function LotList() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const pageSize = 50

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.lots.list({ search, page, pageSize })
      setRows(res.data ?? [])
      setTotal(res.total ?? 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [search, page])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setForm(EMPTY)
    setModal('create')
  }

  function openEdit(row) {
    setForm({ ...row })
    setModal('edit')
  }

  async function save() {
    setSaving(true)
    try {
      if (modal === 'create') {
        await api.lots.create(form)
      } else {
        await api.lots.update(form.LotID, form)
      }
      setModal(null)
      load()
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(row) {
    if (!confirm(`Delete Lot #${row.LotNumber}?`)) return
    try {
      await api.lots.delete(row.LotID)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">Lot Information</h1>
        <button className="btn-primary" onClick={openCreate}>+ New Lot</button>
      </div>

      <div className="flex gap-2">
        <input
          className="input max-w-xs"
          placeholder="Search lots..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        <button className="btn-secondary" onClick={load}>Refresh</button>
      </div>

      <div className="card overflow-hidden">
        {loading && (
          <div className="p-8 text-center text-gray-400">Loading lots...</div>
        )}
        {error && (
          <div className="p-4 bg-red-50 text-red-700 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}
        {!loading && !error && (
          <DataTable
            columns={COLS}
            rows={rows}
            onRowClick={(row) => navigate(`/lots/${row.LotID}`)}
            actions={(row) => (
              <>
                <button className="btn-secondary btn-sm" onClick={() => openEdit(row)}>Edit</button>
                <button className="btn-danger btn-sm" onClick={() => handleDelete(row)}>Del</button>
              </>
            )}
          />
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{total} total lots</span>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span className="px-2 py-1">Page {page}</span>
          <button className="btn-secondary btn-sm" disabled={page * pageSize >= total} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'create' ? 'New Lot' : `Edit Lot #${form.LotNumber}`} onClose={() => setModal(null)}>
          <div className="space-y-3">
            {[
              ['LotNumber', 'Lot #', 'number'],
              ['AccountNo', 'Account No', 'text'],
              ['LotAddress', 'Lot Address', 'text'],
              ['LotCity', 'City', 'text'],
              ['LotState', 'State', 'text'],
              ['LotZip', 'Zip', 'text']
            ].map(([key, label, type]) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input
                  type={type}
                  className="input"
                  value={form[key] ?? ''}
                  onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
