# Duplication de semaine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add week duplication capability to the password-gated edit mode, allowing administrators to duplicate the currently-active week (including all its content: market indices, companies, news briefs, and IA & Fintech items — across all regions, not just the currently-viewed one) into a new week.

**Revision note:** This supersedes an earlier draft of this same plan that was never implemented (no commits exist on the `week-duplication` worktree beyond `main`). That draft had three bugs caught during review before any code was written: (1) it used the Firestore key prefix `mkg:content:indices:{weekId}:{id}` for market indices, but the real prefix (confirmed in `main.js`'s `marketItemKey()` and `selectors.js`'s `getWeekContentKeys`) is `mkg:market:{weekId}:{id}` — duplicated indices would have been written under a prefix no selector reads, silently vanishing from the UI; (2) it read source content only for `activeRegionId` (the region currently being viewed) via the region-filtered selectors, when indices/news/companies are region-scoped data — duplicating a week while viewing "Asie" would have silently dropped BRICS+UK/Europe/Amérique du Nord content; (3) its test task imported `handleWeekDuplicate` from `main.js` expecting it to be exported, breaking with the rest of the codebase's convention (`main.js`'s other edit handlers are never exported or unit-tested directly — see `project-globe-redesign-status` memory, phase 8's note). This revision fixes all three.

**Architecture:**
- Reuse the existing week creation infrastructure and rollback-on-failure pattern from `handleWeekAdd` in `main.js`.
- Add three new **unfiltered**, week-scoped (not region-scoped) selectors to `selectors.js` — `getAllMarketItemsForWeek`, `getAllNewsItemsForWeek`, `getAllCompanyItemsForWeek` — mirroring the existing `getIaFintechItemsForWeek` (which is already unfiltered, since IA & Fintech has no region field). These are pure, easily unit-tested functions, giving the actual data-copying logic real test coverage even though the orchestrating `handleWeekDuplicate` handler in `main.js` won't be (matches project convention).
- Add `writeDocsBatch(entries)` to `firestoreClient.js`, mirroring the existing `deleteDocsBatch(keys)` added for cascading week deletion (phase 12) — uses the same `writeBatch` primitive already imported there. This makes the new week document + all copied content documents a single atomic Firestore write: either all of it lands or none of it does, avoiding a partially-duplicated week if the write fails midway. `deleteDocsBatch` has no direct unit test today (it wraps the real Firestore SDK) — `writeDocsBatch` follows the same precedent, verified via manual testing instead.
- New handler `handleWeekDuplicate(sourceWeek)` in `main.js`:
  1. Reads all content for the source week across all regions using the new unfiltered selectors.
  2. Builds a new week document (`label` = `"{source label} (copie)"`, `order` = max existing order + 1) and a fresh copy of every content item with a newly generated `id`, keyed under the new week's id.
  3. Optimistically writes everything into local `db`, switches `activeWeekId` to the new week, re-renders.
  4. Persists atomically via `client.writeDocsBatch`; on failure, rolls back every optimistically-added key and (with the same "only if the user hasn't since navigated elsewhere" guard already used in `handleWeekAdd`/`handleWeekDelete`) restores `activeWeekId`.
- Portfolio entries are **never copied** — confirmed not week-scoped (`mkg:portfolio:{id}`, no week id in the key).
- **No `window.confirm()` gate.** Unlike week deletion (phase 12's deliberate, blast-radius-justified exception), duplication only ever *adds* data — it never touches existing weeks or content — so it follows the codebase's default "act immediately, rely on rollback" pattern used by every `Add` handler, not the confirm-then-mutate pattern reserved for destructive actions.

**Tech Stack:** Same as prior plans — vanilla JS + Vite, Vitest with jsdom for DOM/data-layer components.

## Global Constraints

- **This plan writes to the same live production Firestore database** the interns use every week — no staging environment. Manual verification (Task 5) must only ever duplicate an obviously-fake test week — **never duplicate a real, existing week's content** (to avoid polluting production data with test duplicates).
- Real Firestore document shapes (verified against the current code, not assumed):
  - Week: `mkg:week:{id}` → `{id, label, order}`
  - Market indices: `mkg:market:{weekId}:{id}` → `{id, group, flag, name, value, weekChange, ytdChange, ...}` — region-scoped via free-text `group` label (matched through `normalizeRegionLabel`)
  - Companies: `mkg:content:entreprises:{weekId}:{id}` → `{id, region, name, yahooSymbol, flag, country, marketCap, ..., bullets: [...]}` — region-scoped via `region`
  - News: `mkg:content:news:{weekId}:{id}` → `{id, region, title, description}` — region-scoped via `region`
  - IA & Fintech: `mkg:content:ia-fintech:{weekId}:{id}` → `{id, tag, title, description, statLabel, statValue, link}` — **not** region-scoped
  - Portfolio: `mkg:portfolio:{id}` → `{id, date, entreprise, stagiaire, symbol, regionId, depuis, ytd}` — **not week-scoped, not copied**
- Do not modify `webapp/src/globe/*`, `webapp/src/data/regionMatch.js`/`portfolioSelectors.js`/`quoteClient.js`/`portfolioLiveQuotes.js`, `webapp/src/admin/passwordModal.js`/`toast.js`/`uid.js`/`config.js`/`editableInput.js` (all already built, reused as-is).
- This plan touches only: `webapp/src/data/firestoreClient.js`/`.test.js` is not touched (see Task 1 note), `webapp/src/data/selectors.js`/`.test.js`, `webapp/src/timeline/weekAdmin.js`/`.test.js`/`.css`, `webapp/src/main.js`.
- Preserve the existing `onDeleteWeek`/delete-button wiring in `weekAdmin.js` exactly as-is — the earlier draft's code sketch for this file omitted it entirely, which would have been a silent regression of the already-shipped cascading-delete feature (phase 12).

---
### Task 1: Add atomic multi-document write to the Firestore client

**Files:**
- Modify: `webapp/src/data/firestoreClient.js`

**Interfaces:**
- Adds: `writeDocsBatch(entries: Array<[key: string, value: object]>): Promise<void>` to the object returned by `createFirestoreClient()`

- [ ] **Step 1: Implement `writeDocsBatch`**

  In `webapp/src/data/firestoreClient.js`, add alongside `deleteDocsBatch` (same file, uses the already-imported `writeBatch`):
  ```js
  async function writeDocsBatch(entries) {
    if (entries.length === 0) return;
    await writeWithRetry(async () => {
      const batch = writeBatch(db);
      for (const [key, value] of entries) {
        batch.set(doc(db, MAIN_COLLECTION, key), {
          value: JSON.stringify(value),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    });
  }
  ```

  Update the return statement:
  ```js
  return { loadAllOnce, writeDoc, deleteDocByKey, deleteDocsBatch, writeDocsBatch };
  ```

  No new unit test for this function specifically — `deleteDocsBatch`, its structural twin added in phase 12, has none either (both wrap the real Firestore SDK; `writeWithRetry`, the part that's actually pure logic, already has full coverage in `firestoreClient.test.js`). Covered instead by Task 5's manual verification.

- [ ] **Step 2: Run the existing test suite to confirm nothing broke**

  Run: `cd webapp && npx vitest run src/data/firestoreClient.test.js`
  Expected: PASS — all existing tests still pass (this change is additive only).

- [ ] **Step 3: Commit**

  ```bash
  git add webapp/src/data/firestoreClient.js
  git commit -m "feat: add atomic multi-document write to the Firestore client"
  ```

---
### Task 2: Add unfiltered, week-scoped content selectors

**Files:**
- Modify: `webapp/src/data/selectors.js`
- Modify: `webapp/src/data/selectors.test.js`

**Interfaces:**
- Adds: `getAllMarketItemsForWeek(db, weekId): object[]`
- Adds: `getAllNewsItemsForWeek(db, weekId): object[]`
- Adds: `getAllCompanyItemsForWeek(db, weekId): object[]`

- [ ] **Step 1: Write the failing tests**

  Add to `webapp/src/data/selectors.test.js` (reuses the existing top-level `DB` fixture, which already has `w1` market items in 2+ distinct groups, `w1` news in 2+ distinct regions, and `w1` companies in 2+ distinct regions — see the fixture already at the top of the file):
  ```js
  import { getWeeks, getMarketItemsForWeekAndRegion, getNewsItemsForWeekAndRegion, getCompanyItemsForWeekAndRegion, getIaFintechItemsForWeek, getWeekContentKeys, getAllMarketItemsForWeek, getAllNewsItemsForWeek, getAllCompanyItemsForWeek } from './selectors.js';
  ```
  ```js
  describe('getAllMarketItemsForWeek', () => {
    it('returns every market item for the week regardless of region', () => {
      const items = getAllMarketItemsForWeek(DB, 'w1');
      expect(items.map(i => i.name).sort()).toEqual(['CAC 40', 'EUR/USD', 'Nikkei 225']);
    });

    it('does not leak items from a different week', () => {
      const items = getAllMarketItemsForWeek(DB, 'w1');
      expect(items.some(i => i.name === 'Hang Seng')).toBe(false);
    });

    it('returns an empty array when nothing matches', () => {
      expect(getAllMarketItemsForWeek(DB, 'w9')).toEqual([]);
    });
  });

  describe('getAllNewsItemsForWeek', () => {
    it('returns every news item for the week regardless of region', () => {
      const items = getAllNewsItemsForWeek(DB, 'w1');
      expect(items.map(i => i.id).sort()).toEqual(['n1', 'n2']);
    });

    it('returns an empty array when nothing matches', () => {
      expect(getAllNewsItemsForWeek(DB, 'w9')).toEqual([]);
    });
  });

  describe('getAllCompanyItemsForWeek', () => {
    it('returns every company item for the week regardless of region', () => {
      const items = getAllCompanyItemsForWeek(DB, 'w1');
      expect(items.map(i => i.id).sort()).toEqual(['c1', 'c2']);
    });

    it('does not leak items from a different week', () => {
      const items = getAllCompanyItemsForWeek(DB, 'w1');
      expect(items.some(i => i.name === 'Toyota')).toBe(false);
    });

    it('returns an empty array when nothing matches', () => {
      expect(getAllCompanyItemsForWeek(DB, 'w9')).toEqual([]);
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd webapp && npx vitest run src/data/selectors.test.js`
  Expected: FAIL — `getAllMarketItemsForWeek`/`getAllNewsItemsForWeek`/`getAllCompanyItemsForWeek` are not exported yet.

- [ ] **Step 3: Write the implementation**

  Add to `webapp/src/data/selectors.js`:
  ```js
  export function getAllMarketItemsForWeek(db, weekId) {
    const prefix = `mkg:market:${weekId}:`;
    return Object.keys(db)
      .filter(key => key.startsWith(prefix))
      .map(key => db[key]);
  }

  export function getAllNewsItemsForWeek(db, weekId) {
    const prefix = `mkg:content:news:${weekId}:`;
    return Object.keys(db)
      .filter(key => key.startsWith(prefix))
      .map(key => db[key]);
  }

  export function getAllCompanyItemsForWeek(db, weekId) {
    const prefix = `mkg:content:entreprises:${weekId}:`;
    return Object.keys(db)
      .filter(key => key.startsWith(prefix))
      .map(key => db[key]);
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd webapp && npx vitest run src/data/selectors.test.js`
  Expected: PASS — all tests pass (existing + 9 new).

- [ ] **Step 5: Commit**

  ```bash
  git add webapp/src/data/selectors.js webapp/src/data/selectors.test.js
  git commit -m "feat: add unfiltered week-scoped content selectors for week duplication"
  ```

---
### Task 3: Add a duplicate-week button to week admin controls

**Files:**
- Modify: `webapp/src/timeline/weekAdmin.js`
- Modify: `webapp/src/timeline/weekAdmin.test.js`
- Modify: `webapp/src/timeline/weekAdmin.css`

**Interfaces:**
- Modifies: `renderWeekAdmin(container, { activeWeek, isEditing, onLabelEdit, onAddWeek, onDeleteWeek, onDuplicateWeek }): void`

- [ ] **Step 1: Write the failing tests**

  Add to `webapp/src/timeline/weekAdmin.test.js` (do not remove or change any existing test — `onDeleteWeek`/`.week-admin-delete` must keep working exactly as today):
  ```js
  it('renders a duplicate-week button in edit mode that calls onDuplicateWeek with the active week', () => {
    const onDuplicateWeek = vi.fn();
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: WEEK, isEditing: true, onLabelEdit: () => {}, onAddWeek: () => {}, onDeleteWeek: () => {}, onDuplicateWeek });
    container.querySelector('.week-admin-duplicate').click();
    expect(onDuplicateWeek).toHaveBeenCalledWith(WEEK);
  });

  it('does not render a duplicate-week button when there is no active week', () => {
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: null, isEditing: true, onLabelEdit: () => {}, onAddWeek: () => {}, onDeleteWeek: () => {}, onDuplicateWeek: () => {} });
    expect(container.querySelector('.week-admin-duplicate')).toBeNull();
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd webapp && npx vitest run src/timeline/weekAdmin.test.js`
  Expected: FAIL — `.week-admin-duplicate` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

  Modify `webapp/src/timeline/weekAdmin.js` (adds the duplicate button next to the existing label input and delete button — does not touch the `onDeleteWeek` wiring):
  ```js
  import { buildEditableInput } from '../admin/editableInput.js';

  export function renderWeekAdmin(container, { activeWeek, isEditing, onLabelEdit, onAddWeek, onDeleteWeek, onDuplicateWeek }) {
    container.replaceChildren();
    if (!isEditing) return;

    if (activeWeek) {
      const labelInput = buildEditableInput(activeWeek.label, 'text', 'week-admin-label-input', v => onLabelEdit(activeWeek, { label: v }));
      container.appendChild(labelInput);

      const duplicateBtn = document.createElement('button');
      duplicateBtn.type = 'button';
      duplicateBtn.className = 'week-admin-duplicate';
      duplicateBtn.textContent = '📋 Dupliquer cette semaine';
      duplicateBtn.addEventListener('click', () => onDuplicateWeek(activeWeek));
      container.appendChild(duplicateBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'week-admin-delete';
      deleteBtn.textContent = '✕ Supprimer cette semaine';
      deleteBtn.addEventListener('click', () => onDeleteWeek(activeWeek));
      container.appendChild(deleteBtn);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'week-admin-add';
    addBtn.textContent = '+ Nouvelle semaine';
    addBtn.addEventListener('click', () => onAddWeek());
    container.appendChild(addBtn);
  }
  ```

  Add to `webapp/src/timeline/weekAdmin.css` (reuses the existing gold dashed-border look already used by `.week-admin-add`, since duplicating is a constructive action like adding — not destructive like `.week-admin-delete`'s red style):
  ```css
  .week-admin-duplicate {
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

  .week-admin-duplicate:hover {
    background: rgba(201, 151, 31, 0.2);
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd webapp && npx vitest run src/timeline/weekAdmin.test.js`
  Expected: PASS — all tests pass (7 existing + 2 new).

- [ ] **Step 5: Commit**

  ```bash
  git add webapp/src/timeline/weekAdmin.js webapp/src/timeline/weekAdmin.test.js webapp/src/timeline/weekAdmin.css
  git commit -m "feat: add duplicate-week button to week admin controls"
  ```

---
### Task 4: Wire week duplication in main.js

**Files:**
- Modify: `webapp/src/main.js`

**Interfaces:**
- Adds (module-private, not exported — matches every other `handle*` function in this file): `handleWeekDuplicate(sourceWeek)`, `duplicateContentEntries(items, keyPrefix, newWeekId)`

- [ ] **Step 1: Update the selectors import**

  Change the existing import line:
  ```js
  import { getWeeks, getMarketItemsForWeekAndRegion, getNewsItemsForWeekAndRegion, getCompanyItemsForWeekAndRegion, getIaFintechItemsForWeek, getWeekContentKeys } from './data/selectors.js';
  ```
  to:
  ```js
  import { getWeeks, getMarketItemsForWeekAndRegion, getNewsItemsForWeekAndRegion, getCompanyItemsForWeekAndRegion, getIaFintechItemsForWeek, getWeekContentKeys, getAllMarketItemsForWeek, getAllNewsItemsForWeek, getAllCompanyItemsForWeek } from './data/selectors.js';
  ```

- [ ] **Step 2: Add `handleWeekDuplicate`**

  Add near `handleWeekDelete` (after it, before the `panel = initSidePanel(...)` block):
  ```js
  function duplicateContentEntries(items, keyPrefix, newWeekId) {
    return items.map(item => {
      const newId = generateId();
      return [`${keyPrefix}${newWeekId}:${newId}`, { ...item, id: newId }];
    });
  }

  function handleWeekDuplicate(sourceWeek) {
    const sourceWeekId = sourceWeek.id;
    const newWeekId = generateId();
    const newWeekKey = `mkg:week:${newWeekId}`;
    const existingWeeks = getWeeks(db);
    const maxOrder = existingWeeks.reduce((max, w) => Math.max(max, w.order), -1);
    const newWeek = { id: newWeekId, label: `${sourceWeek.label} (copie)`, order: maxOrder + 1 };
    const previousActiveWeekId = activeWeekId;

    const contentEntries = [
      ...duplicateContentEntries(getAllMarketItemsForWeek(db, sourceWeekId), 'mkg:market:', newWeekId),
      ...duplicateContentEntries(getAllNewsItemsForWeek(db, sourceWeekId), 'mkg:content:news:', newWeekId),
      ...duplicateContentEntries(getAllCompanyItemsForWeek(db, sourceWeekId), 'mkg:content:entreprises:', newWeekId),
      ...duplicateContentEntries(getIaFintechItemsForWeek(db, sourceWeekId), 'mkg:content:ia-fintech:', newWeekId),
    ];

    db[newWeekKey] = newWeek;
    for (const [key, value] of contentEntries) db[key] = value;
    activeWeekId = newWeekId;
    if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
    renderPanelForCurrentSelection();

    client.writeDocsBatch([[newWeekKey, newWeek], ...contentEntries]).catch(() => {
      delete db[newWeekKey];
      for (const [key] of contentEntries) delete db[key];
      // Same "only if the user hasn't since moved on" guard as handleWeekAdd/handleWeekDelete.
      if (activeWeekId === newWeekId) activeWeekId = previousActiveWeekId;
      if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
      renderPanelForCurrentSelection();
      showToast(document.getElementById('admin-toast'), '⚠️ Duplication en ligne échouée — la semaine dupliquée a été retirée');
    });
  }
  ```

- [ ] **Step 3: Wire the handler into `renderPanelForCurrentSelection`**

  Update the `renderWeekAdmin` call:
  ```js
  renderWeekAdmin(document.getElementById('week-admin'), {
    activeWeek: activeWeekId ? getWeeks(db).find(w => w.id === activeWeekId) || null : null,
    isEditing,
    onLabelEdit: handleWeekLabelEdit,
    onAddWeek: handleWeekAdd,
    onDeleteWeek: handleWeekDelete,
    onDuplicateWeek: handleWeekDuplicate,
  });
  ```

- [ ] **Step 4: Run the full automated test suite**

  Run: `cd webapp && npx vitest run`
  Expected: PASS — all tests pass, 0 failures (265 = 254 existing + 9 selector + 2 weekAdmin).

- [ ] **Step 5: Verify the production build still works**

  Run: `cd webapp && npm run build`
  Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add webapp/src/main.js
  git commit -m "feat: wire week duplication into the app"
  ```

---
### Task 5: Manual verification against live production Firestore

**No files changed in this task — verification only.**

- [ ] Run `cd webapp && npm run dev`, open the printed local URL in a browser.
- [ ] Unlock edit mode with the admin password.
- [ ] Navigate to a week and create an obviously-fake test week via "+ Nouvelle semaine" (e.g. rename it to "TEST — À IGNORER — duplication"). Add one fake item to it in at least two different regions (e.g. one index in Asie, one company in Europe) plus one IA & Fintech item, so the duplication actually has something to copy across regions.
- [ ] Click "📋 Dupliquer cette semaine" on that fake test week.
  - [ ] A new week appears in the timeline labeled "TEST — À IGNORER — duplication (copie)".
  - [ ] The app switches to the new week immediately.
  - [ ] Switch through all 4 regions on the new week and confirm the fake index (Asie) and fake company (Europe) both appear — this is the check that specifically catches the region-scoping bug the original draft had.
  - [ ] Confirm the fake IA & Fintech item appears identically in every region (region-agnostic, matches phase 14's design).
  - [ ] Hard-reload the page and confirm everything above still holds (proves the Firestore write, not just local optimistic state).
  - [ ] Confirm the portfolio table is unaffected (duplication must not touch `mkg:portfolio:*`).
- [ ] Delete both the original and duplicated fake test weeks via the existing cascading week-delete feature, confirm they're both fully gone after a hard reload.
- [ ] Spot-check that a handful of real, pre-existing weeks/content are untouched throughout.
- [ ] No console errors during any of the above.
- [ ] Confirm `cd webapp && npx vitest run` is still fully green after the manual session (guards against any stray state).

---
### End of Plan

At this point week duplication is fully implemented:
- Administrators can duplicate the currently-active week via the week admin controls
- All week-scoped content (market indices, companies, news briefs, IA & Fintech items) is copied to the new week **across all regions**, not just the one currently being viewed
- Portfolio contents are NOT copied (not week-scoped, matching production behavior)
- The write is atomic (single Firestore batch) — no partially-duplicated week on failure
- The new week becomes the active week immediately after duplication
- Optimistic updates with rollback-on-failure ensure local state stays consistent with Firestore on failure
- Manual verification follows the same safety protocol as every prior Firestore-writing phase
- All automated tests pass; production build still works

Still pending, as separate later plans: portfolio-region management; relabeling company stat labels; the "annuler tout" undo/session-snapshot system; color pickers; per-region portfolio-only PDF export; dynamic `import()` of `html2pdf.js`; the "Présentations" sub-feature for IA & Fintech; closing the patch-shape test-coverage gap in `companyList.test.js`/`sidePanel.test.js`; a final visual-theme + mobile-fallback pass; and the eventual production cutover.
