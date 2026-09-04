---
title: Timeline des semaines avec infobulle + panneau latéral rétractable et repositionnement du globe
date: 2026-07-23
status: draft
---

## Contexte

Trois améliorations UI/UX demandées par l'utilisateur pour `webapp/`, aucune n'implique d'écriture Firestore (purement visuel/layout, zéro nouveau champ de donnée) :

1. Les ronds de la timeline des semaines (`webapp/src/timeline/weekTimeline.js`) n'ont pour l'instant qu'un `aria-label` (accessible, mais invisible sans lecteur d'écran) — aucune infobulle visuelle au survol.
2. Le panneau latéral (`.side-panel`) est aujourd'hui **toujours visible**, en `position:fixed` occupant `--panel-width` (340px) à droite en permanence.
3. Le globe (`#globe-container`, `position:fixed; inset:0`) occupe déjà toute la largeur du viewport, mais reste visuellement "poussé" derrière le panneau plutôt que de vraiment libérer/reprendre l'espace selon que le panneau est ouvert ou fermé.

Périmètre : uniquement `webapp/` (la refonte), pas de changement Firestore, pas de nouvelle donnée. Vérification manuelle = visuelle uniquement (pas de protocole "donnée de test à nettoyer").

## Décisions de conception

- **Infobulle de semaine** : au survol d'un rond, affiche directement `week.label` — confirmé avec l'utilisateur que ce libellé existant (ex. "Semaine 20-24 JUILLET") est déjà exactement ce qui doit apparaître (c'est le même texte que celui affiché en haut à gauche en mode édition pour cette semaine), donc aucun numéro de semaine à calculer séparément, aucun parsing de date, aucune nouvelle donnée. Implémentation calquée **exactement** sur le pattern déjà établi de `webapp/src/admin/colorPicker.js` (`openColorPopup`/`closeColorPopup` : un élément unique identifié par id, créé à la demande, `remove()`-é à la fermeture — pas de singleton caché avec classe `visible`, pour rester cohérent avec le seul autre composant "popup flottant" du projet). Un tooltip HTML `title` natif est explicitement écarté : délai OS (~700ms-1s), non stylable, ne satisfait pas "élégante" ni "instantanément".
- **Panneau rétractable** : approche par classe sur `<body>` (`body.panel-open`), pas de classe `.collapsed` sur `.side-panel` lui-même — l'état "réduit" est simplement l'état *par défaut* de `.side-panel` (`transform: translateX(100%)`), et `body.panel-open .side-panel` l'amène à `translateX(0)`. Replié par défaut au chargement (aucune persistance entre sessions — pas demandé, YAGNI). Nouveau module pur et testable `webapp/src/panel/panelToggle.js`, symétrique des autres petits modules admin (`toast.js`, `uid.js`) : aucune dépendance à `globe.gl`/Firestore, donc entièrement unit-testable en jsdom.
- **Repositionnement du globe** : `#globe-container` passe de `right:0` (replié, pleine largeur) à `right: var(--panel-width)` (ouvert) via une transition CSS sur `right`. Comme `globe.gl`/three.js ne redimensionne son canvas que lorsqu'on appelle explicitement `world.width()/height()`, un changement de taille CSS pur du conteneur ne suffit pas à faire "respirer" le globe pendant la transition — sans mise à jour continue, le canvas resterait à son ancienne taille jusqu'à un `resize` de fenêtre. Solution : un `ResizeObserver` sur le conteneur dans `globeScene.js`, qui appelle `world.width(container.clientWidth).height(container.clientHeight)` à chaque changement de taille réel du conteneur — **remplace** l'actuel `window.addEventListener('resize', ...)`, qui devient un cas particulier strictement couvert par le `ResizeObserver` (le conteneur étant `inset:0`, sa taille change déjà à chaque resize de fenêtre). Ce mécanisme fait aussi bouger/recentrer le globe en continu et fluidement pendant l'animation CSS d'ouverture/fermeture du panneau, sans que `main.js` ait besoin d'orchestrer quoi que ce soit à la main.
- **Contrôles qui doivent suivre** (pour éviter tout chevauchement, cf. exigence 3) : `.arrow-next` (actuellement toujours calé à `right: calc(var(--panel-width) + 20px)`, comme si le panneau était toujours ouvert) et `.region-indicator` (actuellement centré sur `left:50%` par rapport à tout le viewport). Les deux reçoivent un état "replié" par défaut (position pleine-largeur) et un override `body.panel-open` (position recentrée sur la zone libérée par le panneau), avec la même transition. Les boutons du coin supérieur droit (`edit-toggle-btn`, `undo-all-btn`, `export-pdf-btn`) restent inchangés : ils sont déjà positionnés au-dessus de la bande occupée par le panneau (`top:16px` contre `top:44px` pour `.side-panel`), donc jamais en chevauchement, qu'il soit ouvert ou fermé.
- **Interaction avec l'export PDF (leçon des phases 13/16)** : `.side-panel.pdf-export` doit **toujours** neutraliser le `transform` de repli, quel que soit l'état d'ouverture au moment du clic — sinon exporter un PDF pendant que le panneau est replié capturerait un élément hors écran (même classe de bug que le "734x0" de la phase 13 : `html2canvas` ne capture que ce qui est réellement mis en page/visible). `.side-panel.pdf-export { transform: none; transition: none; }` — le `transition:none` est nécessaire pour que le panneau redevienne visible **instantanément** au moment du clic plutôt que de laisser l'animation de 350ms se dérouler pendant que `html2canvas` capture déjà (risque de capture à mi-transition). Cette règle à 2 classes (`.side-panel.pdf-export`) l'emporte déjà par spécificité CSS sur la règle par défaut à 1 classe (`.side-panel`), donc aucun `!important` n'est nécessaire.
- **Accessibilité, délibérément hors périmètre** : le panneau replié n'est pas rendu `aria-hidden`/`inert` (les champs qu'il contient restent techniquement atteignables au clavier via Tab même hors écran) — écart mineur, cohérent avec le niveau de rigueur ARIA déjà présent ailleurs dans ce projet (les modales existantes ne piègent pas non plus le focus). Noté comme dette non bloquante, pas corrigé dans ce plan.
- **Aucun test dédié pour le `ResizeObserver` de `globeScene.js`** : ce fichier n'a jamais eu de fichier de test (contrairement à `camera.js`/`cycle.js`/`regions.js` du même dossier) car il instancie `globe.gl`, qui nécessite un vrai contexte WebGL absent de jsdom — cohérent avec la convention déjà établie du projet de ne pas unit-tester les wrappers de bibliothèques de rendu externes (ex. `html2pdf.js`). Vérifié uniquement manuellement dans le navigateur.

## Tâche 1 — Infobulle de semaine : `webapp/src/timeline/weekTimeline.js`

Remplacer le contenu du fichier par :

```js
function closeTooltip() {
  document.getElementById('active-week-tooltip')?.remove();
}

function showTooltip(dot, label) {
  closeTooltip();
  const rect = dot.getBoundingClientRect();
  const tooltip = document.createElement('div');
  tooltip.id = 'active-week-tooltip';
  tooltip.className = 'week-tooltip';
  tooltip.textContent = label;
  tooltip.style.top = `${rect.top + rect.height / 2}px`;
  tooltip.style.left = `${rect.right + 10}px`;
  document.body.appendChild(tooltip);
}

export function initWeekTimeline({ container, weeks, activeWeekId, onSelect }) {
  let currentWeeks = weeks;

  function render(currentActiveId) {
    container.replaceChildren();
    for (const week of currentWeeks) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'week-dot' + (week.id === currentActiveId ? ' active' : '');
      dot.setAttribute('aria-label', week.label);
      dot.addEventListener('mouseenter', () => showTooltip(dot, week.label));
      dot.addEventListener('mouseleave', closeTooltip);
      dot.addEventListener('click', () => {
        closeTooltip();
        onSelect(week.id);
        render(week.id);
      });
      container.appendChild(dot);
    }
  }

  render(activeWeekId);

  return {
    setWeeks(newWeeks, newActiveWeekId) {
      closeTooltip();
      currentWeeks = newWeeks;
      render(newActiveWeekId);
    },
  };
}
```

`closeTooltip()` sur `click` et dans `setWeeks` évite qu'un tooltip reste affiché pointant vers un rond qui vient d'être retiré du DOM (ex. survol pendant qu'un admin renomme/supprime une semaine ailleurs). Le libellé affiché (`week.label`) est déjà le même texte que celui montré en haut à gauche du mode édition pour cette semaine (ex. "Semaine 20-24 JUILLET") — aucun formatage supplémentaire.

## Tâche 2 — CSS de l'infobulle : `webapp/src/timeline/weekTimeline.css`

Ajouter à la fin du fichier existant :

```css
.week-tooltip {
  position: fixed;
  z-index: 50;
  transform: translateY(-50%);
  background: #0f1730;
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--gold-light, #e0b53d);
  font-size: 12px;
  font-weight: bold;
  pointer-events: none;
  white-space: nowrap;
  animation: week-tooltip-in 0.12s ease-out;
}

@keyframes week-tooltip-in {
  from { opacity: 0; transform: translateY(-50%) translateX(-4px); }
  to { opacity: 1; transform: translateY(-50%) translateX(0); }
}
```

`pointer-events: none` évite que le tooltip lui-même intercepte la souris (il apparaît juste à côté du rond survolé) et déclenche un flicker mouseleave/mouseenter parasite.

### Tests — ajouter à `webapp/src/timeline/weekTimeline.test.js`

Ajouter un `afterEach` (import `afterEach` en plus de `describe, it, expect, vi`) et un nouveau bloc `describe`, en suivant exactement le même pattern de nettoyage que `webapp/src/admin/colorPicker.test.js` :

```js
afterEach(() => {
  document.getElementById('active-week-tooltip')?.remove();
});

describe('week hover tooltip', () => {
  it('shows the week label on hover', () => {
    const container = document.createElement('div');
    initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    container.querySelectorAll('.week-dot')[1].dispatchEvent(new MouseEvent('mouseenter'));
    const tooltip = document.getElementById('active-week-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip.textContent).toBe('Semaine 2');
  });

  it('removes the tooltip on mouseleave', () => {
    const container = document.createElement('div');
    initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    const dot = container.querySelectorAll('.week-dot')[0];
    dot.dispatchEvent(new MouseEvent('mouseenter'));
    dot.dispatchEvent(new MouseEvent('mouseleave'));
    expect(document.getElementById('active-week-tooltip')).toBeNull();
  });

  it('removes the tooltip when a dot is clicked', () => {
    const container = document.createElement('div');
    initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    const dot = container.querySelectorAll('.week-dot')[0];
    dot.dispatchEvent(new MouseEvent('mouseenter'));
    dot.click();
    expect(document.getElementById('active-week-tooltip')).toBeNull();
  });

  it('closes a stale tooltip when the timeline re-renders via setWeeks', () => {
    const container = document.createElement('div');
    const timeline = initWeekTimeline({ container, weeks: WEEKS, activeWeekId: 'w1', onSelect: () => {} });
    container.querySelectorAll('.week-dot')[0].dispatchEvent(new MouseEvent('mouseenter'));
    timeline.setWeeks(WEEKS, 'w2');
    expect(document.getElementById('active-week-tooltip')).toBeNull();
  });
});
```

Réutilise le fixture `WEEKS` déjà défini en haut du fichier (`{ id: 'w1', label: 'Semaine 1', order: 0 }`, `{ id: 'w2', label: 'Semaine 2', order: 1 }`) — pas besoin d'un nouveau fixture, on affiche directement `label`.

## Tâche 3 — Nouveau module `webapp/src/panel/panelToggle.js`

```js
export function initPanelToggle({ toggleBtn, bodyEl, defaultOpen = false }) {
  let isOpen = defaultOpen;

  function apply() {
    bodyEl.classList.toggle('panel-open', isOpen);
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
    toggleBtn.setAttribute('aria-label', isOpen ? 'Masquer le panneau d\'informations' : 'Afficher le panneau d\'informations');
    toggleBtn.textContent = isOpen ? '›' : '‹';
  }

  function open() {
    isOpen = true;
    apply();
  }

  function close() {
    isOpen = false;
    apply();
  }

  function toggle() {
    isOpen = !isOpen;
    apply();
  }

  toggleBtn.addEventListener('click', toggle);
  apply();

  return { isOpen: () => isOpen, open, close, toggle };
}
```

### Tests — `webapp/src/panel/panelToggle.test.js`

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { initPanelToggle } from './panelToggle.js';

function makeElements() {
  return {
    toggleBtn: document.createElement('button'),
    rootEl: document.createElement('div'),
  };
}

describe('initPanelToggle', () => {
  it('defaults to collapsed (no panel-open class, aria-expanded false) when defaultOpen is not passed', () => {
    const { toggleBtn, rootEl } = makeElements();
    initPanelToggle({ toggleBtn, bodyEl: rootEl });
    expect(rootEl.classList.contains('panel-open')).toBe(false);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the panel and updates aria-expanded/icon when open() is called', () => {
    const { toggleBtn, rootEl } = makeElements();
    const panel = initPanelToggle({ toggleBtn, bodyEl: rootEl });
    panel.open();
    expect(rootEl.classList.contains('panel-open')).toBe(true);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
    expect(toggleBtn.textContent).toBe('›');
  });

  it('closes the panel when close() is called', () => {
    const { toggleBtn, rootEl } = makeElements();
    const panel = initPanelToggle({ toggleBtn, bodyEl: rootEl, defaultOpen: true });
    panel.close();
    expect(rootEl.classList.contains('panel-open')).toBe(false);
    expect(toggleBtn.textContent).toBe('‹');
  });

  it('toggles state on button click', () => {
    const { toggleBtn, rootEl } = makeElements();
    initPanelToggle({ toggleBtn, bodyEl: rootEl });
    toggleBtn.click();
    expect(rootEl.classList.contains('panel-open')).toBe(true);
    toggleBtn.click();
    expect(rootEl.classList.contains('panel-open')).toBe(false);
  });

  it('exposes the current open state via isOpen()', () => {
    const { toggleBtn, rootEl } = makeElements();
    const panel = initPanelToggle({ toggleBtn, bodyEl: rootEl });
    expect(panel.isOpen()).toBe(false);
    panel.open();
    expect(panel.isOpen()).toBe(true);
  });
});
```

## Tâche 4 — CSS du bouton toggle : nouveau `webapp/src/panel/panelToggle.css`

```css
.panel-toggle-btn {
  position: fixed;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  width: 28px;
  height: 56px;
  border-radius: 6px 0 0 6px;
  background: rgba(15, 23, 48, 0.9);
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-right: none;
  color: var(--gold-light, #e0b53d);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  z-index: 6;
  transition: right 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-toggle-btn:hover {
  background: rgba(201, 151, 31, 0.25);
}

body.panel-open .panel-toggle-btn {
  right: var(--panel-width, 340px);
}
```

## Tâche 5 — `webapp/src/panel/sidePanel.css` : état replié par défaut

Dans le bloc `.side-panel` existant (lignes 5-19), ajouter `transform: translateX(100%);` et `transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);`. Puis ajouter juste après :

```css
body.panel-open .side-panel {
  transform: translateX(0);
}

/* L'export PDF doit toujours capturer le panneau entièrement visible, quel
   que soit l'état replié/ouvert au moment du clic — sinon html2canvas
   capture un élément hors écran (même classe de bug que le "734x0" de la
   phase 13). transition:none évite qu'il se figure à mi-animation pendant
   que la capture démarre : le panneau doit apparaître instantanément. */
.side-panel.pdf-export {
  transform: none;
  transition: none;
}
```

## Tâche 6 — `webapp/src/styles/globe.css` : repositionnement du globe et des contrôles

Modifier `#globe-container` (lignes 21-24) :

```css
#globe-container {
  position: fixed;
  inset: 0;
  right: 0;
  transition: right 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

body.panel-open #globe-container {
  right: var(--panel-width, 340px);
}
```

Modifier `.region-indicator` (lignes 26-39) : ajouter `transition: left 0.35s cubic-bezier(0.4, 0, 0.2, 1);` à la règle existante, puis ajouter après :

```css
body.panel-open .region-indicator {
  left: calc((100% - var(--panel-width, 340px)) / 2);
}
```

Modifier `.arrow-next` (lignes 66-68) : remplacer `right: calc(var(--panel-width, 340px) + 20px);` par `right: 20px;` et ajouter `transition: right 0.35s cubic-bezier(0.4, 0, 0.2, 1);`, puis ajouter après :

```css
body.panel-open .arrow-next {
  right: calc(var(--panel-width, 340px) + 20px);
}
```

## Tâche 7 — `webapp/src/globe/globeScene.js` : ResizeObserver

Remplacer :

```js
  window.addEventListener('resize', () => {
    world.width(container.clientWidth).height(container.clientHeight);
  });
```

par :

```js
  // Remplace un simple listener window:resize — un ResizeObserver sur le
  // conteneur couvre déjà le resize de fenêtre (le conteneur est en
  // position:fixed; inset:0, donc sa taille suit toujours celle du viewport)
  // ET capte en plus les changements de taille purement CSS (ex. l'animation
  // d'ouverture/fermeture du panneau latéral), pour que le globe se
  // redimensionne et se recentre en continu et fluidement pendant la
  // transition, sans que main.js ait à orchestrer quoi que ce soit.
  const resizeObserver = new ResizeObserver(() => {
    world.width(container.clientWidth).height(container.clientHeight);
  });
  resizeObserver.observe(container);
```

## Tâche 8 — `webapp/index.html` : markup du bouton toggle

Ajouter, juste avant `<aside class="side-panel">` :

```html
  <button id="panel-toggle-btn" class="panel-toggle-btn" type="button" aria-expanded="false" aria-label="Afficher le panneau d'informations">‹</button>
```

## Tâche 9 — Câblage dans `webapp/src/main.js`

Ajouter aux imports CSS (avec les autres, en haut) :

```js
import './panel/panelToggle.css';
```

Ajouter à l'import de module :

```js
import { initPanelToggle } from './panel/panelToggle.js';
```

Juste après le bloc existant `prevBtn.addEventListener('click', ...); nextBtn.addEventListener('click', ...);` (vers la ligne 574-575), ajouter :

```js
initPanelToggle({
  toggleBtn: document.getElementById('panel-toggle-btn'),
  bodyEl: document.body,
});
```

Aucune autre section de `main.js` n'a besoin de connaître l'état ouvert/fermé du panneau (l'export PDF s'appuie uniquement sur la classe CSS `.pdf-export`, indépendante de cet état).

## Contraintes globales

- Aucun changement de comportement des fonctions `renderXxx` du panneau (indices/entreprises/news/IA & Fintech/portefeuille) — le panneau replié reste entièrement présent dans le DOM, seul son affichage visuel change (transform), donc aucune régression possible sur le rendu du contenu.
- Ne pas toucher aux boutons du coin supérieur droit (`edit-toggle-btn`, `undo-all-btn`, `export-pdf-btn`) — déjà positionnés au-dessus de la zone du panneau, aucun chevauchement avant ou après ce plan.
- Ne pas ajouter de persistance (localStorage) de l'état ouvert/fermé — replié par défaut à chaque chargement, comme demandé.
- Ne pas introduire de logique de repli spécifique au mobile (le projet reste desktop-only, décision utilisateur déjà actée).

## Vérification

- `cd webapp && npx vitest run` doit rester vert, avec ~9 tests en plus (4 pour le tooltip de la timeline + 5 pour `panelToggle.js`, le compte exact peut varier légèrement).
- `npm run build` doit rester propre.
- Aucune interaction Firestore — vérification manuelle **visuelle uniquement**, dans le navigateur (pas besoin de donnée de test à créer/nettoyer) :
  - Au chargement, le panneau est replié, le globe occupe toute la largeur, le bouton toggle est visible à droite avec un chevron `‹`.
  - Clic sur le bouton : le panneau glisse depuis la droite, le globe se redimensionne et se recentre progressivement vers la gauche pendant la même durée, sans saccade ni chevauchement avec les flèches/l'indicateur de région ; le chevron devient `›`.
  - Re-clic : l'animation inverse se déroule proprement, retour à l'état replié.
  - Survol de plusieurs ronds de la timeline : l'infobulle apparaît quasi instantanément avec le bon libellé de semaine (le même texte que celui affiché en haut à gauche du mode édition pour cette semaine) ; disparaît au survol suivant ou au clic, sans laisser de résidu.
  - Rotation/zoom du globe, clic sur un point/marker, navigation flèches précédente/suivante, changement de semaine via la timeline : toujours fonctionnels après ces changements, dans les deux états (replié/ouvert).
  - Export PDF (bouton "📄 Exporter en PDF") déclenché une fois avec le panneau **replié** : le PDF généré doit contenir le contenu complet du panneau (pas une page vide/tronquée) — c'est le test qui couvrirait une régression du type phase 13.
