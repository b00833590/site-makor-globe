# Suppression de semaine, en cascade (mode édition) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out week management (started in `docs/superpowers/plans/2026-07-20-admin-edit-weeks.md`, which deliberately deferred this) by letting an admin delete the currently-active week and everything under it: its market indices, news briefs, and companies — a genuine multi-document cascade against a week that may hold dozens of documents. Portfolio entries are never touched (they are not week-scoped — confirmed by `webapp/src/data/portfolioSelectors.js`, which filters only on the `mkg:portfolio:` prefix with no week component). Week duplication remains out of scope (still deferred, not part of this plan either).

**Why this is safe to build now, and how it differs from every prior admin-edit handler:**
- **Atomicity via `writeBatch`, not sequential deletes.** Every earlier Firestore write in this feature (`writeDoc`/`deleteDocByKey`) touches exactly one document. A cascading week delete could touch 20-30 documents (indices/news/companies × 4 regions). Deleting them one-by-one with individual requests would leave a real, ugly failure mode: if request #14 of 27 fails, the week is left half-deleted, with no clean way to know which half. Firestore's client SDK provides `writeBatch()` specifically for this: up to 500 operations (comfortably more than a week's content will ever reach) committed as a single atomic unit — either all deletes succeed, or none do. This plan adds `deleteDocsBatch(keys)` to `webapp/src/data/firestoreClient.js` built on `writeBatch`, and the whole cascade goes through it. This makes the failure semantics **simpler** than a naive per-document loop would be, not harder — the rollback is "restore everything" or "nothing changed," never "restore some unknown subset."
- **A confirmation gate, unlike every prior delete in this feature.** Deleting one index, one company, one news brief, or one portfolio row is a small, easily-redone mistake if a user misclicks. Deleting an entire week's curated content is not — it's exactly the kind of hard-to-reverse action this project's own operating principles call for extra friction on. This plan uses a native `window.confirm()` before any mutation happens, naming the week and the document count. This is a deliberate, first-time exception to the "act immediately, rely on rollback" pattern every other handler in this feature uses — confirmed appropriate given the blast radius, not a stylistic drift.

**Architecture:**
- `webapp/src/data/firestoreClient.js` gains `deleteDocsBatch(keys)`, built on `writeBatch`/`doc(...).delete()` from `firebase/firestore`, wrapped in the existing `writeWithRetry` helper (same retry-then-give-up semantics as every other write). No new unit test for this function specifically — it's a thin Firestore SDK wrapper, matching the established, already-reviewed precedent that `writeDoc`/`deleteDocByKey` (which this mirrors) have no direct unit tests either; only the underlying `writeWithRetry` primitive is tested, and it already is.
- `webapp/src/data/selectors.js` gains `getWeekContentKeys(db, weekId)` — a pure function computing every key that belongs to a given week (market/news/entreprises prefixes, plus the week document itself). This is the part of the cascade logic that's actually worth unit-testing in isolation, and it is.
- `webapp/src/timeline/weekAdmin.js`'s `renderWeekAdmin` gains a delete-week button (only rendered when there's an active week) that calls a new `onDeleteWeek(activeWeek)` callback unconditionally on click — the rendering layer stays a pure, dumb view exactly like every other section's, with **no confirmation logic inside it**. The confirmation lives in the handler, in `main.js`, matching where all business logic already lives in this codebase.
- `main.js`'s `handleWeekDelete` asks for confirmation first; only if confirmed does it compute the affected keys via `getWeekContentKeys`, optimistically remove them all from local `db`, pick a new `activeWeekId` if the deleted week was the active one (falling back to the new last week, or `null` if none remain), update the timeline and re-render, then fire `deleteDocsBatch`. On failure, it restores every removed document (captured before deletion) and the previous `activeWeekId`, re-renders, and toasts.

**Tech Stack:** Same as prior plans — vanilla JS + Vite, Vitest with jsdom for DOM components.

## Global Constraints

- **This plan writes to the same live production Firestore database** the interns use every week — no staging environment, and this is the single most destructive action in the whole admin/edit feature so far. Manual verification (Task 4) should preferably target the leftover test week from the weeks-management plan (`TEST — SEMAINE À IGNORER`, already empty of content, safe to delete for real) rather than creating a fresh throwaway week first — but creating a fresh one first is also fine if that leftover week is no longer present. **Never delete a real, content-bearing week during verification.**
- Known, accepted limitation carried over from the weeks-management plan (not fixed here): if the deleted week was the only remaining week, `activeWeekId` becomes `null` and `renderPanelForCurrentSelection`'s existing early-return guard (`if (!activeWeekId) return;`, unrelated to this plan) means the week-admin panel won't refresh to show the "no weeks" state. Given production always has multiple real weeks and this plan is only ever exercised on the one leftover test/empty week, this is very unlikely to be hit — noted, not hardened.
- Firestore batch writes are capped at 500 operations. A week's content will never approach that (a handful of indices/news/companies per region × 4 regions is nowhere close), so this plan does not add batching-of-batches — if a future week's content ever legitimately approached that scale, that would be a signal to revisit, not something to defensively code around now (YAGNI).
- Do not modify `webapp/src/globe/*`, `webapp/src/panel/*`, `webapp/src/data/regionMatch.js`/`portfolioSelectors.js`/`quoteClient.js`/`portfolioLiveQuotes.js`, `webapp/src/admin/passwordModal.js`/`toast.js`/`uid.js`/`config.js`/`editableInput.js`, `webapp/src/timeline/weekTimeline.js` (already updatable via `setWeeks`, not touched further here), or the repository root `index.html`/`css`/`js`. Week duplication is explicitly out of scope, do not add it.

---

### Task 1: Batch-delete client

**Files:**
- Modify: `webapp/src/data/firestoreClient.js`

**Interfaces:**
- Produces: `deleteDocsBatch(keys: string[]): Promise<void>`, added to `createFirestoreClient()`'s returned object. Used by Task 4's `main.js`.

- [ ] **Step 1: Write the implementation**

Modify `webapp/src/data/firestoreClient.js` — extend the `firebase/firestore` import and add the method inside `createFirestoreClient` (keep `loadAllOnce`, `writeDoc`, `deleteDocByKey`, and `writeWithRetry` exactly as they are):
```js
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
```
```js
  async function deleteDocsBatch(keys) {
    if (keys.length === 0) return;
    await writeWithRetry(async () => {
      const batch = writeBatch(db);
      for (const key of keys) {
        batch.delete(doc(db, MAIN_COLLECTION, key));
      }
      await batch.commit();
    });
  }
```
Add `deleteDocsBatch` to the object `createFirestoreClient` returns:
```js
  return { loadAllOnce, writeDoc, deleteDocByKey, deleteDocsBatch };
```

- [ ] **Step 2: Run the existing tests to verify nothing broke**

Run: `cd webapp && npx vitest run src/data/firestoreClient.test.js`
Expected: PASS — all existing tests still pass unchanged (this is a pure addition; no direct test is added for `deleteDocsBatch` itself, matching the established precedent that `writeDoc`/`deleteDocByKey` — which this mirrors — have no direct unit tests either, only the shared `writeWithRetry` primitive they all use, which is already tested).

- [ ] **Step 3: Commit**

```bash
git add webapp/src/data/firestoreClient.js
git commit -m "feat: add atomic batch-delete to the Firestore client"
```

---

### Task 2: Compute a week's content keys

**Files:**
- Modify: `webapp/src/data/selectors.js`
- Modify: `webapp/src/data/selectors.test.js`

**Interfaces:**
- Produces: `getWeekContentKeys(db, weekId): string[]`. Used by Task 4's `main.js`.

- [ ] **Step 1: Write the failing tests**

Add to `webapp/src/data/selectors.test.js`:
```js
describe('getWeekContentKeys', () => {
  const DB = {
    'mkg:week:w1': { id: 'w1', label: 'Semaine 1', order: 0 },
    'mkg:market:w1:m1': { id: 'm1' },
    'mkg:market:w1:m2': { id: 'm2' },
    'mkg:content:news:w1:n1': { id: 'n1' },
    'mkg:content:entreprises:w1:c1': { id: 'c1' },
    'mkg:market:w2:m3': { id: 'm3' },
    'mkg:portfolio:p1': { id: 'p1' },
  };

  it('returns every market/news/entreprises key for the given week, plus the week document itself', () => {
    const keys = getWeekContentKeys(DB, 'w1');
    expect(keys.sort()).toEqual([
      'mkg:content:entreprises:w1:c1',
      'mkg:content:news:w1:n1',
      'mkg:market:w1:m1',
      'mkg:market:w1:m2',
      'mkg:week:w1',
    ].sort());
  });

  it("does not include another week's content", () => {
    const keys = getWeekContentKeys(DB, 'w1');
    expect(keys).not.toContain('mkg:market:w2:m3');
  });

  it('never includes portfolio entries, which are not week-scoped', () => {
    const keys = getWeekContentKeys(DB, 'w1');
    expect(keys).not.toContain('mkg:portfolio:p1');
  });

  it('returns just the week document key when the week has no other content', () => {
    const keys = getWeekContentKeys({ 'mkg:week:w9': { id: 'w9', label: 'Vide', order: 9 } }, 'w9');
    expect(keys).toEqual(['mkg:week:w9']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/data/selectors.test.js`
Expected: FAIL — `getWeekContentKeys is not a function` (or undefined); the pre-existing 14 tests still pass.

- [ ] **Step 3: Write the implementation**

Add to `webapp/src/data/selectors.js` (keep every existing export exactly as it is):
```js
export function getWeekContentKeys(db, weekId) {
  const prefixes = [
    `mkg:market:${weekId}:`,
    `mkg:content:news:${weekId}:`,
    `mkg:content:entreprises:${weekId}:`,
  ];
  const keys = Object.keys(db).filter(key => prefixes.some(prefix => key.startsWith(prefix)));
  keys.push(`mkg:week:${weekId}`);
  return keys;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/data/selectors.test.js`
Expected: PASS — 18 tests total (14 original + 4 new).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/data/selectors.js webapp/src/data/selectors.test.js
git commit -m "feat: compute every Firestore key belonging to a week"
```

---

### Task 3: Delete-week button — rendering

**Files:**
- Modify: `webapp/src/timeline/weekAdmin.js`
- Modify: `webapp/src/timeline/weekAdmin.test.js`
- Modify: `webapp/src/timeline/weekAdmin.css`

**Interfaces:**
- Changes: `renderWeekAdmin(container, { activeWeek, isEditing, onLabelEdit, onAddWeek, onDeleteWeek })` — `onDeleteWeek` is new, called with the active week object on click, unconditionally (no confirmation inside this function — that's Task 4's job in `main.js`).

- [ ] **Step 1: Add the failing tests**

Add to `webapp/src/timeline/weekAdmin.test.js` (keep the existing 5 tests, add `onDeleteWeek: () => {}` to their `renderWeekAdmin(...)` calls where an options object is passed — it's optional/unused by those tests so this is just keeping the call sites tidy, not required for them to keep passing):
```js
  it('renders a delete-week button in edit mode that calls onDeleteWeek with the active week', () => {
    const onDeleteWeek = vi.fn();
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: WEEK, isEditing: true, onLabelEdit: () => {}, onAddWeek: () => {}, onDeleteWeek });
    container.querySelector('.week-admin-delete').click();
    expect(onDeleteWeek).toHaveBeenCalledWith(WEEK);
  });

  it('does not render a delete-week button when there is no active week', () => {
    const container = document.createElement('div');
    renderWeekAdmin(container, { activeWeek: null, isEditing: true, onLabelEdit: () => {}, onAddWeek: () => {}, onDeleteWeek: () => {} });
    expect(container.querySelector('.week-admin-delete')).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/timeline/weekAdmin.test.js`
Expected: FAIL — the 2 new tests fail (no delete button rendered yet); the pre-existing 5 tests still pass.

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/timeline/weekAdmin.js`:
```js
import { buildEditableInput } from '../admin/editableInput.js';

export function renderWeekAdmin(container, { activeWeek, isEditing, onLabelEdit, onAddWeek, onDeleteWeek }) {
  container.replaceChildren();
  if (!isEditing) return;

  if (activeWeek) {
    const labelInput = buildEditableInput(activeWeek.label, 'text', 'week-admin-label-input', v => onLabelEdit(activeWeek, { label: v }));
    container.appendChild(labelInput);

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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/timeline/weekAdmin.test.js`
Expected: PASS — 7 tests total (5 original + 2 new).

- [ ] **Step 5: Add the style**

Add to `webapp/src/timeline/weekAdmin.css` (append):
```css
.week-admin-delete {
  width: 180px;
  box-sizing: border-box;
  background: transparent;
  border: 1px solid rgba(224, 118, 106, 0.4);
  border-radius: 4px;
  color: #e0736a;
  cursor: pointer;
  font-size: 11px;
  padding: 6px 8px;
}
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/timeline/weekAdmin.js webapp/src/timeline/weekAdmin.test.js webapp/src/timeline/weekAdmin.css
git commit -m "feat: add a delete-week button to the week admin controls"
```

---

### Task 4: Wire cascading week deletion into the app and verify end-to-end

**Files:**
- Modify: `webapp/src/main.js`

**Interfaces:**
- Consumes: `deleteDocsBatch` (Task 1), `getWeekContentKeys` (Task 2), the delete-aware `renderWeekAdmin` (Task 3).
- Produces: the running application. Final deliverable of this plan.

- [ ] **Step 1: Add `handleWeekDelete` to `main.js`**

Extend the existing `selectors.js` import line to include `getWeekContentKeys`:
```js
import { getWeeks, getMarketItemsForWeekAndRegion, getNewsItemsForWeekAndRegion, getCompanyItemsForWeekAndRegion, getWeekContentKeys } from './data/selectors.js';
```

Add the handler near `handleWeekLabelEdit`/`handleWeekAdd`:
```js
function handleWeekDelete(week) {
  const keys = getWeekContentKeys(db, week.id);
  const contentCount = keys.length - 1; // excludes the week document itself
  const confirmed = window.confirm(
    `Supprimer définitivement "${week.label}" et ${contentCount} élément(s) de contenu associé (indices, news, entreprises) ? Cette action ne peut pas être annulée facilement.`
  );
  if (!confirmed) return;

  const previousEntries = keys.map(key => [key, db[key]]);
  for (const key of keys) delete db[key];

  const wasActive = activeWeekId === week.id;
  if (wasActive) {
    const remainingWeeks = getWeeks(db);
    activeWeekId = remainingWeeks.length ? remainingWeeks[remainingWeeks.length - 1].id : null;
  }
  if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
  renderPanelForCurrentSelection();

  client.deleteDocsBatch(keys).catch(() => {
    for (const [key, value] of previousEntries) db[key] = value;
    if (wasActive) activeWeekId = week.id;
    if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Suppression en ligne échouée — la semaine a été restaurée');
  });
}
```

Update the `renderWeekAdmin(...)` call inside `renderPanelForCurrentSelection` to pass the new callback (add `onDeleteWeek: handleWeekDelete,` alongside the existing `onLabelEdit`/`onAddWeek` lines — everything else in that call and the surrounding function stays exactly as it is):
```js
  renderWeekAdmin(document.getElementById('week-admin'), {
    activeWeek: getWeeks(db).find(w => w.id === activeWeekId) || null,
    isEditing,
    onLabelEdit: handleWeekLabelEdit,
    onAddWeek: handleWeekAdd,
    onDeleteWeek: handleWeekDelete,
  });
```

- [ ] **Step 2: Run the full automated test suite**

Run: `cd webapp && npm test`
Expected: PASS — all tests pass, 0 failures. (No new tests in this task — `main.js` has no unit tests, matching every earlier plan's precedent; `handleWeekDelete`'s logic is covered indirectly by `getWeekContentKeys`'s unit tests plus manual verification below.)

- [ ] **Step 3: Manual browser verification — READ THE SAFETY NOTE FIRST**

**Safety note:** this is the most destructive action shipped in the admin/edit feature so far — it deletes real Firestore documents in bulk, atomically, with no staging environment. Only ever delete the leftover test week from the previous plan (or a fresh throwaway week you create first) — **never delete a real, content-bearing week.**

Run: `cd webapp && npm run dev`, then open the printed local URL in a browser.

Checklist:
- [ ] Unlock edit mode. Navigate to the leftover test week (`TEST — SEMAINE À IGNORER`, or create a fresh one and give it an unmistakable test label if that one is gone). The week-admin panel now shows a "✕ Supprimer cette semaine" button below the label input.
- [ ] Click it. A native browser confirmation dialog appears, naming the week and a content count. Click **Cancel**. Confirm nothing happened — the week and its dot are still there.
- [ ] Click delete again, this time **confirm**. The week's dot disappears from the timeline immediately, and the app switches to the previous week's content.
- [ ] Reload the page fully (hard refresh). Confirm the deleted week's dot is gone for good — proves the batch delete reached Firestore.
- [ ] Click through several real, content-bearing weeks and confirm every one of them (indices, news, companies) is completely unaffected — this is the critical check, since a bug in `getWeekContentKeys`'s prefix matching could otherwise delete another week's content by mistake.
- [ ] Confirm the portfolio table (not week-scoped) still shows all its real entries, untouched — deleting a week must never touch `mkg:portfolio:` documents.
- [ ] No console errors during any of the above.

- [ ] **Step 4: Verify the production build still works**

Run: `cd webapp && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/main.js
git commit -m "feat: wire cascading week deletion with a confirmation gate"
```

---

## End of Plan

At this point week management is complete: create, rename, and delete (atomically, with confirmation). Still pending, as separate later plans: week duplication; portfolio-region management; relabeling company stat labels; the "annuler tout" undo/session-snapshot system; color pickers; PDF export; the IA & Fintech panel; a final visual-theme + mobile-fallback pass; and the eventual production cutover.
