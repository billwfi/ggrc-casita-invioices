import { getPool, sql, ok, err, preflight } from './db.js'

export const config = {
  path: [
    '/api/owners', '/api/owners/:id',
    '/api/owners/:id/contacts', '/api/owners/:id/contacts/:contactId'
  ]
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') return preflight()
  const { id, contactId } = context.params ?? {}
  const url = new URL(request.url)
  const isContacts = url.pathname.includes('/contacts')

  try {
    const pool = await getPool()

    // ── Contacts ──
    if (isContacts) {
      if (request.method === 'GET') {
        const r = await pool.request()
          .input('ownerId', sql.Int, parseInt(id))
          .query('SELECT * FROM AppOwnerContacts WHERE OwnerID = @ownerId ORDER BY ContactLastName, ContactFirstName')
        return ok(r.recordset)
      }
      if (request.method === 'POST') {
        const b = await request.json()
        const r = await pool.request()
          .input('OwnerID',           sql.Int,         parseInt(id))
          .input('ContactType',       sql.VarChar(50), b.ContactType        ?? null)
          .input('OwnerSubAccountNo', sql.VarChar(50), b.OwnerSubAccountNo  ?? null)
          .input('ContactFirstName',  sql.VarChar(100),b.ContactFirstName   ?? null)
          .input('ContactLastName',   sql.VarChar(100),b.ContactLastName    ?? null)
          .input('ContactAddress',    sql.VarChar(200),b.ContactAddress     ?? null)
          .input('ContactCity',       sql.VarChar(100),b.ContactCity        ?? null)
          .input('ContactState',      sql.VarChar(2),  b.ContactState       ?? null)
          .input('ContactZip',        sql.VarChar(10), b.ContactZip         ?? null)
          .input('ContactPhone',      sql.VarChar(30), b.ContactPhone       ?? null)
          .input('ContactEmail',      sql.VarChar(200),b.ContactEmail       ?? null)
          .input('ContactNote',       sql.NVarChar(sql.MAX), b.ContactNote  ?? null)
          .query(`INSERT INTO AppOwnerContacts
                  (OwnerID,ContactType,OwnerSubAccountNo,ContactFirstName,ContactLastName,
                   ContactAddress,ContactCity,ContactState,ContactZip,ContactPhone,ContactEmail,ContactNote)
                  OUTPUT INSERTED.*
                  VALUES (@OwnerID,@ContactType,@OwnerSubAccountNo,@ContactFirstName,@ContactLastName,
                          @ContactAddress,@ContactCity,@ContactState,@ContactZip,@ContactPhone,@ContactEmail,@ContactNote)`)
        return ok(r.recordset[0], 201)
      }
      if (request.method === 'PUT' && contactId) {
        const b = await request.json()
        await pool.request()
          .input('cid',               sql.Int,         parseInt(contactId))
          .input('ContactType',       sql.VarChar(50), b.ContactType        ?? null)
          .input('OwnerSubAccountNo', sql.VarChar(50), b.OwnerSubAccountNo  ?? null)
          .input('ContactFirstName',  sql.VarChar(100),b.ContactFirstName   ?? null)
          .input('ContactLastName',   sql.VarChar(100),b.ContactLastName    ?? null)
          .input('ContactPhone',      sql.VarChar(30), b.ContactPhone       ?? null)
          .input('ContactEmail',      sql.VarChar(200),b.ContactEmail       ?? null)
          .input('ContactNote',       sql.NVarChar(sql.MAX), b.ContactNote  ?? null)
          .query(`UPDATE AppOwnerContacts SET
                  ContactType=@ContactType, OwnerSubAccountNo=@OwnerSubAccountNo,
                  ContactFirstName=@ContactFirstName, ContactLastName=@ContactLastName,
                  ContactPhone=@ContactPhone, ContactEmail=@ContactEmail, ContactNote=@ContactNote
                  WHERE ContactID=@cid`)
        return ok({ success: true })
      }
      if (request.method === 'DELETE' && contactId) {
        await pool.request()
          .input('cid', sql.Int, parseInt(contactId))
          .query('DELETE FROM AppOwnerContacts WHERE ContactID = @cid')
        return ok({ success: true })
      }
      return err('Method not allowed', 405)
    }

    // ── Owners ──
    if (request.method === 'GET') {
      const lotId = url.searchParams.get('lotId')
      if (id) {
        const r = await pool.request()
          .input('id', sql.Int, parseInt(id))
          .query('SELECT * FROM AppOwners WHERE OwnerID = @id')
        if (!r.recordset.length) return err('Not found', 404)
        return ok(r.recordset[0])
      }
      if (lotId) {
        const r = await pool.request()
          .input('lotId', sql.Int, parseInt(lotId))
          .query('SELECT * FROM AppOwners WHERE LotID = @lotId ORDER BY DateOfPurchase DESC')
        return ok(r.recordset)
      }
      const r = await pool.request().query(`
        SELECT o.*, l.LotNumber, l.LotAddress
        FROM AppOwners o
        LEFT JOIN AppLots l ON l.LotID = o.LotID
        ORDER BY o.OwnerName`)
      return ok({ data: r.recordset, total: r.recordset.length })
    }

    if (request.method === 'POST') {
      const b = await request.json()
      const r = await pool.request()
        .input('LotID',           sql.Int,           b.LotID ? parseInt(b.LotID) : null)
        .input('OwnerName',       sql.VarChar(200),  b.OwnerName       ?? null)
        .input('AccountNo',       sql.VarChar(20),   b.AccountNo       ?? null)
        .input('DateOfPurchase',  sql.Date,          b.DateOfPurchase  ? new Date(b.DateOfPurchase) : null)
        .input('OwnershipEndDate',sql.Date,          b.OwnershipEndDate ? new Date(b.OwnershipEndDate) : null)
        .input('ReserveAccount',  sql.VarChar(3),    b.ReserveAccount  ?? null)
        .input('ReserveBalance',  sql.Decimal(12,2), b.ReserveBalance  != null ? parseFloat(b.ReserveBalance) : null)
        .input('OwnerAddress',    sql.VarChar(200),  b.OwnerAddress    ?? null)
        .input('OwnerCity',       sql.VarChar(100),  b.OwnerCity       ?? null)
        .input('OwnerState',      sql.VarChar(2),    b.OwnerState      ?? null)
        .input('OwnerZip',        sql.VarChar(10),   b.OwnerZip        ?? null)
        .input('OwnerMainPhone',  sql.VarChar(30),   b.OwnerMainPhone  ?? null)
        .input('OwnerMainEmail',  sql.VarChar(200),  b.OwnerMainEmail  ?? null)
        .input('OwnerNote',       sql.NVarChar(sql.MAX), b.OwnerNote   ?? null)
        .query(`INSERT INTO AppOwners
                (LotID,OwnerName,AccountNo,DateOfPurchase,OwnershipEndDate,ReserveAccount,
                 ReserveBalance,OwnerAddress,OwnerCity,OwnerState,OwnerZip,OwnerMainPhone,OwnerMainEmail,OwnerNote)
                OUTPUT INSERTED.*
                VALUES (@LotID,@OwnerName,@AccountNo,@DateOfPurchase,@OwnershipEndDate,@ReserveAccount,
                        @ReserveBalance,@OwnerAddress,@OwnerCity,@OwnerState,@OwnerZip,@OwnerMainPhone,@OwnerMainEmail,@OwnerNote)`)
      return ok(r.recordset[0], 201)
    }

    if (request.method === 'PUT' && id) {
      const b = await request.json()
      await pool.request()
        .input('id',              sql.Int,           parseInt(id))
        .input('OwnerName',       sql.VarChar(200),  b.OwnerName       ?? null)
        .input('AccountNo',       sql.VarChar(20),   b.AccountNo       ?? null)
        .input('DateOfPurchase',  sql.Date,          b.DateOfPurchase  ? new Date(b.DateOfPurchase) : null)
        .input('OwnershipEndDate',sql.Date,          b.OwnershipEndDate ? new Date(b.OwnershipEndDate) : null)
        .input('ReserveAccount',  sql.VarChar(3),    b.ReserveAccount  ?? null)
        .input('ReserveBalance',  sql.Decimal(12,2), b.ReserveBalance  != null ? parseFloat(b.ReserveBalance) : null)
        .input('OwnerAddress',    sql.VarChar(200),  b.OwnerAddress    ?? null)
        .input('OwnerCity',       sql.VarChar(100),  b.OwnerCity       ?? null)
        .input('OwnerState',      sql.VarChar(2),    b.OwnerState      ?? null)
        .input('OwnerZip',        sql.VarChar(10),   b.OwnerZip        ?? null)
        .input('OwnerMainPhone',  sql.VarChar(30),   b.OwnerMainPhone  ?? null)
        .input('OwnerMainEmail',  sql.VarChar(200),  b.OwnerMainEmail  ?? null)
        .input('OwnerNote',       sql.NVarChar(sql.MAX), b.OwnerNote   ?? null)
        .query(`UPDATE AppOwners SET
                OwnerName=@OwnerName, AccountNo=@AccountNo, DateOfPurchase=@DateOfPurchase,
                OwnershipEndDate=@OwnershipEndDate, ReserveAccount=@ReserveAccount,
                ReserveBalance=@ReserveBalance, OwnerAddress=@OwnerAddress, OwnerCity=@OwnerCity,
                OwnerState=@OwnerState, OwnerZip=@OwnerZip, OwnerMainPhone=@OwnerMainPhone,
                OwnerMainEmail=@OwnerMainEmail, OwnerNote=@OwnerNote, UpdatedDate=GETDATE()
                WHERE OwnerID=@id`)
      return ok({ success: true })
    }

    return err('Method not allowed', 405)
  } catch (e) {
    console.error('owners:', e.message)
    return err(e.message)
  }
}
