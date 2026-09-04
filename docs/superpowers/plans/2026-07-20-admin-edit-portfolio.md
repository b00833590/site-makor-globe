# Suivi de portefeuille éditable (mode édition) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the password-gated edit mode (already shipped for market indices and companies) to the portfolio table: edit DATE/ENTREPRISE/STAGIAIRE/SYMBOLE/DEPUIS/YTD on an existing row, add a new position, delete a position. This is the third section of the admin/edit feature and reuses all existing infrastructure (write client, password modal, toast, `editableInput.js`) unchanged.

**Why portfolio next (confirmed with the user):** editing the SYMBOLE field is the single highest-value admin action in this whole feature — it's what "resolves both the auto-refresh and the charts, without touching code" (per the project's own history), and it's the most frequent weekly task for interns. Indices and companies proved the write path on progressively less trivial data shapes; portfolio entries are structurally simple (`{id, date, entreprise, stagiaire, symbol, regionId, depuis, ytd}`, no bullets/nested arrays) but sit in a spot no earlier section did: **they're the one place edit mode overlaps with an already-running background process** (the live quote auto-refresh from an earlier plan). See the Architecture section below for how this plan handles that overlap.

**Architecture:**
- `webapp/src/data/portfolioSelectors.js`'s module-private `PORTFOLIO_REGION_BY_GLOBE_REGION` map is exported (one-line change) so `main.js` can reuse it for a new entry's default `regionId`, instead of duplicating the mapping — same DRY reasoning as reusing `GROUP_LABEL_BY_REGION` for indices/companies.
- `webapp/src/panel/portfolioTable.js`'s `renderPortfolioTable` gains `isEditing` (default `false`) and `onEditItem`/`onAddItem`/`onDeleteItem` callbacks. In edit mode, DATE/ENTREPRISE/STAGIAIRE/SYMBOLE render as text `<input>`s and DEPUIS/YTD as number `<input>`s (reusing `webapp/src/admin/editableInput.js`, same as every other section), each row gets a delete button, and the table is followed by an add-row button. Sorting (`onSort`) is unaffected — sortable headers stay clickable in both modes.
- **The live-refresh/edit-mode overlap, handled in `sidePanel.js`:** `renderPortfolioSection()` is already called from three places — `showRegion`, `handleSort`, and `updateLiveQuotes` (the live quote auto-refresh callback from the earlier `portfolio-live-refresh` plan). If a live-refresh cycle resolves while an admin has an in-progress, uncommitted edit in a text input (typed but not yet blurred), a naive re-render would destroy that input and the keystrokes in it — this is the *exact* failure mode production's own `refreshDataUnlessEditing` logic was built to prevent (see the project's migration history: "protection contre la perte d'un champ en cours d'édition"). This plan reproduces that protection in the webapp architecture: `updateLiveQuotes` still merges live overrides into `currentPortfolioEntries` (so the data is fresh), but **skips the re-render** while `currentIsEditing` is true (the same closure flag already introduced for the companies plan). The visual update is simply deferred until the next render that already has to happen anyway (toggling edit mode off, switching region, sorting, or the next successful edit).
- `main.js` gains `handlePortfolioEdit`/`handlePortfolioAdd`/`handlePortfolioDelete`, the same optimistic-update-with-rollback-on-failure pattern as every other section. Firestore key format: `mkg:portfolio:{id}` — **no week component**, unlike market indices and companies (portfolio entries are a single running list across all weeks, confirmed by `portfolioSelectors.js` filtering only on the `mkg:portfolio:` prefix with no week segment).

**Tech Stack:** Same as prior plans — vanilla JS + Vite, Vitest with jsdom for DOM components.

## Global Constraints

- **This plan writes to the same live production Firestore database** the interns use every week — no staging environment. Manual verification (Task 4) must only ever create/edit/delete an obviously-fake, clearly-marked test portfolio entry — **never edit or delete a real existing position**.
- Firestore document shape matches production: key `mkg:portfolio:{id}` (no week prefix), value `{id, date, entreprise, stagiaire, symbol, regionId, depuis, ytd}`. Edits must be a shallow merge (`{...previous, ...patch}`).
- DEPUIS/YTD are editable here (matching production, which also allows manual entry as a fallback baseline), but for any entry with a resolvable SYMBOLE, the live quote auto-refresh will overwrite a manual DEPUIS/YTD edit with the real computed value on its next cycle (immediately, or within 5 minutes) — this is expected, not a bug, and is exactly why the live-refresh/edit-mode guard above exists.
- Explicitly OUT OF SCOPE: portfolio-region management (renaming/adding/deleting the region groupings themselves, e.g. "Asie"/"BRICS+UK" as portfolio-region documents); the "annuler tout" undo/session-snapshot system.
- Do not modify `webapp/src/globe/*`, `webapp/src/data/selectors.js`/`regionMatch.js`/`quoteClient.js`/`portfolioLiveQuotes.js`/`firestoreClient.js`, `webapp/src/panel/portfolioSort.js`/`companyList.js`/`chartModal.js`/`companyChart.js`/`compareSelection.js`/`portfolioLiveRefresh.js`, `webapp/src/timeline/*`, `webapp/src/admin/passwordModal.js`/`toast.js`/`uid.js`/`config.js`/`editableInput.js` (all already built, reused as-is), or the repository root `index.html`/`css`/`js`.

---

### Task 1: Export the portfolio region map for reuse

**Files:**
- Modify: `webapp/src/data/portfolioSelectors.js`

**Interfaces:**
- Produces: `PORTFOLIO_REGION_BY_GLOBE_REGION` becomes an exported constant (was module-private). Used by Task 4's `main.js`.

- [ ] **Step 1: Export the constant**

Modify `webapp/src/data/portfolioSelectors.js` — change only the declaration line, nothing else in the file:
```js
export const PORTFOLIO_REGION_BY_GLOBE_REGION = {
  asia: 'asie',
  'brics-uk': 'brics-uk',
  europe: 'europe',
  'north-america': 'amerique-du-nord-canada',
};
```
(`getPortfolioEntriesForRegion` and `getPortfolioRegion` stay exactly as they are — they already reference this constant by name, which still works identically once it's exported.)

- [ ] **Step 2: Run the existing tests to verify nothing broke**

Run: `cd webapp && npx vitest run src/data/portfolioSelectors.test.js`
Expected: PASS — all 7 existing tests still pass unchanged (pure export addition, no behavior change).

- [ ] **Step 3: Commit**

```bash
git add webapp/src/data/portfolioSelectors.js
git commit -m "refactor: export the portfolio region map for reuse"
```

---

### Task 2: Editable portfolio table — rendering

**Files:**
- Modify: `webapp/src/panel/portfolioTable.js`
- Modify: `webapp/src/panel/portfolioTable.test.js`
- Modify: `webapp/src/panel/portfolioTable.css`

**Interfaces:**
- Changes: `renderPortfolioTable(container, entries, options)`'s `options` gains `isEditing` (default `false`), `onEditItem(entry, patch)`, `onAddItem()`, `onDeleteItem(entry)` — all optional, so every one of the 10 existing tests keeps passing unmodified.

- [ ] **Step 1: Add the failing tests**

Add to `webapp/src/panel/portfolioTable.test.js` — extend the existing import: `import { buildEditableInput } from '../admin/editableInput.js';` is NOT needed in the test file (that's an implementation detail); just add this `describe` block:
```js
describe('editable portfolio table', () => {
  const EDIT_OPTS = { sortField: 'date', sortDirection: 'asc', onSort: () => {}, isEditing: true, onEditItem: () => {}, onAddItem: () => {}, onDeleteItem: () => {} };

  it('renders plain text (no inputs) when isEditing is false or omitted', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    expect(container.querySelector('input')).toBeNull();
  });

  it('renders all 6 columns as inputs, with DEPUIS/YTD as number inputs and the rest as text, when isEditing is true', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, [ENTRIES[0]], EDIT_OPTS);
    const inputs = [...container.querySelectorAll('tbody tr input')];
    expect(inputs).toHaveLength(6);
    expect(inputs.map(i => i.type)).toEqual(['text', 'text', 'text', 'text', 'number', 'number']);
  });

  it('calls onEditItem with the correct field patch for every column when its input changes', () => {
    const onEditItem = vi.fn();
    const container = document.createElement('div');
    renderPortfolioTable(container, [ENTRIES[0]], { ...EDIT_OPTS, onEditItem });
    const inputs = [...container.querySelectorAll('tbody tr input')];
    const cases = [
      { value: '20/06', patch: { date: '20/06' } },
      { value: 'Evergreen Marine Corp', patch: { entreprise: 'Evergreen Marine Corp' } },
      { value: 'Marie', patch: { stagiaire: 'Marie' } },
      { value: 'EMC.TW', patch: { symbol: 'EMC.TW' } },
      { value: '9.9', patch: { depuis: 9.9 } },
      { value: '8.8', patch: { ytd: 8.8 } },
    ];
    inputs.forEach((input, i) => {
      input.value = cases[i].value;
      input.dispatchEvent(new Event('change'));
      expect(onEditItem).toHaveBeenNthCalledWith(i + 1, ENTRIES[0], cases[i].patch);
    });
  });

  it('renders a delete button per row in edit mode that calls onDeleteItem with the entry', () => {
    const onDeleteItem = vi.fn();
    const container = document.createElement('div');
    renderPortfolioTable(container, [ENTRIES[0]], { ...EDIT_OPTS, onDeleteItem });
    container.querySelector('.portfolio-delete').click();
    expect(onDeleteItem).toHaveBeenCalledWith(ENTRIES[0]);
  });

  it('does not render delete/add buttons when isEditing is false', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    expect(container.querySelector('.portfolio-delete')).toBeNull();
    expect(container.querySelector('.portfolio-add')).toBeNull();
  });

  it('renders an add-entry button in edit mode that calls onAddItem', () => {
    const onAddItem = vi.fn();
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { ...EDIT_OPTS, onAddItem });
    container.querySelector('.portfolio-add').click();
    expect(onAddItem).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/portfolioTable.test.js`
Expected: FAIL — the 6 new tests fail (no inputs/buttons rendered yet); the pre-existing 10 tests still pass.

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/panel/portfolioTable.js`:
```js
import { buildEditableInput } from '../admin/editableInput.js';

const COLUMNS = [
  { field: 'date', label: 'DATE', type: 'text' },
  { field: 'entreprise', label: 'ENTREPRISE', type: 'text' },
  { field: 'stagiaire', label: 'STAGIAIRE', type: 'text' },
  { field: 'symbol', label: 'SYMBOLE', type: 'text' },
  { field: 'depuis', label: 'DEPUIS', type: 'number' },
  { field: 'ytd', label: 'YTD', type: 'number' },
];
const PERCENT_FIELDS = new Set(['depuis', 'ytd']);
const SORTABLE_FIELDS = new Set(['date', 'depuis', 'ytd']);

export function renderPortfolioTable(container, entries, { sortField, sortDirection, onSort, isEditing = false, onEditItem, onAddItem, onDeleteItem }) {
  container.replaceChildren();

  const table = document.createElement('table');
  table.className = 'portfolio-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const col of COLUMNS) {
    const th = document.createElement('th');
    if (SORTABLE_FIELDS.has(col.field)) {
      th.className = 'portfolio-sortable';
      const indicator = sortField === col.field ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : '';
      th.textContent = col.label + indicator;
      th.addEventListener('click', () => onSort(col.field));
    } else {
      th.textContent = col.label;
    }
    headRow.appendChild(th);
  }
  if (isEditing) headRow.appendChild(document.createElement('th'));
  thead.appendChild(headRow);

  const tbody = document.createElement('tbody');
  for (const entry of entries) {
    const row = document.createElement('tr');
    for (const col of COLUMNS) {
      const td = document.createElement('td');
      const raw = entry[col.field];
      if (isEditing) {
        td.appendChild(buildEditableInput(raw, col.type, 'portfolio-cell-input', v => onEditItem(entry, { [col.field]: v })));
      } else if (PERCENT_FIELDS.has(col.field)) {
        td.textContent = raw === undefined || raw === null || raw === '' ? '' : `${raw}%`;
      } else {
        td.textContent = raw ?? '';
      }
      row.appendChild(td);
    }
    if (isEditing) {
      const delTd = document.createElement('td');
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'portfolio-delete';
      delBtn.setAttribute('aria-label', `Supprimer ${entry.entreprise || 'la ligne'}`);
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => onDeleteItem(entry));
      delTd.appendChild(delBtn);
      row.appendChild(delTd);
    }
    tbody.appendChild(row);
  }

  table.append(thead, tbody);
  container.appendChild(table);

  if (isEditing) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'portfolio-add';
    addBtn.textContent = '+ Ajouter une ligne';
    addBtn.addEventListener('click', () => onAddItem());
    container.appendChild(addBtn);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/portfolioTable.test.js`
Expected: PASS — 16 tests total in this file (10 original + 6 new).

- [ ] **Step 5: Add the styles**

Add to `webapp/src/panel/portfolioTable.css` (append, don't modify existing rules):
```css
.portfolio-cell-input {
  width: 100%;
  box-sizing: border-box;
  background: #0f1730;
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
  padding: 2px 4px;
}

.portfolio-delete {
  background: transparent;
  border: none;
  color: #e0736a;
  cursor: pointer;
  font-size: 12px;
}

.portfolio-add {
  display: block;
  width: 100%;
  margin-top: 8px;
  background: transparent;
  border: 1px dashed rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: var(--gold-light, #e0b53d);
  cursor: pointer;
  font-size: 12px;
  padding: 6px;
}

.portfolio-add:hover {
  background: rgba(201, 151, 31, 0.15);
}
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/panel/portfolioTable.js webapp/src/panel/portfolioTable.test.js webapp/src/panel/portfolioTable.css
git commit -m "feat: render editable portfolio table in edit mode"
```

---

### Task 3: Wire portfolio edit callbacks through the side panel, and guard live-refresh against clobbering in-progress edits

**Files:**
- Modify: `webapp/src/panel/sidePanel.js`
- Modify: `webapp/src/panel/sidePanel.test.js`

**Interfaces:**
- Changes: `initSidePanel`'s constructor gains `onPortfolioEdit`, `onPortfolioAdd`, `onPortfolioDelete` (all optional). `renderPortfolioSection` now passes `isEditing: currentIsEditing` (the same flag introduced for the companies plan) and the three callbacks to `renderPortfolioTable`. `updateLiveQuotes` skips re-rendering while `currentIsEditing` is true.

- [ ] **Step 1: Add the failing tests**

Add to `webapp/src/panel/sidePanel.test.js`, inside the existing `describe('initSidePanel', ...)` block:
```js
  describe('editable portfolio via side panel', () => {
    const ENTRY = { id: 'p1', date: '20/06', entreprise: 'A', stagiaire: 'X', symbol: 'A', depuis: 1, ytd: 1 };

    it('renders portfolio row fields as inputs when isEditing is true', () => {
      panel.showRegion('Asie', {
        marketItems: [], newsItems: [], companyItems: [],
        portfolioRegionLabel: 'Asie', isEditing: true, portfolioEntries: [ENTRY],
      });
      expect(portfolioEl.querySelector('input')).not.toBeNull();
    });

    it('does not render portfolio inputs when isEditing is false', () => {
      panel.showRegion('Asie', {
        marketItems: [], newsItems: [], companyItems: [],
        portfolioRegionLabel: 'Asie', portfolioEntries: [ENTRY],
      });
      expect(portfolioEl.querySelector('input')).toBeNull();
    });

    it('calls onPortfolioEdit when a portfolio field is edited through the panel', () => {
      const onPortfolioEdit = vi.fn();
      panel = initSidePanel({
        labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl,
        onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {},
        onCompanyEdit: () => {}, onCompanyAdd: () => {}, onCompanyDelete: () => {},
        onCompanyBulletAdd: () => {}, onCompanyBulletEdit: () => {}, onCompanyBulletDelete: () => {},
        onPortfolioEdit, onPortfolioAdd: () => {}, onPortfolioDelete: () => {},
      });
      panel.showRegion('Asie', {
        marketItems: [], newsItems: [], companyItems: [],
        portfolioRegionLabel: 'Asie', isEditing: true, portfolioEntries: [ENTRY],
      });

      const dateInput = portfolioEl.querySelectorAll('tbody tr input')[0];
      dateInput.value = '25/06';
      dateInput.dispatchEvent(new Event('change'));

      expect(onPortfolioEdit).toHaveBeenCalledWith(ENTRY, { date: '25/06' });
    });

    it('does not re-render the portfolio table (preserving in-progress edits) when live quotes arrive while isEditing is true', () => {
      panel.showRegion('Asie', {
        marketItems: [], newsItems: [], companyItems: [],
        portfolioRegionLabel: 'Asie', isEditing: true, portfolioEntries: [ENTRY],
      });
      const inputBefore = portfolioEl.querySelector('tbody tr input');

      panel.updateLiveQuotes({ p1: { depuis: 9.9, ytd: 8.8 } });

      const inputAfter = portfolioEl.querySelector('tbody tr input');
      expect(inputAfter).toBe(inputBefore); // same DOM node = table was not re-rendered
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: FAIL — the 4 new tests fail; all 27 pre-existing tests still pass.

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/panel/sidePanel.js`:

Update `initSidePanel`'s parameter list to add the three portfolio callbacks:
```js
export function initSidePanel({
  labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl,
  onOpenChart, onIndexEdit, onIndexAdd, onIndexDelete,
  onCompanyEdit, onCompanyAdd, onCompanyDelete, onCompanyBulletAdd, onCompanyBulletEdit, onCompanyBulletDelete,
  onPortfolioEdit, onPortfolioAdd, onPortfolioDelete,
}) {
```

Update `renderPortfolioSection` to pass edit state and callbacks:
```js
  function renderPortfolioSection() {
    const sorted = sortPortfolioEntries(currentPortfolioEntries, sortField, sortDirection);
    renderPortfolioTable(portfolioEl, sorted, {
      sortField, sortDirection, onSort: handleSort,
      isEditing: currentIsEditing,
      onEditItem: onPortfolioEdit,
      onAddItem: onPortfolioAdd,
      onDeleteItem: onPortfolioDelete,
    });
  }
```

Update `updateLiveQuotes` to skip re-rendering while editing (this is the guard described in the plan's Architecture section — everything else in the function stays the same):
```js
  function updateLiveQuotes(overrides) {
    currentPortfolioEntries = currentPortfolioEntries.map(entry =>
      overrides[entry.id] ? { ...entry, ...overrides[entry.id] } : entry
    );
    if (!currentIsEditing) renderPortfolioSection();
  }
```

(`showRegion`, `handleSort`, `handleToggleCompare`, `renderCompanySection`, and `currentIsEditing`'s declaration/assignment in `showRegion` all stay exactly as they are from the companies plan — no other changes.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: PASS — 31 tests total (27 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/panel/sidePanel.js webapp/src/panel/sidePanel.test.js
git commit -m "feat: wire portfolio edit callbacks, guard live-refresh against clobbering in-progress edits"
```

---

### Task 4: Wire portfolio edit handlers into the app and verify end-to-end

**Files:**
- Modify: `webapp/src/main.js`

**Interfaces:**
- Consumes: `PORTFOLIO_REGION_BY_GLOBE_REGION` (Task 1), the edit-aware `initSidePanel` (Task 3), `client.writeDoc`/`deleteDocByKey`/`generateId`/`showToast` (already in `main.js`).
- Produces: the running application. Final deliverable of this plan.

- [ ] **Step 1: Add the handlers to `main.js`**

Modify `webapp/src/main.js` — extend the existing `portfolioSelectors.js` import line:
```js
import { getPortfolioEntriesForRegion, getPortfolioRegion, PORTFOLIO_REGION_BY_GLOBE_REGION } from './data/portfolioSelectors.js';
```

Add this block near the existing `handleCompany*` functions:
```js
function portfolioItemKey(item) {
  return `mkg:portfolio:${item.id}`;
}

function handlePortfolioEdit(item, patch) {
  const key = portfolioItemKey(item);
  const previous = db[key];
  const updated = { ...previous, ...patch };
  db[key] = updated;
  renderPanelForCurrentSelection();
  client.writeDoc(key, updated).catch(() => {
    db[key] = previous;
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');
  });
}

function handlePortfolioAdd() {
  const id = generateId();
  const key = `mkg:portfolio:${id}`;
  const newItem = {
    id,
    date: '',
    entreprise: 'Nouvelle position',
    stagiaire: '',
    symbol: '',
    regionId: PORTFOLIO_REGION_BY_GLOBE_REGION[activeRegionId] || '',
    depuis: 0,
    ytd: 0,
  };
  db[key] = newItem;
  renderPanelForCurrentSelection();
  client.writeDoc(key, newItem).catch(() => {
    delete db[key];
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Ajout en ligne échoué — la nouvelle ligne a été retirée');
  });
}

function handlePortfolioDelete(item) {
  const key = portfolioItemKey(item);
  const previous = db[key];
  delete db[key];
  renderPanelForCurrentSelection();
  client.deleteDocByKey(key).catch(() => {
    db[key] = previous;
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), "⚠️ Suppression en ligne échouée — la ligne a été restaurée");
  });
}
```

Update the `panel` construction to pass the new callbacks (add alongside the existing `onCompany*` lines):
```js
  onPortfolioEdit: handlePortfolioEdit,
  onPortfolioAdd: handlePortfolioAdd,
  onPortfolioDelete: handlePortfolioDelete,
```

Nothing else in `main.js` changes.

- [ ] **Step 2: Run the full automated test suite**

Run: `cd webapp && npm test`
Expected: PASS — all tests pass, 0 failures. (No new tests in this task — `main.js` has no unit tests, matching every earlier plan's precedent.)

- [ ] **Step 3: Manual browser verification — READ THE SAFETY NOTE FIRST**

**Safety note:** same live production Firestore as every earlier admin-edit plan, no staging environment. Only ever add/edit/delete a portfolio row you created yourself for this test — never touch a real position.

Run: `cd webapp && npm run dev`, then open the printed local URL in a browser.

Checklist:
- [ ] Unlock edit mode. The portfolio table's rows now show input fields for all 6 columns, each row has a ✕ delete button, and the table is followed by "+ Ajouter une ligne".
- [ ] Click "+ Ajouter une ligne". A new row appears immediately. **Immediately set its ENTREPRISE field to something unmistakably a test, e.g. `TEST — À SUPPRIMER`,** and tab out to commit.
- [ ] Reload the page fully (hard refresh), re-unlock edit mode. Confirm the test row is still there — proves the write reached Firestore.
- [ ] Edit the test row's SYMBOLE field to a real, resolvable Yahoo symbol (e.g. `AAPL`) and its DEPUIS/YTD fields to arbitrary numbers, tab out. Wait ~5-10 seconds (the live quote refresh's first pass fires immediately) and confirm the DEPUIS/YTD values you typed get silently replaced by real live-computed values once the quote resolves — this is expected (documented in this plan's Architecture section), not a bug.
- [ ] While the test row's ENTREPRISE input still has focus with unsaved-but-in-progress typed text (don't tab out yet), wait for a live-refresh cycle to complete in the background (or trigger one by switching away from and back to the region) and confirm your in-progress typing in that field is **not** wiped out mid-edit.
- [ ] Click the test row's ✕ delete button. Confirm it disappears immediately.
- [ ] Reload again. Confirm the test row is gone for good.
- [ ] Exit edit mode. Confirm the table returns to read-only rendering — and spot-check a few real rows against what they showed before you started, to confirm none were altered.
- [ ] Sorting (clicking DATE/DEPUIS/YTD headers) still works correctly in both read-only and edit mode.
- [ ] No console errors during any of the above.

- [ ] **Step 4: Verify the production build still works**

Run: `cd webapp && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/main.js
git commit -m "feat: wire password-gated edit mode for the portfolio table"
```

---

## End of Plan

At this point market indices, companies, and the portfolio table are all fully editable under the same password-gated edit mode, with the same optimistic-update-with-rollback pattern, and the portfolio table specifically now coexists safely with the live quote auto-refresh (no lost-keystroke risk). Still pending, as separate later plans: editing news and weeks/regions management; the "annuler tout" undo/session-snapshot system; color pickers; PDF export; the IA & Fintech panel; a final visual-theme + mobile-fallback pass; and the eventual production cutover.
