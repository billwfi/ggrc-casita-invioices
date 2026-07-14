const { app } = require('@azure/functions')
const { getPool, sql, ok, err } = require('../db')

const RES_RATE = 0.065
const CC_RATE = 0.022

app.http('statistics', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'statistics',
  handler: async (request, context) => {
    if (request.method === 'OPTIONS') return { status: 200 }
    try {
      const pool = await getPool()
      const lotId = request.query.get('lotId')
      if (!lotId) return err('lotId is required', 400)
      const start = request.query.get('start')
      const end = request.query.get('end')
      const hasRange = !!(start && end)

      const lotRes = await pool.request()
        .input('lotId', sql.Int, parseInt(lotId))
        .query('SELECT LotNumber FROM AppLots WHERE LotID = @lotId')
      const lotNumber = lotRes.recordset[0]?.LotNumber
      if (lotNumber == null) return err('Lot not found', 404)

      const stayFilter = hasRange ? 'AND CAST(staydate AS DATE) BETWEEN @start AND @end' : ''
      const adjFilter = hasRange ? 'AND AdjustmentDate BETWEEN @start AND @end' : ''
      const bindRange = (req) => hasRange
        ? req.input('start', sql.Date, new Date(start)).input('end', sql.Date, new Date(end))
        : req

      // Rental nights by year / month / room (room rows only — excludes adjustments)
      const roomRes = await bindRange(pool.request().input('lot', sql.Int, lotNumber))
        .query(`SELECT YEAR(staydate) AS Year, MONTH(staydate) AS Month,
                       roomnumber AS RoomNumber, COUNT(*) AS TotalNights
                FROM dbo.vw_CasitaStatementGeneralRevenue
                WHERE lotnumber = @lot AND roomnumber IS NOT NULL ${stayFilter}
                GROUP BY YEAR(staydate), MONTH(staydate), roomnumber
                ORDER BY Year, Month, roomnumber`)

      // Revenue by year (room rows only)
      const revRes = await bindRange(pool.request().input('lot', sql.Int, lotNumber))
        .query(`SELECT YEAR(staydate) AS Year,
                       SUM(roomrevenue) AS Gross,
                       SUM(roomrevenueshare) AS OwnerSplit,
                       COUNT(*) AS Nights
                FROM dbo.vw_CasitaStatementGeneralRevenue
                WHERE lotnumber = @lot AND roomnumber IS NOT NULL ${stayFilter}
                GROUP BY YEAR(staydate)
                ORDER BY Year`)

      // Adjustments by year (from the manual adjustments table for this lot)
      const adjRes = await bindRange(pool.request().input('lotId', sql.Int, parseInt(lotId)))
        .query(`SELECT YEAR(AdjustmentDate) AS Year,
                       SUM(CASE WHEN Category = 'Reserve' THEN AdjustmentAmount ELSE 0 END) AS ReserveAdj,
                       SUM(CASE WHEN Category <> 'Reserve' OR Category IS NULL THEN AdjustmentAmount ELSE 0 END) AS OtherAdj
                FROM AppAdjustments
                WHERE LotID = @lotId AND AdjustmentDate IS NOT NULL ${adjFilter}
                GROUP BY YEAR(AdjustmentDate)`)
        .catch(() => ({ recordset: [] }))

      const adjByYear = {}
      for (const a of adjRes.recordset) adjByYear[a.Year] = a

      const round = (v) => Math.round((Number(v) || 0) * 100) / 100
      const RevenueStats = revRes.recordset.map(r => {
        const gross = Number(r.Gross) || 0
        const split = Number(r.OwnerSplit) || 0
        const nights = Number(r.Nights) || 0
        const adj = adjByYear[r.Year] || {}
        const reserveAdj = Number(adj.ReserveAdj) || 0
        const otherAdj = Number(adj.OtherAdj) || 0
        // Owner payout = owner split − reservation/CC fees (computed on the owner
        // split) + payout adjustments.
        const payout = split - (split * RES_RATE) - (split * CC_RATE) + otherAdj
        return {
          Year: r.Year,
          YTDGross: round(gross),
          YTDOwnerSplit: round(split),
          YTDAvgDailyRate: nights ? round(gross / nights) : 0,
          YTDReserveAdjustments: round(reserveAdj),
          YTDAdjustments: round(otherAdj),
          YTDOwnerPayout: round(payout)
        }
      })

      return ok({ RoomStats: roomRes.recordset, RevenueStats })
    } catch (e) {
      console.error('statistics:', e.message)
      return err(e.message)
    }
  }
})
