# Mode édition (mot de passe) + écriture Firestore + indices de marché éditables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the first Firestore **write** path in the `webapp/` rebuild: a password-gated edit mode (mirroring production's `PASSWORD` check) that lets an unlocked user edit, add, and delete market-index rows in the side panel. This is deliberately scoped to ONE section (market indices — the simplest editable data shape in the app) to prove the whole write path end to end before extending edit mode to companies, news, portfolio entries, weeks/regions management, and color pickers in later plans.

**Why indices first (explicitly confirmed with the user):** production's admin UI edits everything (indices, entreprises, news, portfolio, weeks, regions, colors) via `contenteditable` spans plus an undo/session-snapshot system — replicating all of that in one plan is too large and too risky to review as a single unit, especially since every plan of this phase writes to the **same live production Firestore database** the interns use every week. Market indices are the smallest, most self-contained editable shape (`{id, group, flag, name, value, weekChange}`, no cross-references to other sections), making them the safest place to validate the write path, retry logic, and edit-mode UI pattern.

**Architecture:**
- `webapp/src/data/firestoreClient.js` gains `writeDoc(key, value)` / `deleteDocByKey(key)`, built on the firebase v9 modular SDK's `doc`/`setDoc`/`deleteDoc`/`serverTimestamp` (already available — `firebase` is a dependency, only `getFirestore`/`collection`/`getDocs` are imported today). Both wrap a small `writeWithRetry(writeFn, retries?, delayMs?)` helper — the same retry-before-giving-up idea as production's `firestoreSet`/`firestoreDelete`, adapted to the webapp's injectable-function testing style (see `loadAllWithRetry` in the same file for precedent).
- `webapp/src/admin/` is a new folder for everything specific to the edit-mode feature: `uid.js` (id generator, mirrors production's `uid()`), `passwordModal.js` (pure `checkPassword` + a DOM controller `initPasswordModal`, same shape as `chartModal.js`'s `initCompanyChartModal`), `toast.js` (a minimal transient message, `showToast(toastEl, message)` — no dedup/suppression logic like production's, that's unneeded complexity for a single write-failure notice).
- `sidePanel.js`'s `renderIndices` becomes edit-aware: it already takes `container, items`; it gains an `isEditing` flag and an options object of callbacks (`onEditItem`, `onDeleteItem`, `onAddItem`) — same pattern as `renderCompanies` gaining `{ onToggle, onOpenChart }` in the company-chart plan. In edit mode, VALUE and SEMAINE (`weekChange`) render as `<input>` elements that commit `onEditItem(item, patch)` on `change` (blur or Enter, native `<input>` behavior — no need to hand-rebuild contenteditable's focus/blur dance), each row gets a ✕ delete button, and the list gets a trailing "+ Ajouter un indice" button. `showRegion(label, {..., isEditing})` takes `isEditing` per-call (like `portfolioEntries`), so toggling edit mode re-renders the currently-shown region immediately without needing a region switch.
- `main.js` owns the actual Firestore calls: `isEditing` is a top-level `let` (same pattern as `activeRegionId`/`activeWeekId`), the password modal and a "✏️ Éditer" / "🔒 Terminer" toggle button live in `index.html`, and `onEditItem`/`onAddItem`/`onDeleteItem` handlers (a) update the in-memory `db` object immediately for instant visual feedback (mirroring `sidePanel.updateLiveQuotes`'s immutable-merge idiom from the previous plan, and production's "writes update the cache immediately, pushed to Firestore in background" strategy) and (b) fire `firestoreClient.writeDoc`/`deleteDocByKey` in the background, showing a toast on failure (mirroring production's `warnConnectionIssue`).

**Tech Stack:** Same as prior plans — vanilla JS + Vite, Vitest with jsdom for DOM components.

## Global Constraints

- **This plan writes to the same live production Firestore project** (`makor-morning-news`, collection `mkg_data`) that the current production `index.html` and the interns use every week. There is no separate staging database. Manual verification (Task 6) must only ever create/delete an obviously-fake, clearly-marked test index row — **never edit or delete any real existing index** during verification. This is the single most important constraint in this plan.
- The password check must reuse the **exact same literal string** already used in production, copied byte-for-byte from `index.html`'s `const PASSWORD = "...";` (repository root, around line 542) — **read that line from the file and copy it; do not retype it by hand** (transcription typos here would lock out the real users of the current password, or silently diverge from it). Store it as `export const ADMIN_PASSWORD = '<copied value>';` in `webapp/src/admin/config.js`.
- Explicitly OUT OF SCOPE for this plan (future plans, not this one): editing/adding/deleting companies, news, portfolio entries, weeks, or regions; renaming an index (`name`/`flag` fields) — only `value` and `weekChange` are editable on existing rows; color pickers; the "annuler tout" undo/session-snapshot system; any PDF-related feature. A newly *added* index does need `name`/`flag` set at creation time (see Task 5) since it must display sensibly, but editing them afterward is out of scope.
- Live quote data (from the earlier `portfolio-live-refresh` plan) stays strictly read-only — nothing in this plan adds a write path for quote data. This plan's writes are scoped to market-index documents (`mkg:market:{weekId}:{id}`) only.
- Firestore document shape for a market index matches production exactly: key `mkg:market:{weekId}:{id}`, value `{id, group, flag, name, value, weekChange}` (production's `ytdChange` field also exists on real documents but is not read, edited, or written by this plan — read-modify-write must preserve it, not silently drop it. Since edits patch the in-memory object and re-serialize the whole object, this falls out naturally as long as the patch is a shallow merge onto the existing item, not a field-by-field reconstruction).
- Do not modify `webapp/src/globe/*`, `webapp/src/data/portfolioSelectors.js`/`selectors.js`/`regionMatch.js`/`quoteClient.js`/`portfolioLiveQuotes.js`, `webapp/src/panel/portfolioSort.js`/`portfolioTable.js`/`portfolioLiveRefresh.js`/`chartModal.js`/`companyChart.js`/`companyList.js`/`compareSelection.js`, `webapp/src/timeline/*`, or the repository root `index.html`/`css`/`js`.

---

### Task 1: Firestore write client

**Files:**
- Modify: `webapp/src/data/firestoreClient.js`
- Modify: `webapp/src/data/firestoreClient.test.js`

**Interfaces:**
- Produces: `writeWithRetry(writeFn, retries?, delayMs?): Promise<void>` (pure retry loop, exported for direct testing) and, added to `createFirestoreClient()`'s returned object, `writeDoc(key, value): Promise<void>` / `deleteDocByKey(key): Promise<void>`. Used by Task 6's `main.js` wiring.

- [ ] **Step 1: Write the failing tests**

Add to `webapp/src/data/firestoreClient.test.js` (keep existing `createFirestoreClient`/`loadAllWithRetry` tests unchanged, add this alongside them):
```js
import { writeWithRetry } from './firestoreClient.js'; // add to the existing import line instead of duplicating it

describe('writeWithRetry', () => {
  it('resolves without retrying when the write succeeds on the first attempt', async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    await writeWithRetry(writeFn, 2, 0);
    expect(writeFn).toHaveBeenCalledTimes(1);
  });

  it('retries after a failure and succeeds on a later attempt', async () => {
    const writeFn = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce(undefined);
    await writeWithRetry(writeFn, 2, 0);
    expect(writeFn).toHaveBeenCalledTimes(2);
  });

  it('throws the last error once retries are exhausted', async () => {
    const writeFn = vi.fn().mockRejectedValue(new Error('persistent failure'));
    await expect(writeWithRetry(writeFn, 2, 0)).rejects.toThrow('persistent failure');
    expect(writeFn).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });

  it('defaults to 2 retries when not specified', async () => {
    const writeFn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(writeWithRetry(writeFn, undefined, 0)).rejects.toThrow();
    expect(writeFn).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/data/firestoreClient.test.js`
Expected: FAIL — `writeWithRetry is not a function` (or undefined); the pre-existing tests still pass.

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/data/firestoreClient.js` — extend the import line and add the retry helper plus the two write methods (keep `loadAllOnce`/`loadAllWithRetry` exactly as they are):
```js
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

// ... DEFAULT_CONFIG, MAIN_COLLECTION, EMPTY_RETRY_DELAY_MS unchanged ...

const WRITE_RETRY_COUNT = 2;
const WRITE_RETRY_DELAY_MS = 900;

export async function writeWithRetry(writeFn, retries = WRITE_RETRY_COUNT, delayMs = WRITE_RETRY_DELAY_MS) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await writeFn();
      return;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

export function createFirestoreClient(config = DEFAULT_CONFIG) {
  const app = initializeApp(config);
  const db = getFirestore(app);

  async function loadAllOnce() {
    // ... unchanged ...
  }

  async function writeDoc(key, value) {
    await writeWithRetry(() => setDoc(doc(db, MAIN_COLLECTION, key), {
      value: JSON.stringify(value),
      updatedAt: serverTimestamp(),
    }));
  }

  async function deleteDocByKey(key) {
    await writeWithRetry(() => deleteDoc(doc(db, MAIN_COLLECTION, key)));
  }

  return { loadAllOnce, writeDoc, deleteDocByKey };
}

export async function loadAllWithRetry(loadOnceFn, delayMs = EMPTY_RETRY_DELAY_MS) {
  // ... unchanged ...
}
```
(Keep the existing `loadAllOnce`/`loadAllWithRetry` bodies verbatim — only the import line, the new `writeWithRetry` export, and `createFirestoreClient`'s returned object change.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/data/firestoreClient.test.js`
Expected: PASS — existing tests plus these 4 new ones (check the file's current total to confirm the delta is exactly +4).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/data/firestoreClient.js webapp/src/data/firestoreClient.test.js
git commit -m "feat: add Firestore write client with retry"
```

---

### Task 2: Admin utilities — id generator and password check

**Files:**
- Create: `webapp/src/admin/uid.js`
- Create: `webapp/src/admin/uid.test.js`
- Create: `webapp/src/admin/passwordModal.js` (pure `checkPassword` only in this task — the DOM controller is added in Task 3)
- Create: `webapp/src/admin/passwordModal.test.js` (pure `checkPassword` tests only in this task)
- Create: `webapp/src/admin/config.js`

**Interfaces:**
- Produces: `generateId(): string` (used by Task 5's "add index" handler) and `checkPassword(input: string, expected: string): boolean` (used by Task 3's modal controller). `config.js` exports `ADMIN_PASSWORD`.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/admin/uid.test.js`
```js
import { describe, it, expect } from 'vitest';
import { generateId } from './uid.js';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns a different value on each call', () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
  });
});
```

File: `webapp/src/admin/passwordModal.test.js`
```js
import { describe, it, expect } from 'vitest';
import { checkPassword } from './passwordModal.js';

describe('checkPassword', () => {
  it('returns true when the input exactly matches the expected password', () => {
    expect(checkPassword('secret123', 'secret123')).toBe(true);
  });

  it('returns false for a wrong password', () => {
    expect(checkPassword('wrong', 'secret123')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(checkPassword('Secret123', 'secret123')).toBe(false);
  });

  it('returns false for a non-string input', () => {
    expect(checkPassword(undefined, 'secret123')).toBe(false);
    expect(checkPassword(null, 'secret123')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/admin/uid.test.js src/admin/passwordModal.test.js`
Expected: FAIL — `Cannot find module './uid.js'` / `'./passwordModal.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/admin/uid.js`
```js
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
```

File: `webapp/src/admin/passwordModal.js` (this task only adds `checkPassword` — Task 3 appends `initPasswordModal` to this same file)
```js
export function checkPassword(input, expected) {
  return typeof input === 'string' && input === expected;
}
```

File: `webapp/src/admin/config.js` — **open `index.html` at the repository root (not `webapp/`), find the line `const PASSWORD = "...";` (around line 542), and copy its exact string value here.** Do not type the password from memory or guess it.
```js
export const ADMIN_PASSWORD = '<paste the exact value copied from index.html:542 here>';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/admin/uid.test.js src/admin/passwordModal.test.js`
Expected: PASS — 2 tests in `uid.test.js`, 4 tests in `passwordModal.test.js`.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/admin/uid.js webapp/src/admin/uid.test.js webapp/src/admin/passwordModal.js webapp/src/admin/passwordModal.test.js webapp/src/admin/config.js
git commit -m "feat: add id generator and password check for edit mode"
```

---

### Task 3: Password modal component and toast

**Files:**
- Modify: `webapp/src/admin/passwordModal.js` (add `initPasswordModal`)
- Modify: `webapp/src/admin/passwordModal.test.js` (add its tests)
- Create: `webapp/src/admin/passwordModal.css`
- Create: `webapp/src/admin/toast.js`
- Create: `webapp/src/admin/toast.test.js`
- Create: `webapp/src/admin/toast.css`

**Interfaces:**
- Produces: `initPasswordModal({ modalEl, inputEl, errorEl, cancelBtn, okBtn, expectedPassword, onUnlock }): { open(): void, close(): void }` and `showToast(toastEl, message): void`. Used by Task 6's `main.js` wiring.

- [ ] **Step 1: Add the failing tests**

Add to `webapp/src/admin/passwordModal.test.js` (keep the existing `checkPassword` tests, add this alongside):
```js
// @vitest-environment jsdom
```
Add this as the very first line of the file (before the existing imports), and extend the import: `import { checkPassword, initPasswordModal } from './passwordModal.js';`

```js
function makeElements() {
  return {
    modalEl: document.createElement('div'),
    inputEl: document.createElement('input'),
    errorEl: document.createElement('div'),
    cancelBtn: document.createElement('button'),
    okBtn: document.createElement('button'),
  };
}

describe('initPasswordModal', () => {
  it('opens the modal, clears any previous input, and focuses the input', () => {
    const els = makeElements();
    const modal = initPasswordModal({ ...els, expectedPassword: 'pw', onUnlock: () => {} });
    els.inputEl.value = 'leftover';
    document.body.appendChild(els.inputEl); // focus() only works on an attached element
    modal.open();
    expect(els.modalEl.classList.contains('open')).toBe(true);
    expect(els.inputEl.value).toBe('');
  });

  it('calls onUnlock and closes the modal when the correct password is submitted via the OK button', () => {
    const els = makeElements();
    const onUnlock = vi.fn();
    const modal = initPasswordModal({ ...els, expectedPassword: 'pw', onUnlock });
    modal.open();
    els.inputEl.value = 'pw';
    els.okBtn.click();
    expect(onUnlock).toHaveBeenCalledTimes(1);
    expect(els.modalEl.classList.contains('open')).toBe(false);
  });

  it('shows an error and does not call onUnlock for a wrong password', () => {
    const els = makeElements();
    const onUnlock = vi.fn();
    const modal = initPasswordModal({ ...els, expectedPassword: 'pw', onUnlock });
    modal.open();
    els.inputEl.value = 'wrong';
    els.okBtn.click();
    expect(onUnlock).not.toHaveBeenCalled();
    expect(els.errorEl.style.display).toBe('block');
    expect(els.modalEl.classList.contains('open')).toBe(true);
  });

  it('submits on Enter key inside the input', () => {
    const els = makeElements();
    const onUnlock = vi.fn();
    const modal = initPasswordModal({ ...els, expectedPassword: 'pw', onUnlock });
    modal.open();
    els.inputEl.value = 'pw';
    els.inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('closes without calling onUnlock when Cancel is clicked', () => {
    const els = makeElements();
    const onUnlock = vi.fn();
    const modal = initPasswordModal({ ...els, expectedPassword: 'pw', onUnlock });
    modal.open();
    els.cancelBtn.click();
    expect(onUnlock).not.toHaveBeenCalled();
    expect(els.modalEl.classList.contains('open')).toBe(false);
  });
});
```

File: `webapp/src/admin/toast.test.js`
```js
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { showToast } from './toast.js';

describe('showToast', () => {
  afterEach(() => vi.useRealTimers());

  it('sets the message text and adds the visible class', () => {
    const toastEl = document.createElement('div');
    showToast(toastEl, 'Échec de la sauvegarde');
    expect(toastEl.textContent).toBe('Échec de la sauvegarde');
    expect(toastEl.classList.contains('show')).toBe(true);
  });

  it('removes the visible class after the display duration', () => {
    vi.useFakeTimers();
    const toastEl = document.createElement('div');
    showToast(toastEl, 'message', 100);
    expect(toastEl.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(100);
    expect(toastEl.classList.contains('show')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/admin/passwordModal.test.js src/admin/toast.test.js`
Expected: FAIL — `initPasswordModal is not a function`; `Cannot find module './toast.js'`.

- [ ] **Step 3: Write the implementation**

Append to `webapp/src/admin/passwordModal.js` (keep `checkPassword` exactly as it is):
```js
export function initPasswordModal({ modalEl, inputEl, errorEl, cancelBtn, okBtn, expectedPassword, onUnlock }) {
  function open() {
    inputEl.value = '';
    errorEl.style.display = 'none';
    modalEl.classList.add('open');
    inputEl.focus();
  }

  function close() {
    modalEl.classList.remove('open');
  }

  function submit() {
    if (checkPassword(inputEl.value, expectedPassword)) {
      close();
      onUnlock();
    } else {
      errorEl.style.display = 'block';
    }
  }

  okBtn.addEventListener('click', submit);
  cancelBtn.addEventListener('click', close);
  inputEl.addEventListener('keydown', event => {
    if (event.key === 'Enter') submit();
  });

  return { open, close };
}
```

File: `webapp/src/admin/toast.js`
```js
const DEFAULT_DURATION_MS = 2200;

export function showToast(toastEl, message, durationMs = DEFAULT_DURATION_MS) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), durationMs);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/admin/passwordModal.test.js src/admin/toast.test.js`
Expected: PASS — 9 tests in `passwordModal.test.js` (4 existing + 5 new), 2 tests in `toast.test.js`.

- [ ] **Step 5: Write the stylesheets**

File: `webapp/src/admin/passwordModal.css` (mirrors `chartModal.css`'s structure — reuse the same brand tokens):
```css
.password-modal {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 20;
  align-items: center;
  justify-content: center;
}

.password-modal.open {
  display: flex;
}

.password-modal-content {
  background: rgba(15, 23, 48, 0.98);
  border: 1px solid rgba(224, 181, 61, 0.3);
  border-radius: 8px;
  padding: 20px;
  min-width: 280px;
}

.password-modal-content h3 {
  color: #fff;
  font-size: 14px;
  margin: 0 0 12px;
}

.password-modal-content input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px;
  border-radius: 4px;
  border: 1px solid rgba(224, 181, 61, 0.4);
  background: #0f1730;
  color: #fff;
  font-size: 13px;
}

.password-modal-error {
  display: none;
  color: #e0736a;
  font-size: 12px;
  margin-top: 8px;
}

.password-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.password-modal-actions button {
  background: transparent;
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: var(--gold-light, #e0b53d);
  cursor: pointer;
  font-size: 12px;
  padding: 6px 12px;
}

.password-modal-actions button:hover {
  background: rgba(201, 151, 31, 0.2);
}
```

File: `webapp/src/admin/toast.css`
```css
.admin-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  background: rgba(15, 23, 48, 0.98);
  border: 1px solid rgba(224, 181, 61, 0.4);
  color: #fff;
  font-size: 13px;
  padding: 10px 16px;
  border-radius: 6px;
  z-index: 30;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.admin-toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/admin/passwordModal.js webapp/src/admin/passwordModal.test.js webapp/src/admin/passwordModal.css webapp/src/admin/toast.js webapp/src/admin/toast.test.js webapp/src/admin/toast.css
git commit -m "feat: add password modal and toast components"
```

---

### Task 4: Editable market indices — rendering

**Files:**
- Modify: `webapp/src/panel/sidePanel.js`
- Modify: `webapp/src/panel/sidePanel.test.js`
- Modify: `webapp/src/panel/sidePanel.css`

**Interfaces:**
- Changes: `showRegion(label, options)`'s options gains `isEditing` (boolean, default `false`). `initSidePanel`'s constructor gains `onIndexEdit(item, patch)`, `onIndexAdd()`, `onIndexDelete(item)` callbacks (all optional — only required when `isEditing` is ever passed `true`).
- Consumes: nothing new besides these callbacks, called by Task 6's `main.js`.

- [ ] **Step 1: Add the failing tests**

Add to `webapp/src/panel/sidePanel.test.js` — first, update the shared `beforeEach`'s `initSidePanel({...})` call to include no-op stubs for the three new callbacks (`onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {}`), then add this new `describe` block:
```js
describe('editable market indices', () => {
  const ITEM = { id: 'idx1', flag: '🇫🇷', name: 'CAC 40', value: '7 500', weekChange: 1.2 };

  it('renders plain text (no inputs) when isEditing is false or omitted', () => {
    panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [] });
    expect(indicesEl.querySelector('input')).toBeNull();
    expect(indicesEl.querySelector('.panel-index-value').textContent).toBe('7 500');
  });

  it('renders value and weekChange as inputs when isEditing is true', () => {
    panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [], isEditing: true });
    const inputs = indicesEl.querySelectorAll('input');
    expect(inputs).toHaveLength(2);
    expect(inputs[0].value).toBe('7 500');
    expect(Number(inputs[1].value)).toBe(1.2);
  });

  it('calls onIndexEdit with the item and a value patch when the value input changes', () => {
    const onIndexEdit = vi.fn();
    panel = initSidePanel({ labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, onOpenChart: () => {}, onIndexEdit, onIndexAdd: () => {}, onIndexDelete: () => {} });
    panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [], isEditing: true });

    const valueInput = indicesEl.querySelectorAll('input')[0];
    valueInput.value = '7 600';
    valueInput.dispatchEvent(new Event('change'));

    expect(onIndexEdit).toHaveBeenCalledWith(ITEM, { value: '7 600' });
  });

  it('calls onIndexEdit with a numeric weekChange patch when the change input changes', () => {
    const onIndexEdit = vi.fn();
    panel = initSidePanel({ labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, onOpenChart: () => {}, onIndexEdit, onIndexAdd: () => {}, onIndexDelete: () => {} });
    panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [], isEditing: true });

    const changeInput = indicesEl.querySelectorAll('input')[1];
    changeInput.value = '2.5';
    changeInput.dispatchEvent(new Event('change'));

    expect(onIndexEdit).toHaveBeenCalledWith(ITEM, { weekChange: 2.5 });
  });

  it('renders a delete button per row in edit mode that calls onIndexDelete with the item', () => {
    const onIndexDelete = vi.fn();
    panel = initSidePanel({ labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete });
    panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [], isEditing: true });

    indicesEl.querySelector('.panel-index-delete').click();
    expect(onIndexDelete).toHaveBeenCalledWith(ITEM);
  });

  it('does not render a delete button or add button when isEditing is false', () => {
    panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [] });
    expect(indicesEl.querySelector('.panel-index-delete')).toBeNull();
    expect(indicesEl.querySelector('.panel-index-add')).toBeNull();
  });

  it('renders an add-index button in edit mode that calls onIndexAdd', () => {
    const onIndexAdd = vi.fn();
    panel = initSidePanel({ labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd, onIndexDelete: () => {} });
    panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [], isEditing: true });

    indicesEl.querySelector('.panel-index-add').click();
    expect(onIndexAdd).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: FAIL — the new tests fail (no inputs/buttons rendered yet); all pre-existing tests still pass.

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/panel/sidePanel.js` — replace the existing `renderIndices` function with an edit-aware version, and update `initSidePanel` to accept the new callbacks and thread `isEditing` through `showRegion`:
```js
function buildEditableInput(value, type, className, onCommit) {
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

function renderIndices(container, items, isEditing, { onEditItem, onDeleteItem, onAddItem }) {
  container.replaceChildren();
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'panel-index-row';

    const name = document.createElement('span');
    name.className = 'panel-index-name';
    name.textContent = [item.flag, item.name].filter(Boolean).join(' ');

    const value = document.createElement('span');
    value.className = 'panel-index-value';
    if (isEditing) {
      value.appendChild(buildEditableInput(item.value, 'text', 'panel-index-value-input', v => onEditItem(item, { value: v })));
    } else {
      value.textContent = item.value ?? '';
    }

    const change = document.createElement('span');
    const isNegative = Number(item.weekChange) < 0;
    change.className = `panel-index-change ${isNegative ? 'negative' : 'positive'}`;
    if (isEditing) {
      change.appendChild(buildEditableInput(item.weekChange, 'number', 'panel-index-change-input', v => onEditItem(item, { weekChange: v })));
    } else {
      change.textContent = `${item.weekChange}%`;
    }

    row.append(name, value, change);

    if (isEditing) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'panel-index-delete';
      delBtn.setAttribute('aria-label', `Supprimer ${item.name}`);
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => onDeleteItem(item));
      row.appendChild(delBtn);
    }

    container.appendChild(row);
  }

  if (isEditing) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'panel-index-add';
    addBtn.textContent = '+ Ajouter un indice';
    addBtn.addEventListener('click', () => onAddItem());
    container.appendChild(addBtn);
  }
}
```
Update `initSidePanel`'s signature and body (keep `renderNews`, company/portfolio sections exactly as they are):
```js
export function initSidePanel({ labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, onOpenChart, onIndexEdit, onIndexAdd, onIndexDelete }) {
  let selectedCompanyIds = [];
  let currentCompanyItems = [];
  let currentPortfolioEntries = [];
  let sortField = 'date';
  let sortDirection = 'asc';

  // ... renderCompanySection / handleToggleCompare / renderPortfolioSection / handleSort / updateLiveQuotes unchanged ...

  function showRegion(regionLabel, { marketItems, newsItems, companyItems = [], portfolioRegionLabel = '', portfolioEntries = [], isEditing = false }) {
    labelEl.textContent = regionLabel;
    renderIndices(indicesEl, marketItems, isEditing, { onEditItem: onIndexEdit, onDeleteItem: onIndexDelete, onAddItem: onIndexAdd });
    renderNews(newsEl, newsItems);
    currentCompanyItems = companyItems;
    selectedCompanyIds = [];
    renderCompanySection();
    portfolioLabelEl.textContent = portfolioRegionLabel;
    currentPortfolioEntries = portfolioEntries;
    renderPortfolioSection();
  }

  return { showRegion, updateLiveQuotes };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: PASS — the existing 17 tests (unaffected — the `beforeEach` change only updates the shared setup call with no-op stubs, it doesn't add or remove test cases) plus these 7 new ones in the `editable market indices` block = 24 total in this file.

- [ ] **Step 5: Add the styles**

Add to `webapp/src/panel/sidePanel.css` (append, don't modify existing rules):
```css
.panel-index-value-input,
.panel-index-change-input {
  width: 64px;
  box-sizing: border-box;
  background: #0f1730;
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  padding: 2px 4px;
}

.panel-index-delete {
  background: transparent;
  border: none;
  color: #e0736a;
  cursor: pointer;
  font-size: 12px;
  margin-left: 6px;
}

.panel-index-add {
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

.panel-index-add:hover {
  background: rgba(201, 151, 31, 0.15);
}
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/panel/sidePanel.js webapp/src/panel/sidePanel.test.js webapp/src/panel/sidePanel.css
git commit -m "feat: render editable market indices in edit mode"
```

---

### Task 5: Edit-mode toggle button and password modal markup

**Files:**
- Modify: `webapp/index.html`

**Interfaces:**
- Produces: DOM elements consumed by Task 6's `main.js` wiring — an edit-mode toggle button, the password modal's elements, and a toast element.

- [ ] **Step 1: Add the markup**

Modify `webapp/index.html` — add the edit-mode toggle button near the region indicator (inside `<body>`, as a sibling of `#region-indicator`, before the arrow buttons):
```html
  <button id="edit-toggle-btn" class="edit-toggle-btn" type="button">✏️ Éditer</button>
```

Add the password modal markup and toast element just before the closing `</body>` tag (as siblings of `#chart-modal`, not nested inside it):
```html
  <div id="password-modal" class="password-modal">
    <div class="password-modal-content">
      <h3>🔒 Mode édition</h3>
      <input type="password" id="password-input" placeholder="Mot de passe" />
      <div id="password-error" class="password-modal-error">Mot de passe incorrect.</div>
      <div class="password-modal-actions">
        <button id="password-cancel" type="button">Annuler</button>
        <button id="password-ok" type="button">Déverrouiller</button>
      </div>
    </div>
  </div>
  <div id="admin-toast" class="admin-toast"></div>
```

Add a minimal style for the toggle button — modify `webapp/src/styles/globe.css` (append, don't touch existing rules):
```css
.edit-toggle-btn {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 15;
  background: rgba(15, 23, 48, 0.9);
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 6px;
  color: var(--gold-light, #e0b53d);
  cursor: pointer;
  font-size: 12px;
  padding: 8px 14px;
}

.edit-toggle-btn.active {
  background: rgba(201, 151, 31, 0.25);
}
```

- [ ] **Step 2: No automated test for this step**

Markup-only change with no behavior yet (nothing references these ids until Task 6). Verified visually as part of Task 6's manual verification.

- [ ] **Step 3: Commit**

```bash
git add webapp/index.html webapp/src/styles/globe.css
git commit -m "feat: add edit-mode toggle button and password modal markup"
```

---

### Task 6: Wire edit mode into the app and verify end-to-end

**Files:**
- Modify: `webapp/src/main.js`

**Interfaces:**
- Consumes: `writeDoc`/`deleteDocByKey` (Task 1), `generateId`/`checkPassword`/`ADMIN_PASSWORD` (Task 2), `initPasswordModal`/`showToast` (Task 3), the edit-aware `initSidePanel` (Task 4), the markup added in Task 5.
- Produces: the running application. Final deliverable of this plan.

- [ ] **Step 1: Wire everything into `main.js`**

Modify `webapp/src/main.js`. Add the imports:
```js
import './admin/passwordModal.css';
import './admin/toast.css';
import { initPasswordModal } from './admin/passwordModal.js';
import { showToast } from './admin/toast.js';
import { generateId } from './admin/uid.js';
import { ADMIN_PASSWORD } from './admin/config.js';
```

Add top-level state next to `activeWeekId`/`activeRegionId`:
```js
let isEditing = false;
```

A small region→group-label map (only used when constructing a brand-new index so it lands in the region currently being viewed — matches the substring matching in `regionMatch.js`):
```js
const GROUP_LABEL_BY_REGION = {
  asia: 'ASIE',
  'brics-uk': 'BRICS + UK',
  europe: 'EUROPE & UK',
  'north-america': 'AMÉRIQUE DU NORD',
};
```

The Firestore client instance is already created inside `bootstrap()` as a local `client` — move its creation one level up so the edit handlers can reuse it:
```js
const client = createFirestoreClient();
```
(Remove the `const client = createFirestoreClient();` line from inside `bootstrap()` and use this top-level one instead — `bootstrap()` still calls `client.loadAllOnce()` exactly as before, just via the hoisted variable.)

Add the three edit handlers (before `renderPanelForCurrentSelection`, since it now needs to pass them through — see below):
```js
function marketItemKey(item) {
  return `mkg:market:${activeWeekId}:${item.id}`;
}

function handleIndexEdit(item, patch) {
  const key = marketItemKey(item);
  const updated = { ...db[key], ...patch };
  db[key] = updated;
  renderPanelForCurrentSelection();
  client.writeDoc(key, updated).catch(() => {
    showToast(document.getElementById('admin-toast'), '⚠️ Sauvegarde en ligne échouée — vérifie ta connexion');
  });
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
  db[key] = newItem;
  renderPanelForCurrentSelection();
  client.writeDoc(key, newItem).catch(() => {
    showToast(document.getElementById('admin-toast'), '⚠️ Sauvegarde en ligne échouée — vérifie ta connexion');
  });
}

function handleIndexDelete(item) {
  const key = marketItemKey(item);
  delete db[key];
  renderPanelForCurrentSelection();
  client.deleteDocByKey(key).catch(() => {
    showToast(document.getElementById('admin-toast'), '⚠️ Suppression en ligne échouée — vérifie ta connexion');
  });
}
```

Update the `panel` construction to pass the new callbacks:
```js
const panel = initSidePanel({
  labelEl: document.getElementById('panel-region-label'),
  indicesEl: document.getElementById('panel-indices'),
  newsEl: document.getElementById('panel-news'),
  companiesEl: document.getElementById('panel-companies'),
  compareEl: document.getElementById('panel-compare'),
  portfolioLabelEl: document.getElementById('panel-portfolio-region-label'),
  portfolioEl: document.getElementById('panel-portfolio'),
  onOpenChart: item => chartModal.open(item, currentPortfolioEntriesForChart),
  onIndexEdit: handleIndexEdit,
  onIndexAdd: handleIndexAdd,
  onIndexDelete: handleIndexDelete,
});
```

Update `renderPanelForCurrentSelection` to pass `isEditing` into `showRegion` (add `isEditing,` to the object passed to `panel.showRegion`, alongside the existing fields — everything else in that function stays as it was after the previous plan):
```js
  panel.showRegion(region.label, {
    marketItems: getMarketItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    newsItems: getNewsItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    companyItems: getCompanyItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    portfolioRegionLabel: portfolioRegion ? portfolioRegion.label : '',
    portfolioEntries,
    isEditing,
  });
```

Set up the password modal and the toggle button (after `initGlobeScene`/arrow-button wiring, before `bootstrap()`):
```js
const editToggleBtn = document.getElementById('edit-toggle-btn');

const passwordModal = initPasswordModal({
  modalEl: document.getElementById('password-modal'),
  inputEl: document.getElementById('password-input'),
  errorEl: document.getElementById('password-error'),
  cancelBtn: document.getElementById('password-cancel'),
  okBtn: document.getElementById('password-ok'),
  expectedPassword: ADMIN_PASSWORD,
  onUnlock: () => {
    isEditing = true;
    editToggleBtn.textContent = '🔒 Terminer';
    editToggleBtn.classList.add('active');
    renderPanelForCurrentSelection();
  },
});

editToggleBtn.addEventListener('click', () => {
  if (isEditing) {
    isEditing = false;
    editToggleBtn.textContent = '✏️ Éditer';
    editToggleBtn.classList.remove('active');
    renderPanelForCurrentSelection();
  } else {
    passwordModal.open();
  }
});
```

- [ ] **Step 2: Run the full automated test suite**

Run: `cd webapp && npm test`
Expected: PASS — all tests across every test file pass, 0 failures. (No new tests are added directly in this task — `main.js` has no unit tests in this codebase, matching the precedent from every earlier plan.)

- [ ] **Step 3: Manual browser verification — READ THE SAFETY NOTE FIRST**

**Safety note:** this app connects to the same live Firestore project the real production site and the interns use. Every write you make here is real. Only ever add/edit/delete an index you created yourself for this test — never touch a pre-existing real index row.

Run: `cd webapp && npm run dev`, then open the printed local URL in a browser.

Checklist:
- [ ] The "✏️ Éditer" button is visible in the top-right corner.
- [ ] Clicking it opens the password modal; typing the wrong password shows "Mot de passe incorrect." without unlocking; typing the correct password (the one copied into `webapp/src/admin/config.js`) unlocks edit mode — the button becomes "🔒 Terminer" and market-index rows in the side panel now show input fields instead of plain text.
- [ ] Click "+ Ajouter un indice". A new row appears immediately (optimistic update) named "Nouvel indice" with an empty value and 0%. **Immediately rename it to something unmistakably a test, e.g. set its VALUE input to `TEST — À SUPPRIMER`,** confirm the edit persists (input `change` event, e.g. tab out or press Enter — note: `<input type="text">` doesn't submit on Enter by itself the way a form would, use Tab or click elsewhere to blur and fire `change`).
- [ ] Reload the page fully (hard refresh). Confirm the test index is still there with the value you set — this proves the write actually reached Firestore, not just local state.
- [ ] Edit its VALUE and SEMAINE fields again, confirm the change reflects immediately in the UI.
- [ ] Click its ✕ delete button. Confirm it disappears immediately.
- [ ] Reload the page again. Confirm the test index is gone for good (delete reached Firestore too).
- [ ] Click "🔒 Terminer" to exit edit mode. Confirm the inputs/delete/add buttons disappear and all index rows go back to plain text — and confirm none of the **real, pre-existing** index values were altered by any of the above (spot-check 2-3 real rows against what they showed before you started).
- [ ] No console errors during any of the above.

- [ ] **Step 4: Verify the production build still works**

Run: `cd webapp && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/main.js
git commit -m "feat: wire password-gated edit mode for market indices"
```

---

## End of Plan

At this point market indices are the first fully editable, password-gated, Firestore-backed section of the `webapp/` rebuild — proving the write path (optimistic local update + background write + retry + failure toast) end to end. Still pending, as separate later plans: extending edit mode to companies, news, portfolio entries (including the SYMBOLE field that feeds live quotes), weeks/regions management, and color pickers; the "annuler tout" undo/session-snapshot system; PDF export; the IA & Fintech panel; a final visual-theme + mobile-fallback pass; and the eventual production cutover.
