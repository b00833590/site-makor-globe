// ---------- ACTIONS ----------

// ---------- GLOBAL SEARCH ----------
// Everything is already in memory (DB), so this searches across ALL weeks
// and ALL tabs at once (indices, news, entreprises, IA & Fintech) — not just
// the currently open week/tab.

function normalizeSearch(s){
  return (s||'').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function buildSearchIndex(){
  const results = [];
  state.weeks.forEach(week=>{
    keysWithPrefix(`mkg:market:${week.id}:`).forEach(k=>{
      const it = DB[k];
      if(!it) return;
      results.push({
        weekId: week.id, weekOrder: week.order||0, catId:'indices',
        title: it.name || '(sans nom)',
        snippet: [it.group, it.value].filter(Boolean).join(' · '),
        text: [it.name, it.group].filter(Boolean).join(' '),
        key: k
      });
    });
    CATEGORIES.filter(c=>c.type!=='market').forEach(cat=>{
      keysWithPrefix(`mkg:content:${cat.id}:${week.id}:`).forEach(k=>{
        const it = DB[k];
        if(!it) return;
        let title, snippet, text;
        if(cat.id === 'entreprises'){
          if(!it.name) return; // legacy non-company blob, ignore
          title = it.name;
          snippet = [it.ticker, it.country].filter(Boolean).join(' · ');
          text = [it.name, it.ticker, it.country, it.region, ...(it.bullets||[])].filter(Boolean).join(' ');
        } else {
          title = it.title || '(sans titre)';
          snippet = it.description || '';
          text = [it.title, it.description, it.region, it.tag].filter(Boolean).join(' ');
        }
        results.push({weekId: week.id, weekOrder: week.order||0, catId: cat.id, title, snippet, text, key: k});
      });
    });
  });
  return results;
}

function searchSnippetHTML(item, normQuery){
  const raw = (item.snippet || item.title || '').toString();
  const short = raw.length > 110 ? raw.slice(0, 110) + '…' : raw;
  if(!normQuery) return escapeHtml(short);
  const normShort = normalizeSearch(short);
  const idx = normShort.indexOf(normQuery);
  if(idx === -1) return escapeHtml(short);
  return escapeHtml(short.slice(0, idx)) + '<mark>' + escapeHtml(short.slice(idx, idx+normQuery.length)) + '</mark>' + escapeHtml(short.slice(idx+normQuery.length));
}

function runGlobalSearch(query){
  const box = document.getElementById('searchResults');
  const q = normalizeSearch(query).trim();
  if(q.length < 2){ box.classList.remove('show'); box.innerHTML = ''; return; }

  const index = buildSearchIndex();
  const matches = index.filter(r => normalizeSearch(r.text).includes(q));
  matches.sort((a,b) => b.weekOrder - a.weekOrder);
  const top = matches.slice(0, 30);

  if(top.length === 0){
    box.innerHTML = `<div class="search-empty">Aucun résultat pour « ${escapeHtml(query)} »</div>`;
  } else {
    let lastWeekId = null;
    box.innerHTML = top.map(r=>{
      const week = state.weeks.find(w=>w.id===r.weekId);
      const groupHeader = r.weekId !== lastWeekId ? `<div class="search-result-group">${escapeHtml(week ? week.label : '')}</div>` : '';
      lastWeekId = r.weekId;
      return `${groupHeader}<div class="search-result-item" data-goto-week="${escapeAttr(r.weekId)}" data-goto-cat="${escapeAttr(r.catId)}" data-goto-key="${escapeAttr(r.key)}">
        <div class="sr-title">${escapeHtml(r.title)} <span style="color:var(--muted);font-weight:400;">— ${escapeHtml(CATEGORY_LABELS[r.catId]||r.catId)}</span></div>
        <div class="sr-snippet">${searchSnippetHTML(r, q)}</div>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-goto-week]').forEach(el=>{
      el.onclick = () => goToSearchResult(
        el.getAttribute('data-goto-week'),
        el.getAttribute('data-goto-cat'),
        el.getAttribute('data-goto-key')
      );
    });
  }
  box.classList.add('show');
}

function goToSearchResult(weekId, catId, key){
  state.activeWeek = weekId;
  state.activeCat = catId;
  refreshData();
  document.getElementById('searchResults').classList.remove('show');
  document.getElementById('globalSearchInput').value = '';
  setTimeout(()=>{
    const field = document.querySelector(`[data-key="${CSS.escape(key)}"]`) || document.querySelector(`[data-del="${CSS.escape(key)}"]`);
    const card = field ? field.closest('.company-card, .content-card, .news-block, .card') : null;
    const target = card || field;
    if(target){
      target.scrollIntoView({behavior:'smooth', block:'center'});
      target.classList.add('search-highlight');
      setTimeout(()=>target.classList.remove('search-highlight'), 2000);
    }
  }, 80);
}

function initGlobalSearch(){
  const input = document.getElementById('globalSearchInput');
  const box = document.getElementById('searchResults');
  let debounceTimer;
  input.addEventListener('input', ()=>{
    clearTimeout(debounceTimer);
    const val = input.value;
    debounceTimer = setTimeout(()=>runGlobalSearch(val), 150);
  });
  input.addEventListener('focus', ()=>{ if(input.value.trim().length >= 2) runGlobalSearch(input.value); });
  document.addEventListener('click', (e)=>{
    if(!e.target.closest('.search-wrap')) box.classList.remove('show');
  });
  input.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){ input.value=''; box.classList.remove('show'); input.blur(); }
  });
}

// Forces whatever field is currently being edited to commit its value right
// now, by blurring it — rather than relying on the browser to fire that blur
// on its own before a button's click handler runs. Normally the browser does
// this automatically, but it isn't 100% guaranteed across all click paths,
// and a missed commit here means a just-typed edit silently reverting when
// the page re-renders. Called before any action that re-renders the page in
// response to something OTHER than the edit itself (switching tabs/weeks,
// leaving edit mode).
function commitActiveEdit(){
  const active = document.activeElement;
  if(active && active.classList && active.classList.contains('inline-edit')) active.blur();
}

// Global safety net: whenever the mouse goes down anywhere OUTSIDE the field
// currently being edited, commit that field immediately — before the click
// that follows gets a chance to run its own handler (delete a row, switch
// weeks, leave edit mode, export a PDF, anything). Fires on mousedown (which
// happens before click) rather than relying on each individual button to
// remember to call commitActiveEdit() itself, so this covers every button on
// the site, present and future, not just the handful that were patched
// individually further down.
document.addEventListener('mousedown', (e) => {
  const active = document.activeElement;
  if(active && active.classList && active.classList.contains('inline-edit') && !active.contains(e.target)){
    active.blur();
  }
}, true);

function selectWeek(weekId){
  commitActiveEdit();
  state.activeWeek = weekId;
  localStorage.setItem('mkg:lastActiveWeek', weekId);
  updateDeepLink();
  refreshData();
}

function selectCat(catId){
  commitActiveEdit();
  state.activeCat = catId;
  localStorage.setItem('mkg:lastActiveCat', catId);
  updateDeepLink();
  refreshData();
}

function refreshData(){
  // Everything is already in memory (DB) — this is instant, no network wait.
  const catInfo = CATEGORIES.find(x=>x.id===state.activeCat);
  if(catInfo.type === 'market'){
    state.marketItems = loadMarketItems(state.activeWeek);
    state.marketItems.forEach(it => it.key = `mkg:market:${state.activeWeek}:${it.id}`);
  } else {
    const items = loadContentItems(state.activeCat, state.activeWeek);
    items.forEach(it => it.key = `mkg:content:${state.activeCat}:${state.activeWeek}:${it.id}`);
    state.contentItems = items;
  }
  render();
}

// Same as refreshData(), but used by background/automatic processes (the
// portfolio quote auto-refresh) rather than the user's own actions. If the
// person currently has a field focused mid-edit, a full re-render would tear
// out that DOM node and discard whatever they'd typed but not committed yet
// — this was the cause of edits silently getting lost and needing retyping.
// Skipping the render this cycle costs nothing: the data is already saved in
// DB and will show up on the next render triggered by the user themselves.
function refreshDataUnlessEditing(){
  const active = document.activeElement;
  if(active && active.classList && active.classList.contains('inline-edit')) return;
  refreshData();
}

async function manualRefresh(){
  showToast('Actualisation...');
  const fresh = await loadAllFromServer();
  const hadData = Object.keys(DB).length > 0;
  const fetchedEmpty = fresh && Object.keys(fresh).length === 0;

  if(fresh && !(fetchedEmpty && hadData)){
    // Safe to apply: either we got real data, or both server and local are legitimately empty.
    DB = fresh;
    sessionSnapshot = state.isEditing ? JSON.parse(JSON.stringify(DB)) : null;
    undoStack = [];
    refreshData();
    showToast('À jour');
  } else if(fetchedEmpty && hadData){
    // Server responded but with nothing — almost certainly a glitch, not "everything got deleted".
    // Refuse to overwrite local data so nothing is lost.
    showToast('⚠️ Le serveur a répondu vide — actualisation ignorée pour ne rien perdre. Réessaie dans un instant.');
  } else {
    showToast('⚠️ Échec de l\'actualisation — vérifie ta connexion');
  }
}

function deleteWeek(weekId){
  const week = state.weeks.find(w=>w.id===weekId);
  if(!week) return;
  if(!confirm(`Supprimer définitivement "${week.label}" et toutes ses données (indices, entreprises, news, IA & Fintech) ?`)) return;

  keysWithPrefix(`mkg:market:${weekId}:`).forEach(k => deleteItemLocal(k));
  CATEGORIES.filter(cat => cat.type !== 'market').forEach(cat=>{
    keysWithPrefix(`mkg:content:${cat.id}:${weekId}:`).forEach(k => deleteItemLocal(k));
  });
  keysWithPrefix(`mkg:groupcolor:${weekId}:`).forEach(k => deleteItemLocal(k));
  deleteItemLocal(`mkg:week:${weekId}`);

  state.weeks = state.weeks.filter(w => w.id !== weekId);
  showToast('Semaine supprimée');

  if(state.activeWeek === weekId){
    const next = state.weeks[0];
    if(next) selectWeek(next.id);
    else { state.activeWeek = null; state.marketItems = []; state.contentItems = []; render(); }
  } else {
    render();
  }
}

function addWeekInline(){
  const id = slugify('nouvelle-semaine') + '-' + uid().slice(0,4);
  const order = state.weeks.length ? Math.max(...state.weeks.map(w=>w.order||0)) + 1 : 0;
  const week = {id, label:'Nouvelle semaine', order};
  setItemLocal('mkg:week:'+id, week);
  state.weeks.push(week);
  seedDefaultNewsForWeek(id);
  selectWeek(id);
  setTimeout(()=>{
    const el = document.querySelector(`[data-key="${CSS.escape('mkg:week:'+id)}"][data-field="label"]`);
    if(el){ el.focus(); selectAllText(el); }
  }, 30);
}

// Creates one placeholder news item per region for a brand-new week, so the
// News tab always starts with the 4 regions ready to fill in rather than
// empty. Only ever called on week CREATION — never touches existing weeks.
function seedDefaultNewsForWeek(weekId){
  const REGION_COLORS = { 'Asie':'#16a34a', 'Europe':'#2f6fed', 'BRICS':'#e2861f', 'Amérique du Nord':'#e14b3f' };
  ['Asie', 'Europe', 'BRICS', 'Amérique du Nord'].forEach(region=>{
    const id = uid();
    const item = { id, title:'[Titre]', description:'[Corps du texte]', link:'', region, tag:'', colors:{region:REGION_COLORS[region]}, createdAt: Date.now() };
    setItemLocal(`mkg:content:news:${weekId}:${id}`, item);
  });
}

let duplicateInProgress = false;
async function duplicateWeekInline(){
  if(duplicateInProgress){ showToast('Duplication déjà en cours, patiente...'); return; }
  duplicateInProgress = true;
  const sourceWeekId = state.activeWeek; // frozen now — safe even if the person clicks elsewhere while this runs
  try{
    const current = state.weeks.find(w=>w.id===sourceWeekId);
    const newId = slugify((current?current.label:'semaine')+'-copie') + '-' + uid().slice(0,4);
    const order = state.weeks.length ? Math.max(...state.weeks.map(w=>w.order||0)) + 1 : 0;
    const label = 'Copie de ' + (current ? current.label : '');
    const week = {id:newId, label, order};
    DB['mkg:week:'+newId] = week;
    await rawAppendAwaited('mkg:week:'+newId, week);
    state.weeks.push(week);

    // Build the full list of items to copy up front so we can show real progress.
    const toCopy = [];
    loadMarketItems(sourceWeekId).forEach(it=>{
      const nid = uid();
      const copy = {...it, id:nid}; delete copy.key;
      toCopy.push({ key:`mkg:market:${newId}:${nid}`, value:copy });
    });
    keysWithPrefix(`mkg:groupcolor:${sourceWeekId}:`).forEach(k=>{
      const slug = k.split(':')[3];
      toCopy.push({ key:`mkg:groupcolor:${newId}:${slug}`, value:DB[k] });
    });
    CATEGORIES.filter(c=>c.type!=='market').forEach(cat=>{
      loadContentItems(cat.id, sourceWeekId).forEach(it=>{
        const nid = uid();
        const copy = {...it, id:nid}; delete copy.key;
        toCopy.push({ key:`mkg:content:${cat.id}:${newId}:${nid}`, value:copy });
      });
    });

    showToast(`Duplication en cours... (0/${toCopy.length})`);
    let count = 0;
    for(let i=0;i<toCopy.length;i++){
      const { key, value } = toCopy[i];
      DB[key] = value;
      await rawAppendAwaited(key, value);
      count++;
      if(i % 3 === 0 || i === toCopy.length-1) showToast(`Duplication en cours... (${i+1}/${toCopy.length})`);
    }

    showToast(`Semaine dupliquée (${count} élément(s)) — renomme-la et ajuste les chiffres`);
    selectWeek(newId);
    setTimeout(()=>{
      const el = document.querySelector(`[data-key="${CSS.escape('mkg:week:'+newId)}"][data-field="label"]`);
      if(el){ el.focus(); selectAllText(el); }
    }, 30);
  } finally {
    duplicateInProgress = false;
  }
}

function confirmDeleteMarket(key){
  deleteItemLocal(key);
  showToast('Ligne supprimée');
  refreshData();
}

function confirmDeleteContent(key){
  deleteItemLocal(key);
  showToast('Article supprimé');
  refreshData();
}

// ---------- INLINE EDIT COMMIT (no popups — click text/numbers directly, they save on blur) ----------

document.addEventListener('focusout', (e) => {
  const el = e.target;
  if(!el.classList || !el.classList.contains('inline-edit')) return;

  if(el.dataset.regionKey){
    const rec = DB[el.dataset.regionKey];
    if(rec){
      const newLabel = (el.innerText !== undefined ? el.innerText : el.textContent).trim();
      if(newLabel && rec.label !== newLabel){
        rec.label = newLabel;
        setItemLocal(el.dataset.regionKey, rec);
        showToast('Région renommée');
      }
    }
    return;
  }

  if(el.dataset.role === 'group-rename'){
    const oldGroup = el.dataset.group;
    const newGroup = (el.innerText !== undefined ? el.innerText : el.textContent).trim().toUpperCase();
    if(newGroup && newGroup !== oldGroup){
      const items = loadMarketItems(state.activeWeek).filter(it => (it.group||'AUTRE') === oldGroup);
      items.forEach(it => { it.group = newGroup; setItemLocal(`mkg:market:${state.activeWeek}:${it.id}`, it); });
      const oldColorKey = groupColorKey(state.activeWeek, oldGroup);
      if(DB[oldColorKey]){
        setItemLocal(groupColorKey(state.activeWeek, newGroup), DB[oldColorKey]);
        deleteItemLocal(oldColorKey);
      }
      showToast('Groupe renommé');
      refreshData();
    }
    return;
  }

  const key = el.dataset.key;
  const field = el.dataset.field;
  if(!key || !field) return;
  const obj = DB[key];
  if(!obj) return;

  const raw = (el.innerText !== undefined ? el.innerText : el.textContent).trim();

  if(field === 'bullet'){
    const idx = parseInt(el.dataset.bulletIndex, 10);
    if(obj.bullets && obj.bullets[idx] !== raw){
      obj.bullets[idx] = raw;
      setItemLocal(key, obj);
    }
    return;
  }

  let newVal = raw;
  if(el.dataset.type === 'number'){
    newVal = parseFloat(raw.replace(',','.')) || 0;
  }
  if(obj[field] !== newVal){
    obj[field] = newVal;
    setItemLocal(key, obj);
    if(field === 'label'){
      const w = state.weeks.find(w=>w.id === key.replace('mkg:week:',''));
      if(w) w.label = newVal;
      renderWeeksBar();
    }
    if(key.indexOf('mkg:portfolio:') === 0 && (field === 'entreprise' || field === 'date' || field === 'symbol')){
      refreshOnePortfolioEntry(key); // name/date just changed — try to resolve its ticker right away
    }
    if(key.indexOf('mkg:content:entreprises:') === 0 && field === 'yahooSymbol'){
      refreshData(); // re-render so the 📈 icon reflects the newly entered symbol right away
    }
  }
}, true);

document.addEventListener('input', (e) => {
  const el = e.target;
  if(!el.classList || !el.classList.contains('inline-edit')) return;
  if(el.dataset.colorize){
    const raw = (el.innerText !== undefined ? el.innerText : el.textContent).trim().replace(',','.').replace('%','');
    const n = parseFloat(raw);
    if(!isNaN(n)){
      el.classList.remove('pos','neg');
      el.classList.add(n >= 0 ? 'pos' : 'neg');
    }
  }
});

document.addEventListener('keydown', (e) => {
  const el = e.target;
  if(!el.classList || !el.classList.contains('inline-edit')) return;
  // Enter commits single-line fields instead of inserting a newline (description/body stay multi-line)
  if(e.key === 'Enter' && el.dataset.field !== 'description' && el.dataset.field !== 'body' && el.dataset.field !== 'bullet'){
    e.preventDefault();
    el.blur();
  }
});
