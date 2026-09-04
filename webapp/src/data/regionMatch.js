const REGION_PATTERNS = [
  { regionId: 'asia', pattern: 'ASIE' },
  { regionId: 'brics-uk', pattern: 'BRICS' },
  { regionId: 'europe', pattern: 'EUROPE' },
  { regionId: 'north-america', pattern: 'AMERIQUE' },
];

function stripAccents(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeRegionLabel(rawLabel) {
  if (!rawLabel) return null;
  const normalized = stripAccents(rawLabel).toUpperCase();
  const match = REGION_PATTERNS.find(({ pattern }) => normalized.includes(pattern));
  return match ? match.regionId : null;
}
