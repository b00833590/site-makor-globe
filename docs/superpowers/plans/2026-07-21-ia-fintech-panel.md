# Panneau IA & Fintech — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "IA & Fintech" content section to the webapp side panel: a list of cards (tag pill, title, description, an optional stat line, an optional source link) shown for the active week, with full admin CRUD (add/edit/delete) reusing the exact password-gated edit-mode infrastructure already used by indices/companies/portfolio/news.

**Confirmed against production (`index.html`):**
- `CATEGORIES` entry: `{id:'ia-fintech', label:'IA & Fintech', icon:'🤖', type:'content'}` — a plain content tab, not a floating panel (this corrects an inaccuracy in this project's earlier status notes).
- Item shape, read straight from the render branch (`index.html:2144-2154`): `tag`, `title`, `description`, `statLabel`, `statValue`, `link` (all optional except `title`/`description`).
- Storage key: `mkg:content:ia-fintech:{weekId}:{id}` (via `loadContentItems('ia-fintech', weekId)` at `index.html:886-890`, which filters **only by week — no per-item region field at all**, unlike news/entreprises).
- Cascading week delete already lists "IA & Fintech" among what it wipes (`index.html:2529`), confirming this content is week-scoped like indices/news/entreprises, not global like portfolio.
- Production also has a "Présentations" sub-feature (PDF deck thumbnails, chunked base64 storage under `mkg:presentation:`/`mkg:pdfchunk:`) glued to the same tab. **Explicitly out of scope for this plan** (confirmed with the user) — meaningfully bigger (file upload, chunking/reassembly, a new admin component) and belongs in its own future plan.

**Why this differs from production:** production renders these as literal white cards (a light-on-dark exception in an otherwise dark-themed part of the UI). `webapp`'s side panel is dark-themed throughout with no white-card precedent anywhere — this plan uses the same dark "raised card" treatment already established by `.panel-company-card` (`rgba(255,255,255,0.04)` background, rounded corners) instead of literally porting production's white card, for visual consistency with the rest of the panel. The tag pill and stat line are kept as the two distinguishing visual elements from production's design.

**The region-agnostic design decision:** production's IA & Fintech list has no per-item region field and is shown identically regardless of which tab view state — there is nothing to filter by. `webapp`'s side panel is organized per-region, but since this content has no region axis in production, the correct port is to show the **same week-scoped list in every region's panel**, not to invent a region field that doesn't exist in production. This mirrors how portfolio content already behaves differently from region-scoped content in this codebase (portfolio isn't week-scoped; this isn't region-scoped) — a precedent this codebase already has, not a new kind of exception.

**Architecture:**
- `webapp/src/data/selectors.js` gains `getIaFintechItemsForWeek(db, weekId)` — filters by the `mkg:content:ia-fintech:{weekId}:` prefix only, no region filter (unlike `getNewsItemsForWeekAndRegion`/`getCompanyItemsForWeekAndRegion`). `getWeekContentKeys` gains the same prefix so cascading week delete (already shipped, phase 12) correctly sweeps IA & Fintech content too — today it silently would not, which would leave orphaned documents behind after a week delete once this content type exists.
- `webapp/src/panel/sidePanel.js` gains a new private `renderIaFintech(container, items, isEditing, { onEditItem, onAddItem, onDeleteItem })` function, structurally the same shape as the existing `renderNews`, plus the tag pill and stat line. `initSidePanel`'s constructor gains `iaFintechEl` and `onIaFintechEdit`/`onIaFintechAdd`/`onIaFintechDelete`; `showRegion` gains an `iaFintechItems` parameter (defaulting to `[]`, following the existing `companyItems` convention) rendered unconditionally on every call, exactly like news.
- `webapp/index.html` gains a new panel section (`<div class="panel-section-label">IA & Fintech</div><div id="panel-ia-fintech"></div>`) positioned after Entreprises/comparator and before Suivi de portefeuille, matching production's `CATEGORIES` order (indices → news → entreprises → ia-fintech).
- `webapp/src/main.js` gains `handleIaFintechEdit`/`Add`/`Delete`, wired identically to `handleNewsEdit`/`Add`/`Delete` (optimistic update, rollback + toast on Firestore failure), plus a `getIaFintechItemsForWeek(db, activeWeekId)` call added to `renderPanelForCurrentSelection`'s `panel.showRegion(...)` call.
- CSS: `webapp/src/panel/sidePanel.css` gains card/tag/stat/link/input/delete/add styles modeled on the existing `.panel-company-card`/`.panel-news-*` conventions. `webapp/src/styles/globe.css`'s `.side-panel.pdf-export` rules (added in the PDF export phase) gain the new card title selector (for the dark→light text color override) and the new delete/add button selectors (to hide them from exported PDFs) — easy to forget, and forgetting it would leak edit-only buttons and unreadable dark-on-dark titles into every future PDF export that includes this section.

**Tech Stack:** Vanilla JS + Vite, Vitest with jsdom. No new dependencies.

## Global Constraints

- **This plan writes to live production Firestore** (no staging environment exists). Follow the established manual-verification discipline: create an obviously-fake, clearly-marked test IA & Fintech item, verify it persists and deletes correctly across a hard reload, and spot-check that unrelated existing data (indices, news, companies, portfolio, weeks) is untouched before merging.
- Do not build the "Présentations" (PDF deck thumbnail) sub-feature — confirmed out of scope, defer to a future plan.
- Do not add a `region` field to IA & Fintech items or otherwise filter them per-region — production has no such field, and inventing one here would be scope creep beyond what this plan was asked to port.
- Do not add color customization (the `colorDotHTML`/`colorStyleAttr` per-field color picker production has on these items) — this is already a known, explicitly deferred item on this project's roadmap ("color pickers"), not specific to this plan.
- Do not modify `webapp/src/globe/*`, `webapp/src/data/portfolioSelectors.js`, `webapp/src/timeline/*`, `webapp/src/admin/*`, `webapp/src/panel/companyList.js`, `webapp/src/panel/portfolioTable.js`, or `webapp/src/panel/pdfExport.js` — this plan only touches the files listed under Architecture above.

---

### Task 1: Selector layer

**Files:**
- Modify: `webapp/src/data/selectors.js`
- Modify: `webapp/src/data/selectors.test.js`

**Interfaces:**
- Produces: `getIaFintechItemsForWeek(db, weekId): Item[]`. Used by Task 3's `main.js`.
- Modifies: `getWeekContentKeys` to also sweep IA & Fintech keys. Used by the already-shipped `handleWeekDelete` in `main.js` (no changes needed there — it already calls `getWeekContentKeys` generically).

- [ ] **Step 1: Write the failing tests**

Add to `webapp/src/data/selectors.test.js` (extend the shared `DB` fixture at the top with two IA & Fintech entries, one per week, to match the existing fixture style used for market/news/entreprises):

```js
// Add to the DB fixture object, alongside the existing 'mkg:content:entreprises:*' entries:
  'mkg:content:ia-fintech:w1:ia1': { id: 'ia1', tag: 'IA générative', title: 'OpenAI lève 6,5 Md$', description: 'Détail.', statLabel: 'Valorisation', statValue: '150 Md$' },
  'mkg:content:ia-fintech:w2:ia2': { id: 'ia2', tag: 'Fintech', title: 'Stripe atteint 1 000 Md$ de volume', description: 'Détail.' },
```

```js
describe('getIaFintechItemsForWeek', () => {
  it('returns only IA & Fintech items for the given week', () => {
    const items = getIaFintechItemsForWeek(DB, 'w1');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('OpenAI lève 6,5 Md$');
  });

  it('does not leak items from a different week', () => {
    const items = getIaFintechItemsForWeek(DB, 'w1');
    expect(items.some(i => i.id === 'ia2')).toBe(false);
  });

  it('returns an empty array when nothing matches', () => {
    expect(getIaFintechItemsForWeek(DB, 'w9')).toEqual([]);
  });
});
```

Update the import line at the top of the test file to add `getIaFintechItemsForWeek`.

Update the existing `getWeekContentKeys` describe block's local `DB` fixture and first test:

```js
describe('getWeekContentKeys', () => {
  const DB = {
    'mkg:week:w1': { id: 'w1', label: 'Semaine 1', order: 0 },
    'mkg:market:w1:m1': { id: 'm1' },
    'mkg:market:w1:m2': { id: 'm2' },
    'mkg:content:news:w1:n1': { id: 'n1' },
    'mkg:content:entreprises:w1:c1': { id: 'c1' },
    'mkg:content:ia-fintech:w1:ia1': { id: 'ia1' },
    'mkg:market:w2:m3': { id: 'm3' },
    'mkg:portfolio:p1': { id: 'p1' },
  };

  it('returns every market/news/entreprises/ia-fintech key for the given week, plus the week document itself', () => {
    const keys = getWeekContentKeys(DB, 'w1');
    expect(keys.sort()).toEqual([
      'mkg:content:entreprises:w1:c1',
      'mkg:content:ia-fintech:w1:ia1',
      'mkg:content:news:w1:n1',
      'mkg:market:w1:m1',
      'mkg:market:w1:m2',
      'mkg:week:w1',
    ].sort());
  });
  // ... remaining tests in this describe block are unchanged
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/data/selectors.test.js`
Expected: FAIL — `getIaFintechItemsForWeek` is not exported, and the updated `getWeekContentKeys` assertion fails (missing key).

- [ ] **Step 3: Write the implementation**

In `webapp/src/data/selectors.js`, add (near the other `getXItemsForWeekAndRegion` functions, but note this one takes no region parameter):

```js
export function getIaFintechItemsForWeek(db, weekId) {
  const prefix = `mkg:content:ia-fintech:${weekId}:`;
  return Object.keys(db)
    .filter(key => key.startsWith(prefix))
    .map(key => db[key]);
}
```

Update `getWeekContentKeys`:

```js
export function getWeekContentKeys(db, weekId) {
  const prefixes = [
    `mkg:market:${weekId}:`,
    `mkg:content:news:${weekId}:`,
    `mkg:content:entreprises:${weekId}:`,
    `mkg:content:ia-fintech:${weekId}:`,
  ];
  const keys = Object.keys(db).filter(key => prefixes.some(prefix => key.startsWith(prefix)));
  keys.push(`mkg:week:${weekId}`);
  return keys;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/data/selectors.test.js`
Expected: PASS — all tests pass, including the updated `getWeekContentKeys` ones.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/data/selectors.js webapp/src/data/selectors.test.js
git commit -m "feat: add IA & Fintech week selector and sweep it in week delete"
```

---

### Task 2: Render function, markup and styling

**Files:**
- Modify: `webapp/src/panel/sidePanel.js`
- Modify: `webapp/src/panel/sidePanel.test.js`
- Modify: `webapp/index.html`
- Modify: `webapp/src/panel/sidePanel.css`
- Modify: `webapp/src/styles/globe.css`

**Interfaces:**
- Produces: `renderIaFintech` (private to `sidePanel.js`), `initSidePanel`'s expanded constructor/`showRegion` signature. Consumed by Task 3's `main.js`.

- [ ] **Step 1: Write the failing tests**

Add `iaFintechEl` to the `beforeEach` setup in `webapp/src/panel/sidePanel.test.js` (alongside the existing element refs) and to the base `initSidePanel(...)` call:

```js
  let labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl, panel;

  beforeEach(() => {
    labelEl = document.createElement('div');
    indicesEl = document.createElement('div');
    newsEl = document.createElement('div');
    companiesEl = document.createElement('div');
    compareEl = document.createElement('div');
    portfolioLabelEl = document.createElement('div');
    portfolioEl = document.createElement('div');
    iaFintechEl = document.createElement('div');
    panel = initSidePanel({ labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl, onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {} });
  });
```

Add a new `describe('IA & Fintech section', ...)` block at the end of the file, right before the file's closing brace, mirroring the existing news-section tests:

```js
  describe('IA & Fintech section', () => {
    const IA_ITEM = { id: 'ia1', tag: 'IA générative', title: 'Titre', description: 'Description.', statLabel: 'Valorisation', statValue: '150 Md$', link: 'https://example.com/source' };

    it('renders one card per item with tag, title, description and stat line', () => {
      panel.showRegion('Asie', { marketItems: [], newsItems: [], iaFintechItems: [IA_ITEM] });
      expect(iaFintechEl.querySelector('.panel-iafintech-tag').textContent).toBe('IA générative');
      expect(iaFintechEl.querySelector('.panel-iafintech-card h3').textContent).toBe('Titre');
      expect(iaFintechEl.querySelector('.panel-iafintech-card p').textContent).toBe('Description.');
      expect(iaFintechEl.querySelector('.panel-iafintech-stat').textContent).toContain('Valorisation');
      expect(iaFintechEl.querySelector('.panel-iafintech-stat').textContent).toContain('150 Md$');
    });

    it('renders the link as an anchor when present and not editing', () => {
      panel.showRegion('Asie', { marketItems: [], newsItems: [], iaFintechItems: [IA_ITEM] });
      const link = iaFintechEl.querySelector('.panel-iafintech-link');
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toBe('https://example.com/source');
    });

    it('omits the tag pill and stat line when absent and not editing', () => {
      panel.showRegion('Asie', { marketItems: [], newsItems: [], iaFintechItems: [{ id: 'ia2', title: 'T', description: 'D' }] });
      expect(iaFintechEl.querySelector('.panel-iafintech-tag')).toBeNull();
      expect(iaFintechEl.querySelector('.panel-iafintech-stat')).toBeNull();
      expect(iaFintechEl.querySelector('.panel-iafintech-link')).toBeNull();
    });

    it('defaults iaFintechItems to an empty list when omitted', () => {
      expect(() => panel.showRegion('Asie', { marketItems: [], newsItems: [] })).not.toThrow();
      expect(iaFintechEl.children.length).toBe(0);
    });

    it('never interprets stored content as HTML', () => {
      panel.showRegion('Asie', { marketItems: [], newsItems: [], iaFintechItems: [{ id: 'ia3', title: '<img src=x onerror=alert(1)>', description: 'ok' }] });
      expect(iaFintechEl.querySelector('.panel-iafintech-card h3').textContent).toBe('<img src=x onerror=alert(1)>');
      expect(iaFintechEl.querySelector('img')).toBeNull();
    });

    it('renders title/description/tag/stat as editable inputs when isEditing is true', () => {
      panel.showRegion('Asie', { marketItems: [], newsItems: [], iaFintechItems: [IA_ITEM], isEditing: true });
      expect(iaFintechEl.querySelector('.panel-iafintech-title-input').value).toBe('Titre');
      expect(iaFintechEl.querySelector('.panel-iafintech-description-input').value).toBe('Description.');
      expect(iaFintechEl.querySelector('.panel-iafintech-tag-input').value).toBe('IA générative');
      expect(iaFintechEl.querySelector('.panel-iafintech-stat-label-input').value).toBe('Valorisation');
      expect(iaFintechEl.querySelector('.panel-iafintech-stat-value-input').value).toBe('150 Md$');
      expect(iaFintechEl.querySelector('.panel-iafintech-link-input').value).toBe('https://example.com/source');
    });

    it('calls onIaFintechEdit with a title patch when the title input changes', () => {
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

      const titleInput = iaFintechEl.querySelector('.panel-iafintech-title-input');
      titleInput.value = 'Nouveau titre';
      titleInput.dispatchEvent(new Event('change'));

      expect(onIaFintechEdit).toHaveBeenCalledWith(IA_ITEM, { title: 'Nouveau titre' });
    });

    it('calls onIaFintechEdit with a statValue patch when the stat value input changes', () => {
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

      const statValueInput = iaFintechEl.querySelector('.panel-iafintech-stat-value-input');
      statValueInput.value = '200 Md$';
      statValueInput.dispatchEvent(new Event('change'));

      expect(onIaFintechEdit).toHaveBeenCalledWith(IA_ITEM, { statValue: '200 Md$' });
    });

    it('renders a delete button per card in edit mode that calls onIaFintechDelete with the item', () => {
      const onIaFintechDelete = vi.fn();
      panel = initSidePanel({
        labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl,
        onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {},
        onCompanyEdit: () => {}, onCompanyAdd: () => {}, onCompanyDelete: () => {},
        onCompanyBulletAdd: () => {}, onCompanyBulletEdit: () => {}, onCompanyBulletDelete: () => {},
        onPortfolioEdit: () => {}, onPortfolioAdd: () => {}, onPortfolioDelete: () => {},
        onNewsEdit: () => {}, onNewsAdd: () => {}, onNewsDelete: () => {},
        onIaFintechEdit: () => {}, onIaFintechAdd: () => {}, onIaFintechDelete,
      });
      panel.showRegion('Asie', { marketItems: [], newsItems: [], iaFintechItems: [IA_ITEM], isEditing: true });

      iaFintechEl.querySelector('.panel-iafintech-delete').click();
      expect(onIaFintechDelete).toHaveBeenCalledWith(IA_ITEM);
    });

    it('does not render delete/add buttons when isEditing is false', () => {
      panel.showRegion('Asie', { marketItems: [], newsItems: [], iaFintechItems: [IA_ITEM] });
      expect(iaFintechEl.querySelector('.panel-iafintech-delete')).toBeNull();
      expect(iaFintechEl.querySelector('.panel-iafintech-add')).toBeNull();
    });

    it('renders an add button in edit mode that calls onIaFintechAdd', () => {
      const onIaFintechAdd = vi.fn();
      panel = initSidePanel({
        labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl,
        onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {},
        onCompanyEdit: () => {}, onCompanyAdd: () => {}, onCompanyDelete: () => {},
        onCompanyBulletAdd: () => {}, onCompanyBulletEdit: () => {}, onCompanyBulletDelete: () => {},
        onPortfolioEdit: () => {}, onPortfolioAdd: () => {}, onPortfolioDelete: () => {},
        onNewsEdit: () => {}, onNewsAdd: () => {}, onNewsDelete: () => {},
        onIaFintechEdit: () => {}, onIaFintechAdd, onIaFintechDelete: () => {},
      });
      panel.showRegion('Asie', { marketItems: [], newsItems: [], iaFintechItems: [IA_ITEM], isEditing: true });

      iaFintechEl.querySelector('.panel-iafintech-add').click();
      expect(onIaFintechAdd).toHaveBeenCalledTimes(1);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: FAIL — `iaFintechEl` never gets populated, `.panel-iafintech-*` selectors return null.

- [ ] **Step 3: Write the implementation**

In `webapp/src/panel/sidePanel.js`, add `renderIaFintech` near `renderNews`:

```js
function renderIaFintech(container, items, isEditing, { onEditItem, onAddItem, onDeleteItem }) {
  container.replaceChildren();
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'panel-iafintech-card';

    if (item.tag || isEditing) {
      const tag = document.createElement('div');
      tag.className = 'panel-iafintech-tag';
      if (isEditing) {
        tag.appendChild(buildEditableInput(item.tag, 'text', 'panel-iafintech-tag-input', v => onEditItem(item, { tag: v })));
      } else {
        tag.textContent = item.tag;
      }
      card.appendChild(tag);
    }

    const title = document.createElement('h3');
    if (isEditing) {
      title.appendChild(buildEditableInput(item.title, 'text', 'panel-iafintech-title-input', v => onEditItem(item, { title: v })));
    } else {
      title.textContent = item.title;
    }
    card.appendChild(title);

    const description = document.createElement('p');
    if (isEditing) {
      const textarea = document.createElement('textarea');
      textarea.className = 'panel-iafintech-description-input';
      textarea.value = item.description ?? '';
      textarea.addEventListener('change', () => onEditItem(item, { description: textarea.value }));
      description.appendChild(textarea);
    } else {
      description.textContent = item.description;
    }
    card.appendChild(description);

    if (item.statLabel || item.statValue || isEditing) {
      const stat = document.createElement('div');
      stat.className = 'panel-iafintech-stat';
      if (isEditing) {
        stat.appendChild(buildEditableInput(item.statLabel, 'text', 'panel-iafintech-stat-label-input', v => onEditItem(item, { statLabel: v })));
        stat.appendChild(document.createTextNode(' : '));
        stat.appendChild(buildEditableInput(item.statValue, 'text', 'panel-iafintech-stat-value-input', v => onEditItem(item, { statValue: v })));
      } else {
        stat.textContent = `${item.statLabel} : ${item.statValue}`;
      }
      card.appendChild(stat);
    }

    if (item.link || isEditing) {
      if (isEditing) {
        card.appendChild(buildEditableInput(item.link, 'text', 'panel-iafintech-link-input', v => onEditItem(item, { link: v })));
      } else if (item.link) {
        const link = document.createElement('a');
        link.className = 'panel-iafintech-link';
        link.href = item.link;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Lire la source →';
        card.appendChild(link);
      }
    }

    if (isEditing) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'panel-iafintech-delete';
      delBtn.setAttribute('aria-label', `Supprimer ${item.title}`);
      delBtn.textContent = '✕ Supprimer';
      delBtn.addEventListener('click', () => onDeleteItem(item));
      card.appendChild(delBtn);
    }

    container.appendChild(card);
  }

  if (isEditing) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'panel-iafintech-add';
    addBtn.textContent = '+ Ajouter un élément';
    addBtn.addEventListener('click', () => onAddItem());
    container.appendChild(addBtn);
  }
}
```

Update `initSidePanel`'s destructured parameters to add `iaFintechEl` and `onIaFintechEdit, onIaFintechAdd, onIaFintechDelete`, and update `showRegion`:

```js
export function initSidePanel({
  labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl,
  onOpenChart, onIndexEdit, onIndexAdd, onIndexDelete,
  onCompanyEdit, onCompanyAdd, onCompanyDelete, onCompanyBulletAdd, onCompanyBulletEdit, onCompanyBulletDelete,
  onPortfolioEdit, onPortfolioAdd, onPortfolioDelete,
  onNewsEdit, onNewsAdd, onNewsDelete,
  onIaFintechEdit, onIaFintechAdd, onIaFintechDelete,
}) {
```

```js
  function showRegion(regionLabel, { marketItems, newsItems, companyItems = [], portfolioRegionLabel = '', portfolioEntries = [], iaFintechItems = [], isEditing = false }) {
    labelEl.textContent = regionLabel;
    renderIndices(indicesEl, marketItems, isEditing, { onEditItem: onIndexEdit, onDeleteItem: onIndexDelete, onAddItem: onIndexAdd });
    renderNews(newsEl, newsItems, isEditing, { onEditItem: onNewsEdit, onAddItem: onNewsAdd, onDeleteItem: onNewsDelete });
    currentCompanyItems = companyItems;
    currentIsEditing = isEditing;
    selectedCompanyIds = [];
    renderCompanySection();
    portfolioLabelEl.textContent = portfolioRegionLabel;
    currentPortfolioEntries = portfolioEntries;
    renderPortfolioSection();
    renderIaFintech(iaFintechEl, iaFintechItems, isEditing, { onEditItem: onIaFintechEdit, onAddItem: onIaFintechAdd, onDeleteItem: onIaFintechDelete });
  }
```

(`iaFintechEl` is required, matching how `indicesEl`/`newsEl` are treated — not defaulted/optional, since it's always passed by `main.js`. Only the `iaFintechItems` argument to `showRegion` defaults to `[]`, matching the existing `companyItems` convention, since some early tests in this file call `showRegion` without it.)

- [ ] **Step 4: Add the markup**

In `webapp/index.html`, insert this after the Entreprises/comparator block and before the Suivi de portefeuille block:

```html
    <div class="panel-section-label">IA & Fintech</div>
    <div id="panel-ia-fintech"></div>
```

- [ ] **Step 5: Add the styles**

Append to `webapp/src/panel/sidePanel.css`:

```css
.panel-iafintech-card {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
  font-size: 12px;
}

.panel-iafintech-card h3 {
  margin: 6px 0 4px;
  font-size: 13px;
}

.panel-iafintech-card p {
  margin: 0;
  font-size: 12px;
  color: #b7bdd6;
}

.panel-iafintech-tag {
  display: inline-block;
  background: rgba(201, 151, 31, 0.2);
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 10px;
  color: var(--gold-light, #e0b53d);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 8px;
}

.panel-iafintech-stat {
  margin-top: 6px;
  color: #fff;
  font-size: 12px;
}

.panel-iafintech-link {
  display: inline-block;
  margin-top: 6px;
  color: var(--gold-light, #e0b53d);
  font-size: 11px;
  text-decoration: none;
}

.panel-iafintech-link:hover {
  text-decoration: underline;
}

.panel-iafintech-tag-input,
.panel-iafintech-title-input,
.panel-iafintech-stat-label-input,
.panel-iafintech-stat-value-input,
.panel-iafintech-link-input {
  width: 100%;
  box-sizing: border-box;
  background: #0f1730;
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  padding: 2px 4px;
  margin-top: 2px;
}

.panel-iafintech-description-input {
  width: 100%;
  min-height: 60px;
  box-sizing: border-box;
  background: #0f1730;
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  padding: 4px 6px;
  margin-top: 4px;
  resize: vertical;
}

.panel-iafintech-delete {
  display: block;
  width: 100%;
  margin-top: 8px;
  background: transparent;
  border: 1px solid rgba(224, 118, 106, 0.4);
  border-radius: 4px;
  color: #e0736a;
  cursor: pointer;
  font-size: 11px;
  padding: 4px;
}

.panel-iafintech-add {
  display: block;
  width: 100%;
  margin-top: 10px;
  background: transparent;
  border: 1px dashed rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: var(--gold-light, #e0b53d);
  cursor: pointer;
  font-size: 12px;
  padding: 6px;
}

.panel-iafintech-add:hover {
  background: rgba(201, 151, 31, 0.15);
}
```

Then update the existing PDF-export overrides in `webapp/src/styles/globe.css` — add `.panel-iafintech-card h3` to the dark-text-color selector list, and `.panel-iafintech-delete, .panel-iafintech-add` to the hide-in-export selector list:

```css
.side-panel.pdf-export .panel-region-label,
.side-panel.pdf-export .panel-section-label,
.side-panel.pdf-export .panel-index-name,
.side-panel.pdf-export .panel-company-name,
.side-panel.pdf-export .panel-news-block h3,
.side-panel.pdf-export .panel-iafintech-card h3 {
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
.side-panel.pdf-export .panel-iafintech-delete,
.side-panel.pdf-export .panel-iafintech-add,
.side-panel.pdf-export .panel-compare-toggle,
.side-panel.pdf-export .panel-chart-toggle {
  display: none !important;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: PASS — all tests pass, including the new IA & Fintech section describe block.

- [ ] **Step 7: Commit**

```bash
git add webapp/src/panel/sidePanel.js webapp/src/panel/sidePanel.test.js webapp/index.html webapp/src/panel/sidePanel.css webapp/src/styles/globe.css
git commit -m "feat: render IA & Fintech cards in the side panel"
```

---

### Task 3: Wire into the app and verify

**Files:**
- Modify: `webapp/src/main.js`

**Interfaces:**
- Consumes: `getIaFintechItemsForWeek` (Task 1), `renderIaFintech`/`initSidePanel`'s expanded signature (Task 2).
- Produces: the running application. Final deliverable of this plan.

- [ ] **Step 1: Wire the handlers into `main.js`**

Update the import from `./data/selectors.js`:

```js
import { getWeeks, getMarketItemsForWeekAndRegion, getNewsItemsForWeekAndRegion, getCompanyItemsForWeekAndRegion, getIaFintechItemsForWeek, getWeekContentKeys } from './data/selectors.js';
```

Add handlers, mirroring `handleNewsEdit`/`Add`/`Delete` exactly (place near them):

```js
function iaFintechItemKey(item) {
  return `mkg:content:ia-fintech:${activeWeekId}:${item.id}`;
}

function handleIaFintechEdit(item, patch) {
  const key = iaFintechItemKey(item);
  const previous = db[key];
  const updated = { ...previous, ...patch };
  db[key] = updated;
  renderPanelForCurrentSelection();
  client.writeDoc(key, updated).catch(() => {
    db[key] = previous;
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');
  });
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
  db[key] = newItem;
  renderPanelForCurrentSelection();
  client.writeDoc(key, newItem).catch(() => {
    delete db[key];
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Ajout en ligne échoué — le nouvel élément a été retiré');
  });
}

function handleIaFintechDelete(item) {
  const key = iaFintechItemKey(item);
  const previous = db[key];
  delete db[key];
  renderPanelForCurrentSelection();
  client.deleteDocByKey(key).catch(() => {
    db[key] = previous;
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), "⚠️ Suppression en ligne échouée — l'élément a été restauré");
  });
}
```

Wire the new container and handlers into `initSidePanel(...)`:

```js
const panel = initSidePanel({
  labelEl: document.getElementById('panel-region-label'),
  indicesEl: document.getElementById('panel-indices'),
  newsEl: document.getElementById('panel-news'),
  companiesEl: document.getElementById('panel-companies'),
  compareEl: document.getElementById('panel-compare'),
  portfolioLabelEl: document.getElementById('panel-portfolio-region-label'),
  portfolioEl: document.getElementById('panel-portfolio'),
  iaFintechEl: document.getElementById('panel-ia-fintech'),
  onOpenChart: item => chartModal.open(item, currentPortfolioEntriesForChart),
  onIndexEdit: handleIndexEdit,
  onIndexAdd: handleIndexAdd,
  onIndexDelete: handleIndexDelete,
  onCompanyEdit: handleCompanyEdit,
  onCompanyAdd: handleCompanyAdd,
  onCompanyDelete: handleCompanyDelete,
  onCompanyBulletAdd: handleCompanyBulletAdd,
  onCompanyBulletEdit: handleCompanyBulletEdit,
  onCompanyBulletDelete: handleCompanyBulletDelete,
  onPortfolioEdit: handlePortfolioEdit,
  onPortfolioAdd: handlePortfolioAdd,
  onPortfolioDelete: handlePortfolioDelete,
  onNewsEdit: handleNewsEdit,
  onNewsAdd: handleNewsAdd,
  onNewsDelete: handleNewsDelete,
  onIaFintechEdit: handleIaFintechEdit,
  onIaFintechAdd: handleIaFintechAdd,
  onIaFintechDelete: handleIaFintechDelete,
});
```

Add `iaFintechItems` to the `panel.showRegion(...)` call inside `renderPanelForCurrentSelection`:

```js
  panel.showRegion(region.label, {
    marketItems: getMarketItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    newsItems: getNewsItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    companyItems: getCompanyItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    portfolioRegionLabel: portfolioRegion ? portfolioRegion.label : '',
    portfolioEntries,
    iaFintechItems: getIaFintechItemsForWeek(db, activeWeekId),
    isEditing,
  });
```

- [ ] **Step 2: Run the full automated test suite**

Run: `cd webapp && npm test`
Expected: PASS — all tests pass, 0 failures. (No new tests in this task — `main.js` has no unit tests, matching every earlier admin-edit plan's precedent.)

- [ ] **Step 3: Manual browser verification against live production Firestore**

Run: `cd webapp && npm run dev`, open the printed local URL.

Since this plan writes to the same shared production Firestore database used by the live site (no staging environment exists), use an obviously-fake, clearly-marked test item and confirm real data is untouched:

- [ ] The "IA & Fintech" section label and (empty, or with real content if any already exists) list appear in the side panel for every region, showing the *same* items regardless of which region is currently selected (confirming the region-agnostic behavior matches production).
- [ ] Unlock edit mode. Click "+ Ajouter un élément" — a new card appears with default placeholder text and empty tag/stat/link fields, all editable.
- [ ] Edit the tag to something obviously fake like "TEST — À IGNORER", edit the title/description, fill in a stat label/value and a link. Confirm each edit persists across a hard reload (`navigate` with `force:true`, or a manual browser refresh).
- [ ] Switch regions while this test item exists — confirm it's still visible (same list, not region-filtered).
- [ ] Delete the test item. Confirm it's gone after a hard reload.
- [ ] Spot-check that switching weeks shows different IA & Fintech content per week (if more than one week has any), and that indices/news/companies/portfolio for the active region are all untouched by any of the above.
- [ ] Export the panel as PDF (existing button) while the section has at least one item — confirm the card title is dark/legible on the white PDF background and no delete/add buttons appear in the export.
- [ ] No console errors during any of the above.

- [ ] **Step 4: Verify the production build still works**

Run: `cd webapp && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/main.js
git commit -m "feat: wire IA & Fintech admin CRUD into the app"
```

---

## End of Plan

At this point the side panel shows a week-scoped, region-agnostic "IA & Fintech" section with full admin CRUD, matching production's data model and content, styled to match the rest of the dark-themed panel. Cascading week delete correctly sweeps this content too. Still pending, as separate later plans: the "Présentations" (PDF deck) sub-feature; week duplication; portfolio-region management; relabeling company stat labels; the "annuler tout" undo/session-snapshot system; color pickers; per-region portfolio-only PDF export; a final visual-theme + mobile-fallback pass; and the eventual production cutover.
