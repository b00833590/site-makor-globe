function renderCompanies(){
  const c = document.getElementById('container');
  const week = state.weeks.find(w=>w.id===state.activeWeek);

  let html = `
    <div class="page-title"><h2>Entreprises à suivre</h2><span class="badge">${week ? week.label : ''}</span></div>
    <hr>`;

  html += pageActionsHTML('Ajouter une entreprise', 'addCompanyBtn');

  const COMPANY_REGION_ORDER = ['ASIE', 'BRICS', 'EUROPE', 'AMÉRIQUE DU NORD'];
  const sortedItems = [...state.contentItems].sort((a,b)=>{
    if(!a.name && !b.name) return 0;
    if(!a.name) return 1; // non-company items (legacy portfolio blobs) sink to the bottom
    if(!b.name) return -1;
    const ai = COMPANY_REGION_ORDER.indexOf((a.region||'').toUpperCase());
    const bi = COMPANY_REGION_ORDER.indexOf((b.region||'').toUpperCase());
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  if(state.contentItems.length === 0){
    html += `<div class="empty"><div class="big">🏢</div>Rien à afficher pour cette semaine.${state.isEditing ? '' : ' Passe en mode édition pour en ajouter.'}</div>`;
  } else {
    html += `<div class="company-grid">`;
    sortedItems.forEach(it=>{
      if(!it.name){
        // Legacy artifact from the old free-text portfolio blob — self-heal by
        // removing it silently instead of ever displaying it again.
        deleteItemLocal(it.key);
        return;
      }
      if(!it.bullets){
        // One-time migration: split the old freeform "body" text into individual
        // gold-triangle bullet points (blank-line separated blocks).
        it.bullets = (it.body||'').split(/\n\s*\n/).map(s=>s.trim().replace(/^▶\s*/,'')).filter(Boolean);
        delete it.body;
        setItemLocal(it.key, it);
      }
      html += `<div class="company-card">
        ${state.isEditing?`<div class="del-btn" data-del="${it.key}">✕</div>`:''}
        <div class="company-top">
          <div>
            <div class="company-name-row">
              <div class="company-name inline-edit" data-key="${it.key}" data-field="name" ${ce()} ${colorStyleAttr(it,'name')}>${escapeHtml(it.name)}${colorDotHTML(it.key,'name')}</div>${companyChartIconHTML(it)}<span class="compare-toggle ${(state.compareSelection||[]).includes(it.key)?'active':''}" data-compare-toggle="${it.key}" title="Sélectionner pour comparer">⚖</span>
            </div>
            <div class="company-sub">
              <span class="inline-edit" data-key="${it.key}" data-field="yahooSymbol" ${ce()} title="Symbole Yahoo Finance (ex. 3363.TWO) — alimente la courbe 📈">${escapeHtml(it.yahooSymbol||'')}</span>
              <span class="inline-edit" data-key="${it.key}" data-field="flag" ${ce()}>${it.flag||''}</span>
              <span class="inline-edit" data-key="${it.key}" data-field="country" ${ce()}>${escapeHtml(it.country||'')}</span>
            </div>
          </div>
          <div class="company-cap"><div class="val inline-edit" data-key="${it.key}" data-field="marketCap" ${ce()} ${colorStyleAttr(it,'marketCap')}>${escapeHtml(it.marketCap||'—')}${colorDotHTML(it.key,'marketCap')}</div><div class="lbl">MARKET CAP</div></div>
        </div>
        <span class="region-tag inline-edit" data-key="${it.key}" data-field="region" ${ce()} style="background:${getCompanyRegionColors(it.region).bg};color:${getCompanyRegionColors(it.region).text};">${escapeHtml((it.region||'AUTRE').toUpperCase())}</span>
        ${state.isEditing ? `<span class="color-dot" contenteditable="false" data-color-kind="companyRegionBg" data-color-region="${escapeAttr(it.region||'Autre')}" title="Couleur de fond" style="background:${getCompanyRegionColors(it.region).bg};"></span><span class="color-dot" contenteditable="false" data-color-kind="companyRegionText" data-color-region="${escapeAttr(it.region||'Autre')}" title="Couleur du texte" style="background:${getCompanyRegionColors(it.region).text};"></span>` : ''}
        <div class="company-stats">
          <div><div class="stat-label inline-edit" data-key="${it.key}" data-field="salesGrowthLabel" ${ce()}>${escapeHtml(it.salesGrowthLabel||'SALES GROWTH')}</div><div class="stat-value ${growthClass(it.salesGrowth)} inline-edit" data-key="${it.key}" data-field="salesGrowth" data-colorize="pct" ${ce()} ${colorStyleAttr(it,'salesGrowth')}>${escapeHtml(it.salesGrowth||'—')}${colorDotHTML(it.key,'salesGrowth',growthClass(it.salesGrowth)==='neg'?'#c0392b':'#1c8a4b')}</div></div>
          <div><div class="stat-label inline-edit" data-key="${it.key}" data-field="evEbitdaLabel" ${ce()}>${escapeHtml(it.evEbitdaLabel||'EV/EBITDA')}</div><div class="stat-value inline-edit" data-key="${it.key}" data-field="evEbitda" ${ce()} ${colorStyleAttr(it,'evEbitda')}>${escapeHtml(it.evEbitda||'—')}${colorDotHTML(it.key,'evEbitda')}</div></div>
          <div><div class="stat-label inline-edit" data-key="${it.key}" data-field="coursActuelLabel" ${ce()}>${escapeHtml(it.coursActuelLabel||'COURS ACTUEL')}</div><div class="stat-value inline-edit" data-key="${it.key}" data-field="coursActuel" ${ce()} ${colorStyleAttr(it,'coursActuel')}>${escapeHtml(it.coursActuel||'—')}${colorDotHTML(it.key,'coursActuel')}</div></div>
          <div><div class="stat-label inline-edit" data-key="${it.key}" data-field="targetPriceLabel" ${ce()}>${escapeHtml(it.targetPriceLabel||'TARGET PRICE')}</div><div class="stat-value inline-edit" data-key="${it.key}" data-field="targetPrice" ${ce()} ${colorStyleAttr(it,'targetPrice')}>${escapeHtml(it.targetPrice||'—')}${colorDotHTML(it.key,'targetPrice')}</div></div>
        </div>
        <div class="company-bullets">
          ${(it.bullets||[]).map((b,i)=>`
            <div class="bullet-row">
              <span class="bullet-triangle">▶</span>
              <span class="bullet-text inline-edit" data-key="${it.key}" data-field="bullet" data-bullet-index="${i}" ${ce()} ${colorStyleAttr(it,'bullet-'+i)}>${escapeHtml(b)}${colorDotHTML(it.key,'bullet-'+i)}</span>
              ${state.isEditing?`<span class="del-btn" data-del-bullet="${it.key}|${i}">✕</span>`:''}
            </div>`).join('')}
          ${state.isEditing?`<div class="bullet-add"><button class="btn btn-ghost btn-sm" data-add-bullet="${it.key}">+ Point clé</button></div>`:''}
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  html += renderPortfolioSectionHTML();

  c.innerHTML = html;
  wirePageActions(c, 'addCompanyBtn', addCompanyInline);
  c.querySelectorAll('[data-del-bullet]').forEach(el=>{
    el.onclick = (e) => {
      e.stopPropagation();
      const [key, idx] = el.getAttribute('data-del-bullet').split('|');
      const obj = DB[key];
      if(!obj) return;
      obj.bullets.splice(parseInt(idx,10), 1);
      setItemLocal(key, obj);
      refreshData();
    };
  });
  c.querySelectorAll('[data-add-bullet]').forEach(el=>{
    el.onclick = () => {
      const key = el.getAttribute('data-add-bullet');
      const obj = DB[key];
      if(!obj) return;
      obj.bullets = obj.bullets || [];
      obj.bullets.push('Nouveau point clé');
      setItemLocal(key, obj);
      refreshData();
      setTimeout(()=>{
        const els = document.querySelectorAll(`[data-key="${CSS.escape(key)}"][data-field="bullet"]`);
        const last = els[els.length-1];
        if(last){ last.focus(); selectAllText(last); }
      }, 30);
    };
  });
  c.querySelectorAll('[data-del]').forEach(el=>{
    el.onclick = (e) => { e.stopPropagation(); confirmDeleteContent(el.getAttribute('data-del')); };
  });
  c.querySelectorAll('[data-chart-company]').forEach(el=>{
    el.onclick = (e) => { e.stopPropagation(); openCompanyChartModal(el.getAttribute('data-chart-company')); };
  });
  c.querySelectorAll('[data-compare-toggle]').forEach(el=>{
    el.onclick = (e) => { e.stopPropagation(); toggleCompareSelection(el.getAttribute('data-compare-toggle')); };
  });
  renderCompareBar();
  wirePortfolioSection(c);
}

// ---------- Vue "changements de la semaine" ----------

function companyNamesForWeek(weekId){
  return keysWithPrefix(`mkg:content:entreprises:${weekId}:`)
    .map(k => DB[k] && DB[k].name)
    .filter(Boolean);
}

function openWeekChangesModal(){
  const sortedWeeks = [...state.weeks].sort((a,b)=>(a.order||0)-(b.order||0));
  const idx = sortedWeeks.findIndex(w=>w.id === state.activeWeek);
  const current = sortedWeeks[idx];
  const previous = idx > 0 ? sortedWeeks[idx-1] : null;
  const root = document.getElementById('modalRoot');

  if(!current || !previous){
    root.innerHTML = `<div class="modal-overlay chart-modal" id="wcOverlay"><div class="modal">
      <div class="chart-modal-header"><h3>Changements de la semaine</h3><span class="chart-icon-btn" id="wcCloseBtn" style="background:#f2f3f7;color:#5a6072;">✕</span></div>
      <div class="chart-error">Pas de semaine précédente à comparer.</div>
    </div></div>`;
    document.getElementById('wcCloseBtn').onclick = () => root.innerHTML = '';
    return;
  }

  const currentNames = companyNamesForWeek(current.id);
  const previousNames = companyNamesForWeek(previous.id);
  const added = currentNames.filter(n => !previousNames.includes(n));
  const removed = previousNames.filter(n => !currentNames.includes(n));
  const currentNews = keysWithPrefix(`mkg:content:news:${current.id}:`).length;
  const previousNews = keysWithPrefix(`mkg:content:news:${previous.id}:`).length;

  const listOrEmpty = (arr, emptyText) => arr.length
    ? `<ul style="margin:8px 0 0 18px;font-size:13px;">${arr.map(n=>`<li>${escapeHtml(n)}</li>`).join('')}</ul>`
    : `<div style="font-size:13px;color:var(--muted);margin-top:6px;">${emptyText}</div>`;

  root.innerHTML = `
    <div class="modal-overlay chart-modal" id="wcOverlay">
      <div class="modal">
        <div class="chart-modal-header">
          <div><h3>Changements de la semaine</h3><div class="chart-modal-sub">${escapeHtml(previous.label)} → ${escapeHtml(current.label)}</div></div>
          <span class="chart-icon-btn" id="wcCloseBtn" style="background:#f2f3f7;color:#5a6072;">✕</span>
        </div>
        <div style="margin-top:6px;">
          <div style="font-weight:700;font-size:13px;color:var(--green);">+ ${added.length} entreprise(s) ajoutée(s)</div>
          ${listOrEmpty(added, 'Aucune nouvelle entreprise.')}
        </div>
        <div style="margin-top:16px;">
          <div style="font-weight:700;font-size:13px;color:var(--red);">− ${removed.length} entreprise(s) retirée(s)</div>
          ${listOrEmpty(removed, 'Aucune entreprise retirée.')}
        </div>
        <div style="margin-top:16px;font-size:13px;color:var(--muted);border-top:1px solid var(--line);padding-top:12px;">
          📰 News : ${previousNews} → ${currentNews} (${currentNews-previousNews>=0?'+':''}${currentNews-previousNews})
        </div>
      </div>
    </div>`;
  const close = () => root.innerHTML = '';
  document.getElementById('wcCloseBtn').onclick = close;
  document.getElementById('wcOverlay').addEventListener('click', (e)=>{ if(e.target.id==='wcOverlay') close(); });
}

function toggleCompareSelection(key){
  if(!state.compareSelection) state.compareSelection = [];
  const idx = state.compareSelection.indexOf(key);
  if(idx !== -1){
    state.compareSelection.splice(idx, 1);
  } else {
    if(state.compareSelection.length >= 2) state.compareSelection.shift(); // swap out the oldest pick
    state.compareSelection.push(key);
  }
  refreshData();
}

function renderCompareBar(){
  let bar = document.getElementById('compareBar');
  if(bar) bar.remove();
  const sel = state.compareSelection || [];
  if(sel.length === 0) return;
  const names = sel.map(k => (DB[k] && DB[k].name) || '?').join(' vs ');
  bar = document.createElement('div');
  bar.className = 'compare-bar';
  bar.id = 'compareBar';
  bar.innerHTML = `<span><b>${escapeHtml(names)}</b>${sel.length < 2 ? ' — sélectionne une 2ᵉ entreprise' : ''}</span>
    ${sel.length === 2 ? `<button id="compareGoBtn">⚖ Comparer</button>` : ''}
    <button class="compare-clear" id="compareClearBtn" title="Annuler la sélection">✕</button>`;
  document.body.appendChild(bar);
  const goBtn = document.getElementById('compareGoBtn');
  if(goBtn) goBtn.onclick = () => openCompareModal(sel[0], sel[1]);
  document.getElementById('compareClearBtn').onclick = () => { state.compareSelection = []; refreshData(); };
}

function openCompareModal(keyA, keyB){
  const a = DB[keyA], b = DB[keyB];
  if(!a || !b) return;
  const root = document.getElementById('modalRoot');
  const rows = [
    ['Région', it=>it.region||'—'],
    ['Market cap', it=>it.marketCap||'—'],
    [it=>it.salesGrowthLabel||'Sales growth', it=>it.salesGrowth||'—'],
    [it=>it.evEbitdaLabel||'EV/EBITDA', it=>it.evEbitda||'—'],
    [it=>it.coursActuelLabel||'Cours actuel', it=>it.coursActuel||'—'],
    [it=>it.targetPriceLabel||'Target price', it=>it.targetPrice||'—'],
  ];
  root.innerHTML = `
    <div class="modal-overlay compare-modal" id="compareOverlay">
      <div class="modal">
        <div class="chart-modal-header">
          <h3>Comparaison</h3>
          <span class="chart-icon-btn" id="compareCloseBtn" title="Fermer" style="background:#f2f3f7;color:#5a6072;">✕</span>
        </div>
        <table class="compare-table">
          <tr><td class="row-label">Entreprise</td><td>${escapeHtml(a.name)}</td><td>${escapeHtml(b.name)}</td></tr>
          ${rows.map(([label, val])=>{
            const l = typeof label === 'function' ? label(a) : label; // per-row custom label falls back to a's own field label
            return `<tr><td class="row-label">${escapeHtml(l)}</td><td>${escapeHtml(val(a))}</td><td>${escapeHtml(val(b))}</td></tr>`;
          }).join('')}
        </table>
      </div>
    </div>`;
  const close = () => root.innerHTML = '';
  document.getElementById('compareCloseBtn').onclick = close;
  document.getElementById('compareOverlay').addEventListener('click', (e)=>{ if(e.target.id==='compareOverlay') close(); });
}

// ---------- Suivi des performances du portefeuille (liste globale, indépendante de la semaine) ----------

const DEFAULT_PORTFOLIO_REGIONS = [
  {id:'amerique-du-nord-canada', label:'Amérique du Nord / Canada', color:'#e14b3f'},
  {id:'europe', label:'Europe', color:'#2f6fed'},
  {id:'brics-uk', label:'BRICS+UK', color:'#e2861f'},
  {id:'asie', label:'Asie', color:'#16a34a'},
];

function loadPortfolioRegions(){
  const keys = keysWithPrefix('mkg:portfolio-region:');
  let regions;
  if(keys.length === 0){
    // first run: seed the four default regions so the grid isn't empty
    DEFAULT_PORTFOLIO_REGIONS.forEach(r => setItemLocal(`mkg:portfolio-region:${r.id}`, r));
    regions = DEFAULT_PORTFOLIO_REGIONS.map(r => ({...r}));
  } else {
    regions = keys.map(k => DB[k]).filter(Boolean);
  }
  const REGION_ORDER = ['ASIE', 'BRICS', 'EUROPE', 'AMÉRIQUE DU NORD'];
  const rank = (label) => {
    const upper = (label||'').toUpperCase();
    const idx = REGION_ORDER.findIndex(r => upper.includes(r));
    return idx === -1 ? 999 : idx;
  };
  return regions.sort((a,b) => rank(a.label) - rank(b.label));
}

function portfolioDateSortValue(dateStr){
  const m = /^(\d{1,2})\/(\d{1,2})/.exec((dateStr||'').trim());
  if(!m) return 999999; // unparseable/blank dates sort last
  const day = parseInt(m[1],10), month = parseInt(m[2],10);
  return month*100 + day; // MM.DD as a single sortable number
}

// ---------- Actualisation automatique du suivi de portefeuille (Depuis / YTD) ----------
// Tourne en continu tant que l'onglet Entreprises est ouvert — pas de bouton.
// Correspondances établies au mieux ; certaines sont incertaines (sociétés peu
// connues ou récemment cotées) et sont signalées dans le commentaire.

// Yahoo Finance symbol for each company shown on the "Entreprises" tab —
// used only for the "evolution since presentation" chart (📈 icon on each
// card). Same principle as PORTFOLIO_TICKERS below: keyed by the exact
// company name as typed in the "name" field. A company not listed here (or
// without a real creation date — see companyHasRealCreatedAt) simply shows
// a greyed-out, disabled chart icon instead of guessing.
const COMPANY_TICKERS = {
  // ASIE
  'Sumitomo Pharma': '4506.T', 'Celltrion': '068270.KS', 'Samsung Electronics': '005930.KS',
  'Asia Cement': '1102.TW', 'Keyence': '6861.T', 'Sea Group': 'SE', 'FOCI': '3363.TWO',
  // BRICS+UK
  'Embraer SA': 'ERJ', 'Dixon Technologies': 'DIXON.NS', 'PRIO SA': 'PRIO3.SA', 'CKH Holdings': '0001.HK',
  'Burberry': 'BRBY.L', 'QinetiQ': 'QQ.L', 'Renew Holdings': 'RNWH.L', 'Softcat': 'SCT.L',
  'GetLink': 'GET.PA', 'Invinity': 'IES.L', 'Rolls-Royce Holdings': 'RR.L',
  // EUROPE
  'Alleima AB': 'ALLEI.ST', 'ARM': 'ARM', 'Vivendi': 'VIV.PA', 'Theon International PLC': 'THEON.AS',
  'Technoprobe': 'TPRO.MI', 'Yellow Cake PLC': 'YCA.L', 'BW Offshore': 'BWO.OL', 'Rubis SCA': 'RUI.PA',
  'CSG N.V': 'CSGN.AS', 'Spie': 'SPIE.PA', 'Bechtle AG': 'BC8.DE',
  // AMÉRIQUE DU NORD / CANADA
  'nVent Electric': 'NVT', 'CECO Environmental': 'CECO', 'Ucore Rare Metals': 'UURAF',
  'Innodata': 'INOD', 'Teradata': 'TDC', 'Capstone Copper': 'CS.TO', 'Perpetua Resources': 'PPTA',
  'PVH': 'PVH', 'Bloom Energy': 'BE', 'Corteva': 'CTVA', 'Modine Manufacturing': 'MOD',
  'Cameco': 'CCJ', 'Ormat Technologies': 'ORA', 'Infleqtion': 'INFQ',
  'Applied Digital Corp': 'APLD', 'Ballard': 'BLDP',
};

const PORTFOLIO_TICKERS = {
  'nVent Electric': 'NVT', 'CECO Environmental': 'CECO', 'Ucore Rare Metals': 'UURAF',
  'Energy Fuels': 'UUUU', 'Innodata': 'INOD', 'Capstone Copper': 'CS.TO', 'Teradata': 'TDC',
  'Matador Resources': 'MTDR', 'Perpetua Resources': 'PPTA', 'PVH': 'PVH', 'Bloom Energy': 'BE',
  'Modine Manufacturing': 'MOD', 'Corteva': 'CTVA', 'Ormat Technologies': 'ORA', 'Cameco': 'CCJ',
  'American Superconductor': 'AMSC', 'Infleqtion': 'INFQ', 'Symbotic': 'SYM', 'Centrus Energy': 'LEU',
  'Galp': 'GALP.LS', 'Valneva': 'VLA.PA', 'Alleima AB': 'ALLEI.ST', 'Adyen (short)': 'ADYEN.AS',
  'Adyen': 'ADYEN.AS', 'ARM': 'ARM', 'Technoprobe': 'TPRO.MI', 'Vivendi': 'VIV.PA',
  'Theon International PLC': 'THEON.AS', 'Yellow Cake PLC': 'YCA.L', 'BW Offshore': 'BWO.OL',
  'Fraport AG (short)': 'FRA.DE', 'Fraport AG': 'FRA.DE', 'Rubis SCA': 'RUI.PA', 'Bechtle AG': 'BC8.DE',
  'Spie': 'SPIE.PA', 'Wise': 'WISE.L', 'Drax Group': 'DRX.L', 'Aalberts N.V': 'AALB.AS', 'Solvay': 'SOLB.BR',
  'Embraer SA': 'ERJ', 'Dixon Technologies': 'DIXON.NS', 'PRIO SA': 'PRIO3.SA', 'CKH Holdings': '0001.HK',
  'Burberry': 'BRBY.L', 'QinetiQ': 'QQ.L', 'Renew Holdings': 'RNWH.L', 'Softcat': 'SCT.L',
  'Sigma Lithium Corp': 'SGML', 'Mega Union Technology Inc': '6788.TWO', 'Foxconn': '2317.TW',
  'Sumitomo Pharma': '4506.T', 'Celltrion': '068270.KS', 'Samsung Electronics': '005930.KS',
  'Japex': '1662.T', 'Asia Cement': '1102.TW', 'Keyence': '6861.T', 'Sea Group': 'SE',
  'Hanwha Solutions': '009830.KS', 'CSG N.V': 'CSGN.AS',
};

let portfolioRefreshTimer = null;

function portfolioSinceISODate(dateStr){
  const m = /^(\d{1,2})\/(\d{1,2})/.exec((dateStr||'').trim());
  if(!m) return null;
  const day = m[1].padStart(2,'0'), month = m[2].padStart(2,'0');
  const year = new Date().getFullYear(); // toutes les entrées actuelles sont sur l'année en cours
  return `${year}-${month}-${day}`;
}

async function fetchQuoteSince(symbol, sinceISO){
  try{
    const res = await fetch(`${QUOTE_API_URL}?action=quoteSince&symbol=${encodeURIComponent(symbol)}&since=${encodeURIComponent(sinceISO||'')}`);
    const data = await res.json();
    return data.error ? null : data;
  }catch(e){ return null; }
}

// Resolves the Yahoo symbol to use for a portfolio entry: the manually
// entered SYMBOLE field takes priority (no code edit needed, works instantly
// for any new entry), falling back to the hardcoded PORTFOLIO_TICKERS table
// for older entries that predate this field.
function portfolioEntrySymbol(e){
  return (e.symbol && e.symbol.trim()) || PORTFOLIO_TICKERS[e.entreprise] || null;
}

async function refreshPortfolioQuotesOnce(){
  const entries = loadPortfolioEntries().filter(e => portfolioEntrySymbol(e));
  for(const e of entries){
    if(state.activeCat !== 'entreprises') return; // stopped: left the tab mid-cycle
    const symbol = portfolioEntrySymbol(e);
    const sinceISO = portfolioSinceISODate(e.date);
    const q = await fetchQuoteSince(symbol, sinceISO);
    if(q){
      const obj = DB[e.key];
      if(obj){
        if(q.sinceChange !== undefined) obj.depuis = Math.round(q.sinceChange*100)/100;
        obj.ytd = Math.round(q.ytdChange*100)/100;
        setItemLocal(e.key, obj);
      }
    }
    await new Promise(r=>setTimeout(r, 200)); // stay gentle on the free API
  }
  if(state.activeCat === 'entreprises') refreshDataUnlessEditing();
}

// Immediate one-off refresh for a single portfolio entry — used right after a
// position is added or renamed, so it doesn't have to wait for the next
// 5-minute auto-refresh cycle to get its live quote for the first time.
async function refreshOnePortfolioEntry(key){
  const obj = DB[key];
  const symbol = obj && portfolioEntrySymbol(obj);
  if(!symbol) return;
  const sinceISO = portfolioSinceISODate(obj.date);
  const q = await fetchQuoteSince(symbol, sinceISO);
  if(!q) return;
  const fresh = DB[key];
  if(!fresh) return;
  if(q.sinceChange !== undefined) fresh.depuis = Math.round(q.sinceChange*100)/100;
  fresh.ytd = Math.round(q.ytdChange*100)/100;
  setItemLocal(key, fresh);
  if(state.activeCat === 'entreprises') refreshDataUnlessEditing();
}

function startPortfolioAutoRefresh(){
  if(portfolioRefreshTimer) return; // already running
  refreshPortfolioQuotesOnce(); // first pass right away
  portfolioRefreshTimer = setInterval(refreshPortfolioQuotesOnce, 5*60*1000); // then every 5 min
}

function stopPortfolioAutoRefresh(){
  if(portfolioRefreshTimer){ clearInterval(portfolioRefreshTimer); portfolioRefreshTimer = null; }
}

function loadPortfolioEntries(){
  const items = keysWithPrefix('mkg:portfolio:').map(k => ({...DB[k], key:k}));
  items.sort((a,b) => {
    const d = portfolioDateSortValue(a.date) - portfolioDateSortValue(b.date);
    if(d !== 0) return d;
    return (a.createdAt||0) - (b.createdAt||0); // same date: keep insertion order (oldest first)
  });
  return items;
}

function renderPortfolioSectionHTML(){
  const regions = loadPortfolioRegions();
  const entries = loadPortfolioEntries();
  const byRegionId = {};
  regions.forEach(r => byRegionId[r.id] = []);
  const fallbackId = regions[0] ? regions[0].id : null;
  entries.forEach(e => {
    const rid = regions.find(r => r.id === e.regionId) ? e.regionId : fallbackId;
    if(rid) byRegionId[rid].push(e);
  });

  const sortField = state.portfolioSortField;
  const sortDir = state.portfolioSortDir || 1;
  if(sortField === 'date'){
    regions.forEach(r => byRegionId[r.id].sort((a,b) => (portfolioDateSortValue(a.date) - portfolioDateSortValue(b.date)) * sortDir));
  } else if(sortField){
    regions.forEach(r => byRegionId[r.id].sort((a,b) => ((a[sortField]||0) - (b[sortField]||0)) * sortDir));
  }
  const sortArrow = (field) => sortField === field ? (sortDir === 1 ? ' ▲' : ' ▼') : '';

  let html = `<div class="portfolio-section-title">Suivi des performances du portefeuille <span style="font-size:11px;font-weight:700;color:var(--green);vertical-align:middle;background:#e3f6ec;padding:3px 10px;border-radius:12px;">🟢 Actualisation auto (Depuis / YTD)</span></div>`;
  if(state.isEditing){
    html += `<div class="add-bar"><button class="btn btn-ghost btn-sm" id="addPortfolioRegionBtn">+ Région portefeuille</button></div>`;
  }
  html += `<div class="portfolio-grid">`;
  regions.forEach(region=>{
    html += `<div class="portfolio-region" data-region-id="${region.id}">
      <div class="portfolio-region-title" style="color:${region.color};">
        🌐 <span class="inline-edit" data-region-key="mkg:portfolio-region:${region.id}" data-field="label" ${ce()}>${escapeHtml(region.label.toUpperCase())}</span>
        <span class="region-export-btn" data-export-region="${region.id}" title="Exporter cette région en PDF">📄</span>
        <span style="margin-left:auto;">${regionColorDotHTML(region.id, region.color)}</span>
        ${state.isEditing ? `<span class="del-btn" data-del-region="${region.id}" title="Supprimer cette région">✕</span>` : ''}
      </div>
      <table class="portfolio-table">
        <thead><tr>
          <th class="sortable" data-sort-field="date" title="Trier par date">DATE${sortArrow('date')}</th><th>ENTREPRISE</th><th>STAGIAIRE</th><th>SYMBOLE</th>
          <th class="num sortable" data-sort-field="depuis" title="Trier par DEPUIS">DEPUIS${sortArrow('depuis')}</th>
          <th class="num sortable" data-sort-field="ytd" title="Trier par YTD">YTD${sortArrow('ytd')}</th>
          <th></th>
        </tr></thead>
        <tbody>`;
    byRegionId[region.id].forEach(e=>{
      html += `<tr>
        <td class="pf-date inline-edit" data-key="${e.key}" data-field="date" ${ce()} ${colorStyleAttr(e,'date')}>${escapeHtml(e.date||'')}${colorDotHTML(e.key,'date')}</td>
        <td class="pf-name inline-edit" data-key="${e.key}" data-field="entreprise" ${ce()} ${colorStyleAttr(e,'entreprise')}>${escapeHtml(e.entreprise||'')}${colorDotHTML(e.key,'entreprise')}</td>
        <td class="pf-stagiaire inline-edit" data-key="${e.key}" data-field="stagiaire" ${ce()} ${colorStyleAttr(e,'stagiaire')}>${escapeHtml(e.stagiaire||'')}${colorDotHTML(e.key,'stagiaire')}</td>
        <td class="pf-symbol inline-edit" data-key="${e.key}" data-field="symbol" ${ce()} ${colorStyleAttr(e,'symbol')} title="Symbole Yahoo Finance (ex. AAPL, VIV.PA) — alimente l'actualisation auto ET la courbe 📈">${escapeHtml(e.symbol||'')}${colorDotHTML(e.key,'symbol')}</td>
        <td class="num ${pctClass(e.depuis||0)} inline-edit" data-key="${e.key}" data-field="depuis" data-type="number" data-colorize="1" ${ce()} ${colorStyleAttr(e,'depuis')}>${fmtPct(e.depuis||0)}${colorDotHTML(e.key,'depuis',signHex(e.depuis||0))}</td>
        <td class="num ${pctClass(e.ytd||0)} inline-edit" data-key="${e.key}" data-field="ytd" data-type="number" data-colorize="1" ${ce()} ${colorStyleAttr(e,'ytd')}>${fmtPct(e.ytd||0)}${colorDotHTML(e.key,'ytd',signHex(e.ytd||0))}</td>
        <td class="del-btn" data-del-portfolio="${e.key}">${state.isEditing?'✕':''}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    if(state.isEditing){
      html += `<div class="portfolio-add-row"><button class="btn btn-ghost btn-sm" data-add-portfolio="${region.id}">+ Ajouter une position</button></div>`;
    }
    html += `</div>`;
  });
  html += `</div>`;
  return html;
}

function wirePortfolioSection(container){
  container.querySelectorAll('[data-del-portfolio]').forEach(el=>{
    el.onclick = (e) => { e.stopPropagation(); confirmDeletePortfolioEntry(el.getAttribute('data-del-portfolio')); };
  });
  container.querySelectorAll('[data-add-portfolio]').forEach(el=>{
    el.onclick = () => addPortfolioEntryInline(el.getAttribute('data-add-portfolio'));
  });
  container.querySelectorAll('[data-del-region]').forEach(el=>{
    el.onclick = (e) => { e.stopPropagation(); confirmDeletePortfolioRegion(el.getAttribute('data-del-region')); };
  });
  container.querySelectorAll('[data-sort-field]').forEach(el=>{
    el.onclick = () => {
      const field = el.getAttribute('data-sort-field');
      if(state.portfolioSortField === field){
        state.portfolioSortDir = -(state.portfolioSortDir || 1);
      } else {
        state.portfolioSortField = field;
        state.portfolioSortDir = field === 'date' ? 1 : -1; // dates: earliest first; depuis/ytd: highest first
      }
      refreshData();
    };
  });
  container.querySelectorAll('[data-export-region]').forEach(el=>{
    el.onclick = (e) => { e.stopPropagation(); exportPortfolioRegionAsPDF(el.getAttribute('data-export-region')); };
  });
  const addRegionBtn = document.getElementById('addPortfolioRegionBtn');
  if(addRegionBtn) addRegionBtn.onclick = addPortfolioRegionInline;
}

function addPortfolioRegionInline(){
  const id = 'region-' + uid().slice(0,6);
  const region = { id, label:'Nouvelle région', color:'#6b7280' };
  setItemLocal(`mkg:portfolio-region:${id}`, region);
  refreshData();
  setTimeout(()=>{
    const el = document.querySelector(`[data-region-key="${CSS.escape('mkg:portfolio-region:'+id)}"]`);
    if(el){ el.focus(); selectAllText(el); }
  }, 30);
}

function confirmDeletePortfolioRegion(regionId){
  const entries = loadPortfolioEntries().filter(e => e.regionId === regionId);
  const msg = entries.length
    ? `Supprimer cette région et ses ${entries.length} position(s) ?`
    : 'Supprimer cette région ?';
  if(!confirm(msg)) return;
  entries.forEach(e => deleteItemLocal(e.key));
  deleteItemLocal(`mkg:portfolio-region:${regionId}`);
  showToast('Région supprimée');
  refreshData();
}

function addPortfolioEntryInline(regionId){
  const id = uid();
  const item = { id, date:'JJ/MM', entreprise:"Nom de l'entreprise", stagiaire:'Nom du stagiaire', symbol:'SYMBOLE', regionId, depuis:0, ytd:0, createdAt: Date.now() };
  const key = `mkg:portfolio:${id}`;
  setItemLocal(key, item);
  refreshData();
  refreshOnePortfolioEntry(key); // in case the ticker is already known (e.g. duplicated name), don't wait 5 min
  setTimeout(()=>{
    const el = document.querySelector(`[data-key="${CSS.escape(key)}"][data-field="entreprise"]`);
    if(el){ el.focus(); selectAllText(el); }
  }, 30);
}

function confirmDeletePortfolioEntry(key){
  deleteItemLocal(key);
  showToast('Position supprimée');
  refreshData();
}

function addCompanyInline(){
  const id = uid();
  const item = { id, name:'Nouvelle entreprise', yahooSymbol:'SYMBOLE', ticker:'', flag:'🏳️', country:'Pays', region:'Autre',
    marketCap:'', salesGrowth:'', evEbitdaLabel:'EV/EBITDA', evEbitda:'', coursActuel:'', targetPrice:'',
    body:'', createdAt: Date.now() };
  const key = `mkg:content:entreprises:${state.activeWeek}:${id}`;
  setItemLocal(key, item);
  refreshData();
  setTimeout(()=>{
    const el = document.querySelector(`[data-key="${CSS.escape(key)}"][data-field="name"]`);
    if(el){ el.focus(); selectAllText(el); }
  }, 30);
}
