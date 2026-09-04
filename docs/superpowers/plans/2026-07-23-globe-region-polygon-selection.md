---
title: Sélection de région par polygone de pays cliquable sur le globe
date: 2026-07-23
status: draft
---

## Contexte

Troisième des quatre plans issus d'une demande étendue d'amélioration ergonomique/esthétique (point 6) — le plus important changement d'architecture des quatre. Aucune interaction Firestore.

**Architecture actuelle** (`webapp/src/globe/globeScene.js`, `regions.js`) : le globe affiche une poignée de points de repère (`REGIONS[].points`, ex. un seul point "Singapour" pour toute la région Asie, un seul "Paris" pour l'Europe, 6 pays dispersés pour "BRICS + UK") via `Globe().pointsData(points).onPointClick(point => selectRegion(point.regionId))` — cliquer précisément sur l'un de ces petits points sélectionne la région correspondante. Ces points ne représentent pas des villes à visiter individuellement : ce sont de simples repères visuels/de cadrage caméra, réutilisés par `cameraForRegion` (`camera.js`) pour centrer la vue.

**Découverte importante** : "BRICS + UK" n'est **pas une zone géographique contiguë** — c'est un regroupement métier dispersé sur 4 continents (Brésil, Russie, Inde, Chine, Afrique du Sud, Royaume-Uni). Un pays comme la Chine ou le Royaume-Uni ne peut donc pas être à la fois dans le polygone "Asie"/"Europe" ET dans "BRICS + UK" — il faut l'assigner exclusivement à une seule région pour la logique de clic. **Confirmé avec l'utilisateur** : on ne délimite que les pays explicitement concernés par une des 4 régions (liste ci-dessous, volontairement non exhaustive du globe entier) — le reste du monde reste une surface de globe normale, non coloriée, non cliquable, exactement comme aujourd'hui pour les pays sans aucun point de repère.

## Décisions de conception

- **Nouvelle dépendance** : `world-atlas` (données topojson des frontières de pays, résolution 110m — la plus légère, déjà le standard des démos officielles de `globe.gl` pour ce cas d'usage) + `topojson-client` (conversion topojson→GeoJSON). Import direct en ES module (`import worldAtlas from 'world-atlas/countries-110m.json'`), pas de fetch CDN à l'exécution — cohérent avec le choix déjà fait dans ce projet de bundler les assets (textures terre/ciel) plutôt que dépendre d'un CDN externe au runtime.
- **Nouveau module pur et testable** `webapp/src/globe/regionPolygons.js` : une table `COUNTRY_TO_REGION` (nom de pays → `regionId`) et une fonction `regionIdForCountryName(name)`. C'est la seule partie de ce plan unit-testable en jsdom (comme `regionMatch.js`/`cycle.js`/`camera.js` du même dossier) — `globeScene.js` lui-même n'a toujours pas de test dédié (même raison qu'aux phases précédentes : instancie `globe.gl`, qui nécessite un vrai contexte WebGL absent de jsdom).
- **Liste des pays concernés** (proposée, à ajuster si besoin après implémentation) :
  - **Europe** : France, Allemagne, Italie, Espagne, Pays-Bas, Belgique, Suisse, Autriche, Portugal, Irlande, Pologne, Suède, Norvège, Danemark, Finlande.
  - **Asie** : Singapour, Japon, Corée du Sud, Taïwan, Indonésie, Malaisie, Thaïlande, Vietnam, Philippines, Hong Kong.
  - **BRICS + UK** : exactement les 6 pays déjà dans `regions.js` — Brésil, Russie, Inde, Chine, Afrique du Sud, Royaume-Uni (pas d'extension aux nouveaux membres BRICS+ 2024).
  - **Amérique du Nord** : États-Unis, Canada, Mexique.
  - Le nom exact de chaque pays tel qu'il apparaît dans le jeu de données `world-atlas` doit être **vérifié empiriquement pendant l'implémentation** (Tâche 0 ci-dessous) — les noms anglais standards (« United Kingdom », « United States of America », « South Korea », etc.) sont une hypothèse de départ raisonnable mais pas garantie à 100 % selon la version exacte du paquet ; documenter tout ajustement nécessaire.
- **Points de repère existants** (`REGIONS[].points`) : conservés tels quels, purement décoratifs désormais — `onPointClick` est retiré (ils ne déclenchent plus de sélection), mais ils restent affichés visuellement (aucun changement de rendu), pour ne pas donner l'impression que le globe s'est soudainement vidé.
- **Survol** : `onPolygonHover` change la couleur de remplissage et l'altitude du pays survolé — pattern standard de `globe.gl` (ré-invoquer les accesseurs chaînés `.polygonCapColor(...)`/`.polygonAltitude(...)` à l'intérieur du callback de hover, pas de variable d'état externe).
- **Clic** : `onPolygonClick` résout le `regionId` du pays cliqué et appelle exactement la même fonction interne `selectRegion(regionId)` déjà utilisée par la navigation flèches — aucun changement du cadrage caméra (`cameraForRegion`, `regions.js`) : seul le mécanisme de déclenchement change, pas ce qui se passe une fois la région sélectionnée.

## Tâche 0 — Installer les dépendances et vérifier la forme des données

```
cd webapp && npm install world-atlas topojson-client
```

Puis, avant d'écrire le code final, vérifier empiriquement (script Node rapide ou `console.log` temporaire dans le navigateur) que :
- `topojson-client`'s `feature(worldAtlas, worldAtlas.objects.countries).features` renvoie bien un tableau de `Feature` GeoJSON.
- Chaque `Feature.properties.name` contient bien le nom anglais du pays (ex. `"France"`, `"United Kingdom"`) — si le champ ou le format diffère de l'hypothèse ci-dessus, adapter les clés de `COUNTRY_TO_REGION` en conséquence et noter le changement dans le rapport final.

## Tâche 1 — Nouveau module `webapp/src/globe/regionPolygons.js`

```js
const COUNTRY_TO_REGION = {
  France: 'europe',
  Germany: 'europe',
  Italy: 'europe',
  Spain: 'europe',
  Netherlands: 'europe',
  Belgium: 'europe',
  Switzerland: 'europe',
  Austria: 'europe',
  Portugal: 'europe',
  Ireland: 'europe',
  Poland: 'europe',
  Sweden: 'europe',
  Norway: 'europe',
  Denmark: 'europe',
  Finland: 'europe',
  Singapore: 'asia',
  Japan: 'asia',
  'South Korea': 'asia',
  Taiwan: 'asia',
  Indonesia: 'asia',
  Malaysia: 'asia',
  Thailand: 'asia',
  Vietnam: 'asia',
  Philippines: 'asia',
  'Hong Kong': 'asia',
  Brazil: 'brics-uk',
  Russia: 'brics-uk',
  India: 'brics-uk',
  China: 'brics-uk',
  'South Africa': 'brics-uk',
  'United Kingdom': 'brics-uk',
  'United States of America': 'north-america',
  Canada: 'north-america',
  Mexico: 'north-america',
};

export function regionIdForCountryName(countryName) {
  return COUNTRY_TO_REGION[countryName] || null;
}
```

### Tests — `webapp/src/globe/regionPolygons.test.js`

```js
import { describe, it, expect } from 'vitest';
import { regionIdForCountryName } from './regionPolygons.js';

describe('regionIdForCountryName', () => {
  it('maps known European countries to europe', () => {
    expect(regionIdForCountryName('France')).toBe('europe');
    expect(regionIdForCountryName('Germany')).toBe('europe');
  });

  it('maps known Asian countries to asia', () => {
    expect(regionIdForCountryName('Japan')).toBe('asia');
    expect(regionIdForCountryName('Singapore')).toBe('asia');
  });

  it('maps the 6 BRICS+UK countries to brics-uk, not their geographic continent', () => {
    expect(regionIdForCountryName('China')).toBe('brics-uk');
    expect(regionIdForCountryName('India')).toBe('brics-uk');
    expect(regionIdForCountryName('Russia')).toBe('brics-uk');
    expect(regionIdForCountryName('Brazil')).toBe('brics-uk');
    expect(regionIdForCountryName('South Africa')).toBe('brics-uk');
    expect(regionIdForCountryName('United Kingdom')).toBe('brics-uk');
  });

  it('maps North American countries to north-america', () => {
    expect(regionIdForCountryName('Canada')).toBe('north-america');
    expect(regionIdForCountryName('United States of America')).toBe('north-america');
  });

  it('returns null for a country not explicitly mapped, and for a missing name', () => {
    expect(regionIdForCountryName('Nigeria')).toBeNull();
    expect(regionIdForCountryName(undefined)).toBeNull();
  });
});
```

Si la Tâche 0 révèle des noms différents dans le jeu de données réel, adapter les clés de `COUNTRY_TO_REGION` **et** les valeurs testées dans ce fichier de test en conséquence (même noms des deux côtés).

## Tâche 2 — `webapp/src/globe/globeScene.js` : polygones cliquables

Remplacer le contenu du fichier par :

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
const MARKER_COLOR = '#e0b53d';
const POLYGON_CAP_COLOR = 'rgba(224, 181, 61, 0.28)';
const POLYGON_CAP_HOVER_COLOR = 'rgba(224, 181, 61, 0.6)';
const POLYGON_SIDE_COLOR = 'rgba(15, 23, 48, 0.55)';
const POLYGON_STROKE_COLOR = 'rgba(224, 181, 61, 0.55)';

export function initGlobeScene(container, { regions, initialRegionId, onRegionSelect }) {
  let currentRegionId = initialRegionId;

  const points = regions.flatMap(region =>
    region.points.map(point => ({ ...point, regionId: region.id }))
  );

  const countryFeatures = feature(worldAtlas, worldAtlas.objects.countries).features
    .map(f => ({ ...f, regionId: regionIdForCountryName(f.properties?.name) }))
    .filter(f => f.regionId);

  const world = Globe()(container)
    .globeImageUrl(EARTH_TEXTURE_URL)
    .backgroundImageUrl(SKY_TEXTURE_URL)
    .pointsData(points)
    .pointLat('lat')
    .pointLng('lng')
    .pointColor(() => MARKER_COLOR)
    .pointAltitude(0.015)
    .pointRadius(0.35)
    .pointLabel('name')
    .polygonsData(countryFeatures)
    .polygonCapColor(() => POLYGON_CAP_COLOR)
    .polygonSideColor(() => POLYGON_SIDE_COLOR)
    .polygonStrokeColor(() => POLYGON_STROKE_COLOR)
    .polygonAltitude(0.006)
    .polygonLabel(d => regions.find(r => r.id === d.regionId)?.label || '')
    .onPolygonHover(hoverD => {
      world
        .polygonCapColor(d => (d === hoverD ? POLYGON_CAP_HOVER_COLOR : POLYGON_CAP_COLOR))
        .polygonAltitude(d => (d === hoverD ? 0.014 : 0.006));
    })
    .onPolygonClick(polygon => selectRegion(polygon.regionId));

  world.controls().autoRotate = true;
  world.controls().autoRotateSpeed = 0.4;

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

  currentRegionId = initialRegionId;
  onRegionSelect(initialRegionId);

  return {
    goToNextRegion: () => selectRegion(nextRegionId(regions, currentRegionId)),
    goToPrevRegion: () => selectRegion(prevRegionId(regions, currentRegionId)),
    goToRegion: regionId => selectRegion(regionId),
  };
}
```

Points à noter par rapport à la version actuelle : `onPointClick` est retiré (les points de repère restent affichés, mais ne déclenchent plus de sélection) ; le `ResizeObserver` de la phase 26 est conservé à l'identique (aucun changement de logique de redimensionnement, seulement de nouvelles couches de données ajoutées à la même instance `world`).

## Contraintes globales

- Ne pas modifier `regions.js`, `camera.js`, `cycle.js` — le cadrage caméra et la navigation flèches/timeline restent strictement identiques, seul le déclencheur de clic change.
- Ne pas essayer de couvrir tous les pays du monde — uniquement la liste explicitement définie dans `regionPolygons.js`. Le reste du globe demeure une surface non colorée, non cliquable.
- Ne pas retirer les points de repère existants (`REGIONS[].points`) — ils restent visibles, seulement non-interactifs.
- Ne pas toucher aux points 1, 2, 3, 4, 5 de la demande (traités dans des plans séparés).

## Vérification

- `cd webapp && npx vitest run` doit rester vert, avec 6 tests de plus (`regionPolygons.test.js`).
- `npm run build` doit rester propre — vérifier en particulier que le nouveau JSON `world-atlas` (quelques centaines de Ko) n'explose pas la taille du bundle de façon disproportionnée (déjà un chunk `html2pdf` volumineux existant, ce nouveau fichier de données doit rester net et raisonnable en comparaison).
- Aucune interaction Firestore — vérification manuelle **visuelle uniquement** dans le navigateur :
  - Survol de la France, du Japon, du Royaume-Uni, du Brésil, des États-Unis (un pays de chacune des 4 régions + confirmation que UK/Chine/Inde répondent bien "BRICS + UK" et non leur continent géographique) : mise en évidence visuelle immédiate.
  - Clic sur chacun : la région correspondante devient active, les données du panneau se chargent, la caméra se recentre exactement comme avec l'ancienne navigation par points/flèches.
  - Clic sur un pays non listé (ex. l'Égypte, le Nigeria, l'Argentine) : aucun effet, pas de survol coloré non plus.
  - La navigation par flèches précédente/suivante et par la timeline des semaines fonctionne toujours exactement comme avant.
  - Rotation/zoom du globe toujours fluides, aucune dégradation de performance perceptible avec la nouvelle couche de polygones.
