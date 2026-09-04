// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initLexiqueModal } from './lexiqueModal.js';

const COMPANIES = [
  { id: 'c1', name: 'Asia Cement', yahooSymbol: '1102.TW', region: 'Asie', weekId: 'w1' },
  { id: 'c2', name: 'Evergreen Marine', yahooSymbol: '2603.TW', region: 'Asie', weekId: 'w2' },
  { id: 'c3', name: 'EVT Ltd', yahooSymbol: 'EVT.XA', region: 'Asie', weekId: 'w3' },
];

function setup(companies = COMPANIES) {
  const modalEl = document.createElement('div');
  const searchInputEl = document.createElement('input');
  const listEl = document.createElement('div');
  const triggerBtn = document.createElement('button');
  const closeBtn = document.createElement('button');
  const onSelectCompany = vi.fn();
  const handle = initLexiqueModal({ modalEl, searchInputEl, listEl, triggerBtn, closeBtn, getAllCompanies: () => companies, onSelectCompany });
  return { modalEl, searchInputEl, listEl, triggerBtn, closeBtn, onSelectCompany, handle };
}

describe('initLexiqueModal', () => {
  it('opens the modal (adds the "open" class) and renders every company when the trigger is clicked', () => {
    const { modalEl, listEl, triggerBtn } = setup();
    triggerBtn.click();
    expect(modalEl.classList.contains('open')).toBe(true);
    expect(listEl.querySelectorAll('.lexique-item')).toHaveLength(3);
  });

  it('groups companies under a letter header, one per distinct initial in order', () => {
    const { listEl, triggerBtn } = setup();
    triggerBtn.click();
    const letters = [...listEl.querySelectorAll('.lexique-letter')].map(el => el.textContent);
    expect(letters).toEqual(['A', 'E']); // Asia Cement, then Evergreen Marine + EVT Ltd share "E"
  });

  it('groups an accented name under the same letter as its unaccented neighbors, even though it sorts between them (localeCompare("fr") interleaves "Ecole"/"École"/"Edison" as E, É, E)', () => {
    const withAccent = [
      { id: 'd1', name: 'Dell', yahooSymbol: '', region: 'Asie', weekId: 'w1' },
      { id: 'd2', name: 'Ecole ABC', yahooSymbol: '', region: 'Asie', weekId: 'w1' },
      { id: 'd3', name: 'École XYZ', yahooSymbol: '', region: 'Asie', weekId: 'w1' },
      { id: 'd4', name: 'Edison', yahooSymbol: '', region: 'Asie', weekId: 'w1' },
      { id: 'd5', name: 'Fanuc', yahooSymbol: '', region: 'Asie', weekId: 'w1' },
    ];
    const { listEl, triggerBtn } = setup(withAccent);
    triggerBtn.click();
    const letters = [...listEl.querySelectorAll('.lexique-letter')].map(el => el.textContent);
    expect(letters).toEqual(['D', 'E', 'F']); // not ['D', 'E', 'É', 'E', 'F']
    const eGroupItems = [...listEl.querySelectorAll('.lexique-item')].slice(1, 4).map(el => el.childNodes[0].textContent);
    expect(eGroupItems).toEqual(['Ecole ABC', 'École XYZ', 'Edison']);
  });

  it('filters the list live as the search input changes', () => {
    const { searchInputEl, listEl, triggerBtn } = setup();
    triggerBtn.click();
    searchInputEl.value = 'evt';
    searchInputEl.dispatchEvent(new Event('input'));
    const items = [...listEl.querySelectorAll('.lexique-item')];
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('EVT Ltd');
  });

  it('shows an empty-state message when nothing matches', () => {
    const { searchInputEl, listEl, triggerBtn } = setup();
    triggerBtn.click();
    searchInputEl.value = 'zzzzz';
    searchInputEl.dispatchEvent(new Event('input'));
    expect(listEl.querySelector('.lexique-empty')).not.toBeNull();
  });

  it('closes the modal and calls onSelectCompany when a company is clicked', () => {
    const { modalEl, listEl, triggerBtn, onSelectCompany } = setup();
    triggerBtn.click();
    listEl.querySelector('.lexique-item').click();
    expect(modalEl.classList.contains('open')).toBe(false);
    expect(onSelectCompany).toHaveBeenCalledWith(COMPANIES[0]); // "Asia Cement" sorts first
  });

  it('closes the modal when the close button is clicked', () => {
    const { modalEl, triggerBtn, closeBtn } = setup();
    triggerBtn.click();
    closeBtn.click();
    expect(modalEl.classList.contains('open')).toBe(false);
  });

  it('closes the modal when clicking the backdrop (the modal element itself, not its content)', () => {
    const { modalEl, triggerBtn } = setup();
    triggerBtn.click();
    modalEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(modalEl.classList.contains('open')).toBe(false);
  });

  it('resets the search field and re-renders the full list every time the modal re-opens', () => {
    const { searchInputEl, listEl, triggerBtn } = setup();
    triggerBtn.click();
    searchInputEl.value = 'evt';
    searchInputEl.dispatchEvent(new Event('input'));
    triggerBtn.click(); // re-open
    expect(searchInputEl.value).toBe('');
    expect(listEl.querySelectorAll('.lexique-item')).toHaveLength(3);
  });
});
