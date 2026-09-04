function renderContent(){
  const c = document.getElementById('container');
  const week = state.weeks.find(w=>w.id===state.activeWeek);
  const catInfo = CATEGORIES.find(x=>x.id===state.activeCat);

  let html = `
    <div class="page-title"><h2>${catInfo.label}</h2><span class="badge">${week ? week.label : ''}</span></div>
    <hr>`;

  html += pageActionsHTML(catInfo.id === 'news' ? 'Ajouter une brève' : 'Ajouter un article', 'addContentBtn');

  if(state.contentItems.length === 0){
    html += `<div class="empty"><div class="big">${catInfo.icon}</div>Rien à afficher pour cette semaine.${state.isEditing ? '' : ' Passe en mode édition pour en ajouter.'}</div>`;
  } else if(catInfo.id === 'news'){
    // Fixed display order regardless of the order items were added in.
    const NEWS_ORDER = ['Asie', 'Europe', 'BRICS', 'Amérique du Nord'];
    const normalizeForMatch = (s) => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const orderIndex = (region) => {
      const norm = normalizeForMatch(region);
      const idx = NEWS_ORDER.findIndex(k => norm.includes(normalizeForMatch(k)));
      return idx === -1 ? NEWS_ORDER.length : idx; // unrecognized regions sort last, keep their relative order
    };
    const orderedNews = [...state.contentItems].sort((a,b) => orderIndex(a.region) - orderIndex(b.region));
    orderedNews.forEach(it=>{
      const accent = getStoredColor(it,'region') || '#c9971f';
      html += `<div class="news-block" style="border-left-color:${accent};">
        ${state.isEditing?`<div class="del-btn" data-del="${it.key}">✕</div>`:''}
        <div class="news-eyebrow inline-edit" data-key="${it.key}" data-field="region" ${ce()} style="color:${accent};">${escapeHtml(it.region||'Région')}</div>${colorDotHTML(it.key,'region',accent)}
        <h3 class="inline-edit" data-key="${it.key}" data-field="title" ${ce()} ${colorStyleAttr(it,'title')}>${escapeHtml(it.title)}${colorDotHTML(it.key,'title')}</h3>
        <p class="inline-edit" data-key="${it.key}" data-field="description" ${ce()} ${colorStyleAttr(it,'description')}>${escapeHtml(it.description||'')}${colorDotHTML(it.key,'description')}</p>
      </div>`;
    });
  } else {
    // IA & Fintech (and any other simple content tab): white card + small tag pill + optional stat line
    state.contentItems.forEach(it=>{
      html += `<div class="content-card">
        ${state.isEditing?`<div class="del-btn" data-del="${it.key}">✕</div>`:''}
        ${(it.tag || state.isEditing) ? `<div class="ia-tag inline-edit" data-key="${it.key}" data-field="tag" ${ce()}>${escapeHtml(it.tag||'Tag')}</div>` : ''}
        <h3 class="inline-edit" data-key="${it.key}" data-field="title" ${ce()} ${colorStyleAttr(it,'title')}>${escapeHtml(it.title)}${colorDotHTML(it.key,'title')}</h3>
        <p class="inline-edit" data-key="${it.key}" data-field="description" ${ce()} style="white-space:pre-wrap;" ${colorStyleAttr(it,'description')}>${escapeHtml(it.description||'')}${colorDotHTML(it.key,'description')}</p>
        ${(it.statLabel || it.statValue || state.isEditing) ? `<div class="ia-stat"><span class="inline-edit" data-key="${it.key}" data-field="statLabel" ${ce()}>${escapeHtml(it.statLabel||'Statistique')}</span> : <b class="inline-edit" data-key="${it.key}" data-field="statValue" ${ce()}>${escapeHtml(it.statValue||'—')}</b></div>` : ''}
        ${it.link ? `<a href="${escapeAttr(it.link)}" target="_blank" rel="noopener">Lire la source →</a>` : ''}
      </div>`;
    });
  }

  if(catInfo.id === 'ia-fintech'){
    html += renderPresentationsSectionHTML();
  }

  c.innerHTML = html;
  wirePageActions(c, 'addContentBtn', () => addContentItemInline(state.activeCat));
  c.querySelectorAll('[data-del]').forEach(el=>{
    el.onclick = (e) => { e.stopPropagation(); confirmDeleteContent(el.getAttribute('data-del')); };
  });
  if(catInfo.id === 'ia-fintech'){
    wirePresentationsSection(c);
  }
}

// ---------- Présentations (IA & Fintech): thumbnail cards linking to the full deck ----------

function loadPresentations(){
  const items = keysWithPrefix('mkg:presentation:').map(k => ({...DB[k], key:k}));
  items.sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
  return items;
}

function renderPresentationsSectionHTML(){
  const items = loadPresentations();
  let html = `<div class="presentations-title">Présentations</div><div class="presentations-grid">`;
  items.forEach(it=>{
    html += `<div class="presentation-card" data-open-presentation="${it.key}">
      ${state.isEditing?`<div class="del-btn" data-del-presentation="${it.key}">✕</div>`:''}
      <img class="presentation-thumb" src="${it.thumb||''}" alt="${escapeAttr(it.title||'')}">
      <div class="presentation-name inline-edit" data-key="${it.key}" data-field="title" ${ce()} onclick="event.stopPropagation()">${escapeHtml(it.title||'Sans titre')}</div>
    </div>`;
  });
  if(state.isEditing){
    html += `<div class="presentation-add-card" id="addPresentationBtn"><span style="font-size:26px;">+</span><span>Ajouter une présentation</span></div>`;
  }
  html += `</div>`;
  return html;
}

async function fetchChunkWithRetry(key, attempts){
  for(let i=0;i<attempts;i++){
    const value = await fetchRawKey(key);
    if(value !== null && value !== undefined) return value;
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

async function openPresentation(key){
  const item = DB[key];
  if(!item) return;

  const chunkKeys = await fetchRemoteKeys(`mkg:pdfchunk:${item.id}:`);
  if(!chunkKeys || chunkKeys.length === 0){
    showToast('⚠️ Cette présentation n\'est pas encore complètement intégrée — réessaie dans une minute');
    return;
  }
  chunkKeys.sort((a,b)=> parseInt(a.split(':').pop(),10) - parseInt(b.split(':').pop(),10));

  showToast(`Chargement de la présentation... (0/${chunkKeys.length})`);
  const parts = [];
  for(let i=0;i<chunkKeys.length;i++){
    const raw = await fetchChunkWithRetry(chunkKeys[i], 3);
    if(raw === null){
      showToast(`⚠️ Échec au morceau ${i+1}/${chunkKeys.length} — vérifie ta connexion et réessaie`);
      return;
    }
    let val = raw;
    try{ val = JSON.parse(raw); }catch(e){ /* was stored as a plain string */ }
    parts.push(val);
    if(i % 5 === 0 || i === chunkKeys.length-1){
      showToast(`Chargement de la présentation... (${i+1}/${chunkKeys.length})`);
    }
  }

  const b64 = parts.join('');
  try{
    const byteChars = atob(b64);
    const byteNumbers = new Array(byteChars.length);
    for(let i=0;i<byteChars.length;i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type:'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
  }catch(e){
    console.error('PDF reassembly failed', e);
    showToast('⚠️ Erreur lors de l\'ouverture du PDF');
  }
}

function wirePresentationsSection(container){
  container.querySelectorAll('[data-open-presentation]').forEach(el=>{
    el.onclick = () => openPresentation(el.getAttribute('data-open-presentation'));
  });
  container.querySelectorAll('[data-del-presentation]').forEach(el=>{
    el.onclick = async (e) => {
      e.stopPropagation();
      if(!confirm('Supprimer cette présentation et son PDF ?')) return;
      const key = el.getAttribute('data-del-presentation');
      const item = DB[key];
      if(item && item.id){
        showToast('Suppression en cours...');
        const chunkKeys = await fetchRemoteKeys(`mkg:pdfchunk:${item.id}:`);
        chunkKeys.forEach(k => deleteItemLocal(k));
      }
      deleteItemLocal(key);
      showToast('Présentation supprimée');
      refreshData();
    };
  });
  const addBtn = document.getElementById('addPresentationBtn');
  if(addBtn) addBtn.onclick = () => {
    showToast('Pour ajouter une présentation, envoie-moi le PDF dans le chat — je génère la vignette et je l\'intègre pour toi.');
  };
}

function addContentItemInline(cat){
  const id = uid();
  const item = cat === 'news'
    ? { id, title:'[Titre]', description:'[Corps du texte]', link:'', region:'[Région]', tag:'', createdAt: Date.now() }
    : { id, title:'Nouvel article', description:'', link:'', region:'', tag:'', createdAt: Date.now() };
  const key = `mkg:content:${cat}:${state.activeWeek}:${id}`;
  setItemLocal(key, item);
  refreshData();
  setTimeout(()=>{
    const el = document.querySelector(`[data-key="${CSS.escape(key)}"][data-field="title"]`);
    if(el){ el.focus(); selectAllText(el); }
  }, 30);
}

function escapeHtml(s){
  return (s||'').toString().replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(s){ return escapeHtml(s); }

async function render(){
  const catInfo = CATEGORIES.find(x=>x.id===state.activeCat);
  document.getElementById('editToggleBtn').textContent = state.isEditing ? '🔒 Terminer' : '✏️ Éditer';
  document.getElementById('editToggleBtn').classList.toggle('active', state.isEditing);
  document.getElementById('undoAllBtn').style.display = state.isEditing ? '' : 'none';
  renderWeeksBar();
  renderTabsBar();
  if(catInfo.type === 'market') renderMarket();
  else if(catInfo.type === 'company') renderCompanies();
  else renderContent();

  if(catInfo.id === 'entreprises') startPortfolioAutoRefresh();
  else stopPortfolioAutoRefresh();
}

// ---------- ACTIONS ----------
