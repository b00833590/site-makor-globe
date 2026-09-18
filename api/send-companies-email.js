// Sends the "companies presented this week" email to the maîtres de stage,
// ahead of the actual presentation — a lighter, French, link-free companion
// to send-onepagers-email.js. Same Brevo infrastructure, same sender,
// same recipients (ONEPAGER_MENTOR_EMAILS — same audience, no reason for a
// second env var), same "2xx means accepted, not delivered" honesty. Kept
// as its own file rather than a shared module because this project has no
// package.json / build step — every api/*.js file here is self-contained
// on purpose (see send-onepagers-email.js's own header comment).

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function logStep(step, details) {
  console.log(`[send-companies-email] step ${step}`, details || '');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  logStep(1, 'send requested');

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.error('[send-companies-email] BREVO_API_KEY missing from environment');
    res.status(500).send("Envoi indisponible — BREVO_API_KEY n'est pas configurée sur Vercel.");
    return;
  }

  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!senderEmail) {
    console.error('[send-companies-email] BREVO_SENDER_EMAIL missing from environment');
    res.status(500).send("Envoi indisponible — BREVO_SENDER_EMAIL n'est pas configurée sur Vercel (l'adresse vérifiée comme expéditeur dans Brevo).");
    return;
  }

  const recipientsRaw = process.env.ONEPAGER_MENTOR_EMAILS || '';
  const recipients = recipientsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  if (recipients.length === 0) {
    console.error('[send-companies-email] ONEPAGER_MENTOR_EMAILS missing or empty');
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
  const companies = Array.isArray(body.companies)
    ? body.companies
        .filter((c) => c && typeof c === 'object' && typeof c.name === 'string' && c.name.trim())
        .map((c) => ({
          name: c.name.trim(),
          ticker: typeof c.ticker === 'string' ? c.ticker.trim() : '',
          country: typeof c.country === 'string' ? c.country.trim() : '',
          flag: typeof c.flag === 'string' ? c.flag.trim() : '',
          region: typeof c.region === 'string' ? c.region.trim() : '',
        }))
    : [];

  if (!dateLabel || companies.length === 0) {
    res.status(400).send('Requête invalide — date et liste des entreprises sont requises.');
    return;
  }

  const subject = `Entreprises présentées - ${dateLabel}`;

  const companyBlockText = (c) =>
    `${c.name}\nTicker : ${c.ticker || '—'}\nPays : ${[c.flag, c.country].filter(Boolean).join(' ') || '—'}\nRégion : ${c.region || '—'}`;
  const companyBlockHtml = (c) =>
    `<p style="margin:0 0 14px;"><strong>${escapeHtml(c.name)}</strong><br>` +
    `Ticker : ${escapeHtml(c.ticker || '—')}<br>` +
    `Pays : ${escapeHtml([c.flag, c.country].filter(Boolean).join(' ') || '—')}<br>` +
    `Région : ${escapeHtml(c.region || '—')}</p>`;

  const text = `Bonjour,

Voici les entreprises qui seront présentées lors de la présentation du ${dateLabel}.

Entreprises présentées :

${companies.map(companyBlockText).join('\n\n')}

Bonne journée,
Makor Morning News`;

  const html = `<p>Bonjour,</p>
<p>Voici les entreprises qui seront présentées lors de la présentation du ${escapeHtml(dateLabel)}.</p>
<p><strong>Entreprises présentées</strong></p>
${companies.map(companyBlockHtml).join('')}
<p>Bonne journée,<br>Makor Morning News</p>`;

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
    console.error('[send-companies-email] network error calling Brevo', e && e.message);
    res.status(502).send("L'envoi de l'email a échoué — connexion au service d'envoi impossible. Réessaie dans un instant.");
    return;
  }

  const rawResponseText = await brevoRes.text().catch(() => '');
  let parsedResponse = null;
  try { parsedResponse = rawResponseText ? JSON.parse(rawResponseText) : null; } catch (e) { /* non-JSON body, handled by the !res.ok branch below */ }

  logStep(4, { accepted: brevoRes.ok, httpStatus: brevoRes.status });

  if (!brevoRes.ok) {
    const reason = (parsedResponse && (parsedResponse.message || parsedResponse.code)) || rawResponseText || `HTTP ${brevoRes.status}`;
    console.error('[send-companies-email] Brevo rejected the request', { httpStatus: brevoRes.status, reason });
    res.status(502).json({
      ok: false,
      error: `Le service d'envoi a refusé le message : ${reason}`,
    });
    return;
  }

  const messageId = parsedResponse && (parsedResponse.messageId || (Array.isArray(parsedResponse.messageIds) && parsedResponse.messageIds[0]));
  logStep(5, { messageId: messageId || '(none returned)' });

  res.status(200).json({
    ok: true,
    accepted: true,
    messageId: messageId || null,
    recipientCount: recipients.length,
  });
};
