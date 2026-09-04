# Entreprises + comparateur (lecture seule) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "Entreprises" section to the side panel: one card per company presented in the active week/region (name, symbol/flag/country, market cap, 4-stat grid, key-point bullets), plus a ⚖ comparator that lets the user select up to 2 companies and see their stats side by side.

**Architecture:** Extends the existing `webapp/src/data/selectors.js` with one more pure selector (`getCompanyItemsForWeekAndRegion`). A new `webapp/src/panel/compareSelection.js` holds pure selection-toggle logic (max 2, no framework state library needed). A new `webapp/src/panel/companyList.js` holds pure DOM-rendering functions for company cards and the comparison table (same `textContent`-only, XSS-safe pattern as the existing panel code). `sidePanel.js` (from the previous plan) is extended to own the compare-selection state and orchestrate rendering into two new panel sub-sections. `main.js` is extended to fetch company items alongside indices/news and pass them to the panel. Explicitly out of scope: the 📈 live stock-chart icon (needs the external Yahoo/Apps Script quote API — bundled with a later portfolio-tracking plan that needs the same API), and any editing/write capability.

**Tech Stack:** Same as prior plans — vanilla JS + Vite, Vitest with jsdom for DOM components.

## Global Constraints

- Read-only: no Firestore writes, no edit-mode UI.
- Data key prefix: `mkg:content:entreprises:<weekId>:<itemId>`. Item shape (from production): `{ id, name, yahooSymbol, flag, country, region, marketCap, salesGrowth, salesGrowthLabel, evEbitda, evEbitdaLabel, coursActuel, coursActuelLabel, targetPrice, targetPriceLabel, bullets: string[] }`. `region` is free-text and must go through the existing `normalizeRegionLabel` (from `webapp/src/data/regionMatch.js`), exactly like market/news items.
- Comparator: max 2 companies selected at once. Selecting a 3rd while 2 are already selected is a no-op (ignored, not a replacement). Selecting an already-selected company deselects it. Selection resets whenever the region or week changes (a stale comparison from a different region/week must never be shown).
- Never build any of this with `innerHTML` from stored data — `textContent`/DOM APIs only (same XSS rule as the rest of the panel).
- Brand palette (exact hex, reused): `--navy: #0f1730`, `--gold: #c9971f`, `--gold-light: #e0b53d`.
- `sidePanel.js`'s existing `showRegion(regionLabel, { marketItems, newsItems })` call sites (`main.js`'s error-fallback path) must keep working if `companyItems` is omitted — default to an empty list, don't throw.
- Do not modify `webapp/src/globe/*`, the repository root `index.html`/`css`/`js`, or `webapp/src/data/firestoreClient.js`/`regionMatch.js`.

---

### Task 1: Company selector

**Files:**
- Modify: `webapp/src/data/selectors.js`
- Modify: `webapp/src/data/selectors.test.js`

**Interfaces:**
- Consumes: the same flat `db` object shape as the existing selectors, and `normalizeRegionLabel` (already imported in this file).
- Produces: `getCompanyItemsForWeekAndRegion(db, weekId, regionId): Array<item>`. Task 5 calls this directly.

- [ ] **Step 1: Add fixture data and failing tests**

Modify `webapp/src/data/selectors.test.js` — add these entries to the existing `DB` fixture object (keep every existing entry unchanged, just add these alongside them):
```js
  'mkg:content:entreprises:w1:c2': { id: 'c2', name: 'Reliance Industries', region: 'BRICS', yahooSymbol: 'RELIANCE.NS', flag: '🇮🇳', country: 'Inde', marketCap: '210 Md$', bullets: ['Point clé 1'] },
  'mkg:content:entreprises:w2:c3': { id: 'c3', name: 'Toyota', region: 'Asie' },
```
(the existing fixture already has `'mkg:content:entreprises:w1:c1': { id: 'c1', name: 'Some Co', region: 'Asie' }` — keep it, it's still used by the news-selector trap test).

Add this new `describe` block to the same file:
```js
describe('getCompanyItemsForWeekAndRegion', () => {
  it('returns only company items for the given week and region', () => {
    const items = getCompanyItemsForWeekAndRegion(DB, 'w1', 'asia');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Some Co');
  });

  it('matches a different region correctly', () => {
    const items = getCompanyItemsForWeekAndRegion(DB, 'w1', 'brics-uk');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Reliance Industries');
  });

  it('does not leak items from a different week', () => {
    const items = getCompanyItemsForWeekAndRegion(DB, 'w1', 'asia');
    expect(items.some(i => i.name === 'Toyota')).toBe(false);
  });

  it('does not include the news item even though it shares the mkg:content: root and would also normalize to asia', () => {
    const items = getCompanyItemsForWeekAndRegion(DB, 'w1', 'asia');
    expect(items.some(i => i.id === 'n1')).toBe(false);
  });

  it('returns an empty array when nothing matches', () => {
    expect(getCompanyItemsForWeekAndRegion(DB, 'w1', 'north-america')).toEqual([]);
  });
});
```
Also add the import: `import { ..., getCompanyItemsForWeekAndRegion } from './selectors.js';` (extend the existing import line, don't duplicate it).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/data/selectors.test.js`
Expected: FAIL — `getCompanyItemsForWeekAndRegion is not a function` (or `undefined`).

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/data/selectors.js` — add this function (keep every existing export unchanged):
```js
export function getCompanyItemsForWeekAndRegion(db, weekId, regionId) {
  const prefix = `mkg:content:entreprises:${weekId}:`;
  return Object.keys(db)
    .filter(key => key.startsWith(prefix))
    .map(key => db[key])
    .filter(item => normalizeRegionLabel(item.region) === regionId);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/data/selectors.test.js`
Expected: PASS — 14 tests passed (the existing 9 plus these 5 new ones).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/data/selectors.js webapp/src/data/selectors.test.js
git commit -m "feat: add company selector for entreprises panel section"
```

---

### Task 2: Comparator selection logic

**Files:**
- Create: `webapp/src/panel/compareSelection.js`
- Create: `webapp/src/panel/compareSelection.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `toggleCompanySelection(selectedIds: string[], companyId: string): string[]` — pure, returns a new array, never mutates the input. Task 4 calls this.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/panel/compareSelection.test.js`
```js
import { describe, it, expect } from 'vitest';
import { toggleCompanySelection } from './compareSelection.js';

describe('toggleCompanySelection', () => {
  it('adds a company id to an empty selection', () => {
    expect(toggleCompanySelection([], 'a')).toEqual(['a']);
  });

  it('adds a second company id', () => {
    expect(toggleCompanySelection(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('removes a company id that is already selected', () => {
    expect(toggleCompanySelection(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('ignores a third company id when 2 are already selected', () => {
    expect(toggleCompanySelection(['a', 'b'], 'c')).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const input = ['a'];
    toggleCompanySelection(input, 'b');
    expect(input).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/compareSelection.test.js`
Expected: FAIL — `Cannot find module './compareSelection.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/panel/compareSelection.js`
```js
const MAX_SELECTED = 2;

export function toggleCompanySelection(selectedIds, companyId) {
  if (selectedIds.includes(companyId)) {
    return selectedIds.filter(id => id !== companyId);
  }
  if (selectedIds.length >= MAX_SELECTED) {
    return selectedIds;
  }
  return [...selectedIds, companyId];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/compareSelection.test.js`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/panel/compareSelection.js webapp/src/panel/compareSelection.test.js
git commit -m "feat: add pure comparator selection logic (max 2)"
```

---

### Task 3: Company card and comparison table rendering

**Files:**
- Create: `webapp/src/panel/companyList.js`
- Create: `webapp/src/panel/companyList.test.js`
- Create: `webapp/src/panel/companyList.css`

**Interfaces:**
- Consumes: pre-existing container DOM elements, an array of company item objects (the shape from Task 1's selector), and a `selectedIds: string[]` array.
- Produces:
  - `renderCompanies(container: HTMLElement, items: object[], selectedIds: string[], onToggle: (companyId: string) => void): void`
  - `renderComparison(container: HTMLElement, items: object[], selectedIds: string[]): void`

  Task 4 calls both from `sidePanel.js`.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/panel/companyList.test.js`
```js
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderCompanies, renderComparison } from './companyList.js';

const COMPANY_A = {
  id: 'a', name: 'Reliance Industries', yahooSymbol: 'RELIANCE.NS', flag: '🇮🇳', country: 'Inde',
  marketCap: '210 Md$', salesGrowth: '12%', evEbitda: '14x', coursActuel: '1 450', targetPrice: '1 600',
  bullets: ['Expansion retail', 'Croissance Jio'],
};
const COMPANY_B = {
  id: 'b', name: 'Toyota', yahooSymbol: '7203.T', flag: '🇯🇵', country: 'Japon',
  marketCap: '260 Md$', salesGrowth: '5%', evEbitda: '9x', coursActuel: '2 900', targetPrice: '3 100',
  bullets: [],
};

describe('renderCompanies', () => {
  it('renders one card per company with name, symbol/flag/country and market cap', () => {
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY_A], [], () => {});
    const card = container.querySelector('.panel-company-card');
    expect(card.querySelector('.panel-company-name').textContent).toBe('Reliance Industries');
    expect(card.querySelector('.panel-company-sub').textContent).toBe('RELIANCE.NS · 🇮🇳 · Inde');
    expect(card.querySelector('.panel-company-cap').textContent).toBe('210 Md$');
  });

  it('renders the 4-stat grid with values', () => {
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY_A], [], () => {});
    const values = [...container.querySelectorAll('.panel-company-stat-value')].map(el => el.textContent);
    expect(values).toEqual(['12%', '14x', '1 450', '1 600']);
  });

  it('renders one bullet item per bullet, none when the list is empty', () => {
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY_A, COMPANY_B], [], () => {});
    const cards = container.querySelectorAll('.panel-company-card');
    expect(cards[0].querySelectorAll('.panel-company-bullets li')).toHaveLength(2);
    expect(cards[1].querySelectorAll('.panel-company-bullets li')).toHaveLength(0);
  });

  it('marks the compare toggle active only for selected company ids', () => {
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY_A, COMPANY_B], ['b'], () => {});
    const toggles = container.querySelectorAll('.panel-compare-toggle');
    expect(toggles[0].classList.contains('active')).toBe(false);
    expect(toggles[1].classList.contains('active')).toBe(true);
  });

  it('calls onToggle with the company id when its compare button is clicked', () => {
    const container = document.createElement('div');
    const onToggle = vi.fn();
    renderCompanies(container, [COMPANY_A], [], onToggle);
    container.querySelector('.panel-compare-toggle').click();
    expect(onToggle).toHaveBeenCalledWith('a');
  });

  it('clears previous cards on re-render', () => {
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY_A, COMPANY_B], [], () => {});
    renderCompanies(container, [COMPANY_A], [], () => {});
    expect(container.querySelectorAll('.panel-company-card')).toHaveLength(1);
  });

  it('never interprets stored content as HTML', () => {
    const container = document.createElement('div');
    renderCompanies(container, [{ ...COMPANY_A, name: '<img src=x onerror=alert(1)>' }], [], () => {});
    expect(container.querySelector('.panel-company-name').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('renderComparison', () => {
  it('renders nothing when fewer than 2 companies are selected', () => {
    const container = document.createElement('div');
    renderComparison(container, [COMPANY_A, COMPANY_B], ['a']);
    expect(container.children).toHaveLength(0);
  });

  it('renders a comparison table with both companies stats when exactly 2 are selected', () => {
    const container = document.createElement('div');
    renderComparison(container, [COMPANY_A, COMPANY_B], ['a', 'b']);
    const table = container.querySelector('.panel-compare-table');
    expect(table).not.toBeNull();
    expect(table.textContent).toContain('Reliance Industries');
    expect(table.textContent).toContain('Toyota');
    expect(table.textContent).toContain('1 450');
    expect(table.textContent).toContain('2 900');
  });

  it('clears a previous comparison when the selection drops back below 2', () => {
    const container = document.createElement('div');
    renderComparison(container, [COMPANY_A, COMPANY_B], ['a', 'b']);
    renderComparison(container, [COMPANY_A, COMPANY_B], ['a']);
    expect(container.children).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/companyList.test.js`
Expected: FAIL — `Cannot find module './companyList.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/panel/companyList.js`
```js
const STAT_FIELDS = [
  ['salesGrowthLabel', 'salesGrowth', 'Croissance CA'],
  ['evEbitdaLabel', 'evEbitda', 'EV/EBITDA'],
  ['coursActuelLabel', 'coursActuel', 'Cours actuel'],
  ['targetPriceLabel', 'targetPrice', 'Objectif'],
];

function buildStatsGrid(item) {
  const stats = document.createElement('div');
  stats.className = 'panel-company-stats';
  for (const [labelField, valueField, defaultLabel] of STAT_FIELDS) {
    const stat = document.createElement('div');
    stat.className = 'panel-company-stat';

    const label = document.createElement('span');
    label.className = 'panel-company-stat-label';
    label.textContent = item[labelField] || defaultLabel;

    const value = document.createElement('span');
    value.className = 'panel-company-stat-value';
    value.textContent = item[valueField] ?? '';

    stat.append(label, value);
    stats.appendChild(stat);
  }
  return stats;
}

function buildBulletsList(item) {
  const bullets = document.createElement('ul');
  bullets.className = 'panel-company-bullets';
  for (const bullet of item.bullets || []) {
    const li = document.createElement('li');
    li.textContent = bullet;
    bullets.appendChild(li);
  }
  return bullets;
}

export function renderCompanies(container, items, selectedIds, onToggle) {
  container.replaceChildren();
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'panel-company-card';

    const header = document.createElement('div');
    header.className = 'panel-company-header';

    const name = document.createElement('span');
    name.className = 'panel-company-name';
    name.textContent = item.name;

    const compareBtn = document.createElement('button');
    compareBtn.type = 'button';
    compareBtn.className = 'panel-compare-toggle' + (selectedIds.includes(item.id) ? ' active' : '');
    compareBtn.textContent = '⚖';
    compareBtn.setAttribute('aria-label', `Comparer ${item.name}`);
    compareBtn.addEventListener('click', () => onToggle(item.id));

    header.append(name, compareBtn);

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

export function renderComparison(container, items, selectedIds) {
  container.replaceChildren();
  if (selectedIds.length !== 2) return;

  const [a, b] = selectedIds.map(id => items.find(item => item.id === id));
  if (!a || !b) return;

  const table = document.createElement('table');
  table.className = 'panel-compare-table';

  function addRow(label, valueA, valueB) {
    const row = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = label;
    const tdA = document.createElement('td');
    tdA.textContent = valueA ?? '';
    const tdB = document.createElement('td');
    tdB.textContent = valueB ?? '';
    row.append(th, tdA, tdB);
    table.appendChild(row);
  }

  addRow('', a.name, b.name);
  for (const [labelField, valueField, defaultLabel] of STAT_FIELDS) {
    addRow(a[labelField] || defaultLabel, a[valueField], b[valueField]);
  }

  container.appendChild(table);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/companyList.test.js`
Expected: PASS — 10 tests passed.

- [ ] **Step 5: Write the stylesheet**

File: `webapp/src/panel/companyList.css`
```css
.panel-company-card {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
  font-size: 12px;
}

.panel-company-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.panel-company-name {
  font-weight: bold;
  color: #fff;
}

.panel-compare-toggle {
  background: transparent;
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: var(--gold-light, #e0b53d);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 3px 6px;
}

.panel-compare-toggle.active {
  background: rgba(201, 151, 31, 0.35);
}

.panel-company-sub {
  color: #767c8c;
  margin-top: 4px;
}

.panel-company-cap {
  color: #b7bdd6;
  margin-top: 4px;
}

.panel-company-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 8px;
}

.panel-company-stat {
  display: flex;
  flex-direction: column;
}

.panel-company-stat-label {
  color: #767c8c;
  font-size: 10px;
  text-transform: uppercase;
}

.panel-company-stat-value {
  color: #fff;
}

.panel-company-bullets {
  margin: 8px 0 0;
  padding-left: 16px;
  color: #b7bdd6;
}

.panel-compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  margin-top: 8px;
}

.panel-compare-table th,
.panel-compare-table td {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding: 5px 4px;
  text-align: left;
  color: #fff;
}
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/panel/companyList.js webapp/src/panel/companyList.test.js webapp/src/panel/companyList.css
git commit -m "feat: add company card and comparison table rendering"
```

---

### Task 4: Wire the comparator into the side panel

**Files:**
- Modify: `webapp/src/panel/sidePanel.js`
- Modify: `webapp/src/panel/sidePanel.test.js`

**Interfaces:**
- Consumes: `toggleCompanySelection` (Task 2), `renderCompanies`/`renderComparison` (Task 3).
- Produces: `initSidePanel({ labelEl, indicesEl, newsEl, companiesEl, compareEl })` — same factory name and existing behavior for `labelEl`/`indicesEl`/`newsEl`, now also accepting `companiesEl`/`compareEl` and a `showRegion(regionLabel, { marketItems, newsItems, companyItems })` where `companyItems` is optional (defaults to `[]`). Task 5 calls this with the two new elements and passes `companyItems`.

- [ ] **Step 1: Update the existing tests' setup and add new tests**

Modify `webapp/src/panel/sidePanel.test.js` — update the `beforeEach` to create the two new elements and pass them in:
```js
import { initSidePanel } from './sidePanel.js';

describe('initSidePanel', () => {
  let labelEl, indicesEl, newsEl, companiesEl, compareEl, panel;

  beforeEach(() => {
    labelEl = document.createElement('div');
    indicesEl = document.createElement('div');
    newsEl = document.createElement('div');
    companiesEl = document.createElement('div');
    compareEl = document.createElement('div');
    panel = initSidePanel({ labelEl, indicesEl, newsEl, companiesEl, compareEl });
  });
```
(every existing test in the file keeps working unchanged — they just don't touch `companiesEl`/`compareEl`).

Add these new tests to the same `describe('initSidePanel', ...)` block:
```js
  it('renders company cards into companiesEl', () => {
    panel.showRegion('Asie', {
      marketItems: [], newsItems: [],
      companyItems: [{ id: 'a', name: 'Toyota', bullets: [] }],
    });
    expect(companiesEl.querySelector('.panel-company-name').textContent).toBe('Toyota');
  });

  it('defaults companyItems to an empty list when omitted', () => {
    expect(() => panel.showRegion('Asie', { marketItems: [], newsItems: [] })).not.toThrow();
    expect(companiesEl.children.length).toBe(0);
  });

  it('clicking a compare toggle marks it active and re-renders', () => {
    panel.showRegion('Asie', {
      marketItems: [], newsItems: [],
      companyItems: [{ id: 'a', name: 'Toyota', bullets: [] }],
    });
    companiesEl.querySelector('.panel-compare-toggle').click();
    expect(companiesEl.querySelector('.panel-compare-toggle').classList.contains('active')).toBe(true);
  });

  it('shows a comparison table once 2 companies are selected', () => {
    panel.showRegion('Asie', {
      marketItems: [], newsItems: [],
      companyItems: [
        { id: 'a', name: 'Toyota', bullets: [] },
        { id: 'b', name: 'Honda', bullets: [] },
      ],
    });
    const toggles = companiesEl.querySelectorAll('.panel-compare-toggle');
    toggles[0].click();
    toggles[1].click();
    expect(compareEl.querySelector('.panel-compare-table')).not.toBeNull();
  });

  it('resets the comparator selection when showRegion is called again', () => {
    panel.showRegion('Asie', {
      marketItems: [], newsItems: [],
      companyItems: [
        { id: 'a', name: 'Toyota', bullets: [] },
        { id: 'b', name: 'Honda', bullets: [] },
      ],
    });
    const toggles = companiesEl.querySelectorAll('.panel-compare-toggle');
    toggles[0].click();
    toggles[1].click();
    expect(compareEl.querySelector('.panel-compare-table')).not.toBeNull();

    panel.showRegion('Europe', { marketItems: [], newsItems: [], companyItems: [] });
    expect(compareEl.children.length).toBe(0);
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: FAIL — the 5 new tests fail (`companiesEl`/`compareEl` content never populated; the 6 pre-existing tests still pass since `initSidePanel`'s current implementation ignores the extra constructor fields it doesn't yet destructure).

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/panel/sidePanel.js` — add the import and replace the `initSidePanel` export (keep `renderIndices`/`renderNews` exactly as they are):
```js
import { renderCompanies, renderComparison } from './companyList.js';
import { toggleCompanySelection } from './compareSelection.js';
```
```js
export function initSidePanel({ labelEl, indicesEl, newsEl, companiesEl, compareEl }) {
  let selectedCompanyIds = [];
  let currentCompanyItems = [];

  function renderCompanySection() {
    renderCompanies(companiesEl, currentCompanyItems, selectedCompanyIds, handleToggleCompare);
    renderComparison(compareEl, currentCompanyItems, selectedCompanyIds);
  }

  function handleToggleCompare(companyId) {
    selectedCompanyIds = toggleCompanySelection(selectedCompanyIds, companyId);
    renderCompanySection();
  }

  function showRegion(regionLabel, { marketItems, newsItems, companyItems = [] }) {
    labelEl.textContent = regionLabel;
    renderIndices(indicesEl, marketItems);
    renderNews(newsEl, newsItems);
    currentCompanyItems = companyItems;
    selectedCompanyIds = [];
    renderCompanySection();
  }

  return { showRegion };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: PASS — 11 tests passed (the existing 6 plus these 5 new ones).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/panel/sidePanel.js webapp/src/panel/sidePanel.test.js
git commit -m "feat: wire comparator selection into the side panel"
```

---

### Task 5: Wire company data into the running app and verify end-to-end

**Files:**
- Modify: `webapp/index.html`
- Modify: `webapp/src/main.js`

**Interfaces:**
- Consumes: `getCompanyItemsForWeekAndRegion` (Task 1), the extended `initSidePanel` (Task 4).
- Produces: the running application. Final deliverable of this plan.

- [ ] **Step 1: Add the panel markup and CSS import for the new sections**

Modify `webapp/index.html` — inside the existing `<aside class="side-panel">` element, add two new sections right after the existing `<div class="panel-section-label">News macro</div><div id="panel-news"></div>` pair (keep everything else in the file unchanged):
```html
    <div class="panel-section-label">Entreprises présentées</div>
    <div id="panel-companies"></div>
    <div id="panel-compare"></div>
```

Modify `webapp/src/main.js` — add this import line alongside the existing CSS imports at the top of the file:
```js
import './panel/companyList.css';
```

- [ ] **Step 2: Wire the new panel elements and selector into `main.js`**

Modify `webapp/src/main.js`:

Add to the existing import line that pulls from `./data/selectors.js`:
```js
import { getWeeks, getMarketItemsForWeekAndRegion, getNewsItemsForWeekAndRegion, getCompanyItemsForWeekAndRegion } from './data/selectors.js';
```

Update the `initSidePanel` call to pass the two new elements:
```js
const panel = initSidePanel({
  labelEl: document.getElementById('panel-region-label'),
  indicesEl: document.getElementById('panel-indices'),
  newsEl: document.getElementById('panel-news'),
  companiesEl: document.getElementById('panel-companies'),
  compareEl: document.getElementById('panel-compare'),
});
```

Update `renderPanelForCurrentSelection` to fetch and pass company items:
```js
function renderPanelForCurrentSelection() {
  if (!activeWeekId) return;
  const region = REGIONS.find(r => r.id === activeRegionId);
  panel.showRegion(region.label, {
    marketItems: getMarketItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    newsItems: getNewsItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    companyItems: getCompanyItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
  });
}
```

- [ ] **Step 3: Run the full automated test suite**

Run: `cd webapp && npm test`
Expected: PASS — all tests across every test file pass, 0 failures (73 tests: the prior 48 + 5 from this plan's Task 1 additions + 5 from Task 2 + 10 from Task 3 + 5 from Task 4).

- [ ] **Step 4: Manual browser verification**

Run: `cd webapp && npm run dev`, then open the printed local URL in a browser.

Checklist:
- [ ] The side panel shows an "Entreprises présentées" section below the news, with one card per company for the currently selected region/week (or no cards if none were presented that week — not an error).
- [ ] Each company card shows: name, a ⚖ button, a symbol/flag/country line, market cap, a 4-cell stat grid with labels and values, and a bulleted list of key points (or no bullets if the company has none).
- [ ] Clicking a company's ⚖ button highlights it (visually distinct "active" state).
- [ ] Clicking ⚖ on a second company shows a comparison table below the list with both companies' names and stats side by side.
- [ ] Clicking ⚖ on a third company while 2 are already selected does nothing (no crash, no console error, selection stays at 2).
- [ ] Clicking ⚖ again on an already-selected company deselects it and removes the comparison table.
- [ ] Switching region (arrow buttons or a globe click) or switching week (timeline dot) clears any active comparison and shows that region/week's own companies.
- [ ] No console errors during any of the above interactions.

- [ ] **Step 5: Verify the production build still works**

Run: `cd webapp && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add webapp/index.html webapp/src/main.js
git commit -m "feat: wire entreprises panel section and comparator into the app"
```

---

## End of Plan

At this point the side panel shows indices, news, and entreprises (with a working comparator) for any region/week, all read-only. The 📈 live stock-chart icon and the portfolio-tracking table (with live quote auto-refresh and PDF export) remain for a dedicated follow-up plan, since both depend on the same external Yahoo/Apps Script quote API and are best built together. The IA & Fintech panel, the admin/edit UI, and the final visual-theme + mobile-fallback pass also remain separate, later plans.
