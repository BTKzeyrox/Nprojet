# PROJET.md — Le projet en un coup d'œil

But : savoir vite **ce qui existe, ce qui marche, comment c'est protégé et que faire en cas de panne**.
Pour travailler sur le code : `LIRE_EN_PREMIER.md`, puis `AI_STUDIO.md`, puis `HANDOVER.md`. Liste à faire : `TODO.md`.
Mis à jour : 2026-10-17. « Non testé à l'écran » = le code compile, mais BTK ne l'a pas encore vu marcher.

## 1. À propos
- **Gestion Pro** : gestion du travail à la tâche. Le responsable crée des missions, les opérateurs les font et envoient des preuves, le responsable valide. Projet de démonstration pour le CV de BTK (copie de DF-boosting, qui reste en lecture seule).
- Propriétaire : **BTK**. Réponses en français, mots simples.
- Budget : **0 Ar** (offres gratuites Supabase, Vercel, Cloudinary).
- Langues : français et anglais. Thème clair/sombre, taille de police réglable. Installable sur téléphone.

## 2. Où est quoi
| Élément | Où |
|---|---|
| Site | GitHub `BTKzeyrox/Nprojet`, branche `main` |
| Hébergement | Vercel (déploiement automatique) |
| Serveur | Supabase Edge Function `df-api` (`supabase/functions/df-api/index.ts`) |
| Base de données | Supabase, projet `nprojet` (tables `df_*`) |
| Photos | Cloudinary (secours : Supabase Storage) |
| Porte d'entrée du site vers le serveur | `src/db/store.ts` |

## 3. Les deux rôles
- **Admin** : voit tout, crée missions et comptes, valide ou refuse, règle l'appli.
- **Opérateur (`employee`)** : prend une mission, envoie ses preuves, publie, écrit. Ne modifie que ses propres données.

## 4. Pages et fonctions qui existent
**Admin** : Accueil (tableau de bord à cartes + liste de contrôle) · Actualités (file « À valider ») · Missions (Kanban À faire / En cours / À valider, 5 types, guides) · Validations (débuts/fins de mission, inscriptions, mots de passe oubliés, modifs de profil) · Équipe (création, mot de passe, blocage, suppression, suivi) · Historique · Messagerie · Calendrier · Journal des erreurs (bouton « Copier pour Claude ») · Réglages (onglets).
**Opérateur** : Actualités · Mon poste (mission en cours) · Missions · Messagerie · Calendrier · Profil · Réglages · « Signaler un problème ».
**Autres** : inscription depuis la page de connexion ; tirer pour actualiser ; pastille rouge de messages non lus ; cloche de notifications ; messagerie avec aperçu avant envoi d'un fichier (option Compresser) ; réactions et « écrit… » côté serveur.
**Dans le code mais plus dans le menu** : pages Avances et Paie, montants en Ar du calendrier (à supprimer ou garder : voir `TODO.md`).

## 5. Données gardées et supprimées
- **Seules les photos de preuve sont effacées automatiquement, après 7 jours** (réglable).
- Tout le reste est gardé sans limite : calendrier, sessions, messages.

## 6. Sécurité (ce qui est en place)
- Connexion par pseudo + mot de passe vérifiés par le serveur. Mots de passe **hachés (scrypt)**, jamais en clair.
- Jeton de session signé, valable 30 jours.
- Base protégée : RLS activée, accès seulement par le serveur (`service_role`). La clé n'est pas dans le site.
- Chaque route sensible contrôle le rôle côté **serveur** (admin seulement, opérateur seulement ses données).
- Compte bloqué = refusé. Accès opérateur selon l'horaire (auto / toujours / jamais).
- Anti-spam : limites sur les inscriptions (par adresse, sur 24 h) et sur les rapports d'erreur.
- Secrets (Cloudinary, etc.) dans le coffre Supabase (Vault), jamais dans le repo.
- - Alertes de sécurité visibles par l'admin.
- **Manque connu** : pas de blocage après trop d'essais de mot de passe (seulement 0,5 s d'attente).

## 7. Secours et pannes
- **Écran de secours** : plus de page blanche ; numéro d'incident, Réessayer, Vider le cache, Copier le rapport, Se déconnecter.
- Après une mise à jour du site : rechargement automatique une seule fois.
- **Bandeau « Connexion perdue »** : nouvelle tentative automatique toutes les 15 s.
- **Journal des erreurs** (admin) + bouton **« Signaler un problème »** (opérateur).
- **Mode maintenance** (Réglages) : les opérateurs sont refusés avec un message, l'admin entre toujours.
- **`/secours.html`** : page simple qui marche même si le site est cassé.
- **Procédure** : 1) Journal des erreurs ; 2) si tout est en panne, mode maintenance ; 3) voir le dernier déploiement sur Vercel (revenir à une version précédente) ; 4) journaux de `df-api` sur Supabase ; 5) retour arrière du serveur en redéployant `df-api` avec un commit précédent (voir `HANDOVER.md`).

## 8. Limites connues
- **Pas de sauvegarde** sur le plan gratuit Supabase, et **pas de bouton de sauvegarde** encore.
- **Quota** : 500 000 appels serveur par mois. Le site tient jusqu'à ≈ 27 opérateurs connectés 10 h par jour ; au-delà il faut réduire les appels (solutions dans `HANDOVER.md` § 3 octies).
- Supabase gratuit se met en pause après 7 jours sans activité.
- Si Supabase tombe, les rapports d'erreur ne partent pas (ils restent dans le téléphone).
- Pas de notification en dehors du site.

## 9. Non testé à l'écran par BTK
Presque tout ce qui est récent : publier avec photo, valider/refuser, commentaires avec PDF, envoi de fichiers dans la messagerie, tirer pour actualiser, passage FR/EN, nouveaux écrans (tableau de bord, bulles de notification, formes arrondies), connexion admin, écran de secours, mode maintenance. Seule la page de connexion a été vue en capture.

## 10. À faire
Voir `TODO.md` (section « Améliorations prévues » : sécurité, vérifications, fonctions, CV).
