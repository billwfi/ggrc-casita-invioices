import { useState, useRef } from 'react'
import { api } from '../api'

const CSV_HEADERS = [
  'Room', 'Confirmation Number', 'Arrival Date', 'Departure Date', 'Number of Nights',
  'Room Type', 'Reservation Status', 'Rate Code', 'Stay Date', 'Rate',
  'Transaction Code', 'Market Group Code', 'Market Group Description', 'Room Revenue'
]

const DB_KEYS = [
  'Room', 'ConfirmationNumber', 'ArrivalDate', 'DepartureDate', 'NumberOfNights',
  'RoomType', 'ReservationStatus', 'RateCode', 'StayDate', 'Rate',
  'TransactionCode', 'MarketGroupCode', 'MarketGroupDescription', 'RoomRevenue'
]

function parseCSV(text) {
  // strip BOM
  const clean = text.replace(/^﻿/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) throw new Error('File must have a header row and at least one data row.')

  const headers = splitCSVLine(lines[0])

  // validate expected headers
  for (const h of CSV_HEADERS) {
    if (!headers.includes(h)) throw new Error(`Missing expected column: "${h}"`)
  }

  const colIndex = {}
  CSV_HEADERS.forEach((h, i) => { colIndex[i] = headers.indexOf(h) })

  return lines.slice(1).map((line, rowIdx) => {
    const cols = splitCSVLine(line)
    const obj = {}
    DB_KEYS.forEach((key, i) => {
      obj[key] = cols[colIndex[i]]?.trim() ?? ''
    })
    return obj
  })
}

function splitCSVLine(line) {
  const result = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      result.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur)
  return result
}

const PREVIEW_COLS = ['Room', 'ConfirmationNumber', 'StayDate', 'RoomType', 'ReservationStatus', 'Rate', 'RoomRevenue']
const PREVIEW_LABELS = ['Room', 'Confirmation #', 'Stay Date', 'Room Type', 'Status', 'Rate', 'Revenue']

export default function ImportRevenue() {
  const [rows, setRows]           = useState(null)
  const [filename, setFilename]   = useState('')
  const [parseError, setParseError] = useState(null)
  const [clearFirst, setClearFirst] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult]       = useState(null)
  const [importError, setImportError] = useState(null)
  const fileRef = useRef()

  function handleFile(file) {
    if (!file) return
    setResult(null)
    setImportError(null)
    setParseError(null)
    setRows(null)
    setFilename(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = parseCSV(e.target.result)
        setRows(parsed)
      } catch (err) {
        setParseError(err.message)
      }
    }
    reader.readAsText(file, 'utf-8')
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  function handleChange(e) {
    handleFile(e.target.files?.[0])
  }

  function reset() {
    setRows(null)
    setFilename('')
    setParseError(null)
    setResult(null)
    setImportError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function doImport() {
    if (!rows?.length) return
    setImporting(true)
    setImportError(null)
    setResult(null)
    try {
      const res = await api.importRevenue(rows, clearFirst)
      setResult(res)
      setRows(null)
      setFilename('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (e) {
      setImportError(e.message)
    } finally {
      setImporting(false)
    }
  }

  const dateRange = rows?.length
    ? (() => {
        const dates = rows.map(r => r.StayDate).filter(Boolean).sort()
        return dates.length ? `${dates[0]} – ${dates[dates.length - 1]}` : null
      })()
    : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">Import General Revenue Data</h1>
      </div>

      <p className="text-sm text-gray-500">
        Upload a CSV export from the property management system to import room revenue data
        into <code className="bg-gray-100 px-1 rounded text-xs">casita_generalrevenue</code>.
        Expected columns: {CSV_HEADERS.join(', ')}.
      </p>

      {/* File drop zone */}
      {!rows && (
        <div
          className="card p-8 border-2 border-dashed border-gray-300 text-center cursor-pointer hover:border-blue-400 transition-colors"
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <div className="text-gray-400 text-sm mb-2">
            Drag &amp; drop a CSV file here, or click to browse
          </div>
          <div className="text-xs text-gray-300">Supported format: CSV with headers</div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleChange}
          />
        </div>
      )}

      {parseError && (
        <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{parseError}</div>
      )}

      {/* Preview */}
      {rows && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">
              <span className="font-medium">{filename}</span>
              {' — '}
              <span className="text-blue-700 font-semibold">{rows.length.toLocaleString()} rows</span>
              {dateRange && <span className="text-gray-500 ml-2">(stay dates: {dateRange})</span>}
            </div>
            <button className="btn-secondary btn-sm" onClick={reset}>Remove</button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {PREVIEW_LABELS.map(l => (
                      <th key={l} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">{l}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((row, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      {PREVIEW_COLS.map(col => (
                        <td key={col} className="px-3 py-1.5 text-gray-700 whitespace-nowrap">{row[col] || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 10 && (
              <div className="px-3 py-2 text-xs text-gray-400 bg-gray-50 border-t border-gray-100">
                Showing first 10 of {rows.length.toLocaleString()} rows
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={clearFirst}
                onChange={e => setClearFirst(e.target.checked)}
                className="rounded"
              />
              Delete existing records for this stay-date range before importing
            </label>
          </div>

          {clearFirst && dateRange && (
            <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
              Existing rows with StayDate between {dateRange} will be deleted before inserting {rows.length.toLocaleString()} new rows.
            </div>
          )}

          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={doImport}
              disabled={importing}
            >
              {importing ? 'Importing…' : `Import ${rows.length.toLocaleString()} Rows`}
            </button>
            <button className="btn-secondary" onClick={reset} disabled={importing}>Cancel</button>
          </div>
        </div>
      )}

      {importError && (
        <div className="p-3 bg-red-50 text-red-700 rounded text-sm">
          Import failed: {importError}
        </div>
      )}

      {result && (
        <div className="p-4 bg-green-50 border border-green-200 rounded text-sm text-green-800">
          <div className="font-semibold mb-1">Import complete</div>
          <div>{result.inserted.toLocaleString()} rows inserted{result.deleted > 0 ? `, ${result.deleted.toLocaleString()} existing rows removed` : ''}.</div>
        </div>
      )}
    </div>
  )
}
