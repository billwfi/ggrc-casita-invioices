import { getPool, sql, ok, err, preflight } from './db.js'

export const config = { path: '/api/reports' }

export default async (request) => {
  if (request.method === 'OPTIONS') return preflight()

  const url = new URL(request.url)
  const type      = url.searchParams.get('type')
  const startDate = url.searchParams.get('startDate')
  const endDate   = url.searchParams.get('endDate')
  const lotNumber = url.searchParams.get('lotNumber')

  if (!startDate || !endDate) return err('startDate and endDate are required', 400)

  try {
    const pool = await getPool()
    const lotFilter = lotNumber ? 'AND l.LotNumber = @lotNum' : ''

    if (type === 'statement-details') {
      const req = pool.request()
        .input('start', sql.Date, new Date(startDate))
        .input('end',   sql.Date, new Date(endDate))
      if (lotNumber) req.input('lotNum', sql.Int, parseInt(lotNumber))

      const r = await req.query(`
        SELECT DISTINCT
          l.LotNumber, l.AccountNo,
          d.RoomNumber, d.ConfirmationNumber,
          d.ArrivalDate, d.DepartureDate, d.StayDate, d.Nights,
          d.RoomType, d.TransCode,
          d.RoomRevenue, d.OwnerSplit, d.ReservationFee, d.CreditCardFee,
          d.CableInternetFee, d.CleaningFee
        FROM AppStatements s
        JOIN AppLots l ON l.LotID = s.LotID
        CROSS APPLY (
          SELECT DISTINCT
            roomnumber AS RoomNumber, confirmationnumber AS ConfirmationNumber,
            CAST(arrivaldate AS DATE) AS ArrivalDate, CAST(departuredate AS DATE) AS DepartureDate,
            CAST(staydate AS DATE) AS StayDate, numberofnights AS Nights,
            roomtype AS RoomType, transactioncode AS TransCode,
            CAST(roomrevenue AS DECIMAL(12,2)) AS RoomRevenue,
            CAST(ownerrevshare AS DECIMAL(12,2)) AS OwnerSplit,
            CAST(reservationfee AS DECIMAL(12,2)) AS ReservationFee,
            CAST(creditcardfee AS DECIMAL(12,2)) AS CreditCardFee,
            CAST(cableinternetfee AS DECIMAL(12,2)) AS CableInternetFee,
            CAST(cleaningfee AS DECIMAL(12,2)) AS CleaningFee
          FROM dbo.vw_CasitaInvoiceRoomRevenueDetails v
          WHERE v.lotnumber = l.LotNumber
            AND CAST(v.staydate AS DATE) BETWEEN @start AND @end
        ) d
        WHERE s.ActivityStartDate <= @end AND s.ActivityEndDate >= @start
          ${lotFilter}
        ORDER BY l.LotNumber, d.StayDate, d.RoomNumber`)
      return ok(r.recordset)
    }

    if (type === 'trans-code-1032') {
      const req = pool.request()
        .input('start', sql.Date, new Date(startDate))
        .input('end',   sql.Date, new Date(endDate))
      if (lotNumber) req.input('lotNum', sql.Int, parseInt(lotNumber))

      const r = await req.query(`
        SELECT l.LotNumber, l.AccountNo, a.*
        FROM AppAdjustments a
        JOIN AppLots l ON l.LotID = a.LotID
        WHERE a.AdjustmentDate BETWEEN @start AND @end
          AND (a.AdjustmentNote LIKE '%1032%' OR a.AdjustmentType LIKE '%1032%')
          ${lotFilter}
        ORDER BY l.LotNumber, a.AdjustmentDate`)
      return ok(r.recordset)
    }

    if (type === 'audit-data') {
      const req = pool.request()
        .input('start', sql.Date, new Date(startDate))
        .input('end',   sql.Date, new Date(endDate))
      if (lotNumber) req.input('lotNum', sql.Int, parseInt(lotNumber))

      const r = await req.query(`
        SELECT DISTINCT
          l.LotNumber, l.AccountNo, s.StatementNumber,
          d.RoomNumber, d.ConfirmationNumber,
          d.StayDate, d.ArrivalDate, d.DepartureDate, d.Nights,
          d.RoomType, d.RateCode, d.TransCode,
          d.MarketGroupCode, d.ReservationStatus,
          d.RoomRevenue, d.OwnerSplit
        FROM AppStatements s
        JOIN AppLots l ON l.LotID = s.LotID
        CROSS APPLY (
          SELECT DISTINCT
            roomnumber AS RoomNumber, confirmationnumber AS ConfirmationNumber,
            CAST(staydate AS DATE) AS StayDate,
            CAST(arrivaldate AS DATE) AS ArrivalDate, CAST(departuredate AS DATE) AS DepartureDate,
            numberofnights AS Nights, roomtype AS RoomType, ratecode AS RateCode,
            transactioncode AS TransCode, marketgroupcode AS MarketGroupCode,
            reservationstatus AS ReservationStatus,
            CAST(roomrevenue AS DECIMAL(12,2)) AS RoomRevenue,
            CAST(ownerrevshare AS DECIMAL(12,2)) AS OwnerSplit
          FROM dbo.vw_CasitaInvoiceRoomRevenueDetails v
          WHERE v.lotnumber = l.LotNumber
            AND CAST(v.staydate AS DATE) BETWEEN @start AND @end
        ) d
        WHERE s.ActivityStartDate <= @end AND s.ActivityEndDate >= @start
          ${lotFilter}
        ORDER BY l.LotNumber, d.StayDate, d.RoomNumber`)
      return ok(r.recordset)
    }

    return err(`Unknown report type: ${type}`, 400)
  } catch (e) {
    console.error('reports:', e.message)
    return err(e.message)
  }
}
