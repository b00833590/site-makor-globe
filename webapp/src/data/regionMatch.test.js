import { describe, it, expect } from 'vitest';
import { normalizeRegionLabel } from './regionMatch.js';

describe('normalizeRegionLabel', () => {
  it('matches market/indices group labels', () => {
    expect(normalizeRegionLabel('ASIE')).toBe('asia');
    expect(normalizeRegionLabel('BRICS')).toBe('brics-uk');
    expect(normalizeRegionLabel('BRICS+UK')).toBe('brics-uk');
    expect(normalizeRegionLabel('EUROPE')).toBe('europe');
    expect(normalizeRegionLabel('EUROPE & UK')).toBe('europe');
    expect(normalizeRegionLabel('AMÉRIQUE DU NORD')).toBe('north-america');
  });

  it('matches composed news region labels produced by the legacy migration', () => {
    expect(normalizeRegionLabel('JP — ASIE —')).toBe('asia');
    expect(normalizeRegionLabel('IN — BRICS —')).toBe('brics-uk');
    expect(normalizeRegionLabel('EU — EUROPE —')).toBe('europe');
    expect(normalizeRegionLabel('US — AMÉRIQUE DU NORD —')).toBe('north-america');
  });

  it('matches entreprises free-text region labels case-insensitively', () => {
    expect(normalizeRegionLabel('Asie')).toBe('asia');
    expect(normalizeRegionLabel('BRICS')).toBe('brics-uk');
    expect(normalizeRegionLabel('Europe')).toBe('europe');
    expect(normalizeRegionLabel('Amérique du Nord')).toBe('north-america');
    expect(normalizeRegionLabel('amerique du nord')).toBe('north-america');
  });

  it('returns null for non-regional groups', () => {
    expect(normalizeRegionLabel('MATIÈRES PREMIÈRES & CRYPTO')).toBeNull();
    expect(normalizeRegionLabel('DEVISES (VS USD)')).toBeNull();
  });

  it('returns null for missing input', () => {
    expect(normalizeRegionLabel(null)).toBeNull();
    expect(normalizeRegionLabel(undefined)).toBeNull();
    expect(normalizeRegionLabel('')).toBeNull();
  });
});
