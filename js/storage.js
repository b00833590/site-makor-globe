// ---------- STORAGE LAYER ----------
// Backed by a Google Sheet through an Apps Script Web App.
// Strategy for speed: load the ENTIRE dataset once into an in-memory cache
// (DB) with a single request. All reads (switching tabs/weeks) are then
// instant, pulled from memory. Writes update the cache immediately (so the
// UI reacts instantly) and are pushed to Firestore in the background.
// Every row is still its own key, so concurrent edits from different people
// never overwrite each other — a background refresh just merges rows in.
//
// --- BACKEND: Firestore (migrated from Google Apps Script) ---
// The Apps Script backend (school account) started silently blocking writes
// under an unresolved CORS restriction, causing edits to appear to fail and
// need retyping. Firestore is talked to directly from the browser — no
// intermediary script, no CORS/account dependency, no per-request Sheet lock
// contention. Each "key" (e.g. "mkg:content:entreprises:...") becomes a
// Firestore document ID in one of two collections, mirroring the old
// Data/PdfChunks sheet split so the main load stays light.

const firebaseConfig = {
  apiKey: "AIzaSyDSq-wkq28uEsU3CO5WT6aW0CQgU1SW7bk",
  authDomain: "makor-morning-news.firebaseapp.com",
  projectId: "makor-morning-news",
  storageBucket: "makor-morning-news.firebasestorage.app",
  messagingSenderId: "651054346177",
  appId: "1:651054346177:web:a31a6fbca4b90853338940",
  measurementId: "G-XN8VTJDMQV"
};
firebase.initializeApp(firebaseConfig);
const fsdb = firebase.firestore();

const PDF_PREFIX_CLIENT = 'mkg:pdfchunk:';
const MAIN_COLLECTION = 'mkg_data';
const PDF_COLLECTION = 'mkg_pdfchunks';
function collectionForKey(key){
  return key && key.indexOf(PDF_PREFIX_CLIENT) === 0 ? PDF_COLLECTION : MAIN_COLLECTION;
}

// Separate, lightweight deployment (personal account) used ONLY for live stock
// quotes — unrelated to the Firestore migration above, still Apps Script
// because it never touches the Sheet, it just relays Yahoo Finance.
const QUOTE_API_URL = 'https://script.google.com/macros/s/AKfycbyrZE6OqvJ5yJ7qLYj0d3ogytsdx1LZTv7c4sKGjTCkaQhgXy-eW263ncHrClj97y8c/exec';

let DB = {}; // key -> parsed object, held in memory after the initial load
let undoStack = [];      // stack of {key, prev} recorded during the current editing session
let sessionSnapshot = null; // deep copy of DB taken when entering edit mode, for "annuler tout"
let pendingWrites = 0;

function updateSaveIndicator(){
  const el = document.getElementById('saveIndicator');
  if(el) el.classList.toggle('show', pendingWrites > 0);
}

function parseDeepLink(){
  const hash = location.hash.slice(1);
  if(!hash) return {};
  const params = new URLSearchParams(hash);
  return { week: params.get('week'), cat: params.get('cat') };
}

function updateDeepLink(){
  if(!state.activeWeek) return;
  const params = new URLSearchParams();
  params.set('week', state.activeWeek);
  if(state.activeCat) params.set('cat', state.activeCat);
  const next = params.toString();
  if(location.hash.slice(1) !== next) history.replaceState(null, '', '#' + next);
}

function initKeyboardShortcuts(){
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if(mod && e.key === 'k'){
      e.preventDefault();
      const input = document.getElementById('globalSearchInput');
      if(input){ input.focus(); input.select(); }
      return;
    }
    if(mod && e.key === 'z' && state.isEditing && !e.shiftKey){
      e.preventDefault();
      undoLast();
      return;
    }
    if(e.key === 'Escape'){
      const modal = document.getElementById('modalRoot');
      if(modal && modal.innerHTML.trim()){
        modal.innerHTML = '';
        return;
      }
      const box = document.getElementById('searchResults');
      const input = document.getElementById('globalSearchInput');
      if(box && box.classList.contains('show')){
        box.classList.remove('show');
        if(input) input.blur();
      }
    }
  });
}

async function loadAllFromServerOnce(){
  try{
    const snap = await fsdb.collection(MAIN_COLLECTION).get();
    const out = {};
    snap.forEach(doc=>{
      const v = doc.data().value;
      try{ out[doc.id] = JSON.parse(v); }catch(e){ /* skip corrupt row */ }
    });
    return out;
  }catch(e){ console.error('bulk load failed', e); return null; }
}

async function loadAllFromServer(){
  const first = await loadAllFromServerOnce();
  if(first && Object.keys(first).length > 0) return first;
  // Empty or failed response — could be a transient hiccup. Wait a moment and
  // try once more before treating it as a real problem, rather than
  // immediately telling the person their data might be gone.
  await new Promise(r => setTimeout(r, 1200));
  const second = await loadAllFromServerOnce();
  return second !== null ? second : first;
}

// Fetches raw (unparsed) string values matching a prefix — used to lazily pull
// PDF chunks only when a presentation is actually opened, not on every page load.
async function fetchRawPrefix(prefix){
  try{
    const coll = collectionForKey(prefix);
    const snap = await fsdb.collection(coll)
      .where(firebase.firestore.FieldPath.documentId(), '>=', prefix)
      .where(firebase.firestore.FieldPath.documentId(), '<', prefix + '\uf8ff')
      .get();
    const out = {};
    snap.forEach(doc => { out[doc.id] = doc.data().value; });
    return out;
  }catch(e){ console.error('prefix fetch failed', e); return null; }
}

// Lists keys that live only on the server (e.g. PDF chunks, deliberately excluded
// from the bulk load) — needed before deleting a presentation's chunks.
async function fetchRemoteKeys(prefix){
  try{
    const coll = collectionForKey(prefix);
    const snap = await fsdb.collection(coll)
      .where(firebase.firestore.FieldPath.documentId(), '>=', prefix)
      .where(firebase.firestore.FieldPath.documentId(), '<', prefix + '\uf8ff')
      .get();
    return snap.docs.map(d => d.id);
  }catch(e){ console.error('remote key list failed', e); return []; }
}

// Single-key raw (unparsed) fetch — mirrors the old action=get endpoint.
async function fetchRawKey(key){
  try{
    const doc = await fsdb.collection(collectionForKey(key)).doc(key).get();
    return doc.exists ? doc.data().value : null;
  }catch(e){ console.error('key fetch failed', e); return null; }
}

// Raw persistence helpers (no undo tracking) — used internally by undo itself,
// so undoing a change never creates another undo step.
let connectionWarningShown = false;
function warnConnectionIssue(msg){
  if(connectionWarningShown) return;
  connectionWarningShown = true;
  showToast(msg);
}

// Posts an action to the backend and retries a couple of times before giving
// up. Two distinct failure modes are both treated as retriable here:
// 1) the fetch itself throws (network blip) — the original reason this existed.
// 2) the fetch *succeeds* but the server didn't actually do the write — e.g.
//    Apps Script's LockService times out under contention (many stagiaires
//    editing, or the portfolio auto-refresh loop holding the lock) and the
//    request comes back as an HTTP error or a body without `success:true`.
//    This second case used to be silently treated as success (fetch() only
//    rejects on network failure, not on HTTP error status), so the edit
//    looked saved but never reached the Sheet — the exact cause of needing
//    to retype something 2-3 times before it "took".
// Writes one document to Firestore, with a couple of retries before giving
// up — a transient blip (brief connectivity hiccup) shouldn't need retyping.
// Unlike the old Apps Script setup, Firestore's SDK throws a real error on
// failure rather than silently succeeding on a blocked/rejected request, so
// this retry logic is a genuine safety net rather than a workaround for a
// broken success signal.
async function firestoreSet(key, valueString, retries = 2, delayMs = 900){
  for(let attempt = 0; attempt <= retries; attempt++){
    try{
      await fsdb.collection(collectionForKey(key)).doc(key).set({
        value: valueString,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return;
    }catch(e){
      if(attempt === retries) throw e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function firestoreDelete(key, retries = 2, delayMs = 900){
  for(let attempt = 0; attempt <= retries; attempt++){
    try{
      await fsdb.collection(collectionForKey(key)).doc(key).delete();
      return;
    }catch(e){
      if(attempt === retries) throw e;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}

async function rawSet(key, obj){
  pendingWrites++;
  updateSaveIndicator();
  try{
    await firestoreSet(key, JSON.stringify(obj));
    connectionWarningShown = false;
  }catch(e){
    console.error('sync failed', e);
    warnConnectionIssue('⚠️ Sauvegarde en ligne échouée — vérifie ta connexion');
  }finally{
    pendingWrites--;
    updateSaveIndicator();
  }
}

// Awaited, silent version — used for sequential bulk writes (e.g. seeding many
// PDF chunks) where firing 100+ requests at once would flood the toast and the server.
async function rawSetAwaited(key, obj){
  try{
    await firestoreSet(key, JSON.stringify(obj));
    return true;
  }catch(e){ console.error('sync failed', e); return false; }
}

// Historically a "fast path" that skipped an existence check server-side.
// Firestore's .set() is already a single, fast write either way, so this is
// now just an alias — kept so every existing call site keeps working unchanged.
async function rawAppendAwaited(key, obj){
  return rawSetAwaited(key, obj);
}

async function rawDelete(key){
  pendingWrites++;
  updateSaveIndicator();
  try{
    await firestoreDelete(key);
    connectionWarningShown = false;
  }catch(e){
    console.error('sync failed', e);
    warnConnectionIssue('⚠️ Suppression en ligne échouée — vérifie ta connexion');
  }finally{
    pendingWrites--;
    updateSaveIndicator();
  }
}

// ---------- Migration ponctuelle : ancien Sheet (Apps Script) → Firestore ----------
// À lancer UNE SEULE FOIS en visitant le site avec ?migrate=1 dans l'URL.
// Copie tout ce qui existe déjà (semaines, entreprises, portefeuille, PDF...)
// sans jamais toucher au Google Sheet d'origine — purement additif côté Firestore.
const LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbwguxIQHUS7EKs313lR5LEQB4VxiS7FXX79D6hAmG7wnTB282rOdMncGr_ZobC80IAjCg/exec';

async function migrateFromAppsScriptToFirestore(){
  showToast('Migration en cours (ne ferme pas cet onglet)...');
  try{
    const res = await fetch(`${LEGACY_API_URL}?action=all`);
    const data = await res.json();
    const entries = Object.entries(data.data || {});

    const pdfRes = await fetch(`${LEGACY_API_URL}?action=getPrefix&prefix=${encodeURIComponent('mkg:pdfchunk:')}`);
    const pdfData = await pdfRes.json();
    const pdfEntries = Object.entries(pdfData.data || {});

    const all = [...entries, ...pdfEntries];
    let done = 0;
    for(const [key, rawVal] of all){
      await firestoreSet(key, rawVal); // rawVal is already the JSON string as it was stored
      done++;
      if(done % 25 === 0) showToast(`Migration : ${done}/${all.length}...`);
    }
    showToast(`✅ Migration terminée : ${all.length} éléments copiés vers Firestore.`);
    alert(`Migration terminée : ${entries.length} éléments (données) + ${pdfEntries.length} morceaux de PDF copiés vers Firestore.\n\nTu peux maintenant recharger la page normalement, sans ?migrate=1 dans l'URL.`);
  }catch(e){
    console.error('migration failed', e);
    showToast('⚠️ Échec de la migration — regarde la console (F12).');
  }
}

if(new URLSearchParams(location.search).get('migrate') === '1'){
  window.addEventListener('load', ()=> setTimeout(migrateFromAppsScriptToFirestore, 500));
}

function setItemLocal(key, obj){
  if(state.isEditing){
    undoStack.push({ key, prev: DB[key] !== undefined ? JSON.parse(JSON.stringify(DB[key])) : undefined });
  }
  DB[key] = obj;
  rawSet(key, obj); // fire and forget — UI already reflects the change, this just persists it
}

function deleteItemLocal(key){
  if(state.isEditing && DB[key] !== undefined){
    undoStack.push({ key, prev: JSON.parse(JSON.stringify(DB[key])) });
  }
  delete DB[key];
  rawDelete(key);
}

function undoLast(){
  if(undoStack.length === 0){ showToast('Rien à annuler'); return; }
  const action = undoStack.pop();
  if(action.prev === undefined){
    delete DB[action.key];
    rawDelete(action.key);
  } else {
    DB[action.key] = action.prev;
    rawSet(action.key, action.prev);
  }
  refreshData();
  renderWeeksBar();
  showToast('Dernière modification annulée');
}

function undoAllSession(){
  if(!sessionSnapshot){ showToast('Rien à annuler'); return; }
  if(Object.keys(sessionSnapshot).length === Object.keys(DB).length && undoStack.length === 0){
    showToast('Rien à annuler');
    return;
  }
  if(!confirm('Annuler toutes les modifications faites depuis le début de cette session d\'édition ?')) return;
  const allKeys = new Set([...Object.keys(DB), ...Object.keys(sessionSnapshot)]);
  allKeys.forEach(key=>{
    const before = sessionSnapshot[key];
    const now = DB[key];
    if(JSON.stringify(before) !== JSON.stringify(now)){
      if(before === undefined){
        delete DB[key];
        rawDelete(key);
      } else {
        DB[key] = before;
        rawSet(key, before);
      }
    }
  });
  undoStack = [];
  sessionSnapshot = JSON.parse(JSON.stringify(DB));
  refreshData();
  renderWeeksBar();
  showToast('Modifications de la session annulées');
}


function keysWithPrefix(prefix){
  return Object.keys(DB).filter(k => k.indexOf(prefix) === 0);
}

// ---------- LOADING ----------

function loadWeeks(){
  const keys = keysWithPrefix('mkg:week:');
  const weeks = keys.map(k => DB[k]).filter(Boolean);
  weeks.sort((a,b)=> (a.order||0) - (b.order||0));
  if(weeks.length === 0){
    // seed with a default week so the app isn't empty on first load
    const seed = {id: slugify('Semaine en cours'), label:'Semaine en cours', order:0};
    setItemLocal('mkg:week:'+seed.id, seed);
    weeks.push(seed);
  }
  return weeks;
}

function loadMarketItems(weekId){
  return keysWithPrefix(`mkg:market:${weekId}:`).map(k => DB[k]).filter(Boolean);
}

function loadContentItems(cat, weekId){
  const items = keysWithPrefix(`mkg:content:${cat}:${weekId}:`).map(k => DB[k]).filter(Boolean);
  items.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));
  return items;
}

// ---------- RENDER ----------
