import { ddmmToISOThisYear } from './dateUtils.js';

const ROUND_FACTOR = 100;
const DEFAULT_DELAY_MS = 200;

function round2(value) {
  return Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function portfolioEntrySymbol(entry) {
  return (entry.symbol && entry.symbol.trim()) || null;
}

export async function fetchPortfolioLiveQuotes(entries, fetchQuoteSinceFn, {
  now = new Date(),
  delayMs = DEFAULT_DELAY_MS,
  shouldContinue = () => true,
} = {}) {
  const overrides = {};

  // Group entries by (symbol, sinceISO) and fetch once per unique pair: the same
  // holding routinely appears more than once (a long and a short line on the same
  // ticker, or the same name across regions in the old site's global view), and
  // there's no reason to spend a quote request on each copy.
  const groups = new Map(); // key -> { symbol, sinceISO, entries: [] }
  for (const entry of entries) {
    const symbol = portfolioEntrySymbol(entry);
    if (!symbol) continue;
    const sinceISO = ddmmToISOThisYear(entry.date, now);
    if (!sinceISO) continue;
    const key = `${symbol}|${sinceISO}`;
    if (!groups.has(key)) groups.set(key, { symbol, sinceISO, entries: [] });
    groups.get(key).entries.push(entry);
  }

  for (const { symbol, sinceISO, entries: groupEntries } of groups.values()) {
    if (!shouldContinue()) break;

    const quote = await fetchQuoteSinceFn(symbol, sinceISO);
    if (quote) {
      for (const entry of groupEntries) {
        overrides[entry.id] = {
          depuis: isFiniteNumber(quote.sinceChange) ? round2(quote.sinceChange) : entry.depuis,
          ytd: isFiniteNumber(quote.ytdChange) ? round2(quote.ytdChange) : entry.ytd,
        };
      }
    }

    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  return overrides;
}
