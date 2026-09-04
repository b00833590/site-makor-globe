import { describe, it, expect } from 'vitest';
import { generateId } from './uid.js';

describe('generateId', () => {
  it('returns a non-empty string', () => {
    const id = generateId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns a different value on each call', () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
  });
});
