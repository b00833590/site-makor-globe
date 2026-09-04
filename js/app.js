async function init(){
  let slowToastShown = false;
  const slowTimer = setTimeout(()=>{
    if(!slowToastShown){ slowToastShown = true; showToast('Connexion lente — chargement en cours...'); }
  }, 3000);

  const fresh = await loadAllFromServer();
  clearTimeout(slowTimer);
  DB = fresh || {};
  if(!fresh) showToast('⚠️ Connexion au serveur impossible — vérifie ta connexion réseau');

  seedIfNeeded();
  migrateIaFintech();
  migratePortfolioSection();
  stripLeadingBulletArrows();
  migrateNewsRegions();
  fixNewsRegionCodes();
  migrateIaFintechTags();
  seedPresentationsIfNeeded();
  restoreQuantiquePresentationIfMissing();
  migratePortfolioRegionIds();
  dedupePortfolioEntries();
  backfillPortfolioSymbols();
  backfillKnownSeedWeekSymbols();
  backfillCompanyPlaceholderFields();
  state.weeks = loadWeeks();
  const deep = parseDeepLink();
  const marchWeek = state.weeks.find(w=>w.id===SEED_WEEK_ID);
  const lastWeek = deep.week || localStorage.getItem('mkg:lastActiveWeek');
  const lastCat = deep.cat || localStorage.getItem('mkg:lastActiveCat');
  state.activeWeek = (lastWeek && state.weeks.some(w=>w.id===lastWeek))
    ? lastWeek
    : (marchWeek ? marchWeek.id : state.weeks[state.weeks.length-1].id);
  if(lastCat && CATEGORIES.some(c=>c.id===lastCat)) state.activeCat = lastCat;
  updateDeepLink();
  refreshData();
  initGlobalSearch();
  initKeyboardShortcuts();

  seedPdfChunksIfNeeded();
}

init();

