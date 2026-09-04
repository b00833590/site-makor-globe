# Export PDF (lecture seule) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "📄 Exporter en PDF" button that downloads the currently-displayed side panel (indices, news, companies, and portfolio for the active region/week) as a PDF. This is a completely different kind of feature from every plan since the portfolio-live-refresh phase: it's **not part of edit mode** — available at all times, to any visitor, since it's purely a client-side rendering action with **zero Firestore reads or writes beyond what's already loaded**. Lowest-risk feature shipped in a while: no database interaction at all, worst case is a broken/empty PDF download, never data loss.

**Why this differs architecturally from production's version:** production's `exportCurrentPageAsPDF` (in the root `index.html`) does a lot of temporary DOM surgery — hiding edit-mode chrome, and specifically rebuilding CSS Grid layouts into stacked flex rows because `html2pdf`'s page-break detection can't handle multi-column grids. `webapp/`'s side panel is already a single-column vertical list (no CSS Grid to fight with), so none of that grid-rebuilding complexity applies here — this plan is meaningfully simpler than its production counterpart, not a straight port of it. The filename convention (`Makor_{Region}_{Week}.pdf`) is kept for consistency.

**Architecture:**
- `html2pdf.js` (the same library production already uses, via CDN there — here installed as an npm dependency and bundled by Vite, matching this project's convention) is added as a dependency.
- `webapp/src/panel/pdfExport.js` holds two pure/injectable pieces, both genuinely unit-testable: `buildExportFilename(regionLabel, weekLabel)` (pure string sanitization, no DOM/network) and `exportElementAsPDF(element, filename, html2pdfFn?)` — a thin wrapper around `html2pdf()`'s chainable API, with `html2pdfFn` defaulting to the real `html2pdf` import but overridable in tests (same injectable-dependency pattern already used throughout this codebase for `fetch`, not a new convention). Because `html2pdf()`'s entire chainable API surface (`.set().from().save()`) can be mocked directly (unlike wrapping a complex SDK like Firestore's), this wrapper gets real test coverage of its call shape, not just a "no direct test, matches precedent" pass.
- A `.pdf-export` CSS class, applied to the side panel only for the duration of the export (added then removed, mirroring production's temporary-class approach, just without the grid-rebuilding step), forces a clean, printable light-on-white appearance and hides interactive-only chrome (delete/add buttons, the ⚖ comparator toggle, the week-admin panel) that has no place in an exported document.
- `main.js` gains a small handler wiring the export button to `exportElementAsPDF(document.querySelector('.side-panel'), buildExportFilename(...), )`, using the current region label and active week's label for the filename.

**Tech Stack:** Vanilla JS + Vite, Vitest with jsdom. New dependency: `html2pdf.js`.

## Global Constraints

- **Zero Firestore interaction.** This feature only ever reads what's already in memory (`db`, already loaded) and renders existing DOM to a file — no `writeDoc`/`deleteDocByKey`/`deleteDocsBatch` call anywhere in this plan, no manual-verification-against-production-Firestore discipline needed (unlike every admin-edit plan). Manual verification here is about visual/file-output correctness, not data safety.
- The export button is available regardless of edit-mode state (unlike every button added in the last several plans, which only exist when `isEditing` is true). If a user happens to trigger an export while in edit mode, the PDF will show whatever's currently in the DOM (including input fields) — this is an accepted, unhandled edge case for this first version, not a bug to guard against here (YAGNI — the primary use case is exporting the read-only view to share/print).
- Do not add the production-style per-region portfolio PDF export button (the `📄` icon next to each portfolio region in production) — that's a separate, smaller follow-up if wanted later. This plan only exports the whole currently-visible side panel.
- Do not modify `webapp/src/globe/*`, `webapp/src/data/*`, `webapp/src/admin/*`, `webapp/src/timeline/*`, or any other panel-rendering file (`sidePanel.js`, `companyList.js`, `portfolioTable.js`) — this plan only adds new files plus a small, isolated wiring change in `main.js`/`index.html`.

---

### Task 1: PDF export utilities

**Files:**
- Create: `webapp/src/panel/pdfExport.js`
- Create: `webapp/src/panel/pdfExport.test.js`
- Modify: `webapp/package.json` (add `html2pdf.js` dependency)

**Interfaces:**
- Produces: `buildExportFilename(regionLabel, weekLabel): string` and `exportElementAsPDF(element, filename, html2pdfFn?): Promise<void>`. Used by Task 3's `main.js`.

- [ ] **Step 1: Add the dependency**

Run: `cd webapp && npm install html2pdf.js`
Expected: `webapp/package.json`'s `dependencies` gains `"html2pdf.js": "^0.14.0"` (or whatever the latest 0.14.x resolves to), `package-lock.json` updates accordingly.

- [ ] **Step 2: Write the failing tests**

File: `webapp/src/panel/pdfExport.test.js`
```js
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { buildExportFilename, exportElementAsPDF } from './pdfExport.js';

describe('buildExportFilename', () => {
  it('builds a filename from the region and week labels', () => {
    expect(buildExportFilename('Asie', 'Semaine 13-17 JUILLET')).toBe('Makor_Asie_Semaine_13_17_JUILLET.pdf');
  });

  it('replaces spaces and punctuation with underscores', () => {
    expect(buildExportFilename('BRICS + UK', 'Semaine du 23/03')).toBe('Makor_BRICS_UK_Semaine_du_23_03.pdf');
  });

  it('collapses consecutive non-alphanumeric characters into a single underscore', () => {
    expect(buildExportFilename('A---B', 'C   D')).toBe('Makor_A_B_C_D.pdf');
  });

  it('trims leading/trailing underscores produced by non-alphanumeric-only labels', () => {
    expect(buildExportFilename('É', 'Test')).toBe('Makor__Test.pdf');
  });

  it('falls back to empty segments when labels are missing, still producing a valid filename', () => {
    expect(buildExportFilename('', '')).toBe('Makor__.pdf');
    expect(buildExportFilename(undefined, undefined)).toBe('Makor__.pdf');
  });
});

describe('exportElementAsPDF', () => {
  it('configures html2pdf with the given filename and calls save() on the given element', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const from = vi.fn(() => ({ save }));
    const set = vi.fn(() => ({ from }));
    const html2pdfFn = vi.fn(() => ({ set }));
    const element = document.createElement('div');

    await exportElementAsPDF(element, 'test.pdf', html2pdfFn);

    expect(html2pdfFn).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ filename: 'test.pdf' }));
    expect(from).toHaveBeenCalledWith(element);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/pdfExport.test.js`
Expected: FAIL — `Cannot find module './pdfExport.js'`.

- [ ] **Step 4: Write the implementation**

File: `webapp/src/panel/pdfExport.js`
```js
import html2pdf from 'html2pdf.js';

function sanitizeForFilename(value) {
  return (value || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function buildExportFilename(regionLabel, weekLabel) {
  return `Makor_${sanitizeForFilename(regionLabel)}_${sanitizeForFilename(weekLabel)}.pdf`;
}

export async function exportElementAsPDF(element, filename, html2pdfFn = html2pdf) {
  await html2pdfFn()
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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/pdfExport.test.js`
Expected: PASS — 6 tests passed.

- [ ] **Step 6: Commit**

```bash
git add webapp/package.json webapp/package-lock.json webapp/src/panel/pdfExport.js webapp/src/panel/pdfExport.test.js
git commit -m "feat: add PDF export utilities"
```

---

### Task 2: Export button and print styling

**Files:**
- Modify: `webapp/index.html`
- Modify: `webapp/src/styles/globe.css`

**Interfaces:**
- Produces: DOM elements and CSS consumed by Task 3's `main.js` wiring.

- [ ] **Step 1: Add the button**

Modify `webapp/index.html` — add this as a sibling of `#edit-toggle-btn`:
```html
  <button id="export-pdf-btn" class="export-pdf-btn" type="button">📄 Exporter en PDF</button>
```

- [ ] **Step 2: Add the styles**

Add to `webapp/src/styles/globe.css` (append, don't touch existing rules):
```css
.export-pdf-btn {
  position: fixed;
  top: 16px;
  right: 160px;
  z-index: 15;
  background: rgba(15, 23, 48, 0.9);
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 6px;
  color: var(--gold-light, #e0b53d);
  cursor: pointer;
  font-size: 12px;
  padding: 8px 14px;
}

.export-pdf-btn:hover {
  background: rgba(201, 151, 31, 0.2);
}

/* Applied temporarily to .side-panel during PDF generation only. */
.side-panel.pdf-export {
  background: #ffffff;
  color: #111111;
}

.side-panel.pdf-export .panel-region-label,
.side-panel.pdf-export .panel-section-label,
.side-panel.pdf-export .panel-index-name,
.side-panel.pdf-export .panel-company-name,
.side-panel.pdf-export .panel-news-block h3 {
  color: #0f1730;
}

.side-panel.pdf-export .panel-index-delete,
.side-panel.pdf-export .panel-index-add,
.side-panel.pdf-export .panel-company-delete,
.side-panel.pdf-export .panel-company-add,
.side-panel.pdf-export .panel-company-bullet-delete,
.side-panel.pdf-export .panel-company-bullet-add,
.side-panel.pdf-export .portfolio-delete,
.side-panel.pdf-export .portfolio-add,
.side-panel.pdf-export .panel-news-delete,
.side-panel.pdf-export .panel-news-add,
.side-panel.pdf-export .panel-compare-toggle,
.side-panel.pdf-export .panel-chart-toggle {
  display: none !important;
}
```

- [ ] **Step 3: No automated test for this step**

Markup/CSS-only change with no behavior until Task 3 wires the button. Verified visually as part of Task 3's manual verification.

- [ ] **Step 4: Commit**

```bash
git add webapp/index.html webapp/src/styles/globe.css
git commit -m "feat: add PDF export button and print styling"
```

---

### Task 3: Wire PDF export into the app and verify

**Files:**
- Modify: `webapp/src/main.js`

**Interfaces:**
- Consumes: `buildExportFilename`/`exportElementAsPDF` (Task 1), the button/CSS from Task 2.
- Produces: the running application. Final deliverable of this plan.

- [ ] **Step 1: Wire the handler into `main.js`**

Add the import:
```js
import { buildExportFilename, exportElementAsPDF } from './panel/pdfExport.js';
```

Add the handler and its wiring (near the other top-level button wiring, e.g. alongside `editToggleBtn`'s listener):
```js
const exportPdfBtn = document.getElementById('export-pdf-btn');

exportPdfBtn.addEventListener('click', async () => {
  const sidePanelEl = document.querySelector('.side-panel');
  const region = REGIONS.find(r => r.id === activeRegionId);
  const activeWeek = getWeeks(db).find(w => w.id === activeWeekId);
  const filename = buildExportFilename(region ? region.label : '', activeWeek ? activeWeek.label : '');

  exportPdfBtn.disabled = true;
  exportPdfBtn.textContent = '⏳ Génération...';
  sidePanelEl.classList.add('pdf-export');
  try {
    await exportElementAsPDF(sidePanelEl, filename);
  } catch (error) {
    console.error('PDF export failed', error);
  } finally {
    sidePanelEl.classList.remove('pdf-export');
    exportPdfBtn.disabled = false;
    exportPdfBtn.textContent = '📄 Exporter en PDF';
  }
});
```
(No toast on failure here — unlike every Firestore-writing handler in the admin-edit plans, this isn't a data-integrity concern; a `console.error` is enough for a purely client-side rendering failure. No toast on success either — the browser's own download indicator already confirms it.)

- [ ] **Step 2: Run the full automated test suite**

Run: `cd webapp && npm test`
Expected: PASS — all tests pass, 0 failures. (No new tests in this task — `main.js` has no unit tests, matching every earlier plan's precedent.)

- [ ] **Step 3: Manual browser verification**

Run: `cd webapp && npm run dev`, then open the printed local URL in a browser.

Checklist:
- [ ] The "📄 Exporter en PDF" button is visible at all times, including before unlocking edit mode.
- [ ] Click it on a region with real content. The button briefly shows "⏳ Génération..." and is disabled, then a PDF file downloads (filename like `Makor_Asie_Semaine_13-17_JUILLET.pdf` — check it matches the active region/week).
- [ ] Open the downloaded PDF. Confirm it's readable: white background, dark text, no delete/add buttons or comparator/chart toggle icons visible, indices/news/companies/portfolio content all present and legible, no obviously broken layout (text cut off mid-line, overlapping elements).
- [ ] Switch to a different region and export again — confirm the new PDF reflects the new region's content and filename.
- [ ] Confirm the side panel visually returns to its normal dark theme immediately after the export completes (the temporary `.pdf-export` class is removed).
- [ ] No console errors during any of the above (aside from any library-internal warnings from `html2canvas`, which are common and not necessarily a problem — only flag genuine application errors).

- [ ] **Step 4: Verify the production build still works**

Run: `cd webapp && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/main.js
git commit -m "feat: wire PDF export of the current side panel"
```

---

## End of Plan

At this point visitors can export the currently-displayed region/week as a PDF at any time, with no Firestore interaction. Still pending, as separate later plans: per-region portfolio-only PDF export (production has this, this plan doesn't); the IA & Fintech panel; week duplication; portfolio-region management; relabeling company stat labels; the "annuler tout" undo/session-snapshot system; color pickers; a final visual-theme + mobile-fallback pass; and the eventual production cutover.
