const { app } = require('@azure/functions')
const fs = require('fs')
const path = require('path')
const { EmailClient } = require('@azure/communication-email')
const { getPool, sql, ok, err } = require('../db')
const { getStatementPayload } = require('../statementSummary')
const { buildStatementPdf, cur, fmtDate } = require('../statementPdf')

const CONTACT_NAME = 'Amy Giblin'
const CONTACT_EMAIL = 'amy.giblin@gardenofthegodsresort.com'
const LOGO_PATH = path.join(__dirname, '..', 'assets', 'ggrc-logo.png')
const LOGO_CID = 'ggrc-logo'

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Inline styles only — email clients strip <style> blocks and ignore external CSS.
// logoSrc differs by destination: the sent mail references the inline CID
// attachment, while the in-app preview points at the hosted asset so a browser
// can actually render it.
function buildHtml(payload, owner, lot, logoSrc = `cid:${LOGO_CID}`) {
  const s = payload.Summary || {}
  const period = `${fmtDate(payload.ActivityStartDate)} – ${fmtDate(payload.ActivityEndDate)}`
  const rows = [
    ['Gross Revenue', s.GrossRevenue],
    ['50% Owner Split', s.OwnerSplit],
    ['6.5% Reservation Fee', s.ReservationFee],
    ['2.2% Credit Card Fee', s.CreditCardFee],
    ['Cable/Internet Fee', -Math.abs(Number(s.CableInternetFee) || 0)],
    ['Maintenance &amp; Cleaning', -Math.abs(Number(s.MaintenanceCleaningFee) || 0)],
    ['5% Reserve Amount', s.ReserveAmount]
  ]
  const body = rows.map(([label, v], i) => `
        <tr${i % 2 ? ' style="background:#f7f9fb"' : ''}>
          <td style="padding:9px 14px;font-size:13px;color:#4a5568;border-bottom:1px solid #eef1f5">${label}</td>
          <td style="padding:9px 14px;font-size:13px;color:#1a202c;text-align:right;border-bottom:1px solid #eef1f5;white-space:nowrap">${cur(v)}</td>
        </tr>`).join('')

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#eef1f5">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:8px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.08)">

        <tr><td style="padding:26px 32px 18px;text-align:center;border-bottom:3px solid #1b3a5c">
          <img src="${logoSrc}" alt="Garden of the Gods Resort" width="240" style="display:block;margin:0 auto;width:240px;max-width:75%;height:auto">
        </td></tr>

        <tr><td style="padding:26px 32px 6px">
          <h1 style="margin:0 0 4px;font-size:19px;color:#1b3a5c;font-weight:bold">Casita Owner Statement</h1>
          <p style="margin:0;font-size:13px;color:#718096">${esc(period)}</p>
        </td></tr>

        <tr><td style="padding:14px 32px 0">
          <p style="margin:0 0 14px;font-size:14px;color:#2d3748;line-height:1.55">
            ${owner?.OwnerFullName ? `Dear ${esc(owner.OwnerFullName)},` : 'Hello,'}
          </p>
          <p style="margin:0 0 18px;font-size:14px;color:#2d3748;line-height:1.55">
            Your Casita statement for <strong>${esc(period)}</strong> is ready. A PDF copy is attached
            for your records, and the summary is below.
          </p>
        </td></tr>

        <tr><td style="padding:0 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;border-collapse:separate">
            <tr><td colspan="2" style="padding:10px 14px;background:#1b3a5c;font-size:11px;letter-spacing:.6px;color:#ffffff;font-weight:bold">
              STATEMENT SUMMARY${lot?.LotNumber ? ` &nbsp;·&nbsp; LOT ${esc(lot.LotNumber)}` : ''}
            </td></tr>
            ${body}
            <tr><td style="padding:13px 14px;font-size:15px;color:#1b3a5c;font-weight:bold">Owner Payout</td>
                <td style="padding:13px 14px;font-size:15px;color:#1b3a5c;font-weight:bold;text-align:right;white-space:nowrap">${cur(s.OwnerPayout)}</td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:22px 32px 6px">
          <p style="margin:0;font-size:13px;color:#4a5568;line-height:1.55">
            For questions, please contact ${esc(CONTACT_NAME)} at
            <a href="mailto:${CONTACT_EMAIL}" style="color:#1b3a5c">${CONTACT_EMAIL}</a>.
          </p>
        </td></tr>

        <tr><td style="padding:20px 32px 26px;border-top:1px solid #eef1f5;margin-top:10px">
          <p style="margin:0;font-size:11px;color:#a0aec0;line-height:1.5">
            Garden of the Gods Resort &amp; Club · Casita Statements<br>
            This message was sent automatically. Please use the contact address above for replies.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`
}

function buildText(payload, owner) {
  const s = payload.Summary || {}
  const period = `${fmtDate(payload.ActivityStartDate)} - ${fmtDate(payload.ActivityEndDate)}`
  return [
    owner?.OwnerFullName ? `Dear ${owner.OwnerFullName},` : 'Hello,', '',
    `Your Casita statement for ${period} is ready. A PDF copy is attached.`, '',
    `Gross Revenue           ${cur(s.GrossRevenue)}`,
    `50% Owner Split         ${cur(s.OwnerSplit)}`,
    `6.5% Reservation Fee    ${cur(s.ReservationFee)}`,
    `2.2% Credit Card Fee    ${cur(s.CreditCardFee)}`,
    `Cable/Internet Fee      ${cur(-Math.abs(Number(s.CableInternetFee) || 0))}`,
    `Maintenance & Cleaning  ${cur(-Math.abs(Number(s.MaintenanceCleaningFee) || 0))}`,
    `5% Reserve Amount       ${cur(s.ReserveAmount)}`,
    `Owner Payout            ${cur(s.OwnerPayout)}`, '',
    `For questions, please contact ${CONTACT_NAME} at ${CONTACT_EMAIL}.`, '',
    'Garden of the Gods Resort & Club - Casita Statements'
  ].join('\n')
}

app.http('sendStatement', {
  methods: ['GET', 'POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'send-statement/{id}',
  handler: async (request) => {
    if (request.method === 'OPTIONS') return { status: 200 }
    const id = request.params.id
    if (!id || !/^\d+$/.test(id)) return err('Invalid statement id', 400)

    const conn = process.env.ACS_CONNECTION_STRING
    const sender = process.env.ACS_SENDER_ADDRESS
    // Only sending needs credentials — the preview should still render without them.
    if (request.method === 'POST' && (!conn || !sender)) {
      return err('Email is not configured (ACS_CONNECTION_STRING / ACS_SENDER_ADDRESS missing).', 503)
    }

    try {
      const pool = await getPool()
      const payload = await getStatementPayload(pool, id)
      if (!payload) return err('Statement not found', 404)

      const [ownerRes, lotRes] = await Promise.all([
        pool.request().input('lotId', sql.Int, payload.LotID).query(
          `SELECT TOP 1 * FROM AppOwners WHERE LotID=@lotId AND OwnershipEndDate IS NULL
           ORDER BY DateOfPurchase DESC`).catch(() => ({ recordset: [] })),
        pool.request().input('lotId', sql.Int, payload.LotID).query(
          'SELECT TOP 1 * FROM AppLots WHERE LotID=@lotId').catch(() => ({ recordset: [] }))
      ])
      const owner = ownerRes.recordset[0] ?? {}
      const lot = lotRes.recordset[0] ?? {}

      const period = `${fmtDate(payload.ActivityStartDate)} - ${fmtDate(payload.ActivityEndDate)}`
      const subject = `GGRC Casita Statement for ${period}`
      const fileName = `${payload.StatementNumber || `statement-${id}`}.pdf`.replace(/[\\/:*?"<>|]/g, '-')

      // GET renders the message for the in-app preview without sending anything.
      // The logo needs an absolute URL: the preview renders inside a sandboxed
      // iframe, where a relative path has no origin to resolve against.
      if (request.method === 'GET') {
        let logoSrc = '/ggrc-logo.png'
        try { logoSrc = new URL('/ggrc-logo.png', request.url).toString() } catch { /* keep relative */ }
        return ok({
          to: owner.OwnerMainEmail || '',
          ownerName: owner.OwnerFullName || null,
          subject,
          attachment: fileName,
          from: sender || '(sender not configured)',
          replyTo: CONTACT_EMAIL,
          html: buildHtml(payload, owner, lot, logoSrc),
          text: buildText(payload, owner)
        })
      }

      // An explicit "to" overrides the owner on file, so the UI can retry/redirect.
      let to = null
      try { to = (await request.json())?.to || null } catch { /* no body is fine */ }
      to = to || owner.OwnerMainEmail
      if (!to) return err('No email address on file for this owner.', 400)

      const pdf = await buildStatementPdf(payload, owner, lot)

      const attachments = [
        { name: fileName, contentType: 'application/pdf', contentInBase64: pdf.toString('base64') }
      ]
      if (fs.existsSync(LOGO_PATH)) {
        attachments.push({
          name: 'ggrc-logo.png',
          contentType: 'image/png',
          contentInBase64: fs.readFileSync(LOGO_PATH).toString('base64'),
          contentId: LOGO_CID   // inline: referenced by the <img src="cid:..."> in the HTML
        })
      }

      const client = new EmailClient(conn)
      const poller = await client.beginSend({
        senderAddress: sender,
        content: {
          subject,
          plainText: buildText(payload, owner),
          html: buildHtml(payload, owner, lot)
        },
        recipients: { to: [{ address: to, displayName: owner.OwnerFullName || undefined }] },
        replyTo: [{ address: CONTACT_EMAIL, displayName: CONTACT_NAME }],
        attachments
      })
      const result = await poller.pollUntilDone()

      return ok({ sent: true, to, status: result.status, messageId: result.id, attachment: fileName })
    } catch (e) {
      console.error('send-statement:', e.message)
      return err(e.message)
    }
  }
})
