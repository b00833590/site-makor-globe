const QUOTE_API_URL = 'https://script.google.com/macros/s/AKfycbyrZE6OqvJ5yJ7qLYj0d3ogytsdx1LZTv7c4sKGjTCkaQhgXy-eW263ncHrClj97y8c/exec';

export function buildQuoteUrl(action, params) {
  const url = new URL(QUOTE_API_URL);
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function fetchQuoteHistory(symbol, sinceISO, fetchFn = fetch) {
  try {
    const response = await fetchFn(buildQuoteUrl('quoteHistory', { symbol, since: sinceISO }));
    const data = await response.json();
    if (data.error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function fetchQuoteSince(symbol, sinceISO, fetchFn = fetch) {
  try {
    const response = await fetchFn(buildQuoteUrl('quoteSince', { symbol, since: sinceISO }));
    const data = await response.json();
    if (data.error) return null;
    return data;
  } catch {
    return null;
  }
}
