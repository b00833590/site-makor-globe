import { describe, it, expect } from 'vitest';
import { toggleCompanySelection } from './compareSelection.js';

describe('toggleCompanySelection', () => {
  it('adds a company id to an empty selection', () => {
    expect(toggleCompanySelection([], 'a')).toEqual(['a']);
  });

  it('adds a second company id', () => {
    expect(toggleCompanySelection(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('removes a company id that is already selected', () => {
    expect(toggleCompanySelection(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('ignores a third company id when 2 are already selected', () => {
    expect(toggleCompanySelection(['a', 'b'], 'c')).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const input = ['a'];
    toggleCompanySelection(input, 'b');
    expect(input).toEqual(['a']);
  });
});
