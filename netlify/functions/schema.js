import { getPool, sql, ok, err, preflight } from './db.js'

export const config = { path: '/api/schema' }

export default async (request) => {
  if (request.method === 'OPTIONS') return preflight()
  try {
    const pool = await getPool()
    const url = new URL(request.url)
    const table = url.searchParams.get('table')

    if (table) {
      const result = await pool.request()
        .input('table', sql.NVarChar(128), table)
        .query(`SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = @table
                ORDER BY ORDINAL_POSITION`)
      return ok(result.recordset)
    }

    const result = await pool.request()
      .query(`SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE
              FROM INFORMATION_SCHEMA.TABLES
              ORDER BY TABLE_SCHEMA, TABLE_NAME`)
    return ok(result.recordset)
  } catch (e) {
    console.error('schema:', e.message)
    return err(e.message)
  }
}
