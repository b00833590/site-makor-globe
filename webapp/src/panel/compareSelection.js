const MAX_SELECTED = 2;

export function toggleCompanySelection(selectedIds, companyId) {
  if (selectedIds.includes(companyId)) {
    return selectedIds.filter(id => id !== companyId);
  }
  if (selectedIds.length >= MAX_SELECTED) {
    return selectedIds;
  }
  return [...selectedIds, companyId];
}
