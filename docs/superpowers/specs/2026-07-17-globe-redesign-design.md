# Refonte esthétique et structurelle — Globe interactif (Makor Morning News)

*Date : 17 juillet 2026*

## Contexte

Le site Makor Morning News (suivi hebdomadaire pour Makor Securities : indices, entreprises présentées, news macro, veille IA & Fintech) est actuellement un `index.html` unique avec une navigation classique par onglets semaine → sous-onglets (Indices régionaux, News, Entreprises, IA & Fintech). Il est hébergé sur Vercel, avec Firestore comme backend de données.

Cette spec couvre une refonte complète (structure + visuel) : remplacer la navigation par onglets par un globe 3D interactif façon Google Earth, où chaque région du monde est un point d'entrée vers son contenu de la semaine.

Hors périmètre : le backend (Firestore, collections `mkg_data`/`mkg_pdfchunks`), le mécanisme d'authentification (mot de passe côté client), les cotations boursières (Apps Script → Yahoo Finance) ne changent pas. C'est une refonte de la couche présentation/navigation.

## Concept général

L'écran principal est un globe terrestre 3D **photoréaliste** (imagerie satellite réelle type NASA Blue Marble, pas de rendu stylisé), sur fond spatial étoilé sombre, avec un léger halo d'atmosphère. Quatre régions sont navigables :

- **Asie**
- **BRICS + UK** (Brésil, Russie, Inde, Chine, Afrique du Sud, Royaume-Uni — 6 pays, non contigus géographiquement)
- **Europe**
- **Amérique du Nord**

Cliquer sur une région (ou un pays qui la compose) anime la caméra du globe vers cette région, puis ouvre un panneau latéral avec son contenu. Pour Asie/Europe/Amérique du Nord, la caméra zoome sur un point unique. Pour BRICS + UK, dont les 6 pays sont dispersés sur 4 continents, la caméra recule et cadre une **vue large englobant les 6 marqueurs** en une seule prise — pas de zoom sur un point unique, pas d'animation de survol séquentiel.

En complément du clic direct, des **flèches gauche/droite** de part et d'autre du globe permettent de cycler dans un ordre fixe : Asie → BRICS + UK → Europe → Amérique du Nord → (retour à Asie). Un indicateur de position (ex. « Europe · 3/4 ») s'affiche près du globe.

## Navigation temporelle (semaines)

Une **timeline verticale** fine est ancrée sur le bord gauche de l'écran : un point par semaine existante, la semaine active mise en évidence (plus grande, lueur dorée). Cliquer sur un point change la semaine consultée ; le globe et le panneau reflètent alors les données de cette semaine pour la région sélectionnée.

## Panneau latéral (contenu régional)

Au clic sur une région, un panneau glisse depuis la droite (le globe reste visible et interactif à gauche, il ne disparaît pas). Contenu du panneau, dans l'ordre :

1. **Indices régionaux** de la semaine
2. **News macro** de la région (une brève, comme aujourd'hui)
3. **Entreprises présentées** cette semaine dans la région, avec les fonctionnalités existantes conservées : suppression individuelle des points clés, icône 📈 (courbe depuis la date de présentation), icône ⚖ (comparateur), champs Symbole Yahoo / Drapeau / Pays
4. **Suivi de portefeuille** de la région : table de performance historique, indépendante de la semaine active (comme le comportement actuel), avec tri sur DATE/DEPUIS/YTD, actualisation auto, export PDF ciblé par région

La barre de recherche globale existante est conservée, réintégrée dans le nouvel habillage (positionnement exact laissé à l'implémentation).

## IA & Fintech

Contenu indépendant des régions. Accessible via une **icône flottante fixe** en haut à droite de l'écran (toujours visible, à côté du globe). Le clic ouvre le même type de panneau latéral, avec la liste des présentations IA & Fintech des semaines précédentes.

## Mode édition

Séparé de la vue de consultation (contrairement au mode inline actuel). Une **vue admin distincte** (formulaires/tableaux classiques, pensée pour la saisie rapide plutôt que la consultation) regroupe l'édition des indices, news, entreprises, portefeuille et IA & Fintech par semaine/région. Accès protégé par le même mécanisme de mot de passe qu'aujourd'hui (`js/features/auth.js`, à adapter). Cette vue ne réutilise pas le globe.

## Identité visuelle

- Palette conservée : navy (`--navy: #0f1730`, `--navy2: #1a2340`) + or (`--gold: #c9971f`, `--gold-light: #e0b53d`), appliquée à un habillage sombre type « cockpit / salle de marché » plutôt qu'au fond clair actuel (`--bg: #f3f4f7`).
- Typographie et codes couleur verts/rouges pour les variations de marché conservés dans l'esprit de l'existant.
- Fond spatial étoilé, halo d'atmosphère sur le globe, marqueurs de région lumineux (or) au repos, teinte distincte pour un marqueur survolé/actif.

## Stack technique

- **Vanilla JS conservé** (pas de migration vers React/Vue), en cohérence avec l'existant modulaire (`js/views/`, `js/features/`).
- Ajout de **Vite** comme outil de build, pour pouvoir installer et bundler proprement une librairie de globe 3D.
- Librairie de globe : **`globe.gl`** (surcouche de `three.js`/`three-globe`), qui fournit nativement la gestion de caméra (fly-to, cadrage multi-points), les marqueurs de points, et l'application de textures satellite réelles.
- Nouvelle organisation de fichiers proposée :
  ```
  index.html          — vue de consultation (globe)
  admin.html           — vue d'édition séparée
  vite.config.js
  css/main.css          — thème mis à jour
  js/
    app.js
    globe/              — nouveau : caméra, marqueurs, textures, config régions (dont logique BRICS+UK)
    views/               — panneaux latéraux par région (adapté de l'existant)
    features/            — existant : auth.js, charts.js, search.js, actions.js
    admin/               — nouveau : formulaires/tableaux de la vue édition
  ```
- Firestore (backend, collections, règles d'accès) : **inchangé**.

## Support des appareils

Expérience complète (globe 3D, timeline, panneau, flèches) pensée pour **desktop uniquement** — usage principal en présentation/bureau. Sur mobile/tablette, un **repli simplifié** est affiché : liste de boutons par région (pas de rendu 3D), menant au même panneau latéral de contenu. Aucun effort de portage du globe lui-même sur tactile.

## Hors périmètre de cette spec (à traiter en implémentation ou plus tard)

- Détail pixel des formulaires de la vue admin (peut largement reprendre les champs/logique existants de `js/features/actions.js` et des vues actuelles)
- Positions géographiques précises (lat/long) des 6 marqueurs BRICS + UK et des points Asie/Europe/Amérique du Nord
- Durée/easing exacts des animations de caméra
- Source exacte des textures satellite (à sourcer : NASA Blue Marble ou équivalent libre de droits)
