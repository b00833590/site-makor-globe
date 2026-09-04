function renderMarket(){
  const c = document.getElementById('container');
  const week = state.weeks.find(w=>w.id===state.activeWeek);
  const groups = {};
  state.marketItems.forEach(it=>{
    const g = it.group || 'AUTRE';
    groups[g] = groups[g] || [];
    groups[g].push(it);
  });

  let html = `
    <div class="page-title"><h2>Indices de marché</h2><span class="badge">${week ? week.label : ''}</span></div>
    <hr>`;

  html += pageActionsHTML('Ajouter une ligne', 'addMarketBtn');
  html += `<div class="add-bar"><button class="btn btn-primary btn-sm" id="refreshQuotesBtn">📡 Actualiser les cours en direct</button></div>`;

  const allGroupNames = Object.keys(groups);
  const REGION_ORDER = ['ASIE', 'BRICS', 'BRICS+UK', 'EUROPE', 'EUROPE & UK', 'AMÉRIQUE DU NORD'];
  const pillGroups = allGroupNames
    .filter(g => !SPECIAL_GROUPS.includes(g.toUpperCase()))
    .sort((a,b) => {
      const ai = REGION_ORDER.indexOf(a.toUpperCase());
      const bi = REGION_ORDER.indexOf(b.toUpperCase());
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  const commodityGroup = allGroupNames.find(g => g.toUpperCase() === 'MATIÈRES PREMIÈRES & CRYPTO');
  const currencyGroup = allGroupNames.find(g => g.toUpperCase() === 'DEVISES (VS USD)');

  if(allGroupNames.length === 0){
    html += `<div class="empty"><div class="big">📈</div>Aucune donnée pour cette semaine.${state.isEditing ? '' : ' Passe en mode édition pour en ajouter.'}</div>`;
  } else {
    if(pillGroups.length){
      html += `<div class="grid">`;
      pillGroups.forEach(g=>{
        const color = getGroupColor(state.activeWeek, g);
        html += `<div class="card">
          <div class="group-title" style="background:${color};">
            🌐 <span class="inline-edit" data-role="group-rename" data-group="${escapeAttr(g)}" ${ce()}>${escapeHtml(g)}</span>
            ${groupColorDotHTML(state.activeWeek, g, color)}
          </div>
          <div class="row-head"><span>INDICE</span><span style="text-align:right">SEMAINE</span><span style="text-align:right">YTD</span><span></span></div>`;
        groups[g].forEach(it=>{
          html += `<div class="row">
            <div>
              <span class="name inline-edit" data-key="${it.key}" data-field="name" ${ce()} ${colorStyleAttr(it,'name')}>${escapeHtml(it.name)}${colorDotHTML(it.key,'name')}</span>
              <span class="inline-edit" data-key="${it.key}" data-field="flag" ${ce()} style="margin-left:4px;">${it.flag||''}</span><br>
              <span class="value inline-edit" data-key="${it.key}" data-field="value" ${ce()} ${colorStyleAttr(it,'value')}>${escapeHtml(it.value||'')}${colorDotHTML(it.key,'value')}</span>
            </div>
            <div class="pct ${pctClass(it.weekChange)} inline-edit" data-key="${it.key}" data-field="weekChange" data-type="number" data-colorize="1" ${ce()} ${colorStyleAttr(it,'weekChange')}>${fmtPct(it.weekChange)}${colorDotHTML(it.key,'weekChange',signHex(it.weekChange))}</div>
            <div class="pct ${pctClass(it.ytdChange)} inline-edit" data-key="${it.key}" data-field="ytdChange" data-type="number" data-colorize="1" ${ce()} ${colorStyleAttr(it,'ytdChange')}>${fmtPct(it.ytdChange)}${colorDotHTML(it.key,'ytdChange',signHex(it.ytdChange))}</div>
            <div class="del-btn" data-del="${it.key}">${state.isEditing?'✕':''}</div>
          </div>`;
        });
        html += `</div>`;
      });
      html += `</div>`;
    }

    if(commodityGroup){
      html += `<div class="section-title">Matières premières & Crypto</div><div class="commodity-grid">`;
      groups[commodityGroup].forEach(it=>{
        html += `<div class="commodity-card">
          <div class="commodity-label inline-edit" data-key="${it.key}" data-field="name" ${ce()} ${colorStyleAttr(it,'name')}>${escapeHtml(it.name)}${colorDotHTML(it.key,'name')}</div>
          <div class="commodity-value inline-edit" data-key="${it.key}" data-field="value" ${ce()} ${colorStyleAttr(it,'value')}>${escapeHtml(it.value||'')}${colorDotHTML(it.key,'value')}</div>
          <div class="commodity-change ${pctClass(it.weekChange)} inline-edit" data-key="${it.key}" data-field="weekChange" data-type="number" data-colorize="1" ${ce()} ${colorStyleAttr(it,'weekChange')}>${fmtPct(it.weekChange)}${colorDotHTML(it.key,'weekChange',signHex(it.weekChange))}</div>
          ${state.isEditing ? `<div class="del-btn" data-del="${it.key}" style="text-align:right;margin-top:6px;">✕</div>` : ''}
        </div>`;
      });
      html += `</div>`;
    }

    if(currencyGroup){
      html += `<div class="section-title">Devises (vs USD)</div><div class="currency-grid">`;
      groups[currencyGroup].forEach(it=>{
        html += `<div class="currency-card">
          <div class="currency-change ${pctClass(it.weekChange)} inline-edit" data-key="${it.key}" data-field="weekChange" data-type="number" data-colorize="1" ${ce()} ${colorStyleAttr(it,'weekChange')}>${fmtPct(it.weekChange)}${colorDotHTML(it.key,'weekChange',signHex(it.weekChange))}</div>
          <div class="currency-meta">
            <div class="currency-code inline-edit" data-key="${it.key}" data-field="name" ${ce()} ${colorStyleAttr(it,'name')}>${escapeHtml(it.name)}${colorDotHTML(it.key,'name')}</div>
            <div class="currency-rate inline-edit" data-key="${it.key}" data-field="value" ${ce()} ${colorStyleAttr(it,'value')}>${escapeHtml(it.value||'')}${colorDotHTML(it.key,'value')}</div>
          </div>
          ${state.isEditing ? `<div class="del-btn" data-del="${it.key}">✕</div>` : ''}
        </div>`;
      });
      html += `</div>`;
    }
  }

  c.innerHTML = html;
  wirePageActions(c, 'addMarketBtn', addMarketRowInline);
  const refreshQuotesBtn = document.getElementById('refreshQuotesBtn');
  if(refreshQuotesBtn) refreshQuotesBtn.onclick = refreshMarketQuotes;
  c.querySelectorAll('[data-del]').forEach(el=>{
    el.onclick = (e) => { e.stopPropagation(); confirmDeleteMarket(el.getAttribute('data-del')); };
  });
}

function setGroupColor(weekId, group, color){
  setItemLocal(groupColorKey(weekId, group), {color});
}

function addMarketRowInline(){
  const id = uid();
  const item = { id, group:'NOUVEAU GROUPE', flag:'', name:'Nouvel indice', value:'', weekChange:0, ytdChange:0 };
  const key = `mkg:market:${state.activeWeek}:${id}`;
  setItemLocal(key, item);
  refreshData();
  setTimeout(()=>{
    const el = document.querySelector(`[data-key="${CSS.escape(key)}"][data-field="name"]`);
    if(el){ el.focus(); selectAllText(el); }
  }, 30);
}

function regionClass(region){
  const key = (region||'Autre').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-');
  return 'region-' + (['Asie','BRICS','Europe','Amerique-du-Nord'].includes(key) ? key : 'Autre');
}

const DEFAULT_COMPANY_REGION_COLORS = {
  'Asie': { bg:'#e3f6ec', text:'#1c8a4b' },
  'BRICS': { bg:'#fdecd8', text:'#c9761f' },
  'Europe': { bg:'#e4ecfb', text:'#2555b8' },
  'Amérique du Nord': { bg:'#fbe4e2', text:'#c0392b' },
};

function companyRegionColorKey(region){
  return `mkg:companyregioncolor:${slugify(region||'autre')}`;
}

function getCompanyRegionColors(region){
  const stored = DB[companyRegionColorKey(region)];
  const fallback = DEFAULT_COMPANY_REGION_COLORS[region] || { bg:'#eef0f6', text:'var(--navy)' };
  return { bg: (stored && stored.bg) || fallback.bg, text: (stored && stored.text) || fallback.text };
}

function setCompanyRegionColor(region, part, color){
  const key = companyRegionColorKey(region);
  const current = DB[key] || {};
  const fallback = DEFAULT_COMPANY_REGION_COLORS[region] || { bg:'#eef0f6', text:'#1c2233' };
  const next = { bg: current.bg || fallback.bg, text: current.text || fallback.text };
  next[part] = color;
  setItemLocal(key, next);
}

// A createdAt value is only a real timestamp for companies added after the
// "Système Harry" update; companies seeded earlier via OCR got a small
// insertion-order counter (0, 1, 2...) instead. Anything below this
// threshold (roughly year 2001 in ms-epoch terms) is treated as "no real
// creation date known" rather than risk drawing a chart from a wrong date.
const REAL_TIMESTAMP_FLOOR = 1000000000000;

function companyHasRealCreatedAt(it){
  return typeof it.createdAt === 'number' && it.createdAt > REAL_TIMESTAMP_FLOOR;
}

// Finds the portfolio row (if any) for a given company name — shared by both
// the presentation-date lookup and the symbol lookup below.
function matchingPortfolioEntry(companyName){
  const portfolioEntries = keysWithPrefix('mkg:portfolio:').map(k => DB[k]).filter(Boolean);
  return portfolioEntries.find(e => e.entreprise === companyName);
}

// Resolves the best-known "presentation date" for a company card:
// 1) a matching row in the "Suivi des performances du portefeuille" table
//    (same company name, valid DATE field) — this is manually entered by
//    Harry and exists even for companies seeded long ago via OCR;
// 2) otherwise, the card's own createdAt, but only if it's a real timestamp
//    (not the old insertion-order counter used by seeded companies).
// Returns an ISO 'YYYY-MM-DD' string, or null if neither is available.
function companyPresentationDateISO(it){
  const match = matchingPortfolioEntry(it.name);
  if(match && portfolioSinceISODate(match.date)) return portfolioSinceISODate(match.date);
  if(companyHasRealCreatedAt(it)) return isoDateFromMs(it.createdAt);
  return null;
}

// Resolves the Yahoo symbol for a company card: the manually entered SYMBOLE
// field on a matching portfolio row takes priority (works instantly, no code
// edit needed), falling back to the hardcoded COMPANY_TICKERS table.
function companySymbol(it){
  if(it.yahooSymbol && it.yahooSymbol.trim()) return it.yahooSymbol.trim();
  const match = matchingPortfolioEntry(it.name);
  if(match && match.symbol && match.symbol.trim()) return match.symbol.trim();
  return COMPANY_TICKERS[it.name] || null;
}

function companyChartIconHTML(it){
  const symbol = companySymbol(it);
  const sinceISO = companyPresentationDateISO(it);
  if(symbol && sinceISO){
    return `<span class="chart-icon-btn" data-chart-company="${escapeAttr(it.key)}" title="Évolution du cours depuis la présentation">📈</span>`;
  }
  const reason = !symbol && !sinceISO
    ? 'Symbole boursier et date de présentation non renseignés'
    : !symbol
      ? 'Symbole boursier non renseigné pour cette entreprise'
      : "Date de présentation inconnue — ajoute une date (JJ/MM) dans le Suivi des performances du portefeuille pour cette entreprise";
  return `<span class="chart-icon-btn disabled" title="${escapeAttr(reason)}">📈</span>`;
}

function growthClass(v){
  if(v === undefined || v === null || v === '') return '';
  const n = parseFloat(String(v).replace(',','.').replace('%',''));
  if(isNaN(n)) return '';
  return n >= 0 ? 'pos' : 'neg';
}
