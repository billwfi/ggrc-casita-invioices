import { useState } from 'react'
import { api } from '../api'

export default function GenerateStatements() {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate]     = useState('')
  const [running, setRunning]     = useState(false)
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState(null)

  async function generate() {
    if (!startDate || !endDate) {
      alert('Please select an activity start and end date.')
      return
    }
    if (endDate < startDate) {
      alert('End date must be on or after the start date.')
      return
    }
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await api.statements.generate({
        ActivityStartDate: startDate,
        ActivityEndDate: endDate
      })
      setResult(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-800">Generate Statements</h1>

      <p className="text-sm text-gray-500">
        Creates a statement for the selected activity period for <strong>every lot</strong>.
        Lots that already have a statement for this exact period are skipped, so it is safe
        to re-run. Statement dollar amounts are calculated from imported revenue when a
        statement is viewed.
      </p>

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
          <button className="btn-primary" onClick={generate} disabled={running}>
            {running ? 'Generating…' : 'Generate Statements'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded text-sm">
          Generation failed: {error}
        </div>
      )}

      {result && (
        <div className="p-4 bg-green-50 border border-green-200 rounded text-sm text-green-800">
          <div className="font-semibold mb-1">Statements generated</div>
          <div>
            {result.created.toLocaleString()} created
            {result.skipped > 0 && `, ${result.skipped.toLocaleString()} skipped (already existed)`}
            {' '}of {result.totalLots.toLocaleString()} lots.
          </div>
        </div>
      )}
    </div>
  )
}
