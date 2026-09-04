import { describe, it, expect } from 'vitest';
import { safeText } from './pdfTextSanitize.js';

describe('safeText', () => {
  it('replaces a narrow no-break space (French thousands separator, e.g. jsPDF-breaking "64 611 pts") with a plain space', () => {
    expect(safeText('64 611 pts')).toBe('64 611 pts');
  });

  it('replaces a non-breaking space with a plain space', () => {
    expect(safeText('8 772 pts')).toBe('8 772 pts');
  });

  it('replaces every other special space variant it targets', () => {
    const codepoints = [0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x205f, 0x3000];
    for (const cp of codepoints) {
      expect(safeText(`a${String.fromCodePoint(cp)}b`)).toBe('a b');
    }
  });

  it('leaves ordinary text (including accents and normal spaces) untouched', () => {
    expect(safeText('Le KOSPI sud-coréen a bondi de 4,40%')).toBe('Le KOSPI sud-coréen a bondi de 4,40%');
  });

  it('leaves CP1252 punctuation the standard fonts DO handle untouched (dashes, ellipsis, guillemets, €, •, ², curly quotes)', () => {
    const kept = '« Thèse » — compounder de qualité… €10² • +5 %, « qu’elle » l’a dit';
    expect(safeText(kept)).toBe(kept);
  });

  it('transliterates arrows the analysts type ("→" rendered as "!\'" by jsPDF) to "->"', () => {
    expect(safeText('data centers → vannes IMI')).toBe('data centers -> vannes IMI');
    expect(safeText('marge ⇒ rerating')).toBe('marge -> rerating');
  });

  it('transliterates math operators jsPDF mis-encodes (≈ ≥ ≤ ≠) to ASCII', () => {
    expect(safeText('P/E ≈ 23× (vs ~38×)')).toBe('P/E ~ 23× (vs ~38×)');
    expect(safeText('CA ≥ 2 Md€, dette ≤ 1,2x, BPA ≠ 0')).toBe('CA >= 2 Md€, dette <= 1,2x, BPA != 0');
  });

  it('transliterates the non-CP1252 superscript in French ordinals ("4ᵉ" rendered as "4I") to "4e"', () => {
    expect(safeText('4ᵉ activité et maillon faible')).toBe('4e activité et maillon faible');
    expect(safeText('1ᵉʳ semestre')).toBe('1er semestre');
  });

  it('transliterates non-CP1252 superscript digits but leaves CP1252 "¹²³" alone', () => {
    expect(safeText('x⁴ puis x²')).toBe('x4 puis x²');
  });

  it('returns an empty string for null/undefined', () => {
    expect(safeText(null)).toBe('');
    expect(safeText(undefined)).toBe('');
  });

  it('coerces non-string values (e.g. numbers) to string', () => {
    expect(safeText(42)).toBe('42');
  });
});
