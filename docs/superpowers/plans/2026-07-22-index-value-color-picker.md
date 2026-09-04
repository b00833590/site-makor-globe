# Color picker — champ "valeur" des indices — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the *first, narrowest slice* of production's per-field text-color customization system to `webapp/`: a small color-dot picker next to each market index's `value` field, letting an admin override its display color from a fixed palette (or reset to default).

**Why this plan is deliberately narrow, not a full port:** production's color system (root `index.html:938-1064`) is genuinely large — it attaches a color dot to *every* editable field across indices, commodities, currencies, companies (name, market cap, all 4 stats, every bullet), portfolio (every column), plus separate mechanisms for per-week market-group header colors, portfolio-region colors, and company-region tag colors (4 different "kinds" in `applyColor`, each with its own storage shape). Porting all of that in one plan would repeat the exact mistake this project's own established discipline exists to prevent (see `feedback-admin-edit-scope` memory: "split admin/edit UI one section per plan ... not all at once"). This plan ports only the single most self-contained case — one field (`value`), one content type (market indices) — proving the mechanism end-to-end against live Firestore before any future plan extends it to `name`, `weekChange`, companies, portfolio, or the group/region-level color kinds.

**Why `value` and not `name` or `weekChange` first:** `name` is not currently editable at all in `webapp` (always plain text, no `buildEditableInput`) — adding a color dot to it means restructuring `name`'s rendering from a single `.textContent` assignment to an append-based approach, a slightly bigger diff than a field that's already going through `buildEditableInput`. `weekChange` already has its own semantic positive/negative color (`.panel-index-change.negative`/default) that a custom override would need to interact with correctly. `value` has neither complication — it already has an editable-input branch, and no pre-existing color logic to reconcile — the smallest true slice.

**Architecture:**
- New module `webapp/src/admin/colorPicker.js` (alongside `editableInput.js`, `toast.js`, `passwordModal.js` — this is an edit-mode UI primitive, same category): exports `COLOR_PALETTE` (the same 21 hex swatches as production, ported verbatim for visual consistency with the site's existing color vocabulary) and `buildColorDot(currentColor, onPick)`, which returns a clickable `<span class="color-dot">` that opens a small swatch popup positioned near it (appended to `document.body`, closed on outside click or after a pick) — structurally a straight port of production's `colorDotHTML`/`openColorPopup`/`applyColor`/the document-level click-to-close listener, adapted from string-templated HTML to DOM-node construction (matching every other component in `webapp/`).
- `webapp/src/panel/sidePanel.js`'s `renderIndices`: for the `value` span, apply `item.colors?.value` as an inline `style.color` whenever present (both editing and read-only — the color is a display property independent of edit state, exactly like production); in edit mode, additionally append a `buildColorDot(item.colors?.value, color => onColorChange(item, 'value', color))` next to the value input. New `onColorChange` callback threaded through `renderIndices`'s options, `initSidePanel`'s destructured params, and `showRegion`'s call to `renderIndices` (mirrors how every other callback already flows through this file).
- `webapp/src/main.js`: new `handleIndexColorChange(item, field, color)` — builds the full updated `colors` object client-side (`{ ...(item.colors || {}), [field]: color }`, or delete the key when `color` is `null`/reset) and delegates to the **already-existing, already-correct** `handleIndexEdit(item, { colors })` for the actual optimistic-update + Firestore write + rollback-on-failure — no new write logic, no new rollback logic, this plan adds zero lines of Firestore-interaction code of its own. Wired into `initSidePanel({..., onIndexColorChange: handleIndexColorChange})`.
- This mirrors an existing, already-proven pattern in this exact codebase: `handleCompanyBulletAdd`/`Edit`/`Delete` in `main.js` all build a complete updated array client-side and pass it as a single-field patch to the generic `handleCompanyEdit` — this plan does the same thing for an object (`colors`) instead of an array (`bullets`).

## Global Constraints

- **This plan writes to the same live production Firestore database** the interns use every week — no staging environment. Manual verification (Task 4) must only ever recolor an obviously-fake test index — **never recolor a real, existing index** (to avoid visibly altering production data other interns rely on).
- Storage shape: `mkg:market:{weekId}:{id}` documents gain an optional `colors` object, e.g. `{ value: '#e74c3c' }`. Absent or empty `colors` means "use the default color" — matches production's own `getStoredColor` fallback logic exactly (`(obj && obj.colors && obj.colors[field]) ? obj.colors[field] : ''`).
- Do not modify `handleIndexEdit`, `webapp/src/data/*`, `webapp/src/globe/*`, `webapp/src/admin/passwordModal.js`/`toast.js`/`uid.js`/`config.js`/`editableInput.js`, `webapp/src/timeline/*`, or any content type other than market indices (no changes to companies, portfolio, news, or IA & Fintech in this plan).
- This plan touches only: new `webapp/src/admin/colorPicker.js`/`.css`/`.test.js`, and modifications to `webapp/src/panel/sidePanel.js`/`.test.js` and `webapp/src/main.js`.

---
### Task 1: Build the reusable color-dot picker component

**Files:**
- Create: `webapp/src/admin/colorPicker.js`
- Create: `webapp/src/admin/colorPicker.css`
- Create: `webapp/src/admin/colorPicker.test.js`

**Interfaces:**
- Adds: `COLOR_PALETTE: string[]` (21 hex colors)
- Adds: `buildColorDot(currentColor: string | null | undefined, onPick: (color: string | null) => void): HTMLElement`

- [ ] **Step 1: Write the failing tests**

  Create `webapp/src/admin/colorPicker.test.js`:
  ```js
  // @vitest-environment jsdom
  import { describe, it, expect, vi, afterEach } from 'vitest';
  import { buildColorDot, COLOR_PALETTE } from './colorPicker.js';

  afterEach(() => {
    document.getElementById('active-color-popup')?.remove();
  });

  describe('buildColorDot', () => {
    it('renders a color-dot span with the given color as its background', () => {
      const dot = buildColorDot('#e74c3c', () => {});
      expect(dot.className).toBe('color-dot');
      expect(dot.style.background).toBe('rgb(231, 76, 60)');
    });

    it('falls back to a neutral default background when no color is given', () => {
      const dot = buildColorDot(null, () => {});
      expect(dot.style.background).not.toBe('');
    });

    it('opens a popup with one swatch per palette color plus a reset swatch when clicked', () => {
      const dot = buildColorDot(null, () => {});
      document.body.appendChild(dot);
      dot.click();
      const popup = document.getElementById('active-color-popup');
      expect(popup).not.toBeNull();
      expect(popup.querySelectorAll('.color-swatch')).toHaveLength(COLOR_PALETTE.length + 1);
    });

    it('calls onPick with the clicked swatch color and closes the popup', () => {
      const onPick = vi.fn();
      const dot = buildColorDot(null, onPick);
      document.body.appendChild(dot);
      dot.click();
      const swatch = document.getElementById('active-color-popup').querySelectorAll('.color-swatch')[0];
      swatch.click();
      expect(onPick).toHaveBeenCalledWith(COLOR_PALETTE[0]);
      expect(document.getElementById('active-color-popup')).toBeNull();
    });

    it('calls onPick with null and closes the popup when the reset swatch is clicked', () => {
      const onPick = vi.fn();
      const dot = buildColorDot('#e74c3c', onPick);
      document.body.appendChild(dot);
      dot.click();
      const resetSwatch = document.getElementById('active-color-popup').querySelector('.color-swatch-reset');
      resetSwatch.click();
      expect(onPick).toHaveBeenCalledWith(null);
      expect(document.getElementById('active-color-popup')).toBeNull();
    });

    it('closes any already-open popup when a different dot is clicked', () => {
      const dotA = buildColorDot(null, () => {});
      const dotB = buildColorDot(null, () => {});
      document.body.append(dotA, dotB);
      dotA.click();
      const firstPopup = document.getElementById('active-color-popup');
      dotB.click();
      expect(document.getElementById('active-color-popup')).not.toBe(firstPopup);
      expect(document.querySelectorAll('#active-color-popup')).toHaveLength(1);
    });

    it('closes the popup when clicking outside of it', () => {
      const dot = buildColorDot(null, () => {});
      document.body.appendChild(dot);
      dot.click();
      expect(document.getElementById('active-color-popup')).not.toBeNull();
      document.body.click();
      expect(document.getElementById('active-color-popup')).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd webapp && npx vitest run src/admin/colorPicker.test.js`
  Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

  Create `webapp/src/admin/colorPicker.js`:
  ```js
  export const COLOR_PALETTE = [
    '#1c2233', '#4b5568', '#8b95a5', '#c0392b', '#e74c3c', '#e67e22', '#f1c40f',
    '#c9971f', '#16a34a', '#1c8a4b', '#0e7c66', '#0aa89e', '#2980b9', '#2f6fed',
    '#0f1730', '#6c3fc5', '#9b59b6', '#d63384', '#8d6e63', '#5c4033', '#000000',
  ];

  const DEFAULT_DOT_COLOR = '#c8ccd6';

  function closeColorPopup() {
    document.getElementById('active-color-popup')?.remove();
  }

  function openColorPopup(dot, onPick) {
    closeColorPopup();
    const rect = dot.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.id = 'active-color-popup';
    popup.className = 'color-popup';
    popup.style.top = `${rect.bottom + 4}px`;
    popup.style.left = `${Math.min(rect.left, window.innerWidth - 190)}px`;

    for (const color of COLOR_PALETTE) {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.background = color;
      swatch.title = color;
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        onPick(color);
        closeColorPopup();
      });
      popup.appendChild(swatch);
    }

    const reset = document.createElement('div');
    reset.className = 'color-swatch color-swatch-reset';
    reset.textContent = '✕';
    reset.title = 'Réinitialiser (couleur par défaut)';
    reset.addEventListener('click', (e) => {
      e.stopPropagation();
      onPick(null);
      closeColorPopup();
    });
    popup.appendChild(reset);

    document.body.appendChild(popup);
  }

  document.addEventListener('click', (e) => {
    if (!e.target.closest || !e.target.closest('#active-color-popup')) closeColorPopup();
  });

  export function buildColorDot(currentColor, onPick) {
    const dot = document.createElement('span');
    dot.className = 'color-dot';
    dot.style.background = currentColor || DEFAULT_DOT_COLOR;
    dot.title = 'Choisir une couleur';
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      openColorPopup(dot, onPick);
    });
    return dot;
  }
  ```

  Create `webapp/src/admin/colorPicker.css`:
  ```css
  .color-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.3);
    margin-left: 6px;
    cursor: pointer;
    vertical-align: middle;
  }

  .color-popup {
    position: fixed;
    z-index: 50;
    display: grid;
    grid-template-columns: repeat(7, 20px);
    gap: 4px;
    padding: 8px;
    background: #0f1730;
    border: 1px solid rgba(224, 181, 61, 0.4);
    border-radius: 6px;
  }

  .color-swatch {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .color-swatch-reset {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: #e0736a;
    font-size: 11px;
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd webapp && npx vitest run src/admin/colorPicker.test.js`
  Expected: PASS — all 7 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add webapp/src/admin/colorPicker.js webapp/src/admin/colorPicker.css webapp/src/admin/colorPicker.test.js
  git commit -m "feat: add reusable color-dot picker component"
  ```

---
### Task 2: Wire the color picker into the index value field

**Files:**
- Modify: `webapp/src/panel/sidePanel.js`
- Modify: `webapp/src/panel/sidePanel.test.js`

**Interfaces:**
- Modifies: `renderIndices`'s options object gains `onColorChange`
- Modifies: `initSidePanel`'s destructured params gain `onIndexColorChange`, passed through to `renderIndices` inside `showRegion`

- [ ] **Step 1: Write the failing tests**

  Add to `webapp/src/panel/sidePanel.test.js`'s `describe('editable market indices', ...)` block, after the existing weekChange patch test (~line 250):
  ```js
  it('applies a custom color to the value span, in both read-only and editing modes, when the item has one', () => {
    const coloredItem = { ...ITEM, colors: { value: '#e74c3c' } };
    panel.showRegion('Europe', { marketItems: [coloredItem], newsItems: [] });
    expect(indicesEl.querySelector('.panel-index-value').style.color).toBe('rgb(231, 76, 60)');

    panel.showRegion('Europe', { marketItems: [coloredItem], newsItems: [], isEditing: true });
    expect(indicesEl.querySelector('.panel-index-value').style.color).toBe('rgb(231, 76, 60)');
  });

  it('renders no custom color on the value span when the item has none', () => {
    panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [] });
    expect(indicesEl.querySelector('.panel-index-value').style.color).toBe('');
  });

  it('renders a color dot next to the value input in edit mode', () => {
    panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [], isEditing: true });
    expect(indicesEl.querySelector('.panel-index-value .color-dot')).not.toBeNull();
  });

  it('does not render a color dot when not editing', () => {
    panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [] });
    expect(indicesEl.querySelector('.color-dot')).toBeNull();
  });

  it('calls onColorChange with the item, "value", and the picked color when a swatch is chosen', () => {
    const onColorChange = vi.fn();
    panel = initSidePanel({
      labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl,
      onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {}, onIndexColorChange: onColorChange,
    });
    panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [], isEditing: true });

    indicesEl.querySelector('.color-dot').click();
    document.getElementById('active-color-popup').querySelector('.color-swatch').click();

    expect(onColorChange).toHaveBeenCalledWith(ITEM, 'value', expect.any(String));
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
  Expected: FAIL — `.color-dot` doesn't exist yet in `renderIndices`'s output, and custom color isn't applied.

- [ ] **Step 3: Write the implementation**

  In `webapp/src/panel/sidePanel.js`, add the import:
  ```js
  import { buildColorDot } from '../admin/colorPicker.js';
  ```
  Replace the `value` block inside `renderIndices`:
  ```js
  const value = document.createElement('span');
  value.className = 'panel-index-value';
  const valueColor = item.colors && item.colors.value;
  if (isEditing) {
    value.appendChild(buildEditableInput(item.value, 'text', 'panel-index-value-input', v => onEditItem(item, { value: v })));
    value.appendChild(buildColorDot(valueColor, color => onColorChange(item, 'value', color)));
  } else {
    value.textContent = item.value ?? '';
    if (valueColor) value.style.color = valueColor;
  }
  ```
  Update `renderIndices`'s signature to destructure `onColorChange`:
  ```js
  function renderIndices(container, items, isEditing, { onEditItem, onDeleteItem, onAddItem, onColorChange }) {
  ```
  Update `initSidePanel`'s destructured params (near the top of the function) to include `onIndexColorChange` alongside the existing `onIndexEdit, onIndexAdd, onIndexDelete`:
  ```js
  onIndexEdit, onIndexAdd, onIndexDelete, onIndexColorChange,
  ```
  Update the `renderIndices` call inside `showRegion`:
  ```js
  renderIndices(indicesEl, marketItems, isEditing, { onEditItem: onIndexEdit, onDeleteItem: onIndexDelete, onAddItem: onIndexAdd, onColorChange: onIndexColorChange });
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
  Expected: PASS — all tests pass (existing + 5 new).

- [ ] **Step 5: Commit**

  ```bash
  git add webapp/src/panel/sidePanel.js webapp/src/panel/sidePanel.test.js
  git commit -m "feat: wire color picker into the index value field"
  ```

---
### Task 3: Wire the write path in main.js

**Files:**
- Modify: `webapp/src/main.js`

**Interfaces:**
- Adds (module-private, not exported — matches every other `handle*` function): `handleIndexColorChange(item, field, color)`

**No new unit test** — matches the established convention that `main.js`'s handlers are never unit-tested directly (see every prior admin-edit plan); `handleIndexColorChange` is a thin wrapper delegating all actual write/rollback logic to the already-tested-by-precedent `handleIndexEdit`. Covered by Task 4's manual verification.

- [ ] **Step 1: Add the CSS import**

  Add near the other admin CSS imports at the top of `webapp/src/main.js`:
  ```js
  import './admin/colorPicker.css';
  ```

- [ ] **Step 2: Add the handler**

  Add near `handleIndexDelete` (after it, before `handleCompanyEdit` or wherever the next handler group begins):
  ```js
  function handleIndexColorChange(item, field, color) {
    const colors = { ...(item.colors || {}) };
    if (color) colors[field] = color; else delete colors[field];
    handleIndexEdit(item, { colors });
  }
  ```

- [ ] **Step 3: Wire it into `initSidePanel`**

  Add to the `initSidePanel({...})` call's options, alongside the existing `onIndexEdit, onIndexAdd, onIndexDelete`:
  ```js
  onIndexColorChange: handleIndexColorChange,
  ```

- [ ] **Step 4: Run the full automated test suite**

  Run: `cd webapp && npx vitest run`
  Expected: PASS — all tests pass (270 baseline + 7 new from Tasks 1-2 = 277), 0 failures.

- [ ] **Step 5: Verify the production build still works**

  Run: `cd webapp && npm run build`
  Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add webapp/src/main.js
  git commit -m "feat: wire index value color changes to Firestore"
  ```

---
### Task 4: Manual verification against live production Firestore

**No files changed in this task — verification only.**

- [ ] Run `cd webapp && npm run dev`, open the printed local URL in a browser.
- [ ] Unlock edit mode with the admin password.
- [ ] Add an obviously-fake test index (e.g. name "TEST — À IGNORER — color").
- [ ] Click its color dot (next to the value input): confirm a popup with 21 swatches + a reset (✕) appears near the dot.
- [ ] Click a swatch: confirm the popup closes and the value's color visibly changes immediately (optimistic update).
- [ ] Exit edit mode: confirm the custom color is still shown on the read-only value (not just while editing).
- [ ] Hard-reload the page: confirm the custom color persisted in Firestore (survives reload).
- [ ] Re-enter edit mode: confirm the color dot itself now shows the custom color as its own background (not the neutral default).
- [ ] Click the color dot again, then click reset (✕): confirm the value's color reverts to the default (no inline color) and this also persists across a hard reload.
- [ ] Click a color dot, then click elsewhere on the page (not another dot, not a swatch): confirm the popup closes without applying any color.
- [ ] Delete the test index; confirm removal persists across a final hard reload.
- [ ] Spot-check 2-3 real indices' colors are untouched (still default, no unintended color applied) throughout.
- [ ] No console errors during any of the above.
- [ ] Confirm `cd webapp && npx vitest run` is still fully green after the manual session.

---
### End of Plan

At this point the index `value` field has a working, live-verified color picker:
- A color dot next to the value input in edit mode opens a 21-swatch palette + reset
- The chosen color persists to Firestore via the existing, unmodified `handleIndexEdit` optimistic-update/rollback path
- The custom color displays in both edit and read-only modes
- All automated tests pass; production build still works

Still pending, as separate later plans: extending this same mechanism to the index `name`/`weekChange` fields, to companies/portfolio/news/IA & Fintech fields, and to production's other three color "kinds" (per-week market-group header colors, portfolio-region colors, company-region tag colors) — each deserves its own narrowly-scoped plan, not a single large one, per this project's established discipline.
