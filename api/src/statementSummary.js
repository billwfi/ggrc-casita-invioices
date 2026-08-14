const { sql } = require('./db')

const round = (v) => Math.round(v * 100) / 100
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100

// Rates applied to the owner split. The owner split is 50% of gross revenue.
const RES_RATE = 0.065, CC_RATE = 0.022, OWNER_SHARE = 0.5

// Standard monthly expenses applied to every statement.
const STD_CABLE = 62, STD_CLEANING = 150

// Adjustment types that draw against the reserve balance rather than the owner payout.
function isReserveAdjustment(a) {
  const t = String(a.AdjustmentType || '').toLowerCase()
  const c = String(a.Category || '').toLowerCase()
  return c === 'reserve' || t === 'replacement ff&e' || t === 'reserve adjustment'
}

// Room rate adjustments correct the underlying room revenue, so they flow through
// gross -> owner split -> the percentage fees, rather than being a flat payout line.
function isRateAdjustment(a) {
  const t = String(a.AdjustmentType || '').toLowerCase()
  const c = String(a.Category || '').toLowerCase()
  return c === 'room rate' || t === 'room rate adjustment'
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

/**
 * Builds the full statement payload (header, Summary, Details, Fees, Adjustments)
 * for one statement. Single source of truth: the API and the statement emailer
 * both call this so a change to the math can never apply to only one of them.
 * Returns null when the statement id does not exist.
 */
async function getStatementPayload(pool, statementId) {
  const id = parseInt(statementId)

  // Statement header
  const stmtRes = await pool.request()
    .input('id', sql.Int, id)
    .query('SELECT * FROM AppStatements WHERE StatementID = @id')
  if (!stmtRes.recordset.length) return null
  const stmt = stmtRes.recordset[0]

  // Lot number for view queries
  const lotRes = await pool.request()
    .input('lotId', sql.Int, stmt.LotID)
    .query('SELECT LotNumber FROM AppLots WHERE LotID = @lotId')
  const lotNumber = lotRes.recordset[0]?.LotNumber

  // Prefer the snapshot captured at creation; fall back to the live view
  // for legacy statements created before snapshotting existed.
  const snapRes = await pool.request()
    .input('stmtId', sql.Int, id)
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
    .input('stmtId', sql.Int, id)
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

  // Three buckets: reserve adjustments hit the reserve balance, room rate
  // adjustments restate gross revenue, everything else is a flat payout line.
  const sumAdj = (rows) => rows.reduce((a, r) => a + (parseFloat(r.AdjustmentAmount) || 0), 0)
  const reserveAdjTotal = sumAdj(adjRes.recordset.filter(isReserveAdjustment))
  const rateAdjTotal    = sumAdj(adjRes.recordset.filter(r => !isReserveAdjustment(r) && isRateAdjustment(r)))
  const payoutAdjTotal  = sumAdj(adjRes.recordset.filter(r => !isReserveAdjustment(r) && !isRateAdjustment(r)))

  // A room rate adjustment restates room revenue: gross moves by the full
  // amount, the owner split by its 50% share, and the reservation / credit
  // card fees are recalculated on that additional split.
  const splitDelta   = r2(rateAdjTotal * OWNER_SHARE)
  const grossAdj     = r2(gross + rateAdjTotal)
  const splitAdj     = r2(split + splitDelta)
  // Snapshot fees are signed (negative = deduction); legacy fees are magnitudes.
  const feeSign      = fromSnapshot ? -1 : 1
  const resFeeAdj    = r2(resFee + feeSign * splitDelta * RES_RATE)
  const ccFeeAdj     = r2(ccFee  + feeSign * splitDelta * CC_RATE)

  // Owner info for reserve balance
  const ownerRes = await pool.request()
    .input('lotId', sql.Int, stmt.LotID)
    .query('SELECT TOP 1 ReserveAccount, ReserveBalance FROM AppOwners WHERE LotID = @lotId AND OwnershipEndDate IS NULL ORDER BY DateOfPurchase DESC')
    .catch(() => ({ recordset: [] }))
  const owner = ownerRes.recordset[0] ?? {}

  const cableFee    = fromSnapshot ? STD_CABLE : round(cable)
  const cleaningFee = fromSnapshot ? STD_CLEANING : round(cleaning)

  // Reserve: reserve-type adjustments always reduce the reserve; the 5% of split
  // is applied (to reserve + deducted from payout) only when the post-deduction
  // balance is under $10,000. Before/After freeze once applied to the owner.
  const reserveOn = String(owner.ReserveAccount || '').toLowerCase().startsWith('y')
  const currentReserve = owner.ReserveBalance != null ? Number(owner.ReserveBalance) : null
  const applied = stmt.ReserveAppliedAt != null
  const effectiveBefore = applied ? Number(stmt.ReserveBalanceBefore) : currentReserve
  const calc = computeReserve(effectiveBefore, reserveAdjTotal, splitAdj, fromSnapshot && reserveOn)
  const fivePct = calc.fivePct
  const fivePctApplied = calc.fivePctApplied
  const reserveBalanceBefore = applied ? Number(stmt.ReserveBalanceBefore) : currentReserve
  const reserveBalanceAfter = applied ? Number(stmt.ReserveBalanceAfter) : calc.after

  // Snapshot fees are signed (add them); legacy fees are magnitudes (subtract them).
  // Adjustments are signed too: negative reduces the payout, positive increases it.
  // Rate adjustments are already folded into splitAdj / resFeeAdj / ccFeeAdj.
  const ownerPayout = fromSnapshot
    ? splitAdj + resFeeAdj + ccFeeAdj - cableFee - cleaningFee + payoutAdjTotal - fivePctApplied
    : splitAdj - resFeeAdj - ccFeeAdj - cable - cleaning - reserve + payoutAdjTotal

  return {
    ...stmt,
    LotNumber: lotNumber,
    Summary: {
      GrossRevenue:    round(grossAdj),
      OwnerSplit:      round(splitAdj),
      ReservationFee:  round(resFeeAdj),
      CreditCardFee:   round(ccFeeAdj),
      CableInternetFee: cableFee,
      MaintenanceCleaningFee: cleaningFee,
      ReserveAmount:   fivePct,
      ReserveAmountApplied: fivePctApplied,
      TotalAdjustments: round(payoutAdjTotal),
      TotalRateAdjustments: round(rateAdjTotal),
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
  }
}

module.exports = {
  round, r2, RES_RATE, CC_RATE, OWNER_SHARE, STD_CABLE, STD_CLEANING,
  isReserveAdjustment, isRateAdjustment, computeReserve, aggregateFees,
  getStatementPayload
}
