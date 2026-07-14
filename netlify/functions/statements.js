import { getPool, sql, ok, err, preflight } from './db.js'

export const config = {
  path: ['/api/statements', '/api/statements/recalc', '/api/statements/generate-all', '/api/statements/:id']
}

const LINE_ITEM_COLS = `(StatementID, Category, LotNumber, RoomNumber, ConfirmationNumber, ArrivalDate, DepartureDate, StayDate,
   NumberOfNights, RoomType, RateCode, RoomRevenue, RoomRevenueShare, ReservationFee, CreditCardCommission,
   TransactionCode, MarketGroupCode, MarketGroupDescription, ReservationStatus)`
const LINE_ITEM_SELECT = `category, lotnumber, roomnumber, confirmationnumber, arrivaldate, departuredate, staydate,
   numberofnights, roomtype, ratecode, roomrevenue, roomrevenueshare, reservationfee, creditcardcommission,
   transactioncode, marketgroupcode, marketgroupdescription, reservationstatus`

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

        // Prefer the snapshot captured at creation; fall back to the live view
        // for legacy statements created before snapshotting existed.
        const snapRes = await pool.request()
          .input('stmtId', sql.Int, parseInt(id))
          .query(`SELECT
                    RoomNumber, ConfirmationNumber,
                    ArrivalDate, DepartureDate, StayDate, NumberOfNights AS Nights,
                    RoomType, RateCode, TransactionCode AS TransCode,
                    MarketGroupCode, ReservationStatus,
                    CAST(RoomRevenue          AS DECIMAL(12,2)) AS RoomRevenue,
                    CAST(RoomRevenueShare     AS DECIMAL(12,2)) AS OwnerSplit,
                    CAST(ReservationFee       AS DECIMAL(12,2)) AS ReservationFee,
                    CAST(CreditCardCommission AS DECIMAL(12,2)) AS CreditCardFee
                  FROM AppStatementLineItems
                  WHERE StatementID = @stmtId
                  ORDER BY StayDate, RoomNumber`)

        // In the snapshot, ReservationFee / CreditCardFee are already signed
        // (negative = deduction); in the legacy view they are positive magnitudes.
        const fromSnapshot = snapRes.recordset.length > 0
        let details
        if (fromSnapshot) {
          details = snapRes.recordset.map(d => ({ ...d, CableInternetFee: 0, CleaningFee: 0, ReserveAmount: 0 }))
        } else {
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
          details = detailRes.recordset
        }

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

        // Standard monthly expenses applied to every statement.
        const STD_CABLE = 62, STD_CLEANING = 150
        const cableFee    = fromSnapshot ? STD_CABLE : round(cable)
        const cleaningFee = fromSnapshot ? STD_CLEANING : round(cleaning)

        // 5% reserve is calculated on the owner split. It is only applied (moved to
        // reserve and deducted from payout) when the reserve balance is under $10,000.
        const reserveOn = String(owner.ReserveAccount || '').toLowerCase().startsWith('y')
        const currentReserve = owner.ReserveBalance != null ? Number(owner.ReserveBalance) : null
        const reserveAmount = fromSnapshot
          ? (reserveOn ? round(split * 0.05) : 0)
          : round(reserve)
        const applyReserve = reserveOn && currentReserve != null && currentReserve < 10000
        const totalReserveAdjustments = fromSnapshot ? (applyReserve ? reserveAmount : 0) : 0
        const reserveBalanceAfter = currentReserve != null
          ? round(currentReserve + totalReserveAdjustments)
          : null

        // Snapshot fees are signed (add them); legacy fees are magnitudes (subtract them).
        const ownerPayout = fromSnapshot
          ? split + resFee + ccFee - cableFee - cleaningFee - adjs - totalReserveAdjustments
          : split - resFee - ccFee - cable - cleaning - reserve - adjs

        return ok({
          ...stmt,
          Summary: {
            GrossRevenue:    round(gross),
            OwnerSplit:      round(split),
            ReservationFee:  round(resFee),
            CreditCardFee:   round(ccFee),
            CableInternetFee: cableFee,
            MaintenanceCleaningFee: cleaningFee,
            ReserveAmount:   reserveAmount,
            TotalAdjustments: round(adjs),
            TotalReserveAdjustments: round(totalReserveAdjustments),
            CurrentReserveBalance: currentReserve,
            ReserveBalance:  reserveBalanceAfter,
            OwnerPayout:     round(ownerPayout)
          },
          Details: details,
          Fees: aggregateFees(details),
          Expenses: [{ ExpenseCategory: 'Standard Monthly', CableInternetFee: cableFee, MaintenanceCleaningFee: cleaningFee }],
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
        const stmts = r.recordset
        if (!stmts.length) return ok([])

        // Aggregate gross + payout per statement from the saved line items.
        const [liRes, adjRes2, ownerRes] = await Promise.all([
          pool.request().input('lotId', sql.Int, parseInt(lotId)).query(
            `SELECT li.StatementID,
                    SUM(li.RoomRevenue) AS Gross,
                    SUM(li.RoomRevenueShare) AS Split,
                    SUM(li.ReservationFee) AS ResFee,
                    SUM(li.CreditCardCommission) AS CcFee
             FROM AppStatementLineItems li
             JOIN AppStatements s ON s.StatementID = li.StatementID
             WHERE s.LotID = @lotId
             GROUP BY li.StatementID`),
          pool.request().input('lotId', sql.Int, parseInt(lotId)).query(
            `SELECT a.StatementID, SUM(a.AdjustmentAmount) AS Adj
             FROM AppAdjustments a
             JOIN AppStatements s ON s.StatementID = a.StatementID
             WHERE s.LotID = @lotId AND a.StatementID IS NOT NULL
             GROUP BY a.StatementID`).catch(() => ({ recordset: [] })),
          pool.request().input('lotId', sql.Int, parseInt(lotId)).query(
            `SELECT TOP 1 ReserveAccount, ReserveBalance FROM AppOwners
             WHERE LotID = @lotId AND OwnershipEndDate IS NULL ORDER BY DateOfPurchase DESC`).catch(() => ({ recordset: [] }))
        ])

        const liMap = {}; for (const x of liRes.recordset) liMap[x.StatementID] = x
        const adjMap = {}; for (const x of adjRes2.recordset) adjMap[x.StatementID] = Number(x.Adj) || 0
        const owner2 = ownerRes.recordset[0] ?? {}
        const reserveOn2 = String(owner2.ReserveAccount || '').toLowerCase().startsWith('y')
        const currentReserve2 = owner2.ReserveBalance != null ? Number(owner2.ReserveBalance) : null
        const applyReserve2 = reserveOn2 && currentReserve2 != null && currentReserve2 < 10000
        const STD_CABLE = 62, STD_CLEANING = 150

        const enriched = stmts.map(s => {
          const li = liMap[s.StatementID]
          if (!li) return { ...s, GrossRevenue: null, OwnerPayout: null }
          const split = Number(li.Split) || 0
          const resFee = Number(li.ResFee) || 0
          const ccFee = Number(li.CcFee) || 0
          const adjs = adjMap[s.StatementID] || 0
          const reserveApplied = applyReserve2 ? round(split * 0.05) : 0
          const payout = split + resFee + ccFee - STD_CABLE - STD_CLEANING - adjs - reserveApplied
          return { ...s, GrossRevenue: round(Number(li.Gross) || 0), OwnerPayout: round(payout) }
        })
        return ok(enriched)
      }

      const r = await pool.request()
        .query('SELECT TOP 500 * FROM AppStatements ORDER BY ActivityStartDate DESC')
      return ok({ data: r.recordset, total: r.recordset.length })
    }

    if (request.method === 'POST' && url.pathname.endsWith('/generate-all')) {
      const b = await request.json()
      const start = b.ActivityStartDate, end = b.ActivityEndDate
      const stmtDate = b.StatementDate || new Date().toISOString().slice(0, 10)
      if (!start || !end) return err('ActivityStartDate and ActivityEndDate are required', 400)

      const lots = (await pool.request().query('SELECT LotID, LotNumber FROM AppLots ORDER BY LotNumber')).recordset
      let created = 0, skippedExisting = 0, skippedEmpty = 0

      for (const lot of lots) {
        const exists = await pool.request()
          .input('lotId', sql.Int, lot.LotID)
          .input('start', sql.Date, new Date(start))
          .input('end',   sql.Date, new Date(end))
          .query(`SELECT COUNT(*) AS n FROM AppStatements
                  WHERE LotID=@lotId AND ActivityStartDate=@start AND ActivityEndDate=@end`)
        if (exists.recordset[0].n > 0) { skippedExisting++; continue }

        const rev = await pool.request()
          .input('lot',   sql.Int,  lot.LotNumber)
          .input('start', sql.Date, new Date(start))
          .input('end',   sql.Date, new Date(end))
          .query(`SELECT COUNT(*) AS n FROM dbo.vw_CasitaStatementGeneralRevenue
                  WHERE lotnumber=@lot AND CAST(staydate AS DATE) BETWEEN @start AND @end`)
        if (rev.recordset[0].n === 0) { skippedEmpty++; continue }

        const stmtNum = `LOT${lot.LotNumber}-${start.slice(0, 7).replace('-', '')}`
        const ins = await pool.request()
          .input('LotID', sql.Int, lot.LotID)
          .input('StatementNumber', sql.VarChar(50), stmtNum)
          .input('StatementDate', sql.Date, new Date(stmtDate))
          .input('ActivityStartDate', sql.Date, new Date(start))
          .input('ActivityEndDate', sql.Date, new Date(end))
          .query(`INSERT INTO AppStatements (LotID,StatementNumber,StatementDate,ActivityStartDate,ActivityEndDate)
                  OUTPUT INSERTED.StatementID
                  VALUES (@LotID,@StatementNumber,@StatementDate,@ActivityStartDate,@ActivityEndDate)`)
        await pool.request()
          .input('StatementID', sql.Int, ins.recordset[0].StatementID)
          .input('lotNum', sql.Int, lot.LotNumber)
          .input('start', sql.Date, new Date(start))
          .input('end',   sql.Date, new Date(end))
          .query(`INSERT INTO dbo.AppStatementLineItems ${LINE_ITEM_COLS}
                  SELECT @StatementID, ${LINE_ITEM_SELECT}
                  FROM dbo.vw_CasitaStatementGeneralRevenue
                  WHERE lotnumber=@lotNum AND CAST(staydate AS DATE) BETWEEN @start AND @end`)
        created++
      }
      return ok({ created, skippedExisting, skippedEmpty, totalLots: lots.length })
    }

    if (request.method === 'POST' && url.pathname.endsWith('/recalc')) {
      // Regenerate saved line items for every statement from current revenue data
      // (lot + activity date range). Manual adjustments are preserved.
      const rr = await pool.request().query(`
        DELETE FROM dbo.AppStatementLineItems;
        INSERT INTO dbo.AppStatementLineItems
          (StatementID, Category, LotNumber, RoomNumber, ConfirmationNumber, ArrivalDate, DepartureDate, StayDate,
           NumberOfNights, RoomType, RateCode, RoomRevenue, RoomRevenueShare, ReservationFee, CreditCardCommission,
           TransactionCode, MarketGroupCode, MarketGroupDescription, ReservationStatus)
        SELECT s.StatementID, v.category, v.lotnumber, v.roomnumber, v.confirmationnumber,
           v.arrivaldate, v.departuredate, v.staydate, v.numberofnights, v.roomtype, v.ratecode,
           v.roomrevenue, v.roomrevenueshare, v.reservationfee, v.creditcardcommission,
           v.transactioncode, v.marketgroupcode, v.marketgroupdescription, v.reservationstatus
        FROM dbo.AppStatements s
        JOIN dbo.AppLots l ON l.LotID = s.LotID
        JOIN dbo.vw_CasitaStatementGeneralRevenue v
          ON v.lotnumber = l.LotNumber
          AND CAST(v.staydate AS DATE) BETWEEN s.ActivityStartDate AND s.ActivityEndDate
        WHERE s.ActivityStartDate IS NOT NULL AND s.ActivityEndDate IS NOT NULL;`)
      const inserted = rr.rowsAffected?.[rr.rowsAffected.length - 1] ?? 0
      const cnt = await pool.request().query('SELECT COUNT(DISTINCT StatementID) AS n FROM dbo.AppStatementLineItems')
      return ok({ statements: cnt.recordset[0].n, lineItems: inserted })
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
      const stmt = r.recordset[0]

      // Snapshot the General Revenue line items for this lot + stay-date range.
      const snap = await pool.request()
        .input('StatementID', sql.Int,  stmt.StatementID)
        .input('lotNum',      sql.Int,  lotNumber)
        .input('start',       sql.Date, new Date(b.ActivityStartDate))
        .input('end',         sql.Date, new Date(b.ActivityEndDate))
        .query(`INSERT INTO AppStatementLineItems
                  (StatementID, Category, LotNumber, RoomNumber, ConfirmationNumber,
                   ArrivalDate, DepartureDate, StayDate, NumberOfNights, RoomType, RateCode,
                   RoomRevenue, RoomRevenueShare, ReservationFee, CreditCardCommission,
                   TransactionCode, MarketGroupCode, MarketGroupDescription, ReservationStatus)
                SELECT @StatementID, category, lotnumber, roomnumber, confirmationnumber,
                   arrivaldate, departuredate, staydate, numberofnights, roomtype, ratecode,
                   roomrevenue, roomrevenueshare, reservationfee, creditcardcommission,
                   transactioncode, marketgroupcode, marketgroupdescription, reservationstatus
                FROM dbo.vw_CasitaStatementGeneralRevenue
                WHERE lotnumber = @lotNum
                  AND CAST(staydate AS DATE) BETWEEN @start AND @end`)

      return ok({ ...stmt, LineItemCount: snap.rowsAffected?.[0] ?? 0 }, 201)
    }

    if (request.method === 'DELETE' && id) {
      // Detach any adjustments (preserve the records) then delete the statement;
      // AppStatementLineItems is removed via ON DELETE CASCADE.
      await pool.request()
        .input('id', sql.Int, parseInt(id))
        .query(`UPDATE AppAdjustments SET StatementID = NULL WHERE StatementID = @id;
                DELETE FROM AppStatements WHERE StatementID = @id;`)
      return ok({ success: true })
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
