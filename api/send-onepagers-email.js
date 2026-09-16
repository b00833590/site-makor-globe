// Sends the "latest ideas" email to the maîtres de stage via Brevo's REST
// API, called directly with fetch (no npm dependency, same zero-dependency
// approach as convert-pptx.js — there is no package.json in this repo).
//
// Brevo (not Resend) on purpose: Resend requires a verified SENDING DOMAIN
// to deliver to arbitrary recipients, which needs DNS access this project
// doesn't have. Brevo supports "single sender" verification instead — one
// plain email address (e.g. a Gmail account created for this), confirmed via
// a one-click link, no domain or DNS access required. See BREVO_SENDER_EMAIL
// below.
//
// Recipients are never hardcoded: they live in the ONEPAGER_MENTOR_EMAILS
// env var (comma-separated), so they can be changed from the Vercel
// dashboard without touching any code, in one place, not scattered across
// the codebase.
//
// The client sends only the data needed to build the email (date label,
// company names, the public consultation-page link) — never the PDF itself,
// which is fetched from Firestore straight into the client's own PDF
// merge/download flow and is intentionally NOT attached to this email (the
// email links to it instead — see the public-page comment in index.html).
//
// --- What "success" actually means here ---
// A 2xx from Brevo's /v3/smtp/email means the API ACCEPTED the request for
// processing — it is not proof of delivery, and earlier versions of this
// function treated it as if it were: they discarded Brevo's response body
// entirely (no messageId captured, nothing logged beyond the HTTP status)
// and the client showed "Email envoyé avec succès" off nothing more than
// "the HTTP call didn't error". That's how a request that Brevo silently
// never delivered (wrong/unverified sender, spam filtering, an account
// under review) could look identical, from this app's point of view, to a
// mail that actually reached an inbox. This version captures and returns
// the real messageId Brevo assigns, so it can be looked up in Brevo's own
// dashboard (Transactional > Email Activity) for the actual delivery
// status (sent/delivered/bounced/blocked) — something only Brevo's own
// systems can confirm, no API response at send-time can promise it.

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// Never logs the key/token itself — only whether it's present, and (for the
// sender/recipients, which aren't secrets) the actual values, so the Vercel
// runtime logs are enough to answer "was this request even shaped right?"
// without needing to reproduce locally.
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

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    res.status(400).send('Requête invalide (JSON illisible).');
    return;
  }

  const dateLabel = typeof body.dateLabel === 'string' ? body.dateLabel.trim() : '';
  const companyNames = Array.isArray(body.companyNames) ? body.companyNames.filter((n) => typeof n === 'string' && n.trim()) : [];
  const publicUrl = typeof body.publicUrl === 'string' ? body.publicUrl.trim() : '';

  if (!dateLabel || companyNames.length === 0 || !publicUrl) {
    res.status(400).send('Requête invalide — date, liste des entreprises et lien sont tous requis.');
    return;
  }

  const subject = `Makor Morning News | Latest Investment Ideas | ${dateLabel}`;
  const companiesTextList = companyNames.map((n) => `- ${n}`).join('\n');
  const companiesHtmlList = companyNames.map((n) => `<li>${escapeHtml(n)}</li>`).join('');

  const text = `Here are the latest ideas from the presentation on ${dateLabel}.

Companies presented:
${companiesTextList}

Follow this link to access and download the One-Pagers:
${publicUrl}

Best regards,
Makor Morning News`;

  const html = `<p>Here are the latest ideas from the presentation on ${escapeHtml(dateLabel)}.</p>
<p><strong>Companies presented:</strong></p>
<ul>${companiesHtmlList}</ul>
<p>Follow this link to access and download the One-Pagers:<br><a href="${escapeHtml(publicUrl)}">View the One-Pagers</a></p>
<p>Best regards,<br>Makor Morning News</p>`;

  logStep(3, 'sending request to Brevo');

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
