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
- **État (2026-10-18)** : étape 2 faite (synchro ×2 après 2 min sans action, ×3 après 10 min ; remise à vitesse normale au premier clic ; indicateur « écrit… » 2,5 s / 6 s / 20 s) — commit 474ce11, build OK, **non testé à l'écran**. Étape 3 : seul gros appel répété restant = `state?since` (déjà incrémental) ; rien d'autre à grouper trouvé. Étape 4 : **déjà en place dans Supabase** (tâche `df-nightly-backup`, 23 h UTC, fonction `df_take_backup()`, table `df_backups`, 14 jours, 16 tables, 1 sauvegarde du 2026-10-18) — pas dans le dépôt, première exécution automatique attendue la nuit suivante. Étape 5 : pas faite (aujourd'hui seulement « Sauvegarder (Excel) » et la remise à zéro dans Réglages ; rien pour lister, télécharger ou restaurer les sauvegardes de nuit). Étape 1 (mesure des appels dans Supabase) : à faire par BTK.

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

**P5-1. Bouton « Voir la démo » avec données fictives** (M) — **FAIT le 2026-10-18 en option B** (non testé à l'écran) : bouton sur la page de connexion (choix Responsable ou Opérateur), lien direct `/?demo=admin` ou `/?demo=employee`, bandeau « Mode démo : données fictives » avec Réinitialiser et Quitter, aucun appel au serveur (`store.ts` : `enterDemo`, `isDemo`, `apiRaw` bloqué ; `src/demo/demoData.ts` ; `DemoBanner.tsx`). Données : 1 responsable + 6 opérateurs inventés, 12 missions, environ 180 missions sur 60 jours (terminées, refusées, 1 en cours, 2 à valider, 1 démarrage à valider), 2 avances, 7 messages (groupe, réponses, réactions, épinglé), 4 publications. Limites connues : les actions qui passent par le serveur (J'adore, commentaires et partages des Actualités, clôture d'une période de paie, envoi de fichiers) répondent « Mode démo : action non disponible » ; la démo repart de zéro au rechargement.
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
