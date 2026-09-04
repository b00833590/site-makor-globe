# Makor Morning News — Résumé du projet

*Dernière mise à jour : 17 juillet 2026*

## Vue d'ensemble

Site interne de suivi hebdomadaire pour Makor Securities : indices de marché, entreprises à suivre, news, veille IA & Fintech, et suivi de portefeuille. Édition en ligne directement depuis le site (mode édition avec mot de passe), utilisé par plusieurs stagiaires en parallèle.

## Architecture actuelle

**Frontend** : un seul fichier `index.html` (HTML/CSS/JS vanilla, pas de framework), édité et redéployé à chaque mise à jour.

**Hébergement (3 en parallèle, redondants)** :
- GitHub Pages — `makor-group.github.io/makor-morning-news/`
- Netlify — `makor-morning-news.netlify.app` (actuellement à court de crédits gratuits jusqu'au 8 août)
- Vercel — `makor-morning-news.vercel.app` (ajouté aujourd'hui, actif)

Les trois se redéploient automatiquement à chaque upload sur GitHub (`Makor-Group/makor-morning-news`, branche `main`).

**Backend de données** : **Firestore** (Google Firebase), migré aujourd'hui depuis Google Apps Script + Google Sheets.
- Projet Firebase : `makor-morning-news`
- Deux collections : `mkg_data` (contenu principal) et `mkg_pdfchunks` (morceaux de PDF des présentations)
- Règles d'accès : ouvertes (`allow read, write: if true`), pas d'authentification — même niveau de sécurité que l'ancien système (accès par simple connaissance de l'URL/config)
- L'ancien Google Sheet reste intact, non supprimé, comme sauvegarde historique

**Cours boursiers** : script Google Apps Script séparé (compte Gmail personnel), relais vers Yahoo Finance — inchangé, toujours utilisé pour les cotations en direct (`getQuote`, `getQuoteSince`, `getQuoteHistory`).

## Pourquoi la migration Firestore

Le script Apps Script principal (sur compte scolaire ESSEC) a commencé à bloquer silencieusement les écritures (erreur CORS liée à une restriction du compte scolaire), causant des pertes de modifications nécessitant plusieurs tentatives pour sauvegarder. Firestore élimine cette dépendance : le site parle directement à la base de données depuis le navigateur, sans script intermédiaire.

## Fonctionnalités ajoutées récemment

**Entreprises à suivre**
- Suppression individuelle des points clés (croix à côté de chaque puce)
- Icône 📈 : courbe d'évolution du cours depuis la date de présentation (SVG, données Yahoo Finance en direct)
- Champs Symbole Yahoo / Drapeau / Pays sous le nom de chaque entreprise
- Icône ⚖ : comparateur de deux entreprises côte à côte

**Suivi du portefeuille**
- Colonne SYMBOLE éditable (résout automatiquement l'actualisation ET les courbes, sans devoir toucher au code)
- Remplissage automatique du symbole pour les entreprises déjà connues
- Tri cliquable sur DATE / DEPUIS / YTD
- Export PDF ciblé par région (icône 📄 à côté de chaque région)
- Actualisation automatique en continu (toutes les 5 min), protégée contre l'écrasement d'un champ en cours d'édition

**News**
- Ordre d'affichage fixe : Asie → Europe → BRICS → Amérique du Nord (insensible à la casse/accents)
- Création automatique de 4 brèves (une par région, avec couleur et texte par défaut) à chaque nouvelle semaine créée

**Général**
- Barre de recherche globale (toutes semaines, tous onglets)
- Le site retient la dernière semaine/onglet consulté après un rafraîchissement (par navigateur)
- Textes par défaut clairs sur tous les nouveaux éléments créés (à remplacer plutôt que champs vides)
- Sauvegardes désormais fiabilisées : validation réelle de la confirmation serveur + retentatives automatiques + protection contre la perte d'un champ en cours de frappe

## Limites connues

- **Pas d'authentification réelle** — accès protégé uniquement par obscurité (mot de passe client-side + configuration Firebase non secrète). Convient à un usage interne restreint, pas à une exposition publique large.
- **Netlify hors service jusqu'au 8 août** (crédits épuisés) — GitHub Pages et Vercel prennent le relais entre-temps.
- **GitHub Pages parfois bloqué** selon certains réseaux d'entreprise (filtrage de domaine `.github.io`) — Vercel recommandé comme lien de secours dans ce cas.
- Certaines anciennes données (entreprises/news saisies avant les derniers champs ajoutés) peuvent encore afficher du texte par défaut à compléter manuellement.

## Prochaines étapes possibles (non lancées)

- Tableau de bord listant automatiquement les champs encore à compléter (symboles, dates, pays manquants)
- Historique de versions au-delà de la session d'édition en cours
- Rôles/permissions différenciés entre stagiaires
- Vue "changements de la semaine" (code déjà écrit, actuellement non accessible depuis l'interface)
