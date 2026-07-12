const { app } = require('@azure/functions')
const { getPool, sql, ok, err } = require('../db')

app.http('schema', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'schema',
  handler: async (request, context) => {
    if (request.method === 'OPTIONS') return { status: 200 }
    try {
      const pool = await getPool()
      const table = request.query.get('table')

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
})
