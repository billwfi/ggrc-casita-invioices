const { app } = require('@azure/functions')
const { getPool, sql, ok, err } = require('../db')

const round = (v) => Math.round(v * 100) / 100
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100

// Adjustment types that draw against the reserve balance rather than the owner payout.
function isReserveAdjustment(a) {
  const t = String(a.AdjustmentType || '').toLowerCase()
  const c = String(a.Category || '').toLowerCase()
  return c === 'reserve' || t === 'replacement ff&e' || t === 'reserve adjustment'
}

// Reserve math: reserve adjustments are signed (negative reduces the balance); when
// the post-adjustment balance is under $10,000, the 5% reserve (of owner split) is
// applied to top it back up — capped so it never exceeds $10,000.
function computeReserve(before, reserveAdjTotal, split, reserveOn) {
  const fivePct = reserveOn ? r2(split * 0.05) : 0
  if (before == null) return { fivePct, fivePctApplied: 0, after: null, balanceAfterAdj: null }
  const balanceAfterAdj = r2(before + (reserveAdjTotal || 0))
  let fivePctApplied = 0
  if (reserveOn && balanceAfterAdj < 10000) {
    fivePctApplied = Math.max(0, Math.min(fivePct, r2(10000 - balanceAfterAdj)))
  }
  return { fivePct, fivePctApplied, after: r2(balanceAfterAdj + fivePctApplied), balanceAfterAdj }
}

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
          // Statement header
          const stmtRes = await pool.request()
            .input('id', sql.Int, parseInt(numericId))
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
            .input('stmtId', sql.Int, parseInt(numericId))
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
            .input('stmtId', sql.Int, parseInt(numericId))
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

          // Reserve-type adjustments affect the reserve balance; all others affect payout.
          const reserveAdjTotal = adjRes.recordset.filter(isReserveAdjustment)
            .reduce((a, r) => a + (parseFloat(r.AdjustmentAmount) || 0), 0)
          const payoutAdjTotal = adjRes.recordset.filter(r => !isReserveAdjustment(r))
            .reduce((a, r) => a + (parseFloat(r.AdjustmentAmount) || 0), 0)

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

          // Reserve: reserve-type adjustments always reduce the reserve; the 5% of split
          // is applied (to reserve + deducted from payout) only when the post-deduction
          // balance is under $10,000. Before/After freeze once applied to the owner.
          const reserveOn = String(owner.ReserveAccount || '').toLowerCase().startsWith('y')
          const currentReserve = owner.ReserveBalance != null ? Number(owner.ReserveBalance) : null
          const applied = stmt.ReserveAppliedAt != null
          const effectiveBefore = applied ? Number(stmt.ReserveBalanceBefore) : currentReserve
          const calc = computeReserve(effectiveBefore, reserveAdjTotal, split, fromSnapshot && reserveOn)
          const fivePct = calc.fivePct
          const fivePctApplied = calc.fivePctApplied
          const reserveBalanceBefore = applied ? Number(stmt.ReserveBalanceBefore) : currentReserve
          const reserveBalanceAfter = applied ? Number(stmt.ReserveBalanceAfter) : calc.after

          // Snapshot fees are signed (add them); legacy fees are magnitudes (subtract them).
          // Adjustments are signed too: negative reduces the payout, positive increases it.
          const ownerPayout = fromSnapshot
            ? split + resFee + ccFee - cableFee - cleaningFee + payoutAdjTotal - fivePctApplied
            : split - resFee - ccFee - cable - cleaning - reserve + payoutAdjTotal

          return ok({
            ...stmt,
            Summary: {
              GrossRevenue:    round(gross),
              OwnerSplit:      round(split),
              ReservationFee:  round(resFee),
              CreditCardFee:   round(ccFee),
              CableInternetFee: cableFee,
              MaintenanceCleaningFee: cleaningFee,
              ReserveAmount:   fivePct,
              ReserveAmountApplied: fivePctApplied,
              TotalAdjustments: round(payoutAdjTotal),
              TotalReserveAdjustments: round(reserveAdjTotal),
              CurrentReserveBalance: currentReserve,
              ReserveBalanceBefore: reserveBalanceBefore,
              ReserveBalanceAfter: reserveBalanceAfter,
              ReserveBalance:  reserveBalanceAfter,
              ReserveApplied: applied,
              ReserveAppliedAt: stmt.ReserveAppliedAt ?? null,
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
                 AND NOT (a.Category = 'Reserve' OR a.AdjustmentType IN ('Replacement FF&E','Reserve Adjustment'))
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
            const payout = split + resFee + ccFee - STD_CABLE - STD_CLEANING + adjs - reserveApplied
            return { ...s, GrossRevenue: round(Number(li.Gross) || 0), OwnerPayout: round(payout) }
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
