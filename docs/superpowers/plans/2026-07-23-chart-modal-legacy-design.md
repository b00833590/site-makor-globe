---
title: Graphique d'évolution — reproduire fidèlement l'ancien design (production) + corriger le risque de course asynchrone
date: 2026-07-23
status: draft
---

## Contexte

Deuxième des quatre plans. L'utilisateur a fourni une capture (`webapp/public/assets/screen 1.png`) montrant l'ancien affichage du graphique — celui déjà implémenté dans la production actuelle (`index.html`, fonctions `chartLineSVG`/`openCompanyChartModal`, lignes ~2742-2842), jamais porté fidèlement dans `webapp/`. La version actuelle de `webapp/` (`companyChart.js`'s `buildChartSVG`) ne trace qu'une simple ligne dorée 280×80 sans axes, sans prix, sans pourcentage, sans sous-titre — une version très appauvrie. Ce plan porte le design de production tel quel (calculs, mise en page, palette), adapté à la construction DOM impérative déjà utilisée dans `webapp/` (pas de template `innerHTML`, contrairement à la version production).

**Point confirmé en lisant le code existant** : `initCompanyChartModal`'s `open()` (`webapp/src/panel/chartModal.js`) n'a aujourd'hui aucune protection contre les réponses asynchrones désordonnées — si l'admin clique rapidement sur le graphique d'une entreprise A puis B avant que la requête pour A ne soit résolue, une réponse tardive pour A pourrait écraser l'affichage de B si elle résout après celle de B. Corrigé avec un jeton de requête (pattern standard, déjà utilisé implicitement ailleurs dans ce type de séquence async de ce projet).

## Décisions de conception

- **Thème volontairement clair, en rupture avec le reste de `webapp/`** : la capture montre un fond blanc, du texte sombre — c'est le thème de la production actuelle (globalement claire), pas une erreur. L'utilisateur demande explicitement de reproduire "fidèlement la mise en page, le comportement et le style" — `.chart-modal-content` passe donc d'un fond navy à un fond blanc, uniquement pour cette modale (toutes les autres modales du projet restent en thème sombre, aucun changement ailleurs).
- **Aucun changement du markup `index.html` du header de la modale** (`#chart-modal-title` + bouton fermer déjà en place) — le sous-titre "Évolution depuis la présentation — {date} ({symbole})" est injecté dynamiquement en premier enfant de `bodyEl` à chaque ouverture, pas ajouté au markup statique.
- **Jeton de requête** : `let requestToken = 0` incrémenté à chaque appel `open()` ; après résolution de `fetchQuoteHistoryFn`, si le jeton capturé au début de cet appel ne correspond plus au jeton courant (un appel plus récent a eu lieu entre-temps), la fonction s'arrête sans toucher au DOM — empêche toute donnée obsolète de s'afficher, garantit qu'un clic sur une nouvelle entreprise gagne toujours contre une réponse tardive pour l'ancienne.

## Tâche 1 — `webapp/src/panel/companyChart.js` : graphique complet (axes, aire, couleur directionnelle)

Remplacer `buildChartSVG` (et les constantes associées) par :

```js
const SVG_NS = 'http://www.w3.org/2000/svg';
const CHART_WIDTH = 560;
const CHART_HEIGHT = 260;
const CHART_PAD_LEFT = 46;
const CHART_PAD_RIGHT = 16;
const CHART_PAD_TOP = 16;
const CHART_PAD_BOTTOM = 30;
const CHART_GREEN = '#1c8a4b';
const CHART_RED = '#c0392b';
const CHART_GRID_COLOR = '#eceef4';
const CHART_LABEL_COLOR = '#8a90a6';

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

export function buildChartSVG(points, { width = CHART_WIDTH, height = CHART_HEIGHT } = {}) {
  if (!points || points.length < 2) return null;

  const closes = points.map(p => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const plotWidth = width - CHART_PAD_LEFT - CHART_PAD_RIGHT;
  const plotHeight = height - CHART_PAD_TOP - CHART_PAD_BOTTOM;
  const x = i => CHART_PAD_LEFT + (i / Math.max(points.length - 1, 1)) * plotWidth;
  const y = close => CHART_PAD_TOP + (1 - (close - min) / span) * plotHeight;

  const lineColor = closes[closes.length - 1] >= closes[0] ? CHART_GREEN : CHART_RED;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, style: 'width:100%;height:auto;' });

  const mid = (min + max) / 2;
  for (const value of [max, mid, min]) {
    svg.appendChild(svgEl('line', {
      x1: CHART_PAD_LEFT, y1: y(value).toFixed(1), x2: width - CHART_PAD_RIGHT, y2: y(value).toFixed(1),
      stroke: CHART_GRID_COLOR, 'stroke-width': 1,
    }));
  }

  const linePoints = points.map((p, i) => `${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join(' ');
  const areaPoints = `${x(0).toFixed(1)},${(height - CHART_PAD_BOTTOM).toFixed(1)} ${linePoints} ${x(points.length - 1).toFixed(1)},${(height - CHART_PAD_BOTTOM).toFixed(1)}`;

  svg.appendChild(svgEl('polygon', { points: areaPoints, fill: lineColor, opacity: 0.08 }));
  svg.appendChild(svgEl('polyline', {
    points: linePoints, fill: 'none', stroke: lineColor, 'stroke-width': 2.2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }));

  for (const value of [max, mid, min]) {
    const label = svgEl('text', { x: CHART_PAD_LEFT - 8, y: (y(value) + 4).toFixed(1), 'font-size': 10, fill: CHART_LABEL_COLOR, 'text-anchor': 'end' });
    label.textContent = value.toFixed(2);
    svg.appendChild(label);
  }

  const labelCount = Math.min(5, points.length);
  const labelIndexes = [...new Set(Array.from({ length: labelCount }, (_, k) => Math.round((k * (points.length - 1)) / Math.max(labelCount - 1, 1))))];
  for (const i of labelIndexes) {
    const label = svgEl('text', { x: x(i).toFixed(1), y: height - 8, 'font-size': 10, fill: CHART_LABEL_COLOR, 'text-anchor': 'middle' });
    label.textContent = points[i].date.slice(5);
    svg.appendChild(label);
  }

  return svg;
}
```

`companySymbol`/`companyPresentationDateISO` (en haut du fichier) restent inchangées.

### Tests — `webapp/src/panel/companyChart.test.js`

Ajouter (ou créer le fichier s'il n'existe pas déjà — vérifier d'abord) :

```js
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
```

## Tâche 2 — `webapp/src/panel/chartModal.js` : sous-titre, prix/pourcentage, jeton de requête

Remplacer le contenu du fichier par :

```js
import { fetchQuoteHistory as defaultFetchQuoteHistory } from '../data/quoteClient.js';
import { companySymbol, companyPresentationDateISO, buildChartSVG } from './companyChart.js';

function formatPresentationDateLabel(sinceISO) {
  return new Date(`${sinceISO}T00:00:00Z`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn = defaultFetchQuoteHistory }) {
  let requestToken = 0;

  function close() {
    modalEl.classList.remove('open');
    bodyEl.replaceChildren();
  }

  function showMessage(text) {
    bodyEl.replaceChildren();
    const message = document.createElement('p');
    message.className = 'chart-modal-message';
    message.textContent = text;
    bodyEl.appendChild(message);
  }

  async function open(item, portfolioEntries) {
    const token = ++requestToken;
    titleEl.textContent = item.name;
    bodyEl.replaceChildren();
    modalEl.classList.add('open');

    const symbol = companySymbol(item);
    const sinceISO = companyPresentationDateISO(item, portfolioEntries);

    if (!symbol || !sinceISO) {
      showMessage('Données insuffisantes pour afficher le graphique.');
      return;
    }

    const sub = document.createElement('div');
    sub.className = 'chart-modal-sub';
    sub.textContent = `Évolution depuis la présentation — ${formatPresentationDateLabel(sinceISO)} (${symbol})`;
    bodyEl.appendChild(sub);

    const wrap = document.createElement('div');
    wrap.className = 'chart-svg-wrap';
    const loading = document.createElement('div');
    loading.className = 'chart-loading';
    loading.textContent = 'Chargement de l\'historique des cours...';
    wrap.appendChild(loading);
    bodyEl.appendChild(wrap);

    const data = await fetchQuoteHistoryFn(symbol, sinceISO);
    if (token !== requestToken) return; // superseded by a newer open() call since this fetch started

    if (!data || !data.points || data.points.length < 2) {
      wrap.replaceChildren();
      const error = document.createElement('div');
      error.className = 'chart-error';
      error.textContent = `Historique indisponible pour le moment. Le symbole (${symbol}) est peut-être incorrect, ou la source de cours est temporairement inaccessible.`;
      wrap.appendChild(error);
      return;
    }

    const first = data.points[0].close;
    const last = data.points[data.points.length - 1].close;
    const changePct = ((last - first) / first) * 100;
    const sign = changePct >= 0 ? '+' : '';

    const priceRow = document.createElement('div');
    priceRow.className = 'chart-price-row';
    const price = document.createElement('div');
    price.className = 'chart-price';
    price.textContent = last.toFixed(2);
    const change = document.createElement('div');
    change.className = `chart-price-change ${changePct >= 0 ? 'positive' : 'negative'}`;
    change.textContent = `${sign}${changePct.toFixed(2)}% depuis la présentation`;
    priceRow.append(price, change);

    wrap.replaceChildren();
    wrap.appendChild(priceRow);
    const svg = buildChartSVG(data.points);
    if (svg) wrap.appendChild(svg);
  }

  return { open, close };
}
```

### Tests — `webapp/src/panel/chartModal.test.js`

Les tests existants restent globalement valides (`titleEl.textContent`, `bodyEl.querySelector('svg')`, messages d'erreur) — `bodyEl.querySelector('svg')` continue de fonctionner même si le SVG est maintenant niché plus profondément (dans `.chart-svg-wrap`), `querySelector` cherchant tous les descendants. Ajouter ces nouveaux tests :

```js
  it('shows the presentation date and symbol as a subtitle', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-04-24', close: 6.2 }, { date: '2026-07-23', close: 6.5 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.querySelector('.chart-modal-sub').textContent).toContain('2603.TW');
    expect(bodyEl.querySelector('.chart-modal-sub').textContent).toContain('Évolution depuis la présentation');
  });

  it('shows the current price and a green percentage for a rising series', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-04-24', close: 100 }, { date: '2026-07-23', close: 110 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.querySelector('.chart-price').textContent).toBe('110.00');
    const change = bodyEl.querySelector('.chart-price-change');
    expect(change.textContent).toContain('+10.00%');
    expect(change.classList.contains('positive')).toBe(true);
  });

  it('shows a red percentage for a falling series', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    const fetchQuoteHistoryFn = vi.fn().mockResolvedValue({
      points: [{ date: '2026-04-24', close: 100 }, { date: '2026-07-23', close: 90 }],
    });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });
    await modal.open(COMPANY, PORTFOLIO_ENTRIES);
    expect(bodyEl.querySelector('.chart-price-change').classList.contains('negative')).toBe(true);
  });

  it('discards a stale response when a newer open() call has already superseded it', async () => {
    const { modalEl, titleEl, bodyEl } = makeElements();
    let resolveFirst;
    const fetchQuoteHistoryFn = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ points: [{ date: '2026-04-24', close: 50 }, { date: '2026-07-23', close: 60 }] });
    const modal = initCompanyChartModal({ modalEl, titleEl, bodyEl, fetchQuoteHistoryFn });

    const firstOpen = modal.open(COMPANY, PORTFOLIO_ENTRIES); // starts, does not resolve yet
    await modal.open({ name: 'Second Co', yahooSymbol: 'SEC' }, [{ entreprise: 'Second Co', date: '16/07' }]); // resolves and renders fully

    expect(titleEl.textContent).toBe('Second Co');
    const priceBeforeStaleResolution = bodyEl.querySelector('.chart-price')?.textContent;

    resolveFirst({ points: [{ date: '2026-04-24', close: 999 }, { date: '2026-07-23', close: 999 }] }); // stale response for the FIRST company arrives late
    await firstOpen;

    expect(titleEl.textContent).toBe('Second Co'); // still the second company, not overwritten
    expect(bodyEl.querySelector('.chart-price')?.textContent).toBe(priceBeforeStaleResolution);
  });
```

## Tâche 3 — `webapp/src/panel/chartModal.css` : thème clair fidèle à la production

Remplacer le contenu du fichier par :

```css
.chart-modal {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 10;
  align-items: center;
  justify-content: center;
}

.chart-modal.open {
  display: flex;
}

.chart-modal-content {
  background: #ffffff;
  border-radius: 14px;
  padding: 26px;
  max-width: 640px;
  width: 92%;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
  box-sizing: border-box;
}

.chart-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.chart-modal-header span {
  color: #0f1730;
  font-weight: bold;
  font-family: Georgia, serif;
  font-size: 20px;
}

.chart-modal-header button {
  background: #f2f3f7;
  border: none;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  color: #5a6072;
  cursor: pointer;
  font-size: 14px;
}

.chart-modal-message {
  color: #767c8c;
  font-size: 12px;
  margin: 0;
}

.chart-modal-sub {
  font-size: 12px;
  color: #767c8c;
  margin-bottom: 12px;
}

.chart-svg-wrap {
  background: #fbfbfd;
  border: 1px solid #e4e6ec;
  border-radius: 10px;
  padding: 12px;
}

.chart-loading,
.chart-error {
  padding: 40px 10px;
  text-align: center;
  color: #767c8c;
  font-size: 13px;
}

.chart-price-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 10px;
}

.chart-price {
  font-size: 22px;
  font-weight: 800;
  color: #0f1730;
}

.chart-price-change {
  font-size: 14px;
  font-weight: 700;
}

.chart-price-change.positive {
  color: #1c8a4b;
}

.chart-price-change.negative {
  color: #c0392b;
}
```

## Contraintes globales

- Ne pas toucher à `index.html`'s markup de la modale (header déjà en place, inchangé).
- Ne pas toucher à `quoteClient.js`, `dateUtils.js`.
- Ne pas propager le thème clair à d'autres modales — c'est une exception délibérée, uniquement pour ce graphique, fidèle à la demande explicite de reproduire l'ancien design.
- Ne pas toucher au nettoyage interface, au rafraîchissement live du portefeuille, ni à l'export PDF (traités dans des plans séparés).

## Vérification

- `cd webapp && npx vitest run` doit rester vert, avec des tests en plus pour `companyChart.js` (3) et `chartModal.js` (4).
- `npm run build` doit rester propre.
- Aucune interaction Firestore nouvelle (lecture seule de cotations, comme avant) — vérification manuelle **visuelle** dans le navigateur :
  - Cliquer sur l'icône 📈 d'une entreprise réelle affiche exactement la mise en page de `screen 1.png` : carte blanche, nom en gros, sous-titre avec date+symbole, prix actuel en gros à gauche, pourcentage coloré à droite, graphique avec grille/axes/aire colorée.
  - Cliquer rapidement sur les icônes 📈 de deux entreprises différentes l'une après l'autre : le graphique final affiché correspond bien à la DERNIÈRE entreprise cliquée, jamais à un résultat obsolète de la première.
  - Fermeture de la modale fonctionne toujours.
