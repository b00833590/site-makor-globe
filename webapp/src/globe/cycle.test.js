import { describe, it, expect } from 'vitest';
import { nextRegionId, prevRegionId, regionPosition } from './cycle.js';

const REGIONS = [
  { id: 'asia', order: 0 },
  { id: 'brics-uk', order: 1 },
  { id: 'europe', order: 2 },
  { id: 'north-america', order: 3 },
];

describe('nextRegionId', () => {
  it('returns the next region in order', () => {
    expect(nextRegionId(REGIONS, 'asia')).toBe('brics-uk');
    expect(nextRegionId(REGIONS, 'brics-uk')).toBe('europe');
    expect(nextRegionId(REGIONS, 'europe')).toBe('north-america');
  });

  it('wraps around from the last region to the first', () => {
    expect(nextRegionId(REGIONS, 'north-america')).toBe('asia');
  });

  it('falls back to the first region when the current id is unknown', () => {
    expect(nextRegionId(REGIONS, 'unknown')).toBe('asia');
  });
});

describe('prevRegionId', () => {
  it('returns the previous region in order', () => {
    expect(prevRegionId(REGIONS, 'europe')).toBe('brics-uk');
    expect(prevRegionId(REGIONS, 'brics-uk')).toBe('asia');
  });

  it('wraps around from the first region to the last', () => {
    expect(prevRegionId(REGIONS, 'asia')).toBe('north-america');
  });

  it('falls back to the first region when the current id is unknown', () => {
    expect(prevRegionId(REGIONS, 'unknown')).toBe('asia');
  });
});

describe('regionPosition', () => {
  it('returns a 1-based index and the total count', () => {
    expect(regionPosition(REGIONS, 'asia')).toEqual({ index: 1, total: 4 });
    expect(regionPosition(REGIONS, 'europe')).toEqual({ index: 3, total: 4 });
  });
});
