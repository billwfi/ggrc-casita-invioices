const { app } = require('@azure/functions')
const { getPool, sql, ok, err } = require('../db')

app.http('rooms', {
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'rooms/{id?}',
  handler: async (request, context) => {
    if (request.method === 'OPTIONS') return { status: 200 }
    const id = request.params.id

    try {
      const pool = await getPool()

      if (request.method === 'GET') {
        if (id) {
          const r = await pool.request()
            .input('id', sql.Int, parseInt(id))
            .query('SELECT * FROM AppRooms WHERE RoomID = @id')
          if (!r.recordset.length) return err('Not found', 404)
          return ok(r.recordset[0])
        }
        const lotId = request.query.get('lotId')
        if (lotId) {
          const r = await pool.request()
            .input('lotId', sql.Int, parseInt(lotId))
            .query('SELECT * FROM AppRooms WHERE LotID = @lotId ORDER BY RoomNumber')
          return ok(r.recordset)
        }
        const r = await pool.request().query('SELECT * FROM AppRooms ORDER BY LotID, RoomNumber')
        return ok({ data: r.recordset, total: r.recordset.length })
      }

      if (request.method === 'POST') {
        const b = await request.json()
        const r = await pool.request()
          .input('LotID',      sql.Int,         parseInt(b.LotID))
          .input('RoomNumber', sql.VarChar(20),  b.RoomNumber ?? null)
          .input('RoomType',   sql.VarChar(20),  b.RoomType   ?? null)
          .input('RoomNote',   sql.NVarChar(sql.MAX), b.RoomNote ?? null)
          .query(`INSERT INTO AppRooms (LotID,RoomNumber,RoomType,RoomNote)
                  OUTPUT INSERTED.*
                  VALUES (@LotID,@RoomNumber,@RoomType,@RoomNote)`)
        return ok(r.recordset[0], 201)
      }

      if (request.method === 'PUT' && id) {
        const b = await request.json()
        await pool.request()
          .input('id',         sql.Int,          parseInt(id))
          .input('RoomNumber', sql.VarChar(20),  b.RoomNumber ?? null)
          .input('RoomType',   sql.VarChar(20),  b.RoomType   ?? null)
          .input('RoomNote',   sql.NVarChar(sql.MAX), b.RoomNote ?? null)
          .query('UPDATE AppRooms SET RoomNumber=@RoomNumber, RoomType=@RoomType, RoomNote=@RoomNote WHERE RoomID=@id')
        return ok({ success: true })
      }

      if (request.method === 'DELETE' && id) {
        await pool.request()
          .input('id', sql.Int, parseInt(id))
          .query('DELETE FROM AppRooms WHERE RoomID = @id')
        return ok({ success: true })
      }

      return err('Method not allowed', 405)
    } catch (e) {
      console.error('rooms:', e.message)
      return err(e.message)
    }
  }
})
