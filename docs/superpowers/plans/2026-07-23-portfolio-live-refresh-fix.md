---
title: Corriger le rafraîchissement live du portefeuille — ne redémarrer le cycle que si la région change vraiment
date: 2026-07-23
status: draft
---

## Contexte

Troisième des quatre plans. L'utilisateur signale que les performances du portefeuille ("DEPUIS"/"YTD") semblent figées. Cause racine identifiée en lisant `webapp/src/main.js`'s `renderPanelForCurrentSelection()` (lignes ~559-563) :

```js
  if (liveRefreshHandle) liveRefreshHandle.stop();
  liveRefreshHandle = startPortfolioLiveRefresh({
    getEntries: () => portfolioEntries,
    onOverrides: overrides => panel.updateLiveQuotes(overrides),
  });
```

`renderPanelForCurrentSelection()` est appelée à **chaque** re-rendu du panneau — changement de région, changement de semaine, activation/désactivation du mode édition, et **chaque** modification (chaque frappe validée dans un champ en édition). À chaque appel, le cycle de rafraîchissement live est arrêté puis relancé de zéro. Or `startPortfolioLiveRefresh` (`webapp/src/panel/portfolioLiveRefresh.js`) parcourt séquentiellement chaque ligne du portefeuille avec un délai de 200ms entre chaque (`fetchPortfolioLiveQuotes`, `webapp/src/data/portfolioLiveQuotes.js`) — pour ~20 lignes, un passage complet prend plusieurs secondes. Si le cycle est interrompu (`stop()`) avant d'avoir terminé sa boucle, `onOverrides` n'est **jamais appelé** pour ce passage (la boucle s'arrête via `shouldContinue()` sans jamais atteindre le `if (!stopped && ...) onOverrides(overrides)` final) — les données déjà récupérées sont silencieusement perdues. Toute activité UI suffisamment fréquente (navigation entre régions, ou pire, une session d'édition avec plusieurs modifications rapprochées) empêche donc le cycle de rafraîchissement de jamais aboutir.

C'est une aggravation d'un point déjà noté comme mineur en phase 6 ("switching weeks... unnecessarily restarts the refresh cycle") — sauf que le vrai déclencheur est bien plus large que le changement de semaine : n'importe quel re-rendu, y compris chaque edit.

## Décisions de conception

- Le rafraîchissement live ne doit redémarrer (et donc relancer une récupération immédiate) que lorsque **la région active change vraiment** — pas à chaque re-rendu. Les entrées de portefeuille ne sont pas liées à la semaine (déjà établi depuis la phase 12 : "portfolio entries, never week-scoped"), donc comparer uniquement `activeRegionId` avant/après suffit à détecter les seuls changements pertinents.
- Le cycle qui tourne déjà pour la région courante continue de tourner sans interruption pendant les autres types de re-rendu (édition, changement de semaine) — il picorera automatiquement les `portfolioEntries` à jour au prochain déclenchement des 5 minutes, puisque `getEntries` reste une fermeture qui lit la variable actuelle (pas figée au moment du démarrage).

## Tâche 1 — `webapp/src/main.js` : ne redémarrer que sur changement réel de région

Ajouter une nouvelle variable au niveau module, à côté des autres déclarations `let` existantes (ex. près de `let liveRefreshHandle = null;`) :

```js
let liveRefreshRegionId = null;
```

Remplacer le bloc existant :

```js
  if (liveRefreshHandle) liveRefreshHandle.stop();
  liveRefreshHandle = startPortfolioLiveRefresh({
    getEntries: () => portfolioEntries,
    onOverrides: overrides => panel.updateLiveQuotes(overrides),
  });
```

par :

```js
  if (activeRegionId !== liveRefreshRegionId) {
    liveRefreshRegionId = activeRegionId;
    if (liveRefreshHandle) liveRefreshHandle.stop();
    liveRefreshHandle = startPortfolioLiveRefresh({
      getEntries: () => portfolioEntries,
      onOverrides: overrides => panel.updateLiveQuotes(overrides),
    });
  }
```

Aucun autre changement dans ce fichier — `portfolioEntries` (calculée juste au-dessus dans la même fonction, à partir de `getPortfolioEntriesForRegion(db, activeRegionId)`) reste capturée par la fermeture `getEntries`, donc même quand le cycle n'est PAS redémarré, le prochain tick des 5 minutes utilisera automatiquement les entrées les plus récentes de la région alors active (grâce à la ré-évaluation de la fermeture à chaque appel de `renderPanelForCurrentSelection`, qui redéfinit une nouvelle fonction `getEntries` à chaque fois qu'un nouveau cycle démarre réellement — **note pour l'implémenteur** : ceci suppose que la fermeture `getEntries` du cycle EN COURS continue de référencer la variable `portfolioEntries` DÉCLARÉE DANS LA MÊME INVOCATION de `renderPanelForCurrentSelection` qui l'a créée, donc figée à cette invocation précise ; si un edit modifie une entrée de portefeuille SANS changer de région, le cycle en cours ne verra la modification qu'au prochain redémarrage réel — c'est un compromis accepté explicitement par ce plan, largement préférable au bug actuel où le cycle n'aboutit quasiment jamais).

## Contraintes globales

- Ne pas toucher à `portfolioLiveRefresh.js`, `portfolioLiveQuotes.js`, `sidePanel.js`'s `updateLiveQuotes` — le mécanisme de fond (délai de 200ms entre requêtes, intervalle de 5 minutes, protection contre l'écrasement d'un champ en cours d'édition) reste inchangé, seul le point de déclenchement du redémarrage change.
- Ne pas toucher au nettoyage interface, au graphique d'évolution, ni à l'export PDF (traités dans des plans séparés).

## Vérification

- `cd webapp && npx vitest run` doit rester vert — **aucun nouveau test attendu** : `renderPanelForCurrentSelection` est une fonction interne de `main.js` non exportée, jamais testée directement (convention déjà établie de ce projet), et le changement ne touche à aucune fonction pure exportée testable en isolation.
- `npm run build` doit rester propre.
- Vérification manuelle **avec attention particulière au timing**, contre l'API de cotations réelle (lecture seule, aucune écriture Firestore) :
  - Rester sur une région avec plusieurs lignes de portefeuille pendant au moins 5 minutes sans changer de région ni éditer : confirmer qu'au moins un cycle de rafraîchissement aboutit (valeurs DEPUIS/YTD qui se mettent à jour, visibles dans l'onglet réseau ou par un changement de valeur si le marché a bougé).
  - Passer en mode édition et modifier plusieurs champs à la suite (indices, entreprises, etc. — pas forcément le portefeuille) pendant plusieurs minutes : confirmer que malgré ces éditions fréquentes, le cycle de rafraîchissement du portefeuille n'est plus interrompu à chaque frappe (vérifiable en observant qu'il continue de tourner sans redémarrer sans cesse, par exemple via les logs réseau).
  - Changer de région : confirmer qu'un rafraîchissement immédiat se déclenche bien pour la nouvelle région (comportement `existant` préservé, pas dégradé).
  - Changer de semaine (même région) : confirmer que le cycle en cours n'est PAS interrompu (contrairement à avant).
