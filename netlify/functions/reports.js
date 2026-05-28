/**
 * Reports — three report types driven by ?type= query param.
 * Adjust table/column names to match your schema.
 */
import { getPool, sql, ok, err, preflight } from './db.js'

// ← update these table names to match your schema
const DETAILS_TABLE = 'LotInvoiceDetails'
const ADJUSTMENTS_TABLE = 'LotManualExpenses'
const STATEMENTS_TABLE = 'LotOwnerInvoices'
const LOTS_TABLE = 'Lots'

export const config = { path: '/api/reports' }

export default async (request) => {
  if (request.method === 'OPTIONS') return preflight()

  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  const startDate = url.searchParams.get('startDate')
  const endDate = url.searchParams.get('endDate')
  const lotNumber = url.searchParams.get('lotNumber')

  if (!startDate || !endDate) return err('startDate and endDate are required', 400)

  try {
    const pool = await getPool()
    const lotFilter = lotNumber ? 'AND l.LotNumber = @lotNumber' : ''

    if (type === 'invoice-details') {
      const req = pool.request()
        .input('start', sql.Date, new Date(startDate))
        .input('end', sql.Date, new Date(endDate))
      if (lotNumber) req.input('lotNumber', sql.Int, parseInt(lotNumber))

      const r = await req.query(`
        SELECT l.LotNumber, l.AccountNo, d.*
        FROM ${DETAILS_TABLE} d
        JOIN ${STATEMENTS_TABLE} s ON s.StatementID = d.StatementID
        JOIN ${LOTS_TABLE} l ON l.LotID = s.LotID
        WHERE d.StayDate BETWEEN @start AND @end ${lotFilter}
        ORDER BY l.LotNumber, d.StayDate`)
      return ok(r.recordset)
    }

    if (type === 'trans-code-1032') {
      const req = pool.request()
        .input('start', sql.Date, new Date(startDate))
        .input('end', sql.Date, new Date(endDate))
      if (lotNumber) req.input('lotNumber', sql.Int, parseInt(lotNumber))

      const r = await req.query(`
        SELECT l.LotNumber, l.AccountNo, a.*
        FROM ${ADJUSTMENTS_TABLE} a
        JOIN ${STATEMENTS_TABLE} s ON s.StatementID = a.StatementID
        JOIN ${LOTS_TABLE} l ON l.LotID = s.LotID
        WHERE a.AdjustmentDate BETWEEN @start AND @end
          AND (a.AdjustmentNote LIKE '%1032%' OR a.TransCode = '1032') ${lotFilter}
        ORDER BY l.LotNumber, a.AdjustmentDate`)
      return ok(r.recordset)
    }

    if (type === 'audit-data') {
      const req = pool.request()
        .input('start', sql.Date, new Date(startDate))
        .input('end', sql.Date, new Date(endDate))
      if (lotNumber) req.input('lotNumber', sql.Int, parseInt(lotNumber))

      const r = await req.query(`
        SELECT l.LotNumber, l.AccountNo, s.StatementNumber, d.*
        FROM ${DETAILS_TABLE} d
        JOIN ${STATEMENTS_TABLE} s ON s.StatementID = d.StatementID
        JOIN ${LOTS_TABLE} l ON l.LotID = s.LotID
        WHERE d.StayDate BETWEEN @start AND @end ${lotFilter}
        ORDER BY l.LotNumber, d.StayDate, d.RoomNumber`)
      return ok(r.recordset)
    }

    return err(`Unknown report type: ${type}`, 400)
  } catch (e) {
    console.error('reports:', e.message)
    return err(e.message)
  }
}
