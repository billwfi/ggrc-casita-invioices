/**
 * Adjustments (Lot Manual Expense Tracking) CRUD.
 * Adjust TABLE, PK, and column names to match your schema.
 */
import { getPool, sql, ok, err, preflight } from './db.js'

const TABLE = 'LotManualExpenses'   // ← update if needed
const PK = 'AdjustmentID'

export const config = {
  path: ['/api/adjustments', '/api/adjustments/:id']
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') return preflight()

  const { id } = context.params ?? {}
  const url = new URL(request.url)

  try {
    const pool = await getPool()

    if (request.method === 'GET') {
      const statementId = url.searchParams.get('statementId')

      if (id) {
        const r = await pool.request()
          .input('id', sql.Int, parseInt(id))
          .query(`SELECT * FROM ${TABLE} WHERE ${PK} = @id`)
        if (!r.recordset.length) return err('Not found', 404)
        return ok(r.recordset[0])
      }

      if (statementId) {
        const r = await pool.request()
          .input('statementId', sql.Int, parseInt(statementId))
          .query(`SELECT * FROM ${TABLE} WHERE StatementID = @statementId ORDER BY AdjustmentDate`)
        return ok(r.recordset)
      }

      return err('statementId required', 400)
    }

    if (request.method === 'POST') {
      const b = await request.json()
      const r = await pool.request()
        .input('StatementID', sql.Int, b.StatementID ? parseInt(b.StatementID) : null)
        .input('AdjustmentType', sql.NVarChar(100), b.AdjustmentType ?? null)
        .input('AdjustmentName', sql.NVarChar(200), b.AdjustmentName ?? null)
        .input('AdjustmentDate', sql.Date, b.AdjustmentDate ? new Date(b.AdjustmentDate) : null)
        .input('AdjustmentAmount', sql.Decimal(10, 2), b.AdjustmentAmount != null ? parseFloat(b.AdjustmentAmount) : null)
        .input('AdjustmentNote', sql.NVarChar(sql.MAX), b.AdjustmentNote ?? null)
        .query(`INSERT INTO ${TABLE} (StatementID, AdjustmentType, AdjustmentName, AdjustmentDate, AdjustmentAmount, AdjustmentNote)
                OUTPUT INSERTED.*
                VALUES (@StatementID, @AdjustmentType, @AdjustmentName, @AdjustmentDate, @AdjustmentAmount, @AdjustmentNote)`)
      return ok(r.recordset[0], 201)
    }

    if (request.method === 'PUT' && id) {
      const b = await request.json()
      await pool.request()
        .input('id', sql.Int, parseInt(id))
        .input('AdjustmentType', sql.NVarChar(100), b.AdjustmentType ?? null)
        .input('AdjustmentName', sql.NVarChar(200), b.AdjustmentName ?? null)
        .input('AdjustmentDate', sql.Date, b.AdjustmentDate ? new Date(b.AdjustmentDate) : null)
        .input('AdjustmentAmount', sql.Decimal(10, 2), b.AdjustmentAmount != null ? parseFloat(b.AdjustmentAmount) : null)
        .input('AdjustmentNote', sql.NVarChar(sql.MAX), b.AdjustmentNote ?? null)
        .query(`UPDATE ${TABLE} SET AdjustmentType=@AdjustmentType, AdjustmentName=@AdjustmentName,
                AdjustmentDate=@AdjustmentDate, AdjustmentAmount=@AdjustmentAmount, AdjustmentNote=@AdjustmentNote
                WHERE ${PK}=@id`)
      return ok({ success: true })
    }

    if (request.method === 'DELETE' && id) {
      await pool.request()
        .input('id', sql.Int, parseInt(id))
        .query(`DELETE FROM ${TABLE} WHERE ${PK} = @id`)
      return ok({ success: true })
    }

    return err('Method not allowed', 405)
  } catch (e) {
    console.error('adjustments:', e.message)
    return err(e.message)
  }
}
