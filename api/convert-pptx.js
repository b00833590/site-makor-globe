// Converts an uploaded PPTX to PDF via CloudConvert, so the browser never
// needs a client-side conversion library (none exist reliably) and the
// CloudConvert API key never reaches the client. This is the first backend
// code in this project — everything else talks to Firestore directly from
// the browser (see index.html's own comments on that deliberate choice).
//
// Plain Vercel Node serverless function (no framework, no npm dependency —
// CloudConvert's REST API is called directly with fetch, which is native in
// Vercel's Node runtime). CommonJS on purpose: there is no package.json in
// this repo (the root Vercel project deploys only index.html + this folder,
// see .vercelignore), so there's no "type":"module" to allow ESM syntax.

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const apiKey = process.env.CLOUDCONVERT_API_KEY;
  if (!apiKey) {
    res.status(500).send("Conversion indisponible — CLOUDCONVERT_API_KEY n'est pas configurée sur Vercel.");
    return;
  }

  let fileBuffer;
  try {
    fileBuffer = await readRawBody(req);
    if (!fileBuffer.length) throw new Error('empty body');
  } catch (e) {
    res.status(400).send('Fichier manquant ou illisible.');
    return;
  }

  const fileName = decodeURIComponent(req.headers['x-file-name'] || 'presentation.pptx');
  const cloudConvert = (path, opts) => fetch(`https://api.cloudconvert.com/v2${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...((opts && opts.headers) || {}),
    },
  });

  try {
    const createRes = await cloudConvert('/jobs', {
      method: 'POST',
      body: JSON.stringify({
        tasks: {
          'import-file': { operation: 'import/base64', file: fileBuffer.toString('base64'), filename: fileName },
          'convert-file': { operation: 'convert', input: 'import-file', output_format: 'pdf' },
          'export-file': { operation: 'export/url', input: 'convert-file' },
        },
      }),
    });
    if (!createRes.ok) {
      const detail = await createRes.text().catch(() => '');
      throw new Error(`job creation failed (${createRes.status}): ${detail}`);
    }
    const job = (await createRes.json()).data;

    // Small single-slide-deck-sized files convert in a few seconds — poll
    // rather than assume a webhook, to keep this a single stateless request.
    let finalJob = job;
    const deadline = Date.now() + 60000;
    while (finalJob.status !== 'finished' && finalJob.status !== 'error' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const pollRes = await cloudConvert(`/jobs/${job.id}`);
      finalJob = (await pollRes.json()).data;
    }
    if (finalJob.status !== 'finished') {
      throw new Error(finalJob.status === 'error' ? 'conversion error' : 'timed out waiting for conversion');
    }

    const exportTask = finalJob.tasks.find((t) => t.name === 'export-file');
    const fileUrl = exportTask
      && exportTask.result
      && exportTask.result.files
      && exportTask.result.files[0]
      && exportTask.result.files[0].url;
    if (!fileUrl) throw new Error('converted file url missing from CloudConvert response');

    const pdfRes = await fetch(fileUrl);
    if (!pdfRes.ok) throw new Error('failed to download converted file');
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    res.setHeader('Content-Type', 'application/pdf');
    res.status(200).send(pdfBuffer);
  } catch (e) {
    console.error('PPTX conversion failed', e);
    res.status(502).send('La conversion PPTX vers PDF a échoué — réessaie, ou dépose directement un PDF.');
  }
};
