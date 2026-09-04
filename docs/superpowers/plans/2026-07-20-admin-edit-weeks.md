# Gestion des semaines (mode édition) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the password-gated edit mode (already shipped for market indices, companies, the portfolio table, and news briefs) to basic week management: create a new week, rename the label of the currently-active week. This closes out the base admin/edit feature for weekly content — every section that has content now has a way to create the week it lives in.

**Deliberately narrow scope (confirmed with the user's established pattern of one section at a time):** production's admin UI also supports duplicating a week (copying an existing week's whole structure) and deleting a week (cascading delete of every market/news/company document under it, dozens of documents at once, no transaction/atomicity). Both are explicitly **out of scope for this plan** and deferred to a dedicated future plan — a cascading multi-document delete against the live production database, with no atomic rollback if some deletes succeed and others fail, deserves its own careful design and review rather than being bundled in here. Portfolio-region management (renaming/adding/deleting the region groupings themselves) is also out of scope, deferred. This plan only ever adds a new, empty week document or renames one field on the currently-active week — both single-document, low-risk operations matching the pattern already proven safe four times over.

**Architecture:**
- `webapp/src/timeline/weekTimeline.js`'s `initWeekTimeline` (from Phase 2, already shipped, currently render-once/no-return) gains a returned `{ setWeeks(weeks, activeWeekId) }` so the dot timeline can be refreshed after an admin creates or renames a week — without this, a newly created week's dot simply wouldn't appear until a full page reload, since `initWeekTimeline` is only ever called once in `bootstrap()`. This is a small, backward-compatible addition (existing callers that ignore the return value are unaffected).
- `webapp/src/timeline/weekAdmin.js` is a new, small, pure-rendering module — `renderWeekAdmin(container, { activeWeek, isEditing, onLabelEdit, onAddWeek })` — structurally the simplest edit-mode component yet: renders nothing at all when `isEditing` is false, and when true, renders the active week's label as an editable `<input>` (reusing `webapp/src/admin/editableInput.js`) plus a "+ Nouvelle semaine" button. It doesn't touch `weekTimeline.js`'s dot rendering at all — the dots stay pure read-only navigation; this is a separate, small floating control cluster that only appears in edit mode.
- `main.js` gains `handleWeekLabelEdit`/`handleWeekAdd`, the same optimistic-update-with-rollback-on-failure pattern as every other section, with one added nuance: `handleWeekAdd` also changes `activeWeekId` (switching to the newly created week, since that's the natural next step after creating one) — so its rollback-on-failure path must revert *both* the Firestore-mirrored `db` state *and* `activeWeekId` back to what they were, not just the document. Firestore key format: `mkg:week:{id}`, value `{id, label, order}` — a new week's `order` is computed as `max(existing orders) + 1` so it sorts to the end of the timeline, matching the natural weekly cadence.
- `renderPanelForCurrentSelection` (already called on every region/week switch and every edit commit) gains one more call: `renderWeekAdmin(...)`, and `bootstrap()` keeps the object `initWeekTimeline` now returns so the handlers can call `setWeeks` after a change.

**Tech Stack:** Same as prior plans — vanilla JS + Vite, Vitest with jsdom for DOM components.

## Global Constraints

- **This plan writes to the same live production Firestore database** the interns use every week — no staging environment. Manual verification (Task 3) must only ever create a new, obviously-fake test week and rename *that* week's label — **never rename a real, existing week's label** (every real week label is meaningful, curated content interns rely on to find the right week).
- **No delete-week capability in this plan** — do not add one. If a stray test week needs cleaning up after manual verification, note that this plan provides no delete affordance for weeks (unlike every other section) — see Task 3's manual verification step for how to handle this without one.
- Firestore document shape: key `mkg:week:{id}`, value `{id, label, order}`. Edits must be a shallow merge (`{...previous, ...patch}`).
- Do not modify `webapp/src/globe/*`, `webapp/src/data/*`, `webapp/src/panel/*`, `webapp/src/admin/passwordModal.js`/`toast.js`/`uid.js`/`config.js`/`editableInput.js` (all already built, reused as-is). This plan touches only `webapp/src/timeline/weekTimeline.js`/`.test.js`, the new `webapp/src/timeline/weekAdmin.js`/`.test.js`/`.css`, `webapp/src/main.js`, and `webapp/index.html`.

---

### Task 1: Make the week timeline dynamically updatable

**Files:**
- Modify: `webapp/src/timeline/weekTimeline.js`
- Modify: `webapp/src/timeline/weekTimeline.test.js`

**Interfaces:**
- Changes: `initWeekTimeline(...)` now returns `{ setWeeks(newWeeks, activeWeekId): void }`. Existing callers that ignore the return value are unaffected. Used by Task 3's `main.js`.

- [ ] **Step 1: Add the failing tests**

Add to `webapp/src/timeline/weekTimeline.test.js` (keep the existing 5 tests exactly as they are, add this new block):
```js
describe('setWeeks', () => {
  it('re-renders with the new weeks list and marks the given active week', () => {
    const container = document.createElement('div');
    const timeline = initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    const newWeeks = [...WEEKS, { id: 'w3', label: 'Semaine 3', order: 2 }];
    timeline.setWeeks(newWeeks, 'w3');
    const dots = container.querySelectorAll('.week-dot');
    expect(dots).toHaveLength(3);
    expect(dots[2].classList.contains('active')).toBe(true);
    expect(dots[0].classList.contains('active')).toBe(false);
  });

  it("updates a dot's accessible label when a week is renamed", () => {
    const container = document.createElement('div');
    const timeline = initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    const renamed = WEEKS.map(w => (w.id === 'w1' ? { ...w, label: 'Nouveau nom' } : w));
    timeline.setWeeks(renamed, 'w1');
    expect(container.querySelectorAll('.week-dot')[0].getAttribute('aria-label')).toBe('Nouveau nom');
  });

  it('newly rendered dots still call onSelect with the clicked week id', () => {
    const container = document.createElement('div');
    const onSelect = vi.fn();
    const timeline = initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect });
    const newWeeks = [...WEEKS, { id: 'w3', label: 'Semaine 3', order: 2 }];
    timeline.setWeeks(newWeeks, 'w1');
    container.querySelectorAll('.week-dot')[2].click();
    expect(onSelect).toHaveBeenCalledWith('w3');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/timeline/weekTimeline.test.js`
Expected: FAIL — `timeline.setWeeks is not a function` (the pre-existing 5 tests, which don't use the return value, still pass).

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/timeline/weekTimeline.js`:
```js
export function initWeekTimeline({ container, weeks, activeWeekId, onSelect }) {
  let currentWeeks = weeks;

  function render(currentActiveId) {
    container.replaceChildren();
    for (const week of currentWeeks) {
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

  return {
    setWeeks(newWeeks, newActiveWeekId) {
      currentWeeks = newWeeks;
      render(newActiveWeekId);
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/timeline/weekTimeline.test.js`
Expected: PASS — 8 tests total (5 original + 3 new).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/timeline/weekTimeline.js webapp/src/timeline/weekTimeline.test.js
git commit -m "feat: allow the week timeline to be refreshed after weeks change"
```

---

### Task 2: Week admin controls — rendering

**Files:**
- Create: `webapp/src/timeline/weekAdmin.js`
- Create: `webapp/src/timeline/weekAdmin.test.js`
- Create: `webapp/src/timeline/weekAdmin.css`

**Interfaces:**
- Produces: `renderWeekAdmin(container, { activeWeek, isEditing, onLabelEdit, onAddWeek }): void`. Used by Task 3's `main.js`.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/timeline/weekAdmin.test.js`
```js
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderWeekAdmin } from './weekAdmin.js';

const WEEK = { id: 'w1', label: 'Semaine 1', order: 0 };

describe('renderWeekAdmin', () => {
  it('renders nothing when isEditing is false', () => {
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: WEEK, isEditing: false, onLabelEdit: () => {}, onAddWeek: () => {} });
    expect(container.children).toHaveLength(0);
  });

  it('renders the active week label as an editable input and an add-week button when isEditing is true', () => {
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: WEEK, isEditing: true, onLabelEdit: () => {}, onAddWeek: () => {} });
    const input = container.querySelector('.week-admin-label-input');
    expect(input).not.toBeNull();
    expect(input.value).toBe('Semaine 1');
    expect(container.querySelector('.week-admin-add')).not.toBeNull();
  });

  it('calls onLabelEdit with the active week and a label patch when the input changes', () => {
    const onLabelEdit = vi.fn();
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: WEEK, isEditing: true, onLabelEdit, onAddWeek: () => {} });
    const input = container.querySelector('.week-admin-label-input');
    input.value = 'Semaine renommée';
    input.dispatchEvent(new Event('change'));
    expect(onLabelEdit).toHaveBeenCalledWith(WEEK, { label: 'Semaine renommée' });
  });

  it('calls onAddWeek when the add-week button is clicked', () => {
    const onAddWeek = vi.fn();
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: WEEK, isEditing: true, onLabelEdit: () => {}, onAddWeek });
    container.querySelector('.week-admin-add').click();
    expect(onAddWeek).toHaveBeenCalledTimes(1);
  });

  it('renders the add-week button (but no label input, no crash) when isEditing is true and activeWeek is null', () => {
    const container = document.createElement('div');
    expect(() => renderWeekAdmin(container, { activeWeek: null, isEditing: true, onLabelEdit: () => {}, onAddWeek: () => {} })).not.toThrow();
    expect(container.querySelector('.week-admin-label-input')).toBeNull();
    expect(container.querySelector('.week-admin-add')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/timeline/weekAdmin.test.js`
Expected: FAIL — `Cannot find module './weekAdmin.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/timeline/weekAdmin.js`
```js
import { buildEditableInput } from '../admin/editableInput.js';

export function renderWeekAdmin(container, { activeWeek, isEditing, onLabelEdit, onAddWeek }) {
  container.replaceChildren();
  if (!isEditing) return;

  if (activeWeek) {
    const labelInput = buildEditableInput(activeWeek.label, 'text', 'week-admin-label-input', v => onLabelEdit(activeWeek, { label: v }));
    container.appendChild(labelInput);
  }

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'week-admin-add';
  addBtn.textContent = '+ Nouvelle semaine';
  addBtn.addEventListener('click', () => onAddWeek());
  container.appendChild(addBtn);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/timeline/weekAdmin.test.js`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Write the stylesheet**

File: `webapp/src/timeline/weekAdmin.css`
```css
.week-admin {
  position: fixed;
  top: 44px;
  left: 40px;
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.week-admin-label-input {
  width: 180px;
  box-sizing: border-box;
  background: rgba(15, 23, 48, 0.95);
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  padding: 6px 8px;
}

.week-admin-add {
  width: 180px;
  box-sizing: border-box;
  background: rgba(15, 23, 48, 0.95);
  border: 1px dashed rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: var(--gold-light, #e0b53d);
  cursor: pointer;
  font-size: 11px;
  padding: 6px 8px;
}

.week-admin-add:hover {
  background: rgba(201, 151, 31, 0.2);
}
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/timeline/weekAdmin.js webapp/src/timeline/weekAdmin.test.js webapp/src/timeline/weekAdmin.css
git commit -m "feat: add week admin controls (rename active week, add a new week)"
```

---

### Task 3: Wire week management into the app and verify end-to-end

**Files:**
- Modify: `webapp/src/main.js`
- Modify: `webapp/index.html`

**Interfaces:**
- Consumes: `initWeekTimeline`'s new return value (Task 1), `renderWeekAdmin` (Task 2).
- Produces: the running application. Final deliverable of this plan.

- [ ] **Step 1: Add the markup**

Modify `webapp/index.html` — add this as a sibling of `#week-timeline`, right after it:
```html
  <div id="week-admin" class="week-admin"></div>
```

- [ ] **Step 2: Wire everything into `main.js`**

Add the imports:
```js
import './timeline/weekAdmin.css';
import { renderWeekAdmin } from './timeline/weekAdmin.js';
```

Add top-level state next to the other `let` declarations:
```js
let weekTimelineHandle = null;
```

Add the handlers (near the existing `handleNews*` functions):
```js
function weekItemKey(week) {
  return `mkg:week:${week.id}`;
}

function handleWeekLabelEdit(week, patch) {
  const key = weekItemKey(week);
  const previous = db[key];
  const updated = { ...previous, ...patch };
  db[key] = updated;
  if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
  renderPanelForCurrentSelection();
  client.writeDoc(key, updated).catch(() => {
    db[key] = previous;
    if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');
  });
}

function handleWeekAdd() {
  const id = generateId();
  const key = `mkg:week:${id}`;
  const existingWeeks = getWeeks(db);
  const maxOrder = existingWeeks.reduce((max, w) => Math.max(max, w.order), -1);
  const newWeek = { id, label: 'Nouvelle semaine', order: maxOrder + 1 };
  const previousActiveWeekId = activeWeekId;

  db[key] = newWeek;
  activeWeekId = id;
  if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
  renderPanelForCurrentSelection();

  client.writeDoc(key, newWeek).catch(() => {
    delete db[key];
    activeWeekId = previousActiveWeekId;
    if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Ajout en ligne échoué — la nouvelle semaine a été retirée');
  });
}
```
(Note `handleWeekAdd` reverts two pieces of state on failure, not just one — `db` and `activeWeekId` — since the optimistic update switched the active week as well as adding the document. `previousActiveWeekId` is captured before either change so the revert is exact, not a re-derivation.)

Update `renderPanelForCurrentSelection` — add the `renderWeekAdmin(...)` call (everything else in the function stays exactly as it is after the earlier plans):
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
    isEditing,
  });

  renderWeekAdmin(document.getElementById('week-admin'), {
    activeWeek: getWeeks(db).find(w => w.id === activeWeekId) || null,
    isEditing,
    onLabelEdit: handleWeekLabelEdit,
    onAddWeek: handleWeekAdd,
  });

  if (liveRefreshHandle) liveRefreshHandle.stop();
  liveRefreshHandle = startPortfolioLiveRefresh({
    getEntries: () => portfolioEntries,
    onOverrides: overrides => panel.updateLiveQuotes(overrides),
  });
}
```

Update `bootstrap()` to capture `initWeekTimeline`'s return value (only the one line assigning `weekTimelineHandle` changes — everything else in `bootstrap()` stays as it is):
```js
    weekTimelineHandle = initWeekTimeline({
      container: timelineEl,
      weeks,
      activeWeekId,
      onSelect: weekId => {
        activeWeekId = weekId;
        renderPanelForCurrentSelection();
      },
    });
```

- [ ] **Step 3: Run the full automated test suite**

Run: `cd webapp && npm test`
Expected: PASS — all tests pass, 0 failures. (No new tests in this task — `main.js` has no unit tests, matching every earlier plan's precedent.)

- [ ] **Step 4: Manual browser verification — READ THE SAFETY NOTE FIRST**

**Safety note:** same live production Firestore as every earlier admin-edit plan, no staging environment. This plan has **no delete-week capability** — a test week created during verification cannot be removed through the UI. Accept that a leftover test week will remain visible (as an extra, obviously-fake dot/entry) until a future plan adds week deletion, OR delete it directly and manually via the Firebase console (`mkg_data` collection, document id matching the generated week's key) after verification if you have console access — either is acceptable, but **do not** improvise a delete code path outside this plan's scope to clean it up.

Run: `cd webapp && npm run dev`, then open the printed local URL in a browser.

Checklist:
- [ ] Unlock edit mode. A small "week admin" panel appears near the top-left, showing the current week's label as an input and a "+ Nouvelle semaine" button.
- [ ] Click "+ Ajouter"/"+ Nouvelle semaine". A new dot appears in the week timeline (far-left strip), the app switches to it immediately, and the panel now shows an empty region (no indices/news/companies/portfolio yet for this new week — expected, since nothing has been added to it). The week-admin label input now shows "Nouvelle semaine".
- [ ] **Immediately rename this new week's label to something unmistakably a test, e.g. `TEST — SEMAINE À IGNORER`,** by editing the week-admin label input and tabbing out.
- [ ] Reload the page fully (hard refresh). Confirm the test week still exists (its dot is present, clicking it shows the renamed label if you re-enter edit mode) — proves both writes reached Firestore.
- [ ] Click through the existing real week dots (via the timeline strip) and confirm every real week's content (indices, news, companies, portfolio) is completely unaffected — this plan never touches any week's content, only the week documents themselves.
- [ ] Exit edit mode. Confirm the week-admin panel disappears entirely and the timeline dots go back to being purely clickable navigation with no visible change in behavior.
- [ ] No console errors during any of the above.

- [ ] **Step 5: Verify the production build still works**

Run: `cd webapp && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add webapp/src/main.js webapp/index.html
git commit -m "feat: wire password-gated week creation and renaming"
```

---

## End of Plan

At this point market indices, companies, the portfolio table, news briefs, and basic week management (create + rename) are all editable under the same password-gated edit mode. Still pending, as separate later plans: week duplication and cascading week deletion (deliberately deferred here, needs its own careful design given the blast radius of a multi-document, non-atomic delete against live production data); portfolio-region management; relabeling company stat labels; the "annuler tout" undo/session-snapshot system; color pickers; PDF export; the IA & Fintech panel; a final visual-theme + mobile-fallback pass; and the eventual production cutover.
