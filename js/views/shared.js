function renderWeeksBar(){
  const bar = document.getElementById('weeksBar');
  bar.innerHTML = '';
  state.weeks.forEach(w=>{
    const el = document.createElement('div');
    el.className = 'week-tab' + (w.id === state.activeWeek ? ' active' : '');
    if(state.isEditing && w.id === state.activeWeek){
      el.innerHTML = `<span class="inline-edit" data-key="mkg:week:${w.id}" data-field="label" contenteditable="true" spellcheck="false">${escapeHtml(w.label)}</span><span class="week-del-btn" data-week-del="${w.id}" title="Supprimer cette semaine">✕</span>`;
    } else {
      el.textContent = w.label;
      el.onclick = () => selectWeek(w.id);
    }
    bar.appendChild(el);
  });
  if(state.isEditing){
    const add = document.createElement('div');
    add.className = 'week-add';
    add.textContent = '+';
    add.title = 'Ajouter une semaine';
    add.onclick = addWeekInline;
    bar.appendChild(add);
  }
  bar.querySelectorAll('[data-week-del]').forEach(el=>{
    el.onclick = (e) => { e.stopPropagation(); deleteWeek(el.getAttribute('data-week-del')); };
  });
}

function renderTabsBar(){
  const bar = document.getElementById('tabsBar');
  bar.innerHTML = '';
  CATEGORIES.forEach(c=>{
    const el = document.createElement('div');
    el.className = 'cat-tab' + (c.id === state.activeCat ? ' active' : '');
    el.innerHTML = `<span>${c.icon}</span><span>${c.label.toUpperCase()}</span>`;
    el.onclick = () => selectCat(c.id);
    bar.appendChild(el);
  });
}

function pctClass(v){ return (v >= 0 ? 'pos' : 'neg'); }
function fmtPct(v){ return (v>=0?'+':'') + v.toFixed(2).replace('.',',') + '%'; }
function signHex(v){ return v >= 0 ? '#1c8a4b' : '#c0392b'; }
function ce(){ return state.isEditing ? 'contenteditable="true" spellcheck="false"' : ''; }

// ---------- Simple 21-swatch color palette (not a precise picker — keeps colors consistent) ----------

const COLOR_PALETTE = [
  '#1c2233','#4b5568','#8b95a5','#c0392b','#e74c3c','#e67e22','#f1c40f',
  '#c9971f','#16a34a','#1c8a4b','#0e7c66','#0aa89e','#2980b9','#2f6fed',
  '#0f1730','#6c3fc5','#9b59b6','#d63384','#8d6e63','#5c4033','#000000',
];

function colorDotHTML(key, field, fallback){
  if(!state.isEditing) return '';
  const obj = DB[key];
  const current = getStoredColor(obj, field) || fallback || '#c8ccd6';
  return `<span class="color-dot" contenteditable="false" data-color-kind="field" data-color-key="${key}" data-color-field="${field}" title="Choisir une couleur" style="background:${current};"></span>`;
}

function groupColorDotHTML(weekId, group, currentColor){
  if(!state.isEditing) return '';
  return `<span class="color-dot" contenteditable="false" data-color-kind="group" data-color-week="${weekId}" data-color-group="${escapeAttr(group)}" title="Choisir une couleur" style="background:${currentColor};"></span>`;
}

function regionColorDotHTML(regionId, currentColor){
  if(!state.isEditing) return '';
  return `<span class="color-dot" contenteditable="false" data-color-kind="region" data-color-key="mkg:portfolio-region:${regionId}" title="Choisir une couleur" style="background:${currentColor};"></span>`;
}

function getStoredColor(obj, field){
  return (obj && obj.colors && obj.colors[field]) ? obj.colors[field] : '';
}

function colorStyleAttr(obj, field){
  const c = getStoredColor(obj, field);
  return c ? `style="color:${c}"` : '';
}

function closeColorPopup(){
  const existing = document.getElementById('activeColorPopup');
  if(existing) existing.remove();
}

const TAG_BG_PALETTE = ['#fbe4e2', '#fdecd8', '#e3f6ec', '#e4ecfb']; // light red, light yellow/orange, light green, light blue — matches the tag colors already in use

function openColorPopup(dot){
  closeColorPopup();
  const rect = dot.getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'color-popup';
  pop.id = 'activeColorPopup';
  pop.style.top = (rect.bottom + 4) + 'px';
  pop.style.left = Math.min(rect.left, window.innerWidth - 190) + 'px';
  const palette = dot.dataset.colorKind === 'companyRegionBg' ? TAG_BG_PALETTE : COLOR_PALETTE;
  if(dot.dataset.colorKind === 'companyRegionBg') pop.style.gridTemplateColumns = 'repeat(4,20px)';
  palette.forEach(c=>{
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = c;
    sw.title = c;
    sw.onclick = (e) => { e.stopPropagation(); applyColor(dot, c); };
    pop.appendChild(sw);
  });
  const reset = document.createElement('div');
  reset.className = 'swatch reset';
  reset.textContent = '✕';
  reset.title = 'Réinitialiser (couleur par défaut)';
  reset.onclick = (e) => { e.stopPropagation(); applyColor(dot, null); };
  pop.appendChild(reset);
  document.body.appendChild(pop);
}

function applyColor(dot, color){
  const kind = dot.dataset.colorKind || 'field';

  if(kind === 'group'){
    const weekId = dot.dataset.colorWeek;
    const group = dot.dataset.colorGroup;
    if(color) setGroupColor(weekId, group, color);
    else deleteItemLocal(groupColorKey(weekId, group)); // falls back to the default palette for that region
    closeColorPopup();
    refreshData();
    return;
  }

  if(kind === 'region'){
    const key = dot.dataset.colorKey;
    const rec = DB[key];
    if(rec){ rec.color = color || '#6b7280'; setItemLocal(key, rec); }
    closeColorPopup();
    refreshData();
    return;
  }

  if(kind === 'companyRegionBg' || kind === 'companyRegionText'){
    const region = dot.dataset.colorRegion;
    const part = kind === 'companyRegionBg' ? 'bg' : 'text';
    if(color){
      setCompanyRegionColor(region, part, color);
    } else {
      // reset just this one part back to the built-in default for that region
      const key = companyRegionColorKey(region);
      const current = DB[key] || {};
      const fallback = DEFAULT_COMPANY_REGION_COLORS[region] || { bg:'#eef0f6', text:'#1c2233' };
      current[part] = fallback[part];
      setItemLocal(key, current);
    }
    closeColorPopup();
    refreshData();
    return;
  }

  const key = dot.getAttribute('data-color-key');
  const field = dot.getAttribute('data-color-field');
  const obj = DB[key];
  if(!obj) return;
  obj.colors = obj.colors || {};
  if(color) obj.colors[field] = color; else delete obj.colors[field];
  setItemLocal(key, obj);
  closeColorPopup();
  refreshData();
}

document.addEventListener('click', (e) => {
  if(e.target.classList && e.target.classList.contains('color-dot')){
    e.stopPropagation();
    openColorPopup(e.target);
    return;
  }
  if(!e.target.closest || !e.target.closest('#activeColorPopup')) closeColorPopup();
});


function selectAllText(el){
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function pageActionsHTML(addLabel, addBtnId){
  return `<div class="add-bar">
    ${state.isEditing ? `<button class="btn btn-primary btn-sm" id="${addBtnId}">+ ${addLabel}</button>` : ''}
    ${state.isEditing ? `<button class="btn btn-ghost btn-sm" id="dupWeekBtn">⧉ Dupliquer cette semaine</button>` : ''}
    <button class="btn btn-ghost btn-sm" id="exportPdfBtn">📄 Exporter en PDF</button>
  </div>`;
}

function exportCurrentPageAsPDF(){
  const container = document.getElementById('container');
  const header = document.querySelector('.header');
  const weeksBar = document.getElementById('weeksBar');
  const tabsBar = document.getElementById('tabsBar');
  const addBars = container.querySelectorAll('.add-bar');
  const delBtns = container.querySelectorAll('.del-btn');
  const colorInputs = container.querySelectorAll('.group-color-input');
  const editables = container.querySelectorAll('[contenteditable]');

  const hiddenEls = [header, weeksBar, tabsBar, ...addBars].filter(Boolean);
  const prevDisplay = hiddenEls.map(el => el.style.display);
  hiddenEls.forEach(el => el.style.display = 'none');

  const prevDelDisplay = [];
  delBtns.forEach(el => { prevDelDisplay.push(el.style.display); el.style.display = 'none'; });
  const prevColorDisplay = [];
  colorInputs.forEach(el => { prevColorDisplay.push(el.style.display); el.style.display = 'none'; });
  const prevContentEditable = [];
  editables.forEach(el => { prevContentEditable.push(el.getAttribute('contenteditable')); el.removeAttribute('contenteditable'); });

  container.classList.add('pdf-export');

  // CSS Grid confuses html2pdf's page-break detection (it can't tell where a tall
  // grid item visually ends), causing cards to be sliced mid-content. Rebuilding
  // each grid as stacked row-pairs — two cards side by side, stretched to equal
  // height, one pair per DOM row — lets html2pdf compute breaks correctly on each
  // pair while keeping cards aligned like a real grid.
  const rebuiltGrids = [];
  container.querySelectorAll('.company-grid, .portfolio-grid').forEach(grid=>{
    const items = Array.from(grid.children);
    if(items.length === 0) return;
    const rows = document.createElement('div');
    rows.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
    for(let i=0;i<items.length;i+=2){
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:stretch;break-inside:avoid-page;page-break-inside:avoid;';
      row.appendChild(items[i]);
      items[i].style.flex = '1';
      items[i].style.minWidth = '0';
      if(items[i+1]){
        row.appendChild(items[i+1]);
        items[i+1].style.flex = '1';
        items[i+1].style.minWidth = '0';
      }
      rows.appendChild(row);
    }
    grid.parentNode.insertBefore(rows, grid);
    grid.style.display = 'none';
    rebuiltGrids.push({ grid, wrapper: rows, items });
  });

  const week = state.weeks.find(w=>w.id===state.activeWeek);
  const catInfo = CATEGORIES.find(x=>x.id===state.activeCat);
  const safe = s => (s||'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const filename = `Makor_${safe(catInfo.label)}_${safe(week ? week.label : 'semaine')}.pdf`;

  const restore = () => {
    hiddenEls.forEach((el,i) => el.style.display = prevDisplay[i]);
    delBtns.forEach((el,i) => el.style.display = prevDelDisplay[i]);
    colorInputs.forEach((el,i) => el.style.display = prevColorDisplay[i]);
    editables.forEach((el,i) => { if(prevContentEditable[i] !== null) el.setAttribute('contenteditable', prevContentEditable[i]); });
    rebuiltGrids.forEach(({grid, wrapper, items})=>{
      items.forEach(el => { el.style.flex = ''; el.style.minWidth = ''; grid.appendChild(el); }); // put every card back where it came from, styles reset
      wrapper.remove();
      grid.style.display = '';
    });
    container.classList.remove('pdf-export');
  };

  showToast('Génération du PDF...');
  html2pdf().set({
    margin: 8,
    filename,
    image: { type:'jpeg', quality:0.95 },
    html2canvas: { scale:2, useCORS:true, backgroundColor:'#ffffff' },
    jsPDF: { unit:'mm', format:'a4', orientation:'portrait' },
    pagebreak: { mode:['css','legacy'] }
  }).from(container).save().then(()=>{
    restore();
    showToast('PDF téléchargé');
  }).catch((err)=>{
    console.error('PDF export failed', err);
    restore();
    showToast('⚠️ Échec de la génération du PDF');
  });
}

// Exports one portfolio region as its own PDF by reusing the *same* container
// element the full-page export already captures successfully — just with
// every other top-level block and every other region hidden. (An earlier
// version tried cloning the region into a freshly-appended, off-tree element,
// but capturing something inserted a moment earlier can race the browser's
// layout/paint cycle and produce a blank capture. Toggling visibility on
// already-laid-out content sidesteps that entirely.)
function exportPortfolioRegionAsPDF(regionId){
  const container = document.getElementById('container');
  const targetRegion = container.querySelector(`.portfolio-region[data-region-id="${CSS.escape(regionId)}"]`);
  if(!targetRegion) return;

  const header = document.querySelector('.header');
  const weeksBar = document.getElementById('weeksBar');
  const tabsBar = document.getElementById('tabsBar');
  const addBars = container.querySelectorAll('.add-bar');
  const hiddenChrome = [header, weeksBar, tabsBar, ...addBars].filter(Boolean);
  const prevChromeDisplay = hiddenChrome.map(el => el.style.display);
  hiddenChrome.forEach(el => el.style.display = 'none');

  const topLevel = Array.from(container.children);
  const prevTopDisplay = topLevel.map(el => el.style.display);
  topLevel.forEach(el => { if(!el.contains(targetRegion)) el.style.display = 'none'; });

  const allRegions = container.querySelectorAll('.portfolio-region');
  const prevRegionDisplay = Array.from(allRegions).map(r => r.style.display);
  allRegions.forEach(r => { if(r !== targetRegion) r.style.display = 'none'; });

  const delBtns = container.querySelectorAll('.del-btn, .region-export-btn');
  const prevDelDisplay = [];
  delBtns.forEach(b => { prevDelDisplay.push(b.style.display); b.style.display = 'none'; });
  const editables = container.querySelectorAll('[contenteditable]');
  const prevContentEditable = [];
  editables.forEach(b => { prevContentEditable.push(b.getAttribute('contenteditable')); b.removeAttribute('contenteditable'); });

  container.classList.add('pdf-export');

  const regions = loadPortfolioRegions();
  const region = regions.find(r=>r.id===regionId);
  const week = state.weeks.find(w=>w.id===state.activeWeek);
  const safe = s => (s||'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const filename = `Makor_Portefeuille_${safe(region?region.label:'region')}_${safe(week?week.label:'')}.pdf`;

  const restore = () => {
    hiddenChrome.forEach((el,i) => el.style.display = prevChromeDisplay[i]);
    topLevel.forEach((el,i) => el.style.display = prevTopDisplay[i]);
    allRegions.forEach((r,i) => r.style.display = prevRegionDisplay[i]);
    delBtns.forEach((b,i) => b.style.display = prevDelDisplay[i]);
    editables.forEach((b,i) => { if(prevContentEditable[i] !== null) b.setAttribute('contenteditable', prevContentEditable[i]); });
    container.classList.remove('pdf-export');
  };

  showToast('Génération du PDF...');
  html2pdf().set({
    margin: 8,
    filename,
    image: { type:'jpeg', quality:0.95 },
    html2canvas: { scale:2, useCORS:true, backgroundColor:'#ffffff' },
    jsPDF: { unit:'mm', format:'a4', orientation:'portrait' },
    pagebreak: { mode:['css','legacy'] }
  }).from(container).save().then(()=>{
    restore();
    showToast('PDF téléchargé');
  }).catch((err)=>{
    console.error('PDF export failed', err);
    restore();
    showToast('⚠️ Échec de la génération du PDF');
  });
}

function wirePageActions(container, addBtnId, onAdd){
  const exportBtn = document.getElementById('exportPdfBtn');
  if(exportBtn) exportBtn.onclick = exportCurrentPageAsPDF;
  if(state.isEditing){
    const addBtn = document.getElementById(addBtnId);
    if(addBtn) addBtn.onclick = onAdd;
    const dup = document.getElementById('dupWeekBtn');
    if(dup) dup.onclick = duplicateWeekInline;
  }
}

const DEFAULT_GROUP_COLORS = {
  'ASIE':'#16a34a', 'BRICS':'#e2861f', 'BRICS+UK':'#e2861f',
  'EUROPE':'#2f6fed', 'EUROPE & UK':'#2f6fed', 'AMÉRIQUE DU NORD':'#e14b3f',
};
const SPECIAL_GROUPS = ['MATIÈRES PREMIÈRES & CRYPTO', 'DEVISES (VS USD)'];

function groupColorKey(weekId, group){ return `mkg:groupcolor:${weekId}:${slugify(group)}`; }

function getGroupColor(weekId, group){
  const rec = DB[groupColorKey(weekId, group)];
  if(rec && rec.color) return rec.color;
  return DEFAULT_GROUP_COLORS[group.toUpperCase()] || '#6b7280';
}

// ---------- Actualisation des cours en direct (Yahoo Finance, via Apps Script pour éviter le blocage CORS) ----------

const MARKET_TICKERS = {
  'S&P/ASX 200': { symbol:'^AXJO' },
  'Nikkei 225': { symbol:'^N225' },
  'KOSPI 200': { symbol:'^KS11', note:'KOSPI Composite (approximation — pas de KOSPI 200 disponible)' },
  'CSI 300': { symbol:'000300.SS' },
  'Nifty 50': { symbol:'^NSEI' },
  'IBOVESPA': { symbol:'^BVSP' },
  'CAC 40': { symbol:'^FCHI' },
  'DAX 40': { symbol:'^GDAXI' },
  'FTSE 100': { symbol:'^FTSE' },
  'S&P 500': { symbol:'^GSPC' },
  'Nasdaq': { symbol:'^IXIC' },
  'Dow Jones': { symbol:'^DJI' },
  'S&P TSX 60': { symbol:'^GSPTSE', note:'S&P/TSX Composite (approximation — pas de TSX 60 disponible)' },
  'Or (once)': { symbol:'GC=F' },
  'Argent (once)': { symbol:'SI=F' },
  'Brent (baril)': { symbol:'BZ=F' },
  'Bitcoin': { symbol:'BTC-USD' },
  'AUD': { symbol:'AUDUSD=X', invert:true },
  'ARS': { symbol:'USDARS=X' },
  'INR': { symbol:'USDINR=X' },
  'CNY': { symbol:'USDCNY=X' },
  'JPY': { symbol:'USDJPY=X' },
  'KRW': { symbol:'USDKRW=X' },
  'EUR': { symbol:'EURUSD=X', invert:true },
  'GBP': { symbol:'GBPUSD=X', invert:true },
};

async function fetchQuote(symbol){
  try{
    const res = await fetch(`${QUOTE_API_URL}?action=quote&symbol=${encodeURIComponent(symbol)}`);
    const data = await res.json();
    return data.error ? null : data;
  }catch(e){ return null; }
}

function formatMarketValue(original, newNum){
  const rounded = Math.abs(newNum) >= 1000 ? Math.round(newNum) : Math.round(newNum*100)/100;
  const formatted = rounded.toLocaleString('fr-FR');
  if(/^\$/.test(original||'')) return '$' + formatted;
  if(/pts\s*$/.test(original||'')) return formatted + ' pts';
  if(/€\s*$/.test(original||'')) return formatted + '€';
  if(/£\s*$/.test(original||'')) return formatted + '£';
  return formatted;
}

async function refreshMarketQuotes(){
  const items = loadMarketItems(state.activeWeek);
  const eligible = items.filter(it => MARKET_TICKERS[it.name]);
  if(eligible.length === 0){ showToast('Aucun instrument reconnu pour cette semaine'); return; }
  let updated = 0, failed = 0;
  const notes = new Set();
  showToast(`Actualisation des cours... (0/${eligible.length})`);
  for(let i=0;i<eligible.length;i++){
    const it = eligible[i];
    const key = `mkg:market:${state.activeWeek}:${it.id}`;
    const map = MARKET_TICKERS[it.name];
    const q = await fetchQuote(map.symbol);
    if(q){
      let { value, weekChange, ytdChange } = q;
      if(map.invert){ value = 1/value; weekChange = -weekChange; ytdChange = -ytdChange; }
      const obj = DB[key];
      obj.weekChange = Math.round(weekChange*100)/100;
      obj.ytdChange = Math.round(ytdChange*100)/100;
      obj.value = formatMarketValue(obj.value, value);
      setItemLocal(key, obj);
      if(map.note) notes.add(map.note);
      updated++;
    } else {
      failed++;
    }
    if(i % 3 === 0) showToast(`Actualisation des cours... (${i+1}/${eligible.length})`);
    await new Promise(r=>setTimeout(r, 150));
  }
  refreshData();
  const noteTxt = notes.size ? ` (${[...notes].join(' · ')})` : '';
  showToast(`Cours actualisés : ${updated} mis à jour${failed?`, ${failed} non trouvé(s)`:''}${noteTxt}`);
}
