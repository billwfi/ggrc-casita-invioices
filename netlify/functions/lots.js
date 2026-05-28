/**
 * Lots CRUD — adjust TABLE_NAME and column names below to match your DB schema.
 * Use /schema in the app to discover actual table/column names.
 */
import { getPool, sql, ok, err, preflight } from './db.js'

const TABLE = 'Lots'         // ← update if needed
const PK = 'LotID'           // ← primary key column name
const SORT = 'LotNumber'     // ← sort column

export const config = {
  path: ['/api/lots', '/api/lots/:id']
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

      const search = url.searchParams.get('search') || ''
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
      const pageSize = Math.min(200, parseInt(url.searchParams.get('pageSize') || '50'))
      const offset = (page - 1) * pageSize
      const where = search
        ? `WHERE LotNumber LIKE @s OR AccountNo LIKE @s OR LotAddress LIKE @s`
        : ''
      const bind = (req) => search ? req.input('s', sql.NVarChar, `%${search}%`) : req

      const [cnt, data] = await Promise.all([
        bind(pool.request()).query(`SELECT COUNT(*) AS total FROM ${TABLE} ${where}`),
        bind(pool.request())
          .input('off', sql.Int, offset)
          .input('ps', sql.Int, pageSize)
          .query(`SELECT * FROM ${TABLE} ${where} ORDER BY ${SORT} OFFSET @off ROWS FETCH NEXT @ps ROWS ONLY`)
      ])
      return ok({ data: data.recordset, total: cnt.recordset[0].total, page, pageSize })
    }

    if (request.method === 'POST') {
      const b = await request.json()
      const r = await pool.request()
        .input('LotNumber', sql.Int, b.LotNumber ? parseInt(b.LotNumber) : null)
        .input('AccountNo', sql.NVarChar(50), b.AccountNo ?? null)
        .input('LotAddress', sql.NVarChar(200), b.LotAddress ?? null)
        .input('LotCity', sql.NVarChar(100), b.LotCity ?? null)
        .input('LotState', sql.NVarChar(2), b.LotState ?? null)
        .input('LotZip', sql.NVarChar(10), b.LotZip ?? null)
        .query(`INSERT INTO ${TABLE} (LotNumber, AccountNo, LotAddress, LotCity, LotState, LotZip)
                OUTPUT INSERTED.*
                VALUES (@LotNumber, @AccountNo, @LotAddress, @LotCity, @LotState, @LotZip)`)
      return ok(r.recordset[0], 201)
    }

    if (request.method === 'PUT' && id) {
      const b = await request.json()
      await pool.request()
        .input('id', sql.Int, parseInt(id))
        .input('LotNumber', sql.Int, b.LotNumber ? parseInt(b.LotNumber) : null)
        .input('AccountNo', sql.NVarChar(50), b.AccountNo ?? null)
        .input('LotAddress', sql.NVarChar(200), b.LotAddress ?? null)
        .input('LotCity', sql.NVarChar(100), b.LotCity ?? null)
        .input('LotState', sql.NVarChar(2), b.LotState ?? null)
        .input('LotZip', sql.NVarChar(10), b.LotZip ?? null)
        .query(`UPDATE ${TABLE} SET LotNumber=@LotNumber, AccountNo=@AccountNo, LotAddress=@LotAddress,
                LotCity=@LotCity, LotState=@LotState, LotZip=@LotZip WHERE ${PK}=@id`)
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
    console.error('lots:', e.message)
    return err(e.message)
  }
}
