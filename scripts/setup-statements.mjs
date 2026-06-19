/**
 * Creates the objects needed for snapshot-at-creation statements:
 *   - dbo.vw_CasitaStatementGeneralRevenue : the General Revenue source query
 *     (rooms with a rate, rooms with adjusted revenue, and Room Rate Adjustments),
 *     with lotnumber normalized to INT so it joins to AppLots / AppStatements.
 *   - dbo.AppStatementLineItems : per-statement snapshot of the pulled rows.
 * Safe to re-run.
 */
import sql from 'mssql'

const config = {
  server: '64.27.41.252', port: 1433, user: 'claudeservices',
  password: 'Bunk?pjb8hah', database: 'GGRC',
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true, connectTimeout: 30000, requestTimeout: 90000 }
}
const pool = await new sql.ConnectionPool(config).connect()
console.log('Connected\n')

// View must be the only statement in its batch, so drop + create are separate requests.
await pool.request().query(`IF OBJECT_ID('dbo.vw_CasitaStatementGeneralRevenue','V') IS NOT NULL DROP VIEW dbo.vw_CasitaStatementGeneralRevenue`)
console.log('Dropped existing view (if any)')

await pool.request().query(`
CREATE VIEW dbo.vw_CasitaStatementGeneralRevenue AS
SELECT DISTINCT
  'General Revenue' AS category,
  CAST(LTRIM(RTRIM(b.[Lot #])) AS INT) AS lotnumber,
  LTRIM(RTRIM(b.[Lot Account #])) AS lotaccountnumber,
  LTRIM(RTRIM(b.[Lot Address])) AS lotaddress,
  a.roomnumber, a.confirmationnumber,
  a.staydate AS arrivaldate, a.staydate AS departuredate, a.staydate,
  1 AS numberofnights, a.roomtype, a.ratecode,
  a.rate AS roomrevenue,
  a.rate - (a.rate * .50) AS roomrevenueshare,
  ((a.rate * .50) * .0650) * -1 AS reservationfee,
  ((a.rate * .50) * .022) * -1 AS creditcardcommission,
  a.transactioncode, a.marketgroupcode, a.marketgroupdescription, a.reservationstatus
FROM ggrc.dbo.Casita_GeneralRevenue a
JOIN onbase.hsi.rm_vwGGRCLotRoomInformation b ON b.[Room #] = a.roomnumber
WHERE a.rate IS NOT NULL AND a.roomtype LIKE '%cas%' AND a.reservationstatus IN ('Checked Out')
UNION
SELECT DISTINCT
  'General Revenue',
  CAST(LTRIM(RTRIM(b.[Lot #])) AS INT),
  LTRIM(RTRIM(b.[Lot Account #])),
  LTRIM(RTRIM(b.[Lot Address])),
  a.roomnumber, a.confirmationnumber,
  a.staydate, a.staydate, a.staydate,
  1, a.roomtype, a.ratecode,
  a.roomrevenueadjusted,
  a.roomrevenueadjusted - (a.roomrevenueadjusted * .50),
  ((a.roomrevenueadjusted * .50) * .0650) * -1,
  ((a.roomrevenueadjusted * .50) * .022) * -1,
  a.transactioncode, a.marketgroupcode, a.marketgroupdescription, a.reservationstatus
FROM ggrc.dbo.Casita_GeneralRevenue a
JOIN onbase.hsi.rm_vwGGRCLotRoomInformation b ON b.[Room #] = a.roomnumber
WHERE a.rate IS NULL AND a.roomrevenue IS NOT NULL AND a.reservationstatus IN ('Checked Out')
UNION
SELECT DISTINCT
  'General Revenue',
  CAST(LTRIM(RTRIM(CAST(a.lotnumber AS VARCHAR(25)))) AS INT),
  LTRIM(RTRIM(b.[Lot Account #])),
  LTRIM(RTRIM(b.[Lot Address])),
  NULL, NULL,
  CONVERT(date, a.expensedate, 101), CONVERT(date, a.expensedate, 101), a.expensedate,
  NULL, NULL, NULL,
  a.expenseamount,
  a.expenseamount - (a.expenseamount * .50),
  ((a.expenseamount * .50) * .0650) * -1,
  ((a.expenseamount * .50) * .022) * -1,
  NULL, NULL, NULL, NULL
FROM dbo.vw_LotInvoiceManualAdjustmentsbyActivityDates a
JOIN onbase.hsi.rm_vwGGRCLotRoomInformation b ON b.[Lot #] = a.lotnumber
WHERE a.expensetype = 'Room Rate Adjustment'`)
console.log('Created view dbo.vw_CasitaStatementGeneralRevenue')

await pool.request().query(`
IF OBJECT_ID('dbo.AppStatementLineItems') IS NULL
CREATE TABLE dbo.AppStatementLineItems (
  LineItemID             INT IDENTITY(1,1) PRIMARY KEY,
  StatementID            INT NOT NULL REFERENCES dbo.AppStatements(StatementID) ON DELETE CASCADE,
  Category               VARCHAR(50),
  LotNumber              INT,
  RoomNumber             VARCHAR(50),
  ConfirmationNumber     VARCHAR(50),
  ArrivalDate            DATE,
  DepartureDate          DATE,
  StayDate               DATE,
  NumberOfNights         INT,
  RoomType               VARCHAR(50),
  RateCode               VARCHAR(100),
  RoomRevenue            DECIMAL(12,4),
  RoomRevenueShare       DECIMAL(12,4),
  ReservationFee         DECIMAL(12,4),
  CreditCardCommission   DECIMAL(12,4),
  TransactionCode        VARCHAR(50),
  MarketGroupCode        VARCHAR(50),
  MarketGroupDescription VARCHAR(100),
  ReservationStatus      VARCHAR(50),
  CreatedDate            DATETIME DEFAULT GETDATE()
)`)
console.log('Created table dbo.AppStatementLineItems (if not present)')

// Statements are stay-date based: align arrival/departure to the stay date on
// existing snapshots so no line shows a date outside the statement period.
const fix = await pool.request().query(`
  UPDATE dbo.AppStatementLineItems
  SET ArrivalDate = StayDate, DepartureDate = StayDate
  WHERE ArrivalDate <> StayDate OR DepartureDate <> StayDate`)
console.log('Aligned existing line-item dates to stay date:', fix.rowsAffected[0], 'rows')

// Fees are 6.5% / 2.2% of the owner's 50% split. Recompute on existing snapshots
// from the stored share so older statements match the corrected basis.
const feeFix = await pool.request().query(`
  UPDATE dbo.AppStatementLineItems
  SET ReservationFee       = RoomRevenueShare * .0650 * -1,
      CreditCardCommission = RoomRevenueShare * .022  * -1`)
console.log('Recomputed existing line-item fees on owner split:', feeFix.rowsAffected[0], 'rows')

// Smoke test: how many rows would a sample lot+range pull?
const t = await pool.request().query(`
  SELECT COUNT(*) AS n FROM dbo.vw_CasitaStatementGeneralRevenue
  WHERE lotnumber = 20 AND staydate BETWEEN '2025-01-01' AND '2025-12-31'`)
console.log(`\nSmoke test: lot 20, 2025 -> ${t.recordset[0].n} line items`)

await pool.close()
console.log('\nDone.')
