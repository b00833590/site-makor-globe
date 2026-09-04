// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initTopBanner } from './topBanner.js';

const COMPANIES = [
  { id: 'c1', name: 'Toyota', yahooSymbol: '7203.T', region: 'Asie', weekId: 'w1' },
  { id: 'c2', name: 'Reliance Industries', yahooSymbol: 'RELIANCE.NS', region: 'BRICS', weekId: 'w2' },
];

function setup(companies = COMPANIES) {
  const searchInputEl = document.createElement('input');
  const searchResultsEl = document.createElement('div');
  const onSelectCompany = vi.fn();
  initTopBanner({ searchInputEl, searchResultsEl, getAllCompanies: () => companies, onSelectCompany });
  return { searchInputEl, searchResultsEl, onSelectCompany };
}

function type(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('initTopBanner', () => {
  it('shows no results dropdown when the query is empty', () => {
    const { searchResultsEl } = setup();
    expect(searchResultsEl.style.display).toBe('none');
  });

  it('filters companies by name, case-insensitively', () => {
    const { searchInputEl, searchResultsEl } = setup();
    type(searchInputEl, 'toyo');
    const results = [...searchResultsEl.querySelectorAll('.top-banner-search-result')];
    expect(results).toHaveLength(1);
    expect(results[0].textContent).toContain('Toyota');
  });

  it('filters companies by yahooSymbol too', () => {
    const { searchInputEl, searchResultsEl } = setup();
    type(searchInputEl, 'reliance.ns');
    const results = [...searchResultsEl.querySelectorAll('.top-banner-search-result')];
    expect(results).toHaveLength(1);
    expect(results[0].textContent).toContain('Reliance Industries');
  });

  it('shows an empty-state message when nothing matches', () => {
    const { searchInputEl, searchResultsEl } = setup();
    type(searchInputEl, 'zzzzz');
    expect(searchResultsEl.querySelector('.top-banner-search-empty')).not.toBeNull();
    expect(searchResultsEl.querySelectorAll('.top-banner-search-result')).toHaveLength(0);
  });

  it('caps results at 8 matches', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, name: `Company ${i}`, yahooSymbol: '', region: 'Asie', weekId: 'w1' }));
    const { searchInputEl, searchResultsEl } = setup(many);
    type(searchInputEl, 'company');
    expect(searchResultsEl.querySelectorAll('.top-banner-search-result')).toHaveLength(8);
  });

  it('calls onSelectCompany and clears the input/results when a result is clicked', () => {
    const { searchInputEl, searchResultsEl, onSelectCompany } = setup();
    type(searchInputEl, 'toyota');
    searchResultsEl.querySelector('.top-banner-search-result').click();
    expect(onSelectCompany).toHaveBeenCalledWith(COMPANIES[0]);
    expect(searchInputEl.value).toBe('');
    expect(searchResultsEl.style.display).toBe('none');
  });

  it('Enter key selects the first (highlighted) result', () => {
    const { searchInputEl, onSelectCompany } = setup();
    type(searchInputEl, 'toyota');
    searchInputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onSelectCompany).toHaveBeenCalledWith(COMPANIES[0]);
  });

  it('Escape key closes the results dropdown', () => {
    const { searchInputEl, searchResultsEl } = setup();
    type(searchInputEl, 'toyota');
    searchInputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(searchResultsEl.style.display).toBe('none');
  });
});
