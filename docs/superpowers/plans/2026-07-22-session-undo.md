# « Tout annuler » — restauration de la session d'édition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port production's "↺ Tout annuler" feature to `webapp/`: a button, visible only in edit mode, that restores every document changed since edit mode was unlocked back to its state at unlock time.

**This is the second half of a two-part sequence the user explicitly chose.** Part one (`docs/superpowers/plans/2026-07-22-write-path-refactor.md`, merged) centralized all 15 simple content handlers through `setItemLocal`/`deleteItemLocal`. This plan builds the undo layer that refactor existed to enable.

**Scope discovery — only "tout annuler", no single-step undo:** production defines a `undoLast()` function (`index.html:819-832`) that pops one entry off an `undoStack`, but **it is never wired to any button or event handler anywhere in the file** — confirmed by grepping every occurrence of `undoLast` in `index.html` (exactly one hit: the definition itself). It is dead code. The only undo actually reachable by a production user is `undoAllSession` via `#undoAllBtn` (`index.html:517`, wired at `index.html:2890`). This plan therefore ports **only session-wide restore**, and deliberately does **not** build an `undoStack`/single-step undo — matching production's real capability, not its dead code. (Same discovery pattern as phase 22, where production's "upload a presentation" turned out not to exist either.)

**How production does it (`index.html:834-859`), and where this plan deliberately improves on it:**
- Production snapshots the whole `DB` on entering edit mode (`sessionSnapshot = JSON.parse(JSON.stringify(DB))`, `index.html:2513`), diffs it against the current `DB` on click, and issues **one `rawSet`/`rawDelete` call per changed key** — N independent, non-atomic writes. If write #3 of 5 fails, the admin is left in a half-restored state with no clean way back.
- `webapp/` already has `writeDocsBatch` (phase 15) and `deleteDocsBatch` (phase 12), both thin wrappers over Firestore's `writeBatch`, and a `writeBatch` can hold **both** sets and deletes. This plan adds one combined `applyBatch({ writes, deletes })` so the entire restore is a single all-or-nothing Firestore commit — genuinely better than production, at near-zero extra cost, and reusing an already-proven primitive.
- Production also never repairs `activeWeek` after a restore: if the admin created a week during the session, "tout annuler" deletes that week's document while production's `state.activeWeek` still points at it. In `webapp/` this would leave `activeWeekId` dangling — no crash (verified: `renderWeekAdmin` handles `activeWeek: null` safely since phase 12, and the week-scoped selectors return `[]` for an unknown id), but a confusing blank panel. This plan repairs it explicitly, reusing the same fallback logic `handleWeekDelete` already uses.

**Architecture:**
- New `webapp/src/admin/sessionUndo.js`: one exported **pure** function, `computeSessionRestore(snapshot, current)` → `{ writes: [[key, value], ...], deletes: [key, ...] }`. This is where all the real logic lives (which keys changed, in which direction), so it is fully unit-testable — the same DI-for-testability split this codebase already uses for `presentationPdf.js` (phase 22) and `pdfExport.js` (phase 13).
- `webapp/src/data/firestoreClient.js`: add `applyBatch({ writes, deletes })`, mirroring the existing `writeDocsBatch`/`deleteDocsBatch` structurally (same `writeWithRetry` + `writeBatch` + per-key `collectionForKey` routing added in phase 22).
- `webapp/index.html`: a new `#undo-all-btn` button, hidden by default, shown only in edit mode — mirroring how production's own button is `display:none` until `state.isEditing`.
- `webapp/src/main.js`: a `sessionSnapshot` module variable set on unlock and cleared on exit, plus `handleUndoAll()` orchestration (confirm gate → compute → optimistic local restore → atomic batch commit → rollback-on-failure → repair `activeWeekId` → re-render).

## Global Constraints

- **This plan writes to the same live production Firestore database** the interns use every week — no staging environment. It is also, by a wide margin, **the most destructive feature built in this project so far**: a single click discards *every* change made during the current edit session, across every content type at once. Manual verification (Task 5) must only ever create-then-undo obviously-fake test data, and must explicitly confirm that documents the admin did *not* touch during the session are left completely alone.
- **Confirm gate is mandatory** (`window.confirm`), matching production (`index.html:840`) and this project's established precedent that only genuinely destructive, hard-to-recover actions get one (week deletion, phase 12; presentation deletion, phase 22). Note for whoever runs Task 5: a native `window.confirm` **freezes Chrome CDP automation** — the person verifying should expect to click the dialog themselves rather than driving it through automation (established the hard way in phase 15).
- **Known limitation, deliberately not solved: Firestore caps a single `writeBatch` at 500 operations.** A session touching more than 500 documents would fail the commit (and correctly roll back, showing the failure toast — it does not half-apply). This is not worth chunking around: a realistic session touches a handful of documents, and production's per-key loop has no such guard *and* no atomicity either. Record it, don't build for it.
- Do not modify `setItemLocal`/`deleteItemLocal`, any `handle*` content handler, `writeDocsBatch`, `deleteDocsBatch`, or any file under `webapp/src/panel/`, `webapp/src/globe/`, `webapp/src/timeline/`, `webapp/src/data/selectors.js`. The undo layer sits *above* the write path; it does not change it. In particular, `handleUndoAll` must **not** route through `setItemLocal`/`deleteItemLocal` — it writes the batch directly, so restoring never itself looks like a new edit.
- This plan touches only: new `webapp/src/admin/sessionUndo.js`/`.test.js`, `webapp/src/data/firestoreClient.js`/`.test.js`, `webapp/index.html`, `webapp/src/styles/globe.css`, `webapp/src/main.js`.

---
### Task 1: The pure restore-diff function

**Files:**
- Create: `webapp/src/admin/sessionUndo.js`
- Create: `webapp/src/admin/sessionUndo.test.js`

**Interfaces:**
- Adds: `computeSessionRestore(snapshot: object, current: object): { writes: Array<[string, object]>, deletes: string[] }`

- [ ] **Step 1: Write the failing tests**

  Create `webapp/src/admin/sessionUndo.test.js`:
  ```js
  import { describe, it, expect } from 'vitest';
  import { computeSessionRestore } from './sessionUndo.js';

  describe('computeSessionRestore', () => {
    it('returns nothing to do when nothing changed', () => {
      const db = { 'mkg:week:w1': { id: 'w1', label: 'Semaine 1', order: 0 } };
      expect(computeSessionRestore(db, { ...db })).toEqual({ writes: [], deletes: [] });
    });

    it('restores an edited document to its snapshot value', () => {
      const snapshot = { 'mkg:market:w1:i1': { id: 'i1', name: 'CAC 40', value: '7 500' } };
      const current = { 'mkg:market:w1:i1': { id: 'i1', name: 'CAC 40', value: '9 999' } };
      expect(computeSessionRestore(snapshot, current)).toEqual({
        writes: [['mkg:market:w1:i1', { id: 'i1', name: 'CAC 40', value: '7 500' }]],
        deletes: [],
      });
    });

    it('deletes a document that did not exist at snapshot time (an add to undo)', () => {
      const snapshot = {};
      const current = { 'mkg:market:w1:new': { id: 'new', name: 'Nouvel indice' } };
      expect(computeSessionRestore(snapshot, current)).toEqual({
        writes: [],
        deletes: ['mkg:market:w1:new'],
      });
    });

    it('re-writes a document that was deleted during the session (a delete to undo)', () => {
      const snapshot = { 'mkg:market:w1:i1': { id: 'i1', name: 'CAC 40' } };
      const current = {};
      expect(computeSessionRestore(snapshot, current)).toEqual({
        writes: [['mkg:market:w1:i1', { id: 'i1', name: 'CAC 40' }]],
        deletes: [],
      });
    });

    it('handles edits, adds, and deletes together in one session', () => {
      const snapshot = {
        'mkg:market:w1:edited': { id: 'edited', value: 'avant' },
        'mkg:market:w1:removed': { id: 'removed', value: 'existait' },
        'mkg:market:w1:untouched': { id: 'untouched', value: 'stable' },
      };
      const current = {
        'mkg:market:w1:edited': { id: 'edited', value: 'après' },
        'mkg:market:w1:untouched': { id: 'untouched', value: 'stable' },
        'mkg:market:w1:added': { id: 'added', value: 'nouveau' },
      };
      const result = computeSessionRestore(snapshot, current);
      expect(result.writes.sort()).toEqual([
        ['mkg:market:w1:edited', { id: 'edited', value: 'avant' }],
        ['mkg:market:w1:removed', { id: 'removed', value: 'existait' }],
      ].sort());
      expect(result.deletes).toEqual(['mkg:market:w1:added']);
    });

    it('never includes an untouched document in either list', () => {
      const snapshot = { a: { v: 1 }, b: { v: 2 } };
      const current = { a: { v: 1 }, b: { v: 99 } };
      const result = computeSessionRestore(snapshot, current);
      expect(result.writes).toEqual([['b', { v: 2 }]]);
      expect(result.deletes).toEqual([]);
    });

    it('detects a nested change (not just a top-level field)', () => {
      const snapshot = { c: { id: 'c', bullets: ['un', 'deux'] } };
      const current = { c: { id: 'c', bullets: ['un', 'deux', 'trois'] } };
      expect(computeSessionRestore(snapshot, current).writes).toEqual([
        ['c', { id: 'c', bullets: ['un', 'deux'] }],
      ]);
    });

    it('returns snapshot values by reference-independent copy semantics (mutating the result does not corrupt the snapshot)', () => {
      const snapshot = { a: { id: 'a', value: 'original' } };
      const current = { a: { id: 'a', value: 'modifié' } };
      const result = computeSessionRestore(snapshot, current);
      result.writes[0][1].value = 'muté';
      expect(snapshot.a.value).toBe('original');
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd webapp && npx vitest run src/admin/sessionUndo.test.js`
  Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

  Create `webapp/src/admin/sessionUndo.js`:
  ```js
  // Computes what it would take to put `current` back into the exact shape of
  // `snapshot` — i.e. to undo every change made since the snapshot was taken.
  //
  // Change detection is JSON.stringify-based, matching production
  // (index.html:845). That is technically key-order sensitive, so two objects
  // holding identical data in a different insertion order would be reported as
  // "changed". In practice every value here is produced by the same handful of
  // code paths (a spread of a previous value plus a patch), so ordering is
  // stable — and the only cost of a false positive is one redundant write of
  // an identical value, never data loss.
  export function computeSessionRestore(snapshot, current) {
    const writes = [];
    const deletes = [];
    const allKeys = new Set([...Object.keys(snapshot), ...Object.keys(current)]);

    for (const key of allKeys) {
      const before = snapshot[key];
      const now = current[key];
      if (JSON.stringify(before) === JSON.stringify(now)) continue;
      if (before === undefined) deletes.push(key);
      // Deep-copied so a caller mutating the returned value can never write
      // back through into the still-live session snapshot.
      else writes.push([key, JSON.parse(JSON.stringify(before))]);
    }

    return { writes, deletes };
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd webapp && npx vitest run src/admin/sessionUndo.test.js`
  Expected: PASS — all 8 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add webapp/src/admin/sessionUndo.js webapp/src/admin/sessionUndo.test.js
  git commit -m "feat: add pure session-restore diff computation"
  ```

---
### Task 2: Atomic combined write+delete batch

**Files:**
- Modify: `webapp/src/data/firestoreClient.js`
- Modify: `webapp/src/data/firestoreClient.test.js`

**Interfaces:**
- Adds to the object returned by `createFirestoreClient()`: `applyBatch({ writes: Array<[string, object]>, deletes: string[] }): Promise<void>`

- [ ] **Step 1: Write the implementation**

  In `webapp/src/data/firestoreClient.js`, add alongside the existing `writeDocsBatch`/`deleteDocsBatch` (same enclosing `createFirestoreClient` scope, same imports — nothing new needed):
  ```js
  // Single all-or-nothing commit combining sets and deletes. Used by the
  // session-undo restore, where a partially-applied restore would leave the
  // admin in a state that is neither "before" nor "after" — worse than
  // failing outright. Routes each key to its own collection, so a restore
  // spanning mkg_data and mkg_pdfchunks stays atomic across both.
  //
  // Firestore caps a batch at 500 operations; a session touching more than
  // 500 documents will reject rather than half-apply. Deliberately not
  // chunked — see the plan's Global Constraints.
  async function applyBatch({ writes, deletes }) {
    if (writes.length === 0 && deletes.length === 0) return;
    await writeWithRetry(async () => {
      const batch = writeBatch(db);
      for (const [key, value] of writes) {
        batch.set(doc(db, collectionForKey(key), key), {
          value: JSON.stringify(value),
          updatedAt: serverTimestamp(),
        });
      }
      for (const key of deletes) {
        batch.delete(doc(db, collectionForKey(key), key));
      }
      await batch.commit();
    });
  }
  ```
  Add `applyBatch` to the returned object:
  ```js
  return { loadAllOnce, writeDoc, deleteDocByKey, deleteDocsBatch, writeDocsBatch, fetchKeysWithPrefix, fetchRawValue, applyBatch };
  ```

  **No new unit test for `applyBatch` itself** — it wraps the real Firestore SDK exactly like its four sibling batch/doc methods, none of which have direct tests either (established precedent since phase 12). The pure logic that decides *what* goes into the batch is `computeSessionRestore`, fully tested in Task 1; the SDK wiring is covered by Task 5's manual verification.

- [ ] **Step 2: Confirm the existing suite still passes**

  Run: `cd webapp && npx vitest run src/data/firestoreClient.test.js`
  Expected: PASS — unchanged count (this change is purely additive).

- [ ] **Step 3: Commit**

  ```bash
  git add webapp/src/data/firestoreClient.js
  git commit -m "feat: add atomic combined write+delete batch to the Firestore client"
  ```

---
### Task 3: The button

**Files:**
- Modify: `webapp/index.html`
- Modify: `webapp/src/styles/globe.css`

**No tests in this task** — static markup/CSS, consistent with how every prior plan handled `index.html` additions (phases 11, 13, 16, 22).

- [ ] **Step 1: Add the button to `webapp/index.html`**

  Immediately after the existing `#edit-toggle-btn` line:
  ```html
  <button id="edit-toggle-btn" class="edit-toggle-btn" type="button">✏️ Éditer</button>
  <button id="undo-all-btn" class="undo-all-btn" type="button" title="Annuler toutes les modifications de cette session d'édition">↺ Tout annuler</button>
  ```

- [ ] **Step 2: Add the styling to `webapp/src/styles/globe.css`**

  Add after the existing `.edit-toggle-btn` rules (read the file first to place it alongside them, and to copy the shared visual language — fixed positioning, navy background, gold border — rather than inventing a new one):
  ```css
  /* Hidden by default; main.js reveals it only while edit mode is unlocked,
     mirroring production's own display:none-until-editing button. */
  .undo-all-btn {
    display: none;
    position: fixed;
    top: 16px;
    right: 320px;
    z-index: 15;
    background: rgba(15, 23, 48, 0.9);
    border: 1px solid rgba(224, 118, 106, 0.5);
    border-radius: 6px;
    color: #e0736a;
    cursor: pointer;
    font-size: 12px;
    padding: 8px 14px;
  }

  .undo-all-btn.visible {
    display: block;
  }

  .undo-all-btn:hover {
    background: rgba(224, 118, 106, 0.15);
  }
  ```
  (Red/coral rather than gold: this is a destructive action, matching `.week-admin-delete` and `.panel-index-delete`, not a constructive one. The `right: 320px` offset keeps it clear of the existing "📄 Exporter en PDF" button at `right: 160px` and the edit toggle — **verify this visually in Task 5 and adjust if they overlap**, since exact button widths depend on rendered text.)

- [ ] **Step 3: Commit**

  ```bash
  git add webapp/index.html webapp/src/styles/globe.css
  git commit -m "feat: add the 'Tout annuler' button markup and styling"
  ```

---
### Task 4: Wire the session snapshot and restore

**Files:**
- Modify: `webapp/src/main.js`

**Interfaces:**
- Adds (module-private, not exported — matches every other handler in this file): `handleUndoAll()`
- Adds a `sessionSnapshot` module-level variable alongside the existing `db`/`isEditing`/`activeWeekId`

**No new unit test** — `main.js` handlers are never unit-tested in this codebase (established convention, every prior phase). All the decision logic lives in the already-tested `computeSessionRestore`; what remains here is DOM/Firestore orchestration, covered by Task 5.

- [ ] **Step 1: Add the imports and state**

  Add to the existing import block:
  ```js
  import { computeSessionRestore } from './admin/sessionUndo.js';
  ```
  Add alongside the existing module state (`let db = {};` … `let weekTimelineHandle = null;`):
  ```js
  // Deep copy of db taken when edit mode is unlocked, so "Tout annuler" can
  // restore the session's starting point. null whenever edit mode is off.
  let sessionSnapshot = null;
  ```
  And grab the button next to the existing `editToggleBtn` lookup:
  ```js
  const undoAllBtn = document.getElementById('undo-all-btn');
  ```

- [ ] **Step 2: Take and clear the snapshot on edit-mode transitions**

  In `passwordModal`'s `onUnlock` callback, add the snapshot + button reveal (keep every existing line):
  ```js
  onUnlock: () => {
    isEditing = true;
    sessionSnapshot = JSON.parse(JSON.stringify(db));
    editToggleBtn.textContent = '🔒 Terminer';
    editToggleBtn.classList.add('active');
    undoAllBtn.classList.add('visible');
    renderPanelForCurrentSelection();
  },
  ```
  In the `editToggleBtn` click handler's "currently editing → stop" branch:
  ```js
  editToggleBtn.addEventListener('click', () => {
    if (isEditing) {
      isEditing = false;
      sessionSnapshot = null;
      editToggleBtn.textContent = '✏️ Éditer';
      editToggleBtn.classList.remove('active');
      undoAllBtn.classList.remove('visible');
      renderPanelForCurrentSelection();
    } else {
      passwordModal.open();
    }
  });
  ```

- [ ] **Step 3: Add `handleUndoAll` and wire the button**

  Add near the other handlers (placement: after `handlePresentationAddClick`, before the `initSidePanel` call):
  ```js
  function handleUndoAll() {
    if (!sessionSnapshot) return;

    const { writes, deletes } = computeSessionRestore(sessionSnapshot, db);
    if (writes.length === 0 && deletes.length === 0) {
      showToast(document.getElementById('admin-toast'), 'Rien à annuler');
      return;
    }

    const total = writes.length + deletes.length;
    if (!window.confirm(`Annuler toutes les modifications faites depuis le début de cette session d'édition ? ${total} élément(s) seront restaurés à leur état initial.`)) return;

    // Capture only the keys this undo actually touches, so a failed commit
    // restores exactly those and nothing else. Deliberately NOT a full copy of
    // db: the batch commit is async (and retries for up to ~1.8s), so an admin
    // can legitimately edit another section while it is in flight — wholesale
    // restoring db would silently wipe that concurrent, unrelated work.
    // Capturing references is safe here because no handler in this file ever
    // mutates a db value in place; they all build a new object and reassign.
    const touchedKeys = [...writes.map(([key]) => key), ...deletes];
    const beforeUndo = {};
    for (const key of touchedKeys) beforeUndo[key] = db[key];
    const previousActiveWeekId = activeWeekId;

    for (const [key, value] of writes) db[key] = value;
    for (const key of deletes) delete db[key];

    // A week created during this session is now gone; don't leave the app
    // pointing at a week that no longer exists. Same fallback handleWeekDelete
    // uses: land on the last remaining week, or nothing if there are none.
    const restoredWeeks = getWeeks(db);
    if (!restoredWeeks.some(w => w.id === activeWeekId)) {
      activeWeekId = restoredWeeks.length ? restoredWeeks[restoredWeeks.length - 1].id : null;
    }
    if (weekTimelineHandle) weekTimelineHandle.setWeeks(restoredWeeks, activeWeekId);
    renderPanelForCurrentSelection();

    client.applyBatch({ writes, deletes }).then(() => {
      // sessionSnapshot is deliberately left untouched. db now matches it for
      // every key this restore covered, so a second click already computes an
      // empty diff — and keeping the original snapshot means any edit made
      // concurrently during the commit stays undoable, which re-snapshotting
      // from db would silently forfeit. (Production re-snapshots here; that is
      // equivalent only when nothing changed mid-flight.)
      showToast(document.getElementById('admin-toast'), '↺ Modifications de la session annulées');
    }).catch(() => {
      for (const key of touchedKeys) {
        if (beforeUndo[key] === undefined) delete db[key]; else db[key] = beforeUndo[key];
      }
      activeWeekId = previousActiveWeekId;
      if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
      renderPanelForCurrentSelection();
      showToast(document.getElementById('admin-toast'), '⚠️ Annulation en ligne échouée — vos modifications ont été conservées');
    });
  }

  undoAllBtn.addEventListener('click', handleUndoAll);
  ```

- [ ] **Step 4: Run the full automated test suite**

  Run: `cd webapp && npx vitest run`
  Expected: PASS — baseline (313) + 8 new from Task 1 = 321, 0 failures.

- [ ] **Step 5: Verify the production build still works**

  Run: `cd webapp && npm run build`
  Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add webapp/src/main.js
  git commit -m "feat: wire session snapshot and 'Tout annuler' restore"
  ```

---
### Task 5: Manual verification against live production Firestore

**No files changed in this task — verification only.**

**This is the highest-stakes manual verification in the project so far** — the feature under test discards work by design, and a bug here could discard the *wrong* work. Verify the "untouched data is untouched" property especially carefully.

**Note on driving this:** the confirm dialog freezes Chrome CDP automation. Hand the dialog clicks (and any other quick click/visual check) to the user rather than fighting automation — see [[feedback-delegate-browser-actions]].

- [ ] Run `cd webapp && npm run dev`, open the printed local URL.
- [ ] Before unlocking edit mode: confirm the "↺ Tout annuler" button is **not** visible.
- [ ] Unlock edit mode. Confirm the button appears, and confirm it does **not** visually overlap "📄 Exporter en PDF" or "🔒 Terminer" (adjust the `right:` offset in `globe.css` if it does).
- [ ] Click "↺ Tout annuler" immediately, before changing anything: confirm it shows "Rien à annuler" and does **not** open a confirm dialog.
- [ ] Now make a mix of changes, all on obviously-fake test data:
  - **an edit**: change one existing index's value (note the original value first, to check it comes back)
  - **an add**: add a new index named "TEST — À IGNORER — undo"
  - **a delete**: add a second fake index, then delete it
- [ ] Click "↺ Tout annuler", read the confirm dialog: it should name a plausible element count. **Cancel it first** — confirm cancelling is a true no-op (all three changes still present).
- [ ] Click again and accept. Confirm all three are undone at once: the edited index shows its original value, the added index is gone, and the deleted index is back.
- [ ] Hard-reload: confirm the restored state persisted to Firestore (this is the check that proves the batch actually committed, not just local state).
- [ ] **The critical check:** confirm documents you did *not* touch this session are untouched — spot-check several real indices, a real company (including its bullets), several real portfolio rows, real news, real IA & Fintech items, and the real presentations. None of them should have changed.
- [ ] Click "↺ Tout annuler" once more with no new changes: confirm it says "Rien à annuler" again (db now matches the snapshot, so the diff is empty — proves a second click can't replay or double-apply anything).
- [ ] **Week-repair check:** unlock edit mode, create a new week via "+ Nouvelle semaine" (it becomes active), then "↺ Tout annuler". Confirm the week is removed *and* the app lands on a real existing week with its content rendered — not a blank panel pointing at a deleted week.
- [ ] Exit edit mode: confirm the button disappears. Re-enter edit mode, make one change, exit **without** undoing, re-enter, and click "↺ Tout annuler": it should say "Rien à annuler" (exiting edit mode ends the session — the previous session's changes are committed and no longer undoable, matching production).
- [ ] Delete any leftover fake test data; confirm the deletions persist across a final hard reload.
- [ ] No console errors throughout.
- [ ] Confirm `cd webapp && npx vitest run` is still fully green after the manual session.

---
### End of Plan

At this point "↺ Tout annuler" is live-verified:
- A button, visible only in edit mode, restores every document changed since unlock, in a **single atomic Firestore batch** (an improvement over production's non-atomic per-key loop)
- Guarded by a confirm dialog, a "Rien à annuler" no-op path, and full rollback-of-the-rollback if the commit fails
- Repairs `activeWeekId` when the restore removes the active week (a real gap in production's version)
- All decision logic lives in a pure, fully unit-tested `computeSessionRestore`; only DOM/Firestore orchestration is manual-verified, per this codebase's convention

Deliberately **not** built, matching production's real (not dead-code) capability: single-step undo / an `undoStack`. If it's ever wanted, it deserves its own plan and its own UI decision — production's own `undoLast` was never reachable, so there's no precedent to port.
