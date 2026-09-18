// Sends the "here are this week's One-Pagers" email to the maîtres de
// stage via Brevo's REST API, called directly with fetch (no npm
// dependency, same zero-dependency approach as merge-pptx.py — there is no
// package.json in this repo).
//
// Brevo (not Resend) on purpose: Resend requires a verified SENDING DOMAIN
// to deliver to arbitrary recipients, which needs DNS access this project
// doesn't have. Brevo supports "single sender" verification instead — one
// plain email address (e.g. a Gmail account created for this), confirmed via
// a one-click link, no domain or DNS access required. See BREVO_SENDER_EMAIL
// below.
//
// The merged PPTX is attached directly (Brevo's transactional email API
// accepts a base64 `attachment: [{name, content}]`, up to 20MB total
// including the rest of the email — .pptx is an explicitly supported
// extension). This replaced an earlier version that emailed a link to a
// consultation page instead of the file itself — recipients now get the
// file straight in their inbox, no intermediate page.
//
// Wire format the CLIENT sends (see buildEmailAttachmentUploadBody() in
// index.html): a 4-byte big-endian manifest length, the JSON manifest
// ({dateLabel, fileName, length}), then the PPTX's raw bytes — binary, not
// base64-in-JSON, because a merged bundle can be several MB and base64
// would risk the exact FUNCTION_PAYLOAD_TOO_LARGE failure already hit (and
// fixed) on the merge-pptx endpoint itself. This function base64-encodes
// the bytes ONLY for the outbound call to Brevo, whose attachment field
// requires it — that outbound request isn't subject to Vercel's inbound
// function payload limit.
//
// --- What "success" actually means here ---
// A 2xx from Brevo's /v3/smtp/email means the API ACCEPTED the request for
// processing — it is not proof of delivery. This version captures and
// returns the real messageId Brevo assigns, so it can be looked up in
// Brevo's own dashboard (Transactional > Email Activity) for the actual
// delivery status (sent/delivered/bounced/blocked) — something only
// Brevo's own systems can confirm, no API response at send-time can
// promise it.

const MAX_ATTACHMENT_BYTES = 14 * 1024 * 1024; // base64 (~+33%) must stay under Brevo's 20MB total-email cap, with headroom for the rest of the email

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function logStep(step, details) {
  console.log(`[send-onepagers-email] step ${step}`, details || '');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  logStep(1, 'send requested');

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error('[send-onepagers-email] BREVO_API_KEY missing from environment');
    res.status(500).send("Envoi indisponible — BREVO_API_KEY n'est pas configurée sur Vercel.");
    return;
  }

  // Must be an address Brevo has verified as a "sender" (Senders, Domains &
  // Dedicated IPs -> Senders -> Add a Sender, confirmed via the email Brevo
  // sends it) — Brevo rejects sends from an unverified address, so there is
  // no safe generic fallback the way Resend's sandbox address worked.
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!senderEmail) {
    console.error('[send-onepagers-email] BREVO_SENDER_EMAIL missing from environment');
    res.status(500).send("Envoi indisponible — BREVO_SENDER_EMAIL n'est pas configurée sur Vercel (l'adresse vérifiée comme expéditeur dans Brevo).");
    return;
  }

  const recipientsRaw = process.env.ONEPAGER_MENTOR_EMAILS || '';
  const recipients = recipientsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  if (recipients.length === 0) {
    console.error('[send-onepagers-email] ONEPAGER_MENTOR_EMAILS missing or empty');
    res.status(500).send("Envoi indisponible — ONEPAGER_MENTOR_EMAILS n'est pas configurée sur Vercel (adresses des maîtres de stage).");
    return;
  }

  logStep(2, { senderEmail, recipients, recipientCount: recipients.length });

  let raw;
  try {
    raw = await readRawBody(req);
  } catch (e) {
    res.status(400).send('Requête invalide (corps illisible).');
    return;
  }

  let dateLabel = '';
  let fileName = '';
  let fileBytes = null;
  try {
    if (raw.length < 4) throw new Error('payload trop court');
    const manifestLen = raw.readUInt32BE(0);
    const manifest = JSON.parse(raw.slice(4, 4 + manifestLen).toString('utf8'));
    dateLabel = typeof manifest.dateLabel === 'string' ? manifest.dateLabel.trim() : '';
    fileName = typeof manifest.fileName === 'string' ? manifest.fileName.trim() : '';
    const length = typeof manifest.length === 'number' ? manifest.length : -1;
    const offset = 4 + manifestLen;
    if (length < 0 || offset + length > raw.length) throw new Error('fichier tronqué');
    fileBytes = raw.slice(offset, offset + length);
  } catch (e) {
    res.status(400).send('Requête invalide (manifeste illisible).');
    return;
  }

  if (!dateLabel || !fileName || !fileBytes || fileBytes.length === 0) {
    res.status(400).send('Requête invalide — date, nom de fichier et PPTX sont tous requis.');
    return;
  }

  const attachmentBase64 = fileBytes.toString('base64');
  if (attachmentBase64.length > MAX_ATTACHMENT_BYTES) {
    console.error('[send-onepagers-email] attachment too large', { rawBytes: fileBytes.length, base64Bytes: attachmentBase64.length });
    res.status(413).json({
      ok: false,
      error: `Le PPTX regroupé (${(fileBytes.length / 1024 / 1024).toFixed(1)} Mo) est trop volumineux pour être envoyé en pièce jointe par email (limite Brevo : 20 Mo pour l'email complet). Réduis le nombre ou la taille des One-Pagers, ou contacte les maîtres de stage par un autre moyen pour ce fichier.`,
    });
    return;
  }

  const subject = `One-Pagers - Présentation du ${dateLabel}`;

  const text = `Bonjour,

Voici les One-Pagers correspondant aux entreprises présentées lors de la présentation du ${dateLabel}.

Bonne journée,
Makor Morning News`;

  const html = `<p>Bonjour,</p>
<p>Voici les One-Pagers correspondant aux entreprises présentées lors de la présentation du ${escapeHtml(dateLabel)}.</p>
<p>Bonne journée,<br>Makor Morning News</p>`;

  logStep(3, { sendingRequestToBrevo: true, fileName, attachmentBytes: fileBytes.length });

  let brevoRes;
  try {
    brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Makor Morning News', email: senderEmail },
        to: recipients.map((email) => ({ email })),
        subject,
        textContent: text,
        htmlContent: html,
        attachment: [{ name: fileName, content: attachmentBase64 }],
      }),
    });
  } catch (e) {
    // Network-level failure — the request never reached Brevo at all.
    console.error('[send-onepagers-email] network error calling Brevo', e && e.message);
    res.status(502).send("L'envoi de l'email a échoué — connexion au service d'envoi impossible. Réessaie dans un instant.");
    return;
  }

  const rawResponseText = await brevoRes.text().catch(() => '');
  let parsedResponse = null;
  try { parsedResponse = rawResponseText ? JSON.parse(rawResponseText) : null; } catch (e) { /* non-JSON body, keep raw text for the error path below */ }

  logStep(4, { accepted: brevoRes.ok, httpStatus: brevoRes.status });

  if (!brevoRes.ok) {
    // Brevo's error body is normally {"code": "...", "message": "..."} —
    // surface that exact reason instead of a generic "HTTP 502", since the
    // reason (invalid_parameter, unauthorized, account restrictions...) is
    // exactly what distinguishes "fix the code" from "fix the Brevo
    // account/sender setup".
    const reason = (parsedResponse && (parsedResponse.message || parsedResponse.code)) || rawResponseText || `HTTP ${brevoRes.status}`;
    console.error('[send-onepagers-email] Brevo rejected the request', { httpStatus: brevoRes.status, reason });
    res.status(502).json({
      ok: false,
      error: `Le service d'envoi a refusé le message : ${reason}`,
    });
    return;
  }

  const messageId = parsedResponse && (parsedResponse.messageId || (Array.isArray(parsedResponse.messageIds) && parsedResponse.messageIds[0]));
  logStep(5, { messageId: messageId || '(none returned)' });
  logStep(6, 'accepted by provider — this confirms Brevo received and queued the message, not that it reached the inbox; check Brevo\'s Email Activity log for the messageId above for actual delivery status');

  res.status(200).json({
    ok: true,
    accepted: true,
    messageId: messageId || null,
    recipientCount: recipients.length,
  });
};
