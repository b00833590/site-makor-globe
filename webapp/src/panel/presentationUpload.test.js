import { describe, it, expect, vi } from 'vitest';
import { arrayBufferToBase64, splitBase64IntoChunks, validatePresentationFile, uploadPresentation, MAX_FILE_SIZE_BYTES } from './presentationUpload.js';

describe('arrayBufferToBase64', () => {
  it('encodes a small buffer correctly', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(arrayBufferToBase64(bytes.buffer)).toBe('SGVsbG8=');
  });

  it('handles a buffer larger than the internal slicing chunk size without throwing', () => {
    const bytes = new Uint8Array(20000).fill(65); // larger than the 8192-byte SLICE
    expect(() => arrayBufferToBase64(bytes.buffer)).not.toThrow();
    expect(arrayBufferToBase64(bytes.buffer).length).toBeGreaterThan(0);
  });
});

describe('splitBase64IntoChunks', () => {
  it('splits a string into equal-sized pieces with a shorter remainder', () => {
    expect(splitBase64IntoChunks('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('returns a single empty chunk for an empty string (never zero chunks)', () => {
    expect(splitBase64IntoChunks('', 4)).toEqual(['']);
  });

  it('returns a single chunk when the string is shorter than chunkSize', () => {
    expect(splitBase64IntoChunks('abc', 100)).toEqual(['abc']);
  });
});

describe('validatePresentationFile', () => {
  it('rejects a missing file', () => {
    expect(validatePresentationFile(null)).toBe('no-file');
  });

  it('rejects a non-PDF file', () => {
    expect(validatePresentationFile({ type: 'image/png', size: 100 })).toBe('wrong-type');
  });

  it('rejects a PDF larger than the max size', () => {
    expect(validatePresentationFile({ type: 'application/pdf', size: MAX_FILE_SIZE_BYTES + 1 })).toBe('too-large');
  });

  it('accepts a valid PDF within the size limit', () => {
    expect(validatePresentationFile({ type: 'application/pdf', size: 1000 })).toBeNull();
  });
});

function makeClient(overrides = {}) {
  return {
    writeDoc: vi.fn().mockResolvedValue(undefined),
    deleteDocsBatch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('uploadPresentation', () => {
  it('writes every chunk then the metadata doc last, and reports progress', async () => {
    const client = makeClient();
    const onProgress = vi.fn();
    const result = await uploadPresentation({ id: 'p1', title: 'Deck', base64: 'abcdefghij', client, chunkSize: 4, onProgress });

    expect(client.writeDoc).toHaveBeenCalledWith('mkg:pdfchunk:p1:0', 'abcd');
    expect(client.writeDoc).toHaveBeenCalledWith('mkg:pdfchunk:p1:1', 'efgh');
    expect(client.writeDoc).toHaveBeenCalledWith('mkg:pdfchunk:p1:2', 'ij');
    expect(client.writeDoc).toHaveBeenLastCalledWith('mkg:presentation:p1', expect.objectContaining({ id: 'p1', title: 'Deck' }));
    expect(onProgress).toHaveBeenCalledWith(3, 3);
    expect(result).toEqual({ ok: true, key: 'mkg:presentation:p1', value: expect.objectContaining({ id: 'p1', title: 'Deck' }) });
  });

  it('aborts and cleans up already-written chunks when a chunk write fails', async () => {
    const client = makeClient({
      writeDoc: vi.fn()
        .mockResolvedValueOnce(undefined) // chunk 0 ok
        .mockRejectedValueOnce(new Error('network')), // chunk 1 fails
    });
    const result = await uploadPresentation({ id: 'p1', title: 'Deck', base64: 'abcdefghij', client, chunkSize: 4 });

    expect(client.deleteDocsBatch).toHaveBeenCalledWith(['mkg:pdfchunk:p1:0']);
    expect(result).toEqual({ ok: false, reason: 'chunk-failed' });
  });

  it('cleans up all chunks when the final metadata write fails', async () => {
    const client = makeClient({
      writeDoc: vi.fn()
        .mockResolvedValueOnce(undefined) // chunk 0
        .mockResolvedValueOnce(undefined) // chunk 1
        .mockResolvedValueOnce(undefined) // chunk 2
        .mockRejectedValueOnce(new Error('network')), // metadata
    });
    const result = await uploadPresentation({ id: 'p1', title: 'Deck', base64: 'abcdefghij', client, chunkSize: 4 });

    expect(client.deleteDocsBatch).toHaveBeenCalledWith(['mkg:pdfchunk:p1:0', 'mkg:pdfchunk:p1:1', 'mkg:pdfchunk:p1:2']);
    expect(result).toEqual({ ok: false, reason: 'metadata-failed' });
  });

  it('still returns a failure result even if the cleanup delete itself fails', async () => {
    const client = makeClient({
      writeDoc: vi.fn().mockRejectedValueOnce(new Error('network')),
      deleteDocsBatch: vi.fn().mockRejectedValue(new Error('also down')),
    });
    await expect(uploadPresentation({ id: 'p1', title: 'Deck', base64: 'abcd', client, chunkSize: 4 }))
      .resolves.toEqual({ ok: false, reason: 'chunk-failed' });
  });
});
