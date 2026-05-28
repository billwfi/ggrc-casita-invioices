import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api'
import DataTable from '../components/DataTable'
import Modal from '../components/Modal'

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

export default function OwnerDetail() {
  const { lotId, ownerId } = useParams()
  const navigate = useNavigate()
  const [owner, setOwner] = useState(null)
  const [lot, setLot] = useState(null)
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [contactModal, setContactModal] = useState(null)
  const [contactForm, setContactForm] = useState({})

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [ownerData, lotData, contactsData] = await Promise.all([
          api.owners.get(ownerId),
          api.lots.get(lotId),
          api.owners.contacts.list(ownerId).catch(() => [])
        ])
        setOwner(ownerData)
        setLot(lotData)
        setContacts(Array.isArray(contactsData) ? contactsData : (contactsData?.data ?? []))
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [lotId, ownerId])

  async function saveOwner() {
    setSaving(true)
    try {
      await api.owners.update(ownerId, owner)
      alert('Saved.')
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveContact() {
    try {
      if (contactForm.ContactID) {
        await api.owners.contacts.update(ownerId, contactForm.ContactID, contactForm)
      } else {
        await api.owners.contacts.create(ownerId, contactForm)
      }
      const res = await api.owners.contacts.list(ownerId)
      setContacts(Array.isArray(res) ? res : (res?.data ?? []))
      setContactModal(null)
    } catch (e) {
      alert(e.message)
    }
  }

  async function deleteContact(c) {
    if (!confirm(`Delete contact ${c.ContactFirstName} ${c.ContactLastName}?`)) return
    try {
      await api.owners.contacts.delete(ownerId, c.ContactID)
      setContacts(ct => ct.filter(x => x.ContactID !== c.ContactID))
    } catch (e) {
      alert(e.message)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading owner...</div>
  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded">{error}</div>
  if (!owner) return null

  const field = (key, label, type = 'text', opts = null) => (
    <div key={key}>
      <label className="label">{label}</label>
      {type === 'select' ? (
        <select className="input" value={owner[key] ?? ''} onChange={(e) => setOwner(o => ({ ...o, [key]: e.target.value }))}>
          <option value="">—</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea className="input" rows={3} value={owner[key] ?? ''} onChange={(e) => setOwner(o => ({ ...o, [key]: e.target.value }))} />
      ) : (
        <input type={type} className="input" value={owner[key] ?? ''} onChange={(e) => setOwner(o => ({ ...o, [key]: e.target.value }))} />
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/lots" className="hover:text-navy-700">Lots</Link>
        <span>/</span>
        <Link to={`/lots/${lotId}`} className="hover:text-navy-700">Lot #{lot?.LotNumber}</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">Owner</span>
      </div>

      <div className="card p-4">
        <div className="text-xs text-gray-500 mb-3">
          <span className="mr-4">Lot #: {lot?.LotNumber}</span>
          <span>Address: {lot?.LotAddress}</span>
        </div>

        <h1 className="text-lg font-semibold text-navy-700 mb-4">Owner Information</h1>

        <div className="grid grid-cols-2 gap-4">
          {field('OwnerName', 'Owner Name *')}
          {field('AccountNo', 'Account No *')}
          {field('DateOfPurchase', 'Date of Purchase', 'date')}
          {field('OwnershipEndDate', 'Ownership End Date', 'date')}
          {field('ReserveAccount', 'Reserve Account', 'select', ['Yes', 'No'])}
          {field('ReserveBalance', 'Reserve Balance', 'number')}
          {field('OwnerAddress', 'Owner Address')}
          {field('OwnerCity', 'City')}
          {field('OwnerState', 'State', 'select', US_STATES)}
          {field('OwnerZip', 'Zip')}
          {field('OwnerMainPhone', 'Phone')}
          {field('OwnerMainEmail', 'Email', 'email')}
          <div className="col-span-2">{field('OwnerNote', 'Notes', 'textarea')}</div>
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
          <button className="btn-secondary" onClick={() => navigate(`/lots/${lotId}`)}>Cancel</button>
          <button className="btn-primary" onClick={saveOwner} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Owner Contacts */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-700">Owner Contacts</h2>
          <button
            className="btn-primary btn-sm"
            onClick={() => { setContactForm({}); setContactModal('create') }}
          >
            + Add Contact
          </button>
        </div>
        <DataTable
          columns={[
            { key: 'ContactType', label: 'Type' },
            { key: 'OwnerSubAccountNo', label: 'Sub-Account' },
            { key: 'ContactFirstName', label: 'First Name' },
            { key: 'ContactLastName', label: 'Last Name' },
            { key: 'ContactPhone', label: 'Phone' },
            { key: 'ContactEmail', label: 'Email' }
          ]}
          rows={contacts}
          actions={(c) => (
            <>
              <button className="btn-secondary btn-sm" onClick={() => { setContactForm({ ...c }); setContactModal('edit') }}>Edit</button>
              <button className="btn-danger btn-sm" onClick={() => deleteContact(c)}>Del</button>
            </>
          )}
        />
      </div>

      {contactModal && (
        <Modal title={contactModal === 'create' ? 'New Contact' : 'Edit Contact'} onClose={() => setContactModal(null)}>
          <div className="space-y-3">
            {[
              ['ContactType', 'Contact Type'],
              ['OwnerSubAccountNo', 'Sub-Account No'],
              ['ContactFirstName', 'First Name'],
              ['ContactLastName', 'Last Name'],
              ['ContactAddress', 'Address'],
              ['ContactCity', 'City'],
              ['ContactZip', 'Zip'],
              ['ContactPhone', 'Phone'],
              ['ContactEmail', 'Email'],
              ['ContactNote', 'Notes']
            ].map(([key, label]) => (
              <div key={key}>
                <label className="label">{label}</label>
                <input
                  className="input"
                  value={contactForm[key] ?? ''}
                  onChange={(e) => setContactForm(f => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setContactModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={saveContact}>Save</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
