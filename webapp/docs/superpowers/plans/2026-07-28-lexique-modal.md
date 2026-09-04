---
title: Lexique — annuaire alphabétique de toutes les entreprises présentées, recherche instantanée
date: 2026-07-28
status: draft
---

## Contexte

Un des 3 plans parallèles demandés par l'utilisateur (avec le bandeau supérieur et l'automatisation du portefeuille). Objectif : un espace listant **toutes** les entreprises présentées depuis le début (pas seulement la semaine/région active), triées alphabétiquement, avec recherche instantanée, ouverture quasi-instantanée, clic → fiche entreprise.

**Choix d'intégration** : une **modale**, sur le modèle exact de `presentationsModal.js` (phase 28) déjà présent dans ce projet — bouton flottant discret déclenche l'ouverture, fermeture par ✕ ou clic hors modale. Justifié par : (1) c'est un pattern déjà établi et éprouvé dans cette base de code (cohérence design, zéro nouveau paradigme UI à apprendre pour l'utilisateur), (2) contrairement à un panneau latéral gauche, une modale n'entre pas en conflit avec l'espace déjà occupé à gauche par la timeline de semaines (bandeau, plan parallèle) ni avec le panneau admin de semaine, (3) une modale plein-écran-partiel permet d'afficher une vraie liste alphabétique longue sans les contraintes de largeur d'un panneau latéral étroit.

**Sélecteur partagé déjà en place** (commit `eab52ff`, sur `main` avant ce plan) : `webapp/src/data/selectors.js`'s `getAllCompaniesEverPresented(db)` — toutes les entreprises jamais présentées, dédupliquées par nom (occurrence la plus récente conservée), triées alphabétiquement, chaque item portant son `weekId` d'origine. **Ne pas la redéfinir** — le plan bandeau (parallèle) l'utilise aussi pour sa recherche rapide.

**Indépendance vis-à-vis du plan bandeau** : ce plan a son propre bouton déclencheur flottant (pas de dépendance DOM sur le `<header id="top-banner">` du plan parallèle, qui pourrait ne pas encore être mergé). La logique de "naviguer vers une entreprise" (changer de semaine, changer de région, ouvrir le panneau, faire défiler jusqu'à la carte) est réimplémentée ici de façon autonome plutôt que partagée avec le plan bandeau — un peu de code de navigation dupliqué entre les deux modales/UI est accepté comme compromis délibéré pour permettre une exécution vraiment parallèle sans dépendance de merge entre les deux worktrees (voir note utilisateur : les 3 plans tournent en parallèle, seule la vérification Firestore + le merge restent séquentiels).

## Décisions de conception

- Nouveau bouton flottant `#lexique-trigger-btn` (même famille visuelle que `#presentations-trigger-btn`, positionné à proximité mais sans chevauchement — `presentations-trigger-btn` occupe `bottom:20px; left:54px` sur 40×40px, donc l'espace `x:[54,94]` ; ce nouveau bouton va juste à sa droite, voir CSS ci-dessous).
- Nouvelle modale `#lexique-modal`, structure DOM identique au pattern `presentations-modal` : conteneur plein-écran semi-transparent + un `.lexique-modal-content` centré avec header (titre + ✕) et corps scrollable.
- Le corps de la modale : un champ de recherche en haut (filtre en direct, insensible à la casse, sur `name`), puis la liste alphabétique complète en dessous (groupée visuellement par lettre initiale pour la lisibilité — un simple libellé de section "A", "B", ... au-dessus de chaque groupe de résultats consécutifs partageant la même initiale, recalculé à chaque frappe sur les résultats filtrés).
- **Ouverture quasi-instantanée** : la modale ne fait aucun nouvel appel réseau à l'ouverture — `getAllCompaniesEverPresented(db)` opère sur les données déjà chargées en mémoire (`db`), donc le rendu est synchrone. Le seul travail à l'ouverture est le `filter`/`sort` déjà fait par le sélecteur (déjà trié) plus un rendu DOM d'une liste de quelques dizaines d'éléments au maximum — négligeable.
- Clic sur une entreprise dans la liste : ferme la modale, puis exécute la même séquence de navigation que le plan bandeau (changer `activeWeekId`, faire pivoter le globe vers la bonne région via `scene.goToRegion`, ouvrir le panneau latéral, faire défiler jusqu'à la carte avec surbrillance temporaire) — voir Tâche 3 pour le code exact (délibérément autonome, pas importé du plan bandeau).

## Tâche 1 — Nouveau `webapp/src/panel/lexiqueModal.js`

```js
function groupByInitial(companies) {
  const groups = [];
  let currentLetter = null;
  for (const company of companies) {
    const letter = (company.name[0] || '').toUpperCase();
    if (letter !== currentLetter) {
      currentLetter = letter;
      groups.push({ letter, companies: [] });
    }
    groups[groups.length - 1].companies.push(company);
  }
  return groups;
}

export function initLexiqueModal({ modalEl, searchInputEl, listEl, triggerBtn, closeBtn, getAllCompanies, onSelectCompany }) {
  function render(query) {
    const all = getAllCompanies();
    const q = query.trim().toLowerCase();
    const filtered = q ? all.filter(c => c.name.toLowerCase().includes(q)) : all;
    listEl.replaceChildren();

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.className = 'lexique-empty';
      empty.textContent = 'Aucune entreprise trouvée';
      listEl.appendChild(empty);
      return;
    }

    for (const group of groupByInitial(filtered)) {
      const letterEl = document.createElement('div');
      letterEl.className = 'lexique-letter';
      letterEl.textContent = group.letter;
      listEl.appendChild(letterEl);

      for (const company of group.companies) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'lexique-item';
        item.textContent = company.name;
        if (company.yahooSymbol) {
          const symbol = document.createElement('span');
          symbol.className = 'lexique-item-symbol';
          symbol.textContent = company.yahooSymbol;
          item.appendChild(symbol);
        }
        item.addEventListener('click', () => {
          close();
          onSelectCompany(company);
        });
        listEl.appendChild(item);
      }
    }
  }

  function open() {
    modalEl.classList.add('open');
    searchInputEl.value = '';
    render('');
    searchInputEl.focus();
  }

  function close() {
    modalEl.classList.remove('open');
  }

  triggerBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  modalEl.addEventListener('click', event => {
    if (event.target === modalEl) close();
  });
  searchInputEl.addEventListener('input', () => render(searchInputEl.value));

  return { open, close };
}
```

### Tests — nouveau `webapp/src/panel/lexiqueModal.test.js`

```js
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initLexiqueModal } from './lexiqueModal.js';

const COMPANIES = [
  { id: 'c1', name: 'Asia Cement', yahooSymbol: '1102.TW', region: 'Asie', weekId: 'w1' },
  { id: 'c2', name: 'Evergreen Marine', yahooSymbol: '2603.TW', region: 'Asie', weekId: 'w2' },
  { id: 'c3', name: 'EVT Ltd', yahooSymbol: 'EVT.XA', region: 'Asie', weekId: 'w3' },
];

function setup(companies = COMPANIES) {
  const modalEl = document.createElement('div');
  const searchInputEl = document.createElement('input');
  const listEl = document.createElement('div');
  const triggerBtn = document.createElement('button');
  const closeBtn = document.createElement('button');
  const onSelectCompany = vi.fn();
  const handle = initLexiqueModal({ modalEl, searchInputEl, listEl, triggerBtn, closeBtn, getAllCompanies: () => companies, onSelectCompany });
  return { modalEl, searchInputEl, listEl, triggerBtn, closeBtn, onSelectCompany, handle };
}

describe('initLexiqueModal', () => {
  it('opens the modal (adds the "open" class) and renders every company when the trigger is clicked', () => {
    const { modalEl, listEl, triggerBtn } = setup();
    triggerBtn.click();
    expect(modalEl.classList.contains('open')).toBe(true);
    expect(listEl.querySelectorAll('.lexique-item')).toHaveLength(3);
  });

  it('groups companies under a letter header, one per distinct initial in order', () => {
    const { listEl, triggerBtn } = setup();
    triggerBtn.click();
    const letters = [...listEl.querySelectorAll('.lexique-letter')].map(el => el.textContent);
    expect(letters).toEqual(['A', 'E']); // Asia Cement, then Evergreen Marine + EVT Ltd share "E"
  });

  it('filters the list live as the search input changes', () => {
    const { searchInputEl, listEl, triggerBtn } = setup();
    triggerBtn.click();
    searchInputEl.value = 'evt';
    searchInputEl.dispatchEvent(new Event('input'));
    const items = [...listEl.querySelectorAll('.lexique-item')];
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('EVT Ltd');
  });

  it('shows an empty-state message when nothing matches', () => {
    const { searchInputEl, listEl, triggerBtn } = setup();
    triggerBtn.click();
    searchInputEl.value = 'zzzzz';
    searchInputEl.dispatchEvent(new Event('input'));
    expect(listEl.querySelector('.lexique-empty')).not.toBeNull();
  });

  it('closes the modal and calls onSelectCompany when a company is clicked', () => {
    const { modalEl, listEl, triggerBtn, onSelectCompany } = setup();
    triggerBtn.click();
    listEl.querySelector('.lexique-item').click();
    expect(modalEl.classList.contains('open')).toBe(false);
    expect(onSelectCompany).toHaveBeenCalledWith(COMPANIES[0]); // "Asia Cement" sorts first
  });

  it('closes the modal when the close button is clicked', () => {
    const { modalEl, triggerBtn, closeBtn } = setup();
    triggerBtn.click();
    closeBtn.click();
    expect(modalEl.classList.contains('open')).toBe(false);
  });

  it('closes the modal when clicking the backdrop (the modal element itself, not its content)', () => {
    const { modalEl, triggerBtn } = setup();
    triggerBtn.click();
    modalEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(modalEl.classList.contains('open')).toBe(false);
  });

  it('resets the search field and re-renders the full list every time the modal re-opens', () => {
    const { searchInputEl, listEl, triggerBtn } = setup();
    triggerBtn.click();
    searchInputEl.value = 'evt';
    searchInputEl.dispatchEvent(new Event('input'));
    triggerBtn.click(); // re-open
    expect(searchInputEl.value).toBe('');
    expect(listEl.querySelectorAll('.lexique-item')).toHaveLength(3);
  });
});
```

## Tâche 2 — Nouveau `webapp/src/panel/lexiqueModal.css`

```css
.lexique-trigger-btn {
  position: fixed;
  bottom: 20px;
  left: 106px;
  z-index: 15;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(15, 23, 48, 0.9);
  border: 1px solid rgba(224, 181, 61, 0.4);
  color: var(--gold-light, #e0b53d);
  font-size: 16px;
  cursor: pointer;
}

.lexique-trigger-btn:hover {
  background: rgba(201, 151, 31, 0.2);
}

.lexique-modal {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 30;
  align-items: center;
  justify-content: center;
}

.lexique-modal.open {
  display: flex;
}

.lexique-modal-content {
  background: #0f1730;
  border: 1px solid rgba(224, 181, 61, 0.35);
  border-radius: 10px;
  width: 420px;
  max-width: 92%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.lexique-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.lexique-modal-header h3 {
  margin: 0;
  color: #fff;
  font-size: 15px;
}

.lexique-modal-header button {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  font-size: 16px;
  cursor: pointer;
}

.lexique-search-input {
  margin: 12px 18px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(224, 181, 61, 0.3);
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  padding: 8px 10px;
}

.lexique-search-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.lexique-list {
  overflow-y: auto;
  padding: 0 18px 16px;
}

.lexique-letter {
  color: var(--gold-light, #e0b53d);
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
  margin: 10px 0 4px;
}

.lexique-item {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 13px;
  padding: 7px 8px;
  cursor: pointer;
}

.lexique-item:hover {
  background: rgba(201, 151, 31, 0.15);
}

.lexique-item-symbol {
  color: rgba(255, 255, 255, 0.4);
  font-size: 11px;
  margin-left: 6px;
}

.lexique-empty {
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  padding: 20px 0;
  text-align: center;
}
```

## Tâche 3 — `webapp/index.html` : bouton déclencheur + modale

Ajouter, juste après la ligne du bouton `presentations-trigger-btn` :

```html
  <button id="lexique-trigger-btn" class="lexique-trigger-btn" type="button" aria-label="Lexique des entreprises" title="Lexique des entreprises">📖</button>
  <div id="lexique-modal" class="lexique-modal">
    <div class="lexique-modal-content">
      <div class="lexique-modal-header">
        <h3>📖 Lexique des entreprises</h3>
        <button id="lexique-modal-close" type="button" aria-label="Fermer">✕</button>
      </div>
      <input id="lexique-search-input" class="lexique-search-input" type="text" placeholder="Rechercher..." autocomplete="off" />
      <div id="lexique-list" class="lexique-list"></div>
    </div>
  </div>
```

## Tâche 4 — `webapp/src/main.js` : câblage

Ajouter les imports :

```js
import { initLexiqueModal } from './panel/lexiqueModal.js';
import './panel/lexiqueModal.css';
```

Ajouter `getAllCompaniesEverPresented` à l'import existant de `selectors.js` (ligne 19) si pas déjà fait par le plan bandeau (les deux plans ajoutent le même import — en cas de conflit de merge trivial sur cette ligne, garder une seule occurrence) :

```js
import { getWeeks, getMarketItemsForWeekAndRegion, getNewsItemsForWeekAndRegion, getCompanyItemsForWeekAndRegion, getIaFintechItemsForWeek, getWeekContentKeys, getAllMarketItemsForWeek, getAllNewsItemsForWeek, getAllCompanyItemsForWeek, getAllCompaniesEverPresented, getPresentations } from './data/selectors.js';
```

Ajouter l'import de `normalizeRegionLabel` (idem, potentiel doublon trivial avec le plan bandeau à résoudre au merge) :

```js
import { normalizeRegionLabel } from './data/regionMatch.js';
```

Si `initPanelToggle`'s valeur de retour n'est pas déjà capturée (par le plan bandeau, fusionné avant ou après celui-ci), s'assurer qu'elle l'est :

```js
const panelToggleHandle = initPanelToggle({
  toggleBtn: document.getElementById('panel-toggle-btn'),
  bodyEl: document.body,
});
```

Ajouter, après cette déclaration (et après `const scene = initGlobeScene(...)`, qui doit déjà exister à ce point du fichier) :

```js
function handleLexiqueSelectCompany(company) {
  activeWeekId = company.weekId;
  if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);

  const targetRegionId = normalizeRegionLabel(company.region);
  if (targetRegionId && targetRegionId !== activeRegionId) {
    scene.goToRegion(targetRegionId);
  } else {
    renderPanelForCurrentSelection();
  }

  panelToggleHandle.open();

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

initLexiqueModal({
  modalEl: document.getElementById('lexique-modal'),
  searchInputEl: document.getElementById('lexique-search-input'),
  listEl: document.getElementById('lexique-list'),
  triggerBtn: document.getElementById('lexique-trigger-btn'),
  closeBtn: document.getElementById('lexique-modal-close'),
  getAllCompanies: () => getAllCompaniesEverPresented(db),
  onSelectCompany: handleLexiqueSelectCompany,
});
```

**Note pour l'implémenteur — doublon volontaire et son merge** : `handleLexiqueSelectCompany` ci-dessus est identique en substance à `handleSearchSelectCompany` du plan bandeau (parallèle) — c'est un choix assumé (voir Contexte). Si les deux plans sont mergés dans le même ordre où l'un des deux arrive après l'autre, `main.js` contiendra deux fonctions quasi-identiques sous des noms différents (`handleSearchSelectCompany` et `handleLexiqueSelectCompany`) et potentiellement deux imports dupliqués de `getAllCompaniesEverPresented`/`normalizeRegionLabel`/`panelToggleHandle` — **ne pas tenter de les fusionner en un seul câblage pendant l'implémentation de CE plan** (l'autre worktree n'existe pas encore dans l'historique de celui-ci) ; une éventuelle factorisation (`navigateToCompany(company)` partagée) pourra être faite dans un futur petit correctif une fois les deux fusionnés sur `main`, si le duplicata s'avère gênant. Résoudre les conflits d'import triviaux (une seule ligne d'import par symbole) au moment du merge, garder les deux fonctions `handle*SelectCompany` distinctes.

## Contraintes globales

- Ne pas dupliquer `getAllCompaniesEverPresented` — l'importer depuis `selectors.js`.
- Ne pas toucher `presentationsModal.js`/`.css` — seulement s'en inspirer comme modèle.
- Ne pas toucher au plan bandeau ni au plan d'automatisation du portefeuille (parallèles, dans d'autres worktrees).

## Vérification

- `cd webapp && npx vitest run` doit rester vert, avec les nouveaux tests de `lexiqueModal.test.js`.
- `npm run build` doit rester propre.
- Aucune interaction Firestore nouvelle (lecture seule sur `db` déjà chargé) — vérification manuelle **visuelle** dans le navigateur :
  - Le bouton 📖 flottant ouvre la modale quasi instantanément (pas de délai perceptible).
  - La liste affiche bien toutes les entreprises réelles actuellement en base, triées par ordre alphabétique, groupées par lettre.
  - Si une entreprise a été présentée plusieurs fois (semaines dupliquées), elle n'apparaît qu'une seule fois dans le Lexique.
  - Taper dans la recherche filtre la liste en direct.
  - Cliquer sur une entreprise ferme la modale, change de semaine/région si nécessaire, ouvre le panneau, et fait défiler jusqu'à sa fiche avec une brève surbrillance.
  - Fermeture par ✕ et par clic hors de la modale fonctionnent toutes les deux.
