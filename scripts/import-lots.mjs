/**
 * Imports lot records from onbase.hsi.rm_vwLotInformation into dbo.AppLots.
 * Idempotent upsert keyed on LotNumber: updates existing lots with the latest
 * source values and inserts any new ones. Safe to re-run.
 */
import sql from 'mssql'

const config = {
  server: '64.27.41.252', port: 1433, user: 'claudeservices',
  password: 'Bunk?pjb8hah', database: 'GGRC',
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true, connectTimeout: 30000, requestTimeout: 60000 }
}
const pool = await new sql.ConnectionPool(config).connect()
console.log('Connected\n')

const before = (await pool.request().query('SELECT COUNT(*) AS n FROM AppLots')).recordset[0].n

const r = await pool.request().query(`
  MERGE dbo.AppLots AS tgt
  USING (
    SELECT
      CAST(TRIM([Lot #]) AS INT)        AS LotNumber,
      NULLIF(TRIM([Account No]), '')    AS AccountNo,
      NULLIF(TRIM([Lot Address]), '')   AS LotAddress,
      NULLIF(TRIM([Lot City]), '')      AS LotCity,
      LEFT(NULLIF(TRIM([Lot State]),''), 2) AS LotState,
      CASE
        WHEN LEN(TRIM([Lot Zip])) = 9 AND RIGHT(TRIM([Lot Zip]),4) = '0000'
          THEN LEFT(TRIM([Lot Zip]),5)
        WHEN LEN(TRIM([Lot Zip])) = 9
          THEN LEFT(TRIM([Lot Zip]),5) + '-' + RIGHT(TRIM([Lot Zip]),4)
        ELSE NULLIF(TRIM([Lot Zip]), '')
      END                               AS LotZip
    FROM onbase.hsi.rm_vwLotInformation
    WHERE ISNUMERIC(TRIM([Lot #])) = 1
  ) AS src
  ON tgt.LotNumber = src.LotNumber
  WHEN MATCHED AND (
       ISNULL(tgt.AccountNo,'')  <> ISNULL(src.AccountNo,'')
    OR ISNULL(tgt.LotAddress,'') <> ISNULL(src.LotAddress,'')
    OR ISNULL(tgt.LotCity,'')    <> ISNULL(src.LotCity,'')
    OR ISNULL(tgt.LotState,'')   <> ISNULL(src.LotState,'')
    OR ISNULL(tgt.LotZip,'')     <> ISNULL(src.LotZip,'')
  ) THEN UPDATE SET
       tgt.AccountNo   = src.AccountNo,
       tgt.LotAddress  = src.LotAddress,
       tgt.LotCity     = src.LotCity,
       tgt.LotState    = src.LotState,
       tgt.LotZip      = src.LotZip,
       tgt.UpdatedDate = GETDATE()
  WHEN NOT MATCHED BY TARGET THEN
    INSERT (LotNumber, AccountNo, LotAddress, LotCity, LotState, LotZip)
    VALUES (src.LotNumber, src.AccountNo, src.LotAddress, src.LotCity, src.LotState, src.LotZip)
  OUTPUT $action AS action;`)

const inserted = r.recordset.filter(x => x.action === 'INSERT').length
const updated  = r.recordset.filter(x => x.action === 'UPDATE').length
const after = (await pool.request().query('SELECT COUNT(*) AS n FROM AppLots')).recordset[0].n

console.log(`Inserted: ${inserted}`)
console.log(`Updated:  ${updated}`)
console.log(`AppLots rows: ${before} -> ${after}`)

await pool.close()
console.log('\nDone.')
