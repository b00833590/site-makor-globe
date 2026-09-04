// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { companySymbol, companyPresentationDateISO, buildChartSVG } from './companyChart.js';

describe('companySymbol', () => {
  it('returns the yahooSymbol field when present', () => {
    expect(companySymbol({ name: 'Evergreen Marine', yahooSymbol: '2603.TW' })).toBe('2603.TW');
  });

  it('returns null when yahooSymbol is missing', () => {
    expect(companySymbol({ name: 'Mystery Co' })).toBeNull();
  });

  it('returns null when yahooSymbol is an empty string', () => {
    expect(companySymbol({ name: 'Mystery Co', yahooSymbol: '' })).toBeNull();
  });
});

describe('companyPresentationDateISO', () => {
  const CURRENT_YEAR = new Date().getFullYear();
  const PORTFOLIO_ENTRIES = [
    { entreprise: 'Evergreen Marine', date: '16/07' },
    { entreprise: 'Geely Automobile Holdings Ltd', date: 'n/a' },
  ];

  it('resolves the ISO date from a matching portfolio entry', () => {
    expect(companyPresentationDateISO({ name: 'Evergreen Marine' }, PORTFOLIO_ENTRIES))
      .toBe(`${CURRENT_YEAR}-07-16`);
  });

  it('returns null when no portfolio entry matches the company name', () => {
    expect(companyPresentationDateISO({ name: 'Unknown Co' }, PORTFOLIO_ENTRIES)).toBeNull();
  });

  it('returns null when the matching entry has an unparseable date', () => {
    expect(companyPresentationDateISO({ name: 'Geely Automobile Holdings Ltd' }, PORTFOLIO_ENTRIES)).toBeNull();
  });

  it('returns null when given an empty portfolio entries list', () => {
    expect(companyPresentationDateISO({ name: 'Evergreen Marine' }, [])).toBeNull();
  });
});

describe('buildChartSVG (legacy design)', () => {
  const RISING = [{ date: '2026-04-24', close: 100 }, { date: '2026-05-21', close: 110 }, { date: '2026-07-23', close: 130 }];
  const FALLING = [{ date: '2026-04-24', close: 100 }, { date: '2026-05-21', close: 90 }, { date: '2026-07-23', close: 70 }];

  it('uses green for a rising series and red for a falling one', () => {
    const risingSvg = buildChartSVG(RISING);
    expect(risingSvg.querySelector('polyline').getAttribute('stroke')).toBe('#1c8a4b');
    const fallingSvg = buildChartSVG(FALLING);
    expect(fallingSvg.querySelector('polyline').getAttribute('stroke')).toBe('#c0392b');
  });

  it('renders 3 y-axis gridlines/labels and up to 5 x-axis date labels', () => {
    const svg = buildChartSVG(RISING);
    expect(svg.querySelectorAll('line')).toHaveLength(3);
    const texts = [...svg.querySelectorAll('text')].map(t => t.textContent);
    expect(texts).toContain('130.00');
    expect(texts).toContain('100.00');
    expect(texts).toContain('04-24');
    expect(texts).toContain('07-23');
  });

  it('returns null for fewer than 2 points', () => {
    expect(buildChartSVG([{ date: '2026-04-24', close: 100 }])).toBeNull();
    expect(buildChartSVG([])).toBeNull();
  });
});
