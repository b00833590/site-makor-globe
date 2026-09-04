# Socle du globe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, working 3D interactive globe (photorealistic Earth, dark starfield, region markers, camera navigation) as the foundation for the Makor Morning News redesign — running independently of the current production `index.html`.

**Architecture:** A new minimal front-end app lives under `webapp/`, built with Vite and tested with Vitest, completely separate from the current production `index.html` (which stays untouched and keeps serving the live site during this and subsequent plans). The globe itself is rendered with `globe.gl` (a wrapper around three.js) using real satellite imagery and a starfield background. Navigation logic — region ordering, camera framing math — lives in small pure functions that are unit-tested; only the three.js/DOM integration glue is verified manually in the browser, since WebGL rendering isn't meaningfully unit-testable.

**Tech Stack:** Vite, Vitest, `globe.gl` (three.js), vanilla JavaScript (ES modules), no UI framework.

## Global Constraints

- Stack: vanilla JS + Vite + `globe.gl` — no React/Vue/other framework (per design spec).
- Brand palette (exact hex, from design spec): `--navy: #0f1730`, `--navy2: #1a2340`, `--gold: #c9971f`, `--gold-light: #e0b53d`.
- Four regions, fixed cycle order: Asie → BRICS + UK → Europe → Amérique du Nord → (retour à Asie).
- BRICS + UK groups exactly 6 countries (Brésil, Russie, Inde, Chine, Afrique du Sud, Royaume-Uni), non contigus. Clicking it must produce a **wide view framing all 6 markers at once** — never a single-point zoom, never a sequential fly-by.
- Globe must be **photorealistic** (real satellite/Earth imagery, not stylized), on a dark starfield background with an atmosphere glow.
- Firestore, authentication, and the existing production `index.html` are **out of scope** for this plan — do not modify the repository root `index.html`, `css/`, or `js/` directories.
- All new code goes under `webapp/` at the repo root.

---

### Task 1: Scaffold the Vite + Vitest workspace

**Files:**
- Create: `webapp/package.json`
- Create: `webapp/vite.config.js`
- Create: `webapp/vitest.config.js`
- Create: `webapp/index.html`
- Create: `webapp/src/main.js`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a working `npm run dev` / `npm run build` / `npm test` workspace under `webapp/` that later tasks add files into.

- [ ] **Step 1: Create the workspace and install dependencies**

Run:
```bash
mkdir webapp
cd webapp
npm init -y
npm install globe.gl
npm install -D vite vitest
```

- [ ] **Step 2: Replace the generated `package.json` with explicit scripts**

File: `webapp/package.json`
```json
{
  "name": "makor-globe-webapp",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "globe.gl": "^2.34.0"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

*(Keep the exact version numbers `npm install` already wrote in your `node_modules`/lockfile — only the `name`, `type`, and `scripts` fields need to be added by hand if `npm init -y` didn't include them.)*

- [ ] **Step 3: Create the Vite config**

File: `webapp/vite.config.js`
```js
import { defineConfig } from 'vite';

export default defineConfig({});
```

- [ ] **Step 4: Create the Vitest config**

File: `webapp/vitest.config.js`
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create the dev HTML entry point**

File: `webapp/index.html`
```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Makor Morning News — Globe</title>
</head>
<body>
  <div id="app">Makor Globe — build en cours</div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 6: Create a temporary entry script**

File: `webapp/src/main.js`
```js
console.log('Makor globe workspace ready.');
```

*(This file is replaced with the real bootstrap logic in Task 6.)*

- [ ] **Step 7: Ignore build artifacts**

Modify `.gitignore` (repo root) — append these lines:
```
webapp/node_modules/
webapp/dist/
```

- [ ] **Step 8: Verify the build pipeline works**

Run: `cd webapp && npm run build`
Expected: command exits successfully and prints something like `dist/index.html` in the output summary. Confirm the file exists:

Run: `test -f webapp/dist/index.html && echo FOUND`
Expected: `FOUND`

- [ ] **Step 9: Commit**

```bash
git add webapp/package.json webapp/package-lock.json webapp/vite.config.js webapp/vitest.config.js webapp/index.html webapp/src/main.js .gitignore
git commit -m "chore: scaffold Vite/Vitest workspace for globe redesign"
```

---

### Task 2: Region configuration module

**Files:**
- Create: `webapp/src/globe/regions.js`
- Create: `webapp/src/globe/regions.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `REGIONS`, an array of objects shaped `{ id: string, label: string, order: number, viewMode: 'single' | 'bounds', points: { name: string, lat: number, lng: number }[] }`. Tasks 3–6 rely on this exact shape.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/globe/regions.test.js`
```js
import { describe, it, expect } from 'vitest';
import { REGIONS } from './regions.js';

describe('REGIONS', () => {
  it('contains exactly the 4 expected regions', () => {
    expect(REGIONS.map(r => r.id).sort()).toEqual(
      ['asia', 'brics-uk', 'europe', 'north-america'].sort()
    );
  });

  it('assigns unique, zero-based sequential order values', () => {
    const orders = REGIONS.map(r => r.order).sort((a, b) => a - b);
    expect(orders).toEqual([0, 1, 2, 3]);
  });

  it('gives brics-uk exactly 6 points and bounds view mode', () => {
    const bricsUk = REGIONS.find(r => r.id === 'brics-uk');
    expect(bricsUk.points).toHaveLength(6);
    expect(bricsUk.viewMode).toBe('bounds');
  });

  it('gives asia, europe and north-america exactly 1 point and single view mode', () => {
    for (const id of ['asia', 'europe', 'north-america']) {
      const region = REGIONS.find(r => r.id === id);
      expect(region.points).toHaveLength(1);
      expect(region.viewMode).toBe('single');
    }
  });

  it('keeps every point within valid lat/lng bounds', () => {
    for (const region of REGIONS) {
      for (const point of region.points) {
        expect(point.lat).toBeGreaterThanOrEqual(-90);
        expect(point.lat).toBeLessThanOrEqual(90);
        expect(point.lng).toBeGreaterThanOrEqual(-180);
        expect(point.lng).toBeLessThanOrEqual(180);
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/globe/regions.test.js`
Expected: FAIL — `Cannot find module './regions.js'` (or similar resolution error).

- [ ] **Step 3: Write the implementation**

File: `webapp/src/globe/regions.js`
```js
export const REGIONS = [
  {
    id: 'asia',
    label: 'Asie',
    order: 0,
    viewMode: 'single',
    points: [
      { name: 'Singapour', lat: 1.3521, lng: 103.8198 },
    ],
  },
  {
    id: 'brics-uk',
    label: 'BRICS + UK',
    order: 1,
    viewMode: 'bounds',
    points: [
      { name: 'Brésil', lat: -23.5505, lng: -46.6333 },
      { name: 'Russie', lat: 55.7558, lng: 37.6173 },
      { name: 'Inde', lat: 19.0760, lng: 72.8777 },
      { name: 'Chine', lat: 31.2304, lng: 121.4737 },
      { name: 'Afrique du Sud', lat: -26.2041, lng: 28.0473 },
      { name: 'Royaume-Uni', lat: 51.5074, lng: -0.1278 },
    ],
  },
  {
    id: 'europe',
    label: 'Europe',
    order: 2,
    viewMode: 'single',
    points: [
      { name: 'Paris', lat: 48.8566, lng: 2.3522 },
    ],
  },
  {
    id: 'north-america',
    label: 'Amérique du Nord',
    order: 3,
    viewMode: 'single',
    points: [
      { name: 'New York', lat: 40.7128, lng: -74.0060 },
    ],
  },
];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/globe/regions.test.js`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/globe/regions.js webapp/src/globe/regions.test.js
git commit -m "feat: add region configuration for the globe"
```

---

### Task 3: Region cycle navigation logic

**Files:**
- Create: `webapp/src/globe/cycle.js`
- Create: `webapp/src/globe/cycle.test.js`

**Interfaces:**
- Consumes: an array of region-like objects shaped `{ id: string, order: number }` (a subset of `REGIONS` from Task 2 — the real `REGIONS` array satisfies this shape).
- Produces:
  - `nextRegionId(regions, currentId): string`
  - `prevRegionId(regions, currentId): string`
  - `regionPosition(regions, currentId): { index: number, total: number }` (1-based index)

  Task 5 and Task 6 call these three functions directly.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/globe/cycle.test.js`
```js
import { describe, it, expect } from 'vitest';
import { nextRegionId, prevRegionId, regionPosition } from './cycle.js';

const REGIONS = [
  { id: 'asia', order: 0 },
  { id: 'brics-uk', order: 1 },
  { id: 'europe', order: 2 },
  { id: 'north-america', order: 3 },
];

describe('nextRegionId', () => {
  it('returns the next region in order', () => {
    expect(nextRegionId(REGIONS, 'asia')).toBe('brics-uk');
    expect(nextRegionId(REGIONS, 'brics-uk')).toBe('europe');
    expect(nextRegionId(REGIONS, 'europe')).toBe('north-america');
  });

  it('wraps around from the last region to the first', () => {
    expect(nextRegionId(REGIONS, 'north-america')).toBe('asia');
  });

  it('falls back to the first region when the current id is unknown', () => {
    expect(nextRegionId(REGIONS, 'unknown')).toBe('asia');
  });
});

describe('prevRegionId', () => {
  it('returns the previous region in order', () => {
    expect(prevRegionId(REGIONS, 'europe')).toBe('brics-uk');
    expect(prevRegionId(REGIONS, 'brics-uk')).toBe('asia');
  });

  it('wraps around from the first region to the last', () => {
    expect(prevRegionId(REGIONS, 'asia')).toBe('north-america');
  });

  it('falls back to the first region when the current id is unknown', () => {
    expect(prevRegionId(REGIONS, 'unknown')).toBe('asia');
  });
});

describe('regionPosition', () => {
  it('returns a 1-based index and the total count', () => {
    expect(regionPosition(REGIONS, 'asia')).toEqual({ index: 1, total: 4 });
    expect(regionPosition(REGIONS, 'europe')).toEqual({ index: 3, total: 4 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/globe/cycle.test.js`
Expected: FAIL — `Cannot find module './cycle.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/globe/cycle.js`
```js
function sortedRegions(regions) {
  return [...regions].sort((a, b) => a.order - b.order);
}

export function nextRegionId(regions, currentId) {
  const sorted = sortedRegions(regions);
  const idx = sorted.findIndex(r => r.id === currentId);
  if (idx === -1) return sorted[0].id;
  return sorted[(idx + 1) % sorted.length].id;
}

export function prevRegionId(regions, currentId) {
  const sorted = sortedRegions(regions);
  const idx = sorted.findIndex(r => r.id === currentId);
  if (idx === -1) return sorted[0].id;
  return sorted[(idx - 1 + sorted.length) % sorted.length].id;
}

export function regionPosition(regions, currentId) {
  const sorted = sortedRegions(regions);
  const idx = sorted.findIndex(r => r.id === currentId);
  return { index: idx + 1, total: sorted.length };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/globe/cycle.test.js`
Expected: PASS — 7 tests passed.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/globe/cycle.js webapp/src/globe/cycle.test.js
git commit -m "feat: add fixed-order region cycle navigation"
```

---

### Task 4: Camera framing geometry

**Files:**
- Create: `webapp/src/globe/camera.js`
- Create: `webapp/src/globe/camera.test.js`

**Interfaces:**
- Consumes: a region-like object shaped `{ viewMode: 'single' | 'bounds', points: { lat: number, lng: number }[] }` (satisfied by entries of `REGIONS` from Task 2).
- Produces:
  - `haversineDistanceKm(a: {lat,lng}, b: {lat,lng}): number`
  - `centroid(points: {lat,lng}[]): {lat, lng}`
  - `cameraForRegion(region): { lat: number, lng: number, altitude: number }`

  Task 5 calls `cameraForRegion` directly to drive `globe.gl`'s `.pointOfView(...)`.

- [ ] **Step 1: Write the failing tests**

File: `webapp/src/globe/camera.test.js`
```js
import { describe, it, expect } from 'vitest';
import { haversineDistanceKm, centroid, cameraForRegion } from './camera.js';

describe('haversineDistanceKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistanceKm({ lat: 48.8566, lng: 2.3522 }, { lat: 48.8566, lng: 2.3522 })).toBe(0);
  });

  it('returns roughly the known great-circle distance between Paris and New York', () => {
    const paris = { lat: 48.8566, lng: 2.3522 };
    const newYork = { lat: 40.7128, lng: -74.0060 };
    const distance = haversineDistanceKm(paris, newYork);
    expect(distance).toBeGreaterThan(5800);
    expect(distance).toBeLessThan(5900);
  });
});

describe('centroid', () => {
  it('averages latitude and longitude of all points', () => {
    const result = centroid([
      { lat: 0, lng: 0 },
      { lat: 10, lng: 20 },
    ]);
    expect(result).toEqual({ lat: 5, lng: 10 });
  });
});

describe('cameraForRegion', () => {
  it('centers on the single point for single-mode regions, at a fixed close altitude', () => {
    const region = { viewMode: 'single', points: [{ lat: 48.8566, lng: 2.3522 }] };
    const pov = cameraForRegion(region);
    expect(pov.lat).toBe(48.8566);
    expect(pov.lng).toBe(2.3522);
    expect(pov.altitude).toBe(1.4);
  });

  it('centers on the centroid of all points for bounds-mode regions', () => {
    const region = {
      viewMode: 'bounds',
      points: [
        { lat: 0, lng: 0 },
        { lat: 10, lng: 10 },
      ],
    };
    const pov = cameraForRegion(region);
    expect(pov.lat).toBe(5);
    expect(pov.lng).toBe(5);
  });

  it('always frames bounds-mode regions further out than the fixed single-point altitude', () => {
    const singleRegion = { viewMode: 'single', points: [{ lat: 0, lng: 0 }] };
    const tightBoundsRegion = {
      viewMode: 'bounds',
      points: [
        { lat: 0, lng: 0 },
        { lat: 0.01, lng: 0.01 },
      ],
    };
    expect(cameraForRegion(tightBoundsRegion).altitude).toBeGreaterThan(cameraForRegion(singleRegion).altitude);
  });

  it('caps the bounds altitude at 4 for extremely spread-out points', () => {
    const clusterPoint = { lat: 0, lng: 0 };
    const farPoint = { lat: 0, lng: 179.9 };
    const region = {
      viewMode: 'bounds',
      points: [...Array(20).fill(clusterPoint), farPoint],
    };
    expect(cameraForRegion(region).altitude).toBe(4);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd webapp && npx vitest run src/globe/camera.test.js`
Expected: FAIL — `Cannot find module './camera.js'`.

- [ ] **Step 3: Write the implementation**

File: `webapp/src/globe/camera.js`
```js
const EARTH_RADIUS_KM = 6371;
const SINGLE_POINT_ALTITUDE = 1.4;
const BOUNDS_MIN_ALTITUDE = 1.8;
const BOUNDS_MAX_ALTITUDE = 4;
const BOUNDS_KM_PER_ALTITUDE_UNIT = 4000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

export function centroid(points) {
  const lat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lng = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
  return { lat, lng };
}

export function cameraForRegion(region) {
  if (region.viewMode === 'single') {
    const point = region.points[0];
    return { lat: point.lat, lng: point.lng, altitude: SINGLE_POINT_ALTITUDE };
  }

  const center = centroid(region.points);
  const maxDistKm = Math.max(...region.points.map(p => haversineDistanceKm(center, p)));
  const altitude = Math.min(
    BOUNDS_MAX_ALTITUDE,
    Math.max(BOUNDS_MIN_ALTITUDE, maxDistKm / BOUNDS_KM_PER_ALTITUDE_UNIT)
  );
  return { lat: center.lat, lng: center.lng, altitude };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd webapp && npx vitest run src/globe/camera.test.js`
Expected: PASS — 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/globe/camera.js webapp/src/globe/camera.test.js
git commit -m "feat: add camera framing geometry for single and multi-point regions"
```

---

### Task 5: Globe scene glue (globe.gl integration)

**Files:**
- Create: `webapp/src/globe/globeScene.js`

**Interfaces:**
- Consumes: `REGIONS` shape from Task 2, `nextRegionId`/`prevRegionId` from Task 3, `cameraForRegion` from Task 4.
- Produces: `initGlobeScene(container: HTMLElement, options: { regions, initialRegionId: string, onRegionSelect: (regionId: string) => void }): { goToNextRegion(): void, goToPrevRegion(): void, goToRegion(regionId: string): void }`. Task 6 calls this to mount the globe and wire the arrow buttons.

This task has **no automated test** — `globe.gl` renders real WebGL/three.js content that isn't meaningfully assertable outside a browser. Instead, Step 2 is a manual verification checklist run in the actual browser.

- [ ] **Step 1: Write the implementation**

File: `webapp/src/globe/globeScene.js`
```js
import Globe from 'globe.gl';
import { cameraForRegion } from './camera.js';
import { nextRegionId, prevRegionId } from './cycle.js';

const EARTH_TEXTURE_URL = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';
const SKY_TEXTURE_URL = 'https://unpkg.com/three-globe/example/img/night-sky.png';
const CAMERA_TRANSITION_MS = 1200;
const MARKER_COLOR = '#e0b53d';

export function initGlobeScene(container, { regions, initialRegionId, onRegionSelect }) {
  let currentRegionId = initialRegionId;

  const points = regions.flatMap(region =>
    region.points.map(point => ({ ...point, regionId: region.id }))
  );

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
    .onPointClick(point => selectRegion(point.regionId));

  world.controls().autoRotate = true;
  world.controls().autoRotateSpeed = 0.4;

  window.addEventListener('resize', () => {
    world.width(container.clientWidth).height(container.clientHeight);
  });

  function selectRegion(regionId) {
    const region = regions.find(r => r.id === regionId);
    if (!region) return;
    currentRegionId = regionId;
    world.controls().autoRotate = false;
    world.pointOfView(cameraForRegion(region), CAMERA_TRANSITION_MS);
    onRegionSelect(regionId);
  }

  selectRegion(initialRegionId);

  return {
    goToNextRegion: () => selectRegion(nextRegionId(regions, currentRegionId)),
    goToPrevRegion: () => selectRegion(prevRegionId(regions, currentRegionId)),
    goToRegion: regionId => selectRegion(regionId),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add webapp/src/globe/globeScene.js
git commit -m "feat: add globe.gl scene glue with region selection"
```

*(Manual verification of this module happens in Task 6, once it's actually mounted on a page.)*

---

### Task 6: Wire the app together and verify end-to-end

**Files:**
- Modify: `webapp/index.html`
- Modify: `webapp/src/main.js`
- Create: `webapp/src/styles/globe.css`

**Interfaces:**
- Consumes: `REGIONS` (Task 2), `regionPosition` (Task 3), `initGlobeScene` (Task 5).
- Produces: the running application. This is the final deliverable of this plan — Plan 2 will extend `onRegionSelect` to open the side panel with real content.

- [ ] **Step 1: Write the theme stylesheet**

File: `webapp/src/styles/globe.css`
```css
:root {
  --navy: #0f1730;
  --navy2: #1a2340;
  --gold: #c9971f;
  --gold-light: #e0b53d;
}

* {
  box-sizing: border-box;
}

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  background: var(--navy);
  overflow: hidden;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
}

#globe-container {
  position: fixed;
  inset: 0;
}

.region-indicator {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 48, 0.85);
  border: 1px solid rgba(224, 181, 61, 0.3);
  border-radius: 20px;
  padding: 6px 16px;
  color: #fff;
  font-size: 13px;
  letter-spacing: 0.3px;
  z-index: 5;
}

.arrow-btn {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(15, 23, 48, 0.85);
  border: 1px solid rgba(224, 181, 61, 0.35);
  color: var(--gold-light);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  z-index: 5;
  transition: background 0.2s;
}

.arrow-btn:hover {
  background: rgba(201, 151, 31, 0.25);
}

.arrow-prev {
  left: 20px;
}

.arrow-next {
  right: 20px;
}
```

- [ ] **Step 2: Rewrite the HTML entry point**

File: `webapp/index.html`
```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Makor Morning News — Globe</title>
</head>
<body>
  <div id="globe-container"></div>
  <div id="region-indicator" class="region-indicator"></div>
  <button id="arrow-prev" class="arrow-btn arrow-prev" aria-label="Région précédente">‹</button>
  <button id="arrow-next" class="arrow-btn arrow-next" aria-label="Région suivante">›</button>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 3: Rewrite the entry script**

File: `webapp/src/main.js`
```js
import './styles/globe.css';
import { REGIONS } from './globe/regions.js';
import { regionPosition } from './globe/cycle.js';
import { initGlobeScene } from './globe/globeScene.js';

const container = document.getElementById('globe-container');
const indicator = document.getElementById('region-indicator');
const prevBtn = document.getElementById('arrow-prev');
const nextBtn = document.getElementById('arrow-next');

function updateIndicator(regionId) {
  const region = REGIONS.find(r => r.id === regionId);
  const { index, total } = regionPosition(REGIONS, regionId);
  indicator.textContent = `${region.label} · ${index}/${total}`;
}

const scene = initGlobeScene(container, {
  regions: REGIONS,
  initialRegionId: 'asia',
  onRegionSelect: updateIndicator,
});

prevBtn.addEventListener('click', () => scene.goToPrevRegion());
nextBtn.addEventListener('click', () => scene.goToNextRegion());
```

- [ ] **Step 4: Run the full automated test suite**

Run: `cd webapp && npm test`
Expected: PASS — all 18 tests across `regions.test.js`, `cycle.test.js`, and `camera.test.js` pass, 0 failures.

- [ ] **Step 5: Manual browser verification**

Run: `cd webapp && npm run dev`, then open the printed local URL in a browser.

Checklist:
- [ ] A photorealistic Earth renders on a dark, starry background, slowly auto-rotating on load.
- [ ] The indicator pill at the top reads `Asie · 1/4`.
- [ ] Clicking the Singapour marker stops the auto-rotation and smoothly zooms the camera to Asia.
- [ ] Clicking the right arrow (`›`) three times cycles: BRICS + UK (wide view showing all 6 country markers together, clearly more zoomed-out than the single-region views) → Europe (Paris) → Amérique du Nord (New York); the indicator updates each time (`BRICS + UK · 2/4`, `Europe · 3/4`, `Amérique du Nord · 4/4`).
- [ ] Clicking the right arrow a 4th time wraps back to `Asie · 1/4`.
- [ ] Clicking the left arrow (`‹`) cycles backwards through the same 4 regions.
- [ ] Resizing the browser window keeps the globe filling the viewport without distortion.

- [ ] **Step 6: Verify the production build still works**

Run: `cd webapp && npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add webapp/index.html webapp/src/main.js webapp/src/styles/globe.css
git commit -m "feat: wire globe scene, arrow navigation and theme into the app"
```

---

## End of Plan 1

At this point, `webapp/` contains a fully working, styled, tested standalone globe with region markers and arrow-based cycling — but clicking a region only updates the indicator pill, it doesn't yet show any content. **Plan 2** (side panel + week timeline) will extend `onRegionSelect` to open a side panel wired to real Firestore data, ported from the logic currently inline in the production `index.html`.
