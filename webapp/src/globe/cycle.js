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
