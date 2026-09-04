const CATEGORIES = [
  {id:'indices', label:'Indices', icon:'📈', type:'market'},
  {id:'news', label:'News', icon:'📰', type:'content'},
  {id:'entreprises', label:'Entreprises', icon:'🏢', type:'company'},
  {id:'ia-fintech', label:'IA & Fintech', icon:'🤖', type:'content'},
];
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map(c=>[c.id,c.label]));
const PASSWORD = "makor2023";

let state = {
  weeks: [],
  activeWeek: null,
  activeCat: 'indices',
  isEditing: false,
  marketItems: [],   // for active week
  contentItems: [],  // for active week + active cat
};

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function slugify(s){ return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }

let lastToastMsg = '', lastToastAt = 0;
function showToast(msg){
  const now = Date.now();
  if(msg === lastToastMsg && (now - lastToastAt) < 3000) return; // suppress rapid duplicate spam
  lastToastMsg = msg; lastToastAt = now;
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}

function setMaj(){
  const now = new Date();
  document.getElementById('majTime').textContent = 'MAJ ' + now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
setMaj();
