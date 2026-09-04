# Graphique entreprise (📈, lecture seule) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 📈 icon (deferred from the entreprises plan) to every company card: clicking it opens a modal showing a price-history sparkline since the company's presentation date, fetched from the production site's external Yahoo/Apps Script quote API.

**Architecture:** A new `webapp/src/data/quoteClient.js` wraps the external quote API with an injectable-`fetch` pattern (matching `firestoreClient.js`'s `loadAllWithRetry` precedent), so the HTTP call itself is untested I/O but URL-building is a pure, tested function. `webapp/src/panel/companyChart.js` holds two pure pieces: resolving which Yahoo symbol and start date to use for a given company (cross-referencing the portfolio entries built in the previous plan), and building an SVG sparkline from the API's price points. `webapp/src/panel/chartModal.js` is the DOM/async orchestration that ties a click to a fetch to a render. `companyList.js`'s `renderCompanies` signature changes from a bare `onToggle` callback to an options object `{ onToggle, onOpenChart }` (a refactor recommended by the previous plan's final review, done now while adding the chart button rather than later). Strictly read-only: no Firestore writes anywhere — the fetched quote data is only ever rendered, never persisted.

**Tech Stack:** Same as prior plans — vanilla JS + Vite, Vitest with jsdom for DOM components.

## Global Constraints

- Read-only: no Firestore writes, no edit-mode UI. Fetched quote data is displayed and discarded, never written back to `db` or Firestore (this is the user's explicit decision for this whole "cotations en direct" phase, not just this plan).
- External quote API (exact, from production):
  ```
  https://script.google.com/macros/s/AKfycbyrZE6OqvJ5yJ7qLYj0d3ogytsdx1LZTv7c4sKGjTCkaQhgXy-eW263ncHrClj97y8c/exec
  ```
  This plan only calls the `quoteHistory` action: `GET {URL}?action=quoteHistory&symbol=<encoded>&since=<ISO date>` → `{ points: [{date: 'YYYY-MM-DD', close: number}, ...], error?: string }`. The `quote`/`quoteSince` actions are out of scope for this plan (needed by a later portfolio-auto-refresh plan, not by the chart).
  This is a public, unauthenticated endpoint (no API key, no secret) — nothing here is sensitive to expose in client code.
- Symbol resolution: a company's own `yahooSymbol` field (already present on entreprises items from an earlier plan) is the only source used — no hardcoded per-company ticker fallback tables (those existed in production only to patch legacy pre-`yahooSymbol` data, which doesn't apply to a fresh read of current Firestore data).
- Presentation-date resolution: cross-reference the portfolio entries for the region (built in the previous plan) by matching `entry.entreprise === companyItem.name`; use that entry's `date` field (`JJ/MM`, assume the current calendar year — this is an internal weekly-tracking tool, dates are never more than a few months old). If no matching entry or no parseable date exists, the chart cannot be shown — this is a normal, expected state (a company presented this week with no portfolio entry yet), not an error.
- Never build the modal or chart with `innerHTML` from stored/fetched data — `textContent`/DOM APIs (including `createElementNS` for SVG) only.
- Brand palette (exact hex, reused): `--navy: #0f1730`, `--gold-light: #e0b53d`.
- `companyList.js`'s `renderCompanies` signature changes to accept an options object as its 4th argument instead of a bare function — this touches its existing tests and its one call site in `sidePanel.js`. `renderComparison` and `compareSelection.js` are unaffected and must not be modified.
- Do not modify `webapp/src/globe/*`, the repository root `index.html`/`css`/`js`, `webapp/src/data/firestoreClient.js`/`regionMatch.js`/`selectors.js`/`portfolioSelectors.js`, or `webapp/src/panel/portfolioSort.js`/`portfolioTable.js`.

---

### Task 1: Quote API client

**Files:**
- Create: `webapp/src/data/quoteClient.js`
- Create: `webapp/src/data/quoteClient.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `buildQuoteUrl(action: string, params: Record<string,string>): string` and `fetchQuoteHistory(symbol: string, sinceISO: string, fetchFn = fetch): Promise<{points: {date,close}[]} | null>`. Task 4 calls `fetchQuoteHistory` (with the real global `fetch`, so the `fetchFn` parameter is never passed explicitly in production code — it exists purely so tests can inject a fake).

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/data/quoteClient.test.js`
```js
import { describe, it, expect, vi } from 'vitest';
import { buildQuoteUrl, fetchQuoteHistory } from './quoteClient.js';

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/data/quoteClient.test.js`
Expected: FAIL — `Cannot find module './quoteClient.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/data/quoteClient.js`
```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/data/quoteClient.test.js`
Expected: PASS — 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/data/quoteClient.js webapp/src/data/quoteClient.test.js
git commit -m "feat: add quote history API client"
```

---

### Task 2: Company symbol and presentation-date resolution

**Files:**
- Create: `webapp/src/panel/companyChart.js`
- Create: `webapp/src/panel/companyChart.test.js`

**Interfaces:**
- Consumes: a company item object (the shape from the entreprises plan's selector, has `.name`/`.yahooSymbol`) and an array of portfolio entries (the shape from the portfolio plan's selector, has `.entreprise`/`.date`).
- Produces: `companySymbol(item): string | null` and `companyPresentationDateISO(item, portfolioEntries): string | null`. Task 4 calls both.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/panel/companyChart.test.js`
```js
import { describe, it, expect } from 'vitest';
import { companySymbol, companyPresentationDateISO } from './companyChart.js';

describe('companySymbol', () => {
  it('returns the yahooSymbol field when present', () => {
    expect(companySymbol({ name: 'Evergreen Marine', yahooSymbol: '2603.TW' })).toBe('2603.TW');
  });

  it('returns null when yahooSymbol is missing', () => {
    expect(companySymbol({ name: 'Mystery Co' })).toBeNull();
  });

  it('returns null when yahooSymbol is an empty string', () => {
    expect(companySymbol({ name: 'Mystery Co', yahooSymbol: '' })).toBeNull();
  });
});

describe('companyPresentationDateISO', () => {
  const CURRENT_YEAR = new Date().getFullYear();
  const PORTFOLIO_ENTRIES = [
    { entreprise: 'Evergreen Marine', date: '16/07' },
    { entreprise: 'Geely Automobile Holdings Ltd', date: 'n/a' },
  ];

  it('resolves the ISO date from a matching portfolio entry', () => {
    expect(companyPresentationDateISO({ name: 'Evergreen Marine' }, PORTFOLIO_ENTRIES))
      .toBe(`${CURRENT_YEAR}-07-16`);
  });

  it('returns null when no portfolio entry matches the company name', () => {
    expect(companyPresentationDateISO({ name: 'Unknown Co' }, PORTFOLIO_ENTRIES)).toBeNull();
  });

  it('returns null when the matching entry has an unparseable date', () => {
    expect(companyPresentationDateISO({ name: 'Geely Automobile Holdings Ltd' }, PORTFOLIO_ENTRIES)).toBeNull();
  });

  it('returns null when given an empty portfolio entries list', () => {
    expect(companyPresentationDateISO({ name: 'Evergreen Marine' }, [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/companyChart.test.js`
Expected: FAIL — `Cannot find module './companyChart.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/panel/companyChart.js`
```js
export function companySymbol(item) {
  return item.yahooSymbol || null;
}

export function companyPresentationDateISO(item, portfolioEntries) {
  const match = portfolioEntries.find(entry => entry.entreprise === item.name);
  if (!match || !match.date) return null;

  const parsed = /^(\d{1,2})\/(\d{1,2})$/.exec(match.date.trim());
  if (!parsed) return null;

  const day = parsed[1].padStart(2, '0');
  const month = parsed[2].padStart(2, '0');
  const year = new Date().getFullYear();
  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/companyChart.test.js`
Expected: PASS — 7 tests passed.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/panel/companyChart.js webapp/src/panel/companyChart.test.js
git commit -m "feat: resolve company Yahoo symbol and presentation date for charting"
```

---

### Task 3: Sparkline SVG builder

**Files:**
- Modify: `webapp/src/panel/companyChart.js`
- Modify: `webapp/src/panel/companyChart.test.js`

**Interfaces:**
- Consumes: an array of `{date, close}` points (the shape `fetchQuoteHistory` resolves to).
- Produces: `buildChartSVG(points, options?): SVGElement | null`. Task 4 calls this and appends the returned element to the modal's DOM.

- [ ] **Step 1: Add the failing tests**

Add to `webapp/src/panel/companyChart.test.js` (keep the existing `companySymbol`/`companyPresentationDateISO` tests unchanged, add this alongside them):
```js
// @vitest-environment jsdom
```
Add this line as the very first line of the file (before the existing `import` statements) — jsdom is needed for this file's new SVG-DOM tests, and the existing pure-function tests run fine under jsdom too, so no test needs to move to a different file.

Add the import: `import { ..., buildChartSVG } from './companyChart.js';` (extend the existing import, don't duplicate it).

Add this new `describe` block:
```js
describe('buildChartSVG', () => {
  it('returns null when given fewer than 2 points', () => {
    expect(buildChartSVG([])).toBeNull();
    expect(buildChartSVG([{ date: '2026-01-01', close: 100 }])).toBeNull();
  });

  it('returns an SVG element with a polyline containing one coordinate per point', () => {
    const svg = buildChartSVG([
      { date: '2026-01-01', close: 100 },
      { date: '2026-01-02', close: 110 },
      { date: '2026-01-03', close: 90 },
    ]);
    expect(svg.tagName.toLowerCase()).toBe('svg');
    const polyline = svg.querySelector('polyline');
    expect(polyline).not.toBeNull();
    expect(polyline.getAttribute('points').trim().split(' ')).toHaveLength(3);
  });

  it('uses the brand gold-light color for the line stroke', () => {
    const svg = buildChartSVG([
      { date: '2026-01-01', close: 100 },
      { date: '2026-01-02', close: 110 },
    ]);
    expect(svg.querySelector('polyline').getAttribute('stroke')).toBe('#e0b53d');
  });

  it('handles a flat price series (identical close values) without dividing by zero', () => {
    const svg = buildChartSVG([
      { date: '2026-01-01', close: 50 },
      { date: '2026-01-02', close: 50 },
    ]);
    const points = svg.querySelector('polyline').getAttribute('points');
    expect(points).not.toContain('NaN');
    expect(points).not.toContain('Infinity');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/companyChart.test.js`
Expected: FAIL — `buildChartSVG is not a function` (or `undefined`); the pre-existing `companySymbol`/`companyPresentationDateISO` tests still pass.

- [ ] **Step 3: Write the implementation**

Add to `webapp/src/panel/companyChart.js` (keep `companySymbol`/`companyPresentationDateISO` exactly as they are, add this below them):
```js
const SVG_NS = 'http://www.w3.org/2000/svg';
const CHART_WIDTH = 280;
const CHART_HEIGHT = 80;
const CHART_STROKE_COLOR = '#e0b53d';

export function buildChartSVG(points, { width = CHART_WIDTH, height = CHART_HEIGHT } = {}) {
  if (!points || points.length < 2) return null;

  const closes = points.map(p => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);

  const coords = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p.close - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  const polyline = document.createElementNS(SVG_NS, 'polyline');
  polyline.setAttribute('points', coords);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', CHART_STROKE_COLOR);
  polyline.setAttribute('stroke-width', '2');
  svg.appendChild(polyline);

  return svg;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/companyChart.test.js`
Expected: PASS — 11 tests passed (the existing 7 plus these 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/panel/companyChart.js webapp/src/panel/companyChart.test.js
git commit -m "feat: add sparkline SVG builder for the company chart"
```

---

### Task 4: Chart modal component

**Files:**
- Create: `webapp/src/panel/chartModal.js`
- Create: `webapp/src/panel/chartModal.test.js`
- Create: `webapp/src/panel/chartModal.css`

**Interfaces:**
- Consumes: pre-existing DOM elements, `fetchQuoteHistory` (Task 1), `companySymbol`/`companyPresentationDateISO`/`buildChartSVG` (Tasks 2-3).
- Produces: `initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn? }): { open(item, portfolioEntries): Promise<void>, close(): void }`. Task 6 calls this and wires `open` to the 📈 button.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/panel/chartModal.test.js`
```js
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initCompanyChartModal } from './chartModal.js';

function makeElements() {
  return {
    modalEl: document.createElement('div'),
    titleEl: document.createElement('span'),
    bodyEl: document.createElement('div'),
  };
}

const CURRENT_YEAR = new Date().getFullYear();
const COMPANY = { name: 'Evergreen Marine', yahooSymbol: '2603.TW' };
const PORTFOLIO_ENTRIES = [{ entreprise: 'Evergreen Marine', date: '16/07' }];

describe('initCompanyChartModal', () => {
  it('opens the modal and sets the title immediately, before the fetch resolves', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn(() => new Promise(() => {})); // never resolves
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(modalEl.classList.contains('open')).toBe(true);
    expect(titleEl.textContent).toBe('Evergreen Marine');
  });

  it('renders a chart once the fetch resolves with points', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-07-16', close: 6.2 }, { date: '2026-07-17', close: 6.5 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.querySelector('svg')).not.toBeNull();
    expect(fetchQuoteHistoryFn).toHaveBeenCalledWith('2603.TW', `${CURRENT_YEAR}-07-16`);
  });

  it('shows a message instead of calling fetch when the company has no resolvable symbol/date', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn();
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    await modal.open({ name: 'No Symbol Co' }, PORTFOLIO_ENTRIES);
    expect(fetchQuoteHistoryFn).not.toHaveBeenCalled();
    expect(bodyEl.textContent.length).toBeGreaterThan(0);
    expect(bodyEl.querySelector('svg')).toBeNull();
  });

  it('shows a message when the fetch resolves with no usable data', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue(null);
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.textContent.length).toBeGreaterThan(0);
    expect(bodyEl.querySelector('svg')).toBeNull();
  });

  it('closes the modal and clears the body', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-07-16', close: 6.2 }, { date: '2026-07-17', close: 6.5 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    modal.close();
    expect(modalEl.classList.contains('open')).toBe(false);
    expect(bodyEl.children.length).toBe(0);
  });

  it('never interprets the company name as HTML', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn: vi.fn() });
    await modal.open({ name: '<img src=x onerror=alert(1)>' }, []);
    expect(titleEl.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(titleEl.querySelector('img')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/chartModal.test.js`
Expected: FAIL — `Cannot find module './chartModal.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/panel/chartModal.js`
```js
import { fetchQuoteHistory as defaultFetchQuoteHistory } from '../data/quoteClient.js';
import { companySymbol, companyPresentationDateISO, buildChartSVG } from './companyChart.js';

export function initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn = defaultFetchQuoteHistory }) {
  function close() {
    modalEl.classList.remove('open');
    bodyEl.replaceChildren();
  }

  function showMessage(text) {
    bodyEl.replaceChildren();
    const message = document.createElement('p');
    message.className = 'chart-modal-message';
    message.textContent = text;
    bodyEl.appendChild(message);
  }

  async function open(item, portfolioEntries) {
    titleEl.textContent = item.name;
    bodyEl.replaceChildren();
    modalEl.classList.add('open');

    const symbol = companySymbol(item);
    const sinceISO = companyPresentationDateISO(item, portfolioEntries);

    if (!symbol || !sinceISO) {
      showMessage('Données insuffisantes pour afficher le graphique.');
      return;
    }

    showMessage('Chargement du graphique...');
    const data = await fetchQuoteHistoryFn(symbol, sinceISO);

    if (!data || !data.points || data.points.length < 2) {
      showMessage('Impossible de récupérer les données du cours.');
      return;
    }

    const svg = buildChartSVG(data.points);
    bodyEl.replaceChildren();
    if (svg) bodyEl.appendChild(svg);
  }

  return { open, close };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/chartModal.test.js`
Expected: PASS — 6 tests passed.

- [ ] **Step 5: Write the stylesheet**

File: `webapp/src/panel/chartModal.css`
```css
.chart-modal {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 10;
  align-items: center;
  justify-content: center;
}

.chart-modal.open {
  display: flex;
}

.chart-modal-content {
  background: rgba(15, 23, 48, 0.98);
  border: 1px solid rgba(224, 181, 61, 0.3);
  border-radius: 8px;
  padding: 16px;
  min-width: 320px;
}

.chart-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.chart-modal-header span {
  color: #fff;
  font-weight: bold;
  font-size: 13px;
}

.chart-modal-header button {
  background: transparent;
  border: none;
  color: var(--gold-light, #e0b53d);
  cursor: pointer;
  font-size: 16px;
}

.chart-modal-message {
  color: #b7bdd6;
  font-size: 12px;
  margin: 0;
}
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/panel/chartModal.js webapp/src/panel/chartModal.test.js webapp/src/panel/chartModal.css
git commit -m "feat: add company chart modal"
```

---

### Task 5: Add the 📈 icon to company cards

**Files:**
- Modify: `webapp/src/panel/companyList.js`
- Modify: `webapp/src/panel/companyList.test.js`
- Modify: `webapp/src/panel/companyList.css`

**Interfaces:**
- Consumes: nothing new.
- Produces: `renderCompanies(container, items, selectedIds, { onToggle, onOpenChart })` — **breaking signature change** from the previous plan's `renderCompanies(container, items, selectedIds, onToggle)`. `renderComparison` is unaffected. Task 6 updates the one call site (`sidePanel.js`) to match.

- [ ] **Step 1: Update the existing tests and add new ones**

Modify `webapp/src/panel/companyList.test.js` — every existing call to `renderCompanies(container, items, selectedIds, onToggle)` or `renderCompanies(container, items, selectedIds, () => {})` must become `renderCompanies(container, items, selectedIds, { onToggle, onOpenChart: () => {} })` (wrap the existing 4th argument in an object under the `onToggle` key, add a no-op `onOpenChart`). Go through the file and update each call site — do not change any other test logic or assertions in the existing tests, they should still pass with the same expectations once the call signature is fixed.

Add these new tests to the `describe('renderCompanies', ...)` block:
```js
  it('renders a chart button for each company', () => {
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY_A], [], { onToggle: () => {}, onOpenChart: () => {} });
    const chartBtn = container.querySelector('.panel-chart-toggle');
    expect(chartBtn).not.toBeNull();
    expect(chartBtn.getAttribute('aria-label')).toBe('Graphique Reliance Industries');
  });

  it('calls onOpenChart with the full company item when its chart button is clicked', () => {
    const container = document.createElement('div');
    const onOpenChart = vi.fn();
    renderCompanies(container, [COMPANY_A], [], { onToggle: () => {}, onOpenChart });
    container.querySelector('.panel-chart-toggle').click();
    expect(onOpenChart).toHaveBeenCalledWith(COMPANY_A);
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail and check what breaks**

Run: `cd webapp && npx vitest run src/panel/companyList.test.js`
Expected: FAIL — the 2 new tests fail (no chart button exists yet), and every pre-existing test that calls `renderCompanies` with the old bare-function 4th argument also fails once you've updated their call sites to the new object shape but before implementing it (this is expected RED state — confirms the signature change is real and test-covered, not silently compatible).

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/panel/companyList.js` — update `renderCompanies`'s signature and header-building logic (keep `renderComparison`, `buildStatsGrid`, `buildBulletsList`, and `STAT_FIELDS` exactly as they are):
```js
export function renderCompanies(container, items, selectedIds, { onToggle, onOpenChart }) {
  container.replaceChildren();
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'panel-company-card';

    const header = document.createElement('div');
    header.className = 'panel-company-header';

    const name = document.createElement('span');
    name.className = 'panel-company-name';
    name.textContent = item.name;

    const chartBtn = document.createElement('button');
    chartBtn.type = 'button';
    chartBtn.className = 'panel-chart-toggle';
    chartBtn.textContent = '📈';
    chartBtn.setAttribute('aria-label', `Graphique ${item.name}`);
    chartBtn.addEventListener('click', () => onOpenChart(item));

    const compareBtn = document.createElement('button');
    compareBtn.type = 'button';
    compareBtn.className = 'panel-compare-toggle' + (selectedIds.includes(item.id) ? ' active' : '');
    compareBtn.textContent = '⚖';
    compareBtn.setAttribute('aria-label', `Comparer ${item.name}`);
    compareBtn.addEventListener('click', () => onToggle(item.id));

    header.append(name, chartBtn, compareBtn);

    const sub = document.createElement('div');
    sub.className = 'panel-company-sub';
    sub.textContent = [item.yahooSymbol, item.flag, item.country].filter(Boolean).join(' · ');

    const cap = document.createElement('div');
    cap.className = 'panel-company-cap';
    cap.textContent = item.marketCap ?? '';

    card.append(header, sub, cap, buildStatsGrid(item), buildBulletsList(item));
    container.appendChild(card);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/companyList.test.js`
Expected: PASS — 12 tests passed (the existing 10, all now using the updated call signature, plus these 2 new ones).

- [ ] **Step 5: Add the chart button style**

Modify `webapp/src/panel/companyList.css` — add this rule alongside the existing `.panel-compare-toggle` rules (don't change any existing rule):
```css
.panel-chart-toggle {
  background: transparent;
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: var(--gold-light, #e0b53d);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 3px 6px;
}

.panel-chart-toggle:hover {
  background: rgba(201, 151, 31, 0.2);
}
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/panel/companyList.js webapp/src/panel/companyList.test.js webapp/src/panel/companyList.css
git commit -m "feat: add chart button to company cards"
```

---

### Task 6: Wire the chart modal into the app and verify end-to-end

**Files:**
- Modify: `webapp/src/panel/sidePanel.js`
- Modify: `webapp/src/panel/sidePanel.test.js`
- Modify: `webapp/index.html`
- Modify: `webapp/src/main.js`

**Interfaces:**
- Consumes: `initCompanyChartModal` (Task 4), the updated `renderCompanies` (Task 5).
- Produces: the running application. Final deliverable of this plan.

- [ ] **Step 1: Update sidePanel.js's call to renderCompanies and accept a chart-open callback**

Modify `webapp/src/panel/sidePanel.js` — `initSidePanel` gains one more constructor field, `onOpenChart`, threaded straight through to `renderCompanies`'s options object:
```js
export function initSidePanel({ labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, onOpenChart }) {
```
Update the `renderCompanySection` function's call to `renderCompanies`:
```js
  function renderCompanySection() {
    renderCompanies(companiesEl, currentCompanyItems, selectedCompanyIds, { onToggle: handleToggleCompare, onOpenChart });
    renderComparison(compareEl, currentCompanyItems, selectedCompanyIds);
  }
```
Everything else in the file (portfolio section, comparator state, `showRegion`) stays exactly as it is.

- [ ] **Step 2: Update sidePanel.test.js's setup**

Modify `webapp/src/panel/sidePanel.test.js` — add `onOpenChart: () => {}` to every `initSidePanel({...})` call in the file's `beforeEach` (there should be exactly one, in the shared setup). Every existing test in the file must keep passing unchanged.

- [ ] **Step 3: Run sidePanel's tests to verify nothing broke**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: PASS — all 15 tests still pass (no new tests added in this task — the chart-open wiring is exercised end-to-end in Step 6's manual verification instead, since it requires a real modal DOM structure this test file doesn't set up).

- [ ] **Step 4: Add the modal markup and CSS import**

Modify `webapp/index.html` — add this just before the closing `</body>` tag (after the existing `<aside class="side-panel">...</aside>`, as a sibling, not nested inside it):
```html
  <div id="chart-modal" class="chart-modal">
    <div class="chart-modal-content">
      <div class="chart-modal-header">
        <span id="chart-modal-title"></span>
        <button id="chart-modal-close" type="button" aria-label="Fermer">✕</button>
      </div>
      <div id="chart-modal-body"></div>
    </div>
  </div>
```

Modify `webapp/src/main.js` — add this import line alongside the existing CSS imports:
```js
import './panel/chartModal.css';
```

- [ ] **Step 5: Wire the modal into `main.js`**

Modify `webapp/src/main.js`:

Add the import:
```js
import { initCompanyChartModal } from './panel/chartModal.js';
```

Before the `initSidePanel(...)` call, construct the modal and a variable to hold the current week's portfolio entries for the active region (the modal needs them to resolve a company's presentation date):
```js
const chartModal = initCompanyChartModal({
  modalEl: document.getElementById('chart-modal'),
  titleEl: document.getElementById('chart-modal-title'),
  bodyEl: document.getElementById('chart-modal-body'),
});
document.getElementById('chart-modal-close').addEventListener('click', () => chartModal.close());

let currentPortfolioEntriesForChart = [];
```

Update the `initSidePanel` call to pass `onOpenChart`:
```js
const panel = initSidePanel({
  labelEl: document.getElementById('panel-region-label'),
  indicesEl: document.getElementById('panel-indices'),
  newsEl: document.getElementById('panel-news'),
  companiesEl: document.getElementById('panel-companies'),
  compareEl: document.getElementById('panel-compare'),
  portfolioLabelEl: document.getElementById('panel-portfolio-region-label'),
  portfolioEl: document.getElementById('panel-portfolio'),
  onOpenChart: item => chartModal.open(item, currentPortfolioEntriesForChart),
});
```

Update `renderPanelForCurrentSelection` to keep `currentPortfolioEntriesForChart` in sync (add this line right after the existing `portfolioEntries: getPortfolioEntriesForRegion(db, activeRegionId),` line inside the `panel.showRegion(...)` call — compute it once and reuse):
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
}
```

- [ ] **Step 6: Run the full automated test suite**

Run: `cd webapp && npm test`
Expected: PASS — all tests across every test file pass, 0 failures (129 tests: the prior 104 + 6 from this plan's Task 1 + 7 from Task 2 + 4 from Task 3 + 6 from Task 4 + 2 from Task 5, with the pre-existing `companyList.test.js`/`sidePanel.test.js` counts otherwise unchanged since Task 5/6 only updated their existing tests' call sites, not their count).

- [ ] **Step 7: Manual browser verification**

Run: `cd webapp && npm run dev`, then open the printed local URL in a browser.

Checklist:
- [ ] Each company card in the entreprises section shows both a 📈 button and a ⚖ button.
- [ ] Clicking 📈 on a company that has a matching portfolio entry with a valid date opens the modal immediately with the company's name, shows "Chargement du graphique..." briefly, then renders a gold sparkline line chart (or shows "Impossible de récupérer les données du cours." if the external quote API has no data for that symbol/date — not a crash either way).
- [ ] Clicking 📈 on a company with no matching portfolio entry (or an unparseable date) opens the modal and immediately shows "Données insuffisantes pour afficher le graphique." without attempting a network call (check the Network tab / no request to `script.google.com`).
- [ ] Clicking the ✕ button closes the modal.
- [ ] The ⚖ comparator still works exactly as before (this plan didn't change its behavior, only its call signature internally).
- [ ] No console errors during any of the above interactions.

- [ ] **Step 8: Verify the production build still works**

Run: `cd webapp && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 9: Commit**

```bash
git add webapp/src/panel/sidePanel.js webapp/src/panel/sidePanel.test.js webapp/index.html webapp/src/main.js
git commit -m "feat: wire company chart modal into the app"
```

---

## End of Plan

At this point every company card has a working, read-only price-history chart. Still pending: portfolio DEPUIS/YTD live auto-refresh (polling `fetchQuoteSince` every 5 minutes, local-only per the user's explicit read-only decision — no Firestore writes) and PDF export, both separate follow-up plans. The IA & Fintech panel, the admin/edit UI, and the final visual-theme + mobile-fallback pass remain separate, later plans too.
