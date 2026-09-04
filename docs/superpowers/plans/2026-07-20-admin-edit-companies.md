# Entreprises présentées éditables (mode édition) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the password-gated edit mode (built in `docs/superpowers/plans/2026-07-19-admin-edit-indices.md`) to the "Entreprises présentées" section: edit an existing company's fields and key-point bullets, add a new company, delete a company. This is the second section of the admin/edit feature — indices proved the write path end to end; this plan reuses that infrastructure (Firestore write client, password modal, toast, `isEditing` state) unchanged and applies it to a richer data shape (see [[feedback-admin-edit-scope]] equivalent: one section per plan, confirmed with the user again for this plan).

**Scope decision (confirmed with the user):** companies have more fields than indices (name, Yahoo symbol, flag, country, market cap, 4 label/value stat pairs, a variable-length bullet list) plus a nested cross-reference used by the read-only chart feature (`companyPresentationDateISO` matches a company by `name` against portfolio entries — not touched by this plan). To keep this plan reviewable: **stat field values are editable, but their labels are not** (a company's `salesGrowthLabel`/`evEbitdaLabel`/etc. stay whatever they already are — relabeling stats is deferred to a later plan, same as how the indices plan deferred renaming an index). `region` is only set at creation time (like a new index's `group`), not editable afterward.

**Architecture:**
- `webapp/src/admin/editableInput.js` is extracted from `sidePanel.js`'s existing (Plan-1) local `buildEditableInput` helper — this is the second real call site for that exact function (companies need the same text/number `<input>`-swap pattern indices already use), so extracting it now is removing real duplication, not speculative abstraction. `sidePanel.js` is refactored to import it, with no behavior change.
- `webapp/src/panel/companyList.js`'s `renderCompanies` gains an `isEditing` flag and callbacks (`onEditItem`, `onAddItem`, `onDeleteItem`, `onBulletAdd`, `onBulletEdit`, `onBulletDelete`) in its existing options object — all optional, defaulting `isEditing` to `false`, so every one of the 10 existing tests keeps passing unmodified without needing to touch their call sites (unlike the indices plan, which had to update `initSidePanel`'s shared test setup — here the new params simply aren't present in old calls, which is fine since they're only read when `isEditing` is true).
- `sidePanel.js`'s `initSidePanel` gains the six company callbacks as constructor options (same shape as the indices plan's `onIndexEdit`/`onIndexAdd`/`onIndexDelete`) and a `currentIsEditing` closure variable so `renderCompanySection()` — called both from `showRegion` and from the compare-toggle handler — always renders with the right edit state.
- `main.js` gains `handleCompanyEdit`/`handleCompanyAdd`/`handleCompanyDelete`/`handleCompanyBulletAdd`/`handleCompanyBulletEdit`/`handleCompanyBulletDelete`, following the **exact same optimistic-update-with-rollback-on-failure pattern** the indices plan settled on after its code review (update `db` and re-render immediately, write to Firestore in the background, revert and re-render with a toast if the write ultimately fails). The three bullet handlers are thin wrappers around `handleCompanyEdit` — a bullet add/edit/delete is just a patch to the company's `bullets` array, not a separate write path. Reuses the indices plan's `GROUP_LABEL_BY_REGION` map for a new company's `region` field (already in `main.js`, not redefined).

**Tech Stack:** Same as prior plans — vanilla JS + Vite, Vitest with jsdom for DOM components.

## Global Constraints

- **This plan writes to the same live production Firestore database** the interns use every week — no staging environment. Manual verification (Task 5) must only ever create/edit/delete an obviously-fake, clearly-marked test company — **never edit or delete any real existing company** during verification.
- Firestore document shape matches production: key `mkg:content:entreprises:{weekId}:{id}`, value `{id, region, name, yahooSymbol, flag, country, marketCap, salesGrowthLabel, salesGrowth, evEbitdaLabel, evEbitda, coursActuelLabel, coursActuel, targetPriceLabel, targetPrice, bullets}`. Edits must be a shallow merge (`{...previous, ...patch}`), never a field-by-field reconstruction, so label fields and any other fields this plan doesn't touch survive untouched (same lesson already applied in the indices plan).
- Explicitly OUT OF SCOPE: editing `salesGrowthLabel`/`evEbitdaLabel`/`coursActuelLabel`/`targetPriceLabel` (the 4 stat labels); editing `region` after creation; editing/adding/deleting news, portfolio entries, weeks, or regions; the "annuler tout" undo/session-snapshot system; color pickers.
- New bullet/company text fields use the same "clear default text to be replaced, never an empty field" convention already established in this project (see the project status memory's summary of production behavior): a new company defaults to `name: 'Nouvelle entreprise'`, a new bullet defaults to `'Nouveau point clé à compléter'`.
- Do not modify `webapp/src/globe/*`, `webapp/src/data/*` (no data-layer changes needed for this plan), `webapp/src/panel/portfolioSort.js`/`portfolioTable.js`/`portfolioLiveRefresh.js`/`chartModal.js`/`companyChart.js`/`compareSelection.js`, `webapp/src/timeline/*`, `webapp/src/admin/passwordModal.js`/`toast.js`/`uid.js`/`config.js` (already built, reused as-is), or the repository root `index.html`/`css`/`js`.

---

### Task 1: Extract the shared editable-input helper

**Files:**
- Create: `webapp/src/admin/editableInput.js`
- Create: `webapp/src/admin/editableInput.test.js`
- Modify: `webapp/src/panel/sidePanel.js` (remove the local `buildEditableInput`, import the shared one)

**Interfaces:**
- Produces: `buildEditableInput(value, type, className, onCommit): HTMLInputElement`. Used by `sidePanel.js` (already, via this refactor) and Task 2's `companyList.js`.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/admin/editableInput.test.js`
```js
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { buildEditableInput } from './editableInput.js';

describe('buildEditableInput', () => {
  it('creates a text input with the given value and class name', () => {
    const input = buildEditableInput('hello', 'text', 'my-class', () => {});
    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('text');
    expect(input.value).toBe('hello');
    expect(input.className).toBe('my-class');
  });

  it('creates a number input with step="any"', () => {
    const input = buildEditableInput(1.2, 'number', 'my-class', () => {});
    expect(input.type).toBe('number');
    expect(input.step).toBe('any');
  });

  it('calls onCommit with the raw string for a text input on change', () => {
    const onCommit = vi.fn();
    const input = buildEditableInput('x', 'text', 'c', onCommit);
    input.value = 'y';
    input.dispatchEvent(new Event('change'));
    expect(onCommit).toHaveBeenCalledWith('y');
  });

  it('calls onCommit with a Number for a number input on change', () => {
    const onCommit = vi.fn();
    const input = buildEditableInput(1, 'number', 'c', onCommit);
    input.value = '2.5';
    input.dispatchEvent(new Event('change'));
    expect(onCommit).toHaveBeenCalledWith(2.5);
  });

  it('defaults to an empty string value when given null or undefined', () => {
    expect(buildEditableInput(null, 'text', 'c', () => {}).value).toBe('');
    expect(buildEditableInput(undefined, 'text', 'c', () => {}).value).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/admin/editableInput.test.js`
Expected: FAIL — `Cannot find module './editableInput.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/admin/editableInput.js` (moved verbatim from `sidePanel.js`, not rewritten):
```js
export function buildEditableInput(value, type, className, onCommit) {
  const input = document.createElement('input');
  input.type = type;
  if (type === 'number') input.step = 'any';
  input.className = className;
  input.value = value ?? '';
  input.addEventListener('change', () => {
    onCommit(type === 'number' ? Number(input.value) : input.value);
  });
  return input;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/admin/editableInput.test.js`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Refactor sidePanel.js to use the shared helper**

Modify `webapp/src/panel/sidePanel.js`:
- Delete the local `function buildEditableInput(...) { ... }` definition entirely.
- Add `import { buildEditableInput } from '../admin/editableInput.js';` at the top of the file, alongside the existing imports.
- Everything else (`renderIndices`, `renderNews`, `initSidePanel` and all its functions) stays exactly as it is — this is a pure refactor, the function body is identical to what's being removed.

- [ ] **Step 6: Run sidePanel's existing tests to verify nothing broke**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: PASS — all existing tests (24, from the indices plan) still pass unchanged.

- [ ] **Step 7: Commit**

```bash
git add webapp/src/admin/editableInput.js webapp/src/admin/editableInput.test.js webapp/src/panel/sidePanel.js
git commit -m "refactor: extract shared editable-input helper"
```

---

### Task 2: Editable company fields — rendering

**Files:**
- Modify: `webapp/src/panel/companyList.js`
- Modify: `webapp/src/panel/companyList.test.js`
- Modify: `webapp/src/panel/companyList.css`

**Interfaces:**
- Changes: `renderCompanies(container, items, selectedIds, options)`'s `options` gains `isEditing` (default `false`), `onEditItem(item, patch)`, `onAddItem()`, `onDeleteItem(item)` — all optional. `renderComparison` is unaffected.

- [ ] **Step 1: Add the failing tests**

Add to `webapp/src/panel/companyList.test.js`, inside the existing `describe('renderCompanies', ...)` block or as a sibling — either is fine since the file's existing tests don't share scoped `let` state (each test creates its own `container`):
```js
describe('editable company fields', () => {
  const COMPANY = {
    id: 'c1', name: 'Reliance Industries', yahooSymbol: 'RELIANCE.NS', flag: '🇮🇳', country: 'Inde',
    marketCap: '210 Md$', salesGrowth: '12%', evEbitda: '14x', coursActuel: '1 450', targetPrice: '1 600',
    bullets: [],
  };
  const EDIT_OPTS = { onToggle: () => {}, onOpenChart: () => {}, isEditing: true, onEditItem: () => {}, onAddItem: () => {}, onDeleteItem: () => {}, onBulletAdd: () => {}, onBulletEdit: () => {}, onBulletDelete: () => {} };

  it('renders plain text (no inputs) when isEditing is false or omitted', () => {
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], { onToggle: () => {}, onOpenChart: () => {} });
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('.panel-company-name').textContent).toBe('Reliance Industries');
  });

  it('renders name, symbol, flag, country, market cap, and the 4 stat values as inputs when isEditing is true', () => {
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], EDIT_OPTS);
    const inputs = container.querySelectorAll('input');
    expect(inputs).toHaveLength(9); // name + symbol + flag + country + marketCap + 4 stat values
  });

  it('calls onEditItem with a name patch when the name input changes', () => {
    const onEditItem = vi.fn();
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], { ...EDIT_OPTS, onEditItem });
    const nameInput = container.querySelector('.panel-company-name-input');
    nameInput.value = 'Reliance Ind.';
    nameInput.dispatchEvent(new Event('change'));
    expect(onEditItem).toHaveBeenCalledWith(COMPANY, { name: 'Reliance Ind.' });
  });

  it('calls onEditItem with the correct field patch when a stat value input changes', () => {
    const onEditItem = vi.fn();
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], { ...EDIT_OPTS, onEditItem });
    const statInputs = container.querySelectorAll('.panel-company-stat-input');
    statInputs[0].value = '15%';
    statInputs[0].dispatchEvent(new Event('change'));
    expect(onEditItem).toHaveBeenCalledWith(COMPANY, { salesGrowth: '15%' });
  });

  it('renders a delete button per card in edit mode that calls onDeleteItem with the item', () => {
    const onDeleteItem = vi.fn();
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], { ...EDIT_OPTS, onDeleteItem });
    container.querySelector('.panel-company-delete').click();
    expect(onDeleteItem).toHaveBeenCalledWith(COMPANY);
  });

  it('does not render delete/add buttons when isEditing is false', () => {
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], { onToggle: () => {}, onOpenChart: () => {} });
    expect(container.querySelector('.panel-company-delete')).toBeNull();
    expect(container.querySelector('.panel-company-add')).toBeNull();
  });

  it('renders an add-company button in edit mode that calls onAddItem', () => {
    const onAddItem = vi.fn();
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], { ...EDIT_OPTS, onAddItem });
    container.querySelector('.panel-company-add').click();
    expect(onAddItem).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/companyList.test.js`
Expected: FAIL — the 7 new tests fail (no inputs/buttons rendered yet); the pre-existing 13 tests (9 in `renderCompanies`, 4 in `renderComparison`) still pass.

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/panel/companyList.js` — add the import, update `buildStatsGrid` to accept edit state, and update `renderCompanies` (keep `renderComparison` exactly as it is):
```js
import { buildEditableInput } from '../admin/editableInput.js';

const STAT_FIELDS = [
  ['salesGrowthLabel', 'salesGrowth', 'Croissance CA'],
  ['evEbitdaLabel', 'evEbitda', 'EV/EBITDA'],
  ['coursActuelLabel', 'coursActuel', 'Cours actuel'],
  ['targetPriceLabel', 'targetPrice', 'Objectif'],
];

function buildStatsGrid(item, isEditing, onEditItem) {
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
    if (isEditing) {
      value.appendChild(buildEditableInput(item[valueField], 'text', 'panel-company-stat-input', v => onEditItem(item, { [valueField]: v })));
    } else {
      value.textContent = item[valueField] ?? '';
    }

    stat.append(label, value);
    stats.appendChild(stat);
  }
  return stats;
}

// buildBulletsList is extended in Task 3 — keep its current read-only body for this task.

export function renderCompanies(container, items, selectedIds, { onToggle, onOpenChart, isEditing = false, onEditItem, onAddItem, onDeleteItem, onBulletAdd, onBulletEdit, onBulletDelete }) {
  container.replaceChildren();
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'panel-company-card';

    const header = document.createElement('div');
    header.className = 'panel-company-header';

    const name = document.createElement('span');
    name.className = 'panel-company-name';
    if (isEditing) {
      name.appendChild(buildEditableInput(item.name, 'text', 'panel-company-name-input', v => onEditItem(item, { name: v })));
    } else {
      name.textContent = item.name;
    }

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
    if (isEditing) {
      sub.append(
        buildEditableInput(item.yahooSymbol, 'text', 'panel-company-sub-input', v => onEditItem(item, { yahooSymbol: v })),
        buildEditableInput(item.flag, 'text', 'panel-company-sub-input panel-company-flag-input', v => onEditItem(item, { flag: v })),
        buildEditableInput(item.country, 'text', 'panel-company-sub-input', v => onEditItem(item, { country: v })),
      );
    } else {
      sub.textContent = [item.yahooSymbol, item.flag, item.country].filter(Boolean).join(' · ');
    }

    const cap = document.createElement('div');
    cap.className = 'panel-company-cap';
    if (isEditing) {
      cap.appendChild(buildEditableInput(item.marketCap, 'text', 'panel-company-cap-input', v => onEditItem(item, { marketCap: v })));
    } else {
      cap.textContent = item.marketCap ?? '';
    }

    card.append(header, sub, cap, buildStatsGrid(item, isEditing, onEditItem), buildBulletsList(item, isEditing, { onBulletAdd, onBulletEdit, onBulletDelete }));

    if (isEditing) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'panel-company-delete';
      delBtn.setAttribute('aria-label', `Supprimer ${item.name}`);
      delBtn.textContent = '✕ Supprimer';
      delBtn.addEventListener('click', () => onDeleteItem(item));
      card.appendChild(delBtn);
    }

    container.appendChild(card);
  }

  if (isEditing) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'panel-company-add';
    addBtn.textContent = '+ Ajouter une entreprise';
    addBtn.addEventListener('click', () => onAddItem());
    container.appendChild(addBtn);
  }
}
```
Note: this calls `buildBulletsList(item, isEditing, {...})` with a 3-arg signature — Task 3 changes `buildBulletsList` to accept these; for this task's step, temporarily keep the function accepting the extra args but ignoring them (i.e. `function buildBulletsList(item, isEditing, callbacks) { /* current 1-arg body, unused params are fine */ }`) so this task's tests pass before Task 3 implements the bullet editing itself. Do not implement bullet editing behavior in this task.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/companyList.test.js`
Expected: PASS — the existing 13 tests plus these 7 new ones = 20 total in this file.

- [ ] **Step 5: Add the styles**

Add to `webapp/src/panel/companyList.css` (append, don't modify existing rules):
```css
.panel-company-name-input,
.panel-company-sub-input,
.panel-company-cap-input,
.panel-company-stat-input {
  width: 100%;
  box-sizing: border-box;
  background: #0f1730;
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  padding: 2px 4px;
  margin-top: 2px;
}

.panel-company-sub-input {
  width: 30%;
  display: inline-block;
  margin-right: 4px;
}

.panel-company-flag-input {
  width: 15%;
}

.panel-company-delete {
  display: block;
  width: 100%;
  margin-top: 8px;
  background: transparent;
  border: 1px solid rgba(224, 118, 106, 0.4);
  border-radius: 4px;
  color: #e0736a;
  cursor: pointer;
  font-size: 11px;
  padding: 4px;
}

.panel-company-add {
  display: block;
  width: 100%;
  margin-top: 10px;
  background: transparent;
  border: 1px dashed rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: var(--gold-light, #e0b53d);
  cursor: pointer;
  font-size: 12px;
  padding: 6px;
}

.panel-company-add:hover {
  background: rgba(201, 151, 31, 0.15);
}
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/panel/companyList.js webapp/src/panel/companyList.test.js webapp/src/panel/companyList.css
git commit -m "feat: render editable company fields in edit mode"
```

---

### Task 3: Editable company bullets — rendering

**Files:**
- Modify: `webapp/src/panel/companyList.js`
- Modify: `webapp/src/panel/companyList.test.js`
- Modify: `webapp/src/panel/companyList.css`

**Interfaces:**
- Changes: `buildBulletsList(item, isEditing, { onBulletAdd, onBulletEdit, onBulletDelete })` (module-private, reached only through `renderCompanies`, already wired to accept these in Task 2).

- [ ] **Step 1: Add the failing tests**

Add to `webapp/src/panel/companyList.test.js`:
```js
describe('editable company bullets', () => {
  const COMPANY = { id: 'c1', name: 'Reliance Industries', bullets: ['Expansion retail', 'Croissance Jio'] };
  const EDIT_OPTS = { onToggle: () => {}, onOpenChart: () => {}, isEditing: true, onEditItem: () => {}, onAddItem: () => {}, onDeleteItem: () => {}, onBulletAdd: () => {}, onBulletEdit: () => {}, onBulletDelete: () => {} };

  it('renders plain bullet text (no textarea) when isEditing is false', () => {
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], { onToggle: () => {}, onOpenChart: () => {} });
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelectorAll('.panel-company-bullets li')[0].textContent).toBe('Expansion retail');
  });

  it('renders each bullet as a textarea plus a delete button in edit mode', () => {
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], EDIT_OPTS);
    const textareas = container.querySelectorAll('.panel-company-bullet-input');
    expect(textareas).toHaveLength(2);
    expect(textareas[0].value).toBe('Expansion retail');
    expect(container.querySelectorAll('.panel-company-bullet-delete')).toHaveLength(2);
  });

  it('calls onBulletEdit with the item, index, and new text when a bullet textarea changes', () => {
    const onBulletEdit = vi.fn();
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], { ...EDIT_OPTS, onBulletEdit });
    const textarea = container.querySelectorAll('.panel-company-bullet-input')[1];
    textarea.value = 'Forte croissance Jio 5G';
    textarea.dispatchEvent(new Event('change'));
    expect(onBulletEdit).toHaveBeenCalledWith(COMPANY, 1, 'Forte croissance Jio 5G');
  });

  it('calls onBulletDelete with the item and index when a bullet delete button is clicked', () => {
    const onBulletDelete = vi.fn();
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], { ...EDIT_OPTS, onBulletDelete });
    container.querySelectorAll('.panel-company-bullet-delete')[0].click();
    expect(onBulletDelete).toHaveBeenCalledWith(COMPANY, 0);
  });

  it('renders an add-bullet button in edit mode that calls onBulletAdd with the item', () => {
    const onBulletAdd = vi.fn();
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], { ...EDIT_OPTS, onBulletAdd });
    container.querySelector('.panel-company-bullet-add').click();
    expect(onBulletAdd).toHaveBeenCalledWith(COMPANY);
  });

  it('renders no bullet inputs but still an add button in edit mode when bullets is empty', () => {
    const container = document.createElement('div');
    renderCompanies(container, [{ ...COMPANY, bullets: [] }], [], EDIT_OPTS);
    expect(container.querySelectorAll('.panel-company-bullet-input')).toHaveLength(0);
    expect(container.querySelector('.panel-company-bullet-add')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/companyList.test.js`
Expected: FAIL — the 6 new tests fail (bullets still render read-only regardless of `isEditing`); all 20 pre-existing tests still pass.

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/panel/companyList.js` — replace `buildBulletsList` with the edit-aware version (this is the function Task 2 left as a stub accepting-but-ignoring the extra args):
```js
function buildBulletsList(item, isEditing, { onBulletAdd, onBulletEdit, onBulletDelete }) {
  const bullets = document.createElement('ul');
  bullets.className = 'panel-company-bullets';

  (item.bullets || []).forEach((bullet, index) => {
    const li = document.createElement('li');
    if (isEditing) {
      const textarea = document.createElement('textarea');
      textarea.className = 'panel-company-bullet-input';
      textarea.value = bullet;
      textarea.addEventListener('change', () => onBulletEdit(item, index, textarea.value));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'panel-company-bullet-delete';
      delBtn.setAttribute('aria-label', `Supprimer le point clé ${index + 1}`);
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => onBulletDelete(item, index));

      li.append(textarea, delBtn);
    } else {
      li.textContent = bullet;
    }
    bullets.appendChild(li);
  });

  if (isEditing) {
    const addLi = document.createElement('li');
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'panel-company-bullet-add';
    addBtn.textContent = '+ Point clé';
    addBtn.addEventListener('click', () => onBulletAdd(item));
    addLi.appendChild(addBtn);
    bullets.appendChild(addLi);
  }

  return bullets;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/companyList.test.js`
Expected: PASS — 26 tests total in this file (13 original + 7 from Task 2 + 6 from this task).

- [ ] **Step 5: Add the styles**

Add to `webapp/src/panel/companyList.css` (append):
```css
.panel-company-bullets li {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 6px;
}

.panel-company-bullet-input {
  flex: 1;
  min-height: 40px;
  box-sizing: border-box;
  background: #0f1730;
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  padding: 4px;
  resize: vertical;
}

.panel-company-bullet-delete {
  background: transparent;
  border: none;
  color: #e0736a;
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
}

.panel-company-bullet-add {
  background: transparent;
  border: 1px dashed rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: var(--gold-light, #e0b53d);
  cursor: pointer;
  font-size: 11px;
  padding: 4px 8px;
}
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/panel/companyList.js webapp/src/panel/companyList.test.js webapp/src/panel/companyList.css
git commit -m "feat: render editable company key-point bullets in edit mode"
```

---

### Task 4: Wire company edit callbacks through the side panel

**Files:**
- Modify: `webapp/src/panel/sidePanel.js`
- Modify: `webapp/src/panel/sidePanel.test.js`

**Interfaces:**
- Changes: `initSidePanel`'s constructor gains `onCompanyEdit`, `onCompanyAdd`, `onCompanyDelete`, `onCompanyBulletAdd`, `onCompanyBulletEdit`, `onCompanyBulletDelete` (all optional). `showRegion`'s existing `isEditing` flag (from the indices plan) now also controls the companies section.

- [ ] **Step 1: Add the failing tests**

Add to `webapp/src/panel/sidePanel.test.js`, inside the existing `describe('initSidePanel', ...)` block (needs access to the shared `beforeEach`-scoped variables):
```js
  describe('editable companies via side panel', () => {
    const COMPANY = { id: 'c1', name: 'Toyota', bullets: [] };

    it('renders company fields as inputs when isEditing is true', () => {
      panel.showRegion('Asie', { marketItems: [], newsItems: [], isEditing: true, companyItems: [COMPANY] });
      expect(companiesEl.querySelector('input')).not.toBeNull();
    });

    it('does not render company inputs when isEditing is false', () => {
      panel.showRegion('Asie', { marketItems: [], newsItems: [], companyItems: [COMPANY] });
      expect(companiesEl.querySelector('input')).toBeNull();
    });

    it('calls onCompanyEdit when a company field is edited through the panel', () => {
      const onCompanyEdit = vi.fn();
      panel = initSidePanel({
        labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl,
        onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {},
        onCompanyEdit, onCompanyAdd: () => {}, onCompanyDelete: () => {},
        onCompanyBulletAdd: () => {}, onCompanyBulletEdit: () => {}, onCompanyBulletDelete: () => {},
      });
      panel.showRegion('Asie', { marketItems: [], newsItems: [], isEditing: true, companyItems: [COMPANY] });

      const nameInput = companiesEl.querySelector('.panel-company-name-input');
      nameInput.value = 'Toyota Motor';
      nameInput.dispatchEvent(new Event('change'));

      expect(onCompanyEdit).toHaveBeenCalledWith(COMPANY, { name: 'Toyota Motor' });
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: FAIL — the 3 new tests fail (company section doesn't yet receive `isEditing`/callbacks); all 24 pre-existing tests still pass.

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/panel/sidePanel.js`:

Update `initSidePanel`'s parameter list:
```js
export function initSidePanel({
  labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl,
  onOpenChart, onIndexEdit, onIndexAdd, onIndexDelete,
  onCompanyEdit, onCompanyAdd, onCompanyDelete, onCompanyBulletAdd, onCompanyBulletEdit, onCompanyBulletDelete,
}) {
  let selectedCompanyIds = [];
  let currentCompanyItems = [];
  let currentPortfolioEntries = [];
  let currentIsEditing = false;
  let sortField = 'date';
  let sortDirection = 'asc';

  function renderCompanySection() {
    renderCompanies(companiesEl, currentCompanyItems, selectedCompanyIds, {
      onToggle: handleToggleCompare,
      onOpenChart,
      isEditing: currentIsEditing,
      onEditItem: onCompanyEdit,
      onAddItem: onCompanyAdd,
      onDeleteItem: onCompanyDelete,
      onBulletAdd: onCompanyBulletAdd,
      onBulletEdit: onCompanyBulletEdit,
      onBulletDelete: onCompanyBulletDelete,
    });
    renderComparison(compareEl, currentCompanyItems, selectedCompanyIds);
  }

  // handleToggleCompare, renderPortfolioSection, handleSort unchanged.

  function showRegion(regionLabel, { marketItems, newsItems, companyItems = [], portfolioRegionLabel = '', portfolioEntries = [], isEditing = false }) {
    labelEl.textContent = regionLabel;
    renderIndices(indicesEl, marketItems, isEditing, { onEditItem: onIndexEdit, onDeleteItem: onIndexDelete, onAddItem: onIndexAdd });
    renderNews(newsEl, newsItems);
    currentCompanyItems = companyItems;
    currentIsEditing = isEditing;
    selectedCompanyIds = [];
    renderCompanySection();
    portfolioLabelEl.textContent = portfolioRegionLabel;
    currentPortfolioEntries = portfolioEntries;
    renderPortfolioSection();
  }

  // updateLiveQuotes unchanged.

  return { showRegion, updateLiveQuotes };
}
```
(Keep `handleToggleCompare`, `renderPortfolioSection`, `handleSort`, and `updateLiveQuotes` exactly as they are — only `renderCompanySection`'s call to `renderCompanies` and `showRegion`'s body change.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: PASS — 27 tests total (24 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/panel/sidePanel.js webapp/src/panel/sidePanel.test.js
git commit -m "feat: wire company edit callbacks through the side panel"
```

---

### Task 5: Wire company edit handlers into the app and verify end-to-end

**Files:**
- Modify: `webapp/src/main.js`

**Interfaces:**
- Consumes: `client.writeDoc`/`deleteDocByKey` (already in `main.js` from the indices plan), `generateId` (already imported), the edit-aware `initSidePanel` (Task 4).
- Produces: the running application. Final deliverable of this plan.

- [ ] **Step 1: Add the handlers to `main.js`**

Modify `webapp/src/main.js` — add this block near the existing `handleIndexEdit`/`handleIndexAdd`/`handleIndexDelete` functions (same file, same conventions, no new imports needed — `generateId`, `client`, `db`, `activeWeekId`, `activeRegionId`, `GROUP_LABEL_BY_REGION`, `showToast` all already exist from the indices plan):
```js
function companyItemKey(item) {
  return `mkg:content:entreprises:${activeWeekId}:${item.id}`;
}

function handleCompanyEdit(item, patch) {
  const key = companyItemKey(item);
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

function handleCompanyAdd() {
  const id = generateId();
  const key = `mkg:content:entreprises:${activeWeekId}:${id}`;
  const newItem = {
    id,
    region: GROUP_LABEL_BY_REGION[activeRegionId] || '',
    name: 'Nouvelle entreprise',
    yahooSymbol: '',
    flag: '',
    country: '',
    marketCap: '',
    salesGrowth: '',
    evEbitda: '',
    coursActuel: '',
    targetPrice: '',
    bullets: [],
  };
  db[key] = newItem;
  renderPanelForCurrentSelection();
  client.writeDoc(key, newItem).catch(() => {
    delete db[key];
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Ajout en ligne échoué — la nouvelle entreprise a été retirée');
  });
}

function handleCompanyDelete(item) {
  const key = companyItemKey(item);
  const previous = db[key];
  delete db[key];
  renderPanelForCurrentSelection();
  client.deleteDocByKey(key).catch(() => {
    db[key] = previous;
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), "⚠️ Suppression en ligne échouée — l'entreprise a été restaurée");
  });
}

function handleCompanyBulletAdd(item) {
  handleCompanyEdit(item, { bullets: [...(item.bullets || []), 'Nouveau point clé à compléter'] });
}

function handleCompanyBulletEdit(item, index, text) {
  handleCompanyEdit(item, { bullets: (item.bullets || []).map((bullet, i) => (i === index ? text : bullet)) });
}

function handleCompanyBulletDelete(item, index) {
  handleCompanyEdit(item, { bullets: (item.bullets || []).filter((_, i) => i !== index) });
}
```

Update the `panel` construction to pass the new callbacks (add these six lines to the existing `initSidePanel({...})` call, alongside `onIndexEdit`/`onIndexAdd`/`onIndexDelete`):
```js
  onCompanyEdit: handleCompanyEdit,
  onCompanyAdd: handleCompanyAdd,
  onCompanyDelete: handleCompanyDelete,
  onCompanyBulletAdd: handleCompanyBulletAdd,
  onCompanyBulletEdit: handleCompanyBulletEdit,
  onCompanyBulletDelete: handleCompanyBulletDelete,
```

Nothing else in `main.js` changes — `renderPanelForCurrentSelection` already passes `isEditing` into `showRegion` (from the indices plan), which now also drives the companies section via Task 4's changes.

- [ ] **Step 2: Run the full automated test suite**

Run: `cd webapp && npm test`
Expected: PASS — all tests across every test file pass, 0 failures. (No new tests in this task — `main.js` has no unit tests in this codebase, matching every earlier plan's precedent.)

- [ ] **Step 3: Manual browser verification — READ THE SAFETY NOTE FIRST**

**Safety note:** same live production Firestore as the indices plan, no staging environment. Only ever add/edit/delete a company you created yourself for this test — never touch a pre-existing real company.

Run: `cd webapp && npm run dev`, then open the printed local URL in a browser.

Checklist:
- [ ] Unlock edit mode (password from `webapp/src/admin/config.js`). Existing company cards now show input fields for name/symbol/flag/country/market cap/the 4 stat values, each bullet is a textarea with a ✕ button, and each card has a "+ Point clé" button and a "✕ Supprimer" button; the list ends with a "+ Ajouter une entreprise" button.
- [ ] Click "+ Ajouter une entreprise". A new card appears immediately named "Nouvelle entreprise". **Immediately set its name field to something unmistakably a test, e.g. `TEST — À SUPPRIMER`,** and tab out to commit.
- [ ] Reload the page fully (hard refresh), re-unlock edit mode. Confirm the test company is still there with the name you set — proves the write reached Firestore.
- [ ] On the test company: edit its market cap field, add a bullet via "+ Point clé", edit that bullet's text, then delete it via its ✕ button. Confirm each change reflects immediately in the UI.
- [ ] Click the test company's "✕ Supprimer" button. Confirm the card disappears immediately.
- [ ] Reload again. Confirm the test company is gone for good.
- [ ] Exit edit mode ("🔒 Terminer"). Confirm all company cards return to read-only rendering (no inputs/textareas/buttons beyond the existing 📈/⚖) — and spot-check 2-3 real companies' fields/bullets against what they showed before you started, to confirm none were altered.
- [ ] No console errors during any of the above.

- [ ] **Step 4: Verify the production build still works**

Run: `cd webapp && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/main.js
git commit -m "feat: wire password-gated edit mode for companies"
```

---

## End of Plan

At this point both market indices and companies (fields + bullets) are fully editable under the same password-gated edit mode, with the same optimistic-update-with-rollback pattern. Still pending, as separate later plans: editing news, portfolio entries (including SYMBOLE), weeks/regions management; relabeling company stats; the "annuler tout" undo/session-snapshot system; PDF export; the IA & Fintech panel; a final visual-theme + mobile-fallback pass; and the eventual production cutover.
