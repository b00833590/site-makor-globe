// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { sortChunkKeys, base64ToPdfBlob, fetchChunkWithRetry, openPresentationPdf } from './presentationPdf.js';

describe('sortChunkKeys', () => {
  it('sorts chunk keys numerically by their trailing index, not lexicographically', () => {
    const keys = ['mkg:pdfchunk:p1:10', 'mkg:pdfchunk:p1:2', 'mkg:pdfchunk:p1:1'];
    expect(sortChunkKeys(keys)).toEqual(['mkg:pdfchunk:p1:1', 'mkg:pdfchunk:p1:2', 'mkg:pdfchunk:p1:10']);
  });

  it('does not mutate the input array', () => {
    const keys = ['mkg:pdfchunk:p1:2', 'mkg:pdfchunk:p1:1'];
    const original = [...keys];
    sortChunkKeys(keys);
    expect(keys).toEqual(original);
  });
});

describe('base64ToPdfBlob', () => {
  it('decodes a base64 string into a Blob with the PDF mime type', () => {
    const blob = base64ToPdfBlob(btoa('%PDF-1.4 fake content'));
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('fetchChunkWithRetry', () => {
  it('returns the value immediately when the first attempt succeeds', async () => {
    const fetchRawValueFn = vi.fn().mockResolvedValue('chunk-data');
    const result = await fetchChunkWithRetry('key1', fetchRawValueFn, 3, 0);
    expect(result).toBe('chunk-data');
    expect(fetchRawValueFn).toHaveBeenCalledTimes(1);
  });

  it('retries on null/undefined and returns the value once it succeeds', async () => {
    const fetchRawValueFn = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('chunk-data');
    const result = await fetchChunkWithRetry('key1', fetchRawValueFn, 3, 0);
    expect(result).toBe('chunk-data');
    expect(fetchRawValueFn).toHaveBeenCalledTimes(2);
  });

  it('returns null after exhausting all attempts', async () => {
    const fetchRawValueFn = vi.fn().mockResolvedValue(null);
    const result = await fetchChunkWithRetry('key1', fetchRawValueFn, 3, 0);
    expect(result).toBeNull();
    expect(fetchRawValueFn).toHaveBeenCalledTimes(3);
  });
});

describe('openPresentationPdf', () => {
  it('returns not-ready when there are no chunk keys yet', async () => {
    const client = { fetchKeysWithPrefix: vi.fn().mockResolvedValue([]), fetchRawValue: vi.fn() };
    const result = await openPresentationPdf('p1', client);
    expect(result).toEqual({ ok: false, reason: 'not-ready' });
  });

  it('fetches every chunk in order, reassembles them, and returns a blob URL', async () => {
    const b64 = btoa('%PDF-1.4 fake content');
    const half = Math.ceil(b64.length / 2);
    const client = {
      fetchKeysWithPrefix: vi.fn().mockResolvedValue(['mkg:pdfchunk:p1:1', 'mkg:pdfchunk:p1:0']),
      fetchRawValue: vi.fn(key => Promise.resolve(key.endsWith(':0') ? JSON.stringify(b64.slice(0, half)) : JSON.stringify(b64.slice(half)))),
    };
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    const result = await openPresentationPdf('p1', client);
    expect(result.ok).toBe(true);
    expect(result.url).toBe('blob:mock-url');
    expect(client.fetchRawValue).toHaveBeenNthCalledWith(1, 'mkg:pdfchunk:p1:0');
    expect(client.fetchRawValue).toHaveBeenNthCalledWith(2, 'mkg:pdfchunk:p1:1');
  });

  it('reports progress via onProgress as each chunk resolves', async () => {
    const client = {
      fetchKeysWithPrefix: vi.fn().mockResolvedValue(['mkg:pdfchunk:p1:0', 'mkg:pdfchunk:p1:1']),
      fetchRawValue: vi.fn().mockResolvedValue(JSON.stringify('')),
    };
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    const onProgress = vi.fn();
    await openPresentationPdf('p1', client, onProgress);
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
  });

  it('returns chunk-failed when a chunk never resolves', async () => {
    const client = {
      fetchKeysWithPrefix: vi.fn().mockResolvedValue(['mkg:pdfchunk:p1:0']),
      fetchRawValue: vi.fn().mockResolvedValue(null),
    };
    // retryDelayMs=0: this exercises all 3 real retry attempts inside
    // fetchChunkWithRetry, so a non-zero delay here would genuinely slow
    // down the suite for no benefit — same reasoning as firestoreClient's
    // own writeWithRetry tests always passing delayMs=0.
    const result = await openPresentationPdf('p1', client, undefined, 0);
    expect(result).toEqual({ ok: false, reason: 'chunk-failed', index: 0, total: 1 });
  });
});
