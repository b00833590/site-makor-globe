export const PORTFOLIO_REGION_BY_GLOBE_REGION = {
  asia: 'asie',
  'brics-uk': 'brics-uk',
  europe: 'europe',
  'north-america': 'amerique-du-nord-canada',
};

export function getPortfolioEntriesForRegion(db, regionId) {
  const portfolioRegionId = PORTFOLIO_REGION_BY_GLOBE_REGION[regionId];
  if (!portfolioRegionId) return [];
  return Object.keys(db)
    .filter(key => key.startsWith('mkg:portfolio:'))
    .map(key => db[key])
    .filter(entry => entry.regionId === portfolioRegionId);
}

export function getPortfolioRegion(db, regionId) {
  const portfolioRegionId = PORTFOLIO_REGION_BY_GLOBE_REGION[regionId];
  if (!portfolioRegionId) return null;
  return db[`mkg:portfolio-region:${portfolioRegionId}`] || null;
}
