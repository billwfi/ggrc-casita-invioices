import { getPool, sql, ok, err, preflight } from './db.js'

export const config = {
  path: '/api/import-revenue'
}

export default async (request) => {
  if (request.method === 'OPTIONS') return preflight()
  if (request.method !== 'POST') return err('Method not allowed', 405)

  try {
    const body = await request.json()
    const { rows, clearFirst } = body

    if (!Array.isArray(rows) || rows.length === 0) {
      return err('No rows to import', 400)
    }

    const pool = await getPool()
    const transaction = new sql.Transaction(pool)
    await transaction.begin()

    try {
      let deleted = 0
      if (clearFirst) {
        // derive date range from the rows being imported
        const dates = rows.map(r => r.StayDate).filter(Boolean).sort()
        if (dates.length) {
          const r = await new sql.Request(transaction)
            .input('start', sql.Date, dates[0])
            .input('end',   sql.Date, dates[dates.length - 1])
            .query('DELETE FROM casita_generalrevenue WHERE StayDate >= @start AND StayDate <= @end')
          deleted = r.rowsAffected[0] ?? 0
        }
      }

      let inserted = 0
      for (const row of rows) {
        const rate    = row.Rate        != null && row.Rate        !== '' ? parseFloat(row.Rate)        : null
        const rev     = row.RoomRevenue != null && row.RoomRevenue !== '' ? parseFloat(row.RoomRevenue) : null
        const nights  = row.NumberOfNights != null && row.NumberOfNights !== '' ? parseInt(row.NumberOfNights, 10) : null
        const confNum = row.ConfirmationNumber != null && row.ConfirmationNumber !== '' ? row.ConfirmationNumber : null

        await new sql.Request(transaction)
          .input('Room',                   sql.VarChar(20),   row.Room                   ?? null)
          .input('ConfirmationNumber',      sql.VarChar(50),   confNum)
          .input('ArrivalDate',             sql.Date,          row.ArrivalDate            || null)
          .input('DepartureDate',           sql.Date,          row.DepartureDate          || null)
          .input('NumberOfNights',          sql.Int,           nights)
          .input('RoomType',                sql.VarChar(20),   row.RoomType               ?? null)
          .input('ReservationStatus',       sql.VarChar(50),   row.ReservationStatus      ?? null)
          .input('RateCode',                sql.VarChar(50),   row.RateCode               ?? null)
          .input('StayDate',                sql.Date,          row.StayDate               || null)
          .input('Rate',                    sql.Decimal(10,2), rate)
          .input('TransactionCode',         sql.VarChar(50),   row.TransactionCode        ?? null)
          .input('MarketGroupCode',         sql.VarChar(20),   row.MarketGroupCode        ?? null)
          .input('MarketGroupDescription',  sql.VarChar(100),  row.MarketGroupDescription ?? null)
          .input('RoomRevenue',             sql.Decimal(10,2), rev)
          .query(`INSERT INTO casita_generalrevenue
            (Room, ConfirmationNumber, ArrivalDate, DepartureDate, NumberOfNights,
             RoomType, ReservationStatus, RateCode, StayDate, Rate,
             TransactionCode, MarketGroupCode, MarketGroupDescription, RoomRevenue)
            VALUES
            (@Room, @ConfirmationNumber, @ArrivalDate, @DepartureDate, @NumberOfNights,
             @RoomType, @ReservationStatus, @RateCode, @StayDate, @Rate,
             @TransactionCode, @MarketGroupCode, @MarketGroupDescription, @RoomRevenue)`)
        inserted++
      }

      await transaction.commit()
      return ok({ inserted, deleted })
    } catch (e) {
      await transaction.rollback()
      throw e
    }
  } catch (e) {
    console.error('import-revenue:', e.message)
    return err(e.message)
  }
}
