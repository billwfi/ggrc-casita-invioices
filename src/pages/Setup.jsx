import { useState, useEffect } from 'react'
import { api } from '../api'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'

export default function Setup() {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.setup.expenseTypes.list()
      setTypes(Array.isArray(res) ? res : (res?.data ?? []))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function save() {
    try {
      if (form.ExpenseTypeID) {
        await api.setup.expenseTypes.update(form.ExpenseTypeID, form)
      } else {
        await api.setup.expenseTypes.create(form)
      }
      setModal(null)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  async function del(row) {
    if (!confirm(`Delete expense type "${row.CategoryName}"?`)) return
    try {
      await api.setup.expenseTypes.delete(row.ExpenseTypeID)
      load()
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">Owner Expense Type Management</h1>
        <button className="btn-primary" onClick={() => { setForm({}); setModal('create') }}>+ Add Type</button>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : (
          <DataTable
            columns={[
              { key: 'CategoryName', label: 'Category Name' },
              { key: 'ExpenseDescription', label: 'Description' },
              { key: 'IsActive', label: 'Active', render: (v) => v ? '✓' : '—' }
            ]}
            rows={types}
            actions={(row) => (
              <>
                <button className="btn-secondary btn-sm" onClick={() => { setForm({ ...row }); setModal('edit') }}>Edit</button>
                <button className="btn-danger btn-sm" onClick={() => del(row)}>Del</button>
              </>
            )}
          />
        )}
      </div>

      {modal && (
        <Modal title={modal === 'create' ? 'New Expense Type' : 'Edit Expense Type'} onClose={() => setModal(null)}>
          <div className="space-y-3">
            <div>
              <label className="label">Category Name *</label>
              <input className="input" value={form.CategoryName ?? ''} onChange={(e) => setForm(f => ({ ...f, CategoryName: e.target.value }))} />
            </div>
            <div>
              <label className="label">Description</label>
              <input className="input" value={form.ExpenseDescription ?? ''} onChange={(e) => setForm(f => ({ ...f, ExpenseDescription: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={!!form.IsActive}
                onChange={(e) => setForm(f => ({ ...f, IsActive: e.target.checked }))}
              />
              <label htmlFor="isActive" className="text-sm text-gray-700">Active</label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={save}>Save</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
