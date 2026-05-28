import sql from 'mssql'

const config = {
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || '1433'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 20000,
    requestTimeout: 30000
  }
}

let poolPromise = null

export function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect()
      .catch(err => { poolPromise = null; throw err })
  }
  return poolPromise
}

export const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

export function ok(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS })
}

export function err(message, status = 500) {
  return new Response(JSON.stringify({ error: message }), { status, headers: HEADERS })
}

export function preflight() {
  return new Response(null, { status: 200, headers: HEADERS })
}

export { sql }
