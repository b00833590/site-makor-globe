# Dynamic import de html2pdf.js — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop bundling `html2pdf.js` (~948KB gzip transitive via jsPDF/html2canvas — noted as a future dynamic-`import()` candidate in phase 13's own memory) into the main JS chunk. Load it lazily, only when a user actually clicks one of the two PDF export buttons.

**Architecture:**
- `webapp/src/panel/pdfExport.js`: remove the top-level `import html2pdf from 'html2pdf.js';`. Inside `exportElementAsPDF`, when no `html2pdfFn` override is passed (the real, non-test call path from `main.js`), resolve it via `const fn = html2pdfFn || (await import('html2pdf.js')).default;`. This makes Vite code-split `html2pdf.js` (and its jsPDF/html2canvas dependencies) into its own chunk, fetched on first click of either export button, not on initial page load.
- No change needed to `main.js` — both `exportPdfBtn` and `exportPortfolioPdfBtn` handlers already call `exportElementAsPDF(element, filename)` without a third argument, so they automatically get the new lazy-loading path.
- No change needed to any test that already passes an explicit `html2pdfFn` mock (both existing describe blocks in `pdfExport.test.js` do this for every test) — only a new test for the *default*, no-override path needs to mock the real `'html2pdf.js'` module.

## Global Constraints

- **No Firestore interaction, no admin-edit-mode changes** — this is a pure bundling/loading optimization of an already-shipped, read-only export feature. No production-database safety protocol needed, and no live-Firestore manual verification required (unlike the other two plans running alongside this one).
- Do not touch `webapp/src/main.js`, `webapp/index.html`, or any file other than `webapp/src/panel/pdfExport.js` and `webapp/src/panel/pdfExport.test.js`.
- Do not change the existing exported signatures of `buildExportFilename`/`buildPortfolioExportFilename` — only `exportElementAsPDF`'s internal resolution of `html2pdfFn` changes, its external call signature `(element, filename, html2pdfFn?)` stays identical.

---
### Task 1: Make the html2pdf.js import lazy

**Files:**
- Modify: `webapp/src/panel/pdfExport.js`
- Modify: `webapp/src/panel/pdfExport.test.js`

**Interfaces:**
- No signature change to any exported function.

- [ ] **Step 1: Write the failing test**

  Add to `webapp/src/panel/pdfExport.test.js`, inside (or right after) the existing `describe('exportElementAsPDF', ...)` block. This needs a module-level `vi.mock` (hoisted by vitest, so it must be a top-level statement in the file, not nested inside a `describe`/`it`) — add it near the top of the file, right after the existing imports:
  ```js
  vi.mock('html2pdf.js', () => ({ default: vi.fn() }));
  ```
  Then add the new test inside `describe('exportElementAsPDF', ...)`:
  ```js
  it('dynamically imports the real html2pdf.js module when no override function is given', async () => {
    const html2pdfModule = await import('html2pdf.js');
    const save = vi.fn().mockResolvedValue(undefined);
    const from = vi.fn(() => ({ save }));
    const set = vi.fn(() => ({ from }));
    html2pdfModule.default.mockReturnValue({ set });

    const element = document.createElement('div');
    await exportElementAsPDF(element, 'test.pdf');

    expect(html2pdfModule.default).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ filename: 'test.pdf' }));
    expect(save).toHaveBeenCalledTimes(1);
  });
  ```
  (The two existing tests in this describe block are untouched — they already pass an explicit `html2pdfFn` mock as the third argument, so they never exercise the dynamic-import path and are unaffected by the top-level `vi.mock`.)

- [ ] **Step 2: Run the tests to verify the new one fails**

  Run: `cd webapp && npx vitest run src/panel/pdfExport.test.js`
  Expected: the two existing tests still PASS; the new test FAILS — `exportElementAsPDF` still uses the static top-level `html2pdf` import, so the mocked module's `default` function is never called (or fails differently) since the real code path doesn't yet call `import('html2pdf.js')` internally.

- [ ] **Step 3: Write the implementation**

  In `webapp/src/panel/pdfExport.js`, remove the top-level import:
  ```js
  import html2pdf from 'html2pdf.js';
  ```
  and change `exportElementAsPDF` from:
  ```js
  export async function exportElementAsPDF(element, filename, html2pdfFn = html2pdf) {
    await html2pdfFn()
      .set({ ... })
      .from(element)
      .save();
  }
  ```
  to:
  ```js
  export async function exportElementAsPDF(element, filename, html2pdfFn) {
    const fn = html2pdfFn || (await import('html2pdf.js')).default;
    await fn()
      .set({
        margin: 8,
        filename,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(element)
      .save();
  }
  ```
  (Only the `html2pdfFn` resolution line and the removed top-level import are new — the `.set({...})` config object is copied verbatim, unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd webapp && npx vitest run src/panel/pdfExport.test.js`
  Expected: PASS — all tests pass (existing 9 + 1 new = 10).

- [ ] **Step 5: Run the full automated test suite**

  Run: `cd webapp && npx vitest run`
  Expected: PASS — all tests pass (270 existing + 1 net-new = 271), 0 failures.

- [ ] **Step 6: Verify the production build and confirm the chunk split actually happened**

  Run: `cd webapp && npm run build`
  Expected: build succeeds. Check the build output listing: before this change, `dist/assets/index-*.js` was a single ~3.3MB (949KB gzip) chunk containing everything, including html2pdf/jsPDF/html2canvas. After this change, there should be **two** JS chunks — a smaller main `index-*.js` and a separate chunk for the html2pdf/jsPDF/html2canvas code (its exact name is Vite-generated, matching `html2pdf` or one of its dependencies in the filename). Note both chunk sizes in the commit message or a manual verification note — this is the actual proof the optimization worked, not just "build succeeds."

- [ ] **Step 7: Commit**

  ```bash
  git add webapp/src/panel/pdfExport.js webapp/src/panel/pdfExport.test.js
  git commit -m "perf: dynamically import html2pdf.js to shrink the initial bundle"
  ```

---
### End of Plan

At this point `html2pdf.js` (and its jsPDF/html2canvas dependencies) is no longer part of the initial page-load bundle — it's fetched lazily, only when a user clicks either PDF export button. No behavior change for users who do export (same export flow, same generated PDFs, just a brief extra network fetch the very first time); a meaningfully smaller initial bundle for users who never export. All automated tests pass; production build still works and demonstrably produces a separate chunk.
