---
title: Élargir le panneau latéral, renforcer sa séparation visuelle avec le globe, espacer flèche et bouton toggle
date: 2026-07-23
status: draft
---

## Contexte

Premier des quatre plans issus d'une demande étendue d'amélioration ergonomique/esthétique. Ce plan couvre les points 1, 2 et 4 de la demande — regroupés car ce sont des ajustements CSS/layout complémentaires sur la même zone de l'interface (le panneau latéral et sa frontière avec le globe), faible risque, aucune logique métier touchée. Les points 3 (refonte de l'export PDF), 5 (présentations en modale indépendante) et 6 (sélection par région sur le globe) font l'objet de plans séparés, implémentés en parallèle après le merge de celui-ci (périmètre volontairement limité — décision explicite de l'utilisateur sur le séquencement).

Aucune interaction Firestore — vérification manuelle **visuelle uniquement**.

## Décisions de conception

- **Largeur du panneau** : `--panel-width` passe de `340px` à `460px`. Vérifié dans `sidePanel.css`/`portfolioTable.css`/`companyList.css` : tout le contenu interne du panneau est déjà dimensionné en `%`/`100%`, sans largeur fixe en pixels — augmenter cette seule variable CSS suffit à redonner de l'air à l'ensemble (tableau de portefeuille à 6 colonnes, grille de stats entreprise, etc.) sans toucher à un seul composant. `#globe-container`, `.region-indicator` et `.panel-toggle-btn` (phase 26) réagissent déjà tous à `body.panel-open` via `var(--panel-width, 340px)` — changer la seule valeur définie dans `:root` suffit à tout répercuter automatiquement, aucun autre fichier n'a besoin d'être modifié pour la largeur elle-même. Les valeurs de repli `340px` dans ces `var(--panel-width, 340px)` sont mises à jour à `460px` par cohérence (elles ne sont jamais réellement utilisées puisque la variable est toujours définie, mais un repli qui ne correspond plus à la vraie valeur est trompeur à la lecture).
- **Séparation visuelle** : renforcement du `border-left` déjà existant sur `.side-panel` (opacité 0.3→0.5, épaisseur 1px→2px) + ajout d'un `box-shadow` porté vers la gauche, qui donne une vraie impression de profondeur/de plan superposé au-dessus du globe — cohérent avec les ombres déjà utilisées ailleurs dans ce projet (modales).
- **Espacement flèche/bouton toggle** : `.arrow-btn` (donc `.arrow-next`) et `.panel-toggle-btn` sont aujourd'hui tous les deux verticalement centrés sur `top: 50%` (confirmé en relisant `globe.css`/`panelToggle.css`) — ils sont donc adjacents voire quasi superposés selon l'état du panneau, exactement le problème signalé. Correctif : décaler `.panel-toggle-btn` à `top: calc(50% - 90px)` (toujours ancré au même bord droit ouvert/fermé, transform `translateY(-50%)` conservé pour son propre centrage autour de ce nouveau point) — calcul vérifié : ça laisse ~43px d'écart vertical net entre les deux boutons, largement suffisant pour éliminer tout risque de clic involontaire.

## Tâche 1 — `webapp/src/panel/sidePanel.css` : largeur + séparation visuelle

Remplacer les lignes 1-21 (bloc `:root` + `.side-panel`) par :

```css
:root {
  --panel-width: 460px;
}

.side-panel {
  position: fixed;
  top: 44px;
  right: 0;
  bottom: 0;
  width: var(--panel-width);
  background: rgba(15, 23, 48, 0.98);
  border-left: 2px solid rgba(224, 181, 61, 0.5);
  box-shadow: -12px 0 32px rgba(0, 0, 0, 0.45);
  padding: 16px;
  box-sizing: border-box;
  overflow-y: auto;
  color: #fff;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  z-index: 4;
  transform: translateX(100%);
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
```

(Seuls `background` (0.97→0.98), `border-left` (1px 0.3→2px 0.5) et le nouveau `box-shadow` changent ; le reste du bloc est inchangé.)

## Tâche 2 — `webapp/src/styles/globe.css` : mise à jour des valeurs de repli

Trois occurrences de `var(--panel-width, 340px)` (lignes 29, 49, et dans le calcul de `.arrow-next`) : remplacer `340px` par `460px` dans chacune. Aucun autre changement dans ce fichier — la largeur elle-même est déjà entièrement pilotée par la variable `:root` de la Tâche 1.

## Tâche 3 — `webapp/src/panel/panelToggle.css` : repositionnement vertical + repli mis à jour

Remplacer la ligne 3 (`top: 50%;`) par `top: calc(50% - 90px);`. Remplacer la ligne 25 (`right: var(--panel-width, 340px);`) par `right: var(--panel-width, 460px);`.

## Contraintes globales

- Aucun changement dans `webapp/src/main.js`, `panelToggle.js`, `weekTimeline.js` — purement CSS.
- Ne pas toucher aux points 3, 5, 6 de la demande (traités dans des plans séparés).
- Ne pas introduire de logique responsive/mobile — le projet reste desktop-only (décision déjà actée).

## Vérification

- `cd webapp && npx vitest run` doit rester vert, **sans changement du nombre de tests** (purement CSS, aucun nouveau test attendu ni existant à modifier).
- `npm run build` doit rester propre.
- Vérification manuelle visuelle dans le navigateur (aucune donnée Firestore concernée) :
  - Panneau ouvert : le tableau "Suivi de portefeuille" affiche ses 6 colonnes sans compression ni retour à la ligne forcé des en-têtes, aucune barre de défilement horizontale.
  - Une frontière nette et élégante (ligne dorée + ombre portée) est visible entre le panneau et le globe, à l'ouverture comme à la fermeture.
  - Le globe se redimensionne toujours correctement à la nouvelle largeur du panneau (ResizeObserver de la phase 26 inchangé, doit simplement suivre la nouvelle valeur de `--panel-width`).
  - La flèche de navigation région suivante et le bouton toggle du panneau sont désormais clairement espacés verticalement, sans risque de clic involontaire, dans les deux états (replié/ouvert).
  - Rotation/zoom du globe, clic sur un point, navigation semaine/région, export PDF : toujours fonctionnels.
