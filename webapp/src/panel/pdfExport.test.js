// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { buildExportFilename, buildPortfolioExportFilename, addHeaderToEveryPage } from './pdfExport.js';

describe('buildExportFilename', () => {
  it('builds a filename from the region and week labels', () => {
    expect(buildExportFilename('Asie', 'Semaine 13-17 JUILLET')).toBe('Makor_Asie_Semaine_13_17_JUILLET.pdf');
  });

  it('replaces spaces and punctuation with underscores', () => {
    expect(buildExportFilename('BRICS + UK', 'Semaine du 23/03')).toBe('Makor_BRICS_UK_Semaine_du_23_03.pdf');
  });

  it('collapses consecutive non-alphanumeric characters into a single underscore', () => {
    expect(buildExportFilename('A---B', 'C   D')).toBe('Makor_A_B_C_D.pdf');
  });

  it('strips accents while preserving the base letter, rather than dropping it as a separator', () => {
    expect(buildExportFilename('É', 'Test')).toBe('Makor_E_Test.pdf');
  });

  it('strips accents from real region/week labels without mangling them', () => {
    expect(buildExportFilename('Amérique du Nord', 'Semaine du 1er DÉCEMBRE')).toBe('Makor_Amerique_du_Nord_Semaine_du_1er_DECEMBRE.pdf');
  });

  it('falls back to empty segments when labels are missing, still producing a valid filename', () => {
    expect(buildExportFilename('', '')).toBe('Makor__.pdf');
    expect(buildExportFilename(undefined, undefined)).toBe('Makor__.pdf');
  });
});

describe('buildPortfolioExportFilename', () => {
  it('builds a filename from the region and week labels, prefixed with Portefeuille', () => {
    expect(buildPortfolioExportFilename('Europe', 'Semaine 13-17 JUILLET')).toBe('Makor_Portefeuille_Europe_Semaine_13_17_JUILLET.pdf');
  });

  it('strips accents from real region/week labels without mangling them', () => {
    expect(buildPortfolioExportFilename('Amérique du Nord', 'Semaine du 1er DÉCEMBRE')).toBe('Makor_Portefeuille_Amerique_du_Nord_Semaine_du_1er_DECEMBRE.pdf');
  });

  it('falls back to empty segments when labels are missing, still producing a valid filename', () => {
    expect(buildPortfolioExportFilename('', '')).toBe('Makor_Portefeuille__.pdf');
    expect(buildPortfolioExportFilename(undefined, undefined)).toBe('Makor_Portefeuille__.pdf');
  });
});

describe('addHeaderToEveryPage', () => {
  it('sets each page and adds the header image to it', () => {
    const pdf = { internal: { getNumberOfPages: () => 2 }, setPage: vi.fn(), addImage: vi.fn() };
    addHeaderToEveryPage(pdf, 'data:image/png;base64,xxx');
    expect(pdf.setPage).toHaveBeenNthCalledWith(1, 1);
    expect(pdf.setPage).toHaveBeenNthCalledWith(2, 2);
    expect(pdf.addImage).toHaveBeenCalledTimes(2);
  });
});
