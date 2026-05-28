import { getPool, sql, ok, err, preflight } from './db.js'

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
        .query('SELECT * FROM AppOwnerExpenseTypes ORDER BY CategoryName')
      return ok(r.recordset)
    }

    if (request.method === 'POST') {
      const b = await request.json()
      const r = await pool.request()
        .input('CategoryName',       sql.VarChar(100), b.CategoryName       ?? null)
        .input('ExpenseDescription', sql.VarChar(500), b.ExpenseDescription ?? null)
        .input('IsActive',           sql.Bit,          b.IsActive ? 1 : 0)
        .query(`INSERT INTO AppOwnerExpenseTypes (CategoryName,ExpenseDescription,IsActive)
                OUTPUT INSERTED.*
                VALUES (@CategoryName,@ExpenseDescription,@IsActive)`)
      return ok(r.recordset[0], 201)
    }

    if (request.method === 'PUT' && id) {
      const b = await request.json()
      await pool.request()
        .input('id',                 sql.Int,          parseInt(id))
        .input('CategoryName',       sql.VarChar(100), b.CategoryName       ?? null)
        .input('ExpenseDescription', sql.VarChar(500), b.ExpenseDescription ?? null)
        .input('IsActive',           sql.Bit,          b.IsActive ? 1 : 0)
        .query(`UPDATE AppOwnerExpenseTypes SET
                CategoryName=@CategoryName, ExpenseDescription=@ExpenseDescription, IsActive=@IsActive
                WHERE ExpenseTypeID=@id`)
      return ok({ success: true })
    }

    if (request.method === 'DELETE' && id) {
      await pool.request()
        .input('id', sql.Int, parseInt(id))
        .query('DELETE FROM AppOwnerExpenseTypes WHERE ExpenseTypeID = @id')
      return ok({ success: true })
    }

    return err('Method not allowed', 405)
  } catch (e) {
    console.error('setup:', e.message)
    return err(e.message)
  }
}
