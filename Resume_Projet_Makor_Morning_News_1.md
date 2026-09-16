# Makor Morning News — Résumé du projet

*Dernière mise à jour : 16 septembre 2026*

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

## One-Pagers : dépôt, regroupement PPTX et envoi aux maîtres de stage (16 sept. 2026)

**Objectif** : chaque stagiaire dépose le One-Pager (PPTX) de son entreprise sur la fiche correspondante ; un bouton fusionne tous les One-Pagers de la semaine en un seul `.pptx` ; un autre bouton envoie un email aux deux maîtres de stage avec un lien vers une page publique de téléchargement.

**Historique de la fonctionnalité** (plusieurs itérations dans la même journée) :
1. Version 1 : un seul fichier par entreprise (PDF ou PPTX), regroupement en PDF (pdf-lib côté navigateur), conversion PPTX→PDF via CloudConvert. Abandonnée : CloudConvert a atteint son quota gratuit (`CREDITS_EXCEEDED`) dès le premier vrai test.
2. Version 2 : deux emplacements indépendants par entreprise (PDF + PPTX), deux regroupements séparés, fusion PPTX via `python-pptx` (copie forme par forme). Abandonnée à la demande : plus de PDF du tout, PPTX uniquement.
3. **Version actuelle** : PPTX uniquement. Un fichier par entreprise (`company.onePagerFile`), un regroupement (`week.onePagerBundle`). D'anciens fichiers PDF déposés avant ce changement sont préservés (pas supprimés) sous `legacyOnePagerPdf` / `legacyOnePagerBundlePdf`, mais ignorés par le workflow actuel.

**Fusion PPTX (`api/merge-pptx.py`, fonction Python sur Vercel)** : après un bug de corruption sérieux (PowerPoint demandait une réparation, certaines diapositives devenaient blanches), la méthode a été entièrement revue. Ce n'est plus une copie forme par forme (qui cassait les graphiques natifs PowerPoint — référence à un objet jamais copié). C'est maintenant une **fusion brute au niveau du paquet OOXML** : chaque fichier source est importé en entier avec sa propre mise en page/thème/images/graphiques, renommé pour éviter toute collision ; seule la liste des diapositives au niveau du fichier est reconstruite. Une vérification automatique (`validate_pptx`) tourne après chaque génération et bloque l'envoi d'un fichier structurellement invalide plutôt que de le servir silencieusement.
- Bug residuel connu et accepté (décision utilisateur) : PowerPoint affiche encore parfois une fenêtre de réparation à l'ouverture malgré un contenu intact — cause exacte non confirmée définitivement (possible fichier de test périmé lors du dernier essai). Laissé tel quel sur demande explicite.

**Envoi email (`api/send-onepagers-email.js`)** : service **Brevo** (pas Resend — Resend exige un domaine vérifié via DNS, non disponible). Destinataires configurés uniquement via la variable d'environnement `ONEPAGER_MENTOR_EMAILS` (jamais en dur dans le code). Variables Vercel nécessaires : `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `ONEPAGER_MENTOR_EMAILS`. `CLOUDCONVERT_API_KEY` n'est plus utilisée (CloudConvert entièrement retiré du projet).

**⚠️ Statut actuel : envoi fonctionnel mais bloqué par la sécurité mail de Makor** — testé de bout en bout, Brevo confirme "Délivré" pour `arouas@makorsecurities.com` et `hdumeny@makorsecurities.com`, mais rien n'arrive (ni Inbox ni Spam) : signe d'une mise en quarantaine côté serveur d'entreprise (probablement Microsoft 365/Defender, à cause d'un décalage entre le nom affiché "Makor Morning News" et le domaine d'envoi technique `brevosend.com`, non authentifié pour `makorsecurities.com`). **Confirmé fonctionnel avec une adresse Gmail personnelle** — donc le pipeline applicatif (code + Brevo) est validé, le blocage est entièrement côté infrastructure mail de Makor, hors de portée du code. Escaladé par Adam via un broker vers l'IT Support de Makor (en copie), réponse en attente. Deux solutions possibles côté Makor : authentification SPF/DKIM du domaine dans Brevo (nécessite accès DNS), ou liste blanche/déblocage de quarantaine côté IT (Microsoft Defender).

## Limites connues

- **Pas d'authentification réelle** — accès protégé uniquement par obscurité (mot de passe client-side + configuration Firebase non secrète). Convient à un usage interne restreint, pas à une exposition publique large.
- **GitHub Pages parfois bloqué** selon certains réseaux d'entreprise (filtrage de domaine `.github.io`) — Vercel recommandé comme lien de secours dans ce cas.
- Certaines anciennes données (entreprises/news saisies avant les derniers champs ajoutés) peuvent encore afficher du texte par défaut à compléter manuellement.
- **Envoi email aux maîtres de stage bloqué en attente de l'IT de Makor** — voir section One-Pagers ci-dessus.
- Fenêtre de réparation PowerPoint occasionnelle sur le PPTX regroupé, contenu intact — non résolue définitivement, laissée en l'état sur décision utilisateur.

## Prochaines étapes possibles (non lancées)

- Tableau de bord listant automatiquement les champs encore à compléter (symboles, dates, pays manquants)
- Historique de versions au-delà de la session d'édition en cours
- Rôles/permissions différenciés entre stagiaires
- Vue "changements de la semaine" (code déjà écrit, actuellement non accessible depuis l'interface)
- Relancer avec l'IT de Makor une fois leur réponse reçue (authentification de domaine ou liste blanche pour Brevo)
