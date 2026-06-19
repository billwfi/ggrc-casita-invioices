import { getPool, sql, ok, err, preflight } from './db.js'

export const config = { path: '/api/import-revenue' }

// Actual casita_generalrevenue column names and types (from INFORMATION_SCHEMA):
//   indx            int NOT NULL  ← identity PK, excluded from INSERT
//   roomnumber      varchar(50)
//   confirmationnumber varchar(50)
//   arrivaldate     date
//   departuredate   date
//   numberofnights  int
//   roomrevenue     varchar(25)   ← stored as varchar in DB
//   roomtype        varchar(50)
//   reservationstatus varchar(50)
//   accountnumber   int           ← not in CSV, left null
//   ratecode        varchar(100)
//   staydate        date
//   roomrevenueadjusted money     ← not in CSV, left null
//   daystoeom       int           ← not in CSV, left null
//   roomrate        money         ← not in CSV, left null
//   rate            money
//   transactioncode varchar(50)
//   marketgroupcode varchar(50)
//   marketgroupdescription varchar(100)

const INSERT_COLS = [
  'roomnumber', 'confirmationnumber', 'arrivaldate', 'departuredate',
  'numberofnights', 'roomtype', 'reservationstatus', 'ratecode',
  'staydate', 'rate', 'transactioncode', 'marketgroupcode',
  'marketgroupdescription', 'roomrevenue'
]

const COL_TYPES = [
  sql.VarChar(50),   // roomnumber
  sql.VarChar(50),   // confirmationnumber
  sql.Date,          // arrivaldate
  sql.Date,          // departuredate
  sql.Int,           // numberofnights
  sql.VarChar(50),   // roomtype
  sql.VarChar(50),   // reservationstatus
  sql.VarChar(100),  // ratecode
  sql.Date,          // staydate
  sql.Money,         // rate
  sql.VarChar(50),   // transactioncode
  sql.VarChar(50),   // marketgroupcode
  sql.VarChar(100),  // marketgroupdescription
  sql.VarChar(25),   // roomrevenue (varchar in DB)
]

function rowValues(row) {
  const n = (v) => (v !== '' && v != null ? v : null)
  return [
    n(row.Room),
    n(row.ConfirmationNumber),
    n(row.ArrivalDate),
    n(row.DepartureDate),
    row.NumberOfNights !== '' && row.NumberOfNights != null ? parseInt(row.NumberOfNights, 10) : null,
    n(row.RoomType),
    n(row.ReservationStatus),
    n(row.RateCode),
    n(row.StayDate),
    row.Rate !== '' && row.Rate != null ? parseFloat(row.Rate) : null,
    n(row.TransactionCode),
    n(row.MarketGroupCode),
    n(row.MarketGroupDescription),
    n(row.RoomRevenue),  // kept as string — DB column is varchar(25)
  ]
}

// 14 columns × 100 rows = 1400 params, well under SQL Server's 2100 limit
const BATCH_SIZE = 100

async function insertBatch(txn, batch) {
  const request = new sql.Request(txn)
  const valueClauses = batch.map((row, i) => {
    const vals = rowValues(row)
    const params = vals.map((v, c) => {
      const name = `r${i}c${c}`
      request.input(name, COL_TYPES[c], v)
      return `@${name}`
    })
    return `(${params.join(',')})`
  })
  await request.query(
    `INSERT INTO casita_generalrevenue (${INSERT_COLS.join(',')}) VALUES ${valueClauses.join(',')}`
  )
}

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
    const txn  = new sql.Transaction(pool)
    await txn.begin()

    try {
      let deleted = 0
      if (clearFirst) {
        const dates = rows.map(r => r.StayDate).filter(Boolean).sort()
        if (dates.length) {
          const r = await new sql.Request(txn)
            .input('start', sql.Date, dates[0])
            .input('end',   sql.Date, dates[dates.length - 1])
            .query('DELETE FROM casita_generalrevenue WHERE staydate >= @start AND staydate <= @end')
          deleted = r.rowsAffected[0] ?? 0
        }
      }

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        await insertBatch(txn, rows.slice(i, i + BATCH_SIZE))
      }

      await txn.commit()
      return ok({ inserted: rows.length, deleted })
    } catch (e) {
      await txn.rollback()
      throw e
    }
  } catch (e) {
    console.error('import-revenue:', e.message)
    return err(e.message)
  }
}
