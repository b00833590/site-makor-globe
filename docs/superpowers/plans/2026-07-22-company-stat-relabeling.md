# Relabeling des statistiques entreprise — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 4 company stat *labels* (currently "Croissance CA" / "EV/EBITDA" / "Cours actuel" / "Objectif") editable in edit mode, alongside their already-editable values — closing the gap explicitly deferred in phase 8 (`project-globe-redesign-status` memory: "Edits ... the 4 stat VALUES (not labels — relabeling deferred)").

**Why this is a smaller change than it looks:** the data model and the **read** path already fully support custom per-company labels — `webapp/src/panel/companyList.js`'s `buildStatsGrid` already renders `item[labelField] || defaultLabel` for all 4 stats, and `renderComparison` already reads `item[labelField]` too (with its own passing test for divergent labels between two compared companies, `companyList.test.js:265`). Only the **edit-mode input** for the label was ever missing — the value has one (`buildEditableInput`), the label has always just been a plain `<span>`. `handleCompanyEdit` in `main.js` is a generic `{ ...previous, ...patch }` merge with no field allowlist, so no `main.js` change is needed at all — any new `{ salesGrowthLabel: '...' }` patch already flows through the exact same path as every other field.

This mirrors production's own model exactly: root `index.html` already stores `salesGrowthLabel`/`evEbitdaLabel`/`coursActuelLabel`/`targetPriceLabel` fields (`index.html:1610-1613`, contenteditable divs with `data-field="...Label"`) — `webapp/`'s field names were chosen to match from the start, this plan just wires up the missing input.

**Architecture:**
- `webapp/src/panel/companyList.js`: in `buildStatsGrid`, add an `isEditing` branch for the label `<span>` (mirroring the existing branch already there for the value), using `buildEditableInput(item[labelField] || defaultLabel, 'text', 'panel-company-stat-label-input', v => onEditItem(item, { [labelField]: v }))`. Pre-filling with `item[labelField] || defaultLabel` (not just `item[labelField]`) means the input never starts empty — the user sees "Croissance CA" ready to edit or leave as-is, matching production's contenteditable behavior.
- New CSS class `panel-company-stat-label-input`, added to the existing shared input-style selector list in `webapp/src/panel/companyList.css` (same visual treatment as every other edit-mode input in this card — no bespoke smaller/muted style, consistent with how no other field gets special edit-mode styling either).
- Deliberately a **distinct** class from the existing `panel-company-stat-input` (used for values) rather than reusing it — keeps `.panel-company-stat-input` querySelectorAll results unambiguous for the existing, unmodified value-patch test (`companyList.test.js:120`), and gives the new label inputs their own clean, independently-selectable class for new tests.
- No changes to `main.js`, `renderComparison`, or any data/selector file — this is a pure `companyList.js`/`.css` change.

## Global Constraints

- **This plan writes to the same live production Firestore database** the interns use every week — no staging environment. Manual verification (Task 2) must only ever edit an obviously-fake test company's labels — **never relabel a real, existing company's stats** (to avoid corrupting real presented-company data).
- Do not modify `main.js`, `renderComparison`, `webapp/src/data/*`, or any other panel/admin module — this plan is scoped entirely to `webapp/src/panel/companyList.js`/`.css`/`.test.js`.
- Do not change the existing `panel-company-stat-input` (value) class name, its CSS, or the existing test at `companyList.test.js:120` that asserts on it — the new label inputs get their own distinct class instead.

---
### Task 1: Make the 4 stat labels editable

**Files:**
- Modify: `webapp/src/panel/companyList.js`
- Modify: `webapp/src/panel/companyList.css`
- Modify: `webapp/src/panel/companyList.test.js`

**Interfaces:**
- Modifies (module-private): `buildStatsGrid(item, isEditing, onEditItem)` — no signature change, same 3 params already carry everything needed.

- [ ] **Step 1: Write the failing tests**

  In `webapp/src/panel/companyList.test.js`, update the existing input-count test (line 103-108) — it currently expects 9 inputs and will now see 13 (4 new label inputs added):
  ```js
  it('renders name, symbol, flag, country, market cap, and the 4 stat labels + values as inputs when isEditing is true', () => {
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], EDIT_OPTS);
    const inputs = container.querySelectorAll('input');
    expect(inputs).toHaveLength(13); // name + symbol + flag + country + marketCap + 4 stat labels + 4 stat values
  });
  ```

  Add two new tests right after the existing "calls onEditItem with the correct field patch for each of the 4 stat value inputs" test (~line 131):
  ```js
  it('pre-fills each stat label input with the default label when the company has no custom label set', () => {
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], EDIT_OPTS);
    const labelInputs = [...container.querySelectorAll('.panel-company-stat-label-input')].map(el => el.value);
    expect(labelInputs).toEqual(['Croissance CA', 'EV/EBITDA', 'Cours actuel', 'Objectif']);
  });

  it('pre-fills a stat label input with the custom label when the company has one set', () => {
    const container = document.createElement('div');
    renderCompanies(container, [{ ...COMPANY, salesGrowthLabel: 'Sales growth (fwd)' }], [], EDIT_OPTS);
    const labelInputs = container.querySelectorAll('.panel-company-stat-label-input');
    expect(labelInputs[0].value).toBe('Sales growth (fwd)');
  });

  it('calls onEditItem with the correct field patch for each of the 4 stat label inputs', () => {
    const onEditItem = vi.fn();
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], { ...EDIT_OPTS, onEditItem });
    const labelInputs = container.querySelectorAll('.panel-company-stat-label-input');
    const expectedFields = ['salesGrowthLabel', 'evEbitdaLabel', 'coursActuelLabel', 'targetPriceLabel'];
    labelInputs.forEach((input, i) => {
      input.value = `Custom label ${i}`;
      input.dispatchEvent(new Event('change'));
      expect(onEditItem).toHaveBeenNthCalledWith(i + 1, COMPANY, { [expectedFields[i]]: `Custom label ${i}` });
    });
  });
  ```

  Also update the read-only test at line 96-101 (`'renders plain text (no inputs) when isEditing is false or omitted'`) to additionally assert a stat label renders as plain text — extend, don't replace:
  ```js
  it('renders plain text (no inputs) when isEditing is false or omitted', () => {
    const container = document.createElement('div');
    renderCompanies(container, [COMPANY], [], { onToggle: () => {}, onOpenChart: () => {} });
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('.panel-company-name').textContent).toBe('Reliance Industries');
    expect(container.querySelector('.panel-company-stat-label').textContent).toBe('Croissance CA');
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd webapp && npx vitest run src/panel/companyList.test.js`
  Expected: FAIL — the input-count test fails (9 ≠ 13), the 3 new tests fail (`.panel-company-stat-label-input` doesn't exist yet).

- [ ] **Step 3: Write the implementation**

  In `webapp/src/panel/companyList.js`, replace `buildStatsGrid`'s label section:
  ```js
  function buildStatsGrid(item, isEditing, onEditItem) {
    const stats = document.createElement('div');
    stats.className = 'panel-company-stats';
    for (const [labelField, valueField, defaultLabel] of STAT_FIELDS) {
      const stat = document.createElement('div');
      stat.className = 'panel-company-stat';

      const label = document.createElement('span');
      label.className = 'panel-company-stat-label';
      if (isEditing) {
        label.appendChild(buildEditableInput(item[labelField] || defaultLabel, 'text', 'panel-company-stat-label-input', v => onEditItem(item, { [labelField]: v })));
      } else {
        label.textContent = item[labelField] || defaultLabel;
      }

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
  ```
  (Only the label branch is new — the value branch is unchanged, shown here for context/exact placement.)

  In `webapp/src/panel/companyList.css`, add `.panel-company-stat-label-input` to the existing shared input selector list:
  ```css
  .panel-company-name-input,
  .panel-company-sub-input,
  .panel-company-cap-input,
  .panel-company-stat-input,
  .panel-company-stat-label-input {
    width: 100%;
    box-sizing: border-box;
    background: #0f1730;
    border: 1px solid rgba(224, 181, 61, 0.4);
    border-radius: 4px;
    color: #fff;
    font-size: 12px;
    padding: 2px 4px;
  }
  ```
  (Copy whatever the current full rule body actually is at that selector — don't retype from memory, the exact properties must match what's already there so this is purely additive to the selector list, not a value change.)

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd webapp && npx vitest run src/panel/companyList.test.js`
  Expected: PASS — all tests pass (existing, unmodified tests + updated count + 3 new label tests).

- [ ] **Step 5: Run the full automated test suite**

  Run: `cd webapp && npx vitest run`
  Expected: PASS — all tests pass (267 existing + 3 net-new = 270), 0 failures.

- [ ] **Step 6: Verify the production build still works**

  Run: `cd webapp && npm run build`
  Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add webapp/src/panel/companyList.js webapp/src/panel/companyList.css webapp/src/panel/companyList.test.js
  git commit -m "feat: make company stat labels editable"
  ```

---
### Task 2: Manual verification against live production Firestore

**No files changed in this task — verification only.**

- [ ] Run `cd webapp && npm run dev`, open the printed local URL in a browser.
- [ ] Unlock edit mode with the admin password.
- [ ] Add an obviously-fake test company (e.g. name "TEST — À IGNORER — relabeling") via "+ Ajouter une entreprise".
- [ ] Confirm each of the 4 stat labels shows as an editable input pre-filled with its default text ("Croissance CA", "EV/EBITDA", "Cours actuel", "Objectif") — not empty.
- [ ] Change one label (e.g. "EV/EBITDA" → "EV/EBITDA (fwd 2026)") and its value; confirm both commit (no console errors, no toast failure).
- [ ] Exit edit mode: confirm the stat now displays with the **custom** label, not the default.
- [ ] Hard-reload the page: confirm the custom label persisted in Firestore (survives reload, not just local state).
- [ ] Re-enter edit mode: confirm the label input now pre-fills with the custom label (not the default) when editing again.
- [ ] Select this test company plus one real company for comparison (⚖ icon): confirm the comparison table shows the divergent label correctly (already-existing, already-tested behavior — just confirming no regression in the live app).
- [ ] Delete the test company; confirm removal persists across another hard reload.
- [ ] Spot-check 2-3 real companies' stats are untouched throughout (correct labels and values, unchanged).
- [ ] No console errors during any of the above.
- [ ] Confirm `cd webapp && npx vitest run` is still fully green after the manual session.

---
### End of Plan

At this point company stat relabeling is fully implemented:
- All 4 stat labels (Croissance CA / EV/EBITDA / Cours actuel / Objectif) are editable in edit mode, pre-filled with their current label (custom or default)
- Values remain editable exactly as before (unchanged)
- Read-only display and the comparison table already correctly showed custom labels before this plan (no changes needed there) — this plan only closes the edit-mode input gap
- No data model or Firestore key changes — purely an additive UI wiring change reusing the existing generic patch-merge write path
- All automated tests pass; production build still works

Still pending, as separate later plans: portfolio-region management; the "annuler tout" undo/session-snapshot system; color pickers; dynamic `import()` of `html2pdf.js`; the "Présentations" sub-feature for IA & Fintech; closing the patch-shape test-coverage gap in `sidePanel.test.js` (companyList's own gap is now closed by this plan); a final visual-theme + mobile-fallback pass; and the eventual production cutover.
