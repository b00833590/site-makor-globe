import { fetchPortfolioLiveQuotes } from '../data/portfolioLiveQuotes.js';
import { fetchQuoteSince as defaultFetchQuoteSince } from '../data/quoteClient.js';

// 15 min (was 5): the "Depuis / YTD since presentation" percentages don't need
// minute-fresh quotes, and every open tab was firing ~1 request per portfolio
// row every 5 min against a shared Google Apps Script bound by a daily
// UrlFetchApp quota — a few tabs left open all day exhausted it. See also the
// per-symbol dedup in portfolioLiveQuotes.js and the script-side cache.
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

export function startPortfolioLiveRefresh({
  getEntries,
  onOverrides,
  fetchQuoteSinceFn = defaultFetchQuoteSince,
  intervalMs = DEFAULT_INTERVAL_MS,
  delayMs,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  let stopped = false;

  async function runCycle() {
    const overrides = await fetchPortfolioLiveQuotes(getEntries(), fetchQuoteSinceFn, {
      shouldContinue: () => !stopped,
      ...(delayMs !== undefined ? { delayMs } : {}),
    });
    if (!stopped && Object.keys(overrides).length > 0) onOverrides(overrides);
  }

  runCycle();
  const timerId = setIntervalFn(runCycle, intervalMs);

  return {
    stop() {
      stopped = true;
      clearIntervalFn(timerId);
    },
  };
}
