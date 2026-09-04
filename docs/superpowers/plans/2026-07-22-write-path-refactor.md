# Refactor : point d'écriture commun (préalable à l'undo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce two shared, low-level write primitives in `main.js` — `setItemLocal(key, value, rollbackMessage)` and `deleteItemLocal(key, rollbackMessage)` — and rewrite every simple single-document content handler (indices, companies + bullets, portfolio, news, IA & Fintech — 15 call sites) to go through them, instead of each handler duplicating the same optimistic-update-with-rollback logic inline. **This is a pure, behavior-preserving refactor — it changes no user-visible behavior at all.** Its entire purpose is to create the single choke point a future "annuler tout" (undo) plan needs to hook into, mirroring how production's root `index.html` already centralizes every write through its own `setItemLocal`/`deleteItemLocal` (`index.html:803-817`) before layering undo on top of *that*.

**Why this is its own plan, not bundled with the undo feature itself:** undoing changes requires the write path to be centralized *first* — you cannot record undo steps at 15 different inline call sites without either duplicating the undo-recording logic 15 times (exactly the kind of duplication this refactor exists to eliminate) or introducing the shared primitive as a side effect of the undo feature itself (mixing a structural refactor with a behavior change in one plan, harder to review, harder to revert independently if either half turns out wrong). Splitting them means this refactor can be verified as a no-op behavior-wise before any new user-facing feature is layered on top.

**Why production's version can't be copied verbatim:** production's `setItemLocal` (`index.html:803-809`) is fire-and-forget — no optimistic rollback on write failure, just `rawSet(key, obj)` with a comment "UI already reflects the change, this just persists it". `webapp/`'s existing handlers already have a **more sophisticated, hard-won rollback-on-failure behavior** than production (built up across many phases, including real bugs found and fixed in the rollback guards — e.g. `handleWeekAdd`'s "only revert `activeWeekId` if it still equals the id this call created" fix). Copying production's simpler primitive would be a **regression**. This plan's `setItemLocal`/`deleteItemLocal` must preserve every handler's existing rollback behavior exactly, just de-duplicated into one place.

**Architecture:**
- Two new module-private functions in `main.js` (not exported, not a new file — every other `handle*` function already lives directly in `main.js`, these are at the same level as those, just lower-level):
  ```js
  function setItemLocal(key, value, rollbackMessage) {
    const previous = db[key];
    db[key] = value;
    renderPanelForCurrentSelection();
    client.writeDoc(key, value).catch(() => {
      if (previous === undefined) delete db[key]; else db[key] = previous;
      renderPanelForCurrentSelection();
      showToast(document.getElementById('admin-toast'), rollbackMessage);
    });
  }

  function deleteItemLocal(key, rollbackMessage) {
    const previous = db[key];
    delete db[key];
    renderPanelForCurrentSelection();
    client.deleteDocByKey(key).catch(() => {
      db[key] = previous;
      renderPanelForCurrentSelection();
      showToast(document.getElementById('admin-toast'), rollbackMessage);
    });
  }
  ```
  `setItemLocal` covers both **edit** (previous value defined, rollback restores it) and **add** (previous value `undefined`, rollback deletes the key) uniformly — this is exactly how production's own `setItemLocal` already unifies edit+add (`index.html:803-809`), and matches the fact that every existing webapp edit/add handler already has the identical shape modulo which value it's setting.
- Every indices/companies/portfolio/news/IA & Fintech `edit`/`add`/`delete` handler is rewritten to build its key + value (or nothing, for delete) and call the shared primitive with its existing, unchanged toast message — no handler's user-visible message, timing, or rollback condition changes.
- Company bullet handlers (`handleCompanyBulletAdd`/`Edit`/`Delete`) already delegate to `handleCompanyEdit` — they need **no changes**, they're covered automatically once `handleCompanyEdit` itself is refactored.
- The new `handleIndexColorChange` (phase 20) already delegates to `handleIndexEdit` — also covered automatically, no changes needed there either.

## Global Constraints

- **Deliberately excludes week-management handlers** (`handleWeekLabelEdit`, `handleWeekAdd`, `handleWeekDelete`, `handleWeekDuplicate`) — these have batch/multi-key/multi-collection semantics (`deleteDocsBatch`, `writeDocsBatch`, the `activeWeekId`-revert guards) that don't fit the simple single-key primitive above. Covering week management under the eventual undo system is explicitly deferred to a later plan, matching this project's per-slice discipline.
- **Zero behavior change.** This is a structural refactor only. If implementing this plan reveals you'd need to change any handler's rollback *condition*, its toast *message*, or *when* it fires, stop — that would mean the plan's assumption that all 15 handlers are already structurally identical is wrong for that handler, and it needs to be either fixed to match first or explicitly carved out (like week management already is), not silently changed to fit the primitive.
- **This plan writes to the same live production Firestore database** the interns use every week — no staging environment. Because this is a pure refactor of already-shipped, already-verified write paths (not new functionality), the manual verification (Task 3) is a *regression* check — confirm each content type's edit/add/delete and rollback-on-failure still behave identically to before, not a first-time feature verification.
- Do not modify `handleWeekLabelEdit`, `handleWeekAdd`, `handleWeekDelete`, `handleWeekDuplicate`, `handleIndexColorChange`, `webapp/src/data/*`, `webapp/src/panel/*.js` (render functions), `webapp/src/admin/*`, `webapp/src/timeline/*`. This plan touches only `webapp/src/main.js`.
- No new automated tests — `main.js` handlers are never unit-tested in this codebase (confirmed convention, see every prior admin-edit phase). The existing `sidePanel.test.js`/`companyList.test.js` suites test the *render* functions this plan doesn't touch, so they remain valid regression coverage for everything except the write-path itself, which this plan verifies manually (Task 3) since there's no other way to verify it here.

---
### Task 1: Add the shared primitives

**Files:**
- Modify: `webapp/src/main.js`

- [ ] **Step 1: Add `setItemLocal` and `deleteItemLocal`**

  Add near the top of the handler section (right after `marketItemKey`, before `handleIndexEdit`):
  ```js
  function setItemLocal(key, value, rollbackMessage) {
    const previous = db[key];
    db[key] = value;
    renderPanelForCurrentSelection();
    client.writeDoc(key, value).catch(() => {
      if (previous === undefined) delete db[key]; else db[key] = previous;
      renderPanelForCurrentSelection();
      showToast(document.getElementById('admin-toast'), rollbackMessage);
    });
  }

  function deleteItemLocal(key, rollbackMessage) {
    const previous = db[key];
    delete db[key];
    renderPanelForCurrentSelection();
    client.deleteDocByKey(key).catch(() => {
      db[key] = previous;
      renderPanelForCurrentSelection();
      showToast(document.getElementById('admin-toast'), rollbackMessage);
    });
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add webapp/src/main.js
  git commit -m "refactor: add shared setItemLocal/deleteItemLocal write primitives"
  ```

---
### Task 2: Rewrite the 15 simple content handlers to use the primitives

**Files:**
- Modify: `webapp/src/main.js`

Rewrite each handler below **exactly** as shown — every rewrite preserves the exact same key, exact same value shape, and exact same toast message as the current code (read the current handler first to confirm the message matches character-for-character before replacing; the messages below were transcribed from the current file but re-verify against the actual live source, not from memory, since a copy-paste error here would silently change user-facing text).

- [ ] **Indices** — replace `handleIndexEdit`, `handleIndexAdd`, `handleIndexDelete`:
  ```js
  function handleIndexEdit(item, patch) {
    const key = marketItemKey(item);
    setItemLocal(key, { ...db[key], ...patch }, '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');
  }

  function handleIndexAdd() {
    const id = generateId();
    const key = `mkg:market:${activeWeekId}:${id}`;
    const newItem = {
      id,
      group: GROUP_LABEL_BY_REGION[activeRegionId] || '',
      flag: '',
      name: 'Nouvel indice',
      value: '',
      weekChange: 0,
    };
    setItemLocal(key, newItem, '⚠️ Ajout en ligne échoué — le nouvel indice a été retiré');
  }

  function handleIndexDelete(item) {
    deleteItemLocal(marketItemKey(item), "⚠️ Suppression en ligne échouée — l'indice a été restauré");
  }
  ```

- [ ] **Companies** — replace `handleCompanyEdit`, `handleCompanyAdd`, `handleCompanyDelete` (leave `handleCompanyBulletAdd`/`Edit`/`Delete` untouched — they call `handleCompanyEdit`, already covered):
  ```js
  function handleCompanyEdit(item, patch) {
    const key = companyItemKey(item);
    setItemLocal(key, { ...db[key], ...patch }, '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');
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
    setItemLocal(key, newItem, '⚠️ Ajout en ligne échoué — la nouvelle entreprise a été retirée');
  }

  function handleCompanyDelete(item) {
    deleteItemLocal(companyItemKey(item), "⚠️ Suppression en ligne échouée — l'entreprise a été restaurée");
  }
  ```

- [ ] **Portfolio** — replace `handlePortfolioEdit`, `handlePortfolioAdd`, `handlePortfolioDelete`:
  ```js
  function handlePortfolioEdit(item, patch) {
    const key = portfolioItemKey(item);
    setItemLocal(key, { ...db[key], ...patch }, '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');
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
    setItemLocal(key, newItem, '⚠️ Ajout en ligne échoué — la nouvelle ligne a été retirée');
  }

  function handlePortfolioDelete(item) {
    deleteItemLocal(portfolioItemKey(item), "⚠️ Suppression en ligne échouée — la ligne a été restaurée");
  }
  ```

- [ ] **News** — replace `handleNewsEdit`, `handleNewsAdd`, `handleNewsDelete`:
  ```js
  function handleNewsEdit(item, patch) {
    const key = newsItemKey(item);
    setItemLocal(key, { ...db[key], ...patch }, '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');
  }

  function handleNewsAdd() {
    const id = generateId();
    const key = `mkg:content:news:${activeWeekId}:${id}`;
    const newItem = {
      id,
      region: GROUP_LABEL_BY_REGION[activeRegionId] || '',
      title: 'Nouvelle brève',
      description: 'Description à compléter.',
    };
    setItemLocal(key, newItem, '⚠️ Ajout en ligne échoué — la nouvelle brève a été retirée');
  }

  function handleNewsDelete(item) {
    deleteItemLocal(newsItemKey(item), "⚠️ Suppression en ligne échouée — la brève a été restaurée");
  }
  ```

- [ ] **IA & Fintech** — replace `handleIaFintechEdit`, `handleIaFintechAdd`, `handleIaFintechDelete`:
  ```js
  function handleIaFintechEdit(item, patch) {
    const key = iaFintechItemKey(item);
    setItemLocal(key, { ...db[key], ...patch }, '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');
  }

  function handleIaFintechAdd() {
    const id = generateId();
    const key = `mkg:content:ia-fintech:${activeWeekId}:${id}`;
    const newItem = {
      id,
      tag: '',
      title: 'Nouvel élément',
      description: 'Description à compléter.',
      statLabel: '',
      statValue: '',
      link: '',
    };
    setItemLocal(key, newItem, '⚠️ Ajout en ligne échoué — le nouvel élément a été retiré');
  }

  function handleIaFintechDelete(item) {
    deleteItemLocal(iaFintechItemKey(item), "⚠️ Suppression en ligne échouée — l'élément a été restauré");
  }
  ```

- [ ] **Step: Run the full automated test suite**

  Run: `cd webapp && npx vitest run`
  Expected: PASS — same test count as baseline (this plan adds zero tests; it must not change the count at all, unlike every feature plan). Any failure here means a render-layer contract was accidentally touched — this plan only touches `main.js` orchestration, so a failure would be a real, unexpected regression to investigate, not something to patch around.

- [ ] **Step: Verify the production build still works**

  Run: `cd webapp && npm run build`
  Expected: build succeeds with no errors.

- [ ] **Step: Commit**

  ```bash
  git add webapp/src/main.js
  git commit -m "refactor: route indices/companies/portfolio/news/IA & Fintech handlers through the shared write primitives"
  ```

---
### Task 3: Manual regression verification against live production Firestore

**No files changed in this task — verification only. This is a regression check (confirming unchanged behavior), not a first-time feature check.**

- [ ] Run `cd webapp && npm run dev`, open the printed local URL in a browser, unlock edit mode.
- [ ] For **each** of indices, companies, portfolio, news, IA & Fintech: add an obviously-fake test item, edit one of its fields, confirm the change persists across a hard reload, then delete it and confirm the deletion persists across another hard reload. This is the same "add → edit → hard-reload → delete → hard-reload" cycle every prior admin-edit phase already used — the point here is confirming it *still* works identically, not discovering new behavior.
- [ ] For **at least one** content type, deliberately verify the rollback path still works: the cleanest way is to temporarily go offline (DevTools → Network → Offline, or disable network) after making an edit, confirm the UI shows the change immediately (optimistic update), then confirm it snaps back with the toast message after the write fails, matching what happened before this refactor. Re-enable network afterward.
- [ ] Confirm company bullets (add/edit/delete) still work — they route through `handleCompanyEdit`, which this plan changed.
- [ ] Confirm the index color picker (phase 20) still works — it routes through `handleIndexEdit`, which this plan changed.
- [ ] Spot-check 2-3 real items across different content types are untouched throughout.
- [ ] No console errors during any of the above.
- [ ] Confirm `cd webapp && npx vitest run` is still fully green after the manual session.

---
### End of Plan

At this point every simple single-document content handler (indices, companies + bullets, portfolio, news, IA & Fintech) funnels through two shared primitives, `setItemLocal`/`deleteItemLocal`, with byte-for-byte identical user-visible behavior to before. Week-management handlers remain on their own, unrefactored path (deliberately, given their batch/multi-key semantics). This unblocks the next plan: layering an "annuler tout" (undo) system on top of these two choke points, without needing to touch 15 separate call sites again.
