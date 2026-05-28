import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api } from '../api'

const ROOM_TYPES = ['QCAS', 'KCAS', 'DQCAS', 'SUITE', 'OTHER']

export default function RoomDetail() {
  const { lotId, roomId } = useParams()
  const navigate = useNavigate()
  const [room, setRoom] = useState(null)
  const [lot, setLot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [roomData, lotData] = await Promise.all([
          api.rooms.get(roomId),
          api.lots.get(lotId)
        ])
        setRoom(roomData)
        setLot(lotData)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [lotId, roomId])

  async function save() {
    setSaving(true)
    try {
      await api.rooms.update(roomId, room)
      alert('Saved.')
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading room...</div>
  if (error) return <div className="p-4 bg-red-50 text-red-700 rounded">{error}</div>
  if (!room) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/lots" className="hover:text-navy-700">Lots</Link>
        <span>/</span>
        <Link to={`/lots/${lotId}`} className="hover:text-navy-700">Lot #{lot?.LotNumber}</Link>
        <span>/</span>
        <span className="text-gray-800 font-medium">Room {room.RoomNumber}</span>
      </div>

      <div className="card p-4 max-w-lg">
        <div className="text-xs text-gray-500 mb-3">
          <span className="mr-4">Lot #: {lot?.LotNumber}</span>
          <span className="mr-4">Account No: {lot?.AccountNo}</span>
          <span>Address: {lot?.LotAddress}</span>
        </div>

        <h1 className="text-lg font-semibold text-navy-700 mb-4">Lot Room Information</h1>

        <div className="space-y-3">
          <div>
            <label className="label">Room # *</label>
            <input className="input" value={room.RoomNumber ?? ''} onChange={(e) => setRoom(r => ({ ...r, RoomNumber: e.target.value }))} />
          </div>
          <div>
            <label className="label">Room Type</label>
            <select className="input" value={room.RoomType ?? ''} onChange={(e) => setRoom(r => ({ ...r, RoomType: e.target.value }))}>
              <option value="">—</option>
              {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Room Note</label>
            <textarea className="input" rows={3} value={room.RoomNote ?? ''} onChange={(e) => setRoom(r => ({ ...r, RoomNote: e.target.value }))} />
          </div>
        </div>

        <div className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
          Created by: {room.CreatedBy ?? '—'} &nbsp;|&nbsp; {room.CreatedDateTime ? new Date(room.CreatedDateTime).toLocaleString() : '—'}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={() => navigate(`/lots/${lotId}`)}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
