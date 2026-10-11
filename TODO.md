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
- [ ] Nouveau design : formes arrondies, fond clair, bleu marine (lot 1, pas commencé)
- [x] Lot 2 : barre du haut arrondie et barre du bas (téléphone : Actualités, Messages, Calendrier, Validations ou Mon poste, Menu) — fait le 2026-10-11, non testé à l'écran. La barre du bas est masquée dans la messagerie (champ de saisie).
- [ ] Pages de menu : Messagerie, Historique, Validation, Équipe, Calendrier, Avances et paie, Réglages, Erreurs, Profil, Connexion

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
