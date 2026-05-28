/**
 * Statements — reads statement header + all sub-panels in one call.
 * Adjust table/column names to match your schema.
 */
import { getPool, sql, ok, err, preflight } from './db.js'

const TABLE = 'LotOwnerInvoices'         // ← update if needed
const DETAILS_TABLE = 'LotInvoiceDetails' // ← update if needed
const FEES_TABLE = 'StatementFees'        // ← update if needed
const EXPENSES_TABLE = 'StatementExpenses'// ← update if needed
const PK = 'StatementID'

export const config = {
  path: ['/api/statements', '/api/statements/:id']
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') return preflight()

  const { id } = context.params ?? {}
  const url = new URL(request.url)

  try {
    const pool = await getPool()

    if (request.method === 'GET') {
      const lotId = url.searchParams.get('lotId')

      if (id) {
        // Return statement with all sub-panels
        const [stmt, details, fees, expenses] = await Promise.all([
          pool.request().input('id', sql.Int, parseInt(id))
            .query(`SELECT * FROM ${TABLE} WHERE ${PK} = @id`),
          pool.request().input('id', sql.Int, parseInt(id))
            .query(`SELECT * FROM ${DETAILS_TABLE} WHERE ${PK} = @id ORDER BY StayDate, RoomNumber`).catch(() => ({ recordset: [] })),
          pool.request().input('id', sql.Int, parseInt(id))
            .query(`SELECT * FROM ${FEES_TABLE} WHERE ${PK} = @id`).catch(() => ({ recordset: [] })),
          pool.request().input('id', sql.Int, parseInt(id))
            .query(`SELECT * FROM ${EXPENSES_TABLE} WHERE ${PK} = @id`).catch(() => ({ recordset: [] }))
        ])

        if (!stmt.recordset.length) return err('Not found', 404)

        const s = stmt.recordset[0]

        // Build summary from detail rows if not stored separately
        const detailRows = details.recordset
        const sumRevenue = detailRows.reduce((a, r) => a + (Number(r.RoomRevenue) || 0), 0)
        const sumOwnerSplit = detailRows.reduce((a, r) => a + (Number(r.OwnerSplit) || 0), 0)
        const sumResFee = detailRows.reduce((a, r) => a + (Number(r.ReservationFee) || 0), 0)
        const sumCCFee = detailRows.reduce((a, r) => a + (Number(r.CreditCardFee) || 0), 0)
        const sumCable = detailRows.reduce((a, r) => a + (Number(r.CableInternetFee) || 0), 0)
        const sumCleaning = detailRows.reduce((a, r) => a + (Number(r.CleaningFee) || 0), 0)

        return ok({
          ...s,
          Summary: {
            GrossRevenue: s.GrossRevenue ?? sumRevenue,
            OwnerSplit: s.OwnerSplit ?? sumOwnerSplit,
            ReservationFee: s.ReservationFee ?? -sumResFee,
            CreditCardFee: s.CreditCardFee ?? -sumCCFee,
            CableInternetFee: s.CableInternetFee ?? -sumCable,
            MaintenanceCleaningFee: s.MaintenanceCleaningFee ?? -sumCleaning,
            ReserveAmount: s.ReserveAmount ?? null,
            TotalAdjustments: s.TotalAdjustments ?? null,
            TotalReserveAdjustments: s.TotalReserveAdjustments ?? null,
            ReserveBalance: s.ReserveBalance ?? null,
            OwnerPayout: s.OwnerPayout ?? null
          },
          Details: detailRows,
          Fees: fees.recordset,
          Expenses: expenses.recordset
        })
      }

      if (lotId) {
        const r = await pool.request()
          .input('lotId', sql.Int, parseInt(lotId))
          .query(`SELECT * FROM ${TABLE} WHERE LotID = @lotId ORDER BY ActivityStartDate DESC`)
        return ok(r.recordset)
      }

      const r = await pool.request()
        .query(`SELECT TOP 200 * FROM ${TABLE} ORDER BY ActivityStartDate DESC`)
      return ok({ data: r.recordset, total: r.recordset.length })
    }

    if (request.method === 'POST') {
      const b = await request.json()
      const r = await pool.request()
        .input('LotID', sql.Int, b.LotID ? parseInt(b.LotID) : null)
        .input('StatementNumber', sql.NVarChar(50), b.StatementNumber ?? null)
        .input('StatementDate', sql.Date, b.StatementDate ? new Date(b.StatementDate) : new Date())
        .input('ActivityStartDate', sql.Date, b.ActivityStartDate ? new Date(b.ActivityStartDate) : null)
        .input('ActivityEndDate', sql.Date, b.ActivityEndDate ? new Date(b.ActivityEndDate) : null)
        .input('StatementNote', sql.NVarChar(sql.MAX), b.StatementNote ?? null)
        .query(`INSERT INTO ${TABLE} (LotID, StatementNumber, StatementDate, ActivityStartDate, ActivityEndDate, StatementNote)
                OUTPUT INSERTED.*
                VALUES (@LotID, @StatementNumber, @StatementDate, @ActivityStartDate, @ActivityEndDate, @StatementNote)`)
      return ok(r.recordset[0], 201)
    }

    return err('Method not allowed', 405)
  } catch (e) {
    console.error('statements:', e.message)
    return err(e.message)
  }
}
