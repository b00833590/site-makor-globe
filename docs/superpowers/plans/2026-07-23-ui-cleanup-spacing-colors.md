---
title: Nettoyage interface — retrait des points de repère et de la section IA & Fintech, espacement flèche/timeline, couleurs de performance cohérentes
date: 2026-07-23
status: draft
---

## Contexte

Premier de quatre plans issus d'une nouvelle demande (interface + PDF). Regroupe les points les plus rapides et indépendants : suppression définitive des points jaunes du globe, suppression de la section "IA & Fintech" du panneau, espacement flèche gauche/timeline des semaines, et couleurs vert/rouge cohérentes pour toutes les performances affichées. Aucune interaction Firestore nouvelle.

**Découverte importante** : la flèche `.arrow-prev` (`left: 20px`, largeur 38px) et la colonne `.week-timeline` (`left: 0`, largeur 34px) se chevauchent déjà aujourd'hui (la flèche occupe l'espace écran 20-58px, la timeline 0-34px — chevauchement réel dans la zone 20-34px), exactement le même type de bug déjà corrigé une fois entre la flèche droite et le bouton toggle du panneau (phase 27). Confirme que la demande de l'utilisateur correspond à un vrai défaut, pas une simple préférence esthétique.

## Décisions de conception

- **Points de repère** : suppression complète de `pointsData`/`pointLat`/`pointLng`/`pointColor`/`pointAltitude`/`pointRadius`/`pointLabel` et du tableau `points` dans `globeScene.js` — ils ne servaient plus qu'à la décoration depuis la phase 29 (sélection par polygone). `REGIONS[].points` (dans `regions.js`) reste inchangé : il est toujours utilisé par `cameraForRegion` pour le cadrage caméra, indépendamment de son ancien usage pour les marqueurs visuels.
- **Section IA & Fintech** : retrait de `renderIaFintech` et de son appel dans `sidePanel.js`, du markup `#panel-ia-fintech` dans `index.html`, et des handlers `handleIaFintechEdit`/`Add`/`Delete`/`iaFintechItemKey` ainsi que du passage `iaFintechItems: getIaFintechItemsForWeek(...)` dans `main.js` — ce sont les seuls points d'entrée déclenchés par l'interface, désormais inatteignables sans elle. **Ce qui reste volontairement intact** : l'import de `getIaFintechItemsForWeek` dans `main.js` (toujours utilisé par la duplication de semaine, ligne ~461) et le balayage de ces clés dans `getWeekContentKeys` (suppression en cascade d'une semaine) — la demande porte sur la section du panneau, pas sur l'effacement des données existantes ni sur la cohérence de la duplication/suppression de semaine pour d'éventuels documents déjà en base.
- **Espacement flèche/timeline** : `.arrow-prev` passe de `left: 20px` à `left: 54px` (34px de largeur de la timeline + 20px de marge, exactement le même calcul déjà utilisé pour le bouton des présentations en phase 28).
- **Couleurs de performance** : `.portfolio-table` n'a aujourd'hui aucune coloration conditionnelle sur DEPUIS/YTD (toujours blanc) — contrairement aux indices de marché qui ont déjà `.panel-index-change.positive`/`.negative` (`#1c8a4b`/`#c0392b`). Ajout des mêmes classes/couleurs sur les cellules DEPUIS/YTD du tableau de portefeuille, pour une cohérence totale avec le reste de l'application.

## Tâche 1 — `webapp/src/globe/globeScene.js` : retrait des points de repère

Remplacer le contenu du fichier par (seules les lignes liées aux points disparaissent, tout le reste — polygones, hover, clic, ResizeObserver — reste identique) :

```js
import Globe from 'globe.gl';
import { feature } from 'topojson-client';
import worldAtlas from 'world-atlas/countries-110m.json';
import { cameraForRegion } from './camera.js';
import { nextRegionId, prevRegionId } from './cycle.js';
import { regionIdForCountryName } from './regionPolygons.js';

const EARTH_TEXTURE_URL = '/textures/earth-blue-marble.jpg';
const SKY_TEXTURE_URL = '/textures/night-sky.png';
const CAMERA_TRANSITION_MS = 1200;
const POLYGON_CAP_COLOR = 'rgba(224, 181, 61, 0.28)';
const POLYGON_CAP_HOVER_COLOR = 'rgba(224, 181, 61, 0.6)';
const POLYGON_SIDE_COLOR = 'rgba(15, 23, 48, 0.55)';
const POLYGON_STROKE_COLOR = 'rgba(224, 181, 61, 0.55)';
const CLICK_DRAG_THRESHOLD_PX = 5;

export function initGlobeScene(container, { regions, initialRegionId, onRegionSelect }) {
  let currentRegionId = initialRegionId;
  let hoveredPolygon = null;
  let pointerDownPos = null;

  const countryFeatures = feature(worldAtlas, worldAtlas.objects.countries).features
    .map(f => ({ ...f, regionId: regionIdForCountryName(f.properties?.name) }))
    .filter(f => f.regionId);

  const world = Globe()(container)
    .globeImageUrl(EARTH_TEXTURE_URL)
    .backgroundImageUrl(SKY_TEXTURE_URL)
    .polygonsData(countryFeatures)
    .polygonCapColor(() => POLYGON_CAP_COLOR)
    .polygonSideColor(() => POLYGON_SIDE_COLOR)
    .polygonStrokeColor(() => POLYGON_STROKE_COLOR)
    .polygonAltitude(0.006)
    .polygonLabel(d => regions.find(r => r.id === d.regionId)?.label || '')
    .onPolygonHover(hoverD => {
      hoveredPolygon = hoverD;
      world
        .polygonCapColor(d => (d === hoverD ? POLYGON_CAP_HOVER_COLOR : POLYGON_CAP_COLOR))
        .polygonAltitude(d => (d === hoverD ? 0.014 : 0.006));
    });

  // globe.gl's own onPolygonClick silently never fires for a 'mouse'
  // pointerType if ANY pointermove occurred while the button was down —
  // no distance threshold at all, unlike touch/pen — and it isn't
  // configurable via a public method in this version (an internal
  // `clickAfterDrag` Kapsule prop exists but isn't re-exposed on the
  // returned instance). A real click routinely includes a sub-pixel move,
  // so this bypasses that logic entirely: track the currently-hovered
  // country ourselves (already reliable, see onPolygonHover above) and
  // fire selectRegion from our own pointerdown/pointerup pair, using a
  // small pixel-distance threshold to still ignore a genuine rotate-drag.
  // A window-level capture-phase listener runs before container's own
  // pointerdown below, and clears any stale position whenever a gesture
  // starts OUTSIDE the globe (e.g. selecting text or scrolling inside the
  // adjacent, non-overlapping side panel) — otherwise that gesture ending
  // with a release over the globe could fire selectRegion using leftover
  // coordinates from an earlier, unrelated click on the globe itself.
  // container's own pointerdown (bubble phase, fires right after) then
  // still sets the real position whenever the gesture genuinely starts here.
  window.addEventListener('pointerdown', event => {
    if (!container.contains(event.target)) pointerDownPos = null;
  }, { capture: true });
  container.addEventListener('pointerdown', event => {
    pointerDownPos = { x: event.clientX, y: event.clientY };
  });
  container.addEventListener('pointerup', event => {
    if (!pointerDownPos) return;
    const dx = event.clientX - pointerDownPos.x;
    const dy = event.clientY - pointerDownPos.y;
    pointerDownPos = null;
    if (Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD_PX) return;
    if (hoveredPolygon) selectRegion(hoveredPolygon.regionId);
  });

  world.controls().autoRotate = true;
  world.controls().autoRotateSpeed = 0.4;

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

  function selectRegion(regionId) {
    const region = regions.find(r => r.id === regionId);
    if (!region) return;
    currentRegionId = regionId;
    world.controls().autoRotate = false;
    world.pointOfView(cameraForRegion(region), CAMERA_TRANSITION_MS);
    onRegionSelect(regionId);
  }

  // Update the position indicator for the initial region without stopping
  // auto-rotate or animating the camera — that only happens on real user
  // interaction (country click or arrow navigation), so the globe is still
  // visibly auto-rotating on first render.
  currentRegionId = initialRegionId;
  onRegionSelect(initialRegionId);

  return {
    goToNextRegion: () => selectRegion(nextRegionId(regions, currentRegionId)),
    goToPrevRegion: () => selectRegion(prevRegionId(regions, currentRegionId)),
    goToRegion: regionId => selectRegion(regionId),
  };
}
```

Ne pas toucher à `webapp/src/globe/regions.js` — `REGIONS[].points` reste utilisé par `cameraForRegion`.

## Tâche 2 — Retrait de la section IA & Fintech

### `webapp/index.html`

Retirer la ligne `<div id="panel-ia-fintech"></div>` (juste après le libellé de section "IA & Fintech" — retirer aussi ce libellé `<div class="panel-section-label">IA & Fintech</div>`).

### `webapp/src/panel/sidePanel.js`

Retirer entièrement la fonction `renderIaFintech(...)` (et sa fonction interne de rendu de carte si elle est locale à ce bloc). Dans `initSidePanel({...})`, retirer `iaFintechEl` de la déstructuration des paramètres et `onIaFintechEdit, onIaFintechAdd, onIaFintechDelete` de la liste. Dans `showRegion(...)`, retirer `iaFintechItems = []` du paramètre et la ligne `renderIaFintech(iaFintechEl, iaFintechItems, isEditing, {...});`.

### `webapp/src/main.js`

Retirer les fonctions `iaFintechItemKey`, `handleIaFintechEdit`, `handleIaFintechAdd`, `handleIaFintechDelete`. Dans l'appel à `initSidePanel({...})`, retirer `iaFintechEl: document.getElementById('panel-ia-fintech'),` et `onIaFintechEdit: handleIaFintechEdit, onIaFintechAdd: handleIaFintechAdd, onIaFintechDelete: handleIaFintechDelete,`. Dans `renderPanelForCurrentSelection()`'s appel à `panel.showRegion({...})`, retirer la ligne `iaFintechItems: getIaFintechItemsForWeek(db, activeWeekId),`.

**Ne pas retirer** l'import de `getIaFintechItemsForWeek` (toujours utilisé par `duplicateContentEntries(getIaFintechItemsForWeek(db, sourceWeekId), 'mkg:content:ia-fintech:', newWeekId)` dans la logique de duplication de semaine) ni quoi que ce soit dans `getWeekContentKeys`/`selectors.js`.

### Tests à adapter

`webapp/src/panel/sidePanel.test.js` contient probablement un bloc `describe` dédié à `renderIaFintech`/l'affichage IA & Fintech dans `showRegion` — le retirer entièrement (pas de test pour une fonctionnalité qui n'existe plus). Vérifier aussi qu'aucun autre test de ce fichier ne s'appuie sur `iaFintechEl` dans ses fixtures d'éléments (`initSidePanel({..., iaFintechEl, ...})`) — retirer cette clé des objets de fixture partagés si présente, pour que la suite continue de compiler.

## Tâche 3 — `webapp/src/styles/globe.css` : espacement flèche/timeline

Modifier la règle `.arrow-prev` existante : remplacer `left: 20px;` par `left: 54px;`.

## Tâche 4 — `webapp/src/panel/portfolioTable.js` + `.css` : couleurs de performance

Dans `renderPortfolioTable`, pour les colonnes `depuis` et `ytd` (celles dans `PERCENT_FIELDS`), en mode lecture seule (`!isEditing`), ajouter une classe conditionnelle sur la cellule reflétant le signe de la valeur :

```js
      } else if (PERCENT_FIELDS.has(col.field)) {
        td.textContent = raw === undefined || raw === null || raw === '' ? '' : `${raw}%`;
        if (raw !== undefined && raw !== null && raw !== '') {
          td.classList.add(Number(raw) < 0 ? 'portfolio-cell-negative' : 'portfolio-cell-positive');
        }
      } else {
```

(Remplace le bloc `else if (PERCENT_FIELDS.has(col.field)) { td.textContent = ...; }` existant — le reste de la fonction est inchangé.)

Ajouter à `webapp/src/panel/portfolioTable.css` :

```css
.portfolio-cell-positive {
  color: #1c8a4b;
}

.portfolio-cell-negative {
  color: #c0392b;
}
```

(Mêmes valeurs hexadécimales que `.panel-index-change.positive`/`.negative` dans `sidePanel.css`, pour une cohérence totale.)

### Tests — ajouter à `webapp/src/panel/portfolioTable.test.js`

```js
  it('colors a positive DEPUIS/YTD value green and a negative one red, in read-only mode', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, ENTRIES, { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    const cells = [...container.querySelectorAll('tbody tr')[0].querySelectorAll('td')];
    expect(cells[4].classList.contains('portfolio-cell-positive')).toBe(true); // depuis: 5.2
    expect(cells[5].classList.contains('portfolio-cell-positive')).toBe(true); // ytd: 5.0
    const secondRowCells = [...container.querySelectorAll('tbody tr')[1].querySelectorAll('td')];
    expect(secondRowCells[4].classList.contains('portfolio-cell-negative')).toBe(true); // depuis: -1.1
  });

  it('applies no color class when the DEPUIS/YTD value is missing', () => {
    const container = document.createElement('div');
    renderPortfolioTable(container, [{ id: 'p3', date: '01/01', entreprise: 'X', stagiaire: 'Y', symbol: 'Z' }], { sortField: 'date', sortDirection: 'asc', onSort: () => {} });
    const cells = [...container.querySelectorAll('tbody td')];
    expect(cells[4].className).toBe('');
    expect(cells[5].className).toBe('');
  });
```

## Contraintes globales

- Ne pas toucher à `regions.js`, `camera.js`, `cycle.js`, `regionPolygons.js`.
- Ne pas supprimer les données IA & Fintech existantes ni la logique de duplication/suppression en cascade qui les concerne — seule la section du panneau et ses handlers d'édition disparaissent.
- Ne pas toucher au graphique d'évolution, au rafraîchissement live du portefeuille, ni à l'export PDF (traités dans des plans séparés).

## Vérification

- `cd webapp && npx vitest run` doit rester vert. Le nombre de tests baisse (retrait des tests `renderIaFintech`) puis remonte un peu (2 nouveaux tests de couleur portefeuille) — le total net exact dépend du nombre de tests IA & Fintech existants, à documenter précisément dans le rapport final.
- `npm run build` doit rester propre.
- Vérification manuelle **visuelle uniquement** dans le navigateur :
  - Plus aucun point jaune visible sur le globe, dans aucune région.
  - Le panneau latéral n'affiche plus du tout de section "IA & Fintech" (les autres sections restent inchangées).
  - La flèche de navigation région (gauche) et les ronds de la timeline des semaines sont désormais clairement espacés, sans chevauchement.
  - Dans le tableau "Suivi de portefeuille", les valeurs DEPUIS/YTD positives sont vertes, les négatives rouges, cohérent avec la coloration déjà existante des indices de marché.
  - Rotation/zoom du globe, sélection de région par clic sur un pays, navigation semaine/flèches, export PDF : toujours fonctionnels.
