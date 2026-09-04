# Suivi de portefeuille (lecture seule, sans cotations en direct) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Suivi de portefeuille" section to the side panel: a sortable table (DATE / ENTREPRISE / STAGIAIRE / SYMBOLE / DEPUIS / YTD) of every portfolio position for the currently selected globe region — independent of the active week, matching production behavior where the portfolio is a running, week-independent history.

**Architecture:** Portfolio data lives in its own key namespace (`mkg:portfolio:*`, `mkg:portfolio-region:*`) with its own region-id scheme that does NOT match the globe's canonical region ids, so a new `webapp/src/data/portfolioSelectors.js` owns both the data lookup and the id translation. Column sorting is pure state-transition logic (`webapp/src/panel/portfolioSort.js`), the table itself is pure DOM rendering (`webapp/src/panel/portfolioTable.js`), and `sidePanel.js` gains one more owned piece of state (current sort field/direction) alongside the comparator state it already owns. Explicitly deferred to a follow-up plan: live quote auto-refresh (DEPUIS/YTD recompute every 5 min via the external Yahoo/Apps Script API), the 📈 company chart icon (needs the same external API and needs this plan's portfolio-entry date lookup), and PDF export — all three share/depend on infrastructure this plan doesn't build yet.

**Tech Stack:** Same as prior plans — vanilla JS + Vite, Vitest with jsdom for DOM components.

## Global Constraints

- Read-only: no Firestore writes, no edit-mode UI.
- Data key prefixes: `mkg:portfolio:<id>` → `{ id, date, entreprise, stagiaire, symbol, regionId, depuis, ytd, createdAt }` (`date` is free-text `JJ/MM`, `depuis`/`ytd` are numeric percentages already stored — this plan displays them as-is, it does not recompute them live). `mkg:portfolio-region:<id>` → `{ id, label, color }`.
- **Portfolio entries are NOT week-scoped** — unlike every other selector built so far (`getMarketItemsForWeekAndRegion` etc.), portfolio selectors take `(db, regionId)` only, no `weekId`. This is intentional, matching production ("Suivi des performances du portefeuille (liste globale, indépendante de la semaine)").
- **Portfolio region ids differ from the globe's canonical region ids** and must be translated via this exact mapping (production's default 4 portfolio regions, verbatim):
  ```js
  {
    asia: 'asie',
    'brics-uk': 'brics-uk',
    europe: 'europe',
    'north-america': 'amerique-du-nord-canada',
  }
  ```
  A globe region with no mapping entry (there isn't one today, but the code must not assume the map is total) returns an empty result, never throws.
- Sort click behavior: clicking the currently-sorted column reverses direction; clicking a different column switches to that column with its own default direction — `date` defaults ascending, `depuis`/`ytd` default descending (matches production). Sort preference persists across region/week switches (unlike the comparator selection from the previous plan, which resets) — a user who sorted by YTD expects it to stay sorted by YTD while browsing regions.
- Never build the table with `innerHTML` from stored data — `textContent`/DOM APIs only.
- Brand palette (exact hex, reused): `--navy: #0f1730`, `--gold: #c9971f`, `--gold-light: #e0b53d`.
- Do not modify `webapp/src/globe/*`, the repository root `index.html`/`css`/`js`, `webapp/src/data/firestoreClient.js`/`regionMatch.js`/`selectors.js`, or `webapp/src/panel/companyList.js`/`compareSelection.js`.

---

### Task 1: Portfolio selectors

**Files:**
- Create: `webapp/src/data/portfolioSelectors.js`
- Create: `webapp/src/data/portfolioSelectors.test.js`

**Interfaces:**
- Consumes: the same flat `db` object shape as the existing selectors.
- Produces: `getPortfolioEntriesForRegion(db, regionId): Array<entry>` and `getPortfolioRegion(db, regionId): {id, label, color} | null`. Task 5 calls both directly.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/data/portfolioSelectors.test.js`
```js
import { describe, it, expect } from 'vitest';
import { getPortfolioEntriesForRegion, getPortfolioRegion } from './portfolioSelectors.js';

const DB = {
  'mkg:portfolio-region:asie': { id: 'asie', label: 'Asie', color: '#16a34a' },
  'mkg:portfolio-region:amerique-du-nord-canada': { id: 'amerique-du-nord-canada', label: 'Amérique du Nord / Canada', color: '#e14b3f' },
  'mkg:portfolio:p1': { id: 'p1', date: '12/03', entreprise: 'Evergreen Marine', stagiaire: 'Léa', symbol: '2603.TW', regionId: 'asie', depuis: 5.2, ytd: 5.0 },
  'mkg:portfolio:p2': { id: 'p2', date: '20/06', entreprise: 'Reliance', stagiaire: 'Tom', symbol: 'RELIANCE.NS', regionId: 'brics-uk', depuis: -2.1, ytd: 3.4 },
  'mkg:portfolio:p3': { id: 'p3', date: '01/01', entreprise: 'Toyota', stagiaire: 'Léa', symbol: '7203.T', regionId: 'asie', depuis: 1.1, ytd: 0.4 },
};

describe('getPortfolioEntriesForRegion', () => {
  it('returns only entries for the globe region mapped to the matching portfolio regionId', () => {
    const entries = getPortfolioEntriesForRegion(DB, 'asia');
    expect(entries.map(e => e.id).sort()).toEqual(['p1', 'p3']);
  });

  it('does not leak entries from a different portfolio region', () => {
    const entries = getPortfolioEntriesForRegion(DB, 'asia');
    expect(entries.some(e => e.id === 'p2')).toBe(false);
  });

  it('translates north-america to amerique-du-nord-canada and returns an empty array when nothing matches', () => {
    expect(getPortfolioEntriesForRegion(DB, 'north-america')).toEqual([]);
  });

  it('returns an empty array for an unmapped region id instead of throwing', () => {
    expect(getPortfolioEntriesForRegion(DB, 'not-a-real-region')).toEqual([]);
  });
});

describe('getPortfolioRegion', () => {
  it('returns the portfolio region document for a mapped globe region', () => {
    expect(getPortfolioRegion(DB, 'asia')).toEqual({ id: 'asie', label: 'Asie', color: '#16a34a' });
  });

  it('returns null when the mapped portfolio region document does not exist in db', () => {
    expect(getPortfolioRegion(DB, 'brics-uk')).toBeNull();
  });

  it('returns null for an unmapped region id instead of throwing', () => {
    expect(getPortfolioRegion(DB, 'not-a-real-region')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/data/portfolioSelectors.test.js`
Expected: FAIL — `Cannot find module './portfolioSelectors.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/data/portfolioSelectors.js`
```js
const PORTFOLIO_REGION_BY_GLOBE_REGION = {
  asia: 'asie',
  'brics-uk': 'brics-uk',
  europe: 'europe',
  'north-america': 'amerique-du-nord-canada',
};

export function getPortfolioEntriesForRegion(db, regionId) {
  const portfolioRegionId = PORTFOLIO_REGION_BY_GLOBE_REGION[regionId];
  if (!portfolioRegionId) return [];
  return Object.keys(db)
    .filter(key => key.startsWith('mkg:portfolio:'))
    .map(key => db[key])
    .filter(entry => entry.regionId === portfolioRegionId);
}

export function getPortfolioRegion(db, regionId) {
  const portfolioRegionId = PORTFOLIO_REGION_BY_GLOBE_REGION[regionId];
  if (!portfolioRegionId) return null;
  return db[`mkg:portfolio-region:${portfolioRegionId}`] || null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/data/portfolioSelectors.test.js`
Expected: PASS — 7 tests passed.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/data/portfolioSelectors.js webapp/src/data/portfolioSelectors.test.js
git commit -m "feat: add portfolio selectors with region-id translation"
```

---

### Task 2: Sort logic

**Files:**
- Create: `webapp/src/panel/portfolioSort.js`
- Create: `webapp/src/panel/portfolioSort.test.js`

**Interfaces:**
- Consumes: an array of portfolio entry objects (Task 1's shape) and a sort field/direction.
- Produces: `sortPortfolioEntries(entries, field, direction): Array<entry>` (new array, doesn't mutate) and `nextSort(currentField, currentDirection, clickedField): {field, direction}`. Task 4 calls both.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/panel/portfolioSort.test.js`
```js
import { describe, it, expect } from 'vitest';
import { sortPortfolioEntries, nextSort } from './portfolioSort.js';

const ENTRIES = [
  { id: 'a', date: '20/06', depuis: -2.1, ytd: 3.4 },
  { id: 'b', date: '01/01', depuis: 5.2, ytd: 5.0 },
  { id: 'c', date: '12/03', depuis: 1.1, ytd: 0.4 },
];

describe('sortPortfolioEntries', () => {
  it('sorts by date ascending (day/month)', () => {
    expect(sortPortfolioEntries(ENTRIES, 'date', 'asc').map(e => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by date descending', () => {
    expect(sortPortfolioEntries(ENTRIES, 'date', 'desc').map(e => e.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts by depuis ascending', () => {
    expect(sortPortfolioEntries(ENTRIES, 'depuis', 'asc').map(e => e.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts by ytd descending', () => {
    expect(sortPortfolioEntries(ENTRIES, 'ytd', 'desc').map(e => e.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate the input array', () => {
    const copy = [...ENTRIES];
    sortPortfolioEntries(ENTRIES, 'date', 'asc');
    expect(ENTRIES).toEqual(copy);
  });

  it('treats an unparseable date as sorting last in ascending order', () => {
    const withBadDate = [...ENTRIES, { id: 'd', date: 'n/a', depuis: 0, ytd: 0 }];
    const sorted = sortPortfolioEntries(withBadDate, 'date', 'asc');
    expect(sorted[sorted.length - 1].id).toBe('d');
  });
});

describe('nextSort', () => {
  it('reverses direction when clicking the currently-sorted column', () => {
    expect(nextSort('date', 'asc', 'date')).toEqual({ field: 'date', direction: 'desc' });
    expect(nextSort('date', 'desc', 'date')).toEqual({ field: 'date', direction: 'asc' });
  });

  it('switches to date with its default ascending direction when clicked fresh', () => {
    expect(nextSort('ytd', 'desc', 'date')).toEqual({ field: 'date', direction: 'asc' });
  });

  it('switches to depuis or ytd with their default descending direction when clicked fresh', () => {
    expect(nextSort('date', 'asc', 'depuis')).toEqual({ field: 'depuis', direction: 'desc' });
    expect(nextSort('date', 'asc', 'ytd')).toEqual({ field: 'ytd', direction: 'desc' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/portfolioSort.test.js`
Expected: FAIL — `Cannot find module './portfolioSort.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/panel/portfolioSort.js`
```js
const DEFAULT_DIRECTION = { date: 'asc', depuis: 'desc', ytd: 'desc' };

function parseDDMM(dateStr) {
  const match = typeof dateStr === 'string' ? /^(\d{1,2})\/(\d{1,2})$/.exec(dateStr.trim()) : null;
  if (!match) return null;
  return Number(match[2]) * 100 + Number(match[1]);
}

function sortValue(entry, field) {
  if (field === 'date') {
    const parsed = parseDDMM(entry.date);
    return parsed === null ? Infinity : parsed;
  }
  const num = Number(entry[field]);
  return Number.isFinite(num) ? num : Infinity;
}

export function sortPortfolioEntries(entries, field, direction) {
  const sign = direction === 'desc' ? -1 : 1;
  return [...entries].sort((a, b) => sign * (sortValue(a, field) - sortValue(b, field)));
}

export function nextSort(currentField, currentDirection, clickedField) {
  if (clickedField === currentField) {
    return { field: clickedField, direction: currentDirection === 'asc' ? 'desc' : 'asc' };
  }
  return { field: clickedField, direction: DEFAULT_DIRECTION[clickedField] || 'asc' };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/portfolioSort.test.js`
Expected: PASS — 9 tests passed.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/panel/portfolioSort.js webapp/src/panel/portfolioSort.test.js
git commit -m "feat: add portfolio sort logic (date/depuis/ytd, toggleable)"
```

---

### Task 3: Portfolio table rendering

**Files:**
- Create: `webapp/src/panel/portfolioTable.js`
- Create: `webapp/src/panel/portfolioTable.test.js`
- Create: `webapp/src/panel/portfolioTable.css`

**Interfaces:**
- Consumes: a pre-existing container DOM element, an array of portfolio entries (Task 1's shape), a `{sortField, sortDirection}` pair, and an `onSort` callback.
- Produces: `renderPortfolioTable(container: HTMLElement, entries: object[], { sortField, sortDirection, onSort }): void`. Task 4 calls this.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/panel/portfolioTable.test.js`
```js
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderPortfolioTable } from './portfolioTable.js';

const ENTRIES = [
  { id: 'p1', date: '12/03', entreprise: 'Evergreen Marine', stagiaire: 'Léa', symbol: '2603.TW', depuis: 5.2, ytd: 5.0 },
  { id: 'p2', date: '01/01', entreprise: 'Toyota', stagiaire: 'Tom', symbol: '7203.T', depuis: -1.1, ytd: 0.4 },
];

describe('renderPortfolioTable', () => {
  it('renders one row per entry with all 6 columns', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    const cells = [...rows[0].querySelectorAll('td')].map(td => td.textContent);
    expect(cells).toEqual(['12/03', 'Evergreen Marine', 'Léa', '2603.TW', '5.2%', '5%']);
  });

  it('renders the 6 column headers', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    const headers = [...container.querySelectorAll('thead th')].map(th => th.textContent.replace(/[▲▼]/g, '').trim());
    expect(headers).toEqual(['DATE', 'ENTREPRISE', 'STAGIAIRE', 'SYMBOLE', 'DEPUIS', 'YTD']);
  });

  it('shows a sort indicator only on the currently-sorted column', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'ytd', sortDirection: 'desc', onSort: () => {} });
    const headers = [...container.querySelectorAll('thead th')];
    expect(headers.find(h => h.textContent.startsWith('YTD')).textContent).toContain('▼');
    expect(headers.find(h => h.textContent.startsWith('DATE')).textContent).not.toMatch(/[▲▼]/);
  });

  it('calls onSort with the clicked column field', () => {
    const container = document.createElement('div');
    const onSort = vi.fn();
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort });
    const headers = [...container.querySelectorAll('thead th')];
    headers.find(h => h.textContent.startsWith('YTD')).click();
    expect(onSort).toHaveBeenCalledWith('ytd');
  });

  it('renders an empty percentage cell rather than "undefined%" for a missing depuis/ytd value', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, [{ id: 'p3', date: '01/01', entreprise: 'X', stagiaire: 'Y', symbol: 'Z' }], { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    const cells = [...container.querySelectorAll('tbody td')];
    expect(cells[4].textContent).toBe('');
    expect(cells[5].textContent).toBe('');
  });

  it('clears previous rows on re-render', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    renderPortfolioTable(container, [ENTRIES[0]], { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('never interprets stored content as HTML', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, [{ ...ENTRIES[0], entreprise: '<img src=x onerror=alert(1)>' }], { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.querySelector('img')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/portfolioTable.test.js`
Expected: FAIL — `Cannot find module './portfolioTable.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/panel/portfolioTable.js`
```js
const COLUMNS = [
  { field: 'date', label: 'DATE' },
  { field: 'entreprise', label: 'ENTREPRISE' },
  { field: 'stagiaire', label: 'STAGIAIRE' },
  { field: 'symbol', label: 'SYMBOLE' },
  { field: 'depuis', label: 'DEPUIS' },
  { field: 'ytd', label: 'YTD' },
];
const PERCENT_FIELDS = new Set(['depuis', 'ytd']);

export function renderPortfolioTable(container, entries, { sortField, sortDirection, onSort }) {
  container.replaceChildren();

  const table = document.createElement('table');
  table.className = 'portfolio-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const col of COLUMNS) {
    const th = document.createElement('th');
    th.className = 'portfolio-sortable';
    const indicator = sortField === col.field ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '';
    th.textContent = col.label + indicator;
    th.addEventListener('click', () => onSort(col.field));
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  for (const entry of entries) {
    const row = document.createElement('tr');
    for (const col of COLUMNS) {
      const td = document.createElement('td');
      const raw = entry[col.field];
      if (PERCENT_FIELDS.has(col.field)) {
        td.textContent = raw === undefined || raw === null || raw === '' ? '' : `${raw}%`;
      } else {
        td.textContent = raw ?? '';
      }
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }

  table.append(thead, tbody);
  container.appendChild(table);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/portfolioTable.test.js`
Expected: PASS — 7 tests passed.

- [ ] **Step 5: Write the stylesheet**

File: `webapp/src/panel/portfolioTable.css`
```css
.portfolio-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  margin-top: 8px;
}

.portfolio-table th,
.portfolio-table td {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 5px 4px;
  text-align: left;
  color: #fff;
}

.portfolio-table th.portfolio-sortable {
  color: var(--gold-light, #e0b53d);
  cursor: pointer;
  font-size: 10px;
  text-transform: uppercase;
  user-select: none;
}

.portfolio-table th.portfolio-sortable:hover {
  color: #fff;
}

.portfolio-region-label {
  color: var(--gold-light, #e0b53d);
  font-size: 11px;
  font-weight: bold;
  margin-top: 4px;
}
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/panel/portfolioTable.js webapp/src/panel/portfolioTable.test.js webapp/src/panel/portfolioTable.css
git commit -m "feat: add sortable portfolio table rendering"
```

---

### Task 4: Wire the portfolio section into the side panel

**Files:**
- Modify: `webapp/src/panel/sidePanel.js`
- Modify: `webapp/src/panel/sidePanel.test.js`

**Interfaces:**
- Consumes: `sortPortfolioEntries`/`nextSort` (Task 2), `renderPortfolioTable` (Task 3).
- Produces: `initSidePanel({ labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl })` — same factory name and existing behavior for every prior element, now also accepting `portfolioLabelEl`/`portfolioEl`, and `showRegion(regionLabel, { marketItems, newsItems, companyItems, portfolioRegionLabel, portfolioEntries })` where `portfolioRegionLabel` and `portfolioEntries` are both optional (default `''` and `[]`). Task 5 calls this with the two new elements and passes the two new `showRegion` fields.

- [ ] **Step 1: Update the existing tests' setup and add new tests**

Modify `webapp/src/panel/sidePanel.test.js` — update the `beforeEach` to create the two new elements and pass them in:
```js
  let labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, panel;

  beforeEach(() => {
    labelEl = document.createElement('div');
    indicesEl = document.createElement('div');
    newsEl = document.createElement('div');
    companiesEl = document.createElement('div');
    compareEl = document.createElement('div');
    portfolioLabelEl = document.createElement('div');
    portfolioEl = document.createElement('div');
    panel = initSidePanel({ labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl });
  });
```
(every existing test in the file keeps working unchanged).

Add these new tests to the same `describe('initSidePanel', ...)` block:
```js
  it('renders the portfolio region label and table rows', () => {
    panel.showRegion('Asie', {
      marketItems: [], newsItems: [], companyItems: [],
      portfolioRegionLabel: 'Asie',
      portfolioEntries: [{ id: 'p1', date: '12/03', entreprise: 'Evergreen Marine', stagiaire: 'Léa', symbol: '2603.TW', depuis: 5.2, ytd: 5.0 }],
    });
    expect(portfolioLabelEl.textContent).toBe('Asie');
    expect(portfolioEl.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('defaults portfolioEntries to an empty list and portfolioRegionLabel to an empty string when omitted', () => {
    expect(() => panel.showRegion('Asie', { marketItems: [], newsItems: [] })).not.toThrow();
    expect(portfolioLabelEl.textContent).toBe('');
    expect(portfolioEl.querySelectorAll('tbody tr')).toHaveLength(0);
  });

  it('clicking a sortable column header re-sorts and re-renders the table', () => {
    panel.showRegion('Asie', {
      marketItems: [], newsItems: [], companyItems: [],
      portfolioRegionLabel: 'Asie',
      portfolioEntries: [
        { id: 'p1', date: '20/06', entreprise: 'A', stagiaire: 'X', symbol: 'A', depuis: 1, ytd: 1 },
        { id: 'p2', date: '01/01', entreprise: 'B', stagiaire: 'Y', symbol: 'B', depuis: 2, ytd: 2 },
      ],
    });
    // Default state is date ascending, so 01/01 (B) sorts first before any click.
    expect(portfolioEl.querySelector('tbody tr td:nth-child(2)').textContent).toBe('B');

    // Clicking the already-sorted DATE column reverses to descending: 20/06 (A) now sorts first.
    const dateHeader = [...portfolioEl.querySelectorAll('th')].find(th => th.textContent.startsWith('DATE'));
    dateHeader.click();
    expect(portfolioEl.querySelector('tbody tr td:nth-child(2)').textContent).toBe('A');
  });

  it('preserves the sort preference across a subsequent showRegion call (does not reset like the comparator)', () => {
    panel.showRegion('Asie', {
      marketItems: [], newsItems: [], companyItems: [],
      portfolioRegionLabel: 'Asie',
      portfolioEntries: [
        { id: 'p1', date: '20/06', entreprise: 'A', stagiaire: 'X', symbol: 'A', depuis: 1, ytd: 1 },
        { id: 'p2', date: '01/01', entreprise: 'B', stagiaire: 'Y', symbol: 'B', depuis: 2, ytd: 2 },
      ],
    });
    // Clicking DATE (the default-sorted column) reverses date sort from ascending to descending.
    portfolioEl.querySelector('th').click();

    panel.showRegion('Europe', {
      marketItems: [], newsItems: [], companyItems: [],
      portfolioRegionLabel: 'Europe',
      portfolioEntries: [
        { id: 'p3', date: '20/06', entreprise: 'C', stagiaire: 'X', symbol: 'C', depuis: 1, ytd: 1 },
        { id: 'p4', date: '01/01', entreprise: 'D', stagiaire: 'Y', symbol: 'D', depuis: 2, ytd: 2 },
      ],
    });
    // Date descending persisted: 20/06 (C) sorts before 01/01 (D) in Europe's own data.
    const firstRowEntreprise = portfolioEl.querySelector('tbody tr td:nth-child(2)').textContent;
    expect(firstRowEntreprise).toBe('C');
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: FAIL — the 4 new tests fail (`portfolioLabelEl`/`portfolioEl` never populated; the 11 pre-existing tests still pass).

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/panel/sidePanel.js` — add the import and replace the `initSidePanel` export (keep `renderIndices`/`renderNews` exactly as they are):
```js
import { sortPortfolioEntries, nextSort } from './portfolioSort.js';
import { renderPortfolioTable } from './portfolioTable.js';
```
```js
export function initSidePanel({ labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl }) {
  let selectedCompanyIds = [];
  let currentCompanyItems = [];
  let currentPortfolioEntries = [];
  let sortField = 'date';
  let sortDirection = 'asc';

  function renderCompanySection() {
    renderCompanies(companiesEl, currentCompanyItems, selectedCompanyIds, handleToggleCompare);
    renderComparison(compareEl, currentCompanyItems, selectedCompanyIds);
  }

  function handleToggleCompare(companyId) {
    selectedCompanyIds = toggleCompanySelection(selectedCompanyIds, companyId);
    renderCompanySection();
  }

  function renderPortfolioSection() {
    const sorted = sortPortfolioEntries(currentPortfolioEntries, sortField, sortDirection);
    renderPortfolioTable(portfolioEl, sorted, { sortField, sortDirection, onSort: handleSort });
  }

  function handleSort(clickedField) {
    const next = nextSort(sortField, sortDirection, clickedField);
    sortField = next.field;
    sortDirection = next.direction;
    renderPortfolioSection();
  }

  function showRegion(regionLabel, { marketItems, newsItems, companyItems = [], portfolioRegionLabel = '', portfolioEntries = [] }) {
    labelEl.textContent = regionLabel;
    renderIndices(indicesEl, marketItems);
    renderNews(newsEl, newsItems);
    currentCompanyItems = companyItems;
    selectedCompanyIds = [];
    renderCompanySection();
    portfolioLabelEl.textContent = portfolioRegionLabel;
    currentPortfolioEntries = portfolioEntries;
    renderPortfolioSection();
  }

  return { showRegion };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: PASS — 15 tests passed (the existing 11 plus these 4 new ones).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/panel/sidePanel.js webapp/src/panel/sidePanel.test.js
git commit -m "feat: wire sortable portfolio table into the side panel"
```

---

### Task 5: Wire portfolio data into the running app and verify end-to-end

**Files:**
- Modify: `webapp/index.html`
- Modify: `webapp/src/main.js`

**Interfaces:**
- Consumes: `getPortfolioEntriesForRegion`/`getPortfolioRegion` (Task 1), the extended `initSidePanel` (Task 4).
- Produces: the running application. Final deliverable of this plan.

- [ ] **Step 1: Add the panel markup and CSS import**

Modify `webapp/index.html` — inside the existing `<aside class="side-panel">`, add this right after the `<div id="panel-compare"></div>` line added by the previous plan (keep everything else unchanged):
```html
    <div class="panel-section-label">Suivi de portefeuille</div>
    <div id="panel-portfolio-region-label" class="portfolio-region-label"></div>
    <div id="panel-portfolio"></div>
```

Modify `webapp/src/main.js` — add this import line alongside the existing CSS imports:
```js
import './panel/portfolioTable.css';
```

- [ ] **Step 2: Wire the new panel elements and selectors into `main.js`**

Modify `webapp/src/main.js`:

Add a new import line:
```js
import { getPortfolioEntriesForRegion, getPortfolioRegion } from './data/portfolioSelectors.js';
```

Update the `initSidePanel` call to pass the two new elements:
```js
const panel = initSidePanel({
  labelEl: document.getElementById('panel-region-label'),
  indicesEl: document.getElementById('panel-indices'),
  newsEl: document.getElementById('panel-news'),
  companiesEl: document.getElementById('panel-companies'),
  compareEl: document.getElementById('panel-compare'),
  portfolioLabelEl: document.getElementById('panel-portfolio-region-label'),
  portfolioEl: document.getElementById('panel-portfolio'),
});
```

Update `renderPanelForCurrentSelection` to fetch and pass portfolio data (note: portfolio lookups take `activeRegionId` only, no week — they are intentionally NOT passed `activeWeekId`):
```js
function renderPanelForCurrentSelection() {
  if (!activeWeekId) return;
  const region = REGIONS.find(r => r.id === activeRegionId);
  const portfolioRegion = getPortfolioRegion(db, activeRegionId);
  panel.showRegion(region.label, {
    marketItems: getMarketItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    newsItems: getNewsItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    companyItems: getCompanyItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    portfolioRegionLabel: portfolioRegion ? portfolioRegion.label : '',
    portfolioEntries: getPortfolioEntriesForRegion(db, activeRegionId),
  });
}
```

- [ ] **Step 3: Run the full automated test suite**

Run: `cd webapp && npm test`
Expected: PASS — all tests across every test file pass, 0 failures (101 tests: the prior 74 + 7 from this plan's Task 1 + 9 from Task 2 + 7 from Task 3 + 4 from Task 4).

- [ ] **Step 4: Manual browser verification**

Run: `cd webapp && npm run dev`, then open the printed local URL in a browser.

Checklist:
- [ ] The side panel shows a "Suivi de portefeuille" section below the entreprises comparator, with a region label (e.g. "Asie") and a table with columns DATE, ENTREPRISE, STAGIAIRE, SYMBOLE, DEPUIS, YTD.
- [ ] The table shows real portfolio positions for the currently selected region (or an empty table if none — not an error).
- [ ] Clicking a column header sorts the table by that column; clicking the same header again reverses the sort order; the clicked header shows a ▲/▼ indicator.
- [ ] Switching region (arrow buttons or a globe click) updates the portfolio table's region label and rows to that region's own positions, using the correct portfolio-region translation (e.g. selecting "Amérique du Nord" on the globe shows the `amerique-du-nord-canada` portfolio region's positions).
- [ ] After clicking a column header to sort, switching region does NOT reset the sort back to the DATE default — the same column/direction stays active for the new region's data.
- [ ] Switching week does NOT change the portfolio table at all (same entries, same sort) — portfolio is week-independent.
- [ ] No console errors during any of the above interactions.

- [ ] **Step 5: Verify the production build still works**

Run: `cd webapp && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add webapp/index.html webapp/src/main.js
git commit -m "feat: wire portfolio tracking table into the app"
```

---

## End of Plan

At this point the side panel shows indices, news, entreprises (with comparator), and a sortable, week-independent portfolio table for any region — all read-only, all static (no live recomputation). A follow-up plan adds: live quote auto-refresh for DEPUIS/YTD (polling the external Yahoo/Apps Script API every 5 minutes while this section is visible), the 📈 company chart icon deferred from the entreprises plan (which needs this plan's portfolio-entry date lookup to resolve a company's presentation date), and PDF export per region. The IA & Fintech panel, the admin/edit UI, and the final visual-theme + mobile-fallback pass remain separate, later plans.
