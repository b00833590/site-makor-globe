---
title: Synchronisation live Firestore — répercuter les modifications de l'ancien site sans rechargement
date: 2026-07-28
status: draft
---

## Contexte

Un des 3 plans demandés dans une seule mission utilisateur (scrollbar, redirection Éditer, sync live), exécutés en parallèle (3 worktrees). Une fois l'ancien site devenu l'interface d'édition officielle (plan parallèle "editer-redirect-old-site"), toute modification qu'un stagiaire y enregistre doit apparaître sur `makor-globe` **sans manipulation manuelle** de l'investisseur qui le consulte.

**Découverte clé** : les deux sites partagent déjà le même projet Firestore et le même format de document (voir le plan "editer-redirect-old-site" pour le détail complet de cette vérification). Il n'y a donc **aucune nouvelle source de données, base commune, API ou CMS à construire** — la synchronisation existe déjà au niveau du stockage. Le seul écart réel : `webapp/src/data/firestoreClient.js`'s `loadAllOnce()` (`getDocs`, un chargement ponctuel) n'est appelé **qu'une seule fois**, au démarrage (`main.js`'s `bootstrap()`) — une modification faite ailleurs après ce chargement initial reste invisible jusqu'à un rechargement manuel de la page.

**Solution retenue, confirmée avec l'utilisateur** : remplacer ce chargement ponctuel par une **écoute Firestore live** (`onSnapshot`) — solution native du SDK déjà utilisé par ce projet, zéro infrastructure nouvelle, se met à jour dès que Firestore confirme un changement côté serveur (que ce changement vienne de l'ancien site, ou en théorie de `webapp` lui-même si son mode édition redevenait un jour accessible).

**Approche délibérément conservatrice** : ne pas remplacer le chargement initial existant (`loadAllWithRetry(client.loadAllOnce)`, déjà éprouvé, avec sa logique de nouvelle tentative si la première réponse est vide) — l'écoute live est **ajoutée en plus**, après que ce chargement initial ait réussi et que l'UI soit dans un état stable. Ce découpage sépare clairement "atteindre un état de démarrage correct" (inchangé) de "rester à jour ensuite" (nouveau), ce qui limite le risque de régression sur un chemin de code déjà validé par de nombreuses phases précédentes.

## Décisions de conception

- **Nouvelle fonction exportée `subscribeToChanges(onChange)`** dans `firestoreClient.js`, retournée par `createFirestoreClient()` aux côtés des méthodes existantes — utilise `onSnapshot` sur la même collection `mkg_data` que `loadAllOnce`.
- **Extraction d'une fonction pure `docsToDb(docs)`**, partagée entre `loadAllOnce` et `subscribeToChanges`, pour éviter de dupliquer la boucle `try { JSON.parse(...) } catch { skip }` — première fonction de ce fichier réellement unit-testable indépendamment du SDK Firebase (les méthodes de `createFirestoreClient()` elles-mêmes n'ont jamais eu de test direct dans ce projet, `firestoreClient.test.js` ne teste que les fonctions pures `loadAllWithRetry`/`writeWithRetry`/`collectionForKey` — cette extraction suit exactement le même principe).
- **Pas de désabonnement explicite** : cette application est une SPA qui ne démonte jamais son propre arbre — `subscribeToChanges` retourne tout de même la fonction de désinscription que `onSnapshot` fournit nativement (bonne pratique, coût nul), mais rien dans ce plan n'a besoin de l'appeler.
- **Rattachement de l'écoute après le premier rendu réussi**, pas avant : si l'écoute était attachée avant que `activeWeekId`/`weekTimelineHandle` existent, un événement Firestore arrivant très tôt pourrait tenter d'appeler `weekTimelineHandle.setWeeks(...)` sur une valeur encore `null` — attacher l'écoute en toute fin du bloc `try` de `bootstrap()`, après le premier `renderPanelForCurrentSelection()`, élimine ce risque par construction plutôt que par une garde défensive ajoutée après coup.
- **Premier événement de l'écoute non filtré** : `onSnapshot` déclenche son callback immédiatement avec l'état courant (comme le ferait un `getDocs`), puis à nouveau à chaque changement ultérieur. Le premier appel réappliquera donc des données déjà chargées — un re-rendu redondant mais inoffensif (`renderPanelForCurrentSelection` est déjà appelée à répétition partout ailleurs dans ce fichier sans précaution particulière) ; ne pas complexifier le code pour l'éviter.
- **Gestion d'erreur minimale** : `onSnapshot` accepte un second callback d'erreur (perte de réseau, règles Firestore, etc.) — se contenter d'un `console.error`, cohérent avec le traitement d'erreur déjà silencieux ailleurs dans ce fichier (`bootstrap()`'s propre `catch` ne fait lui non plus qu'un `console.error` + un message d'indisponibilité).

## Tâche 1 — `webapp/src/data/firestoreClient.js` : extraire `docsToDb` et ajouter `subscribeToChanges`

Ajouter l'import d'`onSnapshot` à la ligne d'import existante de `firebase/firestore` (ligne 2) :

```js
import { getFirestore, collection, getDocs, getDoc, doc, setDoc, deleteDoc, serverTimestamp, writeBatch, query, where, documentId, onSnapshot } from 'firebase/firestore';
```

Ajouter, en dehors de `createFirestoreClient` (fonction pure, exportée pour être testée directement) :

```js
// Shared by loadAllOnce and subscribeToChanges — both turn a Firestore
// query snapshot into the same {key: parsedValue} shape.
export function docsToDb(docs) {
  const out = {};
  for (const d of docs) {
    try {
      out[d.id] = JSON.parse(d.data().value);
    } catch {
      // corrupt row — skip, matches production behavior
    }
  }
  return out;
}
```

Remplacer `loadAllOnce` (lignes 41-52) pour réutiliser `docsToDb` :

```js
  async function loadAllOnce() {
    const snapshot = await getDocs(collection(db, MAIN_COLLECTION));
    return docsToDb(snapshot.docs);
  }
```

Ajouter une nouvelle méthode, par exemple juste après `loadAllOnce` :

```js
  // Live-updates onChange(dbShape) every time anything in mkg_data changes,
  // starting with the current state (fires once immediately, then again on
  // every subsequent change). Lets a save made on the old site propagate to
  // an already-open makor-globe tab without a manual reload.
  function subscribeToChanges(onChange) {
    return onSnapshot(
      collection(db, MAIN_COLLECTION),
      snapshot => onChange(docsToDb(snapshot.docs)),
      error => console.error('Firestore live sync error', error),
    );
  }
```

Ajouter `subscribeToChanges` à l'objet retourné par `createFirestoreClient` (ligne 132) :

```js
  return { loadAllOnce, writeDoc, deleteDocByKey, deleteDocsBatch, writeDocsBatch, fetchKeysWithPrefix, fetchRawValue, applyBatch, subscribeToChanges };
```

### Tests — ajouter à `webapp/src/data/firestoreClient.test.js`

```js
import { docsToDb } from './firestoreClient.js';

describe('docsToDb', () => {
  it('parses each document\'s JSON value into the output object, keyed by document id', () => {
    const docs = [
      { id: 'mkg:week:a', data: () => ({ value: JSON.stringify({ id: 'a' }) }) },
      { id: 'mkg:week:b', data: () => ({ value: JSON.stringify({ id: 'b' }) }) },
    ];
    expect(docsToDb(docs)).toEqual({ 'mkg:week:a': { id: 'a' }, 'mkg:week:b': { id: 'b' } });
  });

  it('skips a document whose value is not valid JSON, without throwing', () => {
    const docs = [
      { id: 'mkg:week:a', data: () => ({ value: 'not json' }) },
      { id: 'mkg:week:b', data: () => ({ value: JSON.stringify({ id: 'b' }) }) },
    ];
    expect(docsToDb(docs)).toEqual({ 'mkg:week:b': { id: 'b' } });
  });

  it('returns an empty object for an empty document list', () => {
    expect(docsToDb([])).toEqual({});
  });
});
```

**Ne pas tenter de tester `subscribeToChanges` elle-même directement** — comme `loadAllOnce`/`writeDoc`/toutes les autres méthodes retournées par `createFirestoreClient()`, c'est un mince appel au SDK Firebase, jamais testé unitairement dans ce projet (confirmé en lisant `firestoreClient.test.js` avant d'écrire ce plan — seules les fonctions pures externes à `createFirestoreClient` y sont testées). La vérification passe par la vérification manuelle ci-dessous.

## Tâche 2 — `webapp/src/main.js` : brancher l'écoute après le chargement initial

Dans `bootstrap()` (`main.js:889-911`), ajouter l'appel à `client.subscribeToChanges(...)` en toute fin du bloc `try`, après le premier `renderPanelForCurrentSelection()` :

```js
async function bootstrap() {
  try {
    db = await loadAllWithRetry(() => client.loadAllOnce());

    const weeks = getWeeks(db);
    activeWeekId = weeks.length ? weeks[weeks.length - 1].id : null;

    weekTimelineHandle = initWeekTimeline({
      container: timelineEl,
      weeks,
      activeWeekId,
      onSelect: weekId => {
        activeWeekId = weekId;
        renderPanelForCurrentSelection();
      },
    });

    renderPanelForCurrentSelection();

    // Keeps this tab in sync with edits made elsewhere (the old site is now
    // the sole edit interface — see the "editer-redirect-old-site" plan)
    // without requiring a manual reload. Attached only after the app has
    // finished its first successful render, so an early snapshot can never
    // race ahead of activeWeekId/weekTimelineHandle being ready.
    client.subscribeToChanges(newDb => {
      db = newDb;
      if (weekTimelineHandle) weekTimelineHandle.setWeeks(getWeeks(db), activeWeekId);
      renderPanelForCurrentSelection();
    });
  } catch (error) {
    console.error('Failed to load Firestore data', error);
    panel.showRegion('Données indisponibles', { marketItems: [], newsItems: [] });
  }
}
```

**Points d'attention pour l'implémenteur, à vérifier explicitement pendant la revue/l'implémentation plutôt que supposés corrects** :
- Le Lexique (`getAllCompanies: () => getAllCompaniesEverPresented(db)`) et la recherche du bandeau relisent déjà `db` en direct à chaque appel (fermeture sur la variable, pas une copie figée) — un `db = newDb` dans le callback de l'écoute doit donc suffire à ce que ces deux fonctionnalités reflètent les nouvelles données dès leur prochaine ouverture, sans modification supplémentaire de `lexiqueModal.js`/`topBanner.js`. Confirmer que c'est bien le cas en testant manuellement (voir Vérification).
- La modale de graphique (`chartModal`) : vérifier qu'un remplacement de `db` pendant qu'un graphique est ouvert ne provoque pas d'erreur ni de comportement inattendu — `currentPortfolioEntriesForChart` est réaffecté à chaque `renderPanelForCurrentSelection()` (ligne 593), donc un rafraîchissement live pendant qu'un graphique est ouvert mettra à jour cette référence ; confirmer que la modale elle-même ne garde pas une référence obsolète qui casserait au clic suivant.
- `activeWeekId`/`activeRegionId` ne sont **jamais** modifiés par ce callback — seule la donnée sous-jacente change, la position de navigation de l'investisseur reste strictement la même pendant qu'il consulte le site, ce qui est le comportement voulu (pas de saut de région/semaine surprise pendant la lecture).
- `weekTimelineHandle.setWeeks(...)` appelle en interne `render()`, qui reconstruit tous les onglets de semaine et re-scroll automatiquement l'onglet actif en vue (`weekTimeline.js`'s `render()`) — cela se déclenchera donc sur **chaque** événement de l'écoute live, même pour une modification qui n'a rien à voir avec les semaines (ex. un simple champ d'entreprise édité). Si l'investisseur avait manuellement scrollé le bandeau de semaines pour regarder une semaine plus ancienne sans cliquer dessus, ce scroll sera silencieusement ramené sur l'onglet actif à la prochaine modification enregistrée ailleurs. C'est un effet de bord mineur mais réel du choix de tout re-rendre à chaque snapshot plutôt que de diffuser un correctif ciblé — acceptable pour cette première version (rare en pratique, la liste des semaines change peu), mais à noter explicitement dans le résumé final comme limitation connue plutôt que de la présenter comme un non-problème.

## Contraintes globales

- Ne pas toucher au chemin de chargement initial (`loadAllWithRetry`, sa logique de nouvelle tentative) — il reste la source de vérité pour le tout premier rendu.
- Ne pas introduire de dépendance npm supplémentaire (`onSnapshot` fait déjà partie de `firebase/firestore`, déjà une dépendance de ce projet).
- Ne pas modifier `webapp/src/panel/lexiqueModal.js` ni `webapp/src/timeline/topBanner.js` — les deux relisent déjà `db` en direct, aucun changement nécessaire de leur côté (à vérifier, pas juste supposer — voir Vérification).
- Ne pas toucher au plan de redirection "Éditer" ni au plan de scrollbar (parallèles, dans d'autres worktrees).

## Vérification

- `cd webapp && npx vitest run` doit rester vert, avec les nouveaux tests de `docsToDb`.
- `npm run build` doit rester propre.
- **Ce plan ne modifie aucune écriture Firestore** (lecture seule — un nouveau chemin de lecture live, zéro nouvelle écriture) — le protocole habituel de données de test factices n'est donc pas nécessaire pour la partie écriture. En revanche, la vérification manuelle doit prouver la propagation réelle en conditions live :
  1. Ouvrir `makor-globe` (local ou déployé) dans un onglet, en garder la page active.
  2. Dans un second onglet, ouvrir l'ancien site, entrer en mode édition, modifier un champ d'une entreprise réelle mais facilement réversible (ou une entreprise de test factice créée pour l'occasion, nommée clairement "TEST — À IGNORER"), enregistrer.
  3. Revenir sur le premier onglet **sans le recharger** — confirmer que la modification apparaît automatiquement dans un délai raisonnable (quelques secondes), sans action de l'investisseur.
  4. Ouvrir le Lexique et la recherche du bandeau sur le premier onglet après cette modification (toujours sans recharger) — confirmer qu'ils reflètent aussi la donnée à jour.
  5. Si une entreprise de test a été créée pour ce test, la supprimer depuis l'ancien site et confirmer que sa disparition se propage également, en direct, sur le premier onglet toujours ouvert.
  6. Confirmer qu'aucune saute de navigation ne se produit sur le premier onglet pendant ce test (région/semaine affichée reste celle que l'investisseur consultait, seule la donnée à l'intérieur se met à jour).
