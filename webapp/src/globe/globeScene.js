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
