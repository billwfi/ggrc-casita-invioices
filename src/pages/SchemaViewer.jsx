import { useState, useEffect } from 'react'
import { api } from '../api'

export default function SchemaViewer() {
  const [tables, setTables] = useState([])
  const [selected, setSelected] = useState(null)
  const [columns, setColumns] = useState([])
  const [loading, setLoading] = useState(true)
  const [colLoading, setColLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await api.schema.tables()
        setTables(Array.isArray(res) ? res : [])
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function loadColumns(tableName) {
    setSelected(tableName)
    setColLoading(true)
    try {
      const res = await api.schema.columns(tableName)
      setColumns(Array.isArray(res) ? res : [])
    } catch (e) {
      setColumns([])
    } finally {
      setColLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-gray-800">Database Schema Browser</h1>
      <p className="text-sm text-gray-500">
        Browse the GGRC database schema to identify table and column names for configuring queries.
      </p>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded text-sm">
          <strong>Connection error:</strong> {error}
          <p className="mt-1 text-xs">Check that DB_SERVER, DB_USER, DB_PASSWORD, and DB_DATABASE are set in Netlify environment variables.</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="card overflow-hidden col-span-1">
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Tables ({tables.length})
            </span>
          </div>
          {loading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading tables...</div>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-y-auto max-h-[60vh]">
              {tables.map((t) => (
                <li key={`${t.TABLE_SCHEMA}.${t.TABLE_NAME}`}>
                  <button
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${
                      selected === t.TABLE_NAME ? 'bg-blue-50 text-navy-700 font-medium' : 'text-gray-700'
                    }`}
                    onClick={() => loadColumns(t.TABLE_NAME)}
                  >
                    <span className="text-gray-400 text-xs mr-1">{t.TABLE_SCHEMA}.</span>
                    {t.TABLE_NAME}
                    <span className="ml-1 text-xs text-gray-400">({t.TABLE_TYPE})</span>
                  </button>
                </li>
              ))}
              {tables.length === 0 && !loading && (
                <li className="p-4 text-center text-gray-400 text-sm">No tables found.</li>
              )}
            </ul>
          )}
        </div>

        <div className="card overflow-hidden col-span-2">
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
              {selected ? `Columns: ${selected}` : 'Select a table'}
            </span>
          </div>
          {colLoading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading columns...</div>
          ) : selected && columns.length > 0 ? (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="table-header">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Column Name</th>
                  <th className="px-3 py-2">Data Type</th>
                  <th className="px-3 py-2">Max Length</th>
                  <th className="px-3 py-2">Nullable</th>
                </tr>
              </thead>
              <tbody>
                {columns.map((col, i) => (
                  <tr key={col.COLUMN_NAME} className="table-row">
                    <td className="table-cell text-gray-400">{i + 1}</td>
                    <td className="table-cell font-mono font-medium">{col.COLUMN_NAME}</td>
                    <td className="table-cell text-blue-700">{col.DATA_TYPE}</td>
                    <td className="table-cell text-gray-500">{col.CHARACTER_MAXIMUM_LENGTH ?? '—'}</td>
                    <td className="table-cell">{col.IS_NULLABLE === 'YES' ? 'YES' : <span className="text-red-600">NO</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-gray-400 text-sm">
              {selected ? 'No columns found.' : 'Click a table to view its columns.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
