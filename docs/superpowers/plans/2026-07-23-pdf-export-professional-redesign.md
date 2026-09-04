---
title: Refonte professionnelle de l'export PDF (header Makor, pagination, typographie, tableaux)
date: 2026-07-23
status: draft
---

## Contexte

Quatrième et dernier des quatre plans issus d'une demande étendue d'amélioration ergonomique/esthétique (point 3). Aucune interaction Firestore — export en lecture seule du contenu déjà chargé.

**Décision d'architecture confirmée avec l'utilisateur** : on améliore le pipeline existant (`html2pdf.js` = capture d'écran du panneau + découpage en pages A4) plutôt qu'une refonte complète avec un moteur PDF natif (texte/tableaux construits programmatiquement). Conséquence assumée et explicite : "aucun élément coupé entre deux pages" est **fortement amélioré** via des règles CSS `page-break-inside: avoid` sur chaque bloc/ligne de tableau, mais **pas garanti à 100 %** dans tous les cas de figure possibles — une garantie absolue nécessiterait un moteur PDF natif, hors périmètre de cette itération.

**Asset fourni par l'utilisateur** : `webapp/public/assets/header-makor.png` (802×116 px, ratio ≈ 6,91:1 — renommé depuis `Header Makor.png` pour éviter tout problème d'espace dans une URL/asset public).

## Décisions de conception

- **Header sur chaque page** : `html2pdf.js` (capture-based) n'a pas de notion native de header répété par page. Solution standard et déjà documentée de l'écosystème `html2pdf.js`/`jsPDF` : après génération du PDF, on accède à l'instance `jsPDF` sous-jacente via `.toPdf().get('pdf').then(pdf => ...)`, on boucle sur `pdf.internal.getNumberOfPages()`, et on appelle `pdf.addImage(...)` sur chaque page. `jsPDF.addImage` a besoin d'une image déjà chargée (pas d'une simple URL qu'il irait chercher lui-même) — on précharge donc `header-makor.png` une fois via un élément `Image`/`canvas` converti en data URL, avant de lancer l'export.
- **Marge réservée pour le header** : calculée à partir du ratio réel de l'image (802/116 ≈ 6,91) et de la largeur imprimable A4 (210mm − 2×10mm de marge latérale = 190mm) → hauteur du header ≈ 27,5mm. Marge du haut réservée = 8mm (au-dessus du header) + 27,5mm (header) + 6mm (respiration avant le contenu) ≈ 41,5mm sur **chaque** page (le tableau `margin` de `html2pdf.js` s'applique uniformément à toutes les pages générées).
- **Anti-coupure d'éléments** : `pagebreak: { mode: ['css', 'legacy'] }` dans la config `html2pdf.js`, combiné à des règles `page-break-inside: avoid` / `break-inside: avoid` sur chaque ligne d'indice, bloc de news, carte entreprise, carte IA & Fintech, et ligne de tableau de portefeuille — dans le bloc `.side-panel.pdf-export` déjà existant dans `webapp/src/styles/globe.css`.
- **Hiérarchie visuelle / typographie** : passage à une police serif (`Georgia, 'Times New Roman', serif`) uniquement en mode `.pdf-export` (l'app à l'écran garde sa police sans-serif actuelle, inchangée) — évoque un vrai rapport imprimé plutôt qu'une capture d'interface web. Titre de région agrandi avec soulignement doré, libellés de section avec bordure fine et espacement augmenté, `page-break-after: avoid` sur les libellés de section pour limiter le risque qu'un titre se retrouve seul en bas de page (best-effort, même limite structurelle que ci-dessus).
- **Tableaux parfaitement alignés** : lignes zébrées (alternance de fond très légère) sur le tableau de portefeuille, colonnes DEPUIS/YTD (5ᵉ et 6ᵉ colonnes — ordre fixe confirmé dans `portfolioTable.js`, valable que le mode édition soit actif ou non puisque ce mode ne fait qu'ajouter une colonne supplémentaire en fin de ligne) alignées à droite avec `font-variant-numeric: tabular-nums`.
- **Qualité de capture** : `html2canvas.scale` passe de `2` à `3` (résolution de capture plus élevée, texte et éléments visuels plus nets à l'impression) et la qualité JPEG de `0.95` à `0.98`.
- **Portée** : ce plan s'applique identiquement aux deux boutons d'export déjà existants (export complet du panneau et export du portefeuille par région seul), puisque les deux appellent la même fonction `exportElementAsPDF`.

## Tâche 1 — `webapp/src/panel/pdfExport.js` : header répété + qualité + anti-coupure

Remplacer le contenu du fichier par :

```js
function sanitizeForFilename(value) {
  const withoutAccents = (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return withoutAccents.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function buildExportFilename(regionLabel, weekLabel) {
  return `Makor_${sanitizeForFilename(regionLabel)}_${sanitizeForFilename(weekLabel)}.pdf`;
}

export function buildPortfolioExportFilename(regionLabel, weekLabel) {
  return `Makor_Portefeuille_${sanitizeForFilename(regionLabel)}_${sanitizeForFilename(weekLabel)}.pdf`;
}

const A4_WIDTH_MM = 210;
const MARGIN_SIDE_MM = 10;
const MARGIN_BOTTOM_MM = 12;
const HEADER_MARGIN_TOP_MM = 8;
const HEADER_ASPECT_RATIO = 802 / 116;
const HEADER_WIDTH_MM = A4_WIDTH_MM - MARGIN_SIDE_MM * 2;
const HEADER_HEIGHT_MM = HEADER_WIDTH_MM / HEADER_ASPECT_RATIO;
const CONTENT_MARGIN_TOP_MM = HEADER_MARGIN_TOP_MM + HEADER_HEIGHT_MM + 6;
const HEADER_IMAGE_URL = '/assets/header-makor.png';

// Non testable en jsdom (canvas.getContext('2d') n'y est pas implémenté) —
// c'est pourquoi exportElementAsPDF accepte loadHeaderImageFn en injection,
// exactement comme html2pdfFn : les tests couvrent l'orchestration réelle
// en mockant ce point d'entrée, pas cette fonction elle-même.
export function loadImageAsDataURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error(`Failed to load header image: ${url}`));
    img.src = url;
  });
}

export function addHeaderToEveryPage(pdf, headerDataUrl) {
  const pageCount = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    pdf.addImage(headerDataUrl, 'PNG', MARGIN_SIDE_MM, HEADER_MARGIN_TOP_MM, HEADER_WIDTH_MM, HEADER_HEIGHT_MM);
  }
}

export async function exportElementAsPDF(element, filename, { html2pdfFn, loadHeaderImageFn = loadImageAsDataURL } = {}) {
  const fn = html2pdfFn || (await import('html2pdf.js')).default;
  const headerDataUrl = await loadHeaderImageFn(HEADER_IMAGE_URL);

  await fn()
    .set({
      margin: [CONTENT_MARGIN_TOP_MM, MARGIN_SIDE_MM, MARGIN_BOTTOM_MM, MARGIN_SIDE_MM],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 3, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    })
    .from(element)
    .toPdf()
    .get('pdf')
    .then(pdf => addHeaderToEveryPage(pdf, headerDataUrl))
    .save();
}
```

**Changement de signature à propager** : le 3ᵉ paramètre positionnel `html2pdfFn` devient un objet d'options `{ html2pdfFn, loadHeaderImageFn }`. Vérifié qu'aucun appel réel dans `main.js` ne passe ce 3ᵉ argument (`await exportElementAsPDF(sidePanelEl, filename);` dans les deux handlers d'export, appelé avec seulement 2 arguments) — **aucun changement nécessaire dans `main.js`**, seuls les tests (Tâche 2) doivent être adaptés à la nouvelle forme.

## Tâche 2 — Tests : `webapp/src/panel/pdfExport.test.js`

Remplacer le `describe('exportElementAsPDF', ...)` existant (le nouveau chaînage `.toPdf().get('pdf').then(...)` casse le mock actuel qui ne va que jusqu'à `.from().save()`) par :

```js
function makeHtml2pdfMock({ pageCount = 1 } = {}) {
  const pdf = {
    internal: { getNumberOfPages: () => pageCount },
    setPage: vi.fn(),
    addImage: vi.fn(),
  };
  const save = vi.fn().mockResolvedValue(undefined);
  const then = vi.fn(callback => {
    callback(pdf);
    return { save };
  });
  const get = vi.fn(() => ({ then }));
  const toPdf = vi.fn(() => ({ get }));
  const from = vi.fn(() => ({ toPdf }));
  const set = vi.fn(() => ({ from }));
  const html2pdfFn = vi.fn(() => ({ set }));
  return { html2pdfFn, set, from, toPdf, get, save, pdf };
}

describe('exportElementAsPDF', () => {
  it('configures html2pdf with the given filename, higher-quality capture, and CSS pagebreak mode', async () => {
    const { html2pdfFn, set, from, save } = makeHtml2pdfMock();
    const element = document.createElement('div');
    const loadHeaderImageFn = vi.fn().mockResolvedValue('data:image/png;base64,xxx');

    await exportElementAsPDF(element, 'test.pdf', { html2pdfFn, loadHeaderImageFn });

    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      filename: 'test.pdf',
      html2canvas: expect.objectContaining({ scale: 3 }),
      pagebreak: { mode: ['css', 'legacy'] },
    }));
    expect(from).toHaveBeenCalledWith(element);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('loads the header image once and stamps it onto every generated page', async () => {
    const { html2pdfFn, pdf } = makeHtml2pdfMock({ pageCount: 3 });
    const loadHeaderImageFn = vi.fn().mockResolvedValue('data:image/png;base64,xxx');

    await exportElementAsPDF(document.createElement('div'), 'test.pdf', { html2pdfFn, loadHeaderImageFn });

    expect(loadHeaderImageFn).toHaveBeenCalledTimes(1);
    expect(pdf.setPage).toHaveBeenCalledTimes(3);
    expect(pdf.addImage).toHaveBeenCalledTimes(3);
    expect(pdf.addImage).toHaveBeenCalledWith('data:image/png;base64,xxx', 'PNG', expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number));
  });

  it('rejects when the underlying html2pdf save() call rejects', async () => {
    const { html2pdfFn, save } = makeHtml2pdfMock();
    save.mockRejectedValue(new Error('canvas render failed'));
    const loadHeaderImageFn = vi.fn().mockResolvedValue('data:image/png;base64,xxx');

    await expect(
      exportElementAsPDF(document.createElement('div'), 'test.pdf', { html2pdfFn, loadHeaderImageFn })
    ).rejects.toThrow('canvas render failed');
  });

  it('rejects when the header image fails to load, without ever calling html2pdf', async () => {
    const { html2pdfFn } = makeHtml2pdfMock();
    const loadHeaderImageFn = vi.fn().mockRejectedValue(new Error('image load failed'));

    await expect(
      exportElementAsPDF(document.createElement('div'), 'test.pdf', { html2pdfFn, loadHeaderImageFn })
    ).rejects.toThrow('image load failed');
    expect(html2pdfFn).not.toHaveBeenCalled();
  });

  it('dynamically imports the real html2pdf.js module when no override function is given', async () => {
    const html2pdfModule = await import('html2pdf.js');
    const { set, from, toPdf, get, save, pdf } = makeHtml2pdfMock();
    html2pdfModule.default.mockReturnValue({ set });
    const loadHeaderImageFn = vi.fn().mockResolvedValue('data:image/png;base64,xxx');

    await exportElementAsPDF(document.createElement('div'), 'test.pdf', { loadHeaderImageFn });

    expect(html2pdfModule.default).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
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
```

Adapter l'import en haut du fichier pour inclure `addHeaderToEveryPage` :

```js
import { buildExportFilename, exportElementAsPDF, buildPortfolioExportFilename, addHeaderToEveryPage } from './pdfExport.js';
```

## Tâche 3 — `webapp/src/styles/globe.css` : mise en page professionnelle du contenu exporté

Dans le bloc `.side-panel.pdf-export` déjà existant (repérable au commentaire "Applied temporarily to .side-panel during PDF generation only"), ajouter les règles suivantes (ne remplace rien, s'ajoute à l'existant) :

```css
.side-panel.pdf-export {
  font-family: Georgia, 'Times New Roman', serif;
}

.side-panel.pdf-export .panel-region-label {
  font-size: 22px;
  letter-spacing: 1px;
  border-bottom: 2px solid #c9971f;
  padding-bottom: 8px;
  margin-bottom: 16px;
}

.side-panel.pdf-export .panel-section-label {
  font-size: 13px;
  border-bottom: 1px solid rgba(15, 23, 48, 0.2);
  padding-bottom: 4px;
  margin: 22px 0 10px;
  page-break-after: avoid;
  break-after: avoid;
}

.side-panel.pdf-export .panel-index-row,
.side-panel.pdf-export .panel-news-block,
.side-panel.pdf-export .panel-company-card,
.side-panel.pdf-export .panel-iafintech-card,
.side-panel.pdf-export .portfolio-table tr {
  page-break-inside: avoid;
  break-inside: avoid;
}

.side-panel.pdf-export .portfolio-table th,
.side-panel.pdf-export .portfolio-table td {
  padding: 7px 6px;
}

.side-panel.pdf-export .portfolio-table tbody tr:nth-child(even) {
  background: rgba(15, 23, 48, 0.04);
}

.side-panel.pdf-export .portfolio-table th:nth-child(5),
.side-panel.pdf-export .portfolio-table th:nth-child(6),
.side-panel.pdf-export .portfolio-table td:nth-child(5),
.side-panel.pdf-export .portfolio-table td:nth-child(6) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

## Contraintes globales

- Ne pas toucher à `main.js` (aucun changement d'appel nécessaire, confirmé ci-dessus).
- Ne pas tenter une garantie absolue de non-coupure d'élément — limite assumée et documentée de l'approche capture-based, confirmée avec l'utilisateur.
- Ne pas ajouter de nouveau type de contenu au PDF (ex. le graphique SVG de la modale entreprise) — hors périmètre, la demande porte sur la qualité de mise en page de l'existant, pas sur l'ajout de nouvelles données exportées.
- Ne pas toucher aux points 1, 2, 4, 5, 6 de la demande (traités dans des plans séparés).

## Vérification

- `cd webapp && npx vitest run` doit rester vert, avec ~5 tests de plus (nouveaux tests `exportElementAsPDF`/`addHeaderToEveryPage`, en remplacement des 3 tests existants pour `exportElementAsPDF` qui ne correspondent plus à la nouvelle forme de chaînage — le delta net dépend du nombre exact remplacé vs ajouté, à vérifier précisément par l'implémenteur).
- `npm run build` doit rester propre.
- Aucune interaction Firestore — vérification manuelle **visuelle** dans le navigateur, sur une région avec suffisamment de contenu pour générer au moins 2 pages :
  - Le header Makor apparaît en haut de **chaque** page du PDF généré, à une taille et une position cohérentes.
  - Aucune ligne de tableau, bloc de news, carte entreprise ou carte IA & Fintech n'est visuellement coupée en deux entre deux pages (tester spécifiquement une région/semaine avec beaucoup de contenu, où une coupure serait la plus probable).
  - Les colonnes DEPUIS/YTD du tableau de portefeuille sont alignées à droite, lignes zébrées visibles.
  - Le titre de région et les libellés de section sont visuellement plus marqués que le contenu (hiérarchie claire).
  - Ouvrir le PDF final : aucune retouche manuelle ne devrait être nécessaire pour le rendre présentable.
  - Tester aussi l'export "portefeuille par région" (bouton 📄 à côté du libellé de région dans la section portefeuille) — même header, mêmes règles de mise en page.
