/**
 * Rooms CRUD — adjust TABLE, PK, and column names to match your schema.
 */
import { getPool, sql, ok, err, preflight } from './db.js'

const TABLE = 'LotRooms'   // ← update if needed (e.g. 'Rooms', 'LotRoomInformation')
const PK = 'RoomID'

export const config = {
  path: ['/api/rooms', '/api/rooms/:id']
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') return preflight()

  const { id } = context.params ?? {}
  const url = new URL(request.url)

  try {
    const pool = await getPool()

    if (request.method === 'GET') {
      if (id) {
        const r = await pool.request()
          .input('id', sql.Int, parseInt(id))
          .query(`SELECT * FROM ${TABLE} WHERE ${PK} = @id`)
        if (!r.recordset.length) return err('Not found', 404)
        return ok(r.recordset[0])
      }

      const lotId = url.searchParams.get('lotId')
      if (lotId) {
        const r = await pool.request()
          .input('lotId', sql.Int, parseInt(lotId))
          .query(`SELECT * FROM ${TABLE} WHERE LotID = @lotId ORDER BY RoomNumber`)
        return ok(r.recordset)
      }

      const r = await pool.request().query(`SELECT * FROM ${TABLE} ORDER BY RoomNumber`)
      return ok({ data: r.recordset, total: r.recordset.length })
    }

    if (request.method === 'POST') {
      const b = await request.json()
      const r = await pool.request()
        .input('LotID', sql.Int, b.LotID ? parseInt(b.LotID) : null)
        .input('RoomNumber', sql.NVarChar(20), b.RoomNumber ?? null)
        .input('RoomType', sql.NVarChar(20), b.RoomType ?? null)
        .input('RoomNote', sql.NVarChar(sql.MAX), b.RoomNote ?? null)
        .query(`INSERT INTO ${TABLE} (LotID, RoomNumber, RoomType, RoomNote)
                OUTPUT INSERTED.*
                VALUES (@LotID, @RoomNumber, @RoomType, @RoomNote)`)
      return ok(r.recordset[0], 201)
    }

    if (request.method === 'PUT' && id) {
      const b = await request.json()
      await pool.request()
        .input('id', sql.Int, parseInt(id))
        .input('RoomNumber', sql.NVarChar(20), b.RoomNumber ?? null)
        .input('RoomType', sql.NVarChar(20), b.RoomType ?? null)
        .input('RoomNote', sql.NVarChar(sql.MAX), b.RoomNote ?? null)
        .query(`UPDATE ${TABLE} SET RoomNumber=@RoomNumber, RoomType=@RoomType, RoomNote=@RoomNote
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
    console.error('rooms:', e.message)
    return err(e.message)
  }
}
