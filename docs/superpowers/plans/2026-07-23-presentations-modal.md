---
title: Sortir les présentations IA & Fintech du panneau vers une fenêtre modale indépendante
date: 2026-07-23
status: draft
---

## Contexte

Deuxième des quatre plans issus d'une demande étendue d'amélioration ergonomique/esthétique (point 5). Aucune interaction Firestore nouvelle — ce plan ne fait que déplacer où le contenu déjà chargé s'affiche, sans toucher à comment il est chargé/écrit.

**Découverte importante en préparant ce plan** : les présentations sont déjà techniquement indépendantes du panneau — `renderPresentations` (`webapp/src/panel/presentations.js`, inchangé depuis la phase 22) est un composant pur qui prend un `container` en paramètre, et `main.js` lui passe déjà `getPresentations(db)` (données **liées à la semaine uniquement, pas à la région** — confirmé ligne 553 de `main.js`) — donc peu importe où ce `container` vit dans le DOM, le contenu affiché est toujours correct quelle que soit la région active. **Zéro changement nécessaire dans `sidePanel.js`, `selectors.js`, `presentationPdf.js` ou `presentationUpload.js`** — ce plan ne touche que `index.html` (déplacer le markup), un nouveau petit composant modal, et le CSS.

## Décisions de conception

- **Composant modal** : nouveau `webapp/src/panel/presentationsModal.js`, calqué sur le pattern le plus simple déjà établi dans ce projet (`webapp/src/admin/passwordModal.js` : `open()`/`close()` togglant une classe `open`, pas de logique async contrairement à `chartModal.js` qui n'a pas besoin d'être imité ici).
- **Élément `#panel-presentations`** : conserve exactement le même `id`, simplement déplacé dans le markup HTML de l'ancienne position (dans `<aside class="side-panel">`, juste après la grille IA & Fintech) vers l'intérieur de la nouvelle modale. `main.js`'s `presentationsEl: document.getElementById('panel-presentations')` (passé à `initSidePanel`) n'a donc besoin d'aucune modification.
- **Bouton déclencheur** : un petit bouton circulaire flottant et discret, positionné en bas à gauche de l'écran (`bottom: 20px; left: 54px` — volontairement décalé de 54px pour ne pas chevaucher la colonne de la timeline des semaines, large de 34px, qui occupe déjà tout le bord gauche), plutôt qu'ajouté au groupe déjà chargé de boutons en haut à droite (`edit-toggle-btn`/`undo-all-btn`/`export-pdf-btn`) — cohérent avec la demande explicite de discrétion et avec le plan précédent qui vise justement à désencombrer cette même zone.

## Tâche 1 — Nouveau module `webapp/src/panel/presentationsModal.js`

```js
export function initPresentationsModal({ modalEl, closeBtn, triggerBtn }) {
  function open() {
    modalEl.classList.add('open');
  }

  function close() {
    modalEl.classList.remove('open');
  }

  triggerBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);

  return { open, close };
}
```

### Tests — `webapp/src/panel/presentationsModal.test.js`

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { initPresentationsModal } from './presentationsModal.js';

function makeElements() {
  return {
    modalEl: document.createElement('div'),
    closeBtn: document.createElement('button'),
    triggerBtn: document.createElement('button'),
  };
}

describe('initPresentationsModal', () => {
  it('opens the modal when the trigger button is clicked', () => {
    const { modalEl, closeBtn, triggerBtn } = makeElements();
    initPresentationsModal({ modalEl, closeBtn, triggerBtn });
    triggerBtn.click();
    expect(modalEl.classList.contains('open')).toBe(true);
  });

  it('closes the modal when the close button is clicked', () => {
    const { modalEl, closeBtn, triggerBtn } = makeElements();
    const modal = initPresentationsModal({ modalEl, closeBtn, triggerBtn });
    modal.open();
    closeBtn.click();
    expect(modalEl.classList.contains('open')).toBe(false);
  });

  it('exposes open()/close() programmatically, independent of the buttons', () => {
    const { modalEl, closeBtn, triggerBtn } = makeElements();
    const modal = initPresentationsModal({ modalEl, closeBtn, triggerBtn });
    modal.open();
    expect(modalEl.classList.contains('open')).toBe(true);
    modal.close();
    expect(modalEl.classList.contains('open')).toBe(false);
  });
});
```

## Tâche 2 — `webapp/index.html` : déplacer le markup

Retirer la ligne suivante de l'intérieur de `<aside class="side-panel">` (elle se trouve juste après `<div id="panel-ia-fintech"></div>`) :

```html
    <div id="panel-presentations" class="presentations-grid"></div>
```

Ajouter, juste avant `<aside class="side-panel">`, le bouton déclencheur et le markup de la modale :

```html
  <button id="presentations-trigger-btn" class="presentations-trigger-btn" type="button" aria-label="Présentations IA & Fintech" title="Présentations IA & Fintech">📊</button>
  <div id="presentations-modal" class="presentations-modal">
    <div class="presentations-modal-content">
      <div class="presentations-modal-header">
        <h3>📊 Présentations IA & Fintech</h3>
        <button id="presentations-modal-close" type="button" aria-label="Fermer">✕</button>
      </div>
      <div id="panel-presentations" class="presentations-grid"></div>
    </div>
  </div>
```

## Tâche 3 — Nouveau `webapp/src/panel/presentationsModal.css`

```css
.presentations-trigger-btn {
  position: fixed;
  bottom: 20px;
  left: 54px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(15, 23, 48, 0.9);
  border: 1px solid rgba(224, 181, 61, 0.4);
  color: var(--gold-light, #e0b53d);
  font-size: 16px;
  cursor: pointer;
  z-index: 6;
}

.presentations-trigger-btn:hover {
  background: rgba(201, 151, 31, 0.25);
}

.presentations-modal {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 20;
  align-items: center;
  justify-content: center;
}

.presentations-modal.open {
  display: flex;
}

.presentations-modal-content {
  background: rgba(15, 23, 48, 0.98);
  border: 1px solid rgba(224, 181, 61, 0.3);
  border-radius: 8px;
  padding: 20px;
  width: 90%;
  max-width: 640px;
  max-height: 80vh;
  overflow-y: auto;
  box-sizing: border-box;
}

.presentations-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.presentations-modal-header h3 {
  color: #fff;
  font-size: 15px;
  margin: 0;
}

.presentations-modal-header button {
  background: transparent;
  border: none;
  color: var(--gold-light, #e0b53d);
  cursor: pointer;
  font-size: 16px;
}
```

`.presentations-grid` lui-même (dans `presentations.css`, inchangé) continue de fonctionner tel quel à l'intérieur de ce nouveau conteneur plus large — c'est déjà une grille `repeat(auto-fill, minmax(120px, 1fr))`, elle affichera simplement plus de colonnes dans une modale de 640px que dans l'ancien panneau de 340px, ce qui est le comportement souhaité.

## Tâche 4 — Câblage dans `webapp/src/main.js`

Ajouter aux imports CSS :

```js
import './panel/presentationsModal.css';
```

Ajouter à l'import de module :

```js
import { initPresentationsModal } from './panel/presentationsModal.js';
```

Juste après le bloc existant `initPanelToggle({...});` (phase 26), ajouter :

```js
initPresentationsModal({
  modalEl: document.getElementById('presentations-modal'),
  closeBtn: document.getElementById('presentations-modal-close'),
  triggerBtn: document.getElementById('presentations-trigger-btn'),
});
```

Aucun autre changement dans `main.js` — `presentationsEl: document.getElementById('panel-presentations')` (déjà présent dans l'appel à `initSidePanel`) continue de fonctionner sans modification puisque l'id de l'élément n'a pas changé, seulement son emplacement dans le DOM.

## Contraintes globales

- Aucun changement dans `sidePanel.js`, `presentations.js`, `presentations.css`, `selectors.js`, `presentationPdf.js`, `presentationUpload.js`, `presentationUploadModal.js` — tout le comportement d'ouverture/renommage/suppression/ajout des présentations reste strictement identique, seul son emplacement visuel change.
- Ne pas ajouter le bouton déclencheur au groupe de boutons du coin supérieur droit — décision explicite pour ne pas re-encombrer une zone que le plan précédent vise justement à désencombrer.
- Ne pas toucher aux points 1, 2, 4, 3, 6 de la demande (traités dans des plans séparés).

## Vérification

- `cd webapp && npx vitest run` doit rester vert, avec 3 tests de plus (`presentationsModal.test.js`).
- `npm run build` doit rester propre.
- Aucune interaction Firestore nouvelle — vérification manuelle **visuelle uniquement** dans le navigateur :
  - Le bouton 📊 est visible en bas à gauche, sans chevaucher la timeline des semaines.
  - Clic dessus : la modale s'ouvre avec la grille de présentations existante (les vraies présentations réelles), plus spacieuse qu'avant.
  - Le panneau latéral n'affiche plus du tout de section présentations.
  - Ouvrir une présentation depuis la modale fonctionne toujours (comportement de la phase 22, inchangé).
  - En mode édition : renommer/supprimer/ajouter une présentation depuis la modale fonctionne toujours.
  - Changer de région/semaine pendant que la modale est ouverte ou fermée n'affecte pas la liste affichée (les présentations sont liées à la semaine, pas à la région — déjà vrai avant ce plan).
  - Fermeture de la modale (bouton ✕) fonctionne.
