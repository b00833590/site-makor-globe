---
title: Finir le color picker sur les indices de marché (name + weekChange)
date: 2026-07-22
status: draft
---

## Contexte

La phase 20 a introduit un color picker réutilisable (`webapp/src/admin/colorPicker.js`, `buildColorDot`/`COLOR_PALETTE`) et l'a branché sur un seul champ : la `value` des indices de marché (`webapp/src/panel/sidePanel.js`'s `renderIndices`). Les deux autres champs visibles d'une ligne d'indice — `name` et `weekChange` — n'ont toujours pas de couleur personnalisable, alors que la production (`index.html:1392,1396`) le permet pour les trois.

Ce plan ferme cet écart pour la section "indices de marché" uniquement (pas les entreprises/portefeuille/news/IA & Fintech — périmètre volontairement limité, cf. la règle "une section à la fois" du projet).

**Découverte importante en préparant ce plan** : `main.js`'s `handleIndexColorChange(item, field, color)` (ligne 114-118) est déjà générique sur le nom du champ :

```js
function handleIndexColorChange(item, field, color) {
  const colors = { ...(item.colors || {}) };
  if (color) colors[field] = color; else delete colors[field];
  handleIndexEdit(item, { colors });
}
```

**Zéro changement dans `main.js` n'est donc nécessaire** — exactement le même constat que la phase 17 (relabeling des stats entreprise). Tout le travail est dans `sidePanel.js`/`sidePanel.css`/`sidePanel.test.js`.

**Deuxième découverte** : contrairement à `value`, le champ `name` n'a aujourd'hui **aucune capacité d'édition** dans `webapp/` (`sidePanel.js:22-24` fait juste `name.textContent = [item.flag, item.name].filter(Boolean).join(' ')`, sans branche `isEditing`) — c'est un vrai écart avec la production, où `name` est éditable (`index.html:1392`, `data-field="name"`). "Finir les indices" implique donc de rendre `name` éditable (même pattern que `value` : `buildEditableInput`) en plus de lui ajouter une pastille de couleur — sinon un color picker sur un champ qu'on ne peut pas éditer n'aurait pas beaucoup de sens. Le `flag` (drapeau emoji) reste, lui, non éditable : c'est un champ à part en production, hors du périmètre de ce plan.

## Décisions de conception

- **`name`** : en mode édition, le drapeau reste un préfixe texte statique (`{flag} `), suivi d'un `buildEditableInput(item.name, 'text', 'panel-index-name-input', v => onEditItem(item, { name: v }))`, puis de la pastille de couleur. En lecture seule, comportement strictement inchangé (`textContent` = flag + nom joints).
- **`weekChange`** : a déjà une coloration automatique positive/negative via les classes CSS `.panel-index-change.positive`/`.negative`. Une couleur personnalisée doit gagner sur cette coloration automatique — exactement le même problème de spécificité CSS que `value` en phase 20, mais la solution est plus simple ici : un style inline (`change.style.color = customColor`) l'emporte toujours sur un sélecteur de classe, quelle que soit sa spécificité. Donc appliquer la couleur perso en style inline sur le `span.panel-index-change` (qui garde sa classe `positive`/`negative` pour le cas par défaut) suffit, sans toucher au CSS des classes existantes.
- Comme pour `value` en phase 20, le nouvel input `.panel-index-name-input` (et `.panel-index-change-input`, qui n'avait pas encore ce correctif) doivent recevoir `color: inherit` pour que la couleur perso reste visible pendant l'édition — sinon la couleur blanche codée en dur sur les inputs la masque (bug déjà rencontré et corrigé sur `value` en phase 20, cf. le commentaire existant dans `sidePanel.css:88-97`).

## Tâche 1 — `sidePanel.js` : étendre `renderIndices`

Fichier : `webapp/src/panel/sidePanel.js`

Remplacer le corps de la boucle de `renderIndices` (lignes ~18-46) par :

```js
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'panel-index-row';

    const name = document.createElement('span');
    name.className = 'panel-index-name';
    const nameColor = item.colors && item.colors.name;
    if (nameColor) name.style.color = nameColor;
    if (isEditing) {
      if (item.flag) name.appendChild(document.createTextNode(`${item.flag} `));
      name.appendChild(buildEditableInput(item.name, 'text', 'panel-index-name-input', v => onEditItem(item, { name: v })));
      name.appendChild(buildColorDot(nameColor, color => onColorChange(item, 'name', color)));
    } else {
      name.textContent = [item.flag, item.name].filter(Boolean).join(' ');
    }

    const value = document.createElement('span');
    value.className = 'panel-index-value';
    const valueColor = item.colors && item.colors.value;
    if (valueColor) value.style.color = valueColor;
    if (isEditing) {
      value.appendChild(buildEditableInput(item.value, 'text', 'panel-index-value-input', v => onEditItem(item, { value: v })));
      value.appendChild(buildColorDot(valueColor, color => onColorChange(item, 'value', color)));
    } else {
      value.textContent = item.value ?? '';
    }

    const change = document.createElement('span');
    const isNegative = Number(item.weekChange) < 0;
    change.className = `panel-index-change ${isNegative ? 'negative' : 'positive'}`;
    const changeColor = item.colors && item.colors.weekChange;
    if (changeColor) change.style.color = changeColor;
    if (isEditing) {
      change.appendChild(buildEditableInput(item.weekChange, 'number', 'panel-index-change-input', v => onEditItem(item, { weekChange: v })));
      change.appendChild(buildColorDot(changeColor, color => onColorChange(item, 'weekChange', color)));
    } else {
      change.textContent = `${item.weekChange}%`;
    }

    row.append(name, value, change);
```

Le reste de la fonction (bouton supprimer, bouton ajouter) est inchangé.

## Tâche 2 — `sidePanel.css` : styles pour l'input de nom + correctif `color: inherit`

Fichier : `webapp/src/panel/sidePanel.css`

`.panel-index-name-input` n'a pas besoin d'une largeur fixe de 64px comme value/change — un nom d'indice est plus long, donc largeur flexible pour ce sélecteur, séparé du bloc value/change existant.

Remplacer le bloc existant lignes 76-86 par :

```css
.panel-index-name-input {
  width: 100%;
  box-sizing: border-box;
  background: #0f1730;
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  padding: 2px 4px;
}

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
```

Puis étendre le commentaire + la règle `color: inherit` existante (lignes 88-97) pour couvrir les trois inputs :

```css
/* Overrides the shared color:#fff above so a custom color set on the parent
   .panel-index-name/.panel-index-value/.panel-index-change span (via the
   color picker) is visible while editing too, not just in the read-only
   view — an explicit color on this input would otherwise always win over
   the parent's inline style regardless of specificity, since inline styles
   don't cascade onto child elements that have their own explicit color.
   Resolves to the same white by default (inherited from .side-panel's own
   color:#fff, or from .positive/.negative for weekChange) when no custom
   color is set. */
.panel-index-name-input,
.panel-index-value-input,
.panel-index-change-input {
  color: inherit;
}
```

## Tâche 3 — Tests

Fichier : `webapp/src/panel/sidePanel.test.js`, dans le `describe('editable market indices', ...)` bloc (à partir de la ligne 212).

**3a. Corriger un test existant devenu ambigu** — le test `calls onColorChange with the item, "value", and the picked color when a swatch is chosen` (ligne ~277-289) utilise `indicesEl.querySelector('.color-dot')` en supposant qu'il n'y en a qu'un dans la ligne. Après ce plan, une ligne en édition en a trois (name/value/change). Corriger le sélecteur pour cibler explicitement celui de `value` :

```js
    it('calls onColorChange with the item, "value", and the picked color when a swatch is chosen', () => {
      const onColorChange = vi.fn();
      panel = initSidePanel({
        labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl, presentationsEl,
        onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {}, onIndexColorChange: onColorChange,
      });
      panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [], isEditing: true });

      indicesEl.querySelector('.panel-index-value .color-dot').click();
      document.getElementById('active-color-popup').querySelector('.color-swatch').click();

      expect(onColorChange).toHaveBeenCalledWith(ITEM, 'value', expect.any(String));
    });
```

(Écrire le test qui échoue d'abord avec le sélecteur générique pour confirmer qu'il casse bien avec le nouveau rendu, puis appliquer ce correctif — c'est le TDD RED/GREEN habituel de ce projet, appliqué ici à un test existant plutôt qu'à un nouveau.)

**3b. Nouveaux tests pour `name`** — à ajouter après le bloc de tests `value` existant :

```js
    it('renders name as an editable input with the flag as a static prefix, and calls onIndexEdit on change', () => {
      const onIndexEdit = vi.fn();
      panel = initSidePanel({ labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl, presentationsEl, onOpenChart: () => {}, onIndexEdit, onIndexAdd: () => {}, onIndexDelete: () => {} });
      panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [], isEditing: true });

      expect(indicesEl.querySelector('.panel-index-name').textContent).toContain(ITEM.flag);
      const nameInput = indicesEl.querySelector('.panel-index-name-input');
      expect(nameInput).not.toBeNull();
      nameInput.value = 'CAC 40 Renommé';
      nameInput.dispatchEvent(new Event('change'));

      expect(onIndexEdit).toHaveBeenCalledWith(ITEM, { name: 'CAC 40 Renommé' });
    });

    it('applies a custom color to the name span, in both read-only and editing modes, when the item has one', () => {
      const coloredItem = { ...ITEM, colors: { name: '#2f6fed' } };
      panel.showRegion('Europe', { marketItems: [coloredItem], newsItems: [] });
      expect(indicesEl.querySelector('.panel-index-name').style.color).toBe('rgb(47, 111, 237)');

      panel.showRegion('Europe', { marketItems: [coloredItem], newsItems: [], isEditing: true });
      expect(indicesEl.querySelector('.panel-index-name').style.color).toBe('rgb(47, 111, 237)');
    });

    it('renders a color dot next to the name input in edit mode, and calls onColorChange with "name"', () => {
      const onColorChange = vi.fn();
      panel = initSidePanel({
        labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl, presentationsEl,
        onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {}, onIndexColorChange: onColorChange,
      });
      panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [], isEditing: true });

      indicesEl.querySelector('.panel-index-name .color-dot').click();
      document.getElementById('active-color-popup').querySelector('.color-swatch').click();

      expect(onColorChange).toHaveBeenCalledWith(ITEM, 'name', expect.any(String));
    });
```

**3c. Nouveaux tests pour `weekChange`** :

```js
    it('renders a color dot next to the change input in edit mode', () => {
      panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [], isEditing: true });
      expect(indicesEl.querySelector('.panel-index-change .color-dot')).not.toBeNull();
    });

    it('applies a custom color to the change span that overrides the positive/negative class color', () => {
      const coloredItem = { ...ITEM, weekChange: 1.2, colors: { weekChange: '#9b59b6' } };
      panel.showRegion('Europe', { marketItems: [coloredItem], newsItems: [] });
      const change = indicesEl.querySelector('.panel-index-change');
      expect(change.classList.contains('positive')).toBe(true);
      expect(change.style.color).toBe('rgb(155, 89, 182)');
    });

    it('renders no custom color on the change span when the item has none', () => {
      panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [] });
      expect(indicesEl.querySelector('.panel-index-change').style.color).toBe('');
    });

    it('calls onColorChange with the item, "weekChange", and the picked color from the change color dot', () => {
      const onColorChange = vi.fn();
      panel = initSidePanel({
        labelEl, indicesEl, newsEl, companiesEl, compareEl, portfolioLabelEl, portfolioEl, iaFintechEl, presentationsEl,
        onOpenChart: () => {}, onIndexEdit: () => {}, onIndexAdd: () => {}, onIndexDelete: () => {}, onIndexColorChange: onColorChange,
      });
      panel.showRegion('Europe', { marketItems: [ITEM], newsItems: [], isEditing: true });

      indicesEl.querySelector('.panel-index-change .color-dot').click();
      document.getElementById('active-color-popup').querySelector('.color-swatch').click();

      expect(onColorChange).toHaveBeenCalledWith(ITEM, 'weekChange', expect.any(String));
    });
```

## Contraintes globales

- Aucun changement dans `main.js` (confirmé ci-dessus, `handleIndexColorChange` est déjà générique).
- `main.js`'s `onIndexColorChange: handleIndexColorChange` reste tel quel (déjà branché depuis la phase 20).
- Ne pas toucher au champ `flag` (reste non éditable — hors périmètre).
- Ne pas toucher aux autres types de contenu (entreprises/portefeuille/news/IA & Fintech) — périmètre volontairement limité aux indices de marché, décision explicite de l'utilisateur pour ce plan.

## Vérification

- `cd webapp && npx vitest run` doit rester vert, avec le nombre de tests en hausse d'environ 8 (1 test existant reformulé + ~7 nouveaux : 1 pour l'édition du nom, 2 pour sa couleur, 2 pour la couleur de weekChange, 1 pour l'absence de couleur, 1 pour le callback weekChange — le compte exact peut varier légèrement selon le détail final).
- Aucune interaction Firestore nouvelle (le seul point d'écriture, `handleIndexColorChange`, est inchangé) — mais comme il s'agit toujours d'une fonctionnalité d'édition en mode admin, vérifier manuellement en base Firestore de production réelle avant merge, avec un indice de test manifestement fictif : renommer son nom en édition, lui appliquer une couleur sur le nom ET sur weekChange, confirmer que tout persiste après un rechargement complet, puis nettoyer l'indice de test. Vérifier que les indices réels ne sont pas affectés.
