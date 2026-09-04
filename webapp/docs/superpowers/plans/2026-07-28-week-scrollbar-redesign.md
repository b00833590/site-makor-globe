---
title: Scrollbar de navigation des semaines — refonte esthétique
date: 2026-07-28
status: draft
---

## Contexte

Un des 3 plans demandés dans une seule mission utilisateur (scrollbar, redirection Éditer, sync live), exécutés en parallèle (3 worktrees), conformément à la convention déjà établie sur ce projet. Ce plan est le seul des trois entièrement autonome (aucune dépendance avec les deux autres, aucune interaction Firestore).

**Constat actuel** (`webapp/src/timeline/weekTimeline.css`) : le bandeau `.week-timeline` utilise `overflow-x: auto` avec `scrollbar-width: thin` et un `::-webkit-scrollbar { height: 4px }` sans aucune personnalisation de couleur du thumb/track — c'est donc la barre de défilement native du navigateur, non stylée, ce qui explique l'aspect "basique" signalé par l'utilisateur.

**Portée confirmée avec l'utilisateur en amont** : liberté de conception totale a été donnée ("Tu es libre de proposer une solution plus moderne..."). Choix retenu ici : conserver le mécanisme d'onglets horizontaux existant (simple, déjà fonctionnel, déjà couvert par des tests) et l'habiller d'une scrollbar personnalisée + d'indicateurs de débordement (fondus latéraux) + d'un défilement plus doux (scroll-snap), plutôt que de réinventer un carrousel — répond à "conserver une excellente fluidité de navigation" avec le risque le plus faible.

## Décisions de conception

- **API publique inchangée** : `initWeekTimeline({container, weeks, activeWeekId, onSelect}) => {setWeeks}` reste strictement identique — zéro changement dans `main.js`. Ce plan touche uniquement `weekTimeline.js`/`.css`.
- **Scrollbar personnalisée en Chromium** (`::-webkit-scrollbar-thumb`/`-track`) — cible réaliste vu que ce projet a toujours été vérifié/testé sur Chrome (voir tout l'historique de vérification manuelle via `claude-in-chrome`). Fallback `scrollbar-color` pour Firefox (moins riche, mais jamais le style natif brut par défaut).
- **États d'opacité** : thumb quasi invisible au repos (`opacity: 0.25`), pleinement visible au survol du conteneur (`:hover`) et pendant le défilement actif (nouvelle classe `.is-scrolling`, posée par un listener `scroll` passif et retirée après un court délai sans nouvel événement — évite de garder la classe collée indéfiniment).
- **Indicateurs de débordement** : deux fondus latéraux (dégradé vers la couleur de fond du bandeau) affichés uniquement quand il y a réellement du contenu caché de ce côté — calculé au scroll/resize via `scrollLeft`/`scrollWidth`/`clientWidth`, pas en CSS pur (un dégradé toujours visible aux deux bords serait trompeur une fois arrivé en bout de liste).
- **`scroll-snap`** : `scroll-snap-type: x proximity` sur le conteneur, `scroll-snap-align: start` sur chaque onglet — un compromis "proximity" (pas "mandatory") pour ne jamais gêner un clic ou un `scrollIntoView` programmatique déjà utilisé par `render()` pour centrer l'onglet actif.
- **Animations légères** : transitions `opacity`/`background-color` uniquement (propriétés compositor-friendly, cohérent avec les règles de performance de ce projet) — jamais de transition sur `width`/`height`/`padding`.

## Tâche 1 — `webapp/src/timeline/weekTimeline.css` : scrollbar personnalisée + fondus

**Structure DOM importante** : `#week-timeline`'s parent direct dans `index.html` est `<header id="top-banner">`, partagé avec `.top-banner-search` (qui a probablement déjà sa propre logique de positionnement pour son dropdown de résultats). Ne pas donner `position: relative` à `#top-banner`/`.top-banner` pour ancrer les fondus — cela pourrait perturber le positionnement d'autres éléments déjà absolus dans ce bandeau (ex. `#top-banner-search-results`). À la place, `weekTimeline.js` (Tâche 2) crée son **propre wrapper dédié** autour de `container` au moment de l'initialisation, qui porte lui-même `position: relative` — aucune dépendance sur le CSS existant de `#top-banner`, aucun changement de `index.html` nécessaire.

Remplacer le bloc `.week-timeline` existant (lignes 1-16) par :

```css
.week-timeline-wrap {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
}

.week-timeline {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 12px;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
  scrollbar-color: rgba(224, 181, 61, 0.25) transparent;
}

.week-timeline::-webkit-scrollbar {
  height: 5px;
}

.week-timeline::-webkit-scrollbar-track {
  background: transparent;
}

.week-timeline::-webkit-scrollbar-thumb {
  background: rgba(224, 181, 61, 0.25);
  border-radius: 3px;
  transition: background-color 0.2s ease;
}

.week-timeline:hover::-webkit-scrollbar-thumb,
.week-timeline.is-scrolling::-webkit-scrollbar-thumb {
  background: rgba(224, 181, 61, 0.7);
}
```

Ajouter, dans le même fichier, les fondus latéraux (nouveaux éléments frères de `.week-timeline`, voir Tâche 2 pour leur insertion DOM) :

```css
.week-timeline-fade {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 28px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 1;
}

.week-timeline-fade-left {
  left: 0;
  background: linear-gradient(to right, var(--navy, #0f1730), transparent);
}

.week-timeline-fade-right {
  right: 0;
  background: linear-gradient(to left, var(--navy, #0f1730), transparent);
}

.week-timeline-fade.visible {
  opacity: 1;
}
```

**Note pour l'implémenteur** : `var(--navy, #0f1730)` est un fallback défensif — vérifier la vraie couleur de fond du bandeau (`#top-banner`/`.top-banner` dans `topBanner.css`) au moment de l'implémentation et l'utiliser telle quelle si elle diffère, pour que le dégradé se fonde exactement dans le fond réel plutôt que dans une approximation.

Ajouter à `.week-tab` (dans le bloc existant, ne pas dupliquer la règle) :

```css
.week-tab {
  scroll-snap-align: start;
  /* ...règles existantes inchangées... */
}
```

## Tâche 2 — `webapp/src/timeline/weekTimeline.js` : fondus dynamiques + classe `.is-scrolling`

Le module s'enveloppe désormais lui-même dans un wrapper dédié (`.week-timeline-wrap`, voir Tâche 1) qu'il crée et insère à la place de `container` dans le DOM, avant d'y remettre `container` comme enfant — ce wrapper porte les deux overlays de fondu comme ses propres enfants, à côté de `container`. `container` lui-même continue de gérer ses propres enfants (les onglets) via `replaceChildren()` exactement comme avant — les fondus n'y touchent jamais puisqu'ils vivent dans le wrapper, pas dans `container`. Remplacer le fichier entier par :

```js
const SCROLL_IDLE_DELAY_MS = 600;

export function initWeekTimeline({ container, weeks, activeWeekId, onSelect }) {
  let currentWeeks = weeks;
  let scrollIdleTimer = null;
  let fadeLeft = null;
  let fadeRight = null;

  // container.parentNode is null in the existing unit tests (they create a
  // bare, unattached container) — guarded so those tests keep passing
  // unmodified. In the real app container is always already mounted in
  // index.html by the time bootstrap() calls this, so the wrapper/fades are
  // always created there.
  if (container.parentNode) {
    const wrapper = document.createElement('div');
    wrapper.className = 'week-timeline-wrap';
    container.parentNode.insertBefore(wrapper, container);
    wrapper.appendChild(container);

    fadeLeft = document.createElement('div');
    fadeLeft.className = 'week-timeline-fade week-timeline-fade-left';
    fadeRight = document.createElement('div');
    fadeRight.className = 'week-timeline-fade week-timeline-fade-right';
    wrapper.appendChild(fadeLeft);
    wrapper.appendChild(fadeRight);
  }

  function updateFades() {
    if (!fadeLeft || !fadeRight) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    fadeLeft.classList.toggle('visible', scrollLeft > 1);
    fadeRight.classList.toggle('visible', scrollLeft < scrollWidth - clientWidth - 1);
  }

  container.addEventListener('scroll', () => {
    updateFades();
    container.classList.add('is-scrolling');
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => container.classList.remove('is-scrolling'), SCROLL_IDLE_DELAY_MS);
  }, { passive: true });

  function render(currentActiveId) {
    container.replaceChildren();
    for (const week of currentWeeks) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'week-tab' + (week.id === currentActiveId ? ' active' : '');
      tab.textContent = week.label;
      tab.addEventListener('click', () => {
        onSelect(week.id);
        render(week.id);
      });
      container.appendChild(tab);
    }
    if (currentActiveId) {
      const activeTab = container.querySelector('.week-tab.active');
      if (activeTab && typeof activeTab.scrollIntoView === 'function') {
        activeTab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
      }
    }
    // Layout has just changed (tab count/widths) — recompute fade visibility
    // on the next frame, once the browser has applied the new scrollWidth.
    requestAnimationFrame(updateFades);
  }

  render(activeWeekId);

  return {
    setWeeks(newWeeks, newActiveWeekId) {
      currentWeeks = newWeeks;
      render(newActiveWeekId);
    },
  };
}
```

**Points d'attention pour l'implémenteur** :
- **Vérifié en lisant `weekTimeline.test.js` avant d'écrire ce plan** : les 8 tests existants créent tous `container` via `document.createElement('div')` sans jamais l'attacher à un parent — `container.parentNode` y vaut donc `null`. Le code ci-dessus gère explicitement ce cas (`if (container.parentNode)`) pour que ces 8 tests continuent de passer sans aucune modification : ils exercent uniquement la logique des onglets (rendu, clic, `setWeeks`), jamais les fondus/wrapper, ce qui est cohérent avec leur propos. **Ne pas modifier `weekTimeline.test.js` pour "attacher container à un parent"** — ce serait un changement de portée inutile, le code défensif ci-dessus suffit.
- Après l'insertion du wrapper (quand elle a lieu), `container` reste le même nœud DOM qu'avant (juste déplacé), donc tout code de `render()` qui le référence (`container.replaceChildren()`, `container.querySelector(...)`, l'écouteur `scroll`) continue de fonctionner sans changement.

## Contraintes globales

- Ne pas changer la signature publique de `initWeekTimeline` ni le contrat de `setWeeks` — `main.js` ne doit nécessiter aucune modification.
- Ne pas introduire de dépendance npm supplémentaire (tout est faisable en CSS + JS natif).
- Respecter les couleurs de marque existantes (or `#e0b53d`/`#c9971f`, navy `#0f1730`/`#1a2340`) — pas de nouvelle couleur d'accent.
- Ne pas toucher à `webapp/src/timeline/weekAdmin.css`/`weekAdmin.js`, `topBanner.js`/`.css`, ni `main.js` — hors périmètre de ce plan.

## Vérification

- `cd webapp && npx vitest run` doit rester vert **sans modifier les 8 tests existants** (voir le point d'attention de la Tâche 2). Ajouter un nouveau test qui attache explicitement `container` à `document.body` avant d'appeler `initWeekTimeline`, pour donner une vraie couverture au chemin wrapper/fondus jusque-là non exercé — par exemple : vérifier que `document.querySelector('.week-timeline-wrap')` existe après l'init, et que `document.querySelectorAll('.week-timeline-fade')` en retourne bien 2.
- `npm run build` doit rester propre.
- Aucune interaction Firestore — pas de protocole de vérification production nécessaire. Vérification manuelle dans le navigateur suffit : le bandeau de semaines est fluide au défilement (molette horizontale, trackpad, glisser sur la scrollbar elle-même), le thumb doré apparaît au survol/pendant le défilement et redevient discret au repos, les fondus latéraux apparaissent/disparaissent correctement en fonction de la position de défilement (absents en tout début de liste côté gauche, absents en toute fin côté droit), aucun chevauchement visuel avec les boutons du bandeau (recherche à gauche, éventuels boutons à droite) ni avec les éléments qui suivent (indicateur de région, boutons Éditer/Exporter).
