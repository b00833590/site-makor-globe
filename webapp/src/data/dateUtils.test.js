import { describe, it, expect } from 'vitest';
import { ddmmToISOThisYear, fridayOfCurrentWeekDDMM } from './dateUtils.js';

describe('ddmmToISOThisYear', () => {
  it('converts a DD/MM string to an ISO date using the given reference date\'s year', () => {
    expect(ddmmToISOThisYear('16/07', new Date('2026-01-01'))).toBe('2026-07-16');
  });

  it('pads single-digit day and month', () => {
    expect(ddmmToISOThisYear('5/3', new Date('2026-01-01'))).toBe('2026-03-05');
  });

  it('defaults to the current year when no reference date is given', () => {
    const year = new Date().getFullYear();
    expect(ddmmToISOThisYear('01/01')).toBe(`${year}-01-01`);
  });

  it('returns null for an unparseable date string', () => {
    expect(ddmmToISOThisYear('n/a')).toBeNull();
  });

  it('returns null for a non-string input', () => {
    expect(ddmmToISOThisYear(undefined)).toBeNull();
    expect(ddmmToISOThisYear(null)).toBeNull();
  });
});

describe('fridayOfCurrentWeekDDMM', () => {
  it('returns the same Friday when "now" already is that Friday', () => {
    expect(fridayOfCurrentWeekDDMM(new Date('2026-07-24T10:00:00'))).toBe('24/07'); // a Friday
  });

  it('returns that week\'s Friday when "now" is a Monday', () => {
    expect(fridayOfCurrentWeekDDMM(new Date('2026-07-20T10:00:00'))).toBe('24/07');
  });

  it('returns that week\'s Friday when "now" is a Wednesday', () => {
    expect(fridayOfCurrentWeekDDMM(new Date('2026-07-22T10:00:00'))).toBe('24/07');
  });

  it('returns the PAST Friday of the same ISO week when "now" is a Saturday', () => {
    expect(fridayOfCurrentWeekDDMM(new Date('2026-07-25T10:00:00'))).toBe('24/07');
  });

  it('returns the PAST Friday of the same ISO week when "now" is a Sunday', () => {
    expect(fridayOfCurrentWeekDDMM(new Date('2026-07-26T10:00:00'))).toBe('24/07');
  });

  it('pads single-digit day and month', () => {
    expect(fridayOfCurrentWeekDDMM(new Date('2026-08-03T10:00:00'))).toBe('07/08'); // Monday 3 Aug -> Friday 7 Aug
  });

  it('handles a week whose Friday falls in the previous month from "now" (now = Saturday 1 Aug, that week\'s Friday = 31 July)', () => {
    expect(fridayOfCurrentWeekDDMM(new Date('2026-08-01T10:00:00'))).toBe('31/07');
  });
});
