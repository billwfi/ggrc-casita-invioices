import { getPool, sql, ok, err, preflight } from './db.js'

export const config = {
  path: ['/api/statements', '/api/statements/:id']
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') return preflight()
  const { id } = context.params ?? {}
  const url = new URL(request.url)

  try {
    const pool = await getPool()

    if (request.method === 'GET') {
      const lotId = url.searchParams.get('lotId')

      if (id) {
        // Statement header
        const stmtRes = await pool.request()
          .input('id', sql.Int, parseInt(id))
          .query('SELECT * FROM AppStatements WHERE StatementID = @id')
        if (!stmtRes.recordset.length) return err('Not found', 404)
        const stmt = stmtRes.recordset[0]

        // Lot number for view queries
        const lotRes = await pool.request()
          .input('lotId', sql.Int, stmt.LotID)
          .query('SELECT LotNumber FROM AppLots WHERE LotID = @lotId')
        const lotNumber = lotRes.recordset[0]?.LotNumber

        // Line items from the room revenue view
        const detailRes = await pool.request()
          .input('lotNum', sql.Int,  lotNumber)
          .input('start',  sql.Date, new Date(stmt.ActivityStartDate))
          .input('end',    sql.Date, new Date(stmt.ActivityEndDate))
          .query(`SELECT DISTINCT
                    roomnumber AS RoomNumber, confirmationnumber AS ConfirmationNumber,
                    CAST(arrivaldate AS DATE) AS ArrivalDate, CAST(departuredate AS DATE) AS DepartureDate,
                    CAST(staydate AS DATE) AS StayDate, numberofnights AS Nights,
                    roomtype AS RoomType, ratecode AS RateCode, transactioncode AS TransCode,
                    marketgroupcode AS MarketGroupCode, reservationstatus AS ReservationStatus,
                    CAST(roomrevenue AS DECIMAL(12,2)) AS RoomRevenue,
                    CAST(ownerrevshare AS DECIMAL(12,2)) AS OwnerSplit,
                    CAST(reservationfee AS DECIMAL(12,2)) AS ReservationFee,
                    CAST(creditcardfee AS DECIMAL(12,2)) AS CreditCardFee,
                    CAST(cableinternetfee AS DECIMAL(12,2)) AS CableInternetFee,
                    CAST(cleaningfee AS DECIMAL(12,2)) AS CleaningFee,
                    CAST(reserveamount AS DECIMAL(12,2)) AS ReserveAmount
                  FROM dbo.vw_CasitaInvoiceRoomRevenueDetails
                  WHERE lotnumber = @lotNum
                    AND CAST(staydate AS DATE) BETWEEN @start AND @end
                  ORDER BY StayDate, RoomNumber`)
          .catch(() => ({ recordset: [] }))

        const details = detailRes.recordset

        // Adjustments for this statement
        const adjRes = await pool.request()
          .input('stmtId', sql.Int, parseInt(id))
          .query(`SELECT * FROM AppAdjustments
                  WHERE StatementID = @stmtId
                  ORDER BY AdjustmentDate`)
          .catch(() => ({ recordset: [] }))

        // Compute summary from line items
        const gross    = details.reduce((a, r) => a + (r.RoomRevenue  || 0), 0)
        const split    = details.reduce((a, r) => a + (r.OwnerSplit   || 0), 0)
        const resFee   = details.reduce((a, r) => a + (r.ReservationFee || 0), 0)
        const ccFee    = details.reduce((a, r) => a + (r.CreditCardFee  || 0), 0)
        const cable    = details.reduce((a, r) => a + (r.CableInternetFee || 0), 0)
        const cleaning = details.reduce((a, r) => a + (r.CleaningFee  || 0), 0)
        const reserve  = details.reduce((a, r) => a + (r.ReserveAmount || 0), 0)
        const adjs     = adjRes.recordset.reduce((a, r) => a + (parseFloat(r.AdjustmentAmount) || 0), 0)

        // Owner info for reserve balance
        const ownerRes = await pool.request()
          .input('lotId', sql.Int, stmt.LotID)
          .query('SELECT TOP 1 ReserveAccount, ReserveBalance FROM AppOwners WHERE LotID = @lotId AND OwnershipEndDate IS NULL ORDER BY DateOfPurchase DESC')
          .catch(() => ({ recordset: [] }))
        const owner = ownerRes.recordset[0] ?? {}

        return ok({
          ...stmt,
          Summary: {
            GrossRevenue:    round(gross),
            OwnerSplit:      round(split),
            ReservationFee:  round(resFee),
            CreditCardFee:   round(ccFee),
            CableInternetFee: round(cable),
            MaintenanceCleaningFee: round(cleaning),
            ReserveAmount:   round(reserve),
            TotalAdjustments: round(adjs),
            TotalReserveAdjustments: 0,
            ReserveBalance:  owner.ReserveBalance ?? null,
            OwnerPayout:     round(split - resFee - ccFee - cable - cleaning - reserve - adjs)
          },
          Details: details,
          Fees: aggregateFees(details),
          Expenses: [{ ExpenseCategory: 'Standard Monthly', CableInternetFee: round(cable), MaintenanceCleaningFee: round(cleaning) }],
          Adjustments: adjRes.recordset
        })
      }

      if (lotId) {
        const r = await pool.request()
          .input('lotId', sql.Int, parseInt(lotId))
          .query(`SELECT s.*, l.LotNumber
                  FROM AppStatements s
                  JOIN AppLots l ON l.LotID = s.LotID
                  WHERE s.LotID = @lotId
                  ORDER BY s.ActivityStartDate DESC`)
        return ok(r.recordset)
      }

      const r = await pool.request()
        .query('SELECT TOP 500 * FROM AppStatements ORDER BY ActivityStartDate DESC')
      return ok({ data: r.recordset, total: r.recordset.length })
    }

    if (request.method === 'POST') {
      const b = await request.json()
      const lotRes = await pool.request()
        .input('lotId', sql.Int, parseInt(b.LotID))
        .query('SELECT LotNumber FROM AppLots WHERE LotID = @lotId')
      const lotNumber = lotRes.recordset[0]?.LotNumber ?? '?'
      const stmtNum = `LOT${lotNumber}-${(b.ActivityStartDate || '').slice(0,7).replace('-','')}`

      const r = await pool.request()
        .input('LotID',             sql.Int,         parseInt(b.LotID))
        .input('StatementNumber',   sql.VarChar(50), stmtNum)
        .input('StatementDate',     sql.Date,        new Date(b.StatementDate || new Date()))
        .input('ActivityStartDate', sql.Date,        new Date(b.ActivityStartDate))
        .input('ActivityEndDate',   sql.Date,        new Date(b.ActivityEndDate))
        .input('StatementNote',     sql.NVarChar(sql.MAX), b.StatementNote ?? null)
        .query(`INSERT INTO AppStatements (LotID,StatementNumber,StatementDate,ActivityStartDate,ActivityEndDate,StatementNote)
                OUTPUT INSERTED.*
                VALUES (@LotID,@StatementNumber,@StatementDate,@ActivityStartDate,@ActivityEndDate,@StatementNote)`)
      return ok(r.recordset[0], 201)
    }

    return err('Method not allowed', 405)
  } catch (e) {
    console.error('statements:', e.message)
    return err(e.message)
  }
}

const round = (v) => Math.round(v * 100) / 100

function aggregateFees(details) {
  const map = {}
  for (const d of details) {
    const rn = d.RoomNumber || 'Adj'
    if (!map[rn]) map[rn] = { RoomNumber: rn, TotalRoomNights: 0, TotalReservationFees: 0, TotalCreditCardFees: 0 }
    map[rn].TotalRoomNights += d.Nights || 0
    map[rn].TotalReservationFees = round(map[rn].TotalReservationFees + (d.ReservationFee || 0))
    map[rn].TotalCreditCardFees  = round(map[rn].TotalCreditCardFees  + (d.CreditCardFee  || 0))
  }
  return Object.values(map)
}
