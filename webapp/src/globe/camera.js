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
