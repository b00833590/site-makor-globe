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
