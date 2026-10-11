# TODO.md : liste à faire (Nprojet)

À mettre à jour à la fin de chaque étape (cocher, ajouter la date et le commit). Règles de travail : voir `LIRE_EN_PREMIER.md` (récap, puis « GO » de BTK avant de coder).

## 1. Page d'accueil (Actualités)

### A. Serveur et store
- [ ] Fichiers (photos, PDF, texte) dans les publications et les commentaires, sans limite de nombre
- [ ] Statut « en attente » pour les publications des employés, cachées aux autres
- [ ] Routes : l'employé envoie, l'admin valide ou refuse (motif obligatoire)
- [ ] Nettoyage des fichiers d'une publication refusée ou supprimée

### B. Compression et publication
- [ ] Compression des images avant l'envoi (1600 px, environ 300 Ko), poids avant et après affiché
- [ ] Publier avec photos et fichiers (admin et employé)
- [ ] Barre de progression et erreurs claires (10 Mo max par fichier)

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
- [ ] Redéploiement de `df-api` sur Supabase (projet `nprojet`), après accord de BTK
- [ ] Dire ce qui n'est pas testé à l'écran

## 2. Après la page d'accueil (pas commencé)
- [ ] Nouveau design : formes arrondies, barre du haut et barre du bas, fond clair, bleu marine
- [ ] Pages de menu : Messagerie, Historique, Validation, Équipe, Calendrier, Avances et paie, Réglages, Erreurs, Profil, Connexion

## 3. Questions ouvertes (défaut si pas de réponse)
1. Les commentaires des employés partent-ils aussi en validation ? Défaut : non.
2. Compression `gzip` des fichiers texte ? Défaut : non.

## Historique des mises à jour
- 2026-10-11 : liste créée, aucune étape commencée.
