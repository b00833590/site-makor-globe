# Export PDF portefeuille par région — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small "📄" icon button next to the portfolio region label in the side panel that exports **only that region's portfolio table** (not the full side panel) as its own PDF — porting production's existing `exportPortfolioRegionAsPDF` (root `index.html:1178`) to `webapp/`.

**Why this is a real gap, not a re-implementation of what already exists:** `webapp/` already has a PDF export button (phase 13, `webapp/src/panel/pdfExport.js`), but it captures the **entire** `.side-panel` (indices + news + companies + portfolio) for whichever region is currently active on the globe. Production's per-region portfolio export is narrower and serves a different use case — a clean, portfolio-only PDF for one region, e.g. to send just that table without the rest of the weekly content. `webapp/` has no equivalent today.

**How production does it (read from the actual code, not assumed):** Production shows **all 4 portfolio regions on one page simultaneously** (`.portfolio-region[data-region-id]` blocks), so `exportPortfolioRegionAsPDF(regionId)` has to *hide* every other top-level block and every other region before capturing, then restore visibility afterward — documented in its own code comment as a deliberate fix for an earlier bug where capturing a freshly-cloned, off-tree copy of the region raced the browser's layout/paint cycle and produced a blank PDF. `webapp/` does not have this problem: its globe navigation means only **one** region's portfolio content ever exists in the DOM at a time, so no other-region hiding is needed at all — we just point `html2pdf` at a narrower element.

**The real pitfall to port correctly (not from production, but from `webapp/`'s own history):** phase 13's PDF export hit a genuine bug — `.side-panel` is `position:fixed` with its own internal `overflow-y:auto` scroll, and `html2canvas` failed to capture its true content height while it stayed in that state (captured height was `0px`; jsdom's tests couldn't catch this since jsdom has no real layout engine). The fix was temporarily taking `.side-panel` out of fixed positioning during capture via a `.pdf-export` class, then restoring it after. **This plan reuses that exact same class toggle** for the portfolio-only export too — even though we're capturing a narrower child element (`#panel-portfolio-section`), that child still lives inside the same fixed/scroll-clipped ancestor, so the same class of clipping risk applies to it. `html2pdf`'s `.from(element)` only renders that element's own subtree into the PDF regardless of what else is present in the (temporarily un-fixed) document at that moment, so no region-hiding is needed — just the existing un-fixing.

**Architecture:**
- `webapp/index.html`: wrap the existing `#panel-portfolio-region-label` + `#panel-portfolio` pair in a new `#panel-portfolio-section` container (the PDF capture target), and add the new `#export-portfolio-pdf-btn` icon button in a small flex header row alongside the region label.
- `webapp/src/panel/pdfExport.js`: add `buildPortfolioExportFilename(regionLabel, weekLabel)`, mirroring production's `Makor_Portefeuille_{region}_{week}.pdf` naming (existing `buildExportFilename` stays `Makor_{region}_{week}.pdf`, used by the full-panel export — the two must stay visually distinguishable as separate downloaded files for the same region/week). Reuses the existing, already-tested `exportElementAsPDF` unchanged.
- `webapp/src/main.js`: new click handler on `#export-portfolio-pdf-btn`, structurally identical to the existing `exportPdfBtn` handler (same disable-while-generating, same `.pdf-export` class toggle on `.side-panel`, same try/catch/finally), but targets `#panel-portfolio-section` instead of `.side-panel`, and uses the **portfolio-specific** region label (`getPortfolioRegion(db, activeRegionId)`, already imported and already used elsewhere in `main.js`) rather than the globe region label — matching what's actually rendered in `portfolioLabelEl` and what production names its own per-region export after.
- CSS: extend the existing `.side-panel.pdf-export` color-inversion and control-hiding rules in `webapp/src/styles/globe.css` to also cover `.portfolio-region-label` (needs the dark-on-white treatment like every other heading) and `.portfolio-export-btn` (must not appear inside its own or the full-panel's captured PDF — it's UI chrome, not content).

**Tech Stack:** Same as prior plans — vanilla JS + Vite, Vitest with jsdom for the parts that are actually testable (pure filename logic). The PDF capture path itself (`html2canvas`/layout) is not testable under jsdom — same precedent as the phase 13 and phase 6-14 `main.js` handlers — verified manually instead.

## Global Constraints

- **No Firestore interaction of any kind** — this feature only reads already-loaded in-memory `db` state and renders a PDF client-side, exactly like the existing full-panel export (phase 13). **No production-database safety protocol needed** for this plan (unlike every admin-edit plan since phase 7).
- Do not modify `webapp/src/data/*` (no data-shape changes needed — `getPortfolioRegion` already exists and is already imported in `main.js`), `webapp/src/globe/*`, `webapp/src/admin/*`, `webapp/src/timeline/*`.
- Do not modify the existing `buildExportFilename`/`exportElementAsPDF` functions or their tests — only add alongside them.
- Do not change `sidePanel.js` or `sidePanel.test.js` — `initSidePanel` receives `portfolioLabelEl`/`portfolioEl` as plain element references passed in from `main.js`; it has no knowledge of their real parent DOM structure, so wrapping them in a new container in `index.html` requires zero changes there (confirmed by reading `sidePanel.test.js`, which constructs these as detached elements, not queried from a real page).
- This plan touches only: `webapp/index.html`, `webapp/src/panel/pdfExport.js`/`.test.js`, `webapp/src/panel/portfolioTable.css`, `webapp/src/styles/globe.css`, `webapp/src/main.js`.

---
### Task 1: Add the portfolio-specific filename builder

**Files:**
- Modify: `webapp/src/panel/pdfExport.js`
- Modify: `webapp/src/panel/pdfExport.test.js`

**Interfaces:**
- Adds: `buildPortfolioExportFilename(regionLabel: string, weekLabel: string): string`

- [ ] **Step 1: Write the failing tests**

  Add to `webapp/src/panel/pdfExport.test.js` (mirrors the existing `buildExportFilename` describe block exactly, since it's the same sanitization logic with a different template):
  ```js
  describe('buildPortfolioExportFilename', () => {
    it('builds a filename from the region and week labels, prefixed with Portefeuille', () => {
      expect(buildPortfolioExportFilename('Europe', 'Semaine 13-17 JUILLET')).toBe('Makor_Portefeuille_Europe_Semaine_13_17_JUILLET.pdf');
    });

    it('strips accents from real region/week labels without mangling them', () => {
      expect(buildPortfolioExportFilename('Amérique du Nord', 'Semaine du 1er DÉCEMBRE')).toBe('Makor_Portefeuille_Amerique_du_Nord_Semaine_du_1er_DECEMBRE.pdf');
    });

    it('falls back to empty segments when labels are missing, still producing a valid filename', () => {
      expect(buildPortfolioExportFilename('', '')).toBe('Makor_Portefeuille__.pdf');
      expect(buildPortfolioExportFilename(undefined, undefined)).toBe('Makor_Portefeuille__.pdf');
    });
  });
  ```
  Update the import line at the top of the file:
  ```js
  import { buildExportFilename, exportElementAsPDF, buildPortfolioExportFilename } from './pdfExport.js';
  ```

- [ ] **Step 2: Run the tests to verify they fail**

  Run: `cd webapp && npx vitest run src/panel/pdfExport.test.js`
  Expected: FAIL — `buildPortfolioExportFilename` is not exported yet.

- [ ] **Step 3: Write the implementation**

  Add to `webapp/src/panel/pdfExport.js`, right after `buildExportFilename`:
  ```js
  export function buildPortfolioExportFilename(regionLabel, weekLabel) {
    return `Makor_Portefeuille_${sanitizeForFilename(regionLabel)}_${sanitizeForFilename(weekLabel)}.pdf`;
  }
  ```

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `cd webapp && npx vitest run src/panel/pdfExport.test.js`
  Expected: PASS — all tests pass (existing 6 + 3 new).

- [ ] **Step 5: Commit**

  ```bash
  git add webapp/src/panel/pdfExport.js webapp/src/panel/pdfExport.test.js
  git commit -m "feat: add portfolio-specific PDF filename builder"
  ```

---
### Task 2: Wrap the portfolio section and add the export icon button

**Files:**
- Modify: `webapp/index.html`
- Modify: `webapp/src/panel/portfolioTable.css`

**No tests in this task** — pure markup/CSS, nothing here is unit-testable under jsdom (no test file currently covers `index.html`'s static markup, and none of the existing plans have added one for equivalent changes, e.g. phase 11/12's week-admin markup, phase 13's export button markup).

- [ ] **Step 1: Update `webapp/index.html`**

  Replace:
  ```html
    <div class="panel-section-label">Suivi de portefeuille</div>
    <div id="panel-portfolio-region-label" class="portfolio-region-label"></div>
    <div id="panel-portfolio"></div>
  ```
  with:
  ```html
    <div class="panel-section-label">Suivi de portefeuille</div>
    <div id="panel-portfolio-section" class="panel-portfolio-section">
      <div class="portfolio-region-header">
        <div id="panel-portfolio-region-label" class="portfolio-region-label"></div>
        <button id="export-portfolio-pdf-btn" class="portfolio-export-btn" type="button" aria-label="Exporter le portefeuille de cette région en PDF">📄</button>
      </div>
      <div id="panel-portfolio"></div>
    </div>
  ```
  (`#panel-portfolio-region-label` and `#panel-portfolio` keep their existing ids unchanged — `main.js`'s `initSidePanel({ portfolioLabelEl: document.getElementById('panel-portfolio-region-label'), portfolioEl: document.getElementById('panel-portfolio'), ... })` call needs no change.)

- [ ] **Step 2: Update `webapp/src/panel/portfolioTable.css`**

  Replace the existing rule:
  ```css
  .portfolio-region-label {
    color: var(--gold-light, #e0b53d);
    font-size: 11px;
    font-weight: bold;
    margin-top: 4px;
  }
  ```
  with (the `margin-top: 4px` moves from the label itself to the new header row that now wraps it):
  ```css
  .portfolio-region-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }

  .portfolio-region-label {
    color: var(--gold-light, #e0b53d);
    font-size: 11px;
    font-weight: bold;
  }

  .portfolio-export-btn {
    background: transparent;
    border: 1px solid rgba(224, 181, 61, 0.4);
    border-radius: 4px;
    color: var(--gold-light, #e0b53d);
    cursor: pointer;
    font-size: 13px;
    line-height: 1;
    padding: 3px 6px;
  }

  .portfolio-export-btn:hover {
    background: rgba(201, 151, 31, 0.2);
  }

  .portfolio-export-btn:disabled {
    cursor: default;
    opacity: 0.6;
  }
  ```

- [ ] **Step 3: Manually sanity-check no other rule assumed a bare `.portfolio-region-label` as a direct child of `.side-panel`**

  Already confirmed during planning: `grep -rn "side-panel >\|:last-child\|:first-child\|:nth-child" src/panel/*.css src/styles/*.css` returns nothing — no such structural selector exists, so this nesting change is safe. No action needed, just don't skip re-checking if this plan is executed much later and the CSS has since changed.

- [ ] **Step 4: Commit**

  ```bash
  git add webapp/index.html webapp/src/panel/portfolioTable.css
  git commit -m "feat: add portfolio section wrapper and export icon button markup"
  ```

---
### Task 3: Extend PDF-export CSS overrides to the new elements

**Files:**
- Modify: `webapp/src/styles/globe.css`

**No tests in this task** — same reasoning as Task 2 (PDF capture styling is not unit-testable, verified manually in Task 5).

- [ ] **Step 1: Update the color-inversion selector list**

  In `webapp/src/styles/globe.css`, find:
  ```css
  .side-panel.pdf-export .panel-region-label,
  .side-panel.pdf-export .panel-section-label,
  .side-panel.pdf-export .panel-index-name,
  .side-panel.pdf-export .panel-company-name,
  .side-panel.pdf-export .panel-news-block h3,
  .side-panel.pdf-export .panel-iafintech-card h3 {
    color: #0f1730;
  }
  ```
  Add `.side-panel.pdf-export .portfolio-region-label` to that selector list (it's a heading-like label, same treatment as every other section heading during capture):
  ```css
  .side-panel.pdf-export .panel-region-label,
  .side-panel.pdf-export .panel-section-label,
  .side-panel.pdf-export .panel-index-name,
  .side-panel.pdf-export .panel-company-name,
  .side-panel.pdf-export .panel-news-block h3,
  .side-panel.pdf-export .panel-iafintech-card h3,
  .side-panel.pdf-export .portfolio-region-label {
    color: #0f1730;
  }
  ```

- [ ] **Step 2: Update the hidden-controls selector list**

  Find:
  ```css
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
  .side-panel.pdf-export .panel-iafintech-delete,
  .side-panel.pdf-export .panel-iafintech-add,
  .side-panel.pdf-export .panel-compare-toggle,
  .side-panel.pdf-export .panel-chart-toggle {
    display: none !important;
  }
  ```
  Add `.side-panel.pdf-export .portfolio-export-btn` (the new icon button is UI chrome, not content — must not appear in either the portfolio-only PDF or, since it now lives inside `.side-panel`, the full-panel PDF either):
  ```css
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
  .side-panel.pdf-export .panel-iafintech-delete,
  .side-panel.pdf-export .panel-iafintech-add,
  .side-panel.pdf-export .panel-compare-toggle,
  .side-panel.pdf-export .panel-chart-toggle,
  .side-panel.pdf-export .portfolio-export-btn {
    display: none !important;
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add webapp/src/styles/globe.css
  git commit -m "style: hide portfolio export button and recolor its label during PDF capture"
  ```

---
### Task 4: Wire the export handler in main.js

**Files:**
- Modify: `webapp/src/main.js`

**No new unit test** — matches the existing `exportPdfBtn` handler, which also has none (DOM/`html2canvas` capture behavior isn't meaningfully testable under jsdom; see phase 13's own note that jsdom's lack of a real layout engine is exactly why its two real bugs were invisible to both the automated suite and code review). Covered by Task 5's manual verification instead.

- [ ] **Step 1: Update the pdfExport import**

  Change:
  ```js
  import { buildExportFilename, exportElementAsPDF } from './panel/pdfExport.js';
  ```
  to:
  ```js
  import { buildExportFilename, exportElementAsPDF, buildPortfolioExportFilename } from './panel/pdfExport.js';
  ```

- [ ] **Step 2: Add the new button and its handler**

  Add right after the existing `exportPdfBtn` block (after its closing `});`):
  ```js
  const exportPortfolioPdfBtn = document.getElementById('export-portfolio-pdf-btn');

  exportPortfolioPdfBtn.addEventListener('click', async () => {
    const sidePanelEl = document.querySelector('.side-panel');
    const portfolioSectionEl = document.getElementById('panel-portfolio-section');
    const portfolioRegion = getPortfolioRegion(db, activeRegionId);
    const activeWeek = getWeeks(db).find(w => w.id === activeWeekId);
    const filename = buildPortfolioExportFilename(portfolioRegion ? portfolioRegion.label : '', activeWeek ? activeWeek.label : '');

    exportPortfolioPdfBtn.disabled = true;
    exportPortfolioPdfBtn.textContent = '⏳';
    sidePanelEl.classList.add('pdf-export');
    try {
      await exportElementAsPDF(portfolioSectionEl, filename);
    } catch (error) {
      console.error('Portfolio PDF export failed', error);
    } finally {
      sidePanelEl.classList.remove('pdf-export');
      exportPortfolioPdfBtn.disabled = false;
      exportPortfolioPdfBtn.textContent = '📄';
    }
  });
  ```
  (`getPortfolioRegion` is already imported in `main.js` from `./data/portfolioSelectors.js` — used elsewhere in `renderPanelForCurrentSelection`. No new import needed for it.)

- [ ] **Step 3: Run the full automated test suite**

  Run: `cd webapp && npx vitest run`
  Expected: PASS — all tests pass (264 existing + 3 new from Task 1 = 267), 0 failures.

- [ ] **Step 4: Verify the production build still works**

  Run: `cd webapp && npm run build`
  Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add webapp/src/main.js
  git commit -m "feat: wire per-region portfolio PDF export"
  ```

---
### Task 5: Manual browser verification

**No files changed in this task — verification only. No Firestore write protocol needed (read-only feature), but the PDF capture path itself has real, previously-encountered bugs (phase 13) that only show up in an actual browser, so this step is not optional.**

- [ ] Run `cd webapp && npm run dev`, open the printed local URL in a browser.
- [ ] Navigate to a region that has at least a few portfolio entries (e.g. Asie or Europe).
- [ ] Click the new "📄" icon next to the portfolio region label (not the main "📄 Exporter en PDF" button).
  - [ ] The icon briefly shows "⏳" and disables during generation, then reverts.
  - [ ] A PDF downloads named `Makor_Portefeuille_<Region>_<Semaine>.pdf`.
  - [ ] Open the downloaded PDF: it contains **only** the region label heading and the portfolio table (all visible rows, not just the first page's worth) — no indices, no news, no companies, no IA & Fintech, no stray "📄" button glyph.
  - [ ] Compare against clicking the original "📄 Exporter en PDF" button on the same region: that one still produces the **full** panel including the portfolio table — confirms no regression to the existing feature now that the portfolio button lives inside its capture target too.
- [ ] Switch to edit mode (password), confirm the portfolio table's delete/add-row buttons do **not** appear in a portfolio-only export taken while in edit mode (same hidden-controls treatment as the full-panel export already gets).
- [ ] All 4 globe regions map to a portfolio region id (`PORTFOLIO_REGION_BY_GLOBE_REGION` has no gaps — verified while writing this plan), so `getPortfolioRegion` only returns `null` if a `mkg:portfolio-region:*` Firestore document is actually missing for that region in the current data, which is unlikely on production data. If reachable, confirm the button doesn't throw and just produces a PDF with an empty region label (matches the existing full-panel export's behavior in the same situation — no new guard was added, intentionally, per the plan's Architecture section). Not worth manufacturing an artificial test for this — skip if no such gap exists in the live data.
- [ ] No console errors during any of the above.
- [ ] Confirm `cd webapp && npx vitest run` is still fully green after the manual session.

---
### End of Plan

At this point per-region portfolio PDF export is fully implemented:
- A dedicated "📄" icon next to the portfolio region label exports just that region's portfolio table
- Filename follows production's `Makor_Portefeuille_{region}_{week}.pdf` convention
- Reuses the existing, already-verified `.pdf-export` un-fixing technique that fixed phase 13's html2canvas clipping bug — no new capture bugs of that class introduced
- The existing full-panel "📄 Exporter en PDF" export is unaffected (still exports everything, including the portfolio table) and gains no regression from the new button now living inside its capture target (hidden via the same CSS mechanism)
- No Firestore interaction, no admin-edit-mode changes — purely additive, read-only feature
- All automated tests pass; production build still works

Still pending, as separate later plans: portfolio-region management; relabeling company stat labels; the "annuler tout" undo/session-snapshot system; color pickers; dynamic `import()` of `html2pdf.js`; the "Présentations" sub-feature for IA & Fintech; closing the patch-shape test-coverage gap in `companyList.test.js`/`sidePanel.test.js`; a final visual-theme + mobile-fallback pass; and the eventual production cutover.
