# Combler le gap de couverture patch-shape (IA & Fintech) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the specific, already-diagnosed test-coverage gap noted in `project-globe-redesign-status` memory (phase 14): "only 2 of 6 editable IA & Fintech fields (`title`, `statValue`) have a test asserting the exact patch shape". Add the missing 4.

**Confirmed by reading the actual code (not assumed):** `webapp/src/panel/sidePanel.js`'s `renderIaFintech` has exactly 6 `buildEditableInput`/patch call sites: `tag`, `title`, `description`, `statLabel`, `statValue`, `link` (`sidePanel.js:125,134,145,156,158,167`). `webapp/src/panel/sidePanel.test.js`'s `describe('editable IA & Fintech items', ...)` block only has patch-shape assertions for `title` (line 513) and `statValue` (line 533) — `tag`, `description`, `statLabel`, and `link` have no such test today. (For comparison: `renderIndices` (`value`, `weekChange`) and `renderNews` (`title`, `description`) are already fully covered, 2/2 each — this plan does not touch those, there's no gap there.)

**Architecture:** Purely additive tests in `webapp/src/panel/sidePanel.test.js`, following the exact pattern of the two existing IA & Fintech patch-shape tests (same `IA_ITEM` fixture, same full `initSidePanel` re-wiring boilerplate already used by every other patch-shape test in this file — copy it, don't invent a new pattern). No production code changes — the fields are already correctly wired (confirmed by the existing "renders title/description/tag/stat as editable inputs" test at line 503-511, which already asserts all 6 inputs render with the right pre-filled values); only the change-triggers-correct-patch behavior was never directly asserted for 4 of them.

## Global Constraints

- **Test-only change — no Firestore interaction, no production code changes, no manual browser verification needed.** This is the lowest-risk of the three plans running alongside it tonight.
- Do not modify `webapp/src/panel/sidePanel.js` or any other source file — this plan touches only `webapp/src/panel/sidePanel.test.js`.
- Do not modify or remove any existing test in the file, including the two existing IA & Fintech patch-shape tests (`title`, `statValue`) — this plan only adds 4 new ones alongside them.

---
### Task 1: Add the 4 missing patch-shape tests

**Files:**
- Modify: `webapp/src/panel/sidePanel.test.js`

**Interfaces:** none — test-only.

- [ ] **Step 1: Write the 4 new tests**

  Add these 4 tests to the `describe('editable IA & Fintech items', ...)` block, right after the existing `'calls onIaFintechEdit with a statValue patch when the stat value input changes'` test (~line 551). Each follows the exact boilerplate of the two existing patch-shape tests in this block (full `initSidePanel` re-wiring with every handler stubbed except the one under test, using the existing `IA_ITEM` fixture defined at the top of this describe block):
  ```js
  it('calls onIaFintechEdit with a tag patch when the tag input changes', () => {
    const onIaFintechEdit = vi.fn();
    panel = initSidePanel({
      labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl,
      onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {},
      onCompanyEdit: () => {}, onCompanyAdd: () => {}, onCompanyDelete: () => {},
      onCompanyBulletAdd: () => {}, onCompanyBulletEdit: () => {}, onCompanyBulletDelete: () => {},
      onPortfolioEdit: () => {}, onPortfolioAdd: () => {}, onPortfolioDelete: () => {},
      onNewsEdit: () => {}, onNewsAdd: () => {}, onNewsDelete: () => {},
      onIaFintechEdit, onIaFintechAdd: () => {}, onIaFintechDelete: () => {},
    });
    panel.showRegion('Asie', { marketItems: [], newsItems: [], iaFintechItems: [IA_ITEM], isEditing: true });

    const tagInput = iaFintechEl.querySelector('.panel-iafintech-tag-input');
    tagInput.value = 'Fintech';
    tagInput.dispatchEvent(new Event('change'));

    expect(onIaFintechEdit).toHaveBeenCalledWith(IA_ITEM, { tag: 'Fintech' });
  });

  it('calls onIaFintechEdit with a description patch when the description textarea changes', () => {
    const onIaFintechEdit = vi.fn();
    panel = initSidePanel({
      labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl,
      onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {},
      onCompanyEdit: () => {}, onCompanyAdd: () => {}, onCompanyDelete: () => {},
      onCompanyBulletAdd: () => {}, onCompanyBulletEdit: () => {}, onCompanyBulletDelete: () => {},
      onPortfolioEdit: () => {}, onPortfolioAdd: () => {}, onPortfolioDelete: () => {},
      onNewsEdit: () => {}, onNewsAdd: () => {}, onNewsDelete: () => {},
      onIaFintechEdit, onIaFintechAdd: () => {}, onIaFintechDelete: () => {},
    });
    panel.showRegion('Asie', { marketItems: [], newsItems: [], iaFintechItems: [IA_ITEM], isEditing: true });

    const textarea = iaFintechEl.querySelector('.panel-iafintech-description-input');
    textarea.value = 'Nouvelle description.';
    textarea.dispatchEvent(new Event('change'));

    expect(onIaFintechEdit).toHaveBeenCalledWith(IA_ITEM, { description: 'Nouvelle description.' });
  });

  it('calls onIaFintechEdit with a statLabel patch when the stat label input changes', () => {
    const onIaFintechEdit = vi.fn();
    panel = initSidePanel({
      labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl,
      onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {},
      onCompanyEdit: () => {}, onCompanyAdd: () => {}, onCompanyDelete: () => {},
      onCompanyBulletAdd: () => {}, onCompanyBulletEdit: () => {}, onCompanyBulletDelete: () => {},
      onPortfolioEdit: () => {}, onPortfolioAdd: () => {}, onPortfolioDelete: () => {},
      onNewsEdit: () => {}, onNewsAdd: () => {}, onNewsDelete: () => {},
      onIaFintechEdit, onIaFintechAdd: () => {}, onIaFintechDelete: () => {},
    });
    panel.showRegion('Asie', { marketItems: [], newsItems: [], iaFintechItems: [IA_ITEM], isEditing: true });

    const statLabelInput = iaFintechEl.querySelector('.panel-iafintech-stat-label-input');
    statLabelInput.value = 'Financement';
    statLabelInput.dispatchEvent(new Event('change'));

    expect(onIaFintechEdit).toHaveBeenCalledWith(IA_ITEM, { statLabel: 'Financement' });
  });

  it('calls onIaFintechEdit with a link patch when the link input changes', () => {
    const onIaFintechEdit = vi.fn();
    panel = initSidePanel({
      labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl,
      onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {},
      onCompanyEdit: () => {}, onCompanyAdd: () => {}, onCompanyDelete: () => {},
      onCompanyBulletAdd: () => {}, onCompanyBulletEdit: () => {}, onCompanyBulletDelete: () => {},
      onPortfolioEdit: () => {}, onPortfolioAdd: () => {}, onPortfolioDelete: () => {},
      onNewsEdit: () => {}, onNewsAdd: () => {}, onNewsDelete: () => {},
      onIaFintechEdit, onIaFintechAdd: () => {}, onIaFintechDelete: () => {},
    });
    panel.showRegion('Asie', { marketItems: [], newsItems: [], iaFintechItems: [IA_ITEM], isEditing: true });

    const linkInput = iaFintechEl.querySelector('.panel-iafintech-link-input');
    linkInput.value = 'https://example.com/other-source';
    linkInput.dispatchEvent(new Event('change'));

    expect(onIaFintechEdit).toHaveBeenCalledWith(IA_ITEM, { link: 'https://example.com/other-source' });
  });
  ```

- [ ] **Step 2: Run the tests to verify they pass**

  Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
  Expected: PASS — all tests pass (existing + 4 new). These tests should pass immediately since the underlying wiring already exists and is already exercised by the "renders ... as editable inputs" test — this plan is adding *assertions*, not fixing a bug. If any of the 4 unexpectedly fails, stop and investigate — that would mean a real, previously-undetected wiring bug in `renderIaFintech`, not a test-writing mistake, and is worth surfacing rather than working around.

- [ ] **Step 3: Run the full automated test suite**

  Run: `cd webapp && npx vitest run`
  Expected: PASS — all tests pass (270 existing + 4 net-new = 274), 0 failures.

- [ ] **Step 4: Commit**

  ```bash
  git add webapp/src/panel/sidePanel.test.js
  git commit -m "test: add missing patch-shape assertions for IA & Fintech tag/description/statLabel/link"
  ```

---
### End of Plan

At this point all 6 editable IA & Fintech fields (`tag`, `title`, `description`, `statLabel`, `statValue`, `link`) have a test asserting the exact patch shape sent to `onIaFintechEdit`, closing the gap recorded in phase 14's memory. `sidePanel.js`'s indices and news sections were already fully covered and remain untouched. No behavior change — test coverage only.
