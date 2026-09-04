# Panneau latéral + timeline (lecture seule) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the globe built in Plan 1 to real Firestore data: clicking a region (or using the arrows) opens a side panel showing that region's indices and macro news for the currently selected week, and a vertical week timeline lets the user switch weeks — all read-only, no editing.

**Architecture:** New `webapp/src/data/` modules handle Firestore I/O and pure data selection (filtering/normalizing) separately, so the selection logic is unit-testable without a live Firestore connection. New `webapp/src/panel/` and `webapp/src/timeline/` modules are small DOM components, tested with Vitest's jsdom environment (unlike Plan 1's WebGL glue, plain DOM construction *is* meaningfully testable). `main.js` orchestrates: load Firestore data once on boot, wire the week timeline's selection and the globe's `onRegionSelect` callback (from Plan 1) to a single `renderPanelForCurrentSelection()` function that re-reads the currently active week + region and re-renders the panel.

**Tech Stack:** Vanilla JS + Vite (unchanged from Plan 1) + `firebase` (modular SDK, npm) for Firestore + `jsdom` (dev dependency, for DOM-testing the new panel/timeline components).

## Global Constraints

- Read-only in this plan: no writes to Firestore, no edit-mode UI, no inline editing. That is a separate, later plan.
- Canonical region ids are exactly the four from Plan 1's `REGIONS` (`webapp/src/globe/regions.js`): `asia`, `brics-uk`, `europe`, `north-america`. Stored Firestore data uses free-text region/group labels (e.g. `"ASIE"`, `"BRICS+UK"`, `"JP — ASIE —"`, `"Amérique du Nord"`) — these must be normalized to the canonical ids via substring matching (accent-insensitive, case-insensitive) on: contains `ASIE` → `asia`; contains `BRICS` → `brics-uk`; contains `EUROPE` → `europe`; contains `AMERIQUE` → `north-america`. Non-regional groups (`"MATIÈRES PREMIÈRES & CRYPTO"`, `"DEVISES (VS USD)"`) normalize to `null` and are excluded from every region's panel.
- Firestore config (exact, from the production site — same project, read-only access here):
  ```js
  {
    apiKey: "AIzaSyDSq-wkq28uEsU3CO5WT6aW0CQgU1SW7bk",
    authDomain: "makor-morning-news.firebaseapp.com",
    projectId: "makor-morning-news",
    storageBucket: "makor-morning-news.firebasestorage.app",
    messagingSenderId: "651054346177",
    appId: "1:651054346177:web:a31a6fbca4b90853338940",
    measurementId: "G-XN8VTJDMQV"
  }
  ```
- Firestore collection: `mkg_data`. One document per key; each document has a single field `value` holding a JSON string (not native Firestore fields) — must `JSON.parse(doc.data().value)`.
- Data key prefixes to read in this plan: `mkg:week:<weekId>` (week metadata `{id, label, order}`), `mkg:market:<weekId>:<itemId>` (indices, field `group` holds the free-text region/category label), `mkg:content:news:<weekId>:<itemId>` (news briefs, field `region` holds the free-text label). Other prefixes (`mkg:content:entreprises:*`, `mkg:content:ia-fintech:*`, `mkg:portfolio:*`, `mkg:pdfchunk:*`) are out of scope for this plan.
- Default active week on load = the **last** week in the sorted-by-`order` list (matches current production behavior), not the first.
- Never build panel/news content with `innerHTML` from stored data — use `textContent`/DOM APIs only, to avoid XSS from user-editable Firestore content.
- Brand palette (from Plan 1, reused): `--navy: #0f1730`, `--navy2: #1a2340`, `--gold: #c9971f`, `--gold-light: #e0b53d`.
- Do not modify the repository root `index.html`, `css/`, or `js/` directories, or anything under Plan 1's already-approved `webapp/src/globe/` files except where explicitly stated.

---

### Task 1: Firestore client

**Files:**
- Modify: `webapp/package.json` (add `firebase` dependency)
- Create: `webapp/src/data/firestoreClient.js`
- Create: `webapp/src/data/firestoreClient.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `createFirestoreClient(config?): { loadAllOnce(): Promise<object> }` and `loadAllWithRetry(loadOnceFn: () => Promise<object|null>, delayMs?: number): Promise<object>`. Task 6 calls `createFirestoreClient()` then `loadAllWithRetry(() => client.loadAllOnce())`.

`loadAllOnce` performs real Firestore I/O and has no automated test (matches Plan 1's precedent for untestable I/O — see `globeScene.js`). `loadAllWithRetry` is a pure-ish function taking the fetch function as a parameter specifically so it CAN be tested with a fake.

- [ ] **Step 1: Install the Firebase SDK**

Run: `cd webapp && npm install firebase`

- [ ] **Step 2: Write the failing tests for `loadAllWithRetry`**

File: `webapp/src/data/firestoreClient.test.js`
```js
import { describe, it, expect, vi } from 'vitest';
import { loadAllWithRetry } from './firestoreClient.js';

describe('loadAllWithRetry', () => {
  it('returns the first result immediately when it is non-empty', async () => {
    const loadOnce = vi.fn().mockResolvedValue({ 'mkg:week:a': { id: 'a' } });
    const result = await loadAllWithRetry(loadOnce, 0);
    expect(result).toEqual({ 'mkg:week:a': { id: 'a' } });
    expect(loadOnce).toHaveBeenCalledTimes(1);
  });

  it('retries once and returns the second result when the first is empty', async () => {
    const loadOnce = vi.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ 'mkg:week:a': { id: 'a' } });
    const result = await loadAllWithRetry(loadOnce, 0);
    expect(result).toEqual({ 'mkg:week:a': { id: 'a' } });
    expect(loadOnce).toHaveBeenCalledTimes(2);
  });

  it('retries once and returns the second result when the first is null', async () => {
    const loadOnce = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ 'mkg:week:a': { id: 'a' } });
    const result = await loadAllWithRetry(loadOnce, 0);
    expect(result).toEqual({ 'mkg:week:a': { id: 'a' } });
  });

  it('returns an empty object if both attempts are empty', async () => {
    const loadOnce = vi.fn().mockResolvedValue({});
    const result = await loadAllWithRetry(loadOnce, 0);
    expect(result).toEqual({});
    expect(loadOnce).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/data/firestoreClient.test.js`
Expected: FAIL — `Cannot find module './firestoreClient.js'`.

- [ ] **Step 4: Write the implementation**

File: `webapp/src/data/firestoreClient.js`
```js
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const DEFAULT_CONFIG = {
  apiKey: 'AIzaSyDSq-wkq28uEsU3CO5WT6aW0CQgU1SW7bk',
  authDomain: 'makor-morning-news.firebaseapp.com',
  projectId: 'makor-morning-news',
  storageBucket: 'makor-morning-news.firebasestorage.app',
  messagingSenderId: '651054346177',
  appId: '1:651054346177:web:a31a6fbca4b90853338940',
  measurementId: 'G-XN8VTJDMQV',
};

const MAIN_COLLECTION = 'mkg_data';
const EMPTY_RETRY_DELAY_MS = 1200;

export function createFirestoreClient(config = DEFAULT_CONFIG) {
  const app = initializeApp(config);
  const db = getFirestore(app);

  async function loadAllOnce() {
    const snapshot = await getDocs(collection(db, MAIN_COLLECTION));
    const out = {};
    snapshot.forEach(doc => {
      try {
        out[doc.id] = JSON.parse(doc.data().value);
      } catch {
        // corrupt row — skip, matches production behavior
      }
    });
    return out;
  }

  return { loadAllOnce };
}

export async function loadAllWithRetry(loadOnceFn, delayMs = EMPTY_RETRY_DELAY_MS) {
  const first = await loadOnceFn();
  if (first && Object.keys(first).length > 0) return first;
  await new Promise(resolve => setTimeout(resolve, delayMs));
  const second = await loadOnceFn();
  return second || {};
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/data/firestoreClient.test.js`
Expected: PASS — 4 tests passed.

- [ ] **Step 6: Verify the build still succeeds**

Run: `cd webapp && npm run build`
Expected: succeeds with no errors (confirms the `firebase` import resolves correctly).

- [ ] **Step 7: Commit**

```bash
git add webapp/package.json webapp/package-lock.json webapp/src/data/firestoreClient.js webapp/src/data/firestoreClient.test.js
git commit -m "feat: add Firestore client with retry-on-empty loading"
```

---

### Task 2: Region label normalizer

**Files:**
- Create: `webapp/src/data/regionMatch.js`
- Create: `webapp/src/data/regionMatch.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeRegionLabel(rawLabel: string|null|undefined): 'asia'|'brics-uk'|'europe'|'north-america'|null`. Task 3 calls this to match stored `group`/`region` fields against Plan 1's canonical region ids.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/data/regionMatch.test.js`
```js
import { describe, it, expect } from 'vitest';
import { normalizeRegionLabel } from './regionMatch.js';

describe('normalizeRegionLabel', () => {
  it('matches market/indices group labels', () => {
    expect(normalizeRegionLabel('ASIE')).toBe('asia');
    expect(normalizeRegionLabel('BRICS')).toBe('brics-uk');
    expect(normalizeRegionLabel('BRICS+UK')).toBe('brics-uk');
    expect(normalizeRegionLabel('EUROPE')).toBe('europe');
    expect(normalizeRegionLabel('EUROPE & UK')).toBe('europe');
    expect(normalizeRegionLabel('AMÉRIQUE DU NORD')).toBe('north-america');
  });

  it('matches composed news region labels produced by the legacy migration', () => {
    expect(normalizeRegionLabel('JP — ASIE —')).toBe('asia');
    expect(normalizeRegionLabel('IN — BRICS —')).toBe('brics-uk');
    expect(normalizeRegionLabel('EU — EUROPE —')).toBe('europe');
    expect(normalizeRegionLabel('US — AMÉRIQUE DU NORD —')).toBe('north-america');
  });

  it('matches entreprises free-text region labels case-insensitively', () => {
    expect(normalizeRegionLabel('Asie')).toBe('asia');
    expect(normalizeRegionLabel('BRICS')).toBe('brics-uk');
    expect(normalizeRegionLabel('Europe')).toBe('europe');
    expect(normalizeRegionLabel('Amérique du Nord')).toBe('north-america');
    expect(normalizeRegionLabel('amerique du nord')).toBe('north-america');
  });

  it('returns null for non-regional groups', () => {
    expect(normalizeRegionLabel('MATIÈRES PREMIÈRES & CRYPTO')).toBeNull();
    expect(normalizeRegionLabel('DEVISES (VS USD)')).toBeNull();
  });

  it('returns null for missing input', () => {
    expect(normalizeRegionLabel(null)).toBeNull();
    expect(normalizeRegionLabel(undefined)).toBeNull();
    expect(normalizeRegionLabel('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/data/regionMatch.test.js`
Expected: FAIL — `Cannot find module './regionMatch.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/data/regionMatch.js`
```js
const REGION_PATTERNS = [
  { regionId: 'asia', pattern: 'ASIE' },
  { regionId: 'brics-uk', pattern: 'BRICS' },
  { regionId: 'europe', pattern: 'EUROPE' },
  { regionId: 'north-america', pattern: 'AMERIQUE' },
];

function stripAccents(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeRegionLabel(rawLabel) {
  if (!rawLabel) return null;
  const normalized = stripAccents(rawLabel).toUpperCase();
  const match = REGION_PATTERNS.find(({ pattern }) => normalized.includes(pattern));
  return match ? match.regionId : null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/data/regionMatch.test.js`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/data/regionMatch.js webapp/src/data/regionMatch.test.js
git commit -m "feat: add region label normalizer for free-text Firestore data"
```

---

### Task 3: Data selectors

**Files:**
- Create: `webapp/src/data/selectors.js`
- Create: `webapp/src/data/selectors.test.js`

**Interfaces:**
- Consumes: a flat `db` object shaped like the parsed Firestore result from Task 1 (`{ [key: string]: object }`), and `normalizeRegionLabel` from Task 2.
- Produces:
  - `getWeeks(db): Array<{id, label, order}>` (sorted ascending by `order`)
  - `getMarketItemsForWeekAndRegion(db, weekId, regionId): Array<item>`
  - `getNewsItemsForWeekAndRegion(db, weekId, regionId): Array<item>`

  Task 6 calls all three directly.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/data/selectors.test.js`
```js
import { describe, it, expect } from 'vitest';
import { getWeeks, getMarketItemsForWeekAndRegion, getNewsItemsForWeekAndRegion } from './selectors.js';

const DB = {
  'mkg:week:w2': { id: 'w2', label: 'Semaine 2', order: 1 },
  'mkg:week:w1': { id: 'w1', label: 'Semaine 1', order: 0 },
  'mkg:market:w1:idx1': { id: 'idx1', group: 'ASIE', name: 'Nikkei 225', value: '39 000', weekChange: 1.1, ytdChange: 4.2 },
  'mkg:market:w1:idx2': { id: 'idx2', group: 'EUROPE & UK', name: 'CAC 40', value: '7 500', weekChange: -0.4, ytdChange: 2.1 },
  'mkg:market:w1:idx3': { id: 'idx3', group: 'DEVISES (VS USD)', name: 'EUR/USD', value: '1.08', weekChange: 0.1, ytdChange: -1.0 },
  'mkg:market:w2:idx4': { id: 'idx4', group: 'ASIE', name: 'Hang Seng', value: '18 000', weekChange: 0.5, ytdChange: 1.0 },
  'mkg:content:news:w1:n1': { id: 'n1', region: 'JP — ASIE —', title: 'BoJ maintient ses taux', description: 'Détail.' },
  'mkg:content:news:w1:n2': { id: 'n2', region: 'EU — EUROPE —', title: 'BCE relève ses taux', description: 'Détail.' },
  'mkg:content:entreprises:w1:c1': { id: 'c1', name: 'Some Co', region: 'Asie' },
};

describe('getWeeks', () => {
  it('returns weeks sorted by order ascending, regardless of key iteration order', () => {
    expect(getWeeks(DB)).toEqual([
      { id: 'w1', label: 'Semaine 1', order: 0 },
      { id: 'w2', label: 'Semaine 2', order: 1 },
    ]);
  });
});

describe('getMarketItemsForWeekAndRegion', () => {
  it('returns only market items for the given week and region', () => {
    const items = getMarketItemsForWeekAndRegion(DB, 'w1', 'asia');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Nikkei 225');
  });

  it('matches region labels with extra text (e.g. "EUROPE & UK")', () => {
    const items = getMarketItemsForWeekAndRegion(DB, 'w1', 'europe');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('CAC 40');
  });

  it('excludes non-regional groups like currencies', () => {
    const items = getMarketItemsForWeekAndRegion(DB, 'w1', 'europe');
    expect(items.some(i => i.name === 'EUR/USD')).toBe(false);
  });

  it('does not leak items from a different week', () => {
    const items = getMarketItemsForWeekAndRegion(DB, 'w1', 'asia');
    expect(items.some(i => i.name === 'Hang Seng')).toBe(false);
  });

  it('returns an empty array when nothing matches', () => {
    expect(getMarketItemsForWeekAndRegion(DB, 'w1', 'north-america')).toEqual([]);
  });
});

describe('getNewsItemsForWeekAndRegion', () => {
  it('returns only news items for the given week and region', () => {
    const items = getNewsItemsForWeekAndRegion(DB, 'w1', 'asia');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('BoJ maintient ses taux');
  });

  it('returns an empty array when nothing matches', () => {
    expect(getNewsItemsForWeekAndRegion(DB, 'w1', 'north-america')).toEqual([]);
  });

  it('does not include entreprises items even though they also have a region field', () => {
    const items = getNewsItemsForWeekAndRegion(DB, 'w1', 'asia');
    expect(items.some(i => i.id === 'c1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/data/selectors.test.js`
Expected: FAIL — `Cannot find module './selectors.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/data/selectors.js`
```js
import { normalizeRegionLabel } from './regionMatch.js';

export function getWeeks(db) {
  return Object.keys(db)
    .filter(key => key.startsWith('mkg:week:'))
    .map(key => db[key])
    .sort((a, b) => a.order - b.order);
}

export function getMarketItemsForWeekAndRegion(db, weekId, regionId) {
  const prefix = `mkg:market:${weekId}:`;
  return Object.keys(db)
    .filter(key => key.startsWith(prefix))
    .map(key => db[key])
    .filter(item => normalizeRegionLabel(item.group) === regionId);
}

export function getNewsItemsForWeekAndRegion(db, weekId, regionId) {
  const prefix = `mkg:content:news:${weekId}:`;
  return Object.keys(db)
    .filter(key => key.startsWith(prefix))
    .map(key => db[key])
    .filter(item => normalizeRegionLabel(item.region) === regionId);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/data/selectors.test.js`
Expected: PASS — 9 tests passed.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/data/selectors.js webapp/src/data/selectors.test.js
git commit -m "feat: add pure selectors for weeks, market items and news by region"
```

---

### Task 4: Side panel component

**Files:**
- Create: `webapp/src/panel/sidePanel.js`
- Create: `webapp/src/panel/sidePanel.test.js`
- Create: `webapp/src/panel/sidePanel.css`
- Modify: `webapp/package.json` (add `jsdom` dev dependency)

**Interfaces:**
- Consumes: pre-existing DOM elements (passed in, not created by this module) and plain arrays of market/news item objects (the shape returned by Task 3's selectors — `{name, flag?, value, weekChange, ...}` for market items, `{title, description}` for news items).
- Produces: `initSidePanel({ labelEl, indicesEl, newsEl }): { showRegion(regionLabel: string, { marketItems, newsItems }): void }`. Task 6 calls `showRegion` every time the active region or week changes.

This module builds DOM safely with `textContent`/`createElement` — never `innerHTML` with stored data — per the Global Constraints XSS rule. It uses Vitest's jsdom environment (opt-in per test file via a directive comment), unlike Plan 1's untestable WebGL glue — plain DOM construction is fully assertable here.

- [ ] **Step 1: Install jsdom**

Run: `cd webapp && npm install -D jsdom`

- [ ] **Step 2: Write the failing tests**

File: `webapp/src/panel/sidePanel.test.js`
```js
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { initSidePanel } from './sidePanel.js';

describe('initSidePanel', () => {
  let labelEl, indicesEl, newsEl, panel;

  beforeEach(() => {
    labelEl = document.createElement('div');
    indicesEl = document.createElement('div');
    newsEl = document.createElement('div');
    panel = initSidePanel({ labelEl, indicesEl, newsEl });
  });

  it('sets the region label', () => {
    panel.showRegion('Europe', { marketItems: [], newsItems: [] });
    expect(labelEl.textContent).toBe('Europe');
  });

  it('renders one row per market item with name, value and change', () => {
    panel.showRegion('Europe', {
      marketItems: [{ flag: '🇫🇷', name: 'CAC 40', value: '7 500', weekChange: 1.2 }],
      newsItems: [],
    });
    const row = indicesEl.querySelector('.panel-index-row');
    expect(row.querySelector('.panel-index-name').textContent).toBe('🇫🇷 CAC 40');
    expect(row.querySelector('.panel-index-value').textContent).toBe('7 500');
    expect(row.querySelector('.panel-index-change').textContent).toBe('1.2%');
  });

  it('marks negative changes with the negative class, positive with the positive class', () => {
    panel.showRegion('Europe', {
      marketItems: [{ name: 'X', value: '1', weekChange: -2.5 }],
      newsItems: [],
    });
    const change = indicesEl.querySelector('.panel-index-change');
    expect(change.classList.contains('negative')).toBe(true);
    expect(change.classList.contains('positive')).toBe(false);
  });

  it('renders one block per news item with title and description', () => {
    panel.showRegion('Europe', {
      marketItems: [],
      newsItems: [{ title: 'BCE relève ses taux', description: 'Détail.' }],
    });
    expect(newsEl.querySelector('h3').textContent).toBe('BCE relève ses taux');
    expect(newsEl.querySelector('p').textContent).toBe('Détail.');
  });

  it('clears previous content when called again for a different region', () => {
    panel.showRegion('Europe', { marketItems: [{ name: 'A', value: '1', weekChange: 1 }], newsItems: [] });
    panel.showRegion('Asie', { marketItems: [], newsItems: [] });
    expect(indicesEl.children.length).toBe(0);
  });

  it('never interprets stored content as HTML', () => {
    panel.showRegion('Europe', {
      marketItems: [],
      newsItems: [{ title: '<img src=x onerror=alert(1)>', description: 'ok' }],
    });
    expect(newsEl.querySelector('h3').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(newsEl.querySelector('img')).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: FAIL — `Cannot find module './sidePanel.js'`.

- [ ] **Step 4: Write the implementation**

File: `webapp/src/panel/sidePanel.js`
```js
function renderIndices(container, items) {
  container.replaceChildren();
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'panel-index-row';

    const name = document.createElement('span');
    name.className = 'panel-index-name';
    name.textContent = [item.flag, item.name].filter(Boolean).join(' ');

    const value = document.createElement('span');
    value.className = 'panel-index-value';
    value.textContent = item.value ?? '';

    const change = document.createElement('span');
    const isNegative = Number(item.weekChange) < 0;
    change.className = `panel-index-change ${isNegative ? 'negative' : 'positive'}`;
    change.textContent = `${item.weekChange}%`;

    row.append(name, value, change);
    container.appendChild(row);
  }
}

function renderNews(container, items) {
  container.replaceChildren();
  for (const item of items) {
    const block = document.createElement('div');
    block.className = 'panel-news-block';

    const title = document.createElement('h3');
    title.textContent = item.title;

    const description = document.createElement('p');
    description.textContent = item.description;

    block.append(title, description);
    container.appendChild(block);
  }
}

export function initSidePanel({ labelEl, indicesEl, newsEl }) {
  function showRegion(regionLabel, { marketItems, newsItems }) {
    labelEl.textContent = regionLabel;
    renderIndices(indicesEl, marketItems);
    renderNews(newsEl, newsItems);
  }

  return { showRegion };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: PASS — 6 tests passed.

- [ ] **Step 6: Write the panel stylesheet**

File: `webapp/src/panel/sidePanel.css`
```css
:root {
  --panel-width: 340px;
}

.side-panel {
  position: fixed;
  top: 44px;
  right: 0;
  bottom: 0;
  width: var(--panel-width);
  background: rgba(12, 18, 36, 0.97);
  border-left: 1px solid rgba(224, 181, 61, 0.3);
  padding: 16px;
  box-sizing: border-box;
  overflow-y: auto;
  color: #fff;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  z-index: 4;
}

.panel-region-label {
  color: var(--gold-light, #e0b53d);
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
  text-transform: uppercase;
}

.panel-section-label {
  color: #767c8c;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 14px 0 6px;
}

.panel-index-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
}

.panel-index-name {
  flex: 1;
}

.panel-index-change.positive {
  color: #1c8a4b;
}

.panel-index-change.negative {
  color: #c0392b;
}

.panel-news-block {
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.panel-news-block h3 {
  margin: 0 0 4px;
  font-size: 13px;
}

.panel-news-block p {
  margin: 0;
  font-size: 12px;
  color: #b7bdd6;
}
```

- [ ] **Step 7: Commit**

```bash
git add webapp/package.json webapp/package-lock.json webapp/src/panel/sidePanel.js webapp/src/panel/sidePanel.test.js webapp/src/panel/sidePanel.css
git commit -m "feat: add side panel component for region indices and news"
```

---

### Task 5: Week timeline component

**Files:**
- Create: `webapp/src/timeline/weekTimeline.js`
- Create: `webapp/src/timeline/weekTimeline.test.js`
- Create: `webapp/src/timeline/weekTimeline.css`

**Interfaces:**
- Consumes: a pre-existing container DOM element, an array of week objects shaped `{id, label, order}` (the shape returned by Task 3's `getWeeks`).
- Produces: `initWeekTimeline({ container, weeks, activeWeekId, onSelect }): void`. `onSelect(weekId)` fires when the user clicks a week dot; the component then re-renders itself to move the active-dot styling. Task 6 calls this once on boot and passes an `onSelect` that updates app state and re-renders the panel.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/timeline/weekTimeline.test.js`
```js
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initWeekTimeline } from './weekTimeline.js';

const WEEKS = [
  { id: 'w1', label: 'Semaine 1', order: 0 },
  { id: 'w2', label: 'Semaine 2', order: 1 },
];

describe('initWeekTimeline', () => {
  it('renders one dot per week', () => {
    const container = document.createElement('div');
    initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    expect(container.querySelectorAll('.week-dot').length).toBe(2);
  });

  it('marks the active week dot and no other', () => {
    const container = document.createElement('div');
    initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w2', onSelect: () => {} });
    const dots = container.querySelectorAll('.week-dot');
    expect(dots[0].classList.contains('active')).toBe(false);
    expect(dots[1].classList.contains('active')).toBe(true);
  });

  it('uses the week label as the accessible name', () => {
    const container = document.createElement('div');
    initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    expect(container.querySelectorAll('.week-dot')[0].getAttribute('aria-label')).toBe('Semaine 1');
  });

  it('calls onSelect with the clicked week id', () => {
    const container = document.createElement('div');
    const onSelect = vi.fn();
    initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect });
    container.querySelectorAll('.week-dot')[1].click();
    expect(onSelect).toHaveBeenCalledWith('w2');
  });

  it('moves the active class to the newly clicked week after a click', () => {
    const container = document.createElement('div');
    initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    container.querySelectorAll('.week-dot')[1].click();
    const dots = container.querySelectorAll('.week-dot');
    expect(dots[0].classList.contains('active')).toBe(false);
    expect(dots[1].classList.contains('active')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/timeline/weekTimeline.test.js`
Expected: FAIL — `Cannot find module './weekTimeline.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/timeline/weekTimeline.js`
```js
export function initWeekTimeline({ container, weeks, activeWeekId, onSelect }) {
  function render(currentActiveId) {
    container.replaceChildren();
    for (const week of weeks) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'week-dot' + (week.id === currentActiveId ? ' active' : '');
      dot.setAttribute('aria-label', week.label);
      dot.addEventListener('click', () => {
        onSelect(week.id);
        render(week.id);
      });
      container.appendChild(dot);
    }
  }

  render(activeWeekId);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/timeline/weekTimeline.test.js`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Write the timeline stylesheet**

File: `webapp/src/timeline/weekTimeline.css`
```css
.week-timeline {
  position: fixed;
  top: 44px;
  left: 0;
  bottom: 0;
  width: 34px;
  background: rgba(15, 23, 48, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  z-index: 4;
}

.week-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  border: none;
  padding: 0;
  cursor: pointer;
  transition: all 0.2s;
}

.week-dot:hover {
  background: rgba(255, 255, 255, 0.5);
}

.week-dot.active {
  width: 11px;
  height: 11px;
  background: var(--gold-light, #e0b53d);
  box-shadow: 0 0 10px 4px rgba(224, 181, 61, 0.8);
}
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/timeline/weekTimeline.js webapp/src/timeline/weekTimeline.test.js webapp/src/timeline/weekTimeline.css
git commit -m "feat: add week timeline component"
```

---

### Task 6: Wire everything together and verify end-to-end

**Files:**
- Modify: `webapp/index.html`
- Modify: `webapp/src/main.js`
- Modify: `webapp/src/styles/globe.css` (move the right arrow so it doesn't sit under the new side panel)

**Interfaces:**
- Consumes: everything from Tasks 1-5 (`createFirestoreClient`/`loadAllWithRetry`, `getWeeks`/`getMarketItemsForWeekAndRegion`/`getNewsItemsForWeekAndRegion`, `initSidePanel`, `initWeekTimeline`), plus Plan 1's `REGIONS`/`regionPosition`/`initGlobeScene`.
- Produces: the running application. This is the final deliverable of this plan.

- [ ] **Step 1: Move the right arrow button so it doesn't sit under the side panel**

Modify `webapp/src/styles/globe.css` — change the `.arrow-next` rule from a fixed `right: 20px` to account for the panel width:
```css
.arrow-next {
  right: calc(var(--panel-width, 340px) + 20px);
}
```

- [ ] **Step 2: Add the panel and timeline markup to the HTML entry point**

File: `webapp/index.html` — replace the existing `<body>` contents with:
```html
<body>
  <div id="week-timeline" class="week-timeline"></div>
  <div id="globe-container"></div>
  <div id="region-indicator" class="region-indicator"></div>
  <button id="arrow-prev" class="arrow-btn arrow-prev" aria-label="Région précédente">‹</button>
  <button id="arrow-next" class="arrow-btn arrow-next" aria-label="Région suivante">›</button>
  <aside class="side-panel">
    <div id="panel-region-label" class="panel-region-label"></div>
    <div class="panel-section-label">Indices régionaux</div>
    <div id="panel-indices"></div>
    <div class="panel-section-label">News macro</div>
    <div id="panel-news"></div>
  </aside>
  <script type="module" src="/src/main.js"></script>
</body>
```

- [ ] **Step 3: Rewrite the entry script**

File: `webapp/src/main.js`
```js
import './styles/globe.css';
import './panel/sidePanel.css';
import './timeline/weekTimeline.css';
import { REGIONS } from './globe/regions.js';
import { regionPosition } from './globe/cycle.js';
import { initGlobeScene } from './globe/globeScene.js';
import { createFirestoreClient, loadAllWithRetry } from './data/firestoreClient.js';
import { getWeeks, getMarketItemsForWeekAndRegion, getNewsItemsForWeekAndRegion } from './data/selectors.js';
import { initSidePanel } from './panel/sidePanel.js';
import { initWeekTimeline } from './timeline/weekTimeline.js';

const container = document.getElementById('globe-container');
const indicator = document.getElementById('region-indicator');
const prevBtn = document.getElementById('arrow-prev');
const nextBtn = document.getElementById('arrow-next');
const timelineEl = document.getElementById('week-timeline');

const panel = initSidePanel({
  labelEl: document.getElementById('panel-region-label'),
  indicesEl: document.getElementById('panel-indices'),
  newsEl: document.getElementById('panel-news'),
});

let db = {};
let activeWeekId = null;
let activeRegionId = 'asia';

function updateIndicator(regionId) {
  const region = REGIONS.find(r => r.id === regionId);
  const { index, total } = regionPosition(REGIONS, regionId);
  indicator.textContent = `${region.label} · ${index}/${total}`;
  return region;
}

function renderPanelForCurrentSelection() {
  if (!activeWeekId) return;
  const region = REGIONS.find(r => r.id === activeRegionId);
  panel.showRegion(region.label, {
    marketItems: getMarketItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    newsItems: getNewsItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
  });
}

function handleRegionSelect(regionId) {
  activeRegionId = regionId;
  updateIndicator(regionId);
  renderPanelForCurrentSelection();
}

const scene = initGlobeScene(container, {
  regions: REGIONS,
  initialRegionId: activeRegionId,
  onRegionSelect: handleRegionSelect,
});

prevBtn.addEventListener('click', () => scene.goToPrevRegion());
nextBtn.addEventListener('click', () => scene.goToNextRegion());

async function bootstrap() {
  const client = createFirestoreClient();
  db = await loadAllWithRetry(() => client.loadAllOnce());

  const weeks = getWeeks(db);
  activeWeekId = weeks.length ? weeks[weeks.length - 1].id : null;

  initWeekTimeline({
    container: timelineEl,
    weeks,
    activeWeekId,
    onSelect: weekId => {
      activeWeekId = weekId;
      renderPanelForCurrentSelection();
    },
  });

  renderPanelForCurrentSelection();
}

bootstrap();
```

- [ ] **Step 4: Run the full automated test suite**

Run: `cd webapp && npm test`
Expected: PASS — all tests across `regions.test.js`, `cycle.test.js`, `camera.test.js`, `firestoreClient.test.js`, `regionMatch.test.js`, `selectors.test.js`, `sidePanel.test.js`, `weekTimeline.test.js` pass, 0 failures (48 tests: 19 from Plan 1 + 4 + 5 + 9 + 6 + 5 from this plan's Tasks 1-5).

- [ ] **Step 5: Manual browser verification**

Run: `cd webapp && npm run dev`, then open the printed local URL in a browser.

Checklist:
- [ ] A vertical row of week dots appears on the left edge; the rightmost/most-recent week's dot is highlighted gold.
- [ ] The side panel is visible on the right from the moment the page loads, showing "Asie" (or whatever `REGIONS[0].label` is) with real indices and news content pulled from Firestore for the default (most recent) week — not empty, not placeholder text (assuming the Firestore project actually has data seeded for at least one week; if it's genuinely empty, the panel should just show empty sections without throwing a console error — verify no console error either way).
- [ ] Clicking a different region marker (or the arrow buttons) updates both the indicator pill AND the side panel's indices/news to that region's content, without a full page reload.
- [ ] Clicking a different week dot updates the side panel's content to that week's data for the currently selected region, without moving the globe camera or changing the selected region.
- [ ] The right arrow button (`›`) is visually clear of the side panel, not hidden underneath it.
- [ ] No console errors during any of the above interactions.

- [ ] **Step 6: Verify the production build still works**

Run: `cd webapp && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add webapp/index.html webapp/src/main.js webapp/src/styles/globe.css
git commit -m "feat: wire Firestore data, side panel and week timeline into the app"
```

---

## End of Plan 2a

At this point the globe is connected to live data: any region's indices and macro news for any week can be browsed read-only. **Plan 2b** will add the Entreprises content (with the 📈 chart and ⚖ comparator icons) to the panel, and a later plan (2c) will add the portfolio-tracking table with live quote refresh and PDF export. The edit-mode/admin UI remains a separate plan entirely (Plan 4 in the original 5-plan breakdown).
