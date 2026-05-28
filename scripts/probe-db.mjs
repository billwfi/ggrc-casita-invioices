import sql from 'mssql'

const config = {
  server: '64.27.41.252', port: 1433, user: 'claudeservices',
  password: 'Bunk?pjb8hah', database: 'GGRC',
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true, connectTimeout: 20000 }
}
const pool = await new sql.ConnectionPool(config).connect()
console.log('Connected\n')

// 1. Owner info
const owners = await pool.request().query('SELECT * FROM vw_OwnerInformation ORDER BY lotno, dateofpurchase')
console.log('=== vw_OwnerInformation (' + owners.recordset.length + ' rows) ===')
console.log(JSON.stringify(owners.recordset.slice(0, 5), null, 2))

// 2. Try the OnBase room view
try {
  const rooms = await pool.request().query(
    'SELECT TOP 10 * FROM onbase.hsi.rm_vwGGRCLotRoomInformation ORDER BY [Lot #], [Room #]')
  console.log('\n=== rm_vwGGRCLotRoomInformation sample ===')
  console.log(JSON.stringify(rooms.recordset, null, 2))
} catch(e) {
  console.log('\nCannot query rm_vwGGRCLotRoomInformation: ' + e.message)
}

// 3. Try OnBase lot object directly
try {
  const lots = await pool.request().query(
    `SELECT TOP 5 objectid, attr4497 as lotnumber
     FROM OnBase.hsi.rmobjectinstance1316 WHERE activestatus=0`)
  console.log('\n=== OnBase Lots sample ===')
  console.log(JSON.stringify(lots.recordset, null, 2))
} catch(e) {
  console.log('\nCannot query OnBase.hsi.rmobjectinstance1316: ' + e.message)
}

// 4. Check canaries: can we create tables?
try {
  await pool.request().query(`
    IF OBJECT_ID('dbo._canary_test') IS NOT NULL DROP TABLE dbo._canary_test;
    CREATE TABLE dbo._canary_test (id INT);
    DROP TABLE dbo._canary_test;`)
  console.log('\nCAN CREATE TABLES in GGRC')
} catch(e) {
  console.log('\nCannot create tables: ' + e.message)
}

// 5. Sample the live invoice summary to understand data shape
try {
  const summary = await pool.request().query(
    `SELECT TOP 10 lotnumber, ownername, invoiceactivitystartdate, invoiceactivityenddate,
     gross, ownersplit, ownerpayoutfindal
     FROM vw_LotInvoiceSummarybyActivityDates_new
     ORDER BY invoiceactivitystartdate DESC, lotnumber`)
  console.log('\n=== vw_LotInvoiceSummarybyActivityDates_new sample ===')
  console.log(JSON.stringify(summary.recordset, null, 2))
} catch(e) {
  console.log('\nCannot query summary view: ' + e.message)
}

await pool.close()
