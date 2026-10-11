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

### C. Validation par l'admin
- [ ] File « À valider » en haut du fil, avec aperçu complet
- [ ] Valider ou Refuser, motif visible par l'employé
- [ ] Pastille « En attente de validation » côté employé

### D. Commentaires et visionneuse
- [ ] Commentaires avec image ou fichier
- [ ] Visionneuse : Retour, zoom, précédent/suivant, Télécharger
- [ ] Aperçu des fichiers avec Retour et Télécharger

### E. Barre d'actions et dynamique
- [ ] J'adore / Commenter / Partager sur une ligne, police réduite
- [ ] Mise à jour automatique, pastille « Nouvelles publications », réaction immédiate

### F. Contrôle final
- [ ] `npm run build` sans erreur à chaque étape
- [x] Redéploiement de `df-api` sur Supabase (projet `nprojet`) : v3 = commit `d888eb4e17facee6bdfbbc6e9d0ca84abe8206dc` (2026-10-11, accord de BTK). Retour en arrière : redéployer le petit fichier avec le commit `2b0dcb7d57992ac05ec8a91c96d45b4d802ed220` (v2)
- [ ] Dire ce qui n'est pas testé à l'écran

## 2. Après la page d'accueil (pas commencé)
- [ ] Nouveau design : formes arrondies, barre du haut et barre du bas, fond clair, bleu marine
- [ ] Pages de menu : Messagerie, Historique, Validation, Équipe, Calendrier, Avances et paie, Réglages, Erreurs, Profil, Connexion

## 3. Questions ouvertes (défaut si pas de réponse)
1. Les commentaires des employés partent-ils aussi en validation ? Défaut : non.
2. Compression `gzip` des fichiers texte ? Défaut : non.

## Historique des mises à jour
- 2026-10-11 : liste créée, aucune étape commencée.
- 2026-10-11 : étapes A (d888eb4) et B (7f5cce7) faites, `npm run build` et `tsc --noEmit` sans erreur. `df-api` pas encore redéployé à ce moment-là.
- 2026-10-11 : `df-api` redéployé en v3 (commit `d888eb4`), empreinte du fichier GitHub vérifiée identique. Aucun appel réel testé (réseau de Claude bloqué vers supabase.co) : à tester par BTK (publier avec photo en admin, puis en employé).
