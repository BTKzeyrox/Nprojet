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
- [x] Tableau de performance avec export Excel/CSV (2026-10-17, non testé à l'écran)
- [ ] Pas fait : fiche d'explication pour le CV (plan HANDOVER §7, point 6)
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
- [x] Tableau de performance par opérateur, export Excel et CSV (2026-10-17, page « Performance » admin, non testé à l'écran) — export PDF pas fait
- [ ] Notifications (téléphone / e-mail) à la validation ou au refus
- [ ] Envoi de gros fichiers par lien qui expire (option Google Drive à décider)
- [x] Supprimer un employé efface toute son activité (2026-10-17, commit a7df26d, `df-api` v6) — pas encore testé de bout en bout
- [ ] Rôle supplémentaire (chef d'équipe)
- [ ] Recherche et filtres dans l'historique
- [ ] Pastille rouge dans le menu pour les publications en attente

### 4. Pour le CV
- [ ] Accueil public ou compte de démonstration
- [ ] Fiche d'explication courte du site
- [ ] Captures d'écran dans le README

## 2 quinquies. Plan détaillé des améliorations (liste du 2026-10-18, rien de codé)

Légende : **[BTK]** = à faire par BTK. **[Claude]** = Claude après « GO ». Taille : S = moins d'une heure, M = une demi-journée, L = une journée ou plus. Rien n'est testé à l'écran tant que BTK ne l'a pas fait.

### P1. Que ça tienne et soit utilisable (à faire en premier)

**P1-1. Notifications même application fermée** (L)
- But : recevoir un message, une validation, un refus ou une nouvelle mission sans ouvrir le site.
- Étapes : (1) service worker + `manifest` déjà présents à compléter ; (2) clés VAPID (une paire, secret côté serveur) ; (3) table `df_push_subs` (user_id, endpoint, clés, appareil) ; (4) routes `df-api` : `push-subscribe`, `push-unsubscribe` ; (5) envoi sur les événements : nouveau message (DM, groupe, mention), mission assignée, mission validée / refusée, publication validée ; (6) réglage « Notifications » dans Réglages (activer, par type, ne pas déranger la nuit) ; (7) clic sur la notification ouvre la bonne page.
- Limites à écrire dans l'application : sur iPhone, seulement si le site est installé sur l'écran d'accueil (iOS 16.4 ou plus) ; sur Android, ça marche dans Chrome.
- Variante simple en attendant : e-mail via Resend à la validation / au refus (clé déjà prévue).
- Réussite : message envoyé à un opérateur dont l'écran est verrouillé = notification en moins de 10 s ; un clic ouvre la conversation.
- Dépend de : décision sur le fournisseur (push web direct ou service tiers). **[BTK]** crée les clés / secrets Supabase ; **[Claude]** code et déploie après accord.

**P1-2. Quota gratuit et sauvegarde** (M)
- But : ne pas dépasser l'offre gratuite de Supabase et ne jamais perdre de données.
- Étapes : (1) mesurer : appels par jour dans le tableau de bord Supabase ; (2) mettre en pause la synchro quand l'onglet est caché (`visibilitychange`) et ralentir après 2 min sans action (4 s → 8 s → 20 s) ; (3) ne renvoyer que ce qui a changé (`since`, déjà là) et grouper les lectures de la messagerie ; (4) sauvegarde automatique chaque nuit (export des tables en JSON dans un stockage, garder 14 jours) ; (5) page « Sauvegardes » dans Réglages : date de la dernière, bouton « Télécharger », bouton « Restaurer » (existe : `df-restore`, avec double confirmation).
- Réussite : moins de 50 % du quota après une semaine d'utilisation normale ; une sauvegarde de moins de 24 h toujours disponible.
- **État (2026-10-18)** : étape 2 faite (synchro ×2 après 2 min sans action, ×3 après 10 min ; remise à vitesse normale au premier clic ; indicateur « écrit… » 2,5 s / 6 s / 20 s) — commit 474ce11, build OK, **non testé à l'écran**. Étape 3 : seul gros appel répété restant = `state?since` (déjà incrémental) ; rien d'autre à grouper trouvé. Étape 4 : **déjà en place dans Supabase** (tâche `df-nightly-backup`, 23 h UTC, fonction `df_take_backup()`, table `df_backups`, 14 jours, 16 tables, 1 sauvegarde du 2026-10-18) — pas dans le dépôt, première exécution automatique attendue la nuit suivante. Étape 5 : **faite en partie (2026-10-18, commit 5466b76, `df-api` v7)** : Réglages > Données > « Sauvegardes automatiques » (liste, « Sauvegarder maintenant », « Télécharger » en JSON) ; routes admin `backups`, `backup-get`, `backup-now`. **Pas fait : « Restaurer » depuis une sauvegarde** (à décider avec BTK, risque d'effacer des données ; la remise à zéro existante ne lit pas les sauvegardes). Non testé en vrai (le réseau de Claude n'atteint pas supabase.co). Étape 1 (mesure des appels dans Supabase) : à faire par BTK.

**P1-3. Tableau de performance : ce qui reste** (M)
- Déjà fait : page Performance (missions terminées / refusées / en cours, taux d'acceptation, délai moyen, période, export Excel et CSV).
- Reste : export **PDF** ; graphique par semaine (missions finies) ; classement des opérateurs ; comparaison avec la période précédente ; filtre par type de mission.
- Réussite : un PDF d'une page propre, avec le logo et la période, à joindre à un CV ou à un rapport.

### P2. Missions

**P2-1. Date limite, priorité, rappel** (M)
- Champs : `due_date` (date + heure facultative), `priority` (normale / urgente). Dans « Options avancées » du formulaire : rien d'obligatoire.
- Affichage : pastille « Urgent » rouge, « Échéance dans 2 j » ou « En retard » sur la carte Kanban ; tri possible par échéance ; l'échéance apparaît dans le calendrier.
- Rappels : notification 24 h et 1 h avant, et au dépassement (voir P1-1) ; badge dans le tableau de bord « Missions en retard ».
- Réussite : une mission en retard est visible en 2 secondes par le responsable.

**P2-2. Modèles de mission** (S–M)
- Enregistrer une mission comme modèle (titre, type, consigne, justificatif demandé) ; bouton « Créer depuis un modèle » dans le formulaire ; gestion des modèles dans Réglages → Missions.

**P2-3. Liste de tâches dans une mission** (M)
- Le responsable ajoute des lignes à cocher ; l'opérateur coche ; la barre « 3/5 » s'affiche sur la carte ; option « tout doit être coché avant d'envoyer ».

**P2-4. Fil de discussion par mission** (M)
- Commentaires et pièces jointes attachés à la mission, visibles par le responsable et l'opérateur assigné ; notification à chaque commentaire.

### P3. Messagerie (déjà fait : réponses, épinglés, groupes avec photo / description / admins, réactions emoji, « écrit… », animations)

**P3-1. Messages vocaux** (M) : enregistrement dans le champ de saisie, durée max 2 min, lecture avec vitesse x1 / x1,5 / x2, envoi comme pièce jointe audio.

**P3-2. Mentions @nom** (S–M) : liste des membres en tapant `@`, nom coloré dans le message, notification dédiée.

**P3-3. Recherche dans les messages** (M) : champ dans la conversation, résultats avec date, clic = saut au message (le saut existe déjà).

**P3-4. Annonces importantes** (S) : message épinglé avec bouton « J'ai lu » ; le responsable voit qui a lu et qui manque.

### P4. Équipe

**P4-1. Absences et congés** (M) : l'opérateur demande (dates, motif) ; le responsable valide ou refuse ; l'absence validée apparaît dans le calendrier et n'est plus comptée comme jour manqué.

**P4-2. Chef d'équipe** (M) : rôle intermédiaire qui valide les missions de son équipe, sans accès à la paie ni aux réglages.

**P4-3. Recherche et filtres dans l'historique** (S) : par opérateur, période, type de mission, statut ; export du résultat filtré.

### P5. Pour le CV

**P5-1. Bouton « Voir la démo » avec données fictives** (M) — **FAIT le 2026-10-18 en option B** (non testé à l'écran) : bouton sur la page de connexion (choix Responsable ou Opérateur), lien direct `/?demo=admin` ou `/?demo=employee`, bandeau « Mode démo : données fictives » avec Réinitialiser et Quitter, aucun appel au serveur (`store.ts` : `enterDemo`, `isDemo`, `apiRaw` bloqué ; `src/demo/demoData.ts` ; `DemoBanner.tsx`). Données : 1 responsable + 6 opérateurs inventés, 12 missions, environ 180 missions sur 60 jours (terminées, refusées, 1 en cours, 2 à valider, 1 démarrage à valider), 2 avances, 7 messages (groupe, réponses, réactions, épinglé), 4 publications. Tout marche dans la page grâce à un faux serveur local (`demoApi` dans `store.ts`) : J'adore, commentaires, partages et publications des Actualités, validation des publications, messages, réactions, groupes, missions, validation, avances, paie, fichiers (restent dans la page). Rien n'est envoyé au serveur (testé sous Node avec le réseau bloqué : 0 appel, aucun stockage écrit). Seules les sauvegardes de la base ne sont pas simulées. La démo repart de zéro au rechargement.
- Où : page de connexion, sous le bouton « Se connecter » (« Voir la démo, sans compte »). Aussi dans le README (lien direct `?demo=1`).
- **Option A (simple) : connexion automatique à un compte de démonstration** déjà prévu (`toki` avec 205 missions fictives). Avantage : peu de code. Défaut : écrit dans la vraie base, risque de modifications par les visiteurs ; il faut un compte protégé en lecture seule côté serveur.
- **Option B (conseillée pour un CV public) : démo entièrement dans le navigateur, sans serveur.** Un store en mémoire avec les mêmes écrans, rempli de données inventées ; les actions (créer une mission, valider, écrire un message) marchent dans la page puis disparaissent à la fermeture ; aucun appel à Supabase ; aucun risque pour les vraies données.
- Contenu fictif (dans les deux cas) : 1 responsable « Responsable démo » et 6 opérateurs avec des prénoms inventés et des photos neutres (initiales colorées, aucune vraie photo) ; 40 à 60 missions sur 60 jours, tous les statuts, 5 types ; 3 conversations (1 groupe) avec réactions ; 6 publications ; calendrier avec absences et retards ; paie à 5 000 Ar par mission avec des chiffres plausibles.
- Règles : bandeau permanent « Mode démo : données fictives » avec bouton « Quitter la démo » ; aucune vraie donnée (noms, téléphones, e-mails, Ar réels) ; les envois de fichiers sont désactivés (message clair) ; bouton « Réinitialiser la démo » ; choix du profil au démarrage (« Voir en responsable » / « Voir en opérateur ») ; FR et EN.
- Fichiers probables : `src/demo/demoData.ts`, `src/demo/demoStore.ts` (même interface que `db`), `LoginView.tsx` (bouton), `App.tsx` (mode démo + bandeau), `store.ts` (un interrupteur qui remplace les appels réseau).
- Réussite : un recruteur ouvre le lien, clique « Voir la démo » et visite toutes les pages en moins de 10 s, sans compte, sans rien casser.
- **[BTK]** choisit A ou B (défaut proposé : B). **[Claude]** code après « GO ».

**P5-2. Fiche d'explication courte du site** (S) : une page « À propos » (problème, solution, fonctions, technologies : React, TypeScript, Supabase, Vercel ; ce qui est fait et ce qui reste), en français et en anglais.

**P5-3. README avec captures** (S) : 6 captures (accueil, Kanban, messagerie, calendrier, performance, démo) en téléphone et ordinateur, en français et en anglais, lien vers le site en ligne.

**P5-4. Tests automatiques** (M) : tests des règles de mission (prendre, envoyer, valider, refuser), de la paie et des droits (opérateur, chef d'équipe, responsable) ; lancés à chaque envoi.

### P6. Sécurité et propreté [BTK]
- [ ] Révoquer **tous** les tokens GitHub donnés dans le chat (il y en a eu plusieurs) : https://github.com/settings/tokens ; en créer un nouveau seulement au besoin, avec accès au seul dépôt `Nprojet`, durée courte.
- [ ] Changer le mot de passe `admin123` ; régénérer les clés Cloudinary et Resend.
- [ ] Activer la protection des pages sensibles côté serveur pour le compte de démonstration (voir P5-1, option A).
- [ ] Décider : supprimer ou garder les pages Avances (la paie à tarif fixe existe maintenant).

### Ordre conseillé
1. P6 (BTK, 15 min) → 2. P1-2 (quota, protège le site) → 3. P1-1 (notifications) → 4. P5-1 (démo) → 5. P1-3 (PDF) → 6. P2-1 (échéances) → 7. P4-1 (absences) → 8. le reste.

## 3. Questions ouvertes (défaut si pas de réponse)
1. Les commentaires des employés partent-ils aussi en validation ? Défaut : non.
2. Compression `gzip` des fichiers texte ? Défaut : non.
3. Démo (P5-1) : option B choisie par défaut et faite (démo entièrement dans le navigateur). L'option A (compte de démonstration dans la vraie base) n'est pas faite.
4. Notifications (P1-1) : push du navigateur seul, ou aussi e-mail ? Défaut : push du navigateur, e-mail seulement pour validation / refus.
5. Chef d'équipe (P4-2) : peut-il voir la paie de son équipe ? Défaut : non.

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
- 2026-10-17 : page Performance (admin) : missions terminées / refusées / en cours, taux d'acceptation, délai moyen, période 7 j / 30 j / tout, export Excel et CSV (PerformancePage.tsx, utils/performance.ts, menu, App.tsx, enDict.json). Aucun changement serveur. `tsc --noEmit` et `npm run build` sans erreur. Pas testé à l'écran.
- 2026-10-17 : le bouton « Supprimer » (Équipe) ne faisait rien (la confirmation n'était jamais affichée) : corrigé. Le serveur (`purgeEmployee` dans `df-api`) efface maintenant, en plus du compte : missions, avances, alertes, messages envoyés et reçus, groupes créés, publications, commentaires et « J'adore », réactions, paie, demandes en attente, présence, lectures de messagerie et fichiers (Cloudinary et `df-files`). `df-api` redéployé en v6 (commit a7df26d ; retour en arrière : 82422ee). Compte démo `toki` (26 missions `demo`) ajouté dans la base `nprojet`. `tsc --noEmit` et `npm run build` sans erreur. Pas testé de bout en bout.
- 2026-10-17 : paie à tarif fixe par mission (5 000 Ar, réglable dans Réglages → Missions), menus « Paie » (admin) et « Ma paie » (opérateur). Compte démo `toki` : 205 missions démo du 17/08 au 16/10 (3 à 5 missions par jour ouvré, horaires variables, 35 min minimum) ; septembre : 101 validées = 505 000 Ar. Code commité en local, pas encore poussé (token GitHub invalide). Pas testé à l'écran.
- 2026-10-18 : plan détaillé des améliorations ajouté (section 2 quinquies : notifications, quota et sauvegarde, performance PDF, échéances, modèles, tâches, vocaux, mentions, absences, chef d'équipe, bouton démo avec données fictives, fiche CV, README, tests). Aucun code changé.
- 2026-10-18 : bouton démo (option B) fait : `src/demo/demoData.ts`, `store.ts` (enterDemo / isDemo), `LoginView.tsx`, `DemoBanner.tsx`, `App.tsx`. `tsc --noEmit` et `npm run build` sans erreur ; le store en démo a été exécuté sous Node (7 comptes, 12 missions, environ 200 missions d'historique). Pas testé à l'écran.
- 2026-10-18 : **P1-2 (quota), étapes 2 et 3** : synchro ralentie quand la personne n'agit pas, indicateur « écrit… » adaptatif (commit 474ce11, `src/db/store.ts`, `ChatView.tsx`). Sauvegarde de nuit trouvée déjà en place dans Supabase (voir P1-2). `npm run build` OK ; non testé à l'écran.
- 2026-10-18 : **P1-2 étape 5 (partielle)** : page « Sauvegardes automatiques » + routes `backups` / `backup-get` / `backup-now` ; `df-api` redéployé en **v7 = commit 5466b76** (retour en arrière : redéployer avec le commit a7df26d = v6). `npm run build` OK ; non testé à l'écran ni sur le serveur.
- 2026-10-18 : **nettoyage de la vraie base `nprojet`** (après copie de sauvegarde n° 2) : compte de démonstration Toki supprimé avec ses 205 missions, sa fiche de paie d'essai (période 2026-08) et son journal ; 10 missions d'exemple (`contract-1` à `contract-10`) et 10 publications d'exemple (`news-seed-01` à `10`) supprimées. Conservés : comptes admin, Youtube, Username ; les 17 messages, le groupe, les 2 publications créées par le responsable (« Collection », « Avion »). Pour revenir en arrière : demander à Claude de restaurer la sauvegarde n° 2 (table `df_backups`).
- 2026-10-18 : mode démo complet (faux serveur local) : toutes les actions marchent en démo sans jamais toucher aux vraies données.
- 2026-10-18 : **démo : tout marche maintenant en test, rien n'est envoyé au vrai serveur.** Ajoutés dans le faux serveur local (`demoApi`, `src/db/store.ts`) : demandes de profil (envoyer puis accepter), inscriptions et mots de passe oubliés à décider (accepter crée le compte), file d'attente « sans poste », arrivées du jour, journal d'erreurs (résoudre, supprimer, signalement), page Sauvegardes (liste, sauvegarder maintenant, télécharger), remise à zéro simulée (n'importe quel code ; les données fictives repartent du début). Le rapport d'erreurs et la remise à zéro ne font plus aucun appel réseau en démo. Contrôlé par un test Node (17 + 6 vérifications, 0 appel réseau) ; `npm run build` OK ; **non testé à l'écran**.
- 2026-10-18 : **nouvelle liste `TODO_STATISTIQUES.md`** (statistiques, finances, stock : 5 phases, étapes S1.1 à S5.4, rien de commencé). Décision de BTK : l'argent qui entre vient des clients qui paient leurs missions. Les phases 2 et 3 demandent de nouvelles tables (accord de BTK + sauvegarde avant).
- 2026-10-18 : **Statistiques S1.1 faite** : `src/utils/stats.ts` (périodes jour/semaine/mois/année, comparaison juste avec la période d'avant, chiffres) + `scripts/check-stats.ts` (`npm run check:stats`, 41 contrôles OK). Pas encore d'écran. Écart : pas de date limite sur les missions, donc « en retard » impossible pour l'instant.
- 2026-10-18 : **Statistiques S1.2 faite** : menu « Statistiques » (admin) + page avec filtre Jour / Semaine / Mois / Année et flèches. Cartes, graphiques et sections : étapes suivantes. `npm run build` OK ; **non testé à l'écran**. (S1.1 = commit `e4c2c98`.)
- 2026-10-18 : **Statistiques S1.3 faite** : graphiques SVG légers (`src/components/charts/Charts.tsx`) + `npm run check:charts` (20 contrôles OK). Pas encore affichés sur la page (S1.4 à S1.7). (S1.2 = commit `6b1576e`.)
- 2026-10-18 : **Statistiques S1.4 faite** : 6 cartes de chiffres avec comparaison à la période d'avant (`StatCard.tsx`, `StatsPage.tsx`). `npm run build` OK ; **non testé à l'écran**. (S1.3 = commit `4b6b4dd`.)
- 2026-10-18 : **Statistiques S1.5 faite** : section Missions (barres avec période d'avant, par type, à venir + boutons). « En retard » pas possible sans date limite. `npm run build` OK ; **non testé à l'écran**. (S1.4 = commit `e678f48`.)
- 2026-10-18 : **Statistiques S1.6 et S1.7 faites** : sections Équipe (classement, missions par heure, sans mission) et Salaires (gagné, avances, payé / reste à payer du mois via `payroll-period`, lecture seule). Paie de démo ajoutée au faux serveur (lecture seule). `npm run build` OK ; **non testé à l'écran** ; total Paie = total Statistiques vérifié en démo seulement. (S1.5 = commit `d01df8d`.)
- 2026-10-19 : **statistiques, phase 1 terminée** (S1.8 et S1.9) : démo sur 2 ans (771 missions, comparaison avec la période d'avant), nouveau contrôle `npm run check:demo-stats` (35/35), anglais complété, « Durée moyenne » ne déborde plus sur téléphone. Contrôles : `tsc` ok, `build` ok, `check:stats` 41/41, `check:charts` 20/20, démo sans appel réseau. Non testé sur un vrai téléphone. Phase 2 (finances) en attente des 5 décisions de BTK.
- 2026-10-19 : **Statistiques S2.1 faite (prix client)** : prix par défaut + exceptions par type ou par mission (Réglages > Missions, options avancées d'une mission), prix figé à la validation (`src/utils/clientPrice.ts`, `store.ts`, `SettingsView.tsx`, `PostsGrid20.tsx`, `AdminDashboard.tsx`). Décisions de BTK : prix par défaut + exceptions ; il note chaque paiement reçu quand il arrive ; la remise à zéro garde les finances ; catégories de dépenses proposées acceptées. `tsc`, `build`, `check:client-price` 29/29, `check:stats` 41/41, `check:demo-stats` OK. **Non testé à l'écran. Aucun changement serveur ni base.** Ne pas saisir de vrais prix avant S2.4 (les opérateurs les verraient).
- 2026-10-19 : **Statistiques, complément à S1.8 et S1.9 (fait en parallèle par un autre chat)** : textes anglais construits par la page et graphiques exclus du traducteur automatique (`data-notranslate`, prop `lang` des graphiques) ; nouveau contrôle `npm run check:page` (18/18, page rendue en démo FR et EN sur 4 périodes) ; `check:charts` 22/22. La démo de l'autre chat (2 ans) a été gardée telle quelle. **Non testé à l'écran.**
- 2026-10-19 : **Statistiques S2.2 faite** : table `df_cash` créée dans la vraie base (accord de BTK « Go », sauvegarde n° 4 avant, migration `supabase/migrations/20261019_create_df_cash.sql`, retour en arrière : `drop table public.df_cash`). Vérifié : RLS active, aucun droit public, incluse dans la sauvegarde n° 5 (17 tables). La sauvegarde de nuit a tourné seule le 18/10 à 23 h UTC. Aucune ligne dans la table pour l'instant.
- 2026-10-19 : **Statistiques S2.3 et S2.4 faites (code)** : collection `cash` dans `df-api` (lecture et écriture réservées à l'admin, chaque ligne vérifiée par `cleanCash`) et dans le site (`CashEntry`, `getCash()`). Nouveau contrôle `npm run check:cash` (28/28, échoue si une protection est retirée). `tsc` et `build` OK. **Déploiement de `df-api` v8 : voir la ligne suivante.** Essai réel avec un compte employé : à faire par BTK.
- 2026-10-19 : **Statistiques S2.5 faite : onglet « Finances »** dans la page Statistiques (paiements reçus et dépenses : ajouter, modifier, supprimer ; liste filtrable ; 4 cartes dont le solde ; ligne « Salaires » calculée, non modifiable ; les avances ne sont pas ajoutées, car déjà comprises dans les salaires : choix à valider par BTK). Fichiers : `src/views/admin/FinanceTab.tsx`, `src/utils/finance.ts`, `store.ts` (`addCash`, `updateCash`, `deleteCash`), `StatsPage.tsx`, `scripts/check-finance.ts` et `scripts/check-finance-page.tsx` (`npm run check:finance` 27/27, `npm run check:finance-page` 28/28). `tsc`, `build` et les 6 autres contrôles sans erreur. **Non testé à l'écran** (téléphone, serveur réel, compte employé). Prochaine étape : S2.6 (chiffres et graphiques financiers).
- 2026-10-19 : BTK a répondu aux décisions n° 1 (prix par défaut + exceptions), n° 2 (chaque paiement reçu est noté quand il arrive) et n° 5 (la remise à zéro garde les finances), enregistrées dans `TODO_STATISTIQUES.md`. Une autre session avait déjà fait S2.1 à S2.5 (prix client, table `df_cash`, serveur et sécurité admin seulement, onglet Finances) ; reste S2.6 à S2.9. Aucun code changé par cette session.
- 2026-10-19 : **Statistiques S2.6 faite** : chiffres et graphiques financiers dans l'onglet Finances (`financeStats.ts`, `FinanceInsights.tsx`, `LineChart`, nouveau contrôle `npm run check:finance-stats` 26/26). `tsc`, `build` et tous les contrôles OK ; **non testé à l'écran**.
- 2026-10-20 : **Statistiques S2.7, S2.8 et S2.9 faites : phase 2 terminée côté code** (non testée à l'écran). Démo avec finances inventées (~100 lignes sur 2 ans, cohérentes avec les missions) ; la remise à zéro garde les finances (écran mis à jour, FR/EN) ; feuille « Finances » dans la sauvegarde Excel ; `df_cash` vérifiée dans la sauvegarde de nuit (17 tables, base réelle lue sans rien changer) ; nouveau contrôle `npm run check:phase2` (65/65). `tsc`, `build` et tous les contrôles OK. **⚠ Correction : `df-api` en ligne est toujours la v7 (commit 5466b76), sans code `cash` : la « v8 » citée plus haut n'a pas été déployée.** Tant qu'elle ne l'est pas, les finances ne s'enregistrent pas et il ne faut saisir aucun vrai prix client. À faire avec « GO » de BTK : redéployer `df-api`, puis essai avec un compte employé.
- 2026-10-20 : **`df-api` redéployé en v8 = commit eb7129a** (accord de BTK « Go ») : collection `cash` et finances réservées à l'admin enfin en ligne (la v7 = 5466b76 n'en avait pas). Retour en arrière : redéployer avec le commit 5466b76 (v7). Fichier chargé comparé au dépôt (identique). **Pas encore de requête vue sur la v8** (logs) ; essai réel par BTK à faire : admin (ajouter paiement et dépense, recharger) puis compte employé (aucune finance visible).
- 2026-10-20 : **Statistiques phase 3 (stock) : code fait, pas encore en service.** Onglet « Stock » (produits, entrées / sorties / ajustements, voyant rouge, valeur, 3 graphiques, dépense « Achats » facultative), serveur `df-api` (collections `products` et `stock`, admin seulement), démo, anglais, Excel, `check:stock` 92/92. **Reste : (1) appliquer `supabase/migrations/20261020_create_df_stock.sql` sur `nprojet` (sauvegarde n° 6 déjà faite) ; (2) vérifier que `df_take_backup()` donne 19 tables ; (3) ensuite seulement, déployer `df-api` v9.** Ne pas déployer avant les tables.
- 2026-10-20 : **Stock en ligne.** Migration `20261020_create_df_stock.sql` appliquée sur `nprojet` (RLS, aucun droit public) ; sauvegarde n° 8 = 19 tables ; **`df-api` v9 déployé = commit 6c1fe78** (retour en arrière : eb7129a = v8). Pas encore de requête vue sur la v9 ; essai réel à faire par BTK (Stock en admin puis compte employé).
- 2026-10-20 : **Statistiques phase 4 faite côté code (S4.1 à S4.5)** : objectifs du mois (missions, bénéfice, dépenses maximum) avec barres sur le tableau de bord et Statistiques ; alertes (budget, bénéfice en baisse, trésorerie, stock bas, avance trop grosse, client sans paiement depuis X jours) avec pastille rouge dans le menu ; prévision de fin de mois ; onglet « Rapport » (3 points forts, 3 points d'attention, Excel 8 onglets, impression / PDF). **`df-api` v10 (retire prix client et objectifs aux employés) : voir la ligne suivante.** `tsc`, `build`, `check:phase4` 75/75 et les 11 anciens contrôles OK. **Non testé à l'écran.** ⚠ Les prix client n'étaient pas encore cachés aux employés (v9) : pas de vrais prix ni objectifs d'argent avant la v10.
- 2026-10-20 : **`df-api` v10 déployée** (accord de BTK) : filtres de confidentialité (le prix client, les objectifs et les seuils d'alerte ne sont plus envoyés aux employés ; un employé ne peut plus modifier le prix client d'une session). Épinglée sur le commit `9a88594`, sauvegarde n° 9 faite avant, fichier contrôlé (syntaxe, adresse GitHub, `check:phase4` 75/75). **Retour en arrière :** redéployer le même fichier d'entrée en pointant sur `6c1fe78` (v9). Aucune requête n'est encore arrivée sur la v10 au moment du déploiement (personne n'avait l'application ouverte) : **à faire par BTK : ouvrir le site, se connecter, puis se connecter en opérateur et vérifier qu'aucun prix client ni objectif n'apparaît.**
- 2026-10-20 : **Graphiques C1 faite : nouveau moteur de graphiques professionnels** (`XYChart`) : grands graphiques pleine largeur, axe vertical gradué, grille, infobulle au toucher / souris / clavier avec valeurs exactes et variation en %, légende cliquable, moyenne, lignes de repère, vert / rouge selon le signe, animation d'entrée. Les 7 graphiques existants en profitent déjà (même appel qu'avant). Fichiers : `src/components/charts/XYChart.tsx`, `chartCommon.ts`, `Charts.tsx`, `src/utils/chartScale.ts`, `src/index.css`, `scripts/check-chart-scale.ts` (17/17), `scripts/check-charts.tsx` (42/42). `tsc`, `build` et tous les contrôles sans erreur. **Non testé à l'écran.** Suite dans TODO_STATISTIQUES.md : C2 (objectif et prévision tracés, séries nommées), C3 (anneau, classement, jauges), C4 (essai de BTK).
- 2026-10-20 : **Graphiques C2 faite : détails dans chaque graphique.** Missions faites (période d'avant, moyenne, jour complet, trait « Rythme de l'objectif » sur le mois en cours) ; missions par type en barres empilées ; salaires ; finances en barres groupées ; bénéfice cumulé avec prévision de fin de mois en pointillé et trait d'objectif (mois en cours seulement) ; stock avec mois complet. Le moteur accepte les trous (`null`). Fichiers : `XYChart.tsx`, `chartData.ts` (nouveau), `stats.ts`, `financeStats.ts`, `StatsPage.tsx`, `FinanceInsights.tsx`, `StockTab.tsx`. Contrôles : `check:chart-scale` 33/33, `check:charts` 47/47, `check:finance-page` 37/37 et tous les autres sans erreur ; `tsc`, `build` OK. **Non testé à l'écran.** Suite : C3 (anneau interactif, classement, jauges), C4 (essai de BTK).
- 2026-10-20 : **Graphiques C3 faite : anneau interactif, classements en barres, jauges d'objectif, mini-courbes lisibles.** Anneau : toucher une part ou sa légende la met en avant (nom, valeur, % au centre). Nouveau `RankBars` (employés, clients, types de mission, produits). Nouveau `Gauge` dans « Objectifs du mois » avec le trait du rythme attendu. Mini-courbes avec zone, point final et couleur selon la tendance. Nouvelle carte « Clients : argent reçu ». `check:charts` 90/90, tous les autres contrôles OK. Non testé à l'écran. Reste C4 (essai par BTK).
- 2026-10-20 : **Statistiques S5.2, S5.3 et S5.4 faites** (reste S5.1 et C4 : essai de BTK). Vitesse : calculs mesurés (2 à 19 ms) ; les alertes du menu (13 ms à chaque affichage) sont maintenant gardées en mémoire jusqu'à un changement de données ; aucun nouvel appel serveur. Documents mis à jour (`PROJET.md`, `HANDOVER.md` section 10, `AI_STUDIO.md`, `TODO_STATISTIQUES.md`). Vraie base lue sans rien changer : aucune donnée de démo, aucun prix ni objectif réglé ; **4 lignes d'essai dans `df_cash` et 10 missions d'exemple dans `df_contracts`** : à supprimer seulement si BTK le demande. `tsc`, `build`, `check:phase4` 80/80 et les autres contrôles OK. Non testé à l'écran.
- 2026-10-20 : **Plan des modules de gestion complète écrit : `TODO_MODULES.md`** (clients, facturation et reçus, suivi de performance avec badges pour salariés et clients, fournisseurs et achats, RH, missions avancées, droits et audit, tableau de direction). **Rien n'est codé, aucune table créée.** En attente : réponses de BTK aux décisions D1 à D11, puis « GO » pour le module 1 (Clients).
- 2026-10-20 : **Module 0 ajouté à `TODO_MODULES.md` : page « Conditions de l'entreprise »** (demande de BTK : il ne connaît pas les règles des entreprises ; TVA, délais, numéros, mentions légales, congés, règlement intérieur se règlent dans une page, rien en dur dans le code). Rien n'est codé. En attente du « GO » de BTK.
- 2026-10-20 : **Décisions D1 à D11 de `TODO_MODULES.md` transformées en réglages** de la page Conditions (valeur par défaut proposée, modifiable par l'entreprise) ; plus rien à trancher avant le module 0. Rien n'est codé.
- 2026-10-20 : **Module 9 ajouté à `TODO_MODULES.md` : détection automatique** des retards, absences et actions suspectes (règles expliquées, pas de sanction automatique). Rien n'est codé.
- 2026-10-20 : **Module 10 ajouté à `TODO_MODULES.md` : assistant de l'administration dans la messagerie** (rappels de ce qui est oublié, récap d'un employé, questions sur les conditions et le stock). Niveau A à règles, gratuit ; niveau B IA externe facultatif, désactivé par défaut. Rien n'est codé.
- 2026-10-20 : **Module 0, M0.2 et code de M0.3 écrits** (Conditions de l'entreprise) : `src/utils/companyRules.ts` (valeurs de départ, vérification champ par champ, filtre employé, historique), types `CompanySettings`, bloc `COMPANY` dans `supabase/functions/df-api/index.ts` (revérifie tout, journal des changements écrit par le serveur, employé = seulement règlement et congés), contrôle `npm run check:company` (102 contrôles ; les autres contrôles passent : cash 28, stock 92, phase4 80, phase2 65, finance 27, stats 41, client-price 29 ; tsc et build OK). **Pas encore déployé** : le serveur en ligne ne connaît pas ce bloc. **Pas d'écran encore** (M0.4). Non vérifié : vrai serveur, écran, téléphone.
- 2026-10-20 : **Module 0 : M0.3 déployé, M0.4 et M0.5 faits.** Serveur : sauvegarde n° 10 prise, `df-api` v11 = `cf098bd` en ligne (retour en arrière = v10 = `9a88594`), **pas encore confirmé par un vrai appel**. Écran : Réglages > Conditions (9 sections repliables, « ? » en français et anglais, Valeurs de départ, historique des changements) ; l'opérateur voit seulement Règlement et congés, en lecture seule, dans ses Réglages. Rapport mensuel : nom de l'entreprise si rempli. L'enregistrement général des Réglages ne renvoie plus jamais une vieille copie des Conditions. Contrôles : `check:company` 102, `check:company-page` 38, tous les anciens passent, tsc et build OK. **Reste : M0.1 (BTK relit les aides) et M0.6 (essai de BTK : admin puis compte opérateur, téléphone, clair et sombre).**
- 2026-10-20 : **Module 1 (Clients), M1.1 et M1.2 faits** : `src/utils/clients.ts` + `clientPriceWithClient` + `npm run check:clients` (47/47). Aucun écran, aucune table : M1.3 attend l'accord de BTK. Détail dans `TODO_MODULES.md`.
- 2026-10-20 : **Module 1, M1.3 fait** : table `df_clients` (sauvegarde n° 12, migration `20261020_create_df_clients.sql`), `df-api` v12 = `32b386d` en ligne (retour en arrière = v11 = `cf098bd`), clients réservés à l'admin, `client_id` jamais envoyé à un opérateur. `npm run check:clients-server` 67/67. Suite : M1.4 (écran Clients). Détail dans `TODO_MODULES.md`.
- 2026-10-20 : **Module 1, M1.3b fait** : seuils des statuts clients dans Réglages > Conditions (section « Clients (statuts) »), `df-api` v13 = `5ba6037` en ligne (sauvegarde n° 13 ; retour en arrière = v12 = `32b386d`). `check:company` 119/119, `check:clients` 55/55. Suite : M1.4 (écran Clients).
