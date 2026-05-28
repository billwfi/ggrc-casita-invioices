/**
 * Creates all AppXxx application tables in the GGRC database and seeds them
 * from the existing OnBase data + casita_generalrevenue source table.
 * Safe to re-run: uses IF NOT EXISTS guards on table creation and checks
 * row counts before seeding.
 */
import sql from 'mssql'

const config = {
  server: '64.27.41.252', port: 1433, user: 'claudeservices',
  password: 'Bunk?pjb8hah', database: 'GGRC',
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true, connectTimeout: 30000, requestTimeout: 60000 }
}

const pool = await new sql.ConnectionPool(config).connect()
console.log('Connected\n')

async function run(label, sql_) {
  process.stdout.write(`${label}... `)
  try {
    const r = await pool.request().query(sql_)
    const rows = r.rowsAffected?.[0] ?? '?'
    console.log(`OK (${rows} rows)`)
    return r
  } catch (e) {
    console.log(`ERROR: ${e.message}`)
    throw e
  }
}

// ─── DDL ────────────────────────────────────────────────────────────────────

await run('Create AppLots', `
  IF OBJECT_ID('dbo.AppLots') IS NULL
  CREATE TABLE dbo.AppLots (
    LotID       INT IDENTITY(1,1) PRIMARY KEY,
    LotNumber   INT NOT NULL,
    AccountNo   VARCHAR(20),
    LotAddress  VARCHAR(200),
    LotCity     VARCHAR(100) DEFAULT 'Colorado Springs',
    LotState    VARCHAR(2)   DEFAULT 'CO',
    LotZip      VARCHAR(10)  DEFAULT '80904',
    CreatedDate DATETIME     DEFAULT GETDATE(),
    UpdatedDate DATETIME     DEFAULT GETDATE()
  )`)

await run('Create AppOwners', `
  IF OBJECT_ID('dbo.AppOwners') IS NULL
  CREATE TABLE dbo.AppOwners (
    OwnerID          INT IDENTITY(1,1) PRIMARY KEY,
    LotID            INT REFERENCES dbo.AppLots(LotID),
    OnBaseRecordNo   VARCHAR(20),
    OwnerName        VARCHAR(200),
    AccountNo        VARCHAR(20),
    DateOfPurchase   DATE,
    OwnershipEndDate DATE,
    ReserveAccount   VARCHAR(3),
    ReserveBalance   DECIMAL(12,2),
    OwnerAddress     VARCHAR(200),
    OwnerCity        VARCHAR(100),
    OwnerState       VARCHAR(2),
    OwnerZip         VARCHAR(10),
    OwnerMainPhone   VARCHAR(30),
    OwnerMainEmail   VARCHAR(200),
    OwnerNote        NVARCHAR(MAX),
    CreatedDate      DATETIME DEFAULT GETDATE(),
    UpdatedDate      DATETIME DEFAULT GETDATE()
  )`)

await run('Create AppOwnerContacts', `
  IF OBJECT_ID('dbo.AppOwnerContacts') IS NULL
  CREATE TABLE dbo.AppOwnerContacts (
    ContactID        INT IDENTITY(1,1) PRIMARY KEY,
    OwnerID          INT REFERENCES dbo.AppOwners(OwnerID),
    ContactType      VARCHAR(50),
    OwnerSubAccountNo VARCHAR(50),
    ContactFirstName VARCHAR(100),
    ContactLastName  VARCHAR(100),
    ContactAddress   VARCHAR(200),
    ContactCity      VARCHAR(100),
    ContactState     VARCHAR(2),
    ContactZip       VARCHAR(10),
    ContactPhone     VARCHAR(30),
    ContactEmail     VARCHAR(200),
    ContactNote      NVARCHAR(MAX),
    CreatedBy        VARCHAR(100),
    CreatedDate      DATETIME DEFAULT GETDATE()
  )`)

await run('Create AppRooms', `
  IF OBJECT_ID('dbo.AppRooms') IS NULL
  CREATE TABLE dbo.AppRooms (
    RoomID      INT IDENTITY(1,1) PRIMARY KEY,
    LotID       INT REFERENCES dbo.AppLots(LotID),
    RoomNumber  VARCHAR(20) NOT NULL,
    RoomType    VARCHAR(20),
    RoomNote    NVARCHAR(MAX),
    CreatedBy   VARCHAR(100),
    CreatedDate DATETIME DEFAULT GETDATE()
  )`)

await run('Create AppStatements', `
  IF OBJECT_ID('dbo.AppStatements') IS NULL
  CREATE TABLE dbo.AppStatements (
    StatementID        INT IDENTITY(1,1) PRIMARY KEY,
    LotID              INT REFERENCES dbo.AppLots(LotID),
    OnBaseObjectID     VARCHAR(20),
    StatementNumber    VARCHAR(50),
    StatementDate      DATE,
    ActivityStartDate  DATE,
    ActivityEndDate    DATE,
    StatementNote      NVARCHAR(MAX),
    CreatedDate        DATETIME DEFAULT GETDATE()
  )`)

await run('Create AppAdjustments', `
  IF OBJECT_ID('dbo.AppAdjustments') IS NULL
  CREATE TABLE dbo.AppAdjustments (
    AdjustmentID     INT IDENTITY(1,1) PRIMARY KEY,
    StatementID      INT NULL REFERENCES dbo.AppStatements(StatementID),
    LotID            INT REFERENCES dbo.AppLots(LotID),
    OnBaseRecordNo   VARCHAR(20),
    Category         VARCHAR(100),
    AdjustmentType   VARCHAR(100),
    AdjustmentName   VARCHAR(200),
    AdjustmentDate   DATE,
    AdjustmentAmount DECIMAL(12,2),
    AdjustmentNote   NVARCHAR(MAX),
    CreatedBy        VARCHAR(100),
    CreatedDate      DATETIME DEFAULT GETDATE()
  )`)

await run('Create AppOwnerExpenseTypes', `
  IF OBJECT_ID('dbo.AppOwnerExpenseTypes') IS NULL
  CREATE TABLE dbo.AppOwnerExpenseTypes (
    ExpenseTypeID       INT IDENTITY(1,1) PRIMARY KEY,
    CategoryName        VARCHAR(100) NOT NULL,
    ExpenseDescription  VARCHAR(500),
    IsActive            BIT DEFAULT 1,
    CreatedDate         DATETIME DEFAULT GETDATE()
  )`)

// ─── SEED ────────────────────────────────────────────────────────────────────

// Lots — from OnBase room info view (DISTINCT per lot)
const lotsCount = await pool.request().query('SELECT COUNT(*) AS n FROM AppLots')
if (lotsCount.recordset[0].n === 0) {
  await run('Seed AppLots', `
    INSERT INTO AppLots (LotNumber, AccountNo, LotAddress, LotCity, LotState, LotZip)
    SELECT DISTINCT
      CAST(TRIM(r.[Lot #])         AS INT),
      TRIM(r.[Lot Account #]),
      TRIM(r.[Lot Address]),
      'Colorado Springs', 'CO', '80904'
    FROM onbase.hsi.rm_vwGGRCLotRoomInformation r
    WHERE ISNUMERIC(TRIM(r.[Lot #])) = 1`)
} else {
  console.log(`Seed AppLots... SKIPPED (${lotsCount.recordset[0].n} rows already)`)
}

// Owners — from vw_OwnerInformation
const ownersCount = await pool.request().query('SELECT COUNT(*) AS n FROM AppOwners')
if (ownersCount.recordset[0].n === 0) {
  await run('Seed AppOwners', `
    INSERT INTO AppOwners (LotID, OnBaseRecordNo, OwnerName, AccountNo,
      DateOfPurchase, OwnershipEndDate, ReserveAccount, ReserveBalance,
      OwnerAddress, OwnerCity, OwnerState, OwnerZip, OwnerMainPhone, OwnerMainEmail)
    SELECT
      l.LotID,
      CAST(o.recordno AS VARCHAR(20)),
      TRIM(o.ownername),
      TRIM(o.accountno),
      CAST(o.dateofpurchase AS DATE),
      CASE WHEN o.ownershipenddate IS NOT NULL THEN CAST(o.ownershipenddate AS DATE) ELSE NULL END,
      TRIM(o.reserveaccountyesno),
      o.reservestartingbalance,
      NULLIF(TRIM(o.owneraddress), ''),
      NULLIF(TRIM(o.ownercity), ''),
      NULLIF(TRIM(o.ownerstate), ''),
      CASE
        WHEN LEN(TRIM(o.ownerzip)) = 9 THEN LEFT(TRIM(o.ownerzip),5) + '-' + RIGHT(TRIM(o.ownerzip),4)
        ELSE NULLIF(TRIM(o.ownerzip), '')
      END,
      NULLIF(TRIM(o.ownermainphonenumber), ''),
      NULLIF(TRIM(o.ownermainemail), '')
    FROM dbo.vw_OwnerInformation o
    JOIN dbo.AppLots l ON l.LotNumber = CAST(o.lotno AS INT)`)
} else {
  console.log(`Seed AppOwners... SKIPPED (${ownersCount.recordset[0].n} rows already)`)
}

// Rooms — from OnBase room info view
const roomsCount = await pool.request().query('SELECT COUNT(*) AS n FROM AppRooms')
if (roomsCount.recordset[0].n === 0) {
  await run('Seed AppRooms', `
    INSERT INTO AppRooms (LotID, RoomNumber, RoomType)
    SELECT DISTINCT
      l.LotID,
      TRIM(r.[Room #]),
      NULLIF(TRIM(r.[Room Type]), '')
    FROM onbase.hsi.rm_vwGGRCLotRoomInformation r
    JOIN dbo.AppLots l ON l.LotNumber = CAST(TRIM(r.[Lot #]) AS INT)
    WHERE ISNUMERIC(TRIM(r.[Lot #])) = 1`)
} else {
  console.log(`Seed AppRooms... SKIPPED (${roomsCount.recordset[0].n} rows already)`)
}

// Statements — from OnBase invoice objects
const stmtCount = await pool.request().query('SELECT COUNT(*) AS n FROM AppStatements')
if (stmtCount.recordset[0].n === 0) {
  await run('Seed AppStatements', `
    INSERT INTO AppStatements (LotID, OnBaseObjectID, StatementNumber, StatementDate, ActivityStartDate, ActivityEndDate)
    SELECT DISTINCT
      l.LotID,
      CAST(s.objectid AS VARCHAR(20)),
      'LOT' + CAST(l.LotNumber AS VARCHAR) + '-' + FORMAT(CAST(s.attr4569 AS DATE), 'yyyyMM'),
      CAST(s.attr4570 AS DATE),
      CAST(s.attr4569 AS DATE),
      CAST(s.attr4570 AS DATE)
    FROM OnBase.hsi.rmobjectinstance1323 s
    JOIN dbo.AppLots l ON l.LotNumber = CAST(s.attr4603 AS INT)
    WHERE s.activestatus = 0
      AND s.attr4569 IS NOT NULL
      AND s.attr4570 IS NOT NULL
      AND s.attr4603 IS NOT NULL`)
} else {
  console.log(`Seed AppStatements... SKIPPED (${stmtCount.recordset[0].n} rows already)`)
}

// Adjustments — from OnBase lot manual expense objects
const adjCount = await pool.request().query('SELECT COUNT(*) AS n FROM AppAdjustments')
if (adjCount.recordset[0].n === 0) {
  await run('Seed AppAdjustments', `
    INSERT INTO AppAdjustments (StatementID, LotID, OnBaseRecordNo, Category, AdjustmentType, AdjustmentName, AdjustmentDate, AdjustmentAmount)
    SELECT
      -- match to the statement whose date range contains this adjustment date
      (SELECT TOP 1 st.StatementID
       FROM AppStatements st
       WHERE st.LotID = l.LotID
         AND CAST(a.attr4703 AS DATE) BETWEEN st.ActivityStartDate AND st.ActivityEndDate),
      l.LotID,
      CAST(a.attr4701 AS VARCHAR(20)),
      CASE a.attr4702
        WHEN 'Replacement FF&E' THEN 'Reserve'
        WHEN 'Reserve Adjustment' THEN 'Reserve'
        WHEN 'Room Rate Adjustment' THEN 'Room Rate'
        ELSE 'Owner Payout'
      END,
      CAST(a.attr4702 AS VARCHAR(100)),
      NULLIF(CAST(a.attr4708 AS VARCHAR(200)), ''),
      CAST(a.attr4703 AS DATE),
      CAST(a.attr4704 AS DECIMAL(12,2))
    FROM OnBase.hsi.rmobjectinstance1334 a
    JOIN OnBase.hsi.rmobjectinstance1316 lot ON lot.objectid = a.fk5240 AND lot.activestatus = 0
    JOIN dbo.AppLots l ON l.LotNumber = CAST(lot.attr4497 AS INT)
    WHERE a.activestatus = 0
      AND a.attr4703 IS NOT NULL
      AND a.attr4704 IS NOT NULL`)
} else {
  console.log(`Seed AppAdjustments... SKIPPED (${adjCount.recordset[0].n} rows already)`)
}

// Expense Types — static lookup
const etCount = await pool.request().query('SELECT COUNT(*) AS n FROM AppOwnerExpenseTypes')
if (etCount.recordset[0].n === 0) {
  await run('Seed AppOwnerExpenseTypes', `
    INSERT INTO AppOwnerExpenseTypes (CategoryName, ExpenseDescription, IsActive) VALUES
    ('Standard Monthly',   'Monthly cable/internet ($62) and maintenance/cleaning ($150) fees', 1),
    ('Linen Restocking',   'Linen restocking expense', 1),
    ('Maintenance & Repair','Maintenance and repair charges', 1),
    ('Room Rate Adjustment','Adjustment to room rate revenue', 1),
    ('Replacement FF&E',   'Furniture, fixtures and equipment replacement (goes to reserve)', 1),
    ('Reserve Adjustment', 'Reserve account adjustment', 1),
    ('Other',              'Other owner expense', 1)`)
} else {
  console.log(`Seed AppOwnerExpenseTypes... SKIPPED (${etCount.recordset[0].n} rows already)`)
}

// ─── SUMMARY ────────────────────────────────────────────────────────────────
console.log('\n=== Row counts ===')
for (const t of ['AppLots','AppOwners','AppOwnerContacts','AppRooms','AppStatements','AppAdjustments','AppOwnerExpenseTypes']) {
  const r = await pool.request().query(`SELECT COUNT(*) AS n FROM ${t}`)
  console.log(`  ${t}: ${r.recordset[0].n}`)
}

await pool.close()
console.log('\nDone.')
