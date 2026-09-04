// ---------- Courbe d'évolution du cours depuis la présentation ----------

function isoDateFromMs(ms){
  const d = new Date(ms);
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
}

async function fetchQuoteHistory(symbol, sinceISO){
  try{
    const res = await fetch(`${QUOTE_API_URL}?action=quoteHistory&symbol=${encodeURIComponent(symbol)}&since=${encodeURIComponent(sinceISO)}`);
    const data = await res.json();
    return data.error ? null : data;
  }catch(e){ return null; }
}

function chartLineSVG(points){
  const w = 560, h = 260, padL = 46, padR = 16, padT = 16, padB = 30;
  const closes = points.map(p => p.close);
  const min = Math.min(...closes), max = Math.max(...closes);
  const span = (max - min) || 1;
  const x = i => padL + (i / Math.max(points.length - 1, 1)) * (w - padL - padR);
  const y = c => padT + (1 - (c - min) / span) * (h - padT - padB);

  const first = closes[0], last = closes[closes.length-1];
  const up = last >= first;
  const lineColor = up ? '#1c8a4b' : '#c0392b';

  const linePts = points.map((p,i)=>`${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join(' ');
  const areaPts = `${x(0).toFixed(1)},${(h-padB).toFixed(1)} ${linePts} ${x(points.length-1).toFixed(1)},${(h-padB).toFixed(1)}`;

  // A handful of evenly spaced date labels along the x-axis (avoid crowding).
  const labelCount = Math.min(5, points.length);
  const labelIdxs = Array.from({length: labelCount}, (_, k) => Math.round(k * (points.length-1) / Math.max(labelCount-1,1)));
  const xLabels = [...new Set(labelIdxs)].map(i => `<text x="${x(i).toFixed(1)}" y="${h-8}" font-size="10" fill="#8a90a6" text-anchor="middle">${points[i].date.slice(5)}</text>`).join('');

  const yMidVal = (min + max) / 2;
  const yLabels = [
    `<text x="${padL-8}" y="${y(max)+4}" font-size="10" fill="#8a90a6" text-anchor="end">${max.toFixed(2)}</text>`,
    `<text x="${padL-8}" y="${y(yMidVal)+4}" font-size="10" fill="#8a90a6" text-anchor="end">${yMidVal.toFixed(2)}</text>`,
    `<text x="${padL-8}" y="${y(min)+4}" font-size="10" fill="#8a90a6" text-anchor="end">${min.toFixed(2)}</text>`
  ].join('');

  const gridLines = [max, yMidVal, min].map(v =>
    `<line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${w-padR}" y2="${y(v).toFixed(1)}" stroke="#eceef4" stroke-width="1"/>`
  ).join('');

  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">
    ${gridLines}
    <polygon points="${areaPts}" fill="${lineColor}" opacity="0.08"/>
    <polyline points="${linePts}" fill="none" stroke="${lineColor}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${yLabels}
    ${xLabels}
  </svg>`;
}

async function openCompanyChartModal(key){
  const it = DB[key];
  if(!it) return;
  const symbol = companySymbol(it);
  const sinceISO = companyPresentationDateISO(it);
  if(!symbol || !sinceISO) return; // icon shouldn't be clickable in this state, but guard anyway

  const root = document.getElementById('modalRoot');
  const sinceLabel = new Date(sinceISO + 'T00:00:00Z').toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

  root.innerHTML = `
    <div class="modal-overlay chart-modal" id="chartOverlay">
      <div class="modal">
        <div class="chart-modal-header">
          <div>
            <h3>${escapeHtml(it.name)}</h3>
            <div class="chart-modal-sub">Évolution depuis la présentation — ${escapeHtml(sinceLabel)} (${escapeHtml(symbol)})</div>
          </div>
          <span class="chart-icon-btn" id="chartCloseBtn" title="Fermer" style="background:#f2f3f7;color:#5a6072;">✕</span>
        </div>
        <div class="chart-svg-wrap" id="chartSvgWrap"><div class="chart-loading">Chargement de l'historique des cours...</div></div>
      </div>
    </div>`;

  const close = () => root.innerHTML = '';
  document.getElementById('chartCloseBtn').onclick = close;
  document.getElementById('chartOverlay').addEventListener('click', (e)=>{ if(e.target.id==='chartOverlay') close(); });

  const data = await fetchQuoteHistory(symbol, sinceISO);
  const wrap = document.getElementById('chartSvgWrap');
  if(!wrap) return; // modal was closed while waiting
  if(!data || !data.points || data.points.length < 2){
    wrap.innerHTML = `<div class="chart-error">Historique indisponible pour le moment. Le symbole (${escapeHtml(symbol)}) est peut-être incorrect, ou la source de cours est temporairement inaccessible.</div>`;
    return;
  }
  const first = data.points[0].close, last = data.points[data.points.length-1].close;
  const changePct = ((last - first) / first) * 100;
  const sign = changePct >= 0 ? '+' : '';
  const changeColor = changePct >= 0 ? '#1c8a4b' : '#c0392b';
  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;">
      <div style="font-size:22px;font-weight:800;color:var(--navy);">${last.toFixed(2)}</div>
      <div style="font-size:14px;font-weight:700;color:${changeColor};">${sign}${changePct.toFixed(2)}% depuis la présentation</div>
    </div>
    ${chartLineSVG(data.points)}`;
}
