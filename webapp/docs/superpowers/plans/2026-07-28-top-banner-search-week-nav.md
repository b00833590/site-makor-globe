---
title: Bandeau supérieur — recherche d'entreprise instantanée + navigation par semaine horizontale
date: 2026-07-28
status: draft
---

## Contexte

Un des 3 plans parallèles demandés par l'utilisateur (avec le Lexique et l'automatisation du portefeuille), inspiré de la capture `assets/bandeau.png` de l'ancienne production (`makor-morning-news.vercel.app`) : un bandeau horizontal en haut de page contenant une barre de recherche + la navigation par semaine, toujours visible.

**Écarts délibérés avec la capture de référence** : l'ancienne production a un bandeau à 3 niveaux (logo+recherche+éditer / onglets de semaine / onglets de catégorie Indices-News-Entreprises-IA&Fintech). Ce projet remplace déjà les onglets de catégorie par la navigation 3D sur le globe (régions) — ce niveau n'est PAS reproduit ici, hors périmètre. Seuls les deux premiers niveaux (recherche + semaines) sont fusionnés en **un seul bandeau compact** de 48px de haut, pour respecter "un minimum d'espace vertical".

**Sélecteur partagé déjà en place** (commit `eab52ff`, sur `main` avant ce plan) : `webapp/src/data/selectors.js`'s `getAllCompaniesEverPresented(db)` — renvoie toutes les entreprises jamais présentées, dédupliquées par nom (occurrence la plus récente conservée), triées alphabétiquement, chaque item portant son `weekId` d'origine. Ce plan et le plan Lexique (parallèle) l'utilisent tous les deux — ne pas la redéfinir ni la dupliquer.

**Ce que ce plan NE fait PAS** (périmètre du plan Lexique, à ne pas anticiper ici) : pas de vue "liste alphabétique complète parcourable" — la recherche du bandeau est un accès rapide "je sais ce que je cherche", pas un navigateur exhaustif.

## Décisions de conception

- **Le bandeau remplace la timeline verticale de semaines existante** (`weekTimeline.js`/`weekTimeline.css`, actuellement une colonne de points sur le bord gauche, `position:fixed;left:0;top:44px;bottom:0;width:34px`). `initWeekTimeline({container, weeks, activeWeekId, onSelect})` garde EXACTEMENT la même API publique (utilisée à 6 endroits dans `main.js` : bootstrap, `handleWeekLabelEdit`, `handleWeekAdd`, `handleWeekDelete`, `handleWeekDuplicate`, `handleUndoAll`) — seul le rendu interne change (points verticaux avec tooltip au survol → onglets horizontaux avec libellé toujours visible, scroll horizontal si nécessaire, plus besoin de tooltip puisque le libellé est déjà affiché). **Aucun appelant dans `main.js` n'a besoin d'être modifié pour ce changement.**
- **Le bandeau est un nouvel élément `<header id="top-banner">` en haut de `index.html`**, `position:fixed;top:0;left:0;right:0;height:48px;z-index:20` (au-dessus du tier `z-index:15` des boutons existants). Structure interne : `.top-banner-search` (à gauche) puis `#week-timeline` (occupe le reste, scroll horizontal).
- **Les éléments existants qui se chevaucheraient avec le nouveau bandeau sont repoussés de 48px** : `.region-indicator`, `.edit-toggle-btn`, `.undo-all-btn`, `.export-pdf-btn` passent de `top:16px` à `top:64px` (48px de bandeau + 16px de marge d'origine, valeur inchangée). `.week-admin` passe de `top:44px` à `top:60px` (48px + 12px, pour rester visuellement distinct du bandeau). Rien d'autre ne change.
- **Recherche** : champ texte dans le bandeau, filtre en direct (à chaque frappe, pas de debounce nécessaire — le jeu de données est petit, quelques dizaines d'entreprises au maximum) sur `getAllCompaniesEverPresented(db)`, comparaison insensible à la casse sur `name` (obligatoire) ET `yahooSymbol` (bonus demandé par l'utilisateur). Résultats affichés dans un menu déroulant sous le champ (max 8 résultats, comme un autocomplete classique), chacun affichant le nom + le symbole entre parenthèses s'il existe. Clic sur un résultat (ou `Entrée` sur le premier) : ferme le menu, vide le champ, et appelle une fonction de navigation qui (1) change `activeWeekId` vers `result.weekId`, (2) fait pivoter le globe vers la région de l'entreprise via `scene.goToRegion(...)`, (3) ouvre le panneau latéral s'il est fermé, (4) une fois le panneau réellement affiché, fait défiler jusqu'à la carte de l'entreprise et la met brièvement en surbrillance (classe CSS temporaire, retirée après ~1.5s).
- **Résolution de région pour la navigation** : `result.region` est un libellé de groupe libre (ex. `'ASIE'`), pas un `regionId` du globe (`'asia'`) — il faut le faire passer par `normalizeRegionLabel` (déjà utilisé par les sélecteurs region-aware) pour obtenir le `regionId` réel.
- **`initPanelToggle`'s valeur de retour doit être capturée** dans `main.js` (actuellement appelée sans récupérer `{open, close, toggle}| son résultat) pour permettre l'ouverture forcée du panneau depuis la navigation de recherche — changement d'une ligne, aucun comportement existant modifié (le câblage `toggleBtn`/click reste identique).

## Tâche 1 — `webapp/src/timeline/weekTimeline.js` : rendu horizontal, sans tooltip

Remplacer tout le contenu du fichier par :

```js
export function initWeekTimeline({ container, weeks, activeWeekId, onSelect }) {
  let currentWeeks = weeks;

  function render(currentActiveId) {
    container.replaceChildren();
    for (const week of currentWeeks) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'week-tab' + (week.id === currentActiveId ? ' active' : '');
      tab.textContent = week.label;
      tab.addEventListener('click', () => {
        onSelect(week.id);
        render(week.id);
      });
      container.appendChild(tab);
    }
    if (currentActiveId) {
      const activeTab = container.querySelector('.week-tab.active');
      if (activeTab) activeTab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }

  render(activeWeekId);

  return {
    setWeeks(newWeeks, newActiveWeekId) {
      currentWeeks = newWeeks;
      render(newActiveWeekId);
    },
  };
}
```

**Note pour l'implémenteur** : `scrollIntoView` n'existe pas dans jsdom (les tests unitaires vont échouer s'ils exécutent ce chemin sans le mocker) — vérifier si les tests existants de `weekTimeline.test.js` déclenchent ce code ; si oui, soit mocker `Element.prototype.scrollIntoView` dans le test (`vi.fn()`), soit garder l'appel dans un `if (typeof activeTab.scrollIntoView === 'function')`. Ne pas laisser un test rouge à cause de ça.

## Tâche 2 — `webapp/src/timeline/weekTimeline.css` : bandeau horizontal, plus de tooltip

Remplacer tout le contenu du fichier par :

```css
.week-timeline {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  padding: 0 12px;
}

.week-timeline::-webkit-scrollbar {
  height: 4px;
}

.week-tab {
  flex: 0 0 auto;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 6px 10px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s;
}

.week-tab:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.week-tab.active {
  color: var(--navy, #0f1730);
  background: var(--gold-light, #e0b53d);
  font-weight: bold;
}
```

## Tâche 3 — Nouveau `webapp/src/timeline/topBanner.js` + `.css` : conteneur + recherche

Nouveau fichier `webapp/src/timeline/topBanner.css` :

```css
.top-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  background: rgba(15, 23, 48, 0.92);
  border-bottom: 1px solid rgba(224, 181, 61, 0.25);
  display: flex;
  align-items: center;
  z-index: 20;
}

.top-banner-search {
  position: relative;
  flex: 0 0 220px;
  margin-left: 16px;
}

.top-banner-search-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(224, 181, 61, 0.3);
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  padding: 7px 10px;
}

.top-banner-search-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.top-banner-search-input:focus {
  outline: none;
  border-color: var(--gold-light, #e0b53d);
}

.top-banner-search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: #0f1730;
  border: 1px solid rgba(224, 181, 61, 0.4);
  border-radius: 6px;
  max-height: 280px;
  overflow-y: auto;
  z-index: 25;
}

.top-banner-search-result {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 12px;
  padding: 8px 10px;
  cursor: pointer;
}

.top-banner-search-result:last-child {
  border-bottom: none;
}

.top-banner-search-result:hover,
.top-banner-search-result.highlighted {
  background: rgba(201, 151, 31, 0.2);
}

.top-banner-search-result-symbol {
  color: var(--gold-light, #e0b53d);
  margin-left: 4px;
  font-size: 11px;
}

.top-banner-search-empty {
  padding: 10px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

/* Brief highlight applied to a company card after search-navigation lands on it. */
.panel-company-card.search-highlight {
  animation: search-highlight-pulse 1.5s ease-out;
}

@keyframes search-highlight-pulse {
  0% { box-shadow: 0 0 0 2px var(--gold-light, #e0b53d); }
  100% { box-shadow: 0 0 0 2px transparent; }
}
```

Nouveau fichier `webapp/src/timeline/topBanner.js` :

```js
function matchesQuery(company, query) {
  const q = query.toLowerCase();
  return company.name.toLowerCase().includes(q) || (company.yahooSymbol || '').toLowerCase().includes(q);
}

export function initTopBanner({ searchInputEl, searchResultsEl, getAllCompanies, onSelectCompany }) {
  function closeResults() {
    searchResultsEl.replaceChildren();
    searchResultsEl.style.display = 'none';
  }

  function renderResults(query) {
    if (!query.trim()) {
      closeResults();
      return;
    }
    const matches = getAllCompanies().filter(c => matchesQuery(c, query)).slice(0, 8);
    searchResultsEl.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('div');
      empty.className = 'top-banner-search-empty';
      empty.textContent = 'Aucune entreprise trouvée';
      searchResultsEl.appendChild(empty);
    } else {
      matches.forEach((company, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'top-banner-search-result' + (i === 0 ? ' highlighted' : '');
        btn.textContent = company.name;
        if (company.yahooSymbol) {
          const symbol = document.createElement('span');
          symbol.className = 'top-banner-search-result-symbol';
          symbol.textContent = `(${company.yahooSymbol})`;
          btn.appendChild(symbol);
        }
        btn.addEventListener('click', () => {
          closeResults();
          searchInputEl.value = '';
          onSelectCompany(company);
        });
        searchResultsEl.appendChild(btn);
      });
    }
    searchResultsEl.style.display = 'block';
  }

  searchInputEl.addEventListener('input', () => renderResults(searchInputEl.value));

  searchInputEl.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      const first = searchResultsEl.querySelector('.top-banner-search-result');
      if (first) first.click();
    } else if (event.key === 'Escape') {
      closeResults();
      searchInputEl.blur();
    }
  });

  document.addEventListener('click', event => {
    if (!searchResultsEl.contains(event.target) && event.target !== searchInputEl) closeResults();
  });

  closeResults();
}
```

### Tests — nouveau `webapp/src/timeline/topBanner.test.js`

```js
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initTopBanner } from './topBanner.js';

const COMPANIES = [
  { id: 'c1', name: 'Toyota', yahooSymbol: '7203.T', region: 'Asie', weekId: 'w1' },
  { id: 'c2', name: 'Reliance Industries', yahooSymbol: 'RELIANCE.NS', region: 'BRICS', weekId: 'w2' },
];

function setup(companies = COMPANIES) {
  const searchInputEl = document.createElement('input');
  const searchResultsEl = document.createElement('div');
  const onSelectCompany = vi.fn();
  initTopBanner({ searchInputEl, searchResultsEl, getAllCompanies: () => companies, onSelectCompany });
  return { searchInputEl, searchResultsEl, onSelectCompany };
}

function type(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('initTopBanner', () => {
  it('shows no results dropdown when the query is empty', () => {
    const { searchResultsEl } = setup();
    expect(searchResultsEl.style.display).toBe('none');
  });

  it('filters companies by name, case-insensitively', () => {
    const { searchInputEl, searchResultsEl } = setup();
    type(searchInputEl, 'toyo');
    const results = [...searchResultsEl.querySelectorAll('.top-banner-search-result')];
    expect(results).toHaveLength(1);
    expect(results[0].textContent).toContain('Toyota');
  });

  it('filters companies by yahooSymbol too', () => {
    const { searchInputEl, searchResultsEl } = setup();
    type(searchInputEl, 'reliance.ns');
    const results = [...searchResultsEl.querySelectorAll('.top-banner-search-result')];
    expect(results).toHaveLength(1);
    expect(results[0].textContent).toContain('Reliance Industries');
  });

  it('shows an empty-state message when nothing matches', () => {
    const { searchInputEl, searchResultsEl } = setup();
    type(searchInputEl, 'zzzzz');
    expect(searchResultsEl.querySelector('.top-banner-search-empty')).not.toBeNull();
    expect(searchResultsEl.querySelectorAll('.top-banner-search-result')).toHaveLength(0);
  });

  it('caps results at 8 matches', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, name: `Company ${i}`, yahooSymbol: '', region: 'Asie', weekId: 'w1' }));
    const { searchInputEl, searchResultsEl } = setup(many);
    type(searchInputEl, 'company');
    expect(searchResultsEl.querySelectorAll('.top-banner-search-result')).toHaveLength(8);
  });

  it('calls onSelectCompany and clears the input/results when a result is clicked', () => {
    const { searchInputEl, searchResultsEl, onSelectCompany } = setup();
    type(searchInputEl, 'toyota');
    searchResultsEl.querySelector('.top-banner-search-result').click();
    expect(onSelectCompany).toHaveBeenCalledWith(COMPANIES[0]);
    expect(searchInputEl.value).toBe('');
    expect(searchResultsEl.style.display).toBe('none');
  });

  it('Enter key selects the first (highlighted) result', () => {
    const { searchInputEl, onSelectCompany } = setup();
    type(searchInputEl, 'toyota');
    searchInputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onSelectCompany).toHaveBeenCalledWith(COMPANIES[0]);
  });

  it('Escape key closes the results dropdown', () => {
    const { searchInputEl, searchResultsEl } = setup();
    type(searchInputEl, 'toyota');
    searchInputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(searchResultsEl.style.display).toBe('none');
  });
});
```

## Tâche 4 — `webapp/index.html` : structure du bandeau

Remplacer les deux premières lignes du `<body>` :

```html
  <div id="week-timeline" class="week-timeline"></div>
  <div id="week-admin" class="week-admin"></div>
```

par :

```html
  <header id="top-banner" class="top-banner">
    <div class="top-banner-search">
      <input id="top-banner-search-input" class="top-banner-search-input" type="text" placeholder="Rechercher une entreprise..." autocomplete="off" />
      <div id="top-banner-search-results" class="top-banner-search-results"></div>
    </div>
    <div id="week-timeline" class="week-timeline"></div>
  </header>
  <div id="week-admin" class="week-admin"></div>
```

(`#week-admin` reste un élément frère indépendant, en dehors du `<header>` — c'est un panneau flottant d'administration, pas une brique de navigation permanente.)

## Tâche 5 — CSS : repousser les éléments existants sous le nouveau bandeau

Dans `webapp/src/styles/globe.css`, remplacer `top: 16px;` par `top: 64px;` dans les 3 règles `.region-indicator`, `.edit-toggle-btn`, `.export-pdf-btn`, et dans `.undo-all-btn` (celle-ci en plus de son `display:none` par défaut, inchangé). Dans `webapp/src/timeline/weekAdmin.css`, remplacer `top: 44px;` par `top: 60px;` dans la règle `.week-admin`.

## Tâche 6 — `webapp/src/main.js` : câblage recherche → navigation

Ajouter l'import :

```js
import { initTopBanner } from './timeline/topBanner.js';
import './timeline/topBanner.css';
```

Ajouter `getAllCompaniesEverPresented` à l'import existant de `selectors.js` (ligne 19) :

```js
import { getWeeks, getMarketItemsForWeekAndRegion, getNewsItemsForWeekAndRegion, getCompanyItemsForWeekAndRegion, getIaFintechItemsForWeek, getWeekContentKeys, getAllMarketItemsForWeek, getAllNewsItemsForWeek, getAllCompanyItemsForWeek, getAllCompaniesEverPresented, getPresentations } from './data/selectors.js';
```

Ajouter l'import de `normalizeRegionLabel` (déjà utilisé indirectement via `selectors.js` mais pas exposé à `main.js` — vérifier son chemin exact, `webapp/src/data/regionMatch.js`) :

```js
import { normalizeRegionLabel } from './data/regionMatch.js';
```

Capturer la valeur de retour de `initPanelToggle` — remplacer :

```js
initPanelToggle({
  toggleBtn: document.getElementById('panel-toggle-btn'),
  bodyEl: document.body,
});
```

par :

```js
const panelToggleHandle = initPanelToggle({
  toggleBtn: document.getElementById('panel-toggle-btn'),
  bodyEl: document.body,
});
```

Ajouter, juste après cette déclaration, la fonction de navigation et le câblage du bandeau :

```js
function handleSearchSelectCompany(company) {
  activeWeekId = company.weekId;
  if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);

  const targetRegionId = normalizeRegionLabel(company.region);
  if (targetRegionId && targetRegionId !== activeRegionId) {
    scene.goToRegion(targetRegionId);
    // goToRegion's onRegionSelect callback (handleRegionSelect) already calls
    // renderPanelForCurrentSelection() — no need to call it a second time here.
  } else {
    renderPanelForCurrentSelection();
  }

  panelToggleHandle.open();

  // The panel's CSS opening transition (globe.css, 0.35s) must finish before
  // the target card exists at a stable scroll position — matches the timing
  // already used elsewhere in this codebase for post-transition DOM work.
  setTimeout(() => {
    const card = [...document.querySelectorAll('.panel-company-name')]
      .find(el => el.textContent === company.name)
      ?.closest('.panel-company-card');
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('search-highlight');
    setTimeout(() => card.classList.remove('search-highlight'), 1500);
  }, 400);
}

initTopBanner({
  searchInputEl: document.getElementById('top-banner-search-input'),
  searchResultsEl: document.getElementById('top-banner-search-results'),
  getAllCompanies: () => getAllCompaniesEverPresented(db),
  onSelectCompany: handleSearchSelectCompany,
});
```

**Point d'attention pour l'implémenteur** : `scene` (le handle retourné par `initGlobeScene`) et `weekTimelineHandle` doivent déjà être déclarés/assignés au moment où ce bloc s'exécute — placer cet ajout **après** la déclaration de `const scene = initGlobeScene(...)` (actuellement ligne ~572) et après que `weekTimelineHandle` ait été assigné dans `bootstrap()` ; si `bootstrap()` est asynchrone et que ce bloc de câblage s'exécute avant, `weekTimelineHandle` vaudrait encore `null` au moment de l'appel — le code de `handleSearchSelectCompany` gère déjà ce cas (`if (weekTimelineHandle) ...`), donc pas de plantage, mais vérifier que `initTopBanner(...)` lui-même est appelé après que le DOM du bandeau existe (après le chargement du HTML, ce qui est toujours le cas pour du JS chargé en `<script type="module">` en fin de `<body>` — déjà le cas ici).

## Contraintes globales

- Ne pas toucher `weekAdmin.js`/`weekAdmin.css` au-delà du changement de `top` demandé en tâche 5 — la gestion CRUD des semaines (ajouter/renommer/dupliquer/supprimer) reste un panneau flottant séparé, hors périmètre de ce plan.
- Ne pas dupliquer `getAllCompaniesEverPresented` — l'importer depuis `selectors.js`.
- Ne pas modifier `normalizeRegionLabel`/`regionMatch.js`.
- Ne pas toucher au plan Lexique ni au plan d'automatisation du portefeuille (parallèles, dans d'autres worktrees).

## Vérification

- `cd webapp && npx vitest run` doit rester vert, avec les nouveaux tests de `topBanner.test.js` et sans régression sur `weekTimeline.test.js` (vérifier en particulier que le remplacement dots→onglets horizontaux n'a pas cassé un test qui présupposait des `.week-dot` — adapter ces tests aux nouveaux `.week-tab` si nécessaire, en conservant la couverture équivalente : rendu d'un item par semaine, item actif marqué, clic déclenche `onSelect`, `setWeeks` remplace la liste et re-rend).
- `npm run build` doit rester propre.
- Aucune interaction Firestore nouvelle (la recherche est purement locale sur `db` déjà chargé, aucune écriture) — vérification manuelle **visuelle** dans le navigateur :
  - Le bandeau s'affiche en haut, pleine largeur, ~48px de haut, ne chevauche aucun élément existant (indicateur de région, boutons Éditer/Export/Annuler, panneau admin de semaine).
  - Les onglets de semaine s'affichent horizontalement avec leur libellé complet, scrollables si nombreux, l'actif est visuellement distinct (fond doré) ; cliquer sur un onglet change bien de semaine (comportement identique à avant, juste la présentation qui change).
  - Taper le nom (ou un fragment) d'une entreprise réelle dans la barre de recherche affiche les résultats en direct ; cliquer sur un résultat change de semaine ET de région si nécessaire, ouvre le panneau s'il était fermé, et fait défiler jusqu'à la carte de l'entreprise avec un bref effet de surbrillance dorée.
  - Recherche par symbole Yahoo Finance (ex. taper juste le ticker) fonctionne aussi.
  - Aucune régression sur l'édition (ajout/suppression/renommage de semaine via le panneau `#week-admin` toujours fonctionnel, à sa nouvelle position).
