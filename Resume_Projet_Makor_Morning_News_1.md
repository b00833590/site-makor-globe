# Makor Morning News — Résumé du projet

*Dernière mise à jour : 19 septembre 2026*

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
- Champs Symbole Yahoo / Drapeau / Pays sous le nom de chaque entreprise — le drapeau se sélectionne désormais via un menu déroulant cherchable (liste de ~193 pays, recherche insensible aux accents), au lieu d'une saisie manuelle d'emoji. Le stockage (emoji brut sur `it.flag`) n'a pas changé, donc rétrocompatible avec les drapeaux déjà enregistrés.
- **Date de présentation automatique** : chaque semaine reçoit désormais par défaut la date du vendredi de la semaine (calculée à partir du libellé, ex. "07 - 11 SEPTEMBRE" → 11 septembre), enregistrée automatiquement à la création/au renommage de la semaine et rétro-appliquée aux semaines existantes qui n'en avaient pas. Une date modifiée manuellement n'est plus jamais écrasée automatiquement.
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

## Incident de sécurité : secrets exposés, sites mis hors ligne (16 sept. 2026 soir)

**Déclencheur** : l'équipe IT de Makor a regardé le code source du site et trouvé le mot de passe d'édition (`PASSWORD`) et la clé API Firebase (`firebaseConfig.apiKey`) en clair dans `index.html`, visibles par quiconque a le lien. Ils ont demandé de mettre le site hors ligne, de faire tourner ces deux secrets, et — à terme — de reconstruire l'outil sur leur stack standard via un processus formel plutôt que de garder cette version "maison".

**Actions effectuées, dans l'ordre :**
1. Nouveau mot de passe d'édition généré et mis dans le code.
2. Clé Firebase régénérée dans Google Cloud Console (`console.cloud.google.com/apis/credentials`), puis mise à jour dans le code.
3. **Découverte en cours de route** : une deuxième application du même repo, `webapp/` (React/Vite, déployée séparément sur Vercel sous le nom **`makor-globe`**), lit/écrit la **même base Firestore** et avait la même ancienne clé codée en dur dans `webapp/src/data/firestoreClient.js` (sans variable d'environnement). Corrigée et redéployée aussi.
4. Clé restreinte dans Google Cloud Console (Restrictions relatives à l'application → Sites Web) aux domaines : `makor-morning-news.vercel.app/*`, `makor-globe.vercel.app/*`, `http://localhost:8080/*`, `http://127.0.0.1:8080/*` (ce dernier couple pour permettre l'édition en local, voir plus bas).
5. Les deux projets Vercel (`makor-morning-news` et `makor-globe`) ont été **mis en pause** (`npx vercel project pause <nom>` — nécessite une confirmation interactive dans un vrai terminal, ne peut pas être automatisé). Les deux renvoient un **503** depuis lors. Important : Vercel refuse même de *builder* un nouveau déploiement tant qu'un projet est en pause — il faut réactiver (`resume`), déployer, puis remettre en pause juste après pour limiter la fenêtre d'exposition.
6. `js/storage.js` (racine du repo) avait aussi l'ancienne clé en dur, mais n'est référencé par aucune page HTML du repo — code mort, laissé tel quel.
7. **Règles Firestore volontairement laissées ouvertes** (`allow read, write: if true`). Ni `index.html` ni `webapp/` n'utilisent de vraie authentification Firebase — le mot de passe d'édition est une vérification purement côté navigateur, Firestore n'a aucun moyen de la vérifier. Resserrer les règles sans authentification réelle donnerait une fausse impression de sécurité, pas une vraie protection. Décision explicite : laisser tel quel jusqu'à la reconstruction formelle avec l'IT, qui inclura une vraie authentification.
8. Tous les changements en attente de la session (One-Pagers PPTX, sélecteur de drapeaux, date de présentation par défaut) ont été commités et poussés sur GitHub (jusque-là seulement déployés via `npx vercel --prod`, qui ne touche pas du tout à git — d'où la confusion initiale). Un fichier vidéo ajouté par erreur (`data/*.mp4`) a été retiré de l'historique git (amend + `push --force-with-lease`, le fichier reste sur le disque local).

**Effet de bord signalé à l'IT** : les deux sites étant hors ligne, plus aucun stagiaire ne peut y accéder ni les modifier — ce qui allait à l'encontre de la raison même de leur hébergement en ligne. Point remonté explicitement dans la réponse à l'IT, en attente de leur retour sur la marche à suivre (accès temporaire pour l'équipe vs. priorisation de la reconstruction).

**Solution transitoire pour continuer à éditer seul** : `index.html` ne nécessite pas de backend pour l'édition courante (tout passe par le SDK Firestore côté navigateur) — un simple serveur statique local (`npx serve . -l 8080`) suffit, testé et fonctionnel (les vraies données Firestore se chargent bien via `http://localhost:8080`, autorisé par la restriction de clé mise en place à l'étape 4). Limite : les fonctions serverless (regroupement One-Pagers, envoi d'email) ne fonctionnent pas avec ce serveur statique — il faudrait `vercel dev` pour ça.

**État actuel** : `makor-morning-news.vercel.app` et `makor-globe.vercel.app` répondent tous les deux en 503, intentionnellement, en attente de la réponse de l'IT. Ne pas les redéployer/relancer sans vérifier avec Adam au préalable — ce n'est pas une panne.

**Mise à jour du 19 septembre** : les deux projets ont depuis été réactivés (`resume`) et redéployés plusieurs fois en production dans le cadre du travail des jours suivants (One-Pagers en pièce jointe, correctif de synchronisation ci-dessous) — les deux sites répondent normalement, ne sont plus en 503. Le statut de la réponse de l'IT sur l'accès des stagiaires n'est pas retracé ici ; vérifier avec Adam si besoin.

## Bug de synchronisation Morning News ↔ Globe (18-19 septembre 2026)

**Symptôme signalé** : une semaine et une entreprise test créées dans Morning News n'apparaissaient pas dans Globe.

**Cause racine, confirmée factuellement (pas supposée)** : un quota Firestore réellement dépassé, capturé en direct via l'erreur brute du SDK (`code: "resource-exhausted"`, `message: "Quota exceeded."`), mais **seulement sur les transactions** (`runTransaction`, utilisée par `commitFieldEdit` pour chaque modification de champ — renommer, changer une région, etc.). Les écritures simples (`.set()`, utilisées à la **création** d'une semaine/entreprise) continuaient de fonctionner. Résultat :
- Créer une semaine/entreprise → réussit toujours (écriture simple) → le document existe côté serveur avec ses valeurs par défaut.
- La modifier ensuite (renommer, changer la région...) → passe par une transaction → échouait silencieusement à cause du quota.
- Avant le correctif, l'échec n'était signalé que par **un seul toast disparaissant en 2 secondes**, avec un verrou qui supprimait silencieusement tous les avertissements suivants — donc aucune indication persistante que la modification n'avait jamais atteint le serveur.
- Morning News affichait la modification localement (état optimiste) pendant que Firestore gardait la vraie valeur (jamais mise à jour) — Globe, qui lit toujours l'état réel du serveur (`loadAllOnce` + `onSnapshot`, aucun cache), affichait donc la vraie donnée non modifiée. Ce qui ressemblait à "Globe ne se synchronise pas" était en réalité "Morning News n'a jamais réussi à sauvegarder".

**Ni Globe, ni le cache, ni la structure des données n'étaient en cause** — vérifié explicitement : Globe n'a aucun cache (ni localStorage, ni build-time, ni CDN), il s'abonne en direct à Firestore.

**Correctif déployé** dans `index.html` : les trois chemins d'écriture (`rawSet`, `rawDelete`, `commitFieldEdit`) passent désormais par un mécanisme unique (`retryableWrite`) qui :
- réessaie automatiquement (avec délai) tant qu'une écriture n'a pas réellement atteint Firestore ;
- affiche un **bandeau rouge persistant** ("⚠️ N modification(s) non sauvegardée(s)") qui ne disparaît que quand la sauvegarde réussit vraiment, avec un bouton "Réessayer maintenant" ;
- avertit avant la fermeture de l'onglet s'il reste des modifications non confirmées côté serveur (`beforeunload`).

Aucune donnée existante n'a été supprimée ou recréée manuellement. Testé en direct sur la vraie semaine/entreprise test : le nouveau mécanisme réagit correctement (bandeau affiché, tentatives automatiques enclenchées) ; Globe continue d'afficher correctement la vraie donnée serveur.

**Limite du correctif** : les tentatives de réessai vivent en mémoire dans l'onglet du navigateur — si l'onglet est fermé ou rechargé avant que le quota ne se libère, il faudra ressaisir la modification (mais cette fois avec un retour clair en cas de nouvel échec, plus de perte silencieuse).

**Remède permanent, non appliqué (décision à prendre par Adam)** : passer le projet Firebase du plan gratuit "Spark" au plan payant à l'usage "Blaze" — reste gratuit dans les mêmes volumes, mais supprime le plafond journalier dur qui cause des échecs au lieu de simplement facturer un dépassement.

**Découverte annexe, non corrigée** : une entreprise dont la région vaut "Autre" (valeur par défaut à la création) ne correspond à aucun des 4 onglets région de Globe et reste invisible partout dans Globe, même une fois correctement synchronisée. C'est un choix de conception à trancher (5ᵉ onglet "Autre" ? affichage dans tous les onglets ? région obligatoire à la création ?), indépendant du bug de synchronisation ci-dessus.

## Limites connues

- **Pas d'authentification réelle** — le mot de passe d'édition est une vérification purement côté navigateur, non vérifiable par Firestore. Confirmé et documenté suite à l'incident de sécurité du 16 septembre : un vrai contrôle d'accès nécessite une authentification Firebase réelle, prévue pour la reconstruction formelle avec l'IT, pas avant.
- **Les deux sites (`makor-morning-news` et `makor-globe`) étaient hors ligne (pause volontaire)** suite à la demande de l'IT — voir section incident de sécurité ci-dessus. Réactivés depuis (voir mise à jour du 19 septembre dans cette même section) ; le statut de l'accès des stagiaires côté IT reste à vérifier avec Adam.
- **Quota Firestore du plan gratuit "Spark"** : peut être épuisé par un usage intensif (tests, beaucoup de modifications rapprochées), bloquant temporairement les modifications de champs (pas les créations) jusqu'à sa réinitialisation journalière. Voir section "Bug de synchronisation" ci-dessus — mitigé par des réessais automatiques et un avertissement persistant, mais pas éliminé tant que le projet reste sur le plan gratuit.
- **GitHub Pages parfois bloqué** selon certains réseaux d'entreprise (filtrage de domaine `.github.io`) — Vercel recommandé comme lien de secours dans ce cas (actuellement lui-même en pause, voir ci-dessus).
- Certaines anciennes données (entreprises/news saisies avant les derniers champs ajoutés) peuvent encore afficher du texte par défaut à compléter manuellement.
- **Envoi email aux maîtres de stage bloqué en attente de l'IT de Makor** — voir section One-Pagers ci-dessus (statut distinct de l'incident de sécurité, remonté séparément).
- Fenêtre de réparation PowerPoint occasionnelle sur le PPTX regroupé, contenu intact — non résolue définitivement, laissée en l'état sur décision utilisateur.

## Prochaines étapes possibles (non lancées)

- **Attendre la réponse de l'IT** sur l'accès des stagiaires pendant que les sites sont en pause, et sur le calendrier de la reconstruction formelle
- Reconstruction du site sur la stack standard de l'IT, avec une vraie authentification (remplace le mot de passe client-side et permet enfin de vraies règles Firestore)
- Tableau de bord listant automatiquement les champs encore à compléter (symboles, dates, pays manquants)
- Historique de versions au-delà de la session d'édition en cours
- Rôles/permissions différenciés entre stagiaires
- Vue "changements de la semaine" (code déjà écrit, actuellement non accessible depuis l'interface)
- Relancer avec l'IT de Makor une fois leur réponse reçue sur l'envoi email (authentification de domaine ou liste blanche pour Brevo)
- Décider si le projet Firebase passe au plan payant "Blaze" pour éliminer le plafond journalier de quota (voir section "Bug de synchronisation" ci-dessus)
- Décider comment traiter les entreprises en région "Autre" dans Globe (actuellement invisibles dans tous les onglets région)
