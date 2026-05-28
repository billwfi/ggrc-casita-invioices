const BASE = '/.netlify/functions'

async function handle(res) {
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch { data = { error: text } }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

function get(path) {
  return fetch(`${BASE}/${path}`).then(handle)
}

function post(path, body) {
  return fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(handle)
}

function put(path, body) {
  return fetch(`${BASE}/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(handle)
}

function del(path) {
  return fetch(`${BASE}/${path}`, { method: 'DELETE' }).then(handle)
}

export const api = {
  schema: {
    tables: () => get('schema'),
    columns: (table) => get(`schema?table=${encodeURIComponent(table)}`)
  },
  lots: {
    list: (params = {}) => get(`lots?${new URLSearchParams(params)}`),
    get: (id) => get(`lots/${id}`),
    create: (data) => post('lots', data),
    update: (id, data) => put(`lots/${id}`, data),
    delete: (id) => del(`lots/${id}`)
  },
  owners: {
    getByLot: (lotId) => get(`owners?lotId=${lotId}`),
    get: (id) => get(`owners/${id}`),
    create: (data) => post('owners', data),
    update: (id, data) => put(`owners/${id}`, data),
    contacts: {
      list: (ownerId) => get(`owners/${ownerId}/contacts`),
      create: (ownerId, data) => post(`owners/${ownerId}/contacts`, data),
      update: (ownerId, contactId, data) => put(`owners/${ownerId}/contacts/${contactId}`, data),
      delete: (ownerId, contactId) => del(`owners/${ownerId}/contacts/${contactId}`)
    }
  },
  rooms: {
    getByLot: (lotId) => get(`rooms?lotId=${lotId}`),
    get: (id) => get(`rooms/${id}`),
    create: (data) => post('rooms', data),
    update: (id, data) => put(`rooms/${id}`, data),
    delete: (id) => del(`rooms/${id}`)
  },
  statements: {
    getByLot: (lotId) => get(`statements?lotId=${lotId}`),
    get: (id) => get(`statements/${id}`),
    create: (data) => post('statements', data)
  },
  adjustments: {
    getByStatement: (statementId) => get(`adjustments?statementId=${statementId}`),
    create: (data) => post('adjustments', data),
    update: (id, data) => put(`adjustments/${id}`, data),
    delete: (id) => del(`adjustments/${id}`)
  },
  reports: {
    run: (type, params = {}) => get(`reports?type=${type}&${new URLSearchParams(params)}`)
  },
  setup: {
    expenseTypes: {
      list: () => get('setup'),
      create: (data) => post('setup', data),
      update: (id, data) => put(`setup/${id}`, data),
      delete: (id) => del(`setup/${id}`)
    }
  }
}
