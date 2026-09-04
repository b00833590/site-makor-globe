import { normalizeRegionLabel } from './regionMatch.js';

export function getWeeks(db) {
  return Object.keys(db)
    .filter(key => key.startsWith('mkg:week:'))
    .map(key => db[key])
    .sort((a, b) => a.order - b.order);
}

export function getMarketItemsForWeekAndRegion(db, weekId, regionId) {
  const prefix = `mkg:market:${weekId}:`;
  return Object.keys(db)
    .filter(key => key.startsWith(prefix))
    .map(key => db[key])
    .filter(item => normalizeRegionLabel(item.group) === regionId);
}

export function getNewsItemsForWeekAndRegion(db, weekId, regionId) {
  const prefix = `mkg:content:news:${weekId}:`;
  return Object.keys(db)
    .filter(key => key.startsWith(prefix))
    .map(key => db[key])
    .filter(item => normalizeRegionLabel(item.region) === regionId);
}

export function getCompanyItemsForWeekAndRegion(db, weekId, regionId) {
  const prefix = `mkg:content:entreprises:${weekId}:`;
  return Object.keys(db)
    .filter(key => key.startsWith(prefix))
    .map(key => db[key])
    .filter(item => normalizeRegionLabel(item.region) === regionId);
}

export function getIaFintechItemsForWeek(db, weekId) {
  const prefix = `mkg:content:ia-fintech:${weekId}:`;
  return Object.keys(db)
    .filter(key => key.startsWith(prefix))
    .map(key => db[key]);
}

export function getAllMarketItemsForWeek(db, weekId) {
  const prefix = `mkg:market:${weekId}:`;
  return Object.keys(db)
    .filter(key => key.startsWith(prefix))
    .map(key => db[key]);
}

export function getAllNewsItemsForWeek(db, weekId) {
  const prefix = `mkg:content:news:${weekId}:`;
  return Object.keys(db)
    .filter(key => key.startsWith(prefix))
    .map(key => db[key]);
}

export function getAllCompanyItemsForWeek(db, weekId) {
  const prefix = `mkg:content:entreprises:${weekId}:`;
  return Object.keys(db)
    .filter(key => key.startsWith(prefix))
    .map(key => db[key]);
}

// Every company document across every week, deduplicated by name (a company
// re-presented or copied via week-duplication keeps only its most recent
// occurrence), sorted alphabetically. Each returned item carries its source
// weekId (companies don't otherwise know which week they belong to) so
// callers can navigate straight to it. Shared by the top-banner quick search
// and the Lexique modal — the one place in this codebase that needs to look
// across all weeks for companies, so it lives here rather than being
// duplicated in either UI.
export function getAllCompaniesEverPresented(db) {
  const weekOrderById = new Map(getWeeks(db).map(week => [week.id, week.order]));
  const bestByName = new Map();
  for (const key of Object.keys(db)) {
    const match = /^mkg:content:entreprises:([^:]+):[^:]+$/.exec(key);
    if (!match) continue;
    const weekId = match[1];
    const item = db[key];
    const order = weekOrderById.get(weekId) ?? -Infinity;
    const existing = bestByName.get(item.name);
    if (!existing || order > existing.order) {
      bestByName.set(item.name, { ...item, weekId, order });
    }
  }
  return [...bestByName.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    .map(({ order, ...item }) => item);
}

export function getPresentations(db) {
  return Object.keys(db)
    .filter(key => key.startsWith('mkg:presentation:'))
    .map(key => db[key])
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export function getWeekContentKeys(db, weekId) {
  const prefixes = [
    `mkg:market:${weekId}:`,
    `mkg:content:news:${weekId}:`,
    `mkg:content:entreprises:${weekId}:`,
    `mkg:content:ia-fintech:${weekId}:`,
  ];
  const keys = Object.keys(db).filter(key => prefixes.some(prefix => key.startsWith(prefix)));
  keys.push(`mkg:week:${weekId}`);
  return keys;
}
