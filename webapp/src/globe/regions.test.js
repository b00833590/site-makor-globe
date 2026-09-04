import { describe, it, expect } from 'vitest';
import { REGIONS } from './regions.js';

describe('REGIONS', () => {
  it('contains exactly the 4 expected regions', () => {
    expect(REGIONS.map(r => r.id).sort()).toEqual(
      ['asia', 'brics-uk', 'europe', 'north-america'].sort()
    );
  });

  it('assigns unique, zero-based sequential order values', () => {
    const orders = REGIONS.map(r => r.order).sort((a, b) => a - b);
    expect(orders).toEqual([0, 1, 2, 3]);
  });

  it('gives brics-uk exactly 6 points and bounds view mode', () => {
    const bricsUk = REGIONS.find(r => r.id === 'brics-uk');
    expect(bricsUk.points).toHaveLength(6);
    expect(bricsUk.viewMode).toBe('bounds');
  });

  it('gives asia, europe and north-america exactly 1 point and single view mode', () => {
    for (const id of ['asia', 'europe', 'north-america']) {
      const region = REGIONS.find(r => r.id === id);
      expect(region.points).toHaveLength(1);
      expect(region.viewMode).toBe('single');
    }
  });

  it('keeps every point within valid lat/lng bounds', () => {
    for (const region of REGIONS) {
      for (const point of region.points) {
        expect(point.lat).toBeGreaterThanOrEqual(-90);
        expect(point.lat).toBeLessThanOrEqual(90);
        expect(point.lng).toBeGreaterThanOrEqual(-180);
        expect(point.lng).toBeLessThanOrEqual(180);
      }
    }
  });
});
