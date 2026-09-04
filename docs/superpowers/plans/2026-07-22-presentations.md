# Sous-fonctionnalité Présentations (IA & Fintech) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port production's "Présentations" sub-feature (root `index.html:2172-2272`) to `webapp/` — a grid of PDF-deck thumbnail cards on the IA & Fintech section, click to open the full deck, admin can rename/delete. Explicitly deferred since phase 14 ("Production's linked 'Présentations' sub-feature ... was explicitly scoped out ... deferred to its own future plan given the added complexity").

**The complexity is smaller than it looks, once you actually read production's code (confirmed, not assumed):** production has **no in-app upload UI at all**. Its "+ Ajouter une présentation" card's entire click handler is `showToast('Pour ajouter une présentation, envoie-moi le PDF dans le chat — je génère la vignette et je l'intègre pour toi.')` (`index.html:2269-2271`) — adding a presentation is a manual, out-of-band process (PDF handed to whoever administers the site, who generates the thumbnail and writes the chunked data directly), not a feature the deployed app itself implements. This plan therefore only needs to port **display, open, rename, and delete** — no file upload, no thumbnail generation, no client-side chunking-on-write. That removes the single most complex part of "porting a file-upload feature."

**Data model (confirmed from production's actual code, not assumed):**
- `mkg:presentation:{id}` → `{id, title, thumb, createdAt}` — lives in the **main** `mkg_data` collection, already part of every normal bulk load (no special fetch needed to list presentations).
- `mkg:pdfchunk:{id}:{n}` → a base64 chunk (string) of the PDF's bytes — lives in a **separate** Firestore collection, `mkg_pdfchunks`, deliberately **excluded** from the bulk load (`index.html:657-658`: "PDF chunks only when a presentation is actually opened, not on every page load") and fetched on demand only when a presentation is actually clicked. `webapp/`'s `firestoreClient.js` currently only knows about `mkg_data` — this plan teaches it to route by key prefix to whichever collection a key actually belongs to, mirroring production's own `collectionForKey` (`index.html:606-608`) exactly.

**Architecture:**
- `webapp/src/data/firestoreClient.js`: add an exported, pure `collectionForKey(key)` (routes `mkg:pdfchunk:*` keys to `mkg_pdfchunks`, everything else to `mkg_data` — real unit tests, unlike the SDK-wrapping methods). Every existing write/delete method (`writeDoc`, `deleteDocByKey`, `deleteDocsBatch`, `writeDocsBatch`) is changed to route through it instead of hardcoding `MAIN_COLLECTION` — this is what lets a single `deleteDocsBatch([...chunkKeys, presentationKey])` call correctly delete across both collections atomically, with zero new batch-delete logic. Two new read methods, `fetchKeysWithPrefix(prefix)` and `fetchRawValue(key)`, mirror production's `fetchRemoteKeys`/`fetchRawKey` (`index.html:659-676`) using a Firestore document-ID range query (`>= prefix`, `< prefix + ''`) — needed because chunk keys are never in the bulk-loaded `db` object.
- `webapp/src/data/selectors.js`: `getPresentations(db)` — unfiltered (matches `getIaFintechItemsForWeek`'s already-established "no region axis" pattern, but even simpler: presentations aren't week-scoped either, confirmed by production's own `loadPresentations()` having no week/region filter at all, `index.html:2174-2178`), sorted by `createdAt`.
- New `webapp/src/panel/presentationPdf.js`: pure/injectable chunk-fetch-and-reassemble logic — `sortChunkKeys`, `base64ToPdfBlob`, `fetchChunkWithRetry`, and an orchestrating `openPresentationPdf(id, client, onProgress)` that returns `{ ok: true, url }` or `{ ok: false, reason }` rather than doing the `window.open`/toast side effects itself, so the actual fetch/retry/reassembly logic (the genuinely error-prone part — chunk-order, partial failures, base64→Blob conversion) is fully unit-testable, matching this codebase's established DI-for-testability convention (`quoteClient.js`'s `fetchFn = fetch` default-param pattern, `pdfExport.js`'s `html2pdfFn`).
- New `webapp/src/panel/presentations.js`/`.css`: grid rendering — thumbnail cards, inline-editable title (edit mode only, reuses `buildEditableInput` exactly like every other title field in this codebase), delete button, an "+ Ajouter une présentation" card that shows the same kind of informational toast production does (no upload UI, matching production's real capability). Dark "raised card" styling matching `.panel-company-card`/`.panel-iafintech-card`, **not** a literal port of production's light-card look — same deliberate divergence phase 14 already established for this exact section ("mirrors the existing dark 'raised card' look already established... not a literal port of production's card style").
- `webapp/src/main.js`: `handleOpenPresentation` (calls `openPresentationPdf`, shows progress/error toasts, `window.open`s the result), `handlePresentationTitleEdit` (plain inline optimistic-update-with-rollback, same shape as every other edit handler **currently** in `main.js` — deliberately **not** using the `setItemLocal` primitive from the write-path-refactor plan running in parallel tonight, to avoid a merge dependency between the two branches; a trivial follow-up can migrate it once both are merged), `handlePresentationDelete` (the one destructive action in this plan — uses `window.confirm` before deleting, matching the project's established precedent that only genuinely hard-to-recover actions get a confirm gate, like week deletion; deleting a presentation destroys a real uploaded PDF permanently, unlike every other delete in this app which just removes a re-typeable data row).

## Global Constraints

- **This plan writes to the same live production Firestore database** the interns use every week — no staging environment, and this time **across two collections** (`mkg_data` and `mkg_pdfchunks`). Manual verification (Task 6) must only ever touch an obviously-fake test presentation, seeded specifically for this test (see Task 6 for how, since there's no in-app way to create one) — **never delete or rename a real presentation**.
- No file upload UI is being built — this plan explicitly does not attempt to replicate "génère la vignette et je l'intègre" from production; that remains a manual, out-of-band process for whoever administers the site, exactly as it is in production today.
- Do not modify `webapp/src/main.js`'s existing handlers (indices/companies/portfolio/news/IA & Fintech) — if the write-path-refactor plan has already merged by the time this is implemented, integrate with `setItemLocal`/`deleteItemLocal` where it obviously fits; if not, use the plain inline pattern shown above. Either way, do not touch the *other* handlers' bodies.
- Do not modify `webapp/src/panel/sidePanel.js`'s existing render functions (`renderIndices`/`renderNews`/`renderCompanies`/`renderIaFintech`/`renderPortfolioSection`) — presentations get their own container and render function, wired in alongside the existing ones in `showRegion`, not merged into `renderIaFintech`.
- This plan touches: `webapp/src/data/firestoreClient.js`/`.test.js`, `webapp/src/data/selectors.js`/`.test.js`, new `webapp/src/panel/presentationPdf.js`/`.test.js`, new `webapp/src/panel/presentations.js`/`.css`/`.test.js`, `webapp/src/panel/sidePanel.js`/`.test.js` (only to add the new container + wiring, not to modify existing sections), `webapp/index.html`, `webapp/src/main.js`.

---
### Task 1: Teach the Firestore client to route by collection

**Files:**
- Modify: `webapp/src/data/firestoreClient.js`
- Modify: `webapp/src/data/firestoreClient.test.js`

**Interfaces:**
- Adds: `collectionForKey(key: string): string` (exported, pure)
- Adds to the object returned by `createFirestoreClient()`: `fetchKeysWithPrefix(prefix: string): Promise<string[]>`, `fetchRawValue(key: string): Promise<string | null>`

- [ ] **Step 1: Write the failing test for `collectionForKey`**

  Add to `webapp/src/data/firestoreClient.test.js`:
  ```js
  import { loadAllWithRetry, writeWithRetry, collectionForKey } from './firestoreClient.js';

  describe('collectionForKey', () => {
    it('routes pdfchunk keys to the mkg_pdfchunks collection', () => {
      expect(collectionForKey('mkg:pdfchunk:abc123:0')).toBe('mkg_pdfchunks');
    });

    it('routes every other key to the main mkg_data collection', () => {
      expect(collectionForKey('mkg:presentation:abc123')).toBe('mkg_data');
      expect(collectionForKey('mkg:week:w1')).toBe('mkg_data');
      expect(collectionForKey('mkg:market:w1:idx1')).toBe('mkg_data');
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd webapp && npx vitest run src/data/firestoreClient.test.js`
  Expected: FAIL — `collectionForKey` is not exported yet.

- [ ] **Step 3: Write the implementation**

  In `webapp/src/data/firestoreClient.js`, update the imports:
  ```js
  import { getFirestore, collection, getDocs, getDoc, doc, setDoc, deleteDoc, serverTimestamp, writeBatch, query, where, documentId } from 'firebase/firestore';
  ```
  Add near the existing `MAIN_COLLECTION` constant:
  ```js
  const PDF_PREFIX = 'mkg:pdfchunk:';
  const PDF_COLLECTION = 'mkg_pdfchunks';

  export function collectionForKey(key) {
    return key.startsWith(PDF_PREFIX) ? PDF_COLLECTION : MAIN_COLLECTION;
  }
  ```
  Update `writeDoc`, `deleteDocByKey`, `deleteDocsBatch`, `writeDocsBatch` to route through it instead of the hardcoded `MAIN_COLLECTION`:
  ```js
  async function writeDoc(key, value) {
    await writeWithRetry(() => setDoc(doc(db, collectionForKey(key), key), {
      value: JSON.stringify(value),
      updatedAt: serverTimestamp(),
    }));
  }

  async function deleteDocByKey(key) {
    await writeWithRetry(() => deleteDoc(doc(db, collectionForKey(key), key)));
  }

  async function deleteDocsBatch(keys) {
    if (keys.length === 0) return;
    await writeWithRetry(async () => {
      const batch = writeBatch(db);
      for (const key of keys) {
        batch.delete(doc(db, collectionForKey(key), key));
      }
      await batch.commit();
    });
  }

  async function writeDocsBatch(entries) {
    if (entries.length === 0) return;
    await writeWithRetry(async () => {
      const batch = writeBatch(db);
      for (const [key, value] of entries) {
        batch.set(doc(db, collectionForKey(key), key), {
          value: JSON.stringify(value),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    });
  }
  ```
  Add the two new read methods (same function scope as the others, inside `createFirestoreClient`):
  ```js
  async function fetchKeysWithPrefix(prefix) {
    const coll = collectionForKey(prefix);
    const q = query(
      collection(db, coll),
      where(documentId(), '>=', prefix),
      where(documentId(), '<', prefix + ''),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.id);
  }

  async function fetchRawValue(key) {
    const snap = await getDoc(doc(db, collectionForKey(key), key));
    return snap.exists() ? snap.data().value : null;
  }
  ```
  Update the return statement:
  ```js
  return { loadAllOnce, writeDoc, deleteDocByKey, deleteDocsBatch, writeDocsBatch, fetchKeysWithPrefix, fetchRawValue };
  ```
  (`loadAllOnce` stays unchanged — it deliberately only ever reads `MAIN_COLLECTION`, matching production's bulk load, which also never touches `mkg_pdfchunks`.)

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd webapp && npx vitest run src/data/firestoreClient.test.js`
  Expected: PASS — all tests pass (existing 8 + 2 new). No test for `fetchKeysWithPrefix`/`fetchRawValue` themselves — they wrap the real Firestore SDK directly, matching the established precedent that `loadAllOnce`/`writeDoc`/`deleteDocByKey`/`deleteDocsBatch`/`writeDocsBatch` have none either; covered by Task 6's manual verification instead.

- [ ] **Step 5: Commit**

  ```bash
  git add webapp/src/data/firestoreClient.js webapp/src/data/firestoreClient.test.js
  git commit -m "feat: route Firestore reads/writes to the correct collection by key prefix"
  ```

---
### Task 2: Add the presentations selector

**Files:**
- Modify: `webapp/src/data/selectors.js`
- Modify: `webapp/src/data/selectors.test.js`

**Interfaces:**
- Adds: `getPresentations(db): object[]`

- [ ] **Step 1: Write the failing tests**

  Add to `webapp/src/data/selectors.test.js`:
  ```js
  import { /* existing imports */, getPresentations } from './selectors.js';
  ```
  ```js
  describe('getPresentations', () => {
    const DB = {
      'mkg:presentation:p2': { id: 'p2', title: 'Deck B', thumb: 'data:...', createdAt: 200 },
      'mkg:presentation:p1': { id: 'p1', title: 'Deck A', thumb: 'data:...', createdAt: 100 },
      'mkg:week:w1': { id: 'w1', label: 'Semaine 1', order: 0 },
    };

    it('returns every presentation, sorted by createdAt ascending', () => {
      expect(getPresentations(DB).map(p => p.id)).toEqual(['p1', 'p2']);
    });

    it('does not include unrelated keys', () => {
      expect(getPresentations(DB).some(p => p.id === 'w1')).toBe(false);
    });

    it('returns an empty array when there are no presentations', () => {
      expect(getPresentations({ 'mkg:week:w1': { id: 'w1' } })).toEqual([]);
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd webapp && npx vitest run src/data/selectors.test.js`
  Expected: FAIL — `getPresentations` is not exported yet.

- [ ] **Step 3: Write the implementation**

  Add to `webapp/src/data/selectors.js`:
  ```js
  export function getPresentations(db) {
    return Object.keys(db)
      .filter(key => key.startsWith('mkg:presentation:'))
      .map(key => db[key])
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd webapp && npx vitest run src/data/selectors.test.js`
  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add webapp/src/data/selectors.js webapp/src/data/selectors.test.js
  git commit -m "feat: add getPresentations selector"
  ```

---
### Task 3: PDF chunk fetch, retry, and reassembly logic

**Files:**
- Create: `webapp/src/panel/presentationPdf.js`
- Create: `webapp/src/panel/presentationPdf.test.js`

**Interfaces:**
- Adds: `sortChunkKeys(keys: string[]): string[]`
- Adds: `base64ToPdfBlob(base64: string): Blob`
- Adds: `fetchChunkWithRetry(key: string, fetchRawValueFn: (key: string) => Promise<string|null>, attempts?: number, delayMs?: number): Promise<string|null>`
- Adds: `openPresentationPdf(id: string, client: { fetchKeysWithPrefix, fetchRawValue }, onProgress?: (done: number, total: number) => void, retryDelayMs?: number): Promise<{ ok: true, url: string } | { ok: false, reason: 'not-ready' | 'chunk-failed' | 'reassembly-failed' }>` (`retryDelayMs` defaults to 300 for real use, tests pass `0` to avoid slowing down the suite — same convention as `firestoreClient.js`'s `writeWithRetry` tests)

- [ ] **Step 1: Write the failing tests**

  Create `webapp/src/panel/presentationPdf.test.js`:
  ```js
  // @vitest-environment jsdom
  import { describe, it, expect, vi } from 'vitest';
  import { sortChunkKeys, base64ToPdfBlob, fetchChunkWithRetry, openPresentationPdf } from './presentationPdf.js';

  describe('sortChunkKeys', () => {
    it('sorts chunk keys numerically by their trailing index, not lexicographically', () => {
      const keys = ['mkg:pdfchunk:p1:10', 'mkg:pdfchunk:p1:2', 'mkg:pdfchunk:p1:1'];
      expect(sortChunkKeys(keys)).toEqual(['mkg:pdfchunk:p1:1', 'mkg:pdfchunk:p1:2', 'mkg:pdfchunk:p1:10']);
    });

    it('does not mutate the input array', () => {
      const keys = ['mkg:pdfchunk:p1:2', 'mkg:pdfchunk:p1:1'];
      const original = [...keys];
      sortChunkKeys(keys);
      expect(keys).toEqual(original);
    });
  });

  describe('base64ToPdfBlob', () => {
    it('decodes a base64 string into a Blob with the PDF mime type', () => {
      const blob = base64ToPdfBlob(btoa('%PDF-1.4 fake content'));
      expect(blob.type).toBe('application/pdf');
      expect(blob.size).toBeGreaterThan(0);
    });
  });

  describe('fetchChunkWithRetry', () => {
    it('returns the value immediately when the first attempt succeeds', async () => {
      const fetchRawValueFn = vi.fn().mockResolvedValue('chunk-data');
      const result = await fetchChunkWithRetry('key1', fetchRawValueFn, 3, 0);
      expect(result).toBe('chunk-data');
      expect(fetchRawValueFn).toHaveBeenCalledTimes(1);
    });

    it('retries on null/undefined and returns the value once it succeeds', async () => {
      const fetchRawValueFn = vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('chunk-data');
      const result = await fetchChunkWithRetry('key1', fetchRawValueFn, 3, 0);
      expect(result).toBe('chunk-data');
      expect(fetchRawValueFn).toHaveBeenCalledTimes(2);
    });

    it('returns null after exhausting all attempts', async () => {
      const fetchRawValueFn = vi.fn().mockResolvedValue(null);
      const result = await fetchChunkWithRetry('key1', fetchRawValueFn, 3, 0);
      expect(result).toBeNull();
      expect(fetchRawValueFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('openPresentationPdf', () => {
    it('returns not-ready when there are no chunk keys yet', async () => {
      const client = { fetchKeysWithPrefix: vi.fn().mockResolvedValue([]), fetchRawValue: vi.fn() };
      const result = await openPresentationPdf('p1', client);
      expect(result).toEqual({ ok: false, reason: 'not-ready' });
    });

    it('fetches every chunk in order, reassembles them, and returns a blob URL', async () => {
      const b64 = btoa('%PDF-1.4 fake content');
      const half = Math.ceil(b64.length / 2);
      const client = {
        fetchKeysWithPrefix: vi.fn().mockResolvedValue(['mkg:pdfchunk:p1:1', 'mkg:pdfchunk:p1:0']),
        fetchRawValue: vi.fn(key => Promise.resolve(key.endsWith(':0') ? JSON.stringify(b64.slice(0, half)) : JSON.stringify(b64.slice(half)))),
      };
      global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      const result = await openPresentationPdf('p1', client);
      expect(result.ok).toBe(true);
      expect(result.url).toBe('blob:mock-url');
      expect(client.fetchRawValue).toHaveBeenNthCalledWith(1, 'mkg:pdfchunk:p1:0');
      expect(client.fetchRawValue).toHaveBeenNthCalledWith(2, 'mkg:pdfchunk:p1:1');
    });

    it('reports progress via onProgress as each chunk resolves', async () => {
      const client = {
        fetchKeysWithPrefix: vi.fn().mockResolvedValue(['mkg:pdfchunk:p1:0', 'mkg:pdfchunk:p1:1']),
        fetchRawValue: vi.fn().mockResolvedValue(JSON.stringify('')),
      };
      global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      const onProgress = vi.fn();
      await openPresentationPdf('p1', client, onProgress);
      expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2);
      expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2);
    });

    it('returns chunk-failed when a chunk never resolves', async () => {
      const client = {
        fetchKeysWithPrefix: vi.fn().mockResolvedValue(['mkg:pdfchunk:p1:0']),
        fetchRawValue: vi.fn().mockResolvedValue(null),
      };
      // retryDelayMs=0: this exercises all 3 real retry attempts inside
      // fetchChunkWithRetry, so a non-zero delay here would genuinely slow
      // down the suite for no benefit — same reasoning as firestoreClient's
      // own writeWithRetry tests always passing delayMs=0.
      const result = await openPresentationPdf('p1', client, undefined, 0);
      expect(result).toEqual({ ok: false, reason: 'chunk-failed', index: 0, total: 1 });
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd webapp && npx vitest run src/panel/presentationPdf.test.js`
  Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

  Create `webapp/src/panel/presentationPdf.js`:
  ```js
  export function sortChunkKeys(keys) {
    return [...keys].sort((a, b) => parseInt(a.split(':').pop(), 10) - parseInt(b.split(':').pop(), 10));
  }

  export function base64ToPdfBlob(base64) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    return new Blob([new Uint8Array(byteNumbers)], { type: 'application/pdf' });
  }

  export async function fetchChunkWithRetry(key, fetchRawValueFn, attempts = 3, delayMs = 300) {
    for (let i = 0; i < attempts; i++) {
      const value = await fetchRawValueFn(key);
      if (value !== null && value !== undefined) return value;
      if (i < attempts - 1) await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    return null;
  }

  export async function openPresentationPdf(id, client, onProgress, retryDelayMs = 300) {
    const chunkKeys = sortChunkKeys(await client.fetchKeysWithPrefix(`mkg:pdfchunk:${id}:`));
    if (chunkKeys.length === 0) return { ok: false, reason: 'not-ready' };

    const parts = [];
    for (let i = 0; i < chunkKeys.length; i++) {
      const raw = await fetchChunkWithRetry(chunkKeys[i], client.fetchRawValue, 3, retryDelayMs);
      if (raw === null) return { ok: false, reason: 'chunk-failed', index: i, total: chunkKeys.length };
      let value = raw;
      try { value = JSON.parse(raw); } catch { /* stored as a plain string */ }
      parts.push(value);
      if (onProgress) onProgress(i + 1, chunkKeys.length);
    }

    try {
      const blob = base64ToPdfBlob(parts.join(''));
      return { ok: true, url: URL.createObjectURL(blob) };
    } catch {
      return { ok: false, reason: 'reassembly-failed' };
    }
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd webapp && npx vitest run src/panel/presentationPdf.test.js`
  Expected: PASS — all 9 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add webapp/src/panel/presentationPdf.js webapp/src/panel/presentationPdf.test.js
  git commit -m "feat: add PDF chunk fetch, retry, and reassembly logic"
  ```

---
### Task 4: Presentations grid rendering

**Files:**
- Create: `webapp/src/panel/presentations.js`
- Create: `webapp/src/panel/presentations.css`
- Create: `webapp/src/panel/presentations.test.js`
- Modify: `webapp/index.html`

**Interfaces:**
- Adds: `renderPresentations(container, items, isEditing, { onOpen, onDelete, onTitleEdit, onAddClick }): void`

- [ ] **Step 1: Write the failing tests**

  Create `webapp/src/panel/presentations.test.js`:
  ```js
  // @vitest-environment jsdom
  import { describe, it, expect, vi } from 'vitest';
  import { renderPresentations } from './presentations.js';

  const ITEM = { id: 'p1', title: 'Deck A', thumb: 'data:image/png;base64,xxx', createdAt: 100 };

  describe('renderPresentations', () => {
    it('renders one card per presentation with thumbnail and title', () => {
      const container = document.createElement('div');
      renderPresentations(container, [ITEM], false, { onOpen: () => {}, onDelete: () => {}, onTitleEdit: () => {}, onAddClick: () => {} });
      const card = container.querySelector('.presentation-card');
      expect(card.querySelector('.presentation-thumb').src).toContain('data:image/png');
      expect(card.querySelector('.presentation-name').textContent).toBe('Deck A');
    });

    it('falls back to "Sans titre" when the title is missing', () => {
      const container = document.createElement('div');
      renderPresentations(container, [{ ...ITEM, title: '' }], false, { onOpen: () => {}, onDelete: () => {}, onTitleEdit: () => {}, onAddClick: () => {} });
      expect(container.querySelector('.presentation-name').textContent).toBe('Sans titre');
    });

    it('calls onOpen with the item when the card is clicked', () => {
      const onOpen = vi.fn();
      const container = document.createElement('div');
      renderPresentations(container, [ITEM], false, { onOpen, onDelete: () => {}, onTitleEdit: () => {}, onAddClick: () => {} });
      container.querySelector('.presentation-card').click();
      expect(onOpen).toHaveBeenCalledWith(ITEM);
    });

    it('does not render a delete button or title input when not editing', () => {
      const container = document.createElement('div');
      renderPresentations(container, [ITEM], false, { onOpen: () => {}, onDelete: () => {}, onTitleEdit: () => {}, onAddClick: () => {} });
      expect(container.querySelector('.presentation-delete')).toBeNull();
      expect(container.querySelector('.presentation-name-input')).toBeNull();
    });

    it('renders a delete button and a title input in edit mode', () => {
      const container = document.createElement('div');
      renderPresentations(container, [ITEM], true, { onOpen: () => {}, onDelete: () => {}, onTitleEdit: () => {}, onAddClick: () => {} });
      expect(container.querySelector('.presentation-delete')).not.toBeNull();
      expect(container.querySelector('.presentation-name-input').value).toBe('Deck A');
    });

    it('calls onDelete with the item when the delete button is clicked, without also triggering onOpen', () => {
      const onOpen = vi.fn();
      const onDelete = vi.fn();
      const container = document.createElement('div');
      renderPresentations(container, [ITEM], true, { onOpen, onDelete, onTitleEdit: () => {}, onAddClick: () => {} });
      container.querySelector('.presentation-delete').click();
      expect(onDelete).toHaveBeenCalledWith(ITEM);
      expect(onOpen).not.toHaveBeenCalled();
    });

    it('calls onTitleEdit with the item and new title when the title input changes, without triggering onOpen', () => {
      const onOpen = vi.fn();
      const onTitleEdit = vi.fn();
      const container = document.createElement('div');
      renderPresentations(container, [ITEM], true, { onOpen, onDelete: () => {}, onTitleEdit, onAddClick: () => {} });
      const input = container.querySelector('.presentation-name-input');
      input.value = 'Deck A (renamed)';
      input.dispatchEvent(new Event('change'));
      expect(onTitleEdit).toHaveBeenCalledWith(ITEM, 'Deck A (renamed)');
    });

    it('renders an add-presentation card in edit mode that calls onAddClick', () => {
      const onAddClick = vi.fn();
      const container = document.createElement('div');
      renderPresentations(container, [ITEM], true, { onOpen: () => {}, onDelete: () => {}, onTitleEdit: () => {}, onAddClick });
      container.querySelector('.presentation-add-card').click();
      expect(onAddClick).toHaveBeenCalledTimes(1);
    });

    it('does not render an add-presentation card when not editing', () => {
      const container = document.createElement('div');
      renderPresentations(container, [ITEM], false, { onOpen: () => {}, onDelete: () => {}, onTitleEdit: () => {}, onAddClick: () => {} });
      expect(container.querySelector('.presentation-add-card')).toBeNull();
    });

    it('never interprets stored content as HTML', () => {
      const container = document.createElement('div');
      renderPresentations(container, [{ ...ITEM, title: '<img src=x onerror=alert(1)>' }], false, { onOpen: () => {}, onDelete: () => {}, onTitleEdit: () => {}, onAddClick: () => {} });
      expect(container.querySelector('.presentation-name').textContent).toBe('<img src=x onerror=alert(1)>');
      expect(container.querySelector('img.presentation-thumb')).not.toBeNull(); // the real thumbnail <img> is fine
      expect(container.querySelectorAll('img')).toHaveLength(1); // but no *second*, injected <img> from the title
    });
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd webapp && npx vitest run src/panel/presentations.test.js`
  Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

  Create `webapp/src/panel/presentations.js`:
  ```js
  import { buildEditableInput } from '../admin/editableInput.js';

  export function renderPresentations(container, items, isEditing, { onOpen, onDelete, onTitleEdit, onAddClick }) {
    container.replaceChildren();

    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'presentation-card';
      card.addEventListener('click', () => onOpen(item));

      if (isEditing) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'presentation-delete';
        delBtn.setAttribute('aria-label', `Supprimer ${item.title || 'cette présentation'}`);
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', (e) => { e.stopPropagation(); onDelete(item); });
        card.appendChild(delBtn);
      }

      const thumb = document.createElement('img');
      thumb.className = 'presentation-thumb';
      thumb.src = item.thumb || '';
      thumb.alt = item.title || '';
      card.appendChild(thumb);

      const name = document.createElement('div');
      name.className = 'presentation-name';
      if (isEditing) {
        const input = buildEditableInput(item.title, 'text', 'presentation-name-input', v => onTitleEdit(item, v));
        input.addEventListener('click', e => e.stopPropagation());
        name.appendChild(input);
      } else {
        name.textContent = item.title || 'Sans titre';
      }
      card.appendChild(name);

      container.appendChild(card);
    }

    if (isEditing) {
      const addCard = document.createElement('div');
      addCard.className = 'presentation-add-card';
      addCard.textContent = '+ Ajouter une présentation';
      addCard.addEventListener('click', () => onAddClick());
      container.appendChild(addCard);
    }
  }
  ```

  Create `webapp/src/panel/presentations.css` (dark "raised card" look matching `.panel-company-card`/`.panel-iafintech-card`, not production's light-card style — see the plan's Architecture section for why):
  ```css
  .presentations-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
    margin-top: 10px;
  }

  .presentation-card {
    position: relative;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    font-size: 11px;
  }

  .presentation-thumb {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    display: block;
    background: rgba(255, 255, 255, 0.08);
  }

  .presentation-name {
    padding: 6px 8px;
    color: #fff;
    font-weight: bold;
    line-height: 1.3;
  }

  .presentation-name-input {
    width: 100%;
    box-sizing: border-box;
    background: #0f1730;
    border: 1px solid rgba(224, 181, 61, 0.4);
    border-radius: 4px;
    color: #fff;
    font-size: 11px;
    padding: 2px 4px;
  }

  .presentation-delete {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 1;
    background: rgba(15, 23, 48, 0.85);
    border: none;
    border-radius: 50%;
    width: 18px;
    height: 18px;
    color: #e0736a;
    cursor: pointer;
    font-size: 10px;
  }

  .presentation-add-card {
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 16 / 9;
    border: 1px dashed rgba(224, 181, 61, 0.4);
    border-radius: 8px;
    color: var(--gold-light, #e0b53d);
    cursor: pointer;
    font-size: 11px;
    text-align: center;
    padding: 8px;
  }

  .presentation-add-card:hover {
    background: rgba(201, 151, 31, 0.15);
  }
  ```

  In `webapp/index.html`, add the container right after the existing IA & Fintech section:
  ```html
    <div class="panel-section-label">IA & Fintech</div>
    <div id="panel-ia-fintech"></div>
    <div id="panel-presentations" class="presentations-grid"></div>
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd webapp && npx vitest run src/panel/presentations.test.js`
  Expected: PASS — all 10 tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add webapp/src/panel/presentations.js webapp/src/panel/presentations.css webapp/src/panel/presentations.test.js webapp/index.html
  git commit -m "feat: add presentations grid rendering"
  ```

---
### Task 5: Wire presentations into the app

**Files:**
- Modify: `webapp/src/panel/sidePanel.js`
- Modify: `webapp/src/panel/sidePanel.test.js`
- Modify: `webapp/src/main.js`

**Interfaces:**
- Modifies: `initSidePanel`'s params gain `presentationsEl` and `onPresentationOpen`, `onPresentationDelete`, `onPresentationTitleEdit`, `onPresentationAddClick`
- Modifies: `showRegion`'s options gain `presentations` (rendered unconditionally, same list regardless of active region/week — matches production's own unfiltered `loadPresentations()`)

- [ ] **Step 1: Write the failing test**

  Add to `webapp/src/panel/sidePanel.test.js` (adjust the test setup's `initSidePanel` call to include `presentationsEl` and a fresh `document.createElement('div')` for it, following the exact pattern every other panel element already uses in this file's `beforeEach`):
  ```js
  it('renders the presentations grid via showRegion, independent of the active region', () => {
    panel.showRegion('Asie', { marketItems: [], newsItems: [], presentations: [{ id: 'p1', title: 'Deck A', thumb: '', createdAt: 1 }] });
    expect(presentationsEl.querySelector('.presentation-name').textContent).toBe('Deck A');
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
  Expected: FAIL — `presentationsEl` isn't wired yet.

- [ ] **Step 3: Write the implementation**

  In `webapp/src/panel/sidePanel.js`, add the import:
  ```js
  import { renderPresentations } from './presentations.js';
  ```
  Update `initSidePanel`'s destructured params:
  ```js
  export function initSidePanel({
    labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl, presentationsEl,
    onOpenChart, onIndexEdit, onIndexAdd, onIndexDelete, onIndexColorChange,
    onCompanyEdit, onCompanyAdd, onCompanyDelete, onCompanyBulletAdd, onCompanyBulletEdit, onCompanyBulletDelete,
    onPortfolioEdit, onPortfolioAdd, onPortfolioDelete,
    onNewsEdit, onNewsAdd, onNewsDelete,
    onIaFintechEdit, onIaFintechAdd, onIaFintechDelete,
    onPresentationOpen, onPresentationDelete, onPresentationTitleEdit, onPresentationAddClick,
  }) {
  ```
  Update `showRegion` to also render presentations (add `presentations = []` to its destructured options, and call `renderPresentations` — placed right after the existing `renderIaFintech` call):
  ```js
  function showRegion(regionLabel, { marketItems, newsItems, companyItems = [], portfolioRegionLabel = '', portfolioEntries = [], iaFintechItems = [], presentations = [], isEditing = false }) {
    labelEl.textContent = regionLabel;
    renderIndices(indicesEl, marketItems, isEditing, { onEditItem: onIndexEdit, onDeleteItem: onIndexDelete, onAddItem: onIndexAdd, onColorChange: onIndexColorChange });
    renderNews(newsEl, newsItems, isEditing, { onEditItem: onNewsEdit, onAddItem: onNewsAdd, onDeleteItem: onNewsDelete });
    currentCompanyItems = companyItems;
    currentIsEditing = isEditing;
    selectedCompanyIds = [];
    renderCompanySection();
    portfolioLabelEl.textContent = portfolioRegionLabel;
    currentPortfolioEntries = portfolioEntries;
    renderPortfolioSection();
    renderIaFintech(iaFintechEl, iaFintechItems, isEditing, { onEditItem: onIaFintechEdit, onAddItem: onIaFintechAdd, onDeleteItem: onIaFintechDelete });
    renderPresentations(presentationsEl, presentations, isEditing, {
      onOpen: onPresentationOpen,
      onDelete: onPresentationDelete,
      onTitleEdit: onPresentationTitleEdit,
      onAddClick: onPresentationAddClick,
    });
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
  Expected: PASS.

- [ ] **Step 5: Wire `main.js`**

  Add the import:
  ```js
  import './panel/presentations.css';
  import { renderPresentations } from './panel/presentations.js'; // only if directly needed — likely not, sidePanel.js already imports it; skip this line if unused
  import { openPresentationPdf } from './panel/presentationPdf.js';
  import { getPresentations } from './data/selectors.js'; // add getPresentations to the existing selectors import line instead of a new one
  ```
  (Adjust: add `getPresentations` to the *existing* `from './data/selectors.js'` import line rather than duplicating it — check the current import list first.)

  Add the handlers near the other content handlers:
  ```js
  async function handlePresentationOpen(item) {
    showToast(document.getElementById('admin-toast'), 'Chargement de la présentation...');
    const result = await openPresentationPdf(item.id, client, (done, total) => {
      if (done % 5 === 0 || done === total) {
        showToast(document.getElementById('admin-toast'), `Chargement de la présentation... (${done}/${total})`);
      }
    });
    if (!result.ok) {
      const messages = {
        'not-ready': "⚠️ Cette présentation n'est pas encore complètement intégrée — réessaie dans une minute",
        'chunk-failed': '⚠️ Échec du chargement — vérifie ta connexion et réessaie',
        'reassembly-failed': "⚠️ Erreur lors de l'ouverture du PDF",
      };
      showToast(document.getElementById('admin-toast'), messages[result.reason] || "⚠️ Erreur lors de l'ouverture du PDF");
      return;
    }
    window.open(result.url, '_blank', 'noopener');
  }

  function handlePresentationTitleEdit(item, title) {
    const key = `mkg:presentation:${item.id}`;
    const previous = db[key];
    const updated = { ...previous, title };
    db[key] = updated;
    renderPanelForCurrentSelection();
    client.writeDoc(key, updated).catch(() => {
      db[key] = previous;
      renderPanelForCurrentSelection();
      showToast(document.getElementById('admin-toast'), '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');
    });
  }

  async function handlePresentationDelete(item) {
    if (!window.confirm(`Supprimer la présentation "${item.title || 'Sans titre'}" et son PDF ? Cette action ne peut pas être annulée.`)) return;
    const key = `mkg:presentation:${item.id}`;
    const previous = db[key];
    const chunkKeys = await client.fetchKeysWithPrefix(`mkg:pdfchunk:${item.id}:`);
    delete db[key];
    renderPanelForCurrentSelection();
    try {
      await client.deleteDocsBatch([...chunkKeys, key]);
    } catch {
      db[key] = previous;
      renderPanelForCurrentSelection();
      showToast(document.getElementById('admin-toast'), '⚠️ Suppression en ligne échouée — la présentation a été restaurée');
    }
  }

  function handlePresentationAddClick() {
    showToast(document.getElementById('admin-toast'), "Pour ajouter une présentation, transmets le PDF à la personne qui administre le site — la vignette et l'intégration se font manuellement.");
  }
  ```
  Update the `initSidePanel({...})` call to pass the new element and handlers:
  ```js
  const panel = initSidePanel({
    labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl,
    presentationsEl: document.getElementById('panel-presentations'),
    onOpenChart: item => chartModal.open(item, currentPortfolioEntriesForChart),
    /* ...existing handlers unchanged... */
    onPresentationOpen: handlePresentationOpen,
    onPresentationDelete: handlePresentationDelete,
    onPresentationTitleEdit: handlePresentationTitleEdit,
    onPresentationAddClick: handlePresentationAddClick,
  });
  ```
  Update `renderPanelForCurrentSelection`'s call to `panel.showRegion(...)` to pass `presentations: getPresentations(db)` alongside the existing options.

- [ ] **Step 6: Run the full automated test suite**

  Run: `cd webapp && npx vitest run`
  Expected: PASS — baseline + all new tests from Tasks 1-5, 0 failures.

- [ ] **Step 7: Verify the production build still works**

  Run: `cd webapp && npm run build`
  Expected: build succeeds with no errors.

- [ ] **Step 8: Commit**

  ```bash
  git add webapp/src/main.js webapp/src/panel/sidePanel.js webapp/src/panel/sidePanel.test.js
  git commit -m "feat: wire presentations open/delete/rename into the app"
  ```

---
### Task 6: Manual verification against live production Firestore

**No files changed in this task — verification only.**

**Unlike every prior admin-edit plan, there's no in-app way to create a test presentation** (matches production — adding one is a manual, out-of-band process). Seed one directly via the browser console instead:

- [ ] Run `cd webapp && npm run dev`, open the printed local URL in a browser, open DevTools console.
- [ ] In the console, seed an obviously-fake test presentation with a tiny 1-chunk fake PDF payload (this does **not** need to be a real, valid PDF for testing display/rename/delete — only for testing that "open" gracefully handles reassembly, which the automated tests in Task 3 already cover with a fake payload; keep this manual step focused on the parts only a real browser+Firestore round-trip can verify):
  ```js
  const mod = await import('/src/data/firestoreClient.js');
  const client = mod.createFirestoreClient();
  const id = 'test-presentation-' + Date.now();
  await client.writeDoc(`mkg:presentation:${id}`, { id, title: 'TEST — À IGNORER — présentation', thumb: '', createdAt: Date.now() });
  await client.writeDoc(`mkg:pdfchunk:${id}:0`, JSON.stringify(btoa('%PDF-1.4 fake test content')));
  ```
- [ ] Reload the page. Confirm the "TEST — À IGNORER — présentation" card appears in the presentations grid, in every region (not week/region-scoped — confirms `getPresentations` is truly unfiltered as designed).
- [ ] Unlock edit mode. Confirm a delete button and an editable title input appear on the test card, and a dashed "+ Ajouter une présentation" card appears.
- [ ] Click the "+ Ajouter une présentation" card: confirm the informational toast appears (no upload dialog — matches production's real behavior).
- [ ] Click the test card (not the delete button): confirm it attempts to open, shows a loading toast, and either opens a new tab with a (garbage, since the payload is fake) PDF blob, or shows a reasonable error toast — either is acceptable here, this step's real purpose is confirming the fetch/chunk-key-listing/open flow runs end-to-end without a JS exception, not validating real PDF content.
- [ ] Rename the test card's title inline; confirm it commits and persists across a hard reload.
- [ ] Delete the test card (confirm dialog appears — verify cancel is a true no-op first, then confirm-accept deletes); confirm both the `mkg:presentation:{id}` doc **and** its `mkg:pdfchunk:{id}:0` chunk are gone after a hard reload (check via the console: `await client.fetchKeysWithPrefix('mkg:pdfchunk:${id}:')` should return `[]`, and the presentation card should no longer render).
- [ ] Spot-check that the regular (non-presentation) IA & Fintech items in the same section are unaffected throughout.
- [ ] No console errors during any of the above (aside from any deliberately-induced ones from the fake PDF payload, which should be caught and toasted, not thrown).
- [ ] Confirm `cd webapp && npx vitest run` is still fully green after the manual session.

---
### End of Plan

At this point the Présentations sub-feature is fully ported to `webapp/`, matching production's actual real-world capability (display, open, rename, delete — no upload UI, since production doesn't have one either):
- `firestoreClient.js` now routes every read/write to the correct collection by key prefix, unlocking the cross-collection atomic delete this feature needs
- Chunk fetch/retry/reassembly logic is fully unit-tested (the genuinely error-prone part), the DOM-touching orchestration is manually verified (matching this codebase's established main.js-is-never-unit-tested convention)
- All automated tests pass; production build still works

Still pending, as an explicitly separate future plan if ever wanted: an in-app upload UI (client-side PDF-to-thumbnail generation + chunking-on-write) — genuinely out of scope here, matching production's own choice not to build one either.
