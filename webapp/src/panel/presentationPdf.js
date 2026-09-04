export function sortChunkKeys(keys) {
  return [...keys].sort((a, b) => parseInt(a.split(':').pop(), 10) - parseInt(b.split(':').pop(), 10));
}

export function base64ToPdfBlob(base64) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  return new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
}

export async function fetchChunkWithRetry(key, fetchRawValueFn, attempts = 3, delayMs = 300) {
  for (let i = 0; i < attempts; i++) {
    const value = await fetchRawValueFn(key);
    if (value !== null && value !== undefined) return value;
    if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return null;
}

export async function openPresentationPdf(id, client, onProgress, retryDelayMs = 300) {
  const chunkKeys = sortChunkKeys(await client.fetchKeysWithPrefix(`mkg:pdfchunk:${id}:`));
  if (chunkKeys.length === 0) return { ok: false, reason: 'not-ready' };

  const parts = [];
  for (let i = 0; i < chunkKeys.length; i++) {
    const raw = await fetchChunkWithRetry(chunkKeys[i], client.fetchRawValue, 3, retryDelayMs);
    if (raw === null) return { ok: false, reason: 'chunk-failed', index: i, total: chunkKeys.length };
    let value = raw;
    try { value = JSON.parse(raw); } catch { /* stored as a plain string */ }
    parts.push(value);
    if (onProgress) onProgress(i + 1, chunkKeys.length);
  }

  try {
    const blob = base64ToPdfBlob(parts.join(''));
    return { ok: true, url: URL.createObjectURL(blob) };
  } catch {
    return { ok: false, reason: 'reassembly-failed' };
  }
}
