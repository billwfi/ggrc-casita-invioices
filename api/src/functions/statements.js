const { app } = require('@azure/functions')
const { getPool, sql, ok, err } = require('../db')

const {
  round, r2, RES_RATE, CC_RATE, OWNER_SHARE,
  isReserveAdjustment, computeReserve,
  getStatementPayload
} = require('../statementSummary')

const LINE_ITEM_COLS = `(StatementID, Category, LotNumber, RoomNumber, ConfirmationNumber, ArrivalDate, DepartureDate, StayDate,
   NumberOfNights, RoomType, RateCode, RoomRevenue, RoomRevenueShare, ReservationFee, CreditCardCommission,
   TransactionCode, MarketGroupCode, MarketGroupDescription, ReservationStatus)`
const LINE_ITEM_SELECT = `category, lotnumber, roomnumber, confirmationnumber, arrivaldate, departuredate, staydate,
   numberofnights, roomtype, ratecode, roomrevenue, roomrevenueshare, reservationfee, creditcardcommission,
   transactioncode, marketgroupcode, marketgroupdescription, reservationstatus`

app.http('statements', {
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'statements/{id?}',
  handler: async (request, context) => {
    if (request.method === 'OPTIONS') return { status: 200 }
    // The route param doubles as the numeric statement id and as the action
    // segment for the /recalc and /generate-all sub-routes.
    const id = request.params.id
    const numericId = id && /^\d+$/.test(id) ? id : null

    try {
      const pool = await getPool()

      if (request.method === 'GET') {
        const lotId = request.query.get('lotId')

        if (numericId) {
          const payload = await getStatementPayload(pool, numericId)
          if (!payload) return err('Not found', 404)
          return ok(payload)
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
              `SELECT a.StatementID,
                      SUM(CASE WHEN a.Category = 'Room Rate' OR a.AdjustmentType = 'Room Rate Adjustment'
                               THEN a.AdjustmentAmount ELSE 0 END) AS RateAdj,
                      SUM(CASE WHEN a.Category = 'Room Rate' OR a.AdjustmentType = 'Room Rate Adjustment'
                               THEN 0 ELSE a.AdjustmentAmount END) AS Adj
               FROM AppAdjustments a
               JOIN AppStatements s ON s.StatementID = a.StatementID
               WHERE s.LotID = @lotId AND a.StatementID IS NOT NULL
                 AND NOT (a.Category = 'Reserve' OR a.AdjustmentType IN ('Replacement FF&E','Reserve Adjustment'))
               GROUP BY a.StatementID`).catch(() => ({ recordset: [] })),
            pool.request().input('lotId', sql.Int, parseInt(lotId)).query(
              `SELECT TOP 1 ReserveAccount, ReserveBalance FROM AppOwners
               WHERE LotID = @lotId AND OwnershipEndDate IS NULL ORDER BY DateOfPurchase DESC`).catch(() => ({ recordset: [] }))
          ])

          const liMap = {}; for (const x of liRes.recordset) liMap[x.StatementID] = x
          const adjMap = {}; for (const x of adjRes2.recordset) adjMap[x.StatementID] = Number(x.Adj) || 0
          const rateMap = {}; for (const x of adjRes2.recordset) rateMap[x.StatementID] = Number(x.RateAdj) || 0
          const owner2 = ownerRes.recordset[0] ?? {}
          const reserveOn2 = String(owner2.ReserveAccount || '').toLowerCase().startsWith('y')
          const currentReserve2 = owner2.ReserveBalance != null ? Number(owner2.ReserveBalance) : null
          const applyReserve2 = reserveOn2 && currentReserve2 != null && currentReserve2 < 10000
          const STD_CABLE = 62, STD_CLEANING = 150

          const enriched = stmts.map(s => {
            const li = liMap[s.StatementID]
            if (!li) return { ...s, GrossRevenue: null, OwnerPayout: null }
            // Room rate adjustments restate gross/split and their percentage fees.
            const rateAdj = rateMap[s.StatementID] || 0
            const splitDelta = r2(rateAdj * OWNER_SHARE)
            const split = (Number(li.Split) || 0) + splitDelta
            const resFee = (Number(li.ResFee) || 0) - splitDelta * RES_RATE
            const ccFee = (Number(li.CcFee) || 0) - splitDelta * CC_RATE
            const adjs = adjMap[s.StatementID] || 0
            const reserveApplied = applyReserve2 ? round(split * 0.05) : 0
            const payout = split + resFee + ccFee - STD_CABLE - STD_CLEANING + adjs - reserveApplied
            return { ...s, GrossRevenue: round((Number(li.Gross) || 0) + rateAdj), OwnerPayout: round(payout) }
          })
          return ok(enriched)
        }

        const r = await pool.request()
          .query('SELECT TOP 500 * FROM AppStatements ORDER BY ActivityStartDate DESC')
        return ok({ data: r.recordset, total: r.recordset.length })
      }

      if (request.method === 'POST' && id === 'generate-all') {
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

      if (request.method === 'POST' && id === 'recalc') {
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

      if (request.method === 'DELETE' && numericId) {
        // Detach any adjustments (preserve the records) then delete the statement;
        // AppStatementLineItems is removed via ON DELETE CASCADE.
        await pool.request()
          .input('id', sql.Int, parseInt(numericId))
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
})

// Separate registration: the three-segment route cannot be matched by 'statements/{id?}'.
// Freezes this statement's reserve Before/After and writes the new balance to the owner.
app.http('statementsApplyReserve', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'statements/{id}/apply-reserve',
  handler: async (request, context) => {
    if (request.method === 'OPTIONS') return { status: 200 }
    const id = request.params.id
    if (!id || !/^\d+$/.test(id)) return err('Invalid statement id', 400)

    try {
      const pool = await getPool()

      const sres = await pool.request().input('id', sql.Int, parseInt(id))
        .query('SELECT * FROM AppStatements WHERE StatementID = @id')
      if (!sres.recordset.length) return err('Statement not found', 404)
      const st = sres.recordset[0]
      if (st.ReserveAppliedAt) return err('Reserve has already been applied for this statement.', 409)

      const oRes = await pool.request().input('lotId', sql.Int, st.LotID)
        .query('SELECT TOP 1 OwnerID, ReserveAccount, ReserveBalance FROM AppOwners WHERE LotID=@lotId AND OwnershipEndDate IS NULL ORDER BY DateOfPurchase DESC')
      const o = oRes.recordset[0]
      if (!o) return err('No active owner found for this lot.', 400)
      if (!String(o.ReserveAccount || '').toLowerCase().startsWith('y')) return err('Owner does not have a reserve account.', 400)

      const before = o.ReserveBalance != null ? Number(o.ReserveBalance) : 0
      const liRes = await pool.request().input('id', sql.Int, parseInt(id))
        .query('SELECT SUM(RoomRevenueShare) AS Split FROM AppStatementLineItems WHERE StatementID=@id')
      const split = Number(liRes.recordset[0]?.Split) || 0
      const adjRes2 = await pool.request().input('id', sql.Int, parseInt(id))
        .query('SELECT AdjustmentType, Category, AdjustmentAmount FROM AppAdjustments WHERE StatementID=@id')
      const reserveAdjTotal = adjRes2.recordset.filter(isReserveAdjustment)
        .reduce((a, r) => a + (parseFloat(r.AdjustmentAmount) || 0), 0)

      const { after, fivePctApplied } = computeReserve(before, reserveAdjTotal, split, true)

      await pool.request()
        .input('id', sql.Int, parseInt(id))
        .input('before', sql.Decimal(12, 2), before)
        .input('after', sql.Decimal(12, 2), after)
        .query('UPDATE AppStatements SET ReserveBalanceBefore=@before, ReserveBalanceAfter=@after, ReserveAppliedAt=GETDATE() WHERE StatementID=@id')
      await pool.request()
        .input('ownerId', sql.Int, o.OwnerID)
        .input('after', sql.Decimal(12, 2), after)
        .query('UPDATE AppOwners SET ReserveBalance=@after, UpdatedDate=GETDATE() WHERE OwnerID=@ownerId')

      return ok({ before, after, reserveAdjTotal: round(reserveAdjTotal), fivePctApplied })
    } catch (e) {
      console.error('statements/apply-reserve:', e.message)
      return err(e.message)
    }
  }
})
