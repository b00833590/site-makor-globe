# News macro éditables (mode édition) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the password-gated edit mode (already shipped for market indices, companies, and the portfolio table) to the "News macro" section: edit an existing brief's title/description, add a new brief, delete one. This is the fourth and structurally simplest section of the admin/edit feature — a news item is `{id, title, description, region}`, closer to a market index (2 editable fields, no arrays, no cross-section coupling) than to companies or portfolio.

**Why this is the leanest plan so far:** every piece of shared infrastructure this needs already exists and needs no changes — the Firestore write client, password modal, toast, and `editableInput.js` are all reused verbatim, and (unlike portfolio) news has no interaction with any background process. `renderNews` is a small module-private function inside `sidePanel.js`, structurally identical to `renderIndices` — this plan extends it the same way `renderIndices` was extended in the indices plan, not by creating a new dedicated file (unlike companies'/portfolio's own `companyList.js`/`portfolioTable.js`, which existed as separate files before edit mode touched them — `renderNews` never warranted its own file and still doesn't).

**Architecture:**
- `webapp/src/panel/sidePanel.js`'s `renderNews(container, items)` gains `isEditing` and `{ onEditItem, onAddItem, onDeleteItem }`, same shape as `renderIndices`. In edit mode: `title` renders as a text `<input>`, `description` as a `<textarea>` (news descriptions are full paragraphs, same reasoning as company bullets using a textarea rather than a single-line input), each block gets a delete button, and the section ends with an add-brief button.
- `initSidePanel` gains `onNewsEdit`/`onNewsAdd`/`onNewsDelete` constructor callbacks, threaded into `showRegion`'s existing `renderNews` call using the already-existing `isEditing` parameter (no new closure variable needed — `renderNews` is called only from `showRegion`, unlike `renderCompanySection`/`renderPortfolioSection` which needed `currentIsEditing` because they're each called from multiple places).
- `main.js` gains `handleNewsEdit`/`handleNewsAdd`/`handleNewsDelete`, the same optimistic-update-with-rollback-on-failure pattern as every other section. Firestore key format: `mkg:content:news:{weekId}:{id}` (has a week component, like indices/companies — unlike portfolio). Reuses the existing `GROUP_LABEL_BY_REGION` map for a new brief's default `region` (news items use the exact same free-text region convention as companies, confirmed by `selectors.js`'s `getNewsItemsForWeekAndRegion` filtering via `normalizeRegionLabel(item.region)`).
- No `index.html` changes needed — the news section's container (`#panel-news`) and all edit-mode chrome (toggle button, password modal, toast) already exist from earlier plans.

**Tech Stack:** Same as prior plans — vanilla JS + Vite, Vitest with jsdom for DOM components.

## Global Constraints

- **This plan writes to the same live production Firestore database** the interns use every week — no staging environment. Manual verification (Task 2) must only ever create/edit/delete an obviously-fake, clearly-marked test brief — **never edit or delete a real existing news item**.
- Firestore document shape matches production: key `mkg:content:news:{weekId}:{id}`, value `{id, title, description, region}`. Edits must be a shallow merge (`{...previous, ...patch}`).
- Explicitly OUT OF SCOPE: any color/styling per-brief customization; the "annuler tout" undo/session-snapshot system.
- Do not modify `webapp/src/globe/*`, `webapp/src/data/*`, `webapp/src/panel/portfolioSort.js`/`portfolioTable.js`/`portfolioLiveRefresh.js`/`companyList.js`/`chartModal.js`/`companyChart.js`/`compareSelection.js`, `webapp/src/timeline/*`, `webapp/src/admin/passwordModal.js`/`toast.js`/`uid.js`/`config.js`/`editableInput.js` (all already built, reused as-is), or the repository root `index.html`/`css`/`js`. This plan also does not need to modify `webapp/index.html` (the webapp's own, not root).

---

### Task 1: Editable news rendering, wired through the side panel

**Files:**
- Modify: `webapp/src/panel/sidePanel.js`
- Modify: `webapp/src/panel/sidePanel.test.js`
- Modify: `webapp/src/panel/sidePanel.css`

**Interfaces:**
- Changes: `initSidePanel`'s constructor gains `onNewsEdit`, `onNewsAdd`, `onNewsDelete` (all optional). `renderNews` gains `isEditing`/callbacks, called with the existing `isEditing` value already available inside `showRegion`.

- [ ] **Step 1: Add the failing tests**

Add to `webapp/src/panel/sidePanel.test.js`, inside the existing `describe('initSidePanel', ...)` block:
```js
  describe('editable news via side panel', () => {
    const NEWS_ITEM = { id: 'n1', title: 'Titre', description: 'Description.' };

    it('renders plain text (no inputs) when isEditing is false or omitted', () => {
      panel.showRegion('Asie', { marketItems: [], newsItems: [NEWS_ITEM] });
      expect(newsEl.querySelector('input')).toBeNull();
      expect(newsEl.querySelector('textarea')).toBeNull();
      expect(newsEl.querySelector('h3').textContent).toBe('Titre');
    });

    it('renders title as a text input and description as a textarea when isEditing is true', () => {
      panel.showRegion('Asie', { marketItems: [], newsItems: [NEWS_ITEM], isEditing: true });
      expect(newsEl.querySelector('.panel-news-title-input')).not.toBeNull();
      expect(newsEl.querySelector('.panel-news-title-input').value).toBe('Titre');
      const textarea = newsEl.querySelector('.panel-news-description-input');
      expect(textarea.tagName).toBe('TEXTAREA');
      expect(textarea.value).toBe('Description.');
    });

    it('calls onNewsEdit with a title patch when the title input changes', () => {
      const onNewsEdit = vi.fn();
      panel = initSidePanel({
        labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl,
        onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {},
        onCompanyEdit: () => {}, onCompanyAdd: () => {}, onCompanyDelete: () => {},
        onCompanyBulletAdd: () => {}, onCompanyBulletEdit: () => {}, onCompanyBulletDelete: () => {},
        onPortfolioEdit: () => {}, onPortfolioAdd: () => {}, onPortfolioDelete: () => {},
        onNewsEdit, onNewsAdd: () => {}, onNewsDelete: () => {},
      });
      panel.showRegion('Asie', { marketItems: [], newsItems: [NEWS_ITEM], isEditing: true });

      const titleInput = newsEl.querySelector('.panel-news-title-input');
      titleInput.value = 'Nouveau titre';
      titleInput.dispatchEvent(new Event('change'));

      expect(onNewsEdit).toHaveBeenCalledWith(NEWS_ITEM, { title: 'Nouveau titre' });
    });

    it('calls onNewsEdit with a description patch when the description textarea changes', () => {
      const onNewsEdit = vi.fn();
      panel = initSidePanel({
        labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl,
        onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {},
        onCompanyEdit: () => {}, onCompanyAdd: () => {}, onCompanyDelete: () => {},
        onCompanyBulletAdd: () => {}, onCompanyBulletEdit: () => {}, onCompanyBulletDelete: () => {},
        onPortfolioEdit: () => {}, onPortfolioAdd: () => {}, onPortfolioDelete: () => {},
        onNewsEdit, onNewsAdd: () => {}, onNewsDelete: () => {},
      });
      panel.showRegion('Asie', { marketItems: [], newsItems: [NEWS_ITEM], isEditing: true });

      const textarea = newsEl.querySelector('.panel-news-description-input');
      textarea.value = 'Nouvelle description.';
      textarea.dispatchEvent(new Event('change'));

      expect(onNewsEdit).toHaveBeenCalledWith(NEWS_ITEM, { description: 'Nouvelle description.' });
    });

    it('renders a delete button per brief in edit mode that calls onNewsDelete with the item', () => {
      const onNewsDelete = vi.fn();
      panel = initSidePanel({
        labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl,
        onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {},
        onCompanyEdit: () => {}, onCompanyAdd: () => {}, onCompanyDelete: () => {},
        onCompanyBulletAdd: () => {}, onCompanyBulletEdit: () => {}, onCompanyBulletDelete: () => {},
        onPortfolioEdit: () => {}, onPortfolioAdd: () => {}, onPortfolioDelete: () => {},
        onNewsEdit: () => {}, onNewsAdd: () => {}, onNewsDelete,
      });
      panel.showRegion('Asie', { marketItems: [], newsItems: [NEWS_ITEM], isEditing: true });

      newsEl.querySelector('.panel-news-delete').click();
      expect(onNewsDelete).toHaveBeenCalledWith(NEWS_ITEM);
    });

    it('does not render delete/add buttons when isEditing is false', () => {
      panel.showRegion('Asie', { marketItems: [], newsItems: [NEWS_ITEM] });
      expect(newsEl.querySelector('.panel-news-delete')).toBeNull();
      expect(newsEl.querySelector('.panel-news-add')).toBeNull();
    });

    it('renders an add-brief button in edit mode that calls onNewsAdd', () => {
      const onNewsAdd = vi.fn();
      panel = initSidePanel({
        labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl,
        onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {},
        onCompanyEdit: () => {}, onCompanyAdd: () => {}, onCompanyDelete: () => {},
        onCompanyBulletAdd: () => {}, onCompanyBulletEdit: () => {}, onCompanyBulletDelete: () => {},
        onPortfolioEdit: () => {}, onPortfolioAdd: () => {}, onPortfolioDelete: () => {},
        onNewsEdit: () => {}, onNewsAdd, onNewsDelete: () => {},
      });
      panel.showRegion('Asie', { marketItems: [], newsItems: [NEWS_ITEM], isEditing: true });

      newsEl.querySelector('.panel-news-add').click();
      expect(onNewsAdd).toHaveBeenCalledTimes(1);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: FAIL — the 7 new tests fail; all 31 pre-existing tests still pass.

- [ ] **Step 3: Write the implementation**

Modify `webapp/src/panel/sidePanel.js` — replace `renderNews` (keep `renderIndices`, `buildEditableInput` import, and everything else exactly as-is):
```js
function renderNews(container, items, isEditing, { onEditItem, onAddItem, onDeleteItem }) {
  container.replaceChildren();
  for (const item of items) {
    const block = document.createElement('div');
    block.className = 'panel-news-block';

    const title = document.createElement('h3');
    if (isEditing) {
      title.appendChild(buildEditableInput(item.title, 'text', 'panel-news-title-input', v => onEditItem(item, { title: v })));
    } else {
      title.textContent = item.title;
    }

    const description = document.createElement('p');
    if (isEditing) {
      const textarea = document.createElement('textarea');
      textarea.className = 'panel-news-description-input';
      textarea.value = item.description ?? '';
      textarea.addEventListener('change', () => onEditItem(item, { description: textarea.value }));
      description.appendChild(textarea);
    } else {
      description.textContent = item.description;
    }

    block.append(title, description);

    if (isEditing) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'panel-news-delete';
      delBtn.setAttribute('aria-label', `Supprimer ${item.title}`);
      delBtn.textContent = '✕ Supprimer';
      delBtn.addEventListener('click', () => onDeleteItem(item));
      block.appendChild(delBtn);
    }

    container.appendChild(block);
  }

  if (isEditing) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'panel-news-add';
    addBtn.textContent = '+ Ajouter une brève';
    addBtn.addEventListener('click', () => onAddItem());
    container.appendChild(addBtn);
  }
}
```

Update `initSidePanel`'s parameter list to add the three news callbacks:
```js
export function initSidePanel({
  labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl,
  onOpenChart, onIndexEdit, onIndexAdd, onIndexDelete,
  onCompanyEdit, onCompanyAdd, onCompanyDelete, onCompanyBulletAdd, onCompanyBulletEdit, onCompanyBulletDelete,
  onPortfolioEdit, onPortfolioAdd, onPortfolioDelete,
  onNewsEdit, onNewsAdd, onNewsDelete,
}) {
```

Update `showRegion`'s call to `renderNews` (this is the only line inside `showRegion` that changes — everything else in the function stays exactly as it is):
```js
    renderNews(newsEl, newsItems, isEditing, { onEditItem: onNewsEdit, onAddItem: onNewsAdd, onDeleteItem: onNewsDelete });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/panel/sidePanel.test.js`
Expected: PASS — 38 tests total (31 existing + 7 new).

- [ ] **Step 5: Add the styles**

Add to `webapp/src/panel/sidePanel.css` (append, don't modify existing rules):
```css
.panel-news-title-input {
  width: 100%;
  box-sizing: border-box;
  background: #0f1730;
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  font-weight: bold;
  padding: 4px 6px;
}

.panel-news-description-input {
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

.panel-news-delete {
  display: block;
  margin-top: 6px;
  background: transparent;
  border: 1px solid rgba(224, 118, 106, 0.4);
  border-radius: 4px;
  color: #e0736a;
  cursor: pointer;
  font-size: 11px;
  padding: 4px 8px;
}

.panel-news-add {
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

.panel-news-add:hover {
  background: rgba(201, 151, 31, 0.15);
}
```

- [ ] **Step 6: Commit**

```bash
git add webapp/src/panel/sidePanel.js webapp/src/panel/sidePanel.test.js webapp/src/panel/sidePanel.css
git commit -m "feat: render editable news briefs in edit mode"
```

---

### Task 2: Wire news edit handlers into the app and verify end-to-end

**Files:**
- Modify: `webapp/src/main.js`

**Interfaces:**
- Consumes: `GROUP_LABEL_BY_REGION` (already in `main.js`), the edit-aware `initSidePanel` (Task 1), `client.writeDoc`/`deleteDocByKey`/`generateId`/`showToast` (already in `main.js`).
- Produces: the running application. Final deliverable of this plan.

- [ ] **Step 1: Add the handlers to `main.js`**

Add this block near the existing `handlePortfolio*` functions (no new imports needed — everything it uses is already imported/declared in `main.js`):
```js
function newsItemKey(item) {
  return `mkg:content:news:${activeWeekId}:${item.id}`;
}

function handleNewsEdit(item, patch) {
  const key = newsItemKey(item);
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

function handleNewsAdd() {
  const id = generateId();
  const key = `mkg:content:news:${activeWeekId}:${id}`;
  const newItem = {
    id,
    region: GROUP_LABEL_BY_REGION[activeRegionId] || '',
    title: 'Nouvelle brève',
    description: 'Description à compléter.',
  };
  db[key] = newItem;
  renderPanelForCurrentSelection();
  client.writeDoc(key, newItem).catch(() => {
    delete db[key];
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), '⚠️ Ajout en ligne échoué — la nouvelle brève a été retirée');
  });
}

function handleNewsDelete(item) {
  const key = newsItemKey(item);
  const previous = db[key];
  delete db[key];
  renderPanelForCurrentSelection();
  client.deleteDocByKey(key).catch(() => {
    db[key] = previous;
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), "⚠️ Suppression en ligne échouée — la brève a été restaurée");
  });
}
```

Update the `panel` construction to pass the new callbacks (add alongside the existing `onPortfolio*` lines):
```js
  onNewsEdit: handleNewsEdit,
  onNewsAdd: handleNewsAdd,
  onNewsDelete: handleNewsDelete,
```

Nothing else in `main.js` changes.

- [ ] **Step 2: Run the full automated test suite**

Run: `cd webapp && npm test`
Expected: PASS — all tests pass, 0 failures. (No new tests in this task — `main.js` has no unit tests, matching every earlier plan's precedent.)

- [ ] **Step 3: Manual browser verification — READ THE SAFETY NOTE FIRST**

**Safety note:** same live production Firestore as every earlier admin-edit plan, no staging environment. Only ever add/edit/delete a news brief you created yourself for this test — never touch a real one.

Run: `cd webapp && npm run dev`, then open the printed local URL in a browser.

Checklist:
- [ ] Unlock edit mode. Existing news briefs now show a title `<input>` and a description `<textarea>`, each with a "✕ Supprimer" button, and the section ends with "+ Ajouter une brève".
- [ ] Click "+ Ajouter une brève". A new brief appears immediately titled "Nouvelle brève". **Immediately set its title to something unmistakably a test, e.g. `TEST — À SUPPRIMER`,** and tab out to commit.
- [ ] Reload the page fully (hard refresh), re-unlock edit mode. Confirm the test brief is still there — proves the write reached Firestore.
- [ ] Edit its description, tab out, confirm the change reflects immediately.
- [ ] Click its "✕ Supprimer" button. Confirm it disappears immediately.
- [ ] Reload again. Confirm the test brief is gone for good.
- [ ] Exit edit mode. Confirm the news section returns to read-only rendering — and spot-check the real briefs against what they showed before you started, to confirm none were altered.
- [ ] No console errors during any of the above.

- [ ] **Step 4: Verify the production build still works**

Run: `cd webapp && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/main.js
git commit -m "feat: wire password-gated edit mode for news briefs"
```

---

## End of Plan

At this point market indices, companies, the portfolio table, and news are all fully editable under the same password-gated edit mode. Still pending, as separate later plans: weeks/regions management; relabeling company stat labels; the "annuler tout" undo/session-snapshot system; color pickers; PDF export; the IA & Fintech panel; a final visual-theme + mobile-fallback pass; and the eventual production cutover.
