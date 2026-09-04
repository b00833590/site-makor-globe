---
title: Le bouton "Éditer" redirige vers l'ancien site (interface d'édition officielle)
date: 2026-07-28
status: draft
---

## Contexte

Un des 3 plans demandés dans une seule mission utilisateur (scrollbar, redirection Éditer, sync live), exécutés en parallèle (3 worktrees). L'utilisateur souhaite faire de l'ancien site (`https://makor-morning-news.vercel.app/`, code source à la racine `index.html`) l'interface d'édition officielle, familière aux stagiaires, et que le bouton "Éditer" du nouveau site (`makor-globe.vercel.app`, `webapp/`) y redirige directement — dans un **nouvel onglet** (décision explicite de l'utilisateur) — vers la page correspondant à ce que l'investisseur était en train de consulter.

**Découverte clé faite avant d'écrire ce plan, qui simplifie radicalement la portée** : les deux sites pointent déjà vers le **même projet Firestore** (`makor-morning-news`, même `apiKey`/`projectId`, confirmé en comparant `index.html:591-594` et `webapp/src/data/firestoreClient.js:4-11`) et utilisent le **même format de clé de document** (`mkg:content:entreprises:{weekId}:{id}`, confirmé par de nombreuses phases précédentes de ce projet). Mieux : l'ancien site a **déjà** une fonction de navigation-et-surlignage prête à l'emploi, `goToSearchResult(weekId, catId, key)` (`index.html:2399-2415`), utilisée aujourd'hui par sa recherche globale interne — elle fixe `state.activeWeek`/`state.activeCat`, appelle `refreshData()`, puis retrouve l'élément DOM portant `data-key="${key}"` (déjà posé sur le nom de chaque entreprise, `index.html:1597`), le scroll dans la vue et le surligne brièvement. **Ce plan n'a donc besoin d'ajouter QUASIMENT AUCUNE nouvelle logique de navigation côté ancien site — juste de brancher cette fonction existante sur les paramètres d'URL.**

**Portée du lien profond** : `webapp` affiche toutes les catégories (indices/news/entreprises/portefeuille) ensemble par région ; l'ancien site affiche une seule catégorie à la fois (onglets Indices/News/Entreprises/IA & Fintech) sans filtre de région (toutes les régions mélangées dans la liste, badge de région sur chaque carte). Il n'y a donc pas de correspondance 1:1 parfaite — le lien profond cible `cat=entreprises` par défaut (le cas d'usage explicitement décrit par l'utilisateur : "1. consulte une entreprise") et pointe si possible vers l'entreprise précise consultée en dernier (recherche du bandeau ou Lexique), sinon simplement vers la bonne semaine.

**Portée volontairement exclue** : ne pas auto-déverrouiller le mode édition de l'ancien site via l'URL — le stagiaire tape toujours son mot de passe lui-même, exactement comme aujourd'hui ("les stagiaires continuent à travailler... sans devoir apprendre une nouvelle méthode"). Le lien profond amène seulement à la bonne semaine/catégorie/carte en lecture.

## Décisions de conception

- **Nouvel onglet** : `window.open(url, '_blank', 'noopener')` — même convention que l'ouverture des présentations PDF déjà existante dans ce projet.
- **URL de l'ancien site codée en dur** dans `webapp/src/main.js`, comme le sont déjà toutes les URLs d'assets de ce projet (pas de variable d'environnement dans ce projet, confirmé par la mémoire du projet).
- **Paramètres de l'URL** : `?week=<activeWeekId>&cat=entreprises&key=<clé Firestore de l'entreprise si connue>`. `key` est **exactement** la clé Firestore de l'entreprise (`mkg:content:entreprises:{weekId}:{id}`) — strictement identique des deux côtés, aucune table de correspondance à maintenir.
- **Traçage de la "dernière entreprise consultée"** : une nouvelle variable module-privée `lastFocusedCompanyKey` dans `main.js`, posée par `handleSearchSelectCompany`/`handleLexiqueSelectCompany` (les deux seuls endroits qui amènent déjà l'utilisateur jusqu'à une carte entreprise précise). Invalidée **sans code de nettoyage dédié** : au moment de construire l'URL de redirection, on ne l'utilise que si son composant `weekId` correspond encore à `activeWeekId` courant — si l'utilisateur a navigué ailleurs entre-temps (changement de semaine via le bandeau, flèches de région), la clé devient automatiquement obsolète et est ignorée sans qu'il faille la réinitialiser explicitement à chaque point de navigation.
- **Bouton "Éditer" simplifié, plus de bascule à deux états** : aujourd'hui `editToggleBtn` a un comportement conditionnel (`passwordModal.open()` si pas encore en édition, sortie de l'édition sinon). Comme il n'existe **aucun autre point d'entrée** dans l'UI pour entrer en mode édition dans `webapp`, ce bouton devient la seule chose qui déclenche l'ouverture de la modale de mot de passe — en la retirant, le mode édition de `webapp` devient **inatteignable depuis l'interface**, sans que son code sous-jacent (toute la logique `handleXxxEdit/Add/Delete`, `isEditing`, `sessionSnapshot`, "Tout annuler"...) ne soit touché ni supprimé. C'est un choix délibérément conservateur : rien n'est cassé ni supprimé, seul le point d'entrée change de comportement — réversible d'un coup si la décision produit change plus tard. **Ne pas faire de nettoyage de code mort dans ce plan** — hors périmètre, à traiter séparément si l'utilisateur le demande explicitement un jour.

## Tâche 1 — `webapp/src/main.js` : router "Éditer" vers l'ancien site

Ajouter une constante en haut du fichier, à côté des autres constantes de module (ex. près de `GROUP_LABEL_BY_REGION`) :

```js
const OLD_SITE_URL = 'https://makor-morning-news.vercel.app/';
```

Ajouter une variable de suivi, au même endroit que les autres variables d'état de module (`activeWeekId`, `activeRegionId`, etc.) :

```js
let lastFocusedCompanyKey = null;
```

Dans `handleSearchSelectCompany` et `handleLexiqueSelectCompany` (`main.js:634` et `main.js:679`), ajouter en toute première ligne du corps de fonction (avant `activeWeekId = company.weekId;`) :

```js
  lastFocusedCompanyKey = `mkg:content:entreprises:${company.weekId}:${company.id}`;
```

Remplacer le bloc `editToggleBtn.addEventListener('click', ...)` (`main.js:746-757`) par :

```js
editToggleBtn.addEventListener('click', () => {
  const params = new URLSearchParams({ week: activeWeekId || '', cat: 'entreprises' });
  // mkg:content:entreprises:{weekId}:{id} splits into 5 parts on ':' —
  // ['mkg', 'content', 'entreprises', weekId, id] — weekId is index 3.
  // generateId() output is base-36, never contains ':', so this split is
  // unambiguous (same assumption already relied on elsewhere in this
  // project, see phase 12 of the project memory).
  const focusedWeekId = (lastFocusedCompanyKey || '').split(':')[3];
  if (lastFocusedCompanyKey && focusedWeekId === activeWeekId) {
    params.set('key', lastFocusedCompanyKey);
  }
  window.open(`${OLD_SITE_URL}?${params.toString()}`, '_blank', 'noopener');
});
```

**Ne pas supprimer** `passwordModal`, `initPasswordModal`, `undoAllBtn`, ni aucune des fonctions `handleXxxEdit/Add/Delete`/`handleUndoAll` — elles restent présentes, inchangées, simplement plus jamais invoquées depuis l'UI (voir Décisions ci-dessus).

**Point d'attention pour l'implémenteur** : vérifier l'indexation `[3]` avec un test unitaire simple (ex. `lastFocusedCompanyKey = 'mkg:content:entreprises:w1:c1'` doit donner `focusedWeekId === 'w1'`) plutôt que de faire confiance à l'arithmétique d'index posée ici sans vérification — c'est exactement le genre d'erreur d'un cran qu'une auto-relecture peut manquer.

## Tâche 2 — `index.html` (racine) : lire les paramètres d'URL au démarrage

**Zone sensible** : ce fichier contient un travail en cours non committé (panneau "🔍 Audit des données", lignes ~4092 à la fin du fichier, après la balise `</script>` de fermeture) — **ne pas y toucher, ne rien committer qui l'efface**. Le changement de cette tâche se place uniquement à l'intérieur du bloc `<script>` principal, juste après l'appel `refreshData();` existant dans `init()` (ligne 4084), donc largement avant la zone sensible.

Modifier la fin de la fonction `init()` (`index.html:4076-4088`) — remplacer :

```js
  state.weeks = loadWeeks();
  const marchWeek = state.weeks.find(w=>w.id===SEED_WEEK_ID);
  const lastWeek = localStorage.getItem('mkg:lastActiveWeek');
  const lastCat = localStorage.getItem('mkg:lastActiveCat');
  state.activeWeek = (lastWeek && state.weeks.some(w=>w.id===lastWeek))
    ? lastWeek
    : (marchWeek ? marchWeek.id : state.weeks[state.weeks.length-1].id);
  if(lastCat && CATEGORIES.some(c=>c.id===lastCat)) state.activeCat = lastCat;
  refreshData(); // site is usable now — PDF chunk seeding continues quietly below
  initGlobalSearch();
```

par :

```js
  state.weeks = loadWeeks();
  const marchWeek = state.weeks.find(w=>w.id===SEED_WEEK_ID);
  const lastWeek = localStorage.getItem('mkg:lastActiveWeek');
  const lastCat = localStorage.getItem('mkg:lastActiveCat');
  state.activeWeek = (lastWeek && state.weeks.some(w=>w.id===lastWeek))
    ? lastWeek
    : (marchWeek ? marchWeek.id : state.weeks[state.weeks.length-1].id);
  if(lastCat && CATEGORIES.some(c=>c.id===lastCat)) state.activeCat = lastCat;
  refreshData(); // site is usable now — PDF chunk seeding continues quietly below
  initGlobalSearch();

  // Deep link from makor-globe's "Éditer" button (?week=...&cat=...&key=...).
  // Deliberately does NOT touch localStorage — a one-off deep link must not
  // permanently override the intern's own last-visited week/category for
  // their next normal visit to this site.
  applyDeepLinkFromUrl();
```

Ajouter une nouvelle fonction, juste avant `init()` (donc toujours largement avant la zone "Audit des données") :

```js
function applyDeepLinkFromUrl(){
  const params = new URLSearchParams(location.search);
  const weekId = params.get('week');
  const catId = params.get('cat');
  const key = params.get('key');
  if(!weekId || !state.weeks.some(w=>w.id===weekId)) return;
  if(!catId || !CATEGORIES.some(c=>c.id===catId)) return;
  goToSearchResult(weekId, catId, key || '');
}
```

**Point d'attention pour l'implémenteur** : `goToSearchResult` (`index.html:2399-2415`) appelle en interne `document.querySelector(\`[data-key="${CSS.escape(key)}"]\`)` pour trouver la carte à surligner — si `key` est une chaîne vide (cas "juste la semaine, pas d'entreprise précise"), ce sélecteur ne matchera simplement rien et la fonction se contente de naviguer sans surligner personne, ce qui est le comportement voulu ici. Vérifier que `goToSearchResult` ne lève pas d'erreur avec une chaîne vide avant de considérer cette tâche terminée (lecture du code suggère que non, mais à confirmer en testant réellement dans le navigateur — ce fichier n'a pas de suite de tests automatisés).

## Contraintes globales

- Ne toucher à aucune autre partie de `index.html`, en particulier pas au bloc "Audit des données" (après la balise `</script>` finale) — ne pas le committer, ne pas le perdre, ne pas le déplacer.
- Ne pas modifier le comportement de l'ancien site quand aucun paramètre d'URL n'est présent (le cas de 100% des usages actuels des stagiaires) — vérifié par construction : `applyDeepLinkFromUrl()` retourne immédiatement sans rien faire si `week`/`cat` sont absents ou invalides.
- Ne pas auto-déverrouiller le mode édition de l'ancien site depuis l'URL (voir Contexte, portée exclue).
- Ne pas supprimer le code d'édition existant de `webapp` (voir Décisions).
- Ne pas modifier `webapp/index.html` (le libellé et l'apparence du bouton "Éditer" restent inchangés — seul son comportement au clic change dans `main.js`).

## Vérification

- `cd webapp && npx vitest run` doit rester vert. Ajouter un test pour la construction de l'URL de redirection si `handleSearchSelectCompany`/le clic sur le bouton sont testables facilement dans le style déjà établi de `main.js` (ce fichier n'a historiquement jamais eu ses handlers exportés/testés unitairement — si ce gap se confirme encore ici, ne pas forcer un export artificiel juste pour tester ce point ; s'appuyer sur la vérification manuelle ci-dessous à la place, comme le reste du fichier).
- `npm run build` doit rester propre côté `webapp`.
- **`index.html` n'a pas de suite de tests automatisés** (fichier historique, jamais eu de tests) — vérification exclusivement manuelle dans le navigateur :
  1. Sur `makor-globe` (ou son équivalent local `localhost:xxxx`), ouvrir une entreprise réelle via la recherche du bandeau ou le Lexique, puis cliquer "Éditer" — un nouvel onglet doit s'ouvrir vers l'ancien site (local ou déployé selon l'environnement de test) sur la bonne semaine, catégorie "Entreprises", avec la carte de cette entreprise scrollée en vue et brièvement surlignée.
  2. Changer de semaine sur `makor-globe` sans reconsulter d'entreprise précise (juste cliquer un autre onglet du bandeau), puis cliquer "Éditer" — le nouvel onglet doit atterrir sur la bonne semaine, catégorie "Entreprises", **sans** surlignage particulier (aucune entreprise "récente" valide pour cette semaine).
  3. Ouvrir l'ancien site directement sans aucun paramètre d'URL (`index.html` seul) — confirmer que le comportement est strictement identique à avant ce plan (dernière semaine/catégorie visitée restaurée depuis `localStorage`, comme aujourd'hui).
  4. Confirmer que le panneau "🔍 Audit des données" de l'ancien site est toujours présent et fonctionnel après ces changements (zone sensible non touchée, à vérifier tout de même visuellement).
  5. Sur `makor-globe`, confirmer qu'aucun autre bouton/lien n'ouvre plus jamais la modale de mot de passe interne (le mode édition de `webapp` est désormais inatteignable depuis l'UI, comme voulu) et qu'aucune autre fonctionnalité du site n'est cassée par ce changement (navigation région/semaine, recherche, Lexique, export PDF, tout doit continuer à fonctionner normalement).
