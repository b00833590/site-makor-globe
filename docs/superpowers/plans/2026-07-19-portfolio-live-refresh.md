# Actualisation en direct DEPUIS/YTD du portefeuille (lecture seule) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the portfolio table's DEPUIS/YTD columns fresh by polling the external Yahoo/Apps Script quote API in the browser, on a 5-minute cycle, for every visible entry that has a resolvable symbol — mirroring production's `refreshPortfolioQuotesOnce` behavior but **strictly client-side**: fetched values only ever override what's rendered in memory, never written back to Firestore or `db`.

**Architecture:** A pure data layer resolves and shapes the live values (`webapp/src/data/portfolioLiveQuotes.js`), built on a new `fetchQuoteSince` added to the existing `quoteClient.js` (same injectable-`fetch` pattern as `fetchQuoteHistory`). Date parsing (`JJ/MM` → ISO, assuming the current year) is extracted from `companyChart.js` into a small shared `webapp/src/data/dateUtils.js` so the chart and the live-refresh feature don't duplicate the same regex twice — `companyChart.js` is refactored to call it, with no behavior change (its existing tests must keep passing unmodified). A scheduling layer (`webapp/src/panel/portfolioLiveRefresh.js`) owns the `setInterval` loop and calls the data layer once immediately, then every 5 minutes, with `setInterval`/`clearInterval` and the fetch function all injectable for fast, deterministic tests. `sidePanel.js` gains `updateLiveQuotes(overrides)`: merges `{depuis, ytd}` overrides into the currently-rendered `currentPortfolioEntries` by matching entry `.id`, producing new entry objects (immutable update) and re-rendering the table — overrides for an id not currently on screen are silently ignored, which is what naturally guards against a stale in-flight fetch from a previously-viewed region clobbering the region the user has since switched to. `main.js` restarts the refresh cycle (stop the old one, start a new one against the newly-shown region's entries) every time `renderPanelForCurrentSelection` runs — the closest equivalent, in a globe/region UI, to production's "runs continuously while the entreprises tab is open."

**Tech Stack:** Same as prior plans — vanilla JS + Vite, Vitest with jsdom for DOM components.

## Global Constraints

- Read-only: this plan must not add any Firestore write call anywhere (`setDoc`/`addDoc`/`updateDoc`/`writeBatch` — none of these exist in `webapp/src` today; that must still be true after this plan). Fetched quote data is merged into in-memory render state only, per the user's explicit decision for the whole "cotations en direct" phase (see the read-only note carried over from the company-chart plan).
- External quote API (exact, from production, already used by `quoteClient.js` for `quoteHistory`):
  ```
  https://script.google.com/macros/s/AKfycbyrZE6OqvJ5yJ7qLYj0d3ogytsdx1LZTv7c4sKGjTCkaQhgXy-eW263ncHrClj97y8c/exec
  ```
  This plan adds the `quoteSince` action: `GET {URL}?action=quoteSince&symbol=<encoded>&since=<ISO date>` → `{ sinceChange: number, ytdChange: number, error?: string }` (mirrors production's `fetchQuoteSince`).
- Symbol resolution: an entry's own `symbol` field only (already present on portfolio entries, rendered as the SYMBOLE column — see `portfolioTable.js`). No hardcoded per-company ticker fallback table (production's `PORTFOLIO_TICKERS` existed only to patch legacy data predating the `symbol` field; doesn't apply here). An entry with no `symbol` (empty/whitespace) is skipped — never guessed.
- Date resolution: reuse the entry's existing `date` field (`JJ/MM`, current calendar year — same assumption already used for the company chart).
- Values are rounded to 2 decimals (`Math.round(x * 100) / 100`), matching production's rounding.
- Requests are gentle on the free API: a small delay between each entry's fetch within one refresh cycle (200ms default, matching production), injectable/zeroable in tests so the suite stays fast.
- No visual "live" badge in this plan — the user only asked for the data itself to stay fresh; a UI affordance is a separate, later decision if wanted.
- Do not modify `webapp/src/globe/*`, `webapp/src/data/firestoreClient.js`/`regionMatch.js`/`selectors.js`/`portfolioSelectors.js`, `webapp/src/panel/portfolioSort.js`/`portfolioTable.js`/`chartModal.js`/`companyList.js`, or the repository root `index.html`/`css`/`js`.

---

### Task 1: Shared DD/MM → ISO date helper

**Files:**
- Create: `webapp/src/data/dateUtils.js`
- Create: `webapp/src/data/dateUtils.test.js`
- Modify: `webapp/src/panel/companyChart.js` (refactor `companyPresentationDateISO` to use the new helper — no behavior change)

**Interfaces:**
- Produces: `ddmmToISOThisYear(dateStr: string, now?: Date): string | null`. Used by `companyChart.js` (this task) and Task 3's `portfolioLiveQuotes.js`.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/data/dateUtils.test.js`
```js
import { describe, it, expect } from 'vitest';
import { ddmmToISOThisYear } from './dateUtils.js';

describe('ddmmToISOThisYear', () => {
  it('converts a DD/MM string to an ISO date using the given reference date\'s year', () => {
    expect(ddmmToISOThisYear('16/07', new Date('2026-01-01'))).toBe('2026-07-16');
  });

  it('pads single-digit day and month', () => {
    expect(ddmmToISOThisYear('5/3', new Date('2026-01-01'))).toBe('2026-03-05');
  });

  it('defaults to the current year when no reference date is given', () => {
    const year = new Date().getFullYear();
    expect(ddmmToISOThisYear('01/01')).toBe(`${year}-01-01`);
  });

  it('returns null for an unparseable date string', () => {
    expect(ddmmToISOThisYear('n/a')).toBeNull();
  });

  it('returns null for a non-string input', () => {
    expect(ddmmToISOThisYear(undefined)).toBeNull();
    expect(ddmmToISOThisYear(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/data/dateUtils.test.js`
Expected: FAIL — `Cannot find module './dateUtils.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/data/dateUtils.js`
```js
export function ddmmToISOThisYear(dateStr, now = new Date()) {
  const match = typeof dateStr === 'string' ? /^(\d{1,2})\/(\d{1,2})$/.exec(dateStr.trim()) : null;
  if (!match) return null;

  const day = match[1].padStart(2, '0');
  const month = match[2].padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/data/dateUtils.test.js`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Refactor companyChart.js to use the shared helper**

Modify `webapp/src/panel/companyChart.js` — replace the inline regex parsing in `companyPresentationDateISO` with a call to the new helper (keep `companySymbol` and `buildChartSVG` exactly as they are):
```js
import { ddmmToISOThisYear } from '../data/dateUtils.js';

export function companySymbol(item) {
  return item.yahooSymbol || null;
}

export function companyPresentationDateISO(item, portfolioEntries) {
  const match = portfolioEntries.find(entry => entry.entreprise === item.name);
  if (!match || !match.date) return null;
  return ddmmToISOThisYear(match.date);
}
```

- [ ] **Step 6: Run companyChart's existing tests to verify nothing broke**

Run: `cd webapp && npx vitest run src/panel/companyChart.test.js`
Expected: PASS — all existing tests pass unchanged (pure refactor, identical behavior).

- [ ] **Step 7: Commit**

```bash
git add webapp/src/data/dateUtils.js webapp/src/data/dateUtils.test.js webapp/src/panel/companyChart.js
git commit -m "refactor: extract shared DD/MM-to-ISO date helper"
```

---

### Task 2: `quoteSince` API client

**Files:**
- Modify: `webapp/src/data/quoteClient.js`
- Modify: `webapp/src/data/quoteClient.test.js`

**Interfaces:**
- Produces: `fetchQuoteSince(symbol: string, sinceISO: string, fetchFn = fetch): Promise<{sinceChange, ytdChange} | null>`. Used by Task 3's `portfolioLiveQuotes.js`.

- [ ] **Step 1: Add the failing tests**

Add to `webapp/src/data/quoteClient.test.js` (extend the existing import, keep the `buildQuoteUrl`/`fetchQuoteHistory` describe blocks unchanged):
```js
import { fetchQuoteSince } from './quoteClient.js'; // add to the existing import line instead of duplicating it

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/data/quoteClient.test.js`
Expected: FAIL — `fetchQuoteSince is not a function` (or undefined); the pre-existing `buildQuoteUrl`/`fetchQuoteHistory` tests still pass.

- [ ] **Step 3: Write the implementation**

Add to `webapp/src/data/quoteClient.js` (keep `buildQuoteUrl`/`fetchQuoteHistory` exactly as they are, add this below them):
```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/data/quoteClient.test.js`
Expected: PASS — 10 tests passed (existing 6 plus these 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/data/quoteClient.js webapp/src/data/quoteClient.test.js
git commit -m "feat: add quoteSince API client"
```

---

### Task 3: Portfolio live quote resolver

**Files:**
- Create: `webapp/src/data/portfolioLiveQuotes.js`
- Create: `webapp/src/data/portfolioLiveQuotes.test.js`

**Interfaces:**
- Consumes: portfolio entries (shape from `portfolioSelectors.js`, has `.id`/`.date`/`.symbol`/`.depuis`/`.ytd`), `fetchQuoteSince` (Task 2).
- Produces: `portfolioEntrySymbol(entry): string | null` and `fetchPortfolioLiveQuotes(entries, fetchQuoteSinceFn, options?): Promise<Record<string, {depuis: number, ytd: number}>>`. Used by Task 4's scheduler.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/data/portfolioLiveQuotes.test.js`
```js
import { describe, it, expect, vi } from 'vitest';
import { fetchPortfolioLiveQuotes, portfolioEntrySymbol } from './portfolioLiveQuotes.js';

describe('portfolioEntrySymbol', () => {
  it('returns the trimmed symbol field when present', () => {
    expect(portfolioEntrySymbol({ symbol: ' NVT ' })).toBe('NVT');
  });

  it('returns null when symbol is missing or blank', () => {
    expect(portfolioEntrySymbol({})).toBeNull();
    expect(portfolioEntrySymbol({ symbol: '   ' })).toBeNull();
  });
});

describe('fetchPortfolioLiveQuotes', () => {
  const NOW = new Date('2026-07-19');

  it('fetches a quote for each entry with a resolvable symbol and returns overrides keyed by entry id', async () => {
    const entries = [
      { id: 'p1', date: '16/07', symbol: 'NVT', depuis: 1, ytd: 1 },
      { id: 'p2', date: '01/01', symbol: 'CECO', depuis: 2, ytd: 2 },
    ];
    const fetchQuoteSinceFn = vi.fn()
      .mockResolvedValueOnce({ sinceChange: 3.456, ytdChange: 7.891 })
      .mockResolvedValueOnce({ sinceChange: -1.2, ytdChange: 0.5 });

    const overrides = await fetchPortfolioLiveQuotes(entries, fetchQuoteSinceFn, { now: NOW, delayMs: 0 });

    expect(fetchQuoteSinceFn).toHaveBeenNthCalledWith(1, 'NVT', '2026-07-16');
    expect(fetchQuoteSinceFn).toHaveBeenNthCalledWith(2, 'CECO', '2026-01-01');
    expect(overrides).toEqual({
      p1: { depuis: 3.46, ytd: 7.89 },
      p2: { depuis: -1.2, ytd: 0.5 },
    });
  });

  it('skips entries with no resolvable symbol without calling fetch for them', async () => {
    const entries = [{ id: 'p1', date: '16/07', symbol: '', depuis: 1, ytd: 1 }];
    const fetchQuoteSinceFn = vi.fn();
    const overrides = await fetchPortfolioLiveQuotes(entries, fetchQuoteSinceFn, { now: NOW, delayMs: 0 });
    expect(fetchQuoteSinceFn).not.toHaveBeenCalled();
    expect(overrides).toEqual({});
  });

  it('omits an entry from the overrides when its quote fetch fails (returns null)', async () => {
    const entries = [{ id: 'p1', date: '16/07', symbol: 'NVT', depuis: 1, ytd: 1 }];
    const fetchQuoteSinceFn = vi.fn().mockResolvedValue(null);
    const overrides = await fetchPortfolioLiveQuotes(entries, fetchQuoteSinceFn, { now: NOW, delayMs: 0 });
    expect(overrides).toEqual({});
  });

  it('falls back to the entry\'s existing depuis/ytd when the API response omits one of the fields', async () => {
    const entries = [{ id: 'p1', date: '16/07', symbol: 'NVT', depuis: 1, ytd: 1 }];
    const fetchQuoteSinceFn = vi.fn().mockResolvedValue({ ytdChange: 4 });
    const overrides = await fetchPortfolioLiveQuotes(entries, fetchQuoteSinceFn, { now: NOW, delayMs: 0 });
    expect(overrides).toEqual({ p1: { depuis: 1, ytd: 4 } });
  });

  it('stops iterating once shouldContinue returns false', async () => {
    const entries = [
      { id: 'p1', date: '16/07', symbol: 'NVT', depuis: 1, ytd: 1 },
      { id: 'p2', date: '01/01', symbol: 'CECO', depuis: 2, ytd: 2 },
    ];
    const fetchQuoteSinceFn = vi.fn().mockResolvedValue({ sinceChange: 1, ytdChange: 1 });
    let calls = 0;
    const shouldContinue = () => { calls += 1; return calls <= 1; };
    const overrides = await fetchPortfolioLiveQuotes(entries, fetchQuoteSinceFn, { now: NOW, delayMs: 0, shouldContinue });
    expect(fetchQuoteSinceFn).toHaveBeenCalledTimes(1);
    expect(Object.keys(overrides)).toEqual(['p1']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/data/portfolioLiveQuotes.test.js`
Expected: FAIL — `Cannot find module './portfolioLiveQuotes.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/data/portfolioLiveQuotes.js`
```js
import { ddmmToISOThisYear } from './dateUtils.js';

const ROUND_FACTOR = 100;
const DEFAULT_DELAY_MS = 200;

function round2(value) {
  return Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
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

  for (const entry of entries) {
    if (!shouldContinue()) break;

    const symbol = portfolioEntrySymbol(entry);
    if (!symbol) continue;

    const sinceISO = ddmmToISOThisYear(entry.date, now);
    const quote = await fetchQuoteSinceFn(symbol, sinceISO);
    if (quote) {
      overrides[entry.id] = {
        depuis: quote.sinceChange === undefined ? entry.depuis : round2(quote.sinceChange),
        ytd: quote.ytdChange === undefined ? entry.ytd : round2(quote.ytdChange),
      };
    }

    if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  return overrides;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/data/portfolioLiveQuotes.test.js`
Expected: PASS — 7 tests passed.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/data/portfolioLiveQuotes.js webapp/src/data/portfolioLiveQuotes.test.js
git commit -m "feat: add portfolio live quote resolver"
```

---

### Task 4: Portfolio live refresh scheduler

**Files:**
- Create: `webapp/src/panel/portfolioLiveRefresh.js`
- Create: `webapp/src/panel/portfolioLiveRefresh.test.js`

**Interfaces:**
- Consumes: `fetchPortfolioLiveQuotes` (Task 3), `fetchQuoteSince` (Task 2, as the default `fetchQuoteSinceFn`).
- Produces: `startPortfolioLiveRefresh({ getEntries, onOverrides, fetchQuoteSinceFn?, intervalMs?, delayMs?, setIntervalFn?, clearIntervalFn? }): { stop(): void }`. Used by Task 6's `main.js` wiring.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/panel/portfolioLiveRefresh.test.js`
```js
import { describe, it, expect, vi } from 'vitest';
import { startPortfolioLiveRefresh } from './portfolioLiveRefresh.js';

describe('startPortfolioLiveRefresh', () => {
  it('runs an immediate refresh cycle and applies the resulting overrides', async () => {
    const entries = [{ id: 'p1', date: '16/07', symbol: 'NVT', depuis: 1, ytd: 1 }];
    const fetchQuoteSinceFn = vi.fn().mockResolvedValue({ sinceChange: 2, ytdChange: 3 });
    const onOverrides = vi.fn();

    startPortfolioLiveRefresh({
      getEntries: () => entries,
      onOverrides,
      fetchQuoteSinceFn,
      delayMs: 0,
      setIntervalFn: () => 1,
      clearIntervalFn: () => {},
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(onOverrides).toHaveBeenCalledWith({ p1: { depuis: 2, ytd: 3 } });
  });

  it('does not call onOverrides when the cycle produces no overrides', async () => {
    const onOverrides = vi.fn();
    startPortfolioLiveRefresh({
      getEntries: () => [],
      onOverrides,
      fetchQuoteSinceFn: vi.fn(),
      delayMs: 0,
      setIntervalFn: () => 1,
      clearIntervalFn: () => {},
    });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(onOverrides).not.toHaveBeenCalled();
  });

  it('schedules a recurring cycle at the given interval via the injected setIntervalFn', () => {
    const setIntervalFn = vi.fn(() => 42);
    startPortfolioLiveRefresh({
      getEntries: () => [],
      onOverrides: () => {},
      fetchQuoteSinceFn: vi.fn(),
      intervalMs: 60000,
      delayMs: 0,
      setIntervalFn,
      clearIntervalFn: () => {},
    });
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 60000);
  });

  it('stop() clears the interval and prevents an in-flight cycle from applying overrides', async () => {
    let resolveQuote;
    const fetchQuoteSinceFn = vi.fn(() => new Promise(resolve => { resolveQuote = resolve; }));
    const onOverrides = vi.fn();
    const clearIntervalFn = vi.fn();
    const entries = [{ id: 'p1', date: '16/07', symbol: 'NVT', depuis: 1, ytd: 1 }];

    const handle = startPortfolioLiveRefresh({
      getEntries: () => entries,
      onOverrides,
      fetchQuoteSinceFn,
      delayMs: 0,
      setIntervalFn: () => 7,
      clearIntervalFn,
    });
    handle.stop();
    resolveQuote({ sinceChange: 1, ytdChange: 1 });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(clearIntervalFn).toHaveBeenCalledWith(7);
    expect(onOverrides).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/portfolioLiveRefresh.test.js`
Expected: FAIL — `Cannot find module './portfolioLiveRefresh.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/panel/portfolioLiveRefresh.js`
```js
import { fetchPortfolioLiveQuotes } from '../data/portfolioLiveQuotes.js';
import { fetchQuoteSince as defaultFetchQuoteSince } from '../data/quoteClient.js';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/portfolioLiveRefresh.test.js`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/panel/portfolioLiveRefresh.js webapp/src/panel/portfolioLiveRefresh.test.js
git commit -m "feat: add portfolio live refresh scheduler"
```

---

### Task 5: Wire live quote overrides into the side panel

**Files:**
- Modify: `webapp/src/panel/sidePanel.js`
- Modify: `webapp/src/panel/sidePanel.test.js`

**Interfaces:**
- Produces: `updateLiveQuotes(overrides: Record<string, {depuis, ytd}>): void` added to `initSidePanel`'s returned object. Used by Task 6's `main.js` wiring.

- [ ] **Step 1: Add the failing tests**

Add to `webapp/src/panel/sidePanel.test.js`, inside the existing `describe('initSidePanel', ...)` block, alongside the other portfolio tests:
```js
  it('applies live quote overrides to matching portfolio entries and re-renders the table', () => {
    panel.showRegion('Asie', {
      marketItems: [], newsItems: [], companyItems: [],
      portfolioRegionLabel: 'Asie',
      portfolioEntries: [
        { id: 'p1', date: '20/06', entreprise: 'A', stagiaire: 'X', symbol: 'A', depuis: 1, ytd: 1 },
        { id: 'p2', date: '01/01', entreprise: 'B', stagiaire: 'Y', symbol: 'B', depuis: 2, ytd: 2 },
      ],
    });

    panel.updateLiveQuotes({ p1: { depuis: 9.9, ytd: 8.8 } });

    const rows = [...portfolioEl.querySelectorAll('tbody tr')];
    const rowA = rows.find(r => r.cells[1].textContent === 'A'); // ENTREPRISE column
    expect(rowA.textContent).toContain('9.9%');
    expect(rowA.textContent).toContain('8.8%');
  });

  it('ignores overrides for entry ids not present in the currently shown portfolio', () => {
    panel.showRegion('Asie', {
      marketItems: [], newsItems: [], companyItems: [],
      portfolioRegionLabel: 'Asie',
      portfolioEntries: [{ id: 'p1', date: '20/06', entreprise: 'A', stagiaire: 'X', symbol: 'A', depuis: 1, ytd: 1 }],
    });

    expect(() => panel.updateLiveQuotes({ 'stale-id': { depuis: 9.9, ytd: 8.8 } })).not.toThrow();
    expect(portfolioEl.querySelector('tbody tr').textContent).toContain('1%');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: FAIL — `panel.updateLiveQuotes is not a function`; all other existing tests still pass.

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/panel/sidePanel.js` — add `updateLiveQuotes` and return it alongside `showRegion` (everything else in the file stays exactly as it is):
```js
  function updateLiveQuotes(overrides) {
    currentPortfolioEntries = currentPortfolioEntries.map(entry =>
      overrides[entry.id] ? { ...entry, ...overrides[entry.id] } : entry
    );
    renderPortfolioSection();
  }

  return { showRegion, updateLiveQuotes };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: PASS — 17 tests passed (existing 15 plus these 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/panel/sidePanel.js webapp/src/panel/sidePanel.test.js
git commit -m "feat: apply live quote overrides in the side panel"
```

---

### Task 6: Wire the refresh cycle into the app and verify end-to-end

**Files:**
- Modify: `webapp/src/main.js`

**Interfaces:**
- Consumes: `startPortfolioLiveRefresh` (Task 4), `updateLiveQuotes` (Task 5).
- Produces: the running application. Final deliverable of this plan.

- [ ] **Step 1: Wire the scheduler into `main.js`**

Modify `webapp/src/main.js`:

Add the import alongside the existing ones:
```js
import { startPortfolioLiveRefresh } from './panel/portfolioLiveRefresh.js';
```

Add a variable to hold the active refresh handle, next to the other top-level `let` state:
```js
let liveRefreshHandle = null;
```

At the end of `renderPanelForCurrentSelection`, after the existing `panel.showRegion(...)` call, restart the live refresh cycle against the region just shown:
```js
function renderPanelForCurrentSelection() {
  if (!activeWeekId) return;
  const region = REGIONS.find(r => r.id === activeRegionId);
  const portfolioRegion = getPortfolioRegion(db, activeRegionId);
  const portfolioEntries = getPortfolioEntriesForRegion(db, activeRegionId);
  currentPortfolioEntriesForChart = portfolioEntries;
  panel.showRegion(region.label, {
    marketItems: getMarketItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    newsItems: getNewsItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    companyItems: getCompanyItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    portfolioRegionLabel: portfolioRegion ? portfolioRegion.label : '',
    portfolioEntries,
  });

  if (liveRefreshHandle) liveRefreshHandle.stop();
  liveRefreshHandle = startPortfolioLiveRefresh({
    getEntries: () => portfolioEntries,
    onOverrides: overrides => panel.updateLiveQuotes(overrides),
  });
}
```

(No new test file — `main.js` has no unit tests in this codebase, matching the precedent from every earlier plan; this wiring is exercised by manual verification below.)

- [ ] **Step 2: Run the full automated test suite**

Run: `cd webapp && npm test`
Expected: PASS — all tests across every test file pass, 0 failures (151 tests: the prior 129 + 5 from Task 1 + 4 from Task 2 + 7 from Task 3 + 4 from Task 4 + 2 from Task 5).

- [ ] **Step 3: Manual browser verification**

Run: `cd webapp && npm run dev`, then open the printed local URL in a browser, with the Network tab open.

Checklist:
- [ ] Selecting a region with portfolio entries that have `symbol` values triggers `quoteSince` requests to `script.google.com` shortly after the table renders (one request per entry with a resolvable symbol, staggered ~200ms apart).
- [ ] After the requests resolve, any DEPUIS/YTD values that changed update in the table without a page reload.
- [ ] No request to any Firestore endpoint fires as a result of this refresh (only the initial page-load read) — confirm in the Network tab that `firestore.googleapis.com` only appears once, at load.
- [ ] Switching to a different region stops further requests for the previous region's symbols and starts a fresh cycle for the new region's entries.
- [ ] An entry with no `symbol` value is not requested (no matching URL in the Network tab for it).
- [ ] No console errors during any of the above.

- [ ] **Step 4: Verify the production build still works**

Run: `cd webapp && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/main.js
git commit -m "feat: wire portfolio live refresh into the app"
```

---

## End of Plan

At this point the portfolio table's DEPUIS/YTD figures stay fresh via a client-side-only polling loop, with no Firestore writes anywhere in `webapp/`. Still pending: PDF export, the IA & Fintech panel (floating icon), the password-protected admin/edit UI (the first place Firestore writes would appear in this rebuild), a final visual-theme + mobile-fallback pass, and the eventual production cutover replacing the root `index.html`. Each remains a separate, later plan.
