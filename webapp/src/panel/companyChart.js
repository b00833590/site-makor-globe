import { ddmmToISOThisYear } from '../data/dateUtils.js';

export function companySymbol(item) {
  return item.yahooSymbol || null;
}

export function companyPresentationDateISO(item, portfolioEntries) {
  const match = portfolioEntries.find(entry => entry.entreprise === item.name);
  if (!match || !match.date) return null;
  return ddmmToISOThisYear(match.date);
}

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
