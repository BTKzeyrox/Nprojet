# TODO.md : liste à faire (Nprojet)

À mettre à jour à la fin de chaque étape (cocher, ajouter la date et le commit). Règles de travail : voir `LIRE_EN_PREMIER.md` (récap, puis « GO » de BTK avant de coder).

## 1. Page d'accueil (Actualités)

### A. Serveur et store (fait le 2026-10-11, commit d888eb4, serveur déployé en v3)
- [x] Fichiers (photos, PDF, texte) dans les publications et les commentaires, sans limite de nombre
- [x] Statut « en attente » pour les publications des employés, cachées aux autres
- [x] Routes : l'employé envoie, l'admin valide ou refuse (motif obligatoire)
- [x] Nettoyage des fichiers d'une publication refusée ou supprimée

### B. Compression et publication (fait le 2026-10-11, commit 7f5cce7, non testé à l'écran)
- [x] Compression des images avant l'envoi (1600 px, environ 300 Ko), poids avant et après affiché
- [x] Publier avec photos et fichiers (admin et employé)
- [x] Barre de progression et erreurs claires (10 Mo max par fichier)

### C. Validation par l'admin (fait le 2026-10-11, non testé à l'écran)
- [x] File « À valider » en haut du fil, avec aperçu complet
- [x] Valider ou Refuser, motif visible par l'employé
- [x] Pastille « En attente de validation » côté employé (existait déjà)
- [ ] Pas fait : pastille rouge dans la barre latérale pour les publications en attente (non demandé)

### D. Commentaires et visionneuse (fait le 2026-10-11, non testé à l'écran)
- [x] Commentaires avec image ou fichier (trombone, compression, liste avant envoi, affichage sous le texte)
- [x] Visionneuse : Retour, zoom, précédent/suivant (existaient), Télécharger avec le vrai nom du fichier
- [x] Aperçu des fichiers : Retour (existait) et Télécharger (ajouté)

### E. Barre d'actions et dynamique (fait le 2026-10-11, non testé à l'écran)
- [x] J'adore / Commenter / Partager sur une ligne, police réduite
- [x] Rechargement toutes les 8 s sur la page Actualités (compteur partagé avec la messagerie)
- [x] Pastille « ↑ N nouvelles publications » : les publications des autres sont retenues si on a défilé vers le bas
- [x] « J'adore » immédiat à l'écran, retour en arrière si le serveur refuse

### F. Contrôle final (fait le 2026-10-11)
- [x] `npm run build` et `tsc --noEmit` sans erreur à chaque étape
- [x] Redéploiement de `df-api` sur Supabase (projet `nprojet`) : v3 = commit `d888eb4e17facee6bdfbbc6e9d0ca84abe8206dc` (2026-10-11, accord de BTK). Retour en arrière : redéployer le petit fichier avec le commit `2b0dcb7d57992ac05ec8a91c96d45b4d802ed220` (v2)
- [x] Recherche automatique dans le code (A à E) : aucun `console.log`, aucun token GitHub, aucun fichier `.env`. Le diff n'a pas été relu ligne par ligne.
- [ ] **Non testé à l'écran (à tester par BTK)** : publier avec photo (admin puis employé), valider / refuser, commenter avec photo et PDF, Télécharger, pastille « nouvelles publications », J'adore immédiat, barre d'actions sur petit téléphone
- [ ] Pas fait (non demandé) : pastille rouge dans la barre latérale pour les publications en attente

## 2. Après la page d'accueil (pas commencé)
- [x] Nouveau design : formes arrondies, fond clair, bleu marine (lot 1 : commits a73ca7f, 5a41913, 2b0dcb7) — non testé à l'écran
- [x] Lot 2 : barre du haut arrondie et barre du bas (téléphone : Actualités, Messages, Calendrier, Validations ou Mon poste, Menu) — fait le 2026-10-11, non testé à l'écran. La barre du bas est masquée dans la messagerie (champ de saisie).
- [x] Messagerie (8f133db) ; Réglages en onglets (b6b3739)
- [ ] Pages de menu restantes : Historique, Validation, Équipe, Calendrier, Erreurs, Profil, Connexion
- [ ] « Avances et paie » : retiré du menu (85d8e16), à décider : supprimer du code ou garder

## 2 bis. Nettoyage Delta (fait le 2026-10-11, non testé à l'écran)
- [x] Missions : tableau Kanban À faire / En cours / À valider à la place de la grille P01-P50 (1a42c72)
- [x] Menu : « Avances sur salaire » et « Contrôle et sécurité » retirés ; Réglages aussi pour les opérateurs (85d8e16)
- [x] Réglages : blocs Paie et Paie et avances retirés, choix du nombre de colonnes retiré ; thème, langue et son ajoutés (85d8e16)
- [x] Tableau de bord : plus de prix en Ar, textes « paie créditée » remplacés (85d8e16)
- [x] Base `nprojet` vérifiée : 10 missions Gestion Pro, aucun poste Delta
- [ ] Pas fait : pages Avances et Paie et montants en Ar du calendrier toujours dans le code (inaccessibles par le menu)
- [ ] Pas fait : tableau de performance avec export, fiche d'explication pour le CV (plan HANDOVER §7, points 5 et 6)
- [x] `LIRE_EN_PREMIER.md`, `README.md`, `AI_STUDIO.md`, `PROJET.md`, `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` mis à jour pour Gestion Pro (2026-10-17). `HANDOVER.md` et `NOUVEAU_PROJET.md` gardent volontairement l'histoire de la copie.

## 2 ter. Fait depuis (autres chats, non testé à l'écran)
- [x] Missions : 5 types + guides « Comment faire ? » ; nouveau design v2 ; Réglages en onglets ; tableau de bord redessiné
- [x] Tirer pour actualiser ; cloche et notifications en bulles arrondies ; pastille rouge Messages
- [x] Messagerie : cartes par discussion, message épinglé réduit, grand champ de saisie, flèche « dernier message », anti double envoi, aperçu de fichier avec option Compresser
- [x] Taille de police réglable ; anglais à la place du chinois ; formes arrondies sur confirmations, refus, validations, photo de profil, bandeaux d'erreur

## 2 quater. Améliorations prévues (liste du 2026-10-17)
### 1. Sécurité et propreté (à faire en premier, par BTK)
- [ ] Changer le mot de passe `admin123`
- [ ] Régénérer les clés Cloudinary et Resend
- [ ] Supprimer le token GitHub donné dans le chat : https://github.com/settings/tokens
- [ ] Décider : supprimer ou garder les pages Avances et Paie (dans le code, pas dans le menu)
- [x] Mettre à jour README, AI_STUDIO, PROJET (2026-10-17)

### 2. Vérifier
- [ ] Tester à l'écran : publier avec photo, valider / refuser, commenter avec PDF, envoyer un fichier en messagerie, tirer pour actualiser, passer en EN, connexion admin
- [ ] Finir les pages : Historique, Équipe, Calendrier, Erreurs, Profil, Connexion (seules les formes arrondies sont faites)
- [ ] Ajouter des tests automatiques sur les missions et les validations

### 3. Nouvelles fonctions
- [ ] Date limite d'une mission + rappel
- [ ] Tableau de performance par opérateur, export Excel / PDF
- [ ] Notifications (téléphone / e-mail) à la validation ou au refus
- [ ] Envoi de gros fichiers par lien qui expire (option Google Drive à décider)
- [ ] Rôle supplémentaire (chef d'équipe)
- [ ] Recherche et filtres dans l'historique
- [ ] Pastille rouge dans le menu pour les publications en attente

### 4. Pour le CV
- [ ] Accueil public ou compte de démonstration
- [ ] Fiche d'explication courte du site
- [ ] Captures d'écran dans le README

## 3. Questions ouvertes (défaut si pas de réponse)
1. Les commentaires des employés partent-ils aussi en validation ? Défaut : non.
2. Compression `gzip` des fichiers texte ? Défaut : non.

## Historique des mises à jour
- 2026-10-11 : liste créée, aucune étape commencée.
- 2026-10-11 : étapes A (d888eb4) et B (7f5cce7) faites, `npm run build` et `tsc --noEmit` sans erreur. `df-api` pas encore redéployé à ce moment-là.
- 2026-10-11 : `df-api` redéployé en v3 (commit `d888eb4`), empreinte du fichier GitHub vérifiée identique. Aucun appel réel testé (réseau de Claude bloqué vers supabase.co) : à tester par BTK (publier avec photo en admin, puis en employé).
- 2026-10-11 : étape C faite (FeedView.tsx : file « À valider », boutons Valider / Refuser avec motif). `tsc --noEmit` et `npm run build` sans erreur. Pas testé à l'écran.
- 2026-10-11 : étape D faite (FeedView, LightboxModal, FileViewerModal, attachments.ts). `tsc --noEmit` et `npm run build` sans erreur. Pas testé à l'écran. Télécharger : si le navigateur refuse, le fichier s'ouvre dans un nouvel onglet.
- 2026-10-11 : étapes E et F faites (FeedView.tsx, store.ts). `tsc --noEmit` et `npm run build` sans erreur. Pas testé à l'écran.
- 2026-10-11 : lot 2 fait (BottomNav.tsx, App.tsx, TopBar.tsx). `tsc --noEmit` et `npm run build` sans erreur. Pas testé à l'écran.
- 2026-10-11 : Messagerie redessinée (ChatView.tsx) : liste avec avatars, heure, non lus et recherche ; bulles arrondies bleu marine / blanches ; détails (heure, modifié, Pas encore vu / Vu / Vu par N) sous la bulle ; menu d'actions collé sous le message (appui long ou clic droit) ; bouton « nouveaux messages » et défilement automatique ; ligne « épinglé » de 10 px. Actualités : punaise colorée avec mini texte « Épinglée ». Nom et photo cliquables vers le profil (messagerie et Actualités). Le téléphone n'apparaît plus sur le profil d'un autre booster (admin et soi-même seulement). `tsc --noEmit` et `npm run build` sans erreur. Pas testé à l'écran.
- Limites connues : pas de « reçu » (le serveur ne garde que « lu ») ni de « en train d'écrire ». Les non lus se comptent à partir de la première ouverture de la nouvelle messagerie, sur cet appareil. Les fenêtres « Nouvelle discussion » et « Infos du groupe » (ChatDialogs.tsx) gardent l'ancien style.
- 2026-10-11 : nettoyage Delta (1a42c72, 85d8e16) : Kanban, menu, Réglages, tableau de bord. `tsc --noEmit` et `npm run build` sans erreur. Pas testé à l'écran. Base vérifiée : 10 missions, aucun poste Delta.
- 2026-10-11 : connexion, inscription et mot de passe oublié redessinés (LoginView.tsx, modèle « carte flottante sur fond bleu ») : même logique, mêmes champs et messages ; trois écrans dans la même carte ; Jour / Nuit en gros boutons ; icônes et œil dans les champs. Les champs arrondis (connexion, recherche de la messagerie et de la barre du haut) ont un arrondi forcé en ligne, car `index.css` impose 10 à 14 px à tous les `input`. `tsc --noEmit` et `npm run build` sans erreur. Pas testé à l'écran.
- 2026-10-11 : boutons rectangulaires arrondis (règle globale en fin de `index.css`, 12 px, seulement les boutons avec fond ou bord et sans arrondi ; lignes de liste exclues) ; menu de gauche en carte flottante (marge, coins très arrondis, entrées en pilules, tuiles rondes pour les icônes, profil en petite carte) ; largeur réservée `--sbw` = 19 rem (5,5 rem réduit) ; sur téléphone le menu ne répète plus Actualités, Messages, Calendrier, Validations (admin) / Mon poste (booster) car ils sont dans la barre du bas. `tsc --noEmit` et `npm run build` sans erreur. Pas testé à l'écran.
- 2026-10-11 : menu ouvert sur téléphone : fond flou clair (au lieu du noir) et logo en bleu vif avec icône blanche forcée. `tsc --noEmit` et `npm run build` sans erreur. Pas testé à l'écran.
- 2026-10-11 : correction de la règle « boutons arrondis » (elle excluait par erreur tout bouton dont la classe contient border-blue, border-transparent, etc. ; maintenant seuls les vrais border-b / border-t sont exclus) ; thème clair : couleurs de texte pâles (-100 et -200) recolorées pour rester lisibles ; Réglages : cartes, boutons, étiquettes et encadrés d'erreur / succès arrondis et lisibles. `tsc --noEmit` et `npm run build` sans erreur. Pas testé à l'écran.
- 2026-10-11 : Réglages (Équipe) et page Équipe en vocabulaire Gestion Pro : « Début de session » / « Fin de session » devenus « Début de mission » / « Fin de mission » (aussi dans les pastilles de la colonne Activité), pastille et case « Avance » retirées, « page Employés » devenue « page Équipe ». Les horaires « Vacations » et l'accès par heures ne changent pas. `tsc --noEmit` et `npm run build` sans erreur. Pas testé à l'écran.
- 2026-10-17 : documents mis à jour (README, AI_STUDIO, PROJET, LIRE_EN_PREMIER, CLAUDE/AGENTS/GEMINI) et liste d'améliorations ajoutée (section 2 quater). Aucun code changé.
