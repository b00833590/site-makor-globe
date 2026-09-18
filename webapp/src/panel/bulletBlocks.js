// Read-only rendering for a company's "Points clés" blocks, shared by the
// normal card and presentation mode. Points clés are edited in Morning
// News (site-makor-globe/index.html) — a separate, single-file codebase
// with no build step, so there is no way to share JS modules between it
// and this Vite app. This mirrors ITS block shape and rendering rules
// (see migrateBulletsToBlocks/renderBulletBlockHTML there) independently:
// { type:'text', text }, { type:'list', items }, { type:'table', rows },
// { type:'image', dataUrl, widthPct }, { type:'chart', chartType, labels, series }.
// A block can still be a plain string here if this reads Firestore data
// before Morning News's own migration has ever run against it — normalized
// below rather than assumed already-migrated.
export function normalizeBulletBlock(bullet) {
  if (typeof bullet === 'string') return { type: 'text', text: bullet };
  return bullet || { type: 'text', text: '' };
}

// Splits **bold**/*italic* into DOM nodes (never innerHTML) — same
// lightweight, storage-is-plain-text convention as Morning News's
// renderTextMarkup(), so the source of truth is never actual HTML.
export function appendMarkupText(container, text) {
  const re = /\*\*(.+?)\*\*|\*([^*]+?)\*/g;
  let last = 0;
  let match;
  while ((match = re.exec(text || ''))) {
    if (match.index > last) container.appendChild(document.createTextNode(text.slice(last, match.index)));
    const el = document.createElement(match[1] !== undefined ? 'b' : 'i');
    el.textContent = match[1] !== undefined ? match[1] : match[2];
    container.appendChild(el);
    last = match.index + match[0].length;
  }
  if (last < (text || '').length) container.appendChild(document.createTextNode(text.slice(last)));
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const CHART_COLORS = ['#8a7cc0', '#1c8a4b', '#c0392b', '#b3a5e0', '#4a3a82'];

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function buildBlockChartSVG(block) {
  const labels = block.labels || [];
  const series = (block.series || []).filter(s => Array.isArray(s.data) && s.data.length);
  const values = series.flatMap(s => s.data.filter(v => typeof v === 'number' && !Number.isNaN(v)));
  if (labels.length === 0 || values.length === 0) return null;

  const width = 480;
  const height = 200;
  const padL = 34;
  const padR = 10;
  const padT = 10;
  const padB = 24;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const x = i => padL + (i / Math.max(labels.length - 1, 1)) * (width - padL - padR);
  const y = v => padT + (1 - (v - min) / span) * (height - padT - padB);
  const zeroY = y(0);

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, style: 'width:100%;height:auto;' });
  svg.appendChild(svgEl('line', { x1: padL, y1: zeroY.toFixed(1), x2: width - padR, y2: zeroY.toFixed(1), stroke: 'rgba(237,235,245,0.15)', 'stroke-width': 1 }));

  if (block.chartType === 'line') {
    series.forEach((s, si) => {
      const color = CHART_COLORS[si % CHART_COLORS.length];
      const pts = s.data.map((v, i) => (typeof v === 'number' ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : null)).filter(Boolean).join(' ');
      svg.appendChild(svgEl('polyline', { points: pts, fill: 'none', stroke: color, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      s.data.forEach((v, i) => { if (typeof v === 'number') svg.appendChild(svgEl('circle', { cx: x(i).toFixed(1), cy: y(v).toFixed(1), r: 2.6, fill: color })); });
    });
  } else {
    const groupW = (width - padL - padR) / labels.length;
    const barW = Math.max(3, (groupW * 0.7) / series.length);
    labels.forEach((_, i) => {
      series.forEach((s, si) => {
        const v = s.data[i];
        if (typeof v !== 'number') return;
        const bx = padL + i * groupW + groupW * 0.15 + si * barW;
        const by = Math.min(y(v), zeroY);
        const bh = Math.max(Math.abs(y(v) - zeroY), 0.5);
        svg.appendChild(svgEl('rect', { x: bx.toFixed(1), y: by.toFixed(1), width: barW.toFixed(1), height: bh.toFixed(1), fill: CHART_COLORS[si % CHART_COLORS.length], rx: 2 }));
      });
    });
  }

  labels.forEach((label, i) => {
    const text = svgEl('text', { x: x(i).toFixed(1), y: height - 6, 'font-size': 9.5, fill: '#9490b0', 'text-anchor': 'middle' });
    text.textContent = String(label);
    svg.appendChild(text);
  });

  return svg;
}

// Returns a DOM element for one block's read-only content — used both by
// the normal panel card and presentation mode (which only rescales it via
// CSS zoom, see presentationZoom.js — never a different rendering path).
export function buildBulletBlockContentEl(block) {
  if (block.type === 'list') {
    const ul = document.createElement('ul');
    ul.className = 'panel-bullet-list-block';
    (block.items || []).forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    });
    return ul;
  }
  if (block.type === 'table') {
    const table = document.createElement('table');
    table.className = 'panel-bullet-table-block';
    const tbody = document.createElement('tbody');
    (block.rows || []).forEach((row, ri) => {
      const tr = document.createElement('tr');
      row.forEach(cell => {
        const cellEl = document.createElement(ri === 0 ? 'th' : 'td');
        cellEl.textContent = cell;
        tr.appendChild(cellEl);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }
  if (block.type === 'image') {
    if (!block.dataUrl) return null;
    const wrap = document.createElement('div');
    wrap.className = 'panel-bullet-image-wrap';
    const img = document.createElement('img');
    img.className = 'panel-bullet-image-block';
    img.src = block.dataUrl;
    img.style.width = `${block.widthPct || 100}%`;
    img.alt = '';
    wrap.appendChild(img);
    return wrap;
  }
  if (block.type === 'chart') {
    const wrap = document.createElement('div');
    wrap.className = 'panel-bullet-chart-wrap';
    const svg = buildBlockChartSVG(block);
    if (svg) wrap.appendChild(svg);
    return wrap;
  }
  // text
  const span = document.createElement('span');
  span.className = 'panel-bullet-text';
  appendMarkupText(span, block.text || '');
  return span;
}
