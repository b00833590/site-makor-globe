const DEFAULT_DIRECTION = { date: 'asc', depuis: 'desc', ytd: 'desc' };

function parseDDMM(dateStr) {
  const match = typeof dateStr === 'string' ? /^(\d{1,2})\/(\d{1,2})$/.exec(dateStr.trim()) : null;
  if (!match) return null;
  return Number(match[2]) * 100 + Number(match[1]);
}

function sortValue(entry, field) {
  if (field === 'date') {
    const parsed = parseDDMM(entry.date);
    return parsed === null ? Infinity : parsed;
  }
  const num = Number(entry[field]);
  return Number.isFinite(num) ? num : Infinity;
}

export function sortPortfolioEntries(entries, field, direction) {
  const sign = direction === 'desc' ? -1 : 1;
  return [...entries].sort((a, b) => sign * (sortValue(a, field) - sortValue(b, field)));
}

export function nextSort(currentField, currentDirection, clickedField) {
  if (clickedField === currentField) {
    return { field: clickedField, direction: currentDirection === 'asc' ? 'desc' : 'asc' };
  }
  return { field: clickedField, direction: DEFAULT_DIRECTION[clickedField] || 'asc' };
}
