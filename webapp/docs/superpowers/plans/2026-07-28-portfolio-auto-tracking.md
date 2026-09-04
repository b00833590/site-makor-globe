---
title: Automatisation du suivi de portefeuille à la création d'une entreprise
date: 2026-07-28
status: draft
---

## Contexte

Un des 3 plans parallèles demandés par l'utilisateur (avec le bandeau supérieur et le Lexique). Objectif : quand une entreprise est ajoutée, créer automatiquement sa ligne de suivi de portefeuille correspondante, sans aucune saisie manuelle sauf le nom du stagiaire.

**Mécanisme de liaison existant à ne pas casser** (`webapp/src/panel/companyChart.js`'s `companyPresentationDateISO`) : le graphique 📈 d'une entreprise retrouve sa date de présentation en cherchant, parmi les entrées de portefeuille de la région active, celle dont `entry.entreprise === item.name` (égalité stricte de chaîne, aucune référence par id), puis parse son champ `date` au format strict `"DD/MM"` (`ddmmToISOThisYear`, `webapp/src/data/dateUtils.js`). Ce plan **s'appuie sur ce même mécanisme** (garde `entreprise`/`date` au même format) plutôt que de le remplacer, et **ajoute** une liaison explicite plus robuste (`portfolioEntryId` sur le document entreprise) pour garder les deux documents synchronisés dans le temps — voir Décisions ci-dessous.

**Contrainte technique confirmée avec l'utilisateur** : les semaines n'ont qu'un libellé libre (`"Semaine 20-24 JUILLET"`), aucune date structurée. La date de présentation auto-calculée utilise donc **le vendredi de la semaine calendaire réelle en cours au moment de la création** (date du jour, pas la semaine sélectionnée dans l'app) — approche choisie explicitement par l'utilisateur plutôt que de tenter de parser le libellé.

**Portée délibérément exclue** : la suppression d'une entreprise (`handleCompanyDelete`) **ne supprime pas** sa ligne de portefeuille liée — le suivi de performance est un historique qui a de la valeur même si la fiche de présentation est retirée plus tard, et l'utilisateur n'a pas demandé cette cascade. Ne pas l'ajouter.

## Décisions de conception

- **Nouveau champ interne `portfolioEntryId`** sur le document entreprise (`mkg:content:entreprises:{weekId}:{id}`), jamais affiché dans l'UI, utilisé uniquement pour garder `entreprise`/`symbol` synchronisés sur le document de portefeuille lié quand l'entreprise est renommée ou que son ticker change.
- **Création atomique** : `handleCompanyAdd` écrit désormais **deux documents en une seule transaction batch** (entreprise + ligne de portefeuille), avec rollback conjoint des deux si l'écriture échoue — même mécanique que `handleWeekDuplicate` (`client.writeDocsBatch`, déjà utilisé dans ce fichier).
- **Réutilisation automatique des données déjà disponibles** (demande explicite de l'utilisateur) : à la création, `entreprise` = `item.name` ("Nouvelle entreprise", identique au placeholder de la carte), `symbol` = `item.yahooSymbol` (vide à la création, comme le champ entreprise lui-même) — ces deux champs sont initialement des placeholders vides/génériques comme aujourd'hui, mais **restent synchronisés automatiquement** dès que l'admin les renseigne en éditant la carte entreprise (voir Tâche 2), sans jamais avoir à les ressaisir dans le tableau de portefeuille.
- **`regionId`** de la nouvelle ligne = `PORTFOLIO_REGION_BY_GLOBE_REGION[activeRegionId]`, exactement comme `handlePortfolioAdd` le fait déjà pour un ajout manuel — cohérent avec l'existant.
- **`stagiaire`** reste vide, seul champ à saisie manuelle (déjà le cas dans le tableau de portefeuille existant, aucun changement nécessaire là).
- **`depuis`/`ytd`** initialisés à `0`, comme tout nouvel ajout de portefeuille aujourd'hui — leur calcul réel reste géré par le rafraîchissement live existant (phase 6/33), hors périmètre de ce plan.
- **Duplication de semaine** : `handleWeekDuplicate` copie aujourd'hui les entreprises verbatim (`{ ...item, id: newId }` via `duplicateContentEntries`). Si `portfolioEntryId` était copié tel quel, la nouvelle copie (dans la semaine dupliquée) pointerait vers la **même** ligne de portefeuille que l'original — la renommer resynchroniserait alors à tort le document de portefeuille de l'original. Le portefeuille n'étant pas scopé par semaine (une position existe déjà, elle n'a pas besoin d'être recréée), la copie doit simplement **perdre la référence** `portfolioEntryId` (pas d'auto-création d'une deuxième ligne de portefeuille pour le duplicata non plus — hors périmètre, la duplication de semaine reste un plan déjà livré et fermé).

## Tâche 1 — `webapp/src/data/dateUtils.js` : vendredi de la semaine calendaire

Ajouter, à la suite de `ddmmToISOThisYear` :

```js
// Ancre sur le lundi de la semaine ISO contenant `now` (quel que soit le jour
// de la semaine, y compris samedi/dimanche), puis ajoute 4 jours pour obtenir
// le vendredi de cette même semaine — garantit un résultat correct peu importe
// le jour de la semaine où l'entreprise est ajoutée.
export function fridayOfCurrentWeekDDMM(now = new Date()) {
  const day = now.getDay(); // 0 = dimanche ... 6 = samedi
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  const dd = String(friday.getDate()).padStart(2, '0');
  const mm = String(friday.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}
```

### Tests — ajouter à `webapp/src/data/dateUtils.test.js`

```js
describe('fridayOfCurrentWeekDDMM', () => {
  it('returns the same Friday when "now" already is that Friday', () => {
    expect(fridayOfCurrentWeekDDMM(new Date('2026-07-24T10:00:00'))).toBe('24/07'); // a Friday
  });

  it('returns that week\'s Friday when "now" is a Monday', () => {
    expect(fridayOfCurrentWeekDDMM(new Date('2026-07-20T10:00:00'))).toBe('24/07');
  });

  it('returns that week\'s Friday when "now" is a Wednesday', () => {
    expect(fridayOfCurrentWeekDDMM(new Date('2026-07-22T10:00:00'))).toBe('24/07');
  });

  it('returns the PAST Friday of the same ISO week when "now" is a Saturday', () => {
    expect(fridayOfCurrentWeekDDMM(new Date('2026-07-25T10:00:00'))).toBe('24/07');
  });

  it('returns the PAST Friday of the same ISO week when "now" is a Sunday', () => {
    expect(fridayOfCurrentWeekDDMM(new Date('2026-07-26T10:00:00'))).toBe('24/07');
  });

  it('pads single-digit day and month', () => {
    expect(fridayOfCurrentWeekDDMM(new Date('2026-08-03T10:00:00'))).toBe('07/08'); // Monday 3 Aug -> Friday 7 Aug
  });

  it('handles a week whose Friday falls in the previous month from "now" (now = Saturday 1 Aug, that week\'s Friday = 31 July)', () => {
    expect(fridayOfCurrentWeekDDMM(new Date('2026-08-01T10:00:00'))).toBe('31/07');
  });
});
```

**Note pour l'implémenteur** : ces dates ont été vérifiées (`new Date(...).getDay()`) au moment de l'écriture de ce plan — 24/07/2026 est bien un vendredi, 20/07 un lundi, 22/07 un mercredi, 25/07 un samedi, 26/07 un dimanche, 03/08 un lundi, 01/08 un samedi. Revérifier quand même avant de committer si le comportement observé diffère, l'important étant la logique de chaque cas (jour exact d'un vendredi / lundi / mercredi / samedi / dimanche / à cheval sur un changement de mois), pas les dates littérales choisies ici.

## Tâche 2 — `webapp/src/main.js` : création atomique + synchronisation

Ajouter `fridayOfCurrentWeekDDMM` à l'import existant de `dateUtils.js` — **vérifier d'abord si ce fichier importe déjà quelque chose de `dateUtils.js`** (a priori non, `ddmmToISOThisYear` est actuellement seulement importé par `companyChart.js`) ; ajouter la ligne d'import si absente :

```js
import { fridayOfCurrentWeekDDMM } from './data/dateUtils.js';
```

Remplacer `handleCompanyAdd` :

```js
function handleCompanyAdd() {
  const id = generateId();
  const key = `mkg:content:entreprises:${activeWeekId}:${id}`;
  const portfolioId = generateId();
  const portfolioKey = `mkg:portfolio:${portfolioId}`;

  const newItem = {
    id,
    portfolioEntryId: portfolioId,
    region: GROUP_LABEL_BY_REGION[activeRegionId] || '',
    name: 'Nouvelle entreprise',
    yahooSymbol: '',
    flag: '',
    country: '',
    marketCap: '',
    salesGrowth: '',
    evEbitda: '',
    coursActuel: '',
    targetPrice: '',
    bullets: [],
  };
  const newPortfolioEntry = {
    id: portfolioId,
    date: fridayOfCurrentWeekDDMM(),
    entreprise: newItem.name,
    stagiaire: '',
    symbol: '',
    regionId: PORTFOLIO_REGION_BY_GLOBE_REGION[activeRegionId] || '',
    depuis: 0,
    ytd: 0,
  };

  db[key] = newItem;
  db[portfolioKey] = newPortfolioEntry;
  renderPanelForCurrentSelection();

  client.writeDocsBatch([[key, newItem], [portfolioKey, newPortfolioEntry]]).catch(() => {
    delete db[key];
    delete db[portfolioKey];
    renderPanelForCurrentSelection();
    showToast(document.getElementById('admin-toast'), "⚠️ Ajout en ligne échoué — la nouvelle entreprise et sa ligne de portefeuille ont été retirées");
  });
}
```

Remplacer `handleCompanyEdit` :

```js
function handleCompanyEdit(item, patch) {
  const key = companyItemKey(item);
  setItemLocal(key, { ...db[key], ...patch }, '⚠️ Sauvegarde en ligne échouée — la modification a été annulée');

  // Keep the linked portfolio row's entreprise/symbol in sync — without this,
  // renaming a company after creation (the normal workflow: add a blank card,
  // then rename it) would silently break companyChart.js's entry.entreprise
  // === item.name lookup, since the portfolio row would still hold the old
  // placeholder name forever.
  if (item.portfolioEntryId && ('name' in patch || 'yahooSymbol' in patch)) {
    const linkedEntry = db[`mkg:portfolio:${item.portfolioEntryId}`];
    if (linkedEntry) {
      const portfolioPatch = {};
      if ('name' in patch) portfolioPatch.entreprise = patch.name;
      if ('yahooSymbol' in patch) portfolioPatch.symbol = patch.yahooSymbol;
      handlePortfolioEdit(linkedEntry, portfolioPatch);
    }
  }
}
```

**Ne pas modifier** `handleCompanyDelete`, `handleCompanyColorChange`, `handleCompanyBulletAdd/Edit/Delete` — ils appellent déjà `handleCompanyEdit`/`companyItemKey` sans jamais passer `name`/`yahooSymbol` dans leur patch, donc la nouvelle logique de synchronisation ne se déclenche jamais pour eux (aucun changement de comportement).

## Tâche 3 — `webapp/src/main.js` : ne pas dupliquer la liaison lors d'une copie de semaine

Dans `handleWeekDuplicate`, remplacer la ligne :

```js
    ...duplicateContentEntries(getAllCompanyItemsForWeek(db, sourceWeekId), 'mkg:content:entreprises:', newWeekId),
```

par :

```js
    ...duplicateContentEntries(
      getAllCompanyItemsForWeek(db, sourceWeekId).map(({ portfolioEntryId, ...rest }) => rest),
      'mkg:content:entreprises:', newWeekId,
    ),
```

Ceci retire `portfolioEntryId` de chaque copie **avant** qu'elle passe par `duplicateContentEntries` (qui reste, lui, totalement inchangé et générique pour les 3 autres types de contenu dupliqués sur la même ligne — marché, news, IA & Fintech — aucun d'eux n'a jamais eu ce champ, donc ce changement ne les affecte pas).

## Contraintes globales

- Ne pas toucher `companyChart.js`/`companyPresentationDateISO`/`ddmmToISOThisYear` — le mécanisme de liaison par nom reste la source de vérité pour le graphique, ce plan ne fait qu'ajouter une synchronisation en amont pour que ce mécanisme continue de fonctionner après un renommage.
- Ne pas ajouter de suppression en cascade sur `handleCompanyDelete` (voir Contexte, portée exclue).
- Ne pas modifier `handlePortfolioAdd`/`handlePortfolioDelete`/`portfolioTable.js` — le tableau de portefeuille lui-même reste inchangé, une ligne auto-créée s'y comporte exactement comme une ligne ajoutée manuellement (éditable, supprimable indépendamment).
- Ne pas toucher au plan bandeau ni au plan Lexique (parallèles, dans d'autres worktrees).

## Vérification

- `cd webapp && npx vitest run` doit rester vert, avec les nouveaux tests de `dateUtils.test.js`. **Aucun nouveau test direct attendu** pour `handleCompanyAdd`/`handleCompanyEdit`/`handleWeekDuplicate` dans `main.js` — convention déjà établie de ce projet (`main.js`'s handlers ne sont jamais exportés/testés unitairement), vérification via la passe manuelle Firestore ci-dessous à la place.
- `npm run build` doit rester propre.
- **Ce plan écrit dans Firestore de production** — protocole de vérification obligatoire, plus approfondi que d'habitude car deux documents liés sont en jeu :
  1. En mode édition, cliquer "+ Ajouter une entreprise" sur une semaine/région de test. Vérifier dans le tableau de portefeuille de la **même région** qu'une nouvelle ligne "Nouvelle entreprise" est apparue avec une date au format `DD/MM` correspondant au vendredi de la semaine calendaire réelle en cours, `depuis`/`ytd` à `0%`, stagiaire vide.
  2. Renommer l'entreprise (ex. "TEST — À IGNORER") et renseigner un ticker Yahoo Finance factice (ex. "TEST.PA") sur la carte. Vérifier que la ligne de portefeuille correspondante se met à jour **automatiquement** (nom ET symbole) sans avoir touché au tableau de portefeuille directement.
  3. Cliquer sur le graphique 📈 de cette entreprise de test et confirmer qu'il s'ouvre sans erreur (preuve que la liaison par nom `entry.entreprise === item.name` fonctionne toujours après renommage — c'est le scénario que ce plan doit spécifiquement protéger).
  4. Renseigner manuellement le nom du stagiaire dans la ligne de portefeuille — confirmer que ça fonctionne comme avant (seul champ resté manuel).
  5. Dupliquer la semaine de test (bouton 📋 du panneau admin semaine) et vérifier que la copie de l'entreprise de test dans la nouvelle semaine, une fois renommée, **ne modifie pas** la ligne de portefeuille de l'original (preuve que `portfolioEntryId` n'a pas été dupliqué à tort).
  6. Nettoyer : supprimer l'entreprise de test (les deux occurrences, semaine originale + semaine dupliquée) et sa ligne de portefeuille, supprimer la semaine dupliquée créée pour le test, confirmer après un rechargement complet que tout a bien disparu et que les entreprises/positions réelles n'ont pas été affectées.
