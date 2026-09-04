import { describe, it, expect } from 'vitest';
import { haversineDistanceKm, centroid, cameraForRegion } from './camera.js';

describe('haversineDistanceKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistanceKm({ lat: 48.8566, lng: 2.3522 }, { lat: 48.8566, lng: 2.3522 })).toBe(0);
  });

  it('returns roughly the known great-circle distance between Paris and New York', () => {
    const paris = { lat: 48.8566, lng: 2.3522 };
    const newYork = { lat: 40.7128, lng: -74.0060 };
    const distance = haversineDistanceKm(paris, newYork);
    expect(distance).toBeGreaterThan(5800);
    expect(distance).toBeLessThan(5900);
  });
});

describe('centroid', () => {
  it('averages latitude and longitude of all points', () => {
    const result = centroid([
      { lat: 0, lng: 0 },
      { lat: 10, lng: 20 },
    ]);
    expect(result).toEqual({ lat: 5, lng: 10 });
  });
});

describe('cameraForRegion', () => {
  it('centers on the single point for single-mode regions, at a fixed close altitude', () => {
    const region = { viewMode: 'single', points: [{ lat: 48.8566, lng: 2.3522 }] };
    const pov = cameraForRegion(region);
    expect(pov.lat).toBe(48.8566);
    expect(pov.lng).toBe(2.3522);
    expect(pov.altitude).toBe(1.4);
  });

  it('centers on the centroid of all points for bounds-mode regions', () => {
    const region = {
      viewMode: 'bounds',
      points: [
        { lat: 0, lng: 0 },
        { lat: 10, lng: 10 },
      ],
    };
    const pov = cameraForRegion(region);
    expect(pov.lat).toBe(5);
    expect(pov.lng).toBe(5);
  });

  it('always frames bounds-mode regions further out than the fixed single-point altitude', () => {
    const singleRegion = { viewMode: 'single', points: [{ lat: 0, lng: 0 }] };
    const tightBoundsRegion = {
      viewMode: 'bounds',
      points: [
        { lat: 0, lng: 0 },
        { lat: 0.01, lng: 0.01 },
      ],
    };
    expect(cameraForRegion(tightBoundsRegion).altitude).toBeGreaterThan(cameraForRegion(singleRegion).altitude);
  });

  it('caps the bounds altitude at 4 for extremely spread-out points', () => {
    const clusterPoint = { lat: 0, lng: 0 };
    const farPoint = { lat: 0, lng: 179.9 };
    const region = {
      viewMode: 'bounds',
      points: [...Array(20).fill(clusterPoint), farPoint],
    };
    expect(cameraForRegion(region).altitude).toBe(4);
  });
});
