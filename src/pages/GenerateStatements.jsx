import { useState } from 'react'
import { api } from '../api'

const today = () => new Date().toISOString().split('T')[0]

export default function GenerateStatements() {
  const [form, setForm] = useState({ StatementDate: today(), ActivityStartDate: '', ActivityEndDate: '' })
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function generate() {
    if (!form.ActivityStartDate || !form.ActivityEndDate) {
      alert('Activity start and end dates are required.')
      return
    }
    if (form.ActivityStartDate > form.ActivityEndDate) {
      alert('Activity start date must be on or before the end date.')
      return
    }
    if (!confirm('Generate statements for all lots with revenue in this date range?')) return
    setRunning(true); setError(null); setResult(null)
    try {
      setResult(await api.statements.generateAll(form))
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-800">Generate Statements</h1>

      <div className="card p-4">
        <p className="text-sm text-gray-500 mb-3">
          Generates an owner statement for every lot that has revenue within the activity date range.
          Lots that already have a statement for the exact same period are skipped.
        </p>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">Statement Date</label>
            <input type="date" className="input" value={form.StatementDate} onChange={set('StatementDate')} />
          </div>
          <div>
            <label className="label">Activity Start Date *</label>
            <input type="date" className="input" value={form.ActivityStartDate} onChange={set('ActivityStartDate')} />
          </div>
          <div>
            <label className="label">Activity End Date *</label>
            <input type="date" className="input" value={form.ActivityEndDate} onChange={set('ActivityEndDate')} />
          </div>
          <button className="btn-primary" onClick={generate} disabled={running}>
            {running ? 'Generating…' : 'Generate for All Lots'}
          </button>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 text-red-700 rounded text-sm"><strong>Error:</strong> {error}</div>}

      {result && (
        <div className="card p-4 text-sm">
          <h2 className="font-semibold text-gray-700 mb-2">Results</h2>
          <ul className="space-y-1 text-gray-700">
            <li><strong>{result.created}</strong> statement(s) created</li>
            <li><strong>{result.skippedExisting}</strong> skipped (already had a statement for this period)</li>
            <li><strong>{result.skippedEmpty}</strong> skipped (no revenue in this period)</li>
            <li className="text-gray-500">{result.totalLots} lots evaluated</li>
          </ul>
        </div>
      )}
    </div>
  )
}
