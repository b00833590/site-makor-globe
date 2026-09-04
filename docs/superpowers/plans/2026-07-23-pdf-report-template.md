---
title: Nouveau modèle de rapport PDF — abandon de la capture du panneau, mise en page dense et professionnelle
date: 2026-07-23
status: draft
---

## Contexte

Quatrième et dernier des quatre plans, le plus important. L'utilisateur demande explicitement d'abandonner l'approche actuelle ("une simple capture du panneau latéral") et de construire un modèle de rapport PDF entièrement nouveau, dense, professionnel, utilisant toute la largeur disponible, sans perte de données (YTD, Cours actuel, Objectif, et toutes les autres métriques par entreprise).

**Ce qui est conservé de la phase 30** (la refonte PDF précédente) : le mécanisme générique `exportElementAsPDF(element, filename, options)` dans `webapp/src/panel/pdfExport.js` — préchargement du header Makor en data URL, apposition sur chaque page via `jsPDF.addImage`, résolution de capture `html2canvas.scale: 3`, mode `pagebreak: {mode:['css','legacy']}` — reste **entièrement inchangé et réutilisé tel quel**, puisqu'il est déjà générique sur l'élément DOM capturé, pas spécifique au panneau latéral.

**Ce qui devient obsolète et doit être retiré** : le bloc CSS `.side-panel.pdf-export ...` ajouté en phase 30 dans `webapp/src/styles/globe.css` (typographie, anti-coupure, tableaux zébrés — tout ce qui stylait spécifiquement le panneau pendant l'export) devient du code mort, puisque `.side-panel` ne sera plus jamais passé à `exportElementAsPDF` — remplacé par un nouveau bloc CSS dédié et autonome, scopé aux classes du nouveau rapport.

## Décisions de conception

- **Nouveau module pur** `webapp/src/panel/pdfReport.js` : construit un arbre DOM détaché (pas encore inséré dans le document) représentant le rapport complet, à partir des données déjà chargées (pas une capture de ce qui est affiché à l'écran — les deux peuvent diverger, ex. le panneau replié ou en cours d'édition n'a aucune influence sur le contenu du rapport). Fonction principale : `buildReportElement({ regionLabel, weekLabel, portfolioRegionLabel, marketItems, newsItems, companyItems, portfolioEntries, sections })` — le paramètre `sections` (tableau, ex. `['indices','news','companies','portfolio']`) permet de réutiliser exactement le même constructeur pour l'export "portefeuille seul" (`sections: ['portfolio']`) sans dupliquer la logique de mise en page.
- **Insertion temporaire hors-écran** : le rapport est ajouté à `document.body` avec `position:fixed; left:-99999px; top:0;` (rendu réel par le navigateur — nécessaire pour que `html2canvas` calcule des dimensions correctes — mais invisible à l'utilisateur), capturé, puis retiré du DOM dans un bloc `finally`.
- **Mise en page dense, pleine largeur** : le rapport a une largeur fixe de 780px (proportionnelle à une page A4 avec marges, une fois mise à l'échelle par `html2pdf.js`) — largement supérieure aux 460px du panneau actuel. Entreprises présentées en grille 2 colonnes (au lieu d'un empilement vertical), indices de marché en lignes compactes affichant nom/valeur/variation sur une seule ligne, tableau de portefeuille pleine largeur avec les 6 colonnes déjà zébrées/colorées (réutilise la même logique de couleur DEPUIS/YTD que le plan de nettoyage interface — dupliquée ici en CSS pure puisque le rapport ne partage pas le DOM du panneau).
- **Aucune perte de donnée** : chaque entreprise affiche ses 4 statistiques (avec leurs libellés personnalisés éventuels) ET tous ses points clés (bullets) — rien n'est tronqué par une largeur de colonne insuffisante, contrairement à l'ancien panneau capturé tel quel.
- **Hors périmètre, assumé** : les couleurs personnalisées choisies par l'admin via le sélecteur de couleur (phase 20/24, `item.colors.value`/`.name`/`.weekChange`) ne sont pas reprises dans le rapport PDF — celui-ci utilise uniquement la coloration standard positif/négatif. Ajouter le support des couleurs personnalisées serait un enrichissement séparé, non demandé explicitement ici.
- **Retrait du code mort** : le bloc `.side-panel.pdf-export` dans `globe.css` (phase 30) est supprimé — plus jamais utilisé une fois les deux boutons d'export basculés vers le nouveau rapport.

## Tâche 1 — Nouveau `webapp/src/panel/pdfReport.js`

```js
const POSITIVE_COLOR = '#1c8a4b';
const NEGATIVE_COLOR = '#c0392b';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function changeColor(value) {
  return Number(value) < 0 ? NEGATIVE_COLOR : POSITIVE_COLOR;
}

function buildHeader(regionLabel, weekLabel) {
  const header = el('div', 'pdf-report-header');
  header.appendChild(el('h1', 'pdf-report-title', regionLabel));
  header.appendChild(el('div', 'pdf-report-week', weekLabel));
  return header;
}

function buildSectionLabel(text) {
  return el('div', 'pdf-report-section-label', text);
}

function buildIndicesSection(marketItems) {
  const grid = el('div', 'pdf-report-indices');
  for (const item of marketItems) {
    const row = el('div', 'pdf-report-index-row');
    row.appendChild(el('span', 'pdf-report-index-name', [item.flag, item.name].filter(Boolean).join(' ')));
    row.appendChild(el('span', 'pdf-report-index-value', item.value ?? ''));
    const change = el('span', 'pdf-report-index-change', `${item.weekChange}%`);
    change.style.color = changeColor(item.weekChange);
    row.appendChild(change);
    grid.appendChild(row);
  }
  return grid;
}

function buildNewsSection(newsItems) {
  const wrap = el('div', 'pdf-report-news');
  for (const item of newsItems) {
    const block = el('div', 'pdf-report-news-block');
    block.appendChild(el('h3', null, item.title || ''));
    block.appendChild(el('p', null, item.description || ''));
    wrap.appendChild(block);
  }
  return wrap;
}

const STAT_FIELDS = [
  ['salesGrowthLabel', 'salesGrowth', 'Croissance CA'],
  ['evEbitdaLabel', 'evEbitda', 'EV/EBITDA'],
  ['coursActuelLabel', 'coursActuel', 'Cours actuel'],
  ['targetPriceLabel', 'targetPrice', 'Objectif'],
];

function buildCompanyCard(item) {
  const card = el('div', 'pdf-report-company-card');
  const header = el('div', 'pdf-report-company-header');
  header.appendChild(el('span', 'pdf-report-company-name', item.name || ''));
  header.appendChild(el('span', 'pdf-report-company-sub', [item.yahooSymbol, item.flag, item.country].filter(Boolean).join(' · ')));
  card.appendChild(header);
  if (item.marketCap) card.appendChild(el('div', 'pdf-report-company-cap', item.marketCap));

  const stats = el('div', 'pdf-report-company-stats');
  for (const [labelField, valueField, defaultLabel] of STAT_FIELDS) {
    const stat = el('div', 'pdf-report-company-stat');
    stat.appendChild(el('span', 'pdf-report-company-stat-label', item[labelField] || defaultLabel));
    stat.appendChild(el('span', 'pdf-report-company-stat-value', item[valueField] ?? ''));
    stats.appendChild(stat);
  }
  card.appendChild(stats);

  if ((item.bullets || []).length) {
    const bullets = el('ul', 'pdf-report-company-bullets');
    for (const bullet of item.bullets) bullets.appendChild(el('li', null, bullet));
    card.appendChild(bullets);
  }

  return card;
}

function buildCompaniesSection(companyItems) {
  const grid = el('div', 'pdf-report-companies');
  for (const item of companyItems) grid.appendChild(buildCompanyCard(item));
  return grid;
}

const PORTFOLIO_COLUMNS = [
  ['date', 'DATE'], ['entreprise', 'ENTREPRISE'], ['stagiaire', 'STAGIAIRE'],
  ['symbol', 'SYMBOLE'], ['depuis', 'DEPUIS'], ['ytd', 'YTD'],
];
const PORTFOLIO_PERCENT_FIELDS = new Set(['depuis', 'ytd']);

function buildPortfolioSection(portfolioEntries, portfolioRegionLabel) {
  const wrap = el('div', 'pdf-report-portfolio');
  if (portfolioRegionLabel) wrap.appendChild(el('div', 'pdf-report-portfolio-region', portfolioRegionLabel));

  const table = el('table', 'pdf-report-portfolio-table');
  const thead = el('thead');
  const headRow = el('tr');
  for (const [, label] of PORTFOLIO_COLUMNS) headRow.appendChild(el('th', null, label));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  for (const entry of portfolioEntries) {
    const row = el('tr');
    for (const [field] of PORTFOLIO_COLUMNS) {
      const raw = entry[field];
      const isPercent = PORTFOLIO_PERCENT_FIELDS.has(field);
      const td = el('td', null, isPercent ? (raw === undefined || raw === null || raw === '' ? '' : `${raw}%`) : (raw ?? ''));
      if (isPercent && raw !== undefined && raw !== null && raw !== '') td.style.color = changeColor(raw);
      row.appendChild(td);
    }
    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

export function buildReportElement({
  regionLabel, weekLabel, portfolioRegionLabel = '',
  marketItems = [], newsItems = [], companyItems = [], portfolioEntries = [],
  sections = ['indices', 'news', 'companies', 'portfolio'],
}) {
  const root = el('div', 'pdf-report');
  root.appendChild(buildHeader(regionLabel, weekLabel));

  if (sections.includes('indices') && marketItems.length) {
    root.appendChild(buildSectionLabel('Indices régionaux'));
    root.appendChild(buildIndicesSection(marketItems));
  }
  if (sections.includes('news') && newsItems.length) {
    root.appendChild(buildSectionLabel('News macro'));
    root.appendChild(buildNewsSection(newsItems));
  }
  if (sections.includes('companies') && companyItems.length) {
    root.appendChild(buildSectionLabel('Entreprises présentées'));
    root.appendChild(buildCompaniesSection(companyItems));
  }
  if (sections.includes('portfolio') && portfolioEntries.length) {
    root.appendChild(buildSectionLabel('Suivi de portefeuille'));
    root.appendChild(buildPortfolioSection(portfolioEntries, portfolioRegionLabel));
  }

  return root;
}
```

### Tests — `webapp/src/panel/pdfReport.test.js`

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildReportElement } from './pdfReport.js';

const MARKET_ITEMS = [{ flag: '🇫🇷', name: 'CAC 40', value: '8 268 pts', weekChange: -0.83 }];
const NEWS_ITEMS = [{ title: 'Titre test', description: 'Description test' }];
const COMPANY_ITEMS = [{
  name: 'ARM Holdings', yahooSymbol: 'ARM', flag: '🇬🇧', country: 'UK', marketCap: '143,3 Md$',
  salesGrowth: '+26,35%', evEbitda: 'N/A', coursActuel: '—', targetPrice: '1345$',
  bullets: ['Point clé 1', 'Point clé 2'],
}];
const PORTFOLIO_ENTRIES = [
  { date: '20/03', entreprise: 'Sumitomo Pharma', stagiaire: '', symbol: '4506.T', depuis: -30.66, ytd: -44.52 },
];

describe('buildReportElement', () => {
  it('renders the region label and week label in the header', () => {
    const report = buildReportElement({ regionLabel: 'Europe', weekLabel: 'Semaine 23-27 MARS' });
    expect(report.querySelector('.pdf-report-title').textContent).toBe('Europe');
    expect(report.querySelector('.pdf-report-week').textContent).toBe('Semaine 23-27 MARS');
  });

  it('renders every market index with a colored weekChange', () => {
    const report = buildReportElement({ regionLabel: 'Europe', weekLabel: 'W', marketItems: MARKET_ITEMS });
    const row = report.querySelector('.pdf-report-index-row');
    expect(row.textContent).toContain('CAC 40');
    expect(row.textContent).toContain('8 268 pts');
    expect(row.querySelector('.pdf-report-index-change').style.color).toBe('rgb(192, 57, 43)'); // negative
  });

  it('renders every company stat with its custom or default label, and all bullets', () => {
    const report = buildReportElement({ regionLabel: 'Europe', weekLabel: 'W', companyItems: COMPANY_ITEMS });
    const card = report.querySelector('.pdf-report-company-card');
    const statLabels = [...card.querySelectorAll('.pdf-report-company-stat-label')].map(n => n.textContent);
    expect(statLabels).toEqual(['Croissance CA', 'EV/EBITDA', 'Cours actuel', 'Objectif']);
    const statValues = [...card.querySelectorAll('.pdf-report-company-stat-value')].map(n => n.textContent);
    expect(statValues).toEqual(['+26,35%', 'N/A', '—', '1345$']);
    expect(card.querySelectorAll('.pdf-report-company-bullets li')).toHaveLength(2);
  });

  it('renders the full 6-column portfolio table with colored DEPUIS/YTD', () => {
    const report = buildReportElement({ regionLabel: 'Europe', weekLabel: 'W', portfolioEntries: PORTFOLIO_ENTRIES, portfolioRegionLabel: 'Europe' });
    const cells = [...report.querySelectorAll('.pdf-report-portfolio-table tbody td')];
    expect(cells).toHaveLength(6);
    expect(cells[4].textContent).toBe('-30.66%');
    expect(cells[4].style.color).toBe('rgb(192, 57, 43)');
  });

  it('omits a section entirely when its data is empty, and respects the sections filter', () => {
    const fullReport = buildReportElement({ regionLabel: 'Europe', weekLabel: 'W', marketItems: MARKET_ITEMS, newsItems: [] });
    expect(fullReport.querySelector('.pdf-report-news')).toBeNull();

    const portfolioOnly = buildReportElement({
      regionLabel: 'Europe', weekLabel: 'W', marketItems: MARKET_ITEMS, portfolioEntries: PORTFOLIO_ENTRIES,
      sections: ['portfolio'],
    });
    expect(portfolioOnly.querySelector('.pdf-report-indices')).toBeNull();
    expect(portfolioOnly.querySelector('.pdf-report-portfolio-table')).not.toBeNull();
  });

  it('never interprets stored content as HTML', () => {
    const report = buildReportElement({
      regionLabel: 'Europe', weekLabel: 'W',
      companyItems: [{ ...COMPANY_ITEMS[0], name: '<img src=x onerror=alert(1)>' }],
    });
    expect(report.querySelector('.pdf-report-company-name').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(report.querySelector('img')).toBeNull();
  });
});
```

## Tâche 2 — Nouveau `webapp/src/panel/pdfReport.css`

```css
.pdf-report {
  position: fixed;
  left: -99999px;
  top: 0;
  width: 780px;
  background: #ffffff;
  color: #0f1730;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  padding: 8px 4px 24px;
  box-sizing: border-box;
}

.pdf-report-header {
  margin-bottom: 18px;
  border-bottom: 2px solid #c9971f;
  padding-bottom: 10px;
}

.pdf-report-title {
  font-family: Georgia, serif;
  font-size: 26px;
  margin: 0;
}

.pdf-report-week {
  font-size: 13px;
  color: #767c8c;
  margin-top: 2px;
}

.pdf-report-section-label {
  font-size: 13px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #0f1730;
  border-bottom: 1px solid #e4e6ec;
  padding-bottom: 4px;
  margin: 20px 0 10px;
  page-break-after: avoid;
  break-after: avoid;
}

.pdf-report-indices {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px 24px;
}

.pdf-report-index-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid #e4e6ec;
  font-size: 12px;
  page-break-inside: avoid;
  break-inside: avoid;
}

.pdf-report-index-name {
  flex: 1;
}

.pdf-report-index-change {
  font-weight: bold;
}

.pdf-report-news-block {
  margin-bottom: 10px;
  page-break-inside: avoid;
  break-inside: avoid;
}

.pdf-report-news-block h3 {
  font-size: 13px;
  margin: 0 0 4px;
}

.pdf-report-news-block p {
  font-size: 12px;
  color: #3a3f52;
  margin: 0;
}

.pdf-report-companies {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.pdf-report-company-card {
  border: 1px solid #e4e6ec;
  border-radius: 6px;
  padding: 10px;
  font-size: 11px;
  page-break-inside: avoid;
  break-inside: avoid;
}

.pdf-report-company-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
}

.pdf-report-company-name {
  font-weight: bold;
  font-size: 13px;
}

.pdf-report-company-sub {
  color: #767c8c;
  font-size: 10px;
}

.pdf-report-company-cap {
  color: #3a3f52;
  margin-top: 2px;
}

.pdf-report-company-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-top: 8px;
}

.pdf-report-company-stat {
  display: flex;
  flex-direction: column;
}

.pdf-report-company-stat-label {
  color: #767c8c;
  font-size: 9px;
  text-transform: uppercase;
}

.pdf-report-company-stat-value {
  font-weight: bold;
}

.pdf-report-company-bullets {
  margin: 8px 0 0;
  padding-left: 14px;
  color: #3a3f52;
}

.pdf-report-company-bullets li {
  margin-bottom: 3px;
}

.pdf-report-portfolio-region {
  font-size: 12px;
  font-weight: bold;
  color: #0f1730;
  margin-bottom: 6px;
}

.pdf-report-portfolio-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.pdf-report-portfolio-table th {
  text-align: left;
  font-size: 10px;
  text-transform: uppercase;
  color: #767c8c;
  border-bottom: 1px solid #0f1730;
  padding: 5px 6px;
}

.pdf-report-portfolio-table td {
  padding: 5px 6px;
  border-bottom: 1px solid #e4e6ec;
}

.pdf-report-portfolio-table tbody tr {
  page-break-inside: avoid;
  break-inside: avoid;
}

.pdf-report-portfolio-table tbody tr:nth-child(even) {
  background: #f7f7fa;
}

.pdf-report-portfolio-table td:nth-child(5),
.pdf-report-portfolio-table td:nth-child(6),
.pdf-report-portfolio-table th:nth-child(5),
.pdf-report-portfolio-table th:nth-child(6) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
```

## Tâche 3 — `webapp/src/styles/globe.css` : retrait du bloc `.side-panel.pdf-export` devenu mort

Retirer entièrement le bloc de règles `.side-panel.pdf-export` et ses variantes (`.side-panel.pdf-export .panel-region-label`, `.panel-index-row`, `.portfolio-table th/td`, `.pdf-export-portfolio-only`, etc. — tout ce qui a été ajouté aux phases 13/16/26/30 spécifiquement pour le style du panneau pendant l'export) — plus aucun code de ce projet n'ajoute la classe `pdf-export` à `.side-panel` après ce plan.

## Tâche 4 — `webapp/src/main.js` : câbler les deux boutons d'export sur le nouveau rapport

Ajouter aux imports :

```js
import { buildReportElement } from './panel/pdfReport.js';
import './panel/pdfReport.css';
```

Remplacer le handler `exportPdfBtn` existant par :

```js
exportPdfBtn.addEventListener('click', async () => {
  const region = REGIONS.find(r => r.id === activeRegionId);
  const activeWeek = getWeeks(db).find(w => w.id === activeWeekId);
  const portfolioRegion = getPortfolioRegion(db, activeRegionId);
  const filename = buildExportFilename(region ? region.label : '', activeWeek ? activeWeek.label : '');

  exportPdfBtn.disabled = true;
  exportPdfBtn.textContent = '⏳ Génération...';
  const reportEl = buildReportElement({
    regionLabel: region ? region.label : '',
    weekLabel: activeWeek ? activeWeek.label : '',
    portfolioRegionLabel: portfolioRegion ? portfolioRegion.label : '',
    marketItems: getMarketItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    newsItems: getNewsItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    companyItems: getCompanyItemsForWeekAndRegion(db, activeWeekId, activeRegionId),
    portfolioEntries: getPortfolioEntriesForRegion(db, activeRegionId),
  });
  document.body.appendChild(reportEl);
  try {
    await exportElementAsPDF(reportEl, filename);
  } catch (error) {
    console.error('PDF export failed', error);
  } finally {
    reportEl.remove();
    exportPdfBtn.disabled = false;
    exportPdfBtn.textContent = '📄 Exporter en PDF';
  }
});
```

Remplacer le handler `exportPortfolioPdfBtn` existant par :

```js
exportPortfolioPdfBtn.addEventListener('click', async () => {
  const portfolioRegion = getPortfolioRegion(db, activeRegionId);
  const activeWeek = getWeeks(db).find(w => w.id === activeWeekId);
  const filename = buildPortfolioExportFilename(portfolioRegion ? portfolioRegion.label : '', activeWeek ? activeWeek.label : '');

  exportPortfolioPdfBtn.disabled = true;
  exportPortfolioPdfBtn.textContent = '⏳';
  const reportEl = buildReportElement({
    regionLabel: portfolioRegion ? portfolioRegion.label : '',
    weekLabel: activeWeek ? activeWeek.label : '',
    portfolioRegionLabel: portfolioRegion ? portfolioRegion.label : '',
    portfolioEntries: getPortfolioEntriesForRegion(db, activeRegionId),
    sections: ['portfolio'],
  });
  document.body.appendChild(reportEl);
  try {
    await exportElementAsPDF(reportEl, filename);
  } catch (error) {
    console.error('Portfolio PDF export failed', error);
  } finally {
    reportEl.remove();
    exportPortfolioPdfBtn.disabled = false;
    exportPortfolioPdfBtn.textContent = '📄';
  }
});
```

## Contraintes globales

- Ne pas modifier `pdfExport.js` — le mécanisme d'en-tête Makor et de capture reste générique et inchangé.
- Ne pas essayer de reprendre les couleurs personnalisées des indices dans le rapport (hors périmètre, noté explicitement ci-dessus).
- Ne pas toucher au nettoyage interface, au graphique d'évolution, ni au rafraîchissement live du portefeuille (traités dans des plans séparés) — mais si le plan de nettoyage interface (retrait de la section IA & Fintech) est déjà mergé au moment de l'implémentation de celui-ci, confirmer qu'aucune référence à `iaFintechItems` ne subsiste dans les nouveaux appels à `buildReportElement` (le rapport ne doit de toute façon jamais avoir inclus l'IA & Fintech).

## Vérification

- `cd webapp && npx vitest run` doit rester vert, avec les nouveaux tests de `pdfReport.js`.
- `npm run build` doit rester propre.
- Aucune interaction Firestore nouvelle (lecture seule) — vérification manuelle **visuelle** dans le navigateur, sur une région/semaine avec beaucoup de contenu (plusieurs entreprises + portefeuille long) :
  - Le PDF généré n'est plus une simple capture du panneau étroit — il utilise toute la largeur de la page, les entreprises sont en 2 colonnes, le tableau de portefeuille est dense et lisible.
  - Chaque entreprise affiche bien ses 4 statistiques complètes (avec leurs libellés, y compris personnalisés) et tous ses points clés, sans troncature.
  - Le tableau de portefeuille affiche les 6 colonnes avec DEPUIS/YTD colorés vert/rouge selon le signe.
  - Le header Makor apparaît toujours sur chaque page (mécanisme de la phase 30, inchangé).
  - L'export "portefeuille par région" ne contient que le tableau de portefeuille de cette région, rien d'autre.
  - Le nombre de pages du PDF final est raisonnable compte tenu du contenu (pas de gaspillage d'espace évident).
