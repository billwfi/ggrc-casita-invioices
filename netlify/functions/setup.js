/**
 * Setup — Owner Expense Type Management.
 * Adjust TABLE, PK, and column names to match your schema.
 */
import { getPool, sql, ok, err, preflight } from './db.js'

const TABLE = 'OwnerExpenseTypes'   // ← update if needed
const PK = 'ExpenseTypeID'

export const config = {
  path: ['/api/setup', '/api/setup/:id']
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') return preflight()

  const { id } = context.params ?? {}

  try {
    const pool = await getPool()

    if (request.method === 'GET') {
      const r = await pool.request()
        .query(`SELECT * FROM ${TABLE} ORDER BY CategoryName`)
      return ok(r.recordset)
    }

    if (request.method === 'POST') {
      const b = await request.json()
      const r = await pool.request()
        .input('CategoryName', sql.NVarChar(100), b.CategoryName ?? null)
        .input('ExpenseDescription', sql.NVarChar(500), b.ExpenseDescription ?? null)
        .input('IsActive', sql.Bit, b.IsActive ? 1 : 0)
        .query(`INSERT INTO ${TABLE} (CategoryName, ExpenseDescription, IsActive)
                OUTPUT INSERTED.*
                VALUES (@CategoryName, @ExpenseDescription, @IsActive)`)
      return ok(r.recordset[0], 201)
    }

    if (request.method === 'PUT' && id) {
      const b = await request.json()
      await pool.request()
        .input('id', sql.Int, parseInt(id))
        .input('CategoryName', sql.NVarChar(100), b.CategoryName ?? null)
        .input('ExpenseDescription', sql.NVarChar(500), b.ExpenseDescription ?? null)
        .input('IsActive', sql.Bit, b.IsActive ? 1 : 0)
        .query(`UPDATE ${TABLE} SET CategoryName=@CategoryName, ExpenseDescription=@ExpenseDescription,
                IsActive=@IsActive WHERE ${PK}=@id`)
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
    console.error('setup:', e.message)
    return err(e.message)
  }
}
