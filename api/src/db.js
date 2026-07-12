const sql = require('mssql')

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

function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect()
      .catch(err => { poolPromise = null; throw err })
  }
  return poolPromise
}

function ok(data, status = 200) {
  return { status, jsonBody: data }
}

function err(message, status = 500) {
  return { status, jsonBody: { error: message } }
}

module.exports = { getPool, sql, ok, err }
