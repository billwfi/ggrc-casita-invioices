/**
 * Owners CRUD + contacts sub-resource.
 * Adjust TABLE, CONTACTS_TABLE, and column names to match your schema.
 */
import { getPool, sql, ok, err, preflight } from './db.js'

const TABLE = 'OwnerInformation'      // ← update if needed
const PK = 'OwnerID'
const CONTACTS_TABLE = 'OwnerContacts' // ← update if needed
const CONTACTS_PK = 'ContactID'

export const config = {
  path: [
    '/api/owners',
    '/api/owners/:id',
    '/api/owners/:id/contacts',
    '/api/owners/:id/contacts/:contactId'
  ]
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') return preflight()

  const { id, contactId } = context.params ?? {}
  const url = new URL(request.url)
  const isContacts = url.pathname.includes('/contacts')

  try {
    const pool = await getPool()

    // ── Contacts sub-resource ──
    if (isContacts) {
      if (request.method === 'GET') {
        const r = await pool.request()
          .input('ownerId', sql.Int, parseInt(id))
          .query(`SELECT * FROM ${CONTACTS_TABLE} WHERE ${PK} = @ownerId ORDER BY ContactLastName`)
        return ok(r.recordset)
      }

      if (request.method === 'POST') {
        const b = await request.json()
        const r = await pool.request()
          .input('ownerId', sql.Int, parseInt(id))
          .input('ContactType', sql.NVarChar(50), b.ContactType ?? null)
          .input('OwnerSubAccountNo', sql.NVarChar(50), b.OwnerSubAccountNo ?? null)
          .input('ContactFirstName', sql.NVarChar(100), b.ContactFirstName ?? null)
          .input('ContactLastName', sql.NVarChar(100), b.ContactLastName ?? null)
          .input('ContactAddress', sql.NVarChar(200), b.ContactAddress ?? null)
          .input('ContactCity', sql.NVarChar(100), b.ContactCity ?? null)
          .input('ContactState', sql.NVarChar(2), b.ContactState ?? null)
          .input('ContactZip', sql.NVarChar(10), b.ContactZip ?? null)
          .input('ContactPhone', sql.NVarChar(30), b.ContactPhone ?? null)
          .input('ContactEmail', sql.NVarChar(200), b.ContactEmail ?? null)
          .input('ContactNote', sql.NVarChar(sql.MAX), b.ContactNote ?? null)
          .query(`INSERT INTO ${CONTACTS_TABLE}
                  (${PK}, ContactType, OwnerSubAccountNo, ContactFirstName, ContactLastName,
                   ContactAddress, ContactCity, ContactState, ContactZip, ContactPhone, ContactEmail, ContactNote)
                  OUTPUT INSERTED.*
                  VALUES (@ownerId, @ContactType, @OwnerSubAccountNo, @ContactFirstName, @ContactLastName,
                          @ContactAddress, @ContactCity, @ContactState, @ContactZip, @ContactPhone, @ContactEmail, @ContactNote)`)
        return ok(r.recordset[0], 201)
      }

      if (request.method === 'PUT' && contactId) {
        const b = await request.json()
        await pool.request()
          .input('contactId', sql.Int, parseInt(contactId))
          .input('ContactType', sql.NVarChar(50), b.ContactType ?? null)
          .input('OwnerSubAccountNo', sql.NVarChar(50), b.OwnerSubAccountNo ?? null)
          .input('ContactFirstName', sql.NVarChar(100), b.ContactFirstName ?? null)
          .input('ContactLastName', sql.NVarChar(100), b.ContactLastName ?? null)
          .input('ContactPhone', sql.NVarChar(30), b.ContactPhone ?? null)
          .input('ContactEmail', sql.NVarChar(200), b.ContactEmail ?? null)
          .input('ContactNote', sql.NVarChar(sql.MAX), b.ContactNote ?? null)
          .query(`UPDATE ${CONTACTS_TABLE} SET ContactType=@ContactType, OwnerSubAccountNo=@OwnerSubAccountNo,
                  ContactFirstName=@ContactFirstName, ContactLastName=@ContactLastName,
                  ContactPhone=@ContactPhone, ContactEmail=@ContactEmail, ContactNote=@ContactNote
                  WHERE ${CONTACTS_PK}=@contactId`)
        return ok({ success: true })
      }

      if (request.method === 'DELETE' && contactId) {
        await pool.request()
          .input('contactId', sql.Int, parseInt(contactId))
          .query(`DELETE FROM ${CONTACTS_TABLE} WHERE ${CONTACTS_PK} = @contactId`)
        return ok({ success: true })
      }

      return err('Method not allowed', 405)
    }

    // ── Owner resource ──
    if (request.method === 'GET') {
      const lotId = url.searchParams.get('lotId')

      if (id && !lotId) {
        const r = await pool.request()
          .input('id', sql.Int, parseInt(id))
          .query(`SELECT * FROM ${TABLE} WHERE ${PK} = @id`)
        if (!r.recordset.length) return err('Not found', 404)
        return ok(r.recordset[0])
      }

      if (lotId) {
        const r = await pool.request()
          .input('lotId', sql.Int, parseInt(lotId))
          .query(`SELECT * FROM ${TABLE} WHERE LotID = @lotId ORDER BY DateOfPurchase DESC`)
        return ok(r.recordset)
      }

      const r = await pool.request()
        .query(`SELECT * FROM ${TABLE} ORDER BY OwnerName`)
      return ok({ data: r.recordset, total: r.recordset.length })
    }

    if (request.method === 'POST') {
      const b = await request.json()
      const r = await pool.request()
        .input('LotID', sql.Int, b.LotID ? parseInt(b.LotID) : null)
        .input('OwnerName', sql.NVarChar(200), b.OwnerName ?? null)
        .input('AccountNo', sql.NVarChar(50), b.AccountNo ?? null)
        .input('DateOfPurchase', sql.Date, b.DateOfPurchase ? new Date(b.DateOfPurchase) : null)
        .input('OwnershipEndDate', sql.Date, b.OwnershipEndDate ? new Date(b.OwnershipEndDate) : null)
        .input('ReserveAccount', sql.NVarChar(3), b.ReserveAccount ?? null)
        .input('ReserveBalance', sql.Decimal(10, 2), b.ReserveBalance ? parseFloat(b.ReserveBalance) : null)
        .input('OwnerAddress', sql.NVarChar(200), b.OwnerAddress ?? null)
        .input('OwnerCity', sql.NVarChar(100), b.OwnerCity ?? null)
        .input('OwnerState', sql.NVarChar(2), b.OwnerState ?? null)
        .input('OwnerZip', sql.NVarChar(10), b.OwnerZip ?? null)
        .input('OwnerMainPhone', sql.NVarChar(30), b.OwnerMainPhone ?? null)
        .input('OwnerMainEmail', sql.NVarChar(200), b.OwnerMainEmail ?? null)
        .input('OwnerNote', sql.NVarChar(sql.MAX), b.OwnerNote ?? null)
        .query(`INSERT INTO ${TABLE}
                (LotID, OwnerName, AccountNo, DateOfPurchase, OwnershipEndDate, ReserveAccount, ReserveBalance,
                 OwnerAddress, OwnerCity, OwnerState, OwnerZip, OwnerMainPhone, OwnerMainEmail, OwnerNote)
                OUTPUT INSERTED.*
                VALUES (@LotID, @OwnerName, @AccountNo, @DateOfPurchase, @OwnershipEndDate, @ReserveAccount,
                        @ReserveBalance, @OwnerAddress, @OwnerCity, @OwnerState, @OwnerZip,
                        @OwnerMainPhone, @OwnerMainEmail, @OwnerNote)`)
      return ok(r.recordset[0], 201)
    }

    if (request.method === 'PUT' && id) {
      const b = await request.json()
      await pool.request()
        .input('id', sql.Int, parseInt(id))
        .input('OwnerName', sql.NVarChar(200), b.OwnerName ?? null)
        .input('AccountNo', sql.NVarChar(50), b.AccountNo ?? null)
        .input('DateOfPurchase', sql.Date, b.DateOfPurchase ? new Date(b.DateOfPurchase) : null)
        .input('OwnershipEndDate', sql.Date, b.OwnershipEndDate ? new Date(b.OwnershipEndDate) : null)
        .input('ReserveAccount', sql.NVarChar(3), b.ReserveAccount ?? null)
        .input('ReserveBalance', sql.Decimal(10, 2), b.ReserveBalance ? parseFloat(b.ReserveBalance) : null)
        .input('OwnerAddress', sql.NVarChar(200), b.OwnerAddress ?? null)
        .input('OwnerCity', sql.NVarChar(100), b.OwnerCity ?? null)
        .input('OwnerState', sql.NVarChar(2), b.OwnerState ?? null)
        .input('OwnerZip', sql.NVarChar(10), b.OwnerZip ?? null)
        .input('OwnerMainPhone', sql.NVarChar(30), b.OwnerMainPhone ?? null)
        .input('OwnerMainEmail', sql.NVarChar(200), b.OwnerMainEmail ?? null)
        .input('OwnerNote', sql.NVarChar(sql.MAX), b.OwnerNote ?? null)
        .query(`UPDATE ${TABLE} SET OwnerName=@OwnerName, AccountNo=@AccountNo, DateOfPurchase=@DateOfPurchase,
                OwnershipEndDate=@OwnershipEndDate, ReserveAccount=@ReserveAccount, ReserveBalance=@ReserveBalance,
                OwnerAddress=@OwnerAddress, OwnerCity=@OwnerCity, OwnerState=@OwnerState, OwnerZip=@OwnerZip,
                OwnerMainPhone=@OwnerMainPhone, OwnerMainEmail=@OwnerMainEmail, OwnerNote=@OwnerNote
                WHERE ${PK}=@id`)
      return ok({ success: true })
    }

    return err('Method not allowed', 405)
  } catch (e) {
    console.error('owners:', e.message)
    return err(e.message)
  }
}
