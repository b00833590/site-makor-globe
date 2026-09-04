---
title: Color picker sur la section Entreprises — étendre le mécanisme des phases 20/24 au-delà des indices
date: 2026-07-27
status: draft
---

## Contexte

Le sélecteur de couleur par champ (`webapp/src/admin/colorPicker.js`'s `buildColorDot`/`COLOR_PALETTE`, 21 teintes + réinitialisation) n'a jusqu'ici été branché que sur la section "Indices de marché" (phases 20 et 24 : `value`, puis `name`/`weekChange`). C'est le premier des trois plans de la série "autres sections" demandée par l'utilisateur (entreprises, puis portefeuille, puis news, un plan par section — même granularité que l'admin/edit original, voir mémoire `feedback-admin-edit-scope`). Ce plan traite la section Entreprises, choisie en premier car c'est la plus riche en champs colorables.

**Vérifié en lisant la production** (`index.html`, bloc `company-card` ~lignes 1590-1620) : les champs colorables (`colorDotHTML`) y sont exactement `name`, `marketCap`, les 4 VALEURS de stats (`salesGrowth`/`evEbitda`/`coursActuel`/`targetPrice` — **pas** leurs libellés), et chaque bullet individuellement (`bullet-{i}`). `yahooSymbol`/`flag`/`country` (la ligne "sub") et les libellés de stats n'ont **aucun** point de couleur en production — ce plan reproduit exactement ce périmètre, pas plus. Le tag de région d'entreprise (`companyRegionBg`/`companyRegionText`, un "kind" de couleur différent, à fond + texte plutôt qu'un simple hex sur un champ) reste explicitement hors périmètre — c'est l'un des "3 autres kinds" déjà notés comme travail futur séparé dans la mémoire projet, pas traité ici.

## Décisions de conception

- **Stockage** : `item.colors = { name, marketCap, salesGrowth, evEbitda, coursActuel, targetPrice, 'bullet-0': '#hex', 'bullet-1': ... }` sur les mêmes documents Firestore `mkg:content:entreprises:{weekId}:{id}` déjà utilisés — même modèle exact que `item.colors` sur les indices (phase 20), juste plus de clés possibles, dont des clés dynamiques indexées par bullet.
- **Zéro nouvelle logique d'écriture** : comme `handleIndexColorChange`, le nouveau `handleCompanyColorChange(item, field, color)` construit l'objet `colors` complet côté client et délègue entièrement à `handleCompanyEdit` (déjà générique sur le nom de champ depuis la phase 17) pour l'écriture/rollback — aucun nouveau code d'interaction Firestore.
- **Correctif de spécificité CSS préventif** : la phase 20 a découvert après coup que `.panel-index-value-input { color: #fff }` gagnait toujours sur la couleur inline du parent pendant l'édition, invisible jusqu'à la sortie du mode édition. Les 4 classes d'input concernées ici (`panel-company-name-input`, `panel-company-stat-input`, `panel-company-cap-input`, `panel-company-bullet-input`) ont exactement le même défaut (`color:#fff` codé en dur) — corrigé dès ce plan avec `color: inherit`, sans attendre qu'un reviewer le trouve une seconde fois.

## Tâche 1 — `webapp/src/panel/companyList.js` : couleurs sur name/marketCap/4 stats/bullets

Remplacer le contenu du fichier par :

```js
import { buildEditableInput } from '../admin/editableInput.js';
import { buildColorDot } from '../admin/colorPicker.js';

const STAT_FIELDS = [
  ['salesGrowthLabel', 'salesGrowth', 'Croissance CA'],
  ['evEbitdaLabel', 'evEbitda', 'EV/EBITDA'],
  ['coursActuelLabel', 'coursActuel', 'Cours actuel'],
  ['targetPriceLabel', 'targetPrice', 'Objectif'],
];

function buildStatsGrid(item, isEditing, { onEditItem, onColorChange }) {
  const stats = document.createElement('div');
  stats.className = 'panel-company-stats';
  for (const [labelField, valueField, defaultLabel] of STAT_FIELDS) {
    const stat = document.createElement('div');
    stat.className = 'panel-company-stat';

    const label = document.createElement('span');
    label.className = 'panel-company-stat-label';
    if (isEditing) {
      label.appendChild(buildEditableInput(item[labelField] || defaultLabel, 'text', 'panel-company-stat-label-input', v => onEditItem(item, { [labelField]: v })));
    } else {
      label.textContent = item[labelField] || defaultLabel;
    }

    const value = document.createElement('span');
    value.className = 'panel-company-stat-value';
    const valueColor = item.colors && item.colors[valueField];
    if (valueColor) value.style.color = valueColor;
    if (isEditing) {
      value.appendChild(buildEditableInput(item[valueField], 'text', 'panel-company-stat-input', v => onEditItem(item, { [valueField]: v })));
      value.appendChild(buildColorDot(valueColor, color => onColorChange(item, valueField, color)));
    } else {
      value.textContent = item[valueField] ?? '';
    }

    stat.append(label, value);
    stats.appendChild(stat);
  }
  return stats;
}

function buildBulletsList(item, isEditing, { onBulletAdd, onBulletEdit, onBulletDelete, onColorChange }) {
  const bullets = document.createElement('ul');
  bullets.className = 'panel-company-bullets';

  (item.bullets || []).forEach((bullet, index) => {
    const li = document.createElement('li');
    const field = `bullet-${index}`;
    const bulletColor = item.colors && item.colors[field];
    if (bulletColor) li.style.color = bulletColor;
    if (isEditing) {
      const textarea = document.createElement('textarea');
      textarea.className = 'panel-company-bullet-input';
      textarea.value = bullet;
      textarea.addEventListener('change', () => onBulletEdit(item, index, textarea.value));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'panel-company-bullet-delete';
      delBtn.setAttribute('aria-label', `Supprimer le point clé ${index + 1}`);
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', () => onBulletDelete(item, index));

      li.append(textarea, buildColorDot(bulletColor, color => onColorChange(item, field, color)), delBtn);
    } else {
      li.textContent = bullet;
    }
    bullets.appendChild(li);
  });

  if (isEditing) {
    const addLi = document.createElement('li');
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'panel-company-bullet-add';
    addBtn.textContent = '+ Point clé';
    addBtn.addEventListener('click', () => onBulletAdd(item));
    addLi.appendChild(addBtn);
    bullets.appendChild(addLi);
  }

  return bullets;
}

export function renderCompanies(container, items, selectedIds, { onToggle, onOpenChart, isEditing = false, onEditItem, onAddItem, onDeleteItem, onBulletAdd, onBulletEdit, onBulletDelete, onColorChange }) {
  container.replaceChildren();
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'panel-company-card';

    const header = document.createElement('div');
    header.className = 'panel-company-header';

    const name = document.createElement('span');
    name.className = 'panel-company-name';
    const nameColor = item.colors && item.colors.name;
    if (nameColor) name.style.color = nameColor;
    if (isEditing) {
      name.appendChild(buildEditableInput(item.name, 'text', 'panel-company-name-input', v => onEditItem(item, { name: v })));
      name.appendChild(buildColorDot(nameColor, color => onColorChange(item, 'name', color)));
    } else {
      name.textContent = item.name;
    }

    const chartBtn = document.createElement('button');
    chartBtn.type = 'button';
    chartBtn.className = 'panel-chart-toggle';
    chartBtn.textContent = '📈';
    chartBtn.setAttribute('aria-label', `Graphique ${item.name}`);
    chartBtn.addEventListener('click', () => onOpenChart(item));

    const compareBtn = document.createElement('button');
    compareBtn.type = 'button';
    compareBtn.className = 'panel-compare-toggle' + (selectedIds.includes(item.id) ? ' active' : '');
    compareBtn.textContent = '⚖';
    compareBtn.setAttribute('aria-label', `Comparer ${item.name}`);
    compareBtn.addEventListener('click', () => onToggle(item.id));

    header.append(name, chartBtn, compareBtn);

    const sub = document.createElement('div');
    sub.className = 'panel-company-sub';
    if (isEditing) {
      sub.append(
        buildEditableInput(item.yahooSymbol, 'text', 'panel-company-sub-input', v => onEditItem(item, { yahooSymbol: v })),
        buildEditableInput(item.flag, 'text', 'panel-company-sub-input panel-company-flag-input', v => onEditItem(item, { flag: v })),
        buildEditableInput(item.country, 'text', 'panel-company-sub-input', v => onEditItem(item, { country: v })),
      );
    } else {
      sub.textContent = [item.yahooSymbol, item.flag, item.country].filter(Boolean).join(' · ');
    }

    const cap = document.createElement('div');
    cap.className = 'panel-company-cap';
    const capColor = item.colors && item.colors.marketCap;
    if (capColor) cap.style.color = capColor;
    if (isEditing) {
      cap.appendChild(buildEditableInput(item.marketCap, 'text', 'panel-company-cap-input', v => onEditItem(item, { marketCap: v })));
      cap.appendChild(buildColorDot(capColor, color => onColorChange(item, 'marketCap', color)));
    } else {
      cap.textContent = item.marketCap ?? '';
    }

    card.append(header, sub, cap, buildStatsGrid(item, isEditing, { onEditItem, onColorChange }), buildBulletsList(item, isEditing, { onBulletAdd, onBulletEdit, onBulletDelete, onColorChange }));

    if (isEditing) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'panel-company-delete';
      delBtn.setAttribute('aria-label', `Supprimer ${item.name}`);
      delBtn.textContent = '✕ Supprimer';
      delBtn.addEventListener('click', () => onDeleteItem(item));
      card.appendChild(delBtn);
    }

    container.appendChild(card);
  }

  if (isEditing) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'panel-company-add';
    addBtn.textContent = '+ Ajouter une entreprise';
    addBtn.addEventListener('click', () => onAddItem());
    container.appendChild(addBtn);
  }
}

export function renderComparison(container, items, selectedIds) {
  container.replaceChildren();
  if (selectedIds.length !== 2) return;

  const [a, b] = selectedIds.map(id => items.find(item => item.id === id));
  if (!a || !b) return;

  const table = document.createElement('table');
  table.className = 'panel-compare-table';

  function addRow(label, valueA, valueB) {
    const row = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = label;
    const tdA = document.createElement('td');
    tdA.textContent = valueA ?? '';
    const tdB = document.createElement('td');
    tdB.textContent = valueB ?? '';
    row.append(th, tdA, tdB);
    table.appendChild(row);
  }

  addRow('', a.name, b.name);
  for (const [labelField, valueField, defaultLabel] of STAT_FIELDS) {
    const labelA = a[labelField] || defaultLabel;
    const labelB = b[labelField] || defaultLabel;
    if (labelA === labelB) {
      addRow(defaultLabel, a[valueField], b[valueField]);
    } else {
      addRow(defaultLabel, `${labelA}: ${a[valueField] ?? ''}`, `${labelB}: ${b[valueField] ?? ''}`);
    }
  }

  container.appendChild(table);
}
```

**Changement d'API à propager** : `buildStatsGrid` et `buildBulletsList` prennent désormais un objet d'options en 3ᵉ argument au lieu d'une fonction seule / d'un sous-ensemble de callbacks — déjà reflété dans `renderCompanies` ci-dessus, qui est le seul appelant.

### Tests — ajouter à `webapp/src/panel/companyList.test.js`

Ajouter un `describe` dédié (nouveau bloc, à la suite des blocs existants) :

```js
describe('renderCompanies — color picker', () => {
  it('renders no color dots when isEditing is false, even with colors set', () => {
    const container = document.createElement('div');
    const colored = { ...COMPANY_A, colors: { name: '#2f6fed', marketCap: '#c0392b', salesGrowth: '#16a34a', 'bullet-0': '#9b59b6' } };
    renderCompanies(container, [colored], [], { onToggle: () => {}, onOpenChart: () => {} });
    expect(container.querySelector('.color-dot')).toBeNull();
  });

  it('applies a stored color as inline style on name, marketCap, a stat value, and a bullet in read-only mode', () => {
    const container = document.createElement('div');
    const colored = { ...COMPANY_A, colors: { name: '#2f6fed', marketCap: '#c0392b', salesGrowth: '#16a34a', 'bullet-0': '#9b59b6' } };
    renderCompanies(container, [colored], [], { onToggle: () => {}, onOpenChart: () => {} });
    expect(container.querySelector('.panel-company-name').style.color).toBe('rgb(47, 111, 237)');
    expect(container.querySelector('.panel-company-cap').style.color).toBe('rgb(192, 57, 43)');
    expect(container.querySelectorAll('.panel-company-stat-value')[0].style.color).toBe('rgb(22, 163, 74)');
    expect(container.querySelectorAll('.panel-company-bullets li')[0].style.color).toBe('rgb(155, 89, 182)');
  });

  it('renders a color dot next to name/marketCap in edit mode and calls onColorChange with the right field', () => {
    const container = document.createElement('div');
    const onColorChange = vi.fn();
    renderCompanies(container, [COMPANY_A], [], {
      onToggle: () => {}, onOpenChart: () => {}, isEditing: true,
      onEditItem: () => {}, onAddItem: () => {}, onDeleteItem: () => {},
      onBulletAdd: () => {}, onBulletEdit: () => {}, onBulletDelete: () => {},
      onColorChange,
    });
    container.querySelector('.panel-company-name .color-dot').click();
    document.querySelector('.color-swatch').click();
    expect(onColorChange).toHaveBeenCalledWith(COMPANY_A, 'name', expect.any(String));

    onColorChange.mockClear();
    container.querySelector('.panel-company-cap .color-dot').click();
    document.querySelector('.color-swatch').click();
    expect(onColorChange).toHaveBeenCalledWith(COMPANY_A, 'marketCap', expect.any(String));
  });

  it('renders a color dot for each of the 4 stat values in edit mode and calls onColorChange with the correct value field', () => {
    const container = document.createElement('div');
    const onColorChange = vi.fn();
    renderCompanies(container, [COMPANY_A], [], {
      onToggle: () => {}, onOpenChart: () => {}, isEditing: true,
      onEditItem: () => {}, onAddItem: () => {}, onDeleteItem: () => {},
      onBulletAdd: () => {}, onBulletEdit: () => {}, onBulletDelete: () => {},
      onColorChange,
    });
    const fields = ['salesGrowth', 'evEbitda', 'coursActuel', 'targetPrice'];
    const dots = container.querySelectorAll('.panel-company-stat-value .color-dot');
    expect(dots).toHaveLength(4);
    dots.forEach((dot, i) => {
      dot.click();
      document.querySelector('.color-swatch').click();
      expect(onColorChange).toHaveBeenNthCalledWith(i + 1, COMPANY_A, fields[i], expect.any(String));
    });
  });

  it('renders one color dot per bullet in edit mode and calls onColorChange with the correct bullet-index field', () => {
    const container = document.createElement('div');
    const onColorChange = vi.fn();
    renderCompanies(container, [COMPANY_A], [], {
      onToggle: () => {}, onOpenChart: () => {}, isEditing: true,
      onEditItem: () => {}, onAddItem: () => {}, onDeleteItem: () => {},
      onBulletAdd: () => {}, onBulletEdit: () => {}, onBulletDelete: () => {},
      onColorChange,
    });
    const dots = container.querySelectorAll('.panel-company-bullets li .color-dot');
    expect(dots).toHaveLength(2); // COMPANY_A has 2 bullets
    dots[1].click();
    document.querySelector('.color-swatch').click();
    expect(onColorChange).toHaveBeenCalledWith(COMPANY_A, 'bullet-1', expect.any(String));
  });

  it('clicking the reset swatch calls onColorChange with null', () => {
    const container = document.createElement('div');
    const onColorChange = vi.fn();
    const colored = { ...COMPANY_A, colors: { name: '#2f6fed' } };
    renderCompanies(container, [colored], [], {
      onToggle: () => {}, onOpenChart: () => {}, isEditing: true,
      onEditItem: () => {}, onAddItem: () => {}, onDeleteItem: () => {},
      onBulletAdd: () => {}, onBulletEdit: () => {}, onBulletDelete: () => {},
      onColorChange,
    });
    container.querySelector('.panel-company-name .color-dot').click();
    document.querySelector('.color-swatch-reset').click();
    expect(onColorChange).toHaveBeenCalledWith(colored, 'name', null);
  });
});
```

**Note pour l'implémenteur** : `buildColorDot`'s popup s'attache à `document.body` (pas au conteneur passé à `renderCompanies`) — c'est pourquoi les tests ci-dessus cherchent `.color-swatch` via `document.querySelector`, pas `container.querySelector`, exactement comme les tests de couleur déjà existants pour les indices dans `sidePanel.test.js`. Vérifier ce détail contre ces tests existants avant d'écrire les nouveaux.

## Tâche 2 — `webapp/src/panel/companyList.css` : correctif de spécificité (couleur visible pendant l'édition)

**Attention à l'ordre** : `.panel-company-bullet-input` a sa propre règle `color: #fff` dans un bloc séparé, plus bas dans le fichier (celui qui définit aussi `flex`/`min-height`/etc. pour la textarea de bullet) — donc plus tardif dans l'ordre des règles que le bloc partagé `.panel-company-name-input, .panel-company-sub-input, .panel-company-cap-input, .panel-company-stat-input, .panel-company-stat-label-input { ... }`. À spécificité égale (sélecteur à une seule classe dans les deux cas), c'est la règle la plus tardive dans le fichier qui l'emporte. Ajouter la nouvelle règle à la **toute fin du fichier** (après la dernière règle existante, `.panel-company-bullet-add`), pas juste après le bloc partagé, pour qu'elle gagne face aux deux blocs `color: #fff` existants (celui partagé ET celui, plus bas, dédié à `.panel-company-bullet-input`) :

```css
.panel-company-name-input,
.panel-company-stat-input,
.panel-company-cap-input,
.panel-company-bullet-input {
  color: inherit;
}
```

**Ne pas inclure** `.panel-company-sub-input` ni `.panel-company-stat-label-input` dans cette nouvelle règle — ces deux champs ne reçoivent jamais de couleur personnalisée dans ce plan (hors périmètre, voir Contexte).

## Tâche 3 — `webapp/src/panel/sidePanel.js` : brancher `onCompanyColorChange`

Dans `initSidePanel({...})`'s liste de paramètres déstructurés, remplacer :

```js
  onCompanyEdit, onCompanyAdd, onCompanyDelete, onCompanyBulletAdd, onCompanyBulletEdit, onCompanyBulletDelete,
```

par :

```js
  onCompanyEdit, onCompanyAdd, onCompanyDelete, onCompanyBulletAdd, onCompanyBulletEdit, onCompanyBulletDelete, onCompanyColorChange,
```

Dans `renderCompanySection()`, ajouter `onColorChange: onCompanyColorChange,` à l'objet passé à `renderCompanies(...)` (juste après `onBulletDelete: onCompanyBulletDelete,`).

## Tâche 4 — `webapp/src/main.js` : `handleCompanyColorChange` + câblage

Juste après `handleCompanyDelete` (et avant `handleCompanyBulletAdd`), ajouter :

```js
function handleCompanyColorChange(item, field, color) {
  const colors = { ...(item.colors || {}) };
  if (color) colors[field] = color; else delete colors[field];
  handleCompanyEdit(item, { colors });
}
```

Dans l'appel à `initSidePanel({...})`, ajouter `onCompanyColorChange: handleCompanyColorChange,` juste après `onCompanyEdit: handleCompanyEdit,`.

## Contraintes globales

- Ne pas toucher à `firestoreClient.js`, `editableInput.js`, `colorPicker.js`/`.css` — le mécanisme d'écriture, l'input générique, et le composant de sélection de couleur restent inchangés et réutilisés tels quels.
- Ne pas ajouter de couleur sur `yahooSymbol`/`flag`/`country`/les libellés de stats — hors périmètre, confirmé contre la production.
- Ne pas toucher au tag de région d'entreprise (`companyRegionBg`/`companyRegionText`) — kind de couleur différent, traité séparément dans un futur plan si demandé.
- Ne pas toucher au portefeuille ni aux news — sections suivantes de cette série, dans leurs propres plans.

## Vérification

- `cd webapp && npx vitest run` doit rester vert, avec les nouveaux tests de `companyList.test.js`.
- `npm run build` doit rester propre.
- **Ce plan écrit dans Firestore de production** (nouveau champ `colors` sur des documents `mkg:content:entreprises:*` existants) — protocole de vérification obligatoire : créer une entreprise de test manifestement fictive (nom "TEST — À IGNORER"), en mode édition colorer son nom, sa capitalisation, une valeur de stat, et un bullet avec des couleurs différentes de la palette, confirmer visuellement que chaque couleur s'applique **immédiatement en mode édition** (pas seulement après sortie du mode édition — c'est précisément le bug de spécificité CSS corrigé préventivement par la tâche 2), confirmer que les couleurs persistent après un rechargement complet (hard reload), tester la réinitialisation (croix) sur au moins un champ, supprimer l'entreprise de test et confirmer la suppression après un nouveau rechargement ; spot-checker qu'au moins une entreprise réelle existante n'est pas affectée tout au long du test.
