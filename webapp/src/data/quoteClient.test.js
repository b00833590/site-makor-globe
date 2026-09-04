import { describe, it, expect, vi } from 'vitest';
import { buildQuoteUrl, fetchQuoteHistory, fetchQuoteSince } from './quoteClient.js';

describe('buildQuoteUrl', () => {
  it('builds a URL with the action and all params as query string entries', () => {
    const url = buildQuoteUrl('quoteHistory', { symbol: 'AAPL', since: '2026-01-15' });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://script.google.com/macros/s/AKfycbyrZE6OqvJ5yJ7qLYj0d3ogytsdx1LZTv7c4sKGjTCkaQhgXy-eW263ncHrClj97y8c/exec');
    expect(parsed.searchParams.get('action')).toBe('quoteHistory');
    expect(parsed.searchParams.get('symbol')).toBe('AAPL');
    expect(parsed.searchParams.get('since')).toBe('2026-01-15');
  });

  it('URL-encodes symbols containing special characters', () => {
    const url = buildQuoteUrl('quoteHistory', { symbol: 'XHKG: 175', since: '2026-01-15' });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('symbol')).toBe('XHKG: 175');
    expect(url).not.toContain(' ');
  });
});

describe('fetchQuoteHistory', () => {
  it('returns the parsed points on success', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ points: [{ date: '2026-01-15', close: 100 }] }),
    });
    const result = await fetchQuoteHistory('AAPL', '2026-01-15', fakeFetch);
    expect(result).toEqual({ points: [{ date: '2026-01-15', close: 100 }] });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when the API responds with an error field', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: 'symbol not found' }),
    });
    const result = await fetchQuoteHistory('BADSYM', '2026-01-15', fakeFetch);
    expect(result).toBeNull();
  });

  it('returns null when the fetch itself rejects (network failure)', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await fetchQuoteHistory('AAPL', '2026-01-15', fakeFetch);
    expect(result).toBeNull();
  });

  it('returns null when the response body is not valid JSON', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      json: () => Promise.reject(new Error('invalid json')),
    });
    const result = await fetchQuoteHistory('AAPL', '2026-01-15', fakeFetch);
    expect(result).toBeNull();
  });
});

describe('fetchQuoteSince', () => {
  it('returns the parsed sinceChange/ytdChange on success', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ sinceChange: 3.4, ytdChange: -1.2 }),
    });
    const result = await fetchQuoteSince('NVT', '2026-01-15', fakeFetch);
    expect(result).toEqual({ sinceChange: 3.4, ytdChange: -1.2 });
    const calledUrl = new URL(fakeFetch.mock.calls[0][0]);
    expect(calledUrl.searchParams.get('action')).toBe('quoteSince');
  });

  it('returns null when the API responds with an error field', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ error: 'symbol not found' }),
    });
    const result = await fetchQuoteSince('BADSYM', '2026-01-15', fakeFetch);
    expect(result).toBeNull();
  });

  it('returns null when the fetch itself rejects (network failure)', async () => {
    const fakeFetch = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await fetchQuoteSince('NVT', '2026-01-15', fakeFetch);
    expect(result).toBeNull();
  });

  it('returns null when the response body is not valid JSON', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      json: () => Promise.reject(new Error('invalid json')),
    });
    const result = await fetchQuoteSince('NVT', '2026-01-15', fakeFetch);
    expect(result).toBeNull();
  });
});
