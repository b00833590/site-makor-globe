export const CHUNK_SIZE_CHARS = 900000;
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

// Converts an ArrayBuffer to a base64 string without blowing the call stack —
// String.fromCharCode(...hugeArray) fails past ~100k arguments in most engines,
// so this walks the buffer in fixed-size slices instead.
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const SLICE = 8192;
  for (let i = 0; i < bytes.length; i += SLICE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + SLICE));
  }
  return btoa(binary);
}

export function splitBase64IntoChunks(base64, chunkSize = CHUNK_SIZE_CHARS) {
  const chunks = [];
  for (let i = 0; i < base64.length; i += chunkSize) {
    chunks.push(base64.slice(i, i + chunkSize));
  }
  return chunks.length > 0 ? chunks : [''];
}

export function validatePresentationFile(file) {
  if (!file) return 'no-file';
  if (file.type !== 'application/pdf') return 'wrong-type';
  if (file.size > MAX_FILE_SIZE_BYTES) return 'too-large';
  return null;
}

// Uploads a presentation's chunks sequentially, then its metadata doc last —
// see the plan's rationale for why this isn't a single atomic batch and why
// metadata is written only after every chunk is confirmed.
export async function uploadPresentation({ id, title, base64, client, chunkSize = CHUNK_SIZE_CHARS, onProgress }) {
  const chunks = splitBase64IntoChunks(base64, chunkSize);
  const chunkKeys = chunks.map((_, i) => `mkg:pdfchunk:${id}:${i}`);

  for (let i = 0; i < chunks.length; i++) {
    try {
      await client.writeDoc(chunkKeys[i], chunks[i]);
    } catch {
      await client.deleteDocsBatch(chunkKeys.slice(0, i)).catch(() => {});
      return { ok: false, reason: 'chunk-failed' };
    }
    if (onProgress) onProgress(i + 1, chunks.length);
  }

  const presentationKey = `mkg:presentation:${id}`;
  const metadata = { id, title, thumb: '', createdAt: Date.now() };
  try {
    await client.writeDoc(presentationKey, metadata);
  } catch {
    await client.deleteDocsBatch(chunkKeys).catch(() => {});
    return { ok: false, reason: 'metadata-failed' };
  }

  return { ok: true, key: presentationKey, value: metadata };
}
