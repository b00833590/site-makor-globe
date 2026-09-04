---
title: Identité visuelle Makor (palette violette/claire) + scrollbars unifiées + fiches entreprises
date: 2026-07-28
status: draft
---

## Contexte

Mission utilisateur en 3 volets, tous liés au même système visuel : palette de couleurs, uniformisation des scrollbars, présentation des fiches entreprises. Contrairement aux missions précédentes de ce projet, ce n'est **pas 3 plans parallèles indépendants** — les 3 volets partagent les mêmes tokens de couleur (la scrollbar doit utiliser le nouvel accent violet, les fiches entreprises doivent utiliser le nouveau fond clair) — c'est **un seul plan cohérent**, exécuté en 3 tâches séquentielles dans un seul worktree.

**Référence couleur** : `https://makor-group.com/` inspecté directement (navigation + lecture des styles calculés, pas de capture d'écran). Couleurs réelles extraites :
- Dégradé du hero : `rgb(39, 30, 72)` (`#271e48`) → `rgb(63, 48, 115)` (`#3f3073`)
- Texte de titres/chiffres-clés : `rgb(34, 34, 70)` (`#222246`)
- Section claire secondaire : `rgb(214, 223, 228)` (`#d6dfe4`)
- Fond principal : blanc pur
- Polices : "Cormorant Garamond" (serif, titres) + "Work Sans" (sans-serif, corps) — **non repris ici**, `webapp/` a ses propres polices système déjà en place (`Segoe UI`/`system-ui`), changer de police n'a pas été demandé et sort du périmètre de cette mission (couleurs uniquement).

**Référence fiche entreprise** : `assets/exemple cadre entreprise ancien site.png`, et le CSS réel correspondant retrouvé dans la racine `index.html` (`.bullet-row`, `.bullet-triangle`, `.bullet-text`, lignes ~325-330) :
```css
.bullet-row{display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px dashed var(--line);}
.bullet-row:last-of-type{border-bottom:none;}
.bullet-triangle{color:var(--gold);font-size:11px;line-height:1.7;flex-shrink:0;margin-top:2px;}
.bullet-text{flex:1;font-size:13.5px;line-height:1.7;color:#3a4051;white-space:pre-line;}
```
**Point vérifié explicitement avant d'écrire ce plan** : l'effet "première phrase en gras" visible sur la capture d'écran n'est **pas** un mécanisme du code (`.bullet-text` a un style uniforme, aucun CSS ne scinde le texte) — c'est très probablement du texte saisi manuellement par les stagiaires. Ce plan reproduit donc uniquement ce qui est réellement dans le CSS : flèche `▶`, séparateur pointillé entre les points clés, interligne généreux (`line-height:1.7`) — **sans tenter de scinder le texte des bullets en gras+corps**, ce qui reviendrait à interpréter/modifier le contenu, explicitement exclu par la contrainte de l'utilisateur.

**Clarification de périmètre importante, déduite du texte de la mission avant d'écrire ce plan** : l'utilisateur cite explicitement "bandeau supérieur", "panneau latéral droit", et "boutons et éléments interactifs **si cela améliore la cohérence**" — le fond du globe 3D (étoiles, `html, body { background: var(--navy) }`) n'est **pas** mentionné et doit rester sombre, sinon la scène 3D (globe + étoiles) perdrait son sens visuel. Ce plan distingue donc deux groupes de composants :
- **Groupe A — reste en "verre sombre" flottant au-dessus du globe**, seule la teinte d'accent passe de doré à un lavande clair (conserve le contraste clair-sur-sombre) : `.region-indicator`, `.arrow-btn`, `.edit-toggle-btn`, `.undo-all-btn`, `.export-pdf-btn` (tous dans `globe.css`).
- **Groupe B — devient une vraie surface claire** (fond blanc/quasi-blanc, texte sombre, accent violet) : bandeau supérieur, panneau latéral et tout son contenu (indices/news/entreprises/portefeuille), toutes les modales (Lexique, Présentations, mot de passe, upload, sélecteur de couleur), le panneau d'administration de semaine, le toast. Ce groupe est plus large que la demande littérale ("bandeau" + "panneau") mais nécessaire pour respecter la contrainte explicite "Conserve une cohérence graphique sur l'ensemble de l'application" — une modale restée sombre à côté d'un bandeau devenu clair serait visuellement incohérente.

## Décisions de conception — palette

**Nouveaux tokens ajoutés à `:root` dans `webapp/src/styles/globe.css`** (les 4 variables existantes `--navy`/`--navy2`/`--gold`/`--gold-light` sont conservées par leur nom pour limiter le risque de renommage manqué à travers ~15 fichiers, mais leur usage se scinde en deux rôles distincts) :

```css
:root {
  /* Fond de la scène globe/espace — INCHANGÉ, reste sombre pour que le
     globe 3D et le champ d'étoiles restent lisibles. */
  --navy: #0f1730;
  --navy2: #1a2340;

  /* Accent conservé pour le Groupe A uniquement (chrome "verre sombre" qui
     flotte encore au-dessus du globe) — reteinté du doré vers un lavande
     clair pour garder un contraste fort sur fond sombre, exactement le même
     rôle qu'avant (accent clair sur fond sombre), juste une autre teinte. */
  --gold: #8a7cc0;
  --gold-light: #b3a5e0;

  /* Nouveaux tokens pour le Groupe B (bandeau, panneau, cartes, modales) —
     un violet plus profond, nécessaire pour un contraste correct sur fond
     blanc (repris du dégradé réel de makor-group.com). */
  --accent: #4a3a82;
  --surface: #ffffff;
  --surface-alt: #f6f5fa;
  --border: #e3e1ec;
  --text: #241c3d;
  --text-muted: #6d6785;
}
```

**Pourquoi deux nuances de violet plutôt qu'une seule** : `--gold-light` (maintenant lavande `#b3a5e0`) doit rester clair pour se détacher d'un fond quasi-noir (`rgba(15,23,48,0.85-0.9)`) — un violet profond y serait illisible (deux tons sombres l'un sur l'autre). `--accent` (`#4a3a82`) doit au contraire être assez foncé pour se détacher d'un fond blanc. Utiliser la même variable pour les deux aurait cassé le contraste dans un des deux contextes.

**Table de transformation systématique** (à appliquer fichier par fichier, Tâche 1) :

| Motif actuel | Contexte | Nouveau motif |
|---|---|---|
| `rgba(15, 23, 48, X)` en `background` sur un panneau/modale/dropdown (Groupe B) | fond "verre sombre" | `var(--surface)` (blanc plein) ou `rgba(255,255,255,0.98)` si une légère transparence est déjà utilisée ailleurs sur le même élément |
| `rgba(15, 23, 48, X)` en `background` (Groupe A) | boutons flottant sur le globe | **inchangé** |
| `#0f1730` en dur (fond plein d'input/popup, Groupe B) | champs de saisie | `var(--surface-alt)` (léger décroché du blanc pur de la carte, pour que le champ reste visuellement distinct) |
| `rgba(224, 181, 61, X)` en `border` (Groupe B) | bordures | `rgba(74, 58, 130, X)` (équivalent de `--accent` en rgba, mêmes valeurs d'opacité X que l'original) |
| `rgba(224, 181, 61, X)` en `border` (Groupe A) | boutons flottant sur le globe | `rgba(179, 165, 224, X)` (équivalent de `--gold-light` en rgba) |
| `rgba(201, 151, 31, X)` (hover doré foncé, Groupe B) | fond au survol | `rgba(74, 58, 130, X)` |
| `var(--gold-light, #e0b53d)` (Groupe A, fichier `globe.css` uniquement) | texte/icônes sur fond sombre | `var(--gold-light, #b3a5e0)` — seul le fallback change, le nom de variable reste |
| `var(--gold-light, #e0b53d)` (Groupe B, tous les autres fichiers) | texte/icônes/bordures sur fond clair | `var(--accent, #4a3a82)` |
| `color: #fff` (Groupe B) | texte principal | `var(--text)` |
| `color: #767c8c` (Groupe B, libellés secondaires) | texte secondaire | **inchangé** — déjà un gris moyen qui reste lisible sur blanc |
| `color: #b7bdd6` (Groupe B, texte de corps) | texte de corps | `var(--text-muted)` — la teinte lavande claire d'origine était pensée pour un fond sombre, trop pâle sur blanc |
| `background: rgba(255, 255, 255, 0.04)` (cartes sur fond sombre, ex. `.panel-company-card`) | fond de carte | `var(--surface)` + `border: 1px solid var(--border)` + `box-shadow: 0 1px 3px rgba(36, 28, 61, 0.08)` (élévation douce, teinte violette plutôt que noire) |
| `border-bottom: 1px solid rgba(255, 255, 255, 0.06)` (séparateurs internes) | séparateurs | `rgba(36, 28, 61, 0.08)` (équivalent sombre-sur-clair de `--text`) |
| `#1c8a4b` / `#c0392b` (positif/négatif) | sémantique | **inchangé** — couleurs déjà correctes sur fond clair comme sombre |
| `#e0736a` (suppression/danger) | sémantique | **inchangé** — lisible sur blanc, pas au cœur de la demande d'identité |

## Tâche 1 — Palette : `globe.css` (Groupe A) puis tous les fichiers du Groupe B

### 1a. `webapp/src/styles/globe.css`

Remplacer le bloc `:root` (lignes 1-6) par celui donné dans "Décisions de conception" ci-dessus.

Dans ce même fichier, pour chaque règle du **Groupe A** (`.region-indicator`, `.arrow-btn`, `.arrow-btn:hover`, `.edit-toggle-btn`, `.edit-toggle-btn.active`, `.undo-all-btn`, `.export-pdf-btn`, `.export-pdf-btn:hover`) : ne changer **que** les valeurs `rgba(224, 181, 61, X)` → `rgba(179, 165, 224, X)` (bordures) et `rgba(201, 151, 31, X)` → `rgba(138, 124, 192, X)` (survol, équivalent de `--gold` assombri) ; laisser les `rgba(15, 23, 48, X)` (fonds) et les `var(--gold-light, ...)` (déjà couverts par le changement de fallback du `:root`) inchangés.

Exemple concret (une règle, à répliquer pour les 6 autres du Groupe A) :
```css
/* AVANT */
.arrow-btn {
  background: rgba(15, 23, 48, 0.85);
  border: 1px solid rgba(224, 181, 61, 0.35);
  color: var(--gold-light);
}
.arrow-btn:hover {
  background: rgba(201, 151, 31, 0.25);
}

/* APRÈS */
.arrow-btn {
  background: rgba(15, 23, 48, 0.85);
  border: 1px solid rgba(179, 165, 224, 0.35);
  color: var(--gold-light);
}
.arrow-btn:hover {
  background: rgba(138, 124, 192, 0.25);
}
```

### 1b. Tous les fichiers du Groupe B

Appliquer la table de transformation ci-dessus, méthodiquement, aux fichiers suivants (liste complète, aucun autre fichier `.css` de `webapp/src/` ne doit être oublié) :

- `webapp/src/timeline/topBanner.css`
- `webapp/src/timeline/weekAdmin.css`
- `webapp/src/panel/sidePanel.css`
- `webapp/src/panel/companyList.css` (voir aussi Tâche 3 pour la restructuration des bullets dans ce même fichier)
- `webapp/src/panel/portfolioTable.css`
- `webapp/src/panel/lexiqueModal.css`
- `webapp/src/panel/presentationsModal.css`
- `webapp/src/panel/presentations.css`
- `webapp/src/panel/panelToggle.css`
- `webapp/src/panel/chartModal.css` (déjà sur fond blanc — seuls les `color: #0f1730` doivent devenir `var(--text)`, rien d'autre à changer dans ce fichier)
- `webapp/src/admin/passwordModal.css`
- `webapp/src/admin/presentationUploadModal.css`
- `webapp/src/admin/colorPicker.css`
- `webapp/src/admin/toast.css`

Exemple concret complet, sur un fichier représentatif du Groupe B (`webapp/src/panel/sidePanel.css`, règle `.side-panel` et une entrée de formulaire) :
```css
/* AVANT */
.side-panel {
  background: rgba(15, 23, 48, 0.98);
  border-left: 2px solid rgba(224, 181, 61, 0.5);
  box-shadow: -12px 0 32px rgba(0, 0, 0, 0.45);
  color: #fff;
}
.panel-index-name-input {
  background: #0f1730;
  border: 1px solid rgba(224, 181, 61, 0.4);
  color: #fff;
}

/* APRÈS */
.side-panel {
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: -12px 0 32px rgba(36, 28, 61, 0.1);
  color: var(--text);
}
.panel-index-name-input {
  background: var(--surface-alt);
  border: 1px solid var(--border);
  color: var(--text);
}
```

**Points d'attention pour l'implémenteur, à vérifier explicitement pendant le travail (pas juste en fin de tâche)** :
- Après ce changement, `body.panel-open .side-panel` (le panneau ouvert) doit rester parfaitement lisible : texte sombre sur fond blanc, tester visuellement dans le navigateur avant de passer au fichier suivant plutôt que de faire les 14 fichiers "à l'aveugle" puis tout vérifier à la fin — le risque d'erreur cumulée est réel sur un changement de cette ampleur.
- `.panel-index-change.positive`/`.negative`, `.chart-price` et toutes les couleurs sémantiques vert/rouge ne doivent **pas** être touchées.
- Les couleurs de personnalisation par champ (`item.colors`, posées via `style.color` inline par `colorPicker.js`, ex. `nameColor`/`capColor`/`valueColor` dans `companyList.js`) sont des couleurs choisies par les stagiaires eux-mêmes sur les données réelles — elles restent **entièrement hors périmètre**, ne pas les toucher ni les réinterpréter, ce plan ne change que les couleurs par défaut du thème.
- `.top-banner-search-results` a un `z-index: 25` et `.lexique-modal-content`/etc. ont leurs propres z-index — vérifier qu'aucun changement de `box-shadow`/fond n'introduit un problème de lisibilité de superposition (ex. dropdown de recherche blanc sur bandeau maintenant blanc aussi — s'assurer que la bordure/ombre reste visible pour distinguer les deux).

## Tâche 2 — Scrollbars unifiées

**Constat** : `webapp/src/timeline/weekTimeline.css`/`.js` a déjà le style de référence (scrollbar personnalisée + fondus + classe `.is-scrolling`), mais c'est une scrollbar **horizontale**. Les 4 autres conteneurs à défilement de l'application sont tous **verticaux** :
- `.side-panel` (`sidePanel.css`, `overflow-y: auto`)
- `.lexique-list` (`lexiqueModal.css`, `overflow-y: auto`)
- `.top-banner-search-results` (`topBanner.css`, `overflow-y: auto`, `max-height: 280px`)
- `.presentations-modal-content` (`presentationsModal.css`, `overflow-y: auto`, `max-height: 80vh`)

### 2a. Nouveau bloc CSS partagé

Créer un nouveau fichier `webapp/src/styles/scrollbar.css` (importé une seule fois depuis `main.js`, aux côtés des autres imports CSS globaux) contenant une classe utilitaire réutilisable :

```css
/* Scrollbar verticale partagée — même langage visuel que la scrollbar
   horizontale de weekTimeline.css (thumb discret au repos, plus visible au
   survol/pendant le défilement), adaptée en `width` au lieu de `height`. */
.scroll-y-styled {
  scrollbar-width: thin;
  scrollbar-color: rgba(74, 58, 130, 0.2) transparent;
}

.scroll-y-styled::-webkit-scrollbar {
  width: 6px;
}

.scroll-y-styled::-webkit-scrollbar-track {
  background: transparent;
}

.scroll-y-styled::-webkit-scrollbar-thumb {
  background: rgba(74, 58, 130, 0.2);
  border-radius: 3px;
  transition: background-color 0.2s ease;
}

.scroll-y-styled:hover::-webkit-scrollbar-thumb,
.scroll-y-styled.is-scrolling::-webkit-scrollbar-thumb {
  background: rgba(74, 58, 130, 0.55);
}
```

**Note sur la couleur** : `rgba(74, 58, 130, X)` est l'équivalent rgba de `var(--accent)` (`#4a3a82`) — ces 4 conteneurs sont tous dans des surfaces du Groupe B (fond clair), donc utilisent l'accent violet foncé, pas le lavande clair du Groupe A. Aucun conteneur à scrollbar personnalisée n'existe dans le Groupe A (le globe lui-même n'a pas de scroll).

### 2b. Appliquer la classe aux 4 conteneurs

Ajouter `scroll-y-styled` à la liste de classes de chacun de ces 4 éléments, **dans le HTML statique** (`webapp/index.html`) pour `.side-panel` et `.top-banner-search-results` (éléments présents dès le chargement), et **dans le JS** pour `.lexique-list` (déjà un `<div>` créé une fois dans `index.html` — vérifier s'il est statique ou créé dynamiquement par `lexiqueModal.js` avant de décider où ajouter la classe) et `.presentations-modal-content`.

### 2c. Rendre l'effet `.is-scrolling` réellement dynamique (pas seulement `:hover`)

Contrairement au fondu horizontal de `weekTimeline.js` (qui a une logique dédiée avec fondus latéraux), ces 4 conteneurs n'ont pas besoin de fondus (leur contenu haut/bas est déjà évident visuellement — un panneau qui commence en haut de l'écran, une liste dans une modale bornée). Il suffit de répliquer uniquement la logique `.is-scrolling` (temporisation au défilement) sans les éléments de fondu. Ajouter une petite fonction utilitaire partagée plutôt que de dupliquer la même logique 4 fois :

Nouveau fichier `webapp/src/styles/scrollActivity.js` :
```js
const SCROLL_IDLE_DELAY_MS = 600;

// Toggles .is-scrolling on `el` while it's actively being scrolled, removed
// after a short idle delay — shared by every vertical scroll container that
// uses the .scroll-y-styled class (see scrollbar.css), mirroring the same
// idle-timeout pattern already used by the horizontal week-timeline scrollbar.
export function initScrollActivity(el) {
  let idleTimer = null;
  el.addEventListener('scroll', () => {
    el.classList.add('is-scrolling');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => el.classList.remove('is-scrolling'), SCROLL_IDLE_DELAY_MS);
  }, { passive: true });
}
```

Appeler `initScrollActivity(el)` une fois pour chacun des 4 conteneurs, au moment de leur initialisation respective (`main.js` pour `.side-panel`/`.top-banner-search-results`, `lexiqueModal.js`'s `initLexiqueModal` pour `.lexique-list`, `presentationsModal.js`'s `initPresentationsModal` pour `.presentations-modal-content`).

**Point d'attention pour l'implémenteur** : `.side-panel` lui-même n'est peut-être pas le bon élément à cibler si sa structure interne a changé depuis — vérifier avec `document.querySelector('.side-panel')` dans le navigateur avant de coder en dur une supposition sur sa structure DOM.

### Tests — ajouter à un nouveau `webapp/src/styles/scrollActivity.test.js`
```js
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { initScrollActivity } from './scrollActivity.js';

describe('initScrollActivity', () => {
  it('adds is-scrolling on scroll and removes it after the idle delay', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    initScrollActivity(el);
    el.dispatchEvent(new Event('scroll'));
    expect(el.classList.contains('is-scrolling')).toBe(true);
    vi.advanceTimersByTime(600);
    expect(el.classList.contains('is-scrolling')).toBe(false);
    vi.useRealTimers();
  });

  it('resets the idle timer on repeated scroll events instead of stacking timeouts', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    initScrollActivity(el);
    el.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(400);
    el.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(400);
    expect(el.classList.contains('is-scrolling')).toBe(true); // only 400ms since the 2nd event
    vi.advanceTimersByTime(200);
    expect(el.classList.contains('is-scrolling')).toBe(false); // now 600ms since the 2nd event
    vi.useRealTimers();
  });
});
```

## Tâche 3 — Fiches entreprises : structure des points clés

**Portée confirmée** : uniquement `webapp/src/panel/companyList.css` (styles) et `webapp/src/panel/companyList.js` (uniquement pour ajouter un `<span>` de flèche — aucune donnée, aucun champ, aucune valeur affichée ne change ; toujours `bullet` = une chaîne de texte brute par point clé, exactement comme aujourd'hui).

### 3a. `webapp/src/panel/companyList.js` — ajouter la flèche

Dans `buildBulletsList`, remplacer la branche non-édition (`li.textContent = bullet;`) par une structure à deux éléments, cohérente avec la façon dont l'ancien site construit ses bullets (`bullet-triangle` + `bullet-text`) :

```js
    if (isEditing) {
      // ...bloc existant inchangé...
    } else {
      const arrow = document.createElement('span');
      arrow.className = 'panel-bullet-arrow';
      arrow.textContent = '▶';
      const text = document.createElement('span');
      text.className = 'panel-bullet-text';
      text.textContent = bullet;
      li.append(arrow, text);
    }
```

Ne rien changer à la branche `isEditing` (le `<textarea>` existant reste tel quel — ajouter une flèche visuelle à un champ de saisie actif n'apporte rien et complexifierait inutilement le layout d'édition).

### 3b. `webapp/src/panel/companyList.css` — nouvelle présentation de la carte et des bullets

Remplacer le bloc `.panel-company-card` existant par :
```css
.panel-company-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(36, 28, 61, 0.08);
  padding: 16px;
  margin-bottom: 14px;
  font-size: 12px;
}
```

Remplacer `.panel-company-name` :
```css
.panel-company-name {
  font-weight: bold;
  font-size: 15px;
  color: var(--text);
}
```

Ajuster `.panel-company-stats` pour plus d'air entre les 4 statistiques (actuellement `gap: 6px`, en cohérence avec l'espacement demandé) :
```css
.panel-company-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
```

Remplacer entièrement le style des bullets — c'est le cœur de la Tâche 3, reprenant fidèlement la structure retrouvée dans `index.html` (voir Contexte) tout en l'adaptant à la nouvelle palette et à un espacement plus généreux :
```css
.panel-company-bullets {
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
}

.panel-company-bullets li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--border);
}

.panel-company-bullets li:last-of-type {
  border-bottom: none;
}

.panel-bullet-arrow {
  color: var(--accent);
  font-size: 11px;
  line-height: 1.7;
  flex-shrink: 0;
  margin-top: 2px;
}

.panel-bullet-text {
  flex: 1;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-muted);
  white-space: pre-line;
}
```

**Ne pas supprimer** la règle `.panel-company-bullets li { display:flex; align-items:flex-start; gap:6px; margin-bottom:6px; }` sans la remplacer — elle est directement remplacée par le bloc ci-dessus (le `gap`/`margin-bottom` d'origine sont repris dans la nouvelle règle `padding`/`border-bottom`, ne pas laisser les deux versions coexister).

**Point d'attention pour l'implémenteur** : `li.textContent = bullet` en mode édition n'existe plus dans la branche non-édition depuis la Tâche 3a — vérifier après le changement que le mode édition (le `<textarea class="panel-company-bullet-input">`) reste visuellement correct et n'a pas hérité involontairement du `display:flex` de `.panel-company-bullets li` d'une façon qui casserait sa mise en page (le textarea + bouton couleur + bouton suppression sont déjà dans un conteneur flex existant, `align-items:flex-start` ne devrait rien casser mais à vérifier visuellement en mode édition, pas seulement en lecture).

## Contraintes globales

- Aucun changement de contenu : `item.bullets`, `item.name`, toute donnée Firestore reste strictement identique — seule leur présentation change.
- Ne pas toucher au fond du globe/de la scène 3D (`html, body { background: var(--navy) }` reste inchangé).
- Ne pas toucher aux couleurs sémantiques positif/négatif (`#1c8a4b`/`#c0392b`) ni aux couleurs de personnalisation par champ choisies par les stagiaires (`item.colors`).
- Ne pas introduire de dépendance npm supplémentaire.
- Ne pas modifier `webapp/src/timeline/weekTimeline.css`/`.js` au-delà de ce qui est strictement nécessaire pour la cohérence de couleur (si son propre thumb doré doit devenir violet pour rester cohérent avec le reste — voir note ci-dessous).

**Note de cohérence à traiter en premier dans la Tâche 1** : `weekTimeline.css`'s scrollbar existante utilise encore `rgba(224, 181, 61, X)` (doré) — puisque le bandeau supérieur (qui la contient) passe au Groupe B (fond clair), cette scrollbar doit elle aussi passer à l'accent violet (`rgba(74, 58, 130, X)`) pour rester cohérente avec la nouvelle scrollbar verticale de la Tâche 2 — sinon l'application afficherait deux couleurs de scrollbar différentes, contredisant directement la demande n°2 de la mission ("toutes les scrollbars... mêmes couleurs"). Traiter ce fichier dans la Tâche 1 (palette) en plus de la liste du Groupe B ci-dessus, même s'il n'y était pas listé explicitement au départ.

## Vérification

- `cd webapp && npx vitest run` doit rester vert, avec les 2 nouveaux tests de `scrollActivity.test.js`.
- `npm run build` doit rester propre.
- Aucune interaction Firestore — pas de protocole de vérification production nécessaire. Vérification manuelle exhaustive dans le navigateur, section par section :
  1. Bandeau supérieur : fond clair, recherche lisible, résultats de recherche lisibles, scrollbar du bandeau de semaines maintenant violette.
  2. Panneau latéral (toutes les sections : indices, news, entreprises, portefeuille) : fond blanc, texte sombre lisible, scrollbar verticale du panneau visible au survol/défilement avec la même teinte violette que le bandeau.
  3. Boutons flottant sur le globe (flèches région, Éditer, Exporter PDF, Tout annuler) : toujours lisibles sur fond sombre, accent maintenant lavande au lieu de doré.
  4. Toutes les modales (Lexique, Présentations, mot de passe, upload de présentation, sélecteur de couleur) : fond clair cohérent, scrollbar de la liste du Lexique et de la modale Présentations visibles et de la même teinte.
  5. Fiches entreprises : flèche violette devant chaque point clé, séparateur pointillé entre les points, espacement généreux, hiérarchie claire entre nom/stats/bullets — comparer visuellement à `assets/exemple cadre entreprise ancien site.png` pour confirmer l'esprit général (sans viser une reproduction pixel-perfect).
  6. Mode édition : ouvrir le mode édition (si accessible — sinon simplement vérifier que le CSS des champs de saisie n'est pas cassé visuellement dans le code) et confirmer qu'aucun champ de saisie n'est devenu illisible (texte sombre sur fond clair partout, pas de texte blanc oublié sur fond blanc).
  7. Aucune régression fonctionnelle : navigation région/semaine, recherche, Lexique, export PDF, comparateur d'entreprises, graphique 📈 — tout doit continuer à fonctionner exactement comme avant, seul l'aspect visuel change.
