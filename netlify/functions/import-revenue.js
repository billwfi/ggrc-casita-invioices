import { getPool, sql, ok, err, preflight } from './db.js'

// No custom path — function is served at /.netlify/functions/import-revenue
// which matches the BASE prefix used in api.js

export default async (request) => {
  if (request.method === 'OPTIONS') return preflight()
  if (request.method !== 'POST') return err('Method not allowed', 405)

  try {
    const body = await request.json()
    const { rows, clearFirst } = body

    if (!Array.isArray(rows) || rows.length === 0) {
      return err('No rows to import', 400)
    }

    const pool = await getPool()

    let deleted = 0
    if (clearFirst) {
      const dates = rows.map(r => r.StayDate).filter(Boolean).sort()
      if (dates.length) {
        const r = await pool.request()
          .input('start', sql.Date, dates[0])
          .input('end',   sql.Date, dates[dates.length - 1])
          .query('DELETE FROM casita_generalrevenue WHERE StayDate >= @start AND StayDate <= @end')
        deleted = r.rowsAffected[0] ?? 0
      }
    }

    // Build a Table object for bulk insert — orders of magnitude faster than
    // individual INSERTs and comfortably within Netlify's 26-second timeout
    const table = new sql.Table('casita_generalrevenue')
    table.create = false
    table.columns.add('Room',                  sql.VarChar(20),    { nullable: true })
    table.columns.add('ConfirmationNumber',     sql.VarChar(50),    { nullable: true })
    table.columns.add('ArrivalDate',            sql.Date,           { nullable: true })
    table.columns.add('DepartureDate',          sql.Date,           { nullable: true })
    table.columns.add('NumberOfNights',         sql.Int,            { nullable: true })
    table.columns.add('RoomType',               sql.VarChar(20),    { nullable: true })
    table.columns.add('ReservationStatus',      sql.VarChar(50),    { nullable: true })
    table.columns.add('RateCode',               sql.VarChar(50),    { nullable: true })
    table.columns.add('StayDate',               sql.Date,           { nullable: true })
    table.columns.add('Rate',                   sql.Decimal(10, 2), { nullable: true })
    table.columns.add('TransactionCode',        sql.VarChar(50),    { nullable: true })
    table.columns.add('MarketGroupCode',        sql.VarChar(20),    { nullable: true })
    table.columns.add('MarketGroupDescription', sql.VarChar(100),   { nullable: true })
    table.columns.add('RoomRevenue',            sql.Decimal(10, 2), { nullable: true })

    for (const row of rows) {
      table.rows.add(
        row.Room                   || null,
        row.ConfirmationNumber     || null,
        row.ArrivalDate            || null,
        row.DepartureDate          || null,
        row.NumberOfNights !== ''  ? parseInt(row.NumberOfNights,  10) : null,
        row.RoomType               || null,
        row.ReservationStatus      || null,
        row.RateCode               || null,
        row.StayDate               || null,
        row.Rate         !== ''    ? parseFloat(row.Rate)              : null,
        row.TransactionCode        || null,
        row.MarketGroupCode        || null,
        row.MarketGroupDescription || null,
        row.RoomRevenue  !== ''    ? parseFloat(row.RoomRevenue)       : null
      )
    }

    const result = await pool.request().bulk(table)
    const inserted = result.rowsAffected ?? rows.length

    return ok({ inserted, deleted })
  } catch (e) {
    console.error('import-revenue:', e.message)
    return err(e.message)
  }
}
