const { app } = require('@azure/functions')
const { getPool, sql, ok, err } = require('../db')

app.http('adjustments', {
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'adjustments/{id?}',
  handler: async (request, context) => {
    if (request.method === 'OPTIONS') return { status: 200 }
    const id = request.params.id

    try {
      const pool = await getPool()

      if (request.method === 'GET') {
        const statementId = request.query.get('statementId')
        if (id) {
          const r = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query('SELECT * FROM AppAdjustments WHERE AdjustmentID = @id')
          if (!r.recordset.length) return err('Not found', 404)
          return ok(r.recordset[0])
        }
        if (statementId) {
          const r = await pool.request()
            .input('sid', sql.Int, parseInt(statementId))
            .query('SELECT * FROM AppAdjustments WHERE StatementID = @sid ORDER BY AdjustmentDate')
          return ok(r.recordset)
        }
        return err('statementId required', 400)
      }

      if (request.method === 'POST') {
        const b = await request.json()
        const r = await pool.request()
          .input('StatementID',     sql.Int,           b.StatementID  ? parseInt(b.StatementID) : null)
          .input('LotID',           sql.Int,           b.LotID        ? parseInt(b.LotID) : null)
          .input('Category',        sql.VarChar(100),  b.Category        ?? 'Owner Payout')
          .input('AdjustmentType',  sql.VarChar(100),  b.AdjustmentType  ?? null)
          .input('AdjustmentName',  sql.VarChar(200),  b.AdjustmentName  ?? null)
          .input('AdjustmentDate',  sql.Date,          b.AdjustmentDate  ? new Date(b.AdjustmentDate) : null)
          .input('AdjustmentAmount',sql.Decimal(12,2), b.AdjustmentAmount != null ? parseFloat(b.AdjustmentAmount) : null)
          .input('AdjustmentNote',  sql.NVarChar(sql.MAX), b.AdjustmentNote ?? null)
          .query(`INSERT INTO AppAdjustments
                  (StatementID,LotID,Category,AdjustmentType,AdjustmentName,AdjustmentDate,AdjustmentAmount,AdjustmentNote)
                  OUTPUT INSERTED.*
                  VALUES (@StatementID,@LotID,@Category,@AdjustmentType,@AdjustmentName,@AdjustmentDate,@AdjustmentAmount,@AdjustmentNote)`)
        return ok(r.recordset[0], 201)
      }

      if (request.method === 'PUT' && id) {
        const b = await request.json()
        await pool.request()
          .input('id',              sql.Int,           parseInt(id))
          .input('AdjustmentType',  sql.VarChar(100),  b.AdjustmentType  ?? null)
          .input('AdjustmentName',  sql.VarChar(200),  b.AdjustmentName  ?? null)
          .input('AdjustmentDate',  sql.Date,          b.AdjustmentDate  ? new Date(b.AdjustmentDate) : null)
          .input('AdjustmentAmount',sql.Decimal(12,2), b.AdjustmentAmount != null ? parseFloat(b.AdjustmentAmount) : null)
          .input('AdjustmentNote',  sql.NVarChar(sql.MAX), b.AdjustmentNote ?? null)
          .query(`UPDATE AppAdjustments SET
                  AdjustmentType=@AdjustmentType, AdjustmentName=@AdjustmentName,
                  AdjustmentDate=@AdjustmentDate, AdjustmentAmount=@AdjustmentAmount,
                  AdjustmentNote=@AdjustmentNote
                  WHERE AdjustmentID=@id`)
        return ok({ success: true })
      }

      if (request.method === 'DELETE' && id) {
        await pool.request()
          .input('id', sql.Int, parseInt(id))
          .query('DELETE FROM AppAdjustments WHERE AdjustmentID = @id')
        return ok({ success: true })
      }

      return err('Method not allowed', 405)
    } catch (e) {
      console.error('adjustments:', e.message)
      return err(e.message)
    }
  }
})
