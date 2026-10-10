# PROJET.md — Le projet en un coup d'œil

But de ce fichier : savoir vite **ce qui existe, ce qui marche, comment c'est protégé et que faire en cas de panne**.
Pour travailler sur le code, lire d'abord `AI_STUDIO.md`, puis `HANDOVER.md` (détails et historique).
Mis à jour : 2026-10-09. « Non testé à l'écran » = le code compile et a été vérifié par Claude, mais BTK ne l'a pas encore vu marcher.

## 1. À propos
- **Delta Force Operations** : application de gestion d'une équipe de boosting (jeu Delta Force).
- Propriétaire : **BTK**. Réponses en français, mots simples.
- Taille : jusqu'à 100 postes (30 à 50 en vrai), 100 à 200 boosters par jour.
- Budget : **0 Ar**. Tout reste sur les offres gratuites (Supabase, Vercel, Cloudinary).
- Langues : français et chinois. Thème clair et sombre. Site installable sur téléphone (icône, `manifest.webmanifest`).
- Site en ligne : https://df-boosting-5u7c.vercel.app/ (republié à chaque push sur `main`).

## 2. Où est quoi
| Élément | Où |
|---|---|
| Site (React + Vite + Tailwind) | GitHub `BTKzeyrox/DF-boosting`, branche `main` |
| Hébergement | Vercel (déploiement automatique) |
| Serveur | Supabase Edge Function `df-api` (`supabase/functions/df-api/index.ts`) |
| Base de données | Supabase, projet « Replay » (tables `df_*`) |
| Photos | Cloudinary (secours : Supabase Storage) |
| Seule porte d'entrée du site vers le serveur | `src/db/store.ts` |

## 3. Les deux rôles
- **Admin** : voit tout, valide, règle, paie, gère les employés.
- **Booster (employee)** : prend un poste, envoie ses preuves, demande des avances, écrit des messages. Ne modifie que ses propres données.

## 4. Pages et fonctions qui existent
**Admin**
- **Accueil** : vue générale.
- **Validations** : tout ce qui attend (débuts et fins de poste, inscriptions, mots de passe oubliés, modifs de profil).
- **Grille des postes** : cartes de poste (gros « P09 », nom du booster, Départ / Actuel / Reste / Cible), ajout, modification, suppression, tri, recherche (« P01 », « poste 1 »). Nombre de colonnes réglable (2 à 10) dans Réglages.
- **Poste actif / Sessions** : sessions en cours, validation, photos de preuve.
- **Employés** : création, mot de passe, blocage, suppression, accès selon l'heure du shift, suivi (arrivées, départs, temps connecté).
- **Avances** : avances sur salaire + **Paie** (périodes, fiche de paie, export, paiement, plafond d'avance, primes). Pas de page séparée pour la paie.
- **Historique** : avances et demandes.
- **Messagerie** : groupe général + privé admin ↔ booster, photos et fichiers.
- **Calendrier** : À l'heure / En retard / Absent, détail du jour (arrivée / départ).
- **Sécurité** : alertes de sécurité.
- **Journal des erreurs** : bugs et signalements, bouton « Copier pour Claude ».
- **Réglages** : prix du 1M, shifts, tolérance de retard, types de poste, règles, conservation des photos, paie et avances, grille, secours et maintenance.

**Booster**
- Grille des postes (prendre un poste libre), Mon poste actif, Profil, Avances (et sa paie), Messagerie, Calendrier, file « sans poste », signaler un problème.

**Autres**
- **Inscription** depuis la page de connexion ; l'admin accepte ou refuse.
- Recherche et notifications qui mènent **exactement** à l'élément (poste, booster, jour).
- Bordure rouge (reste < 20M) ou orange (< 50M) sur les cartes de poste.
- Header fixe, icône du site.

## 5. Données gardées et supprimées
- **Seules les photos de preuve sont effacées automatiquement, après 7 jours** (réglable).
- Tout le reste est gardé sans limite : calendrier, avances, sessions, paie, messages.

## 6. Sécurité (ce qui est en place)
- Connexion par pseudo + mot de passe vérifiés par le serveur. Mots de passe **hachés (scrypt)**, jamais en clair.
- Jeton de session signé, valable 30 jours.
- Base protégée : RLS activée, accès seulement par le serveur (`service_role`). La clé n'est pas dans le site.
- Chaque route sensible contrôle le rôle côté **serveur** (admin seulement, booster seulement ses données).
- Compte bloqué = refusé. Accès booster selon l'heure du shift (auto / toujours / jamais).
- Anti-spam : limites sur les inscriptions (par adresse, sur 24 h) et sur les rapports d'erreur.
- Secrets (Cloudinary, etc.) dans le coffre Supabase (Vault), jamais dans le repo.
- Plafond des avances contrôlé par le serveur ; retenues et pénalités **désactivées** par défaut (règles légales de Madagascar non vérifiées).
- Alertes de sécurité visibles par l'admin.
- **Manque connu** : pas de blocage après trop d'essais de mot de passe (seulement 0,5 s d'attente).

## 7. Secours et pannes
- **Écran de secours** : plus de page blanche ; numéro d'incident, Réessayer, Vider le cache, Copier le rapport, Se déconnecter.
- Après une mise à jour du site : rechargement automatique une seule fois.
- **Bandeau « Connexion perdue »** : nouvelle tentative automatique toutes les 15 s.
- **Journal des erreurs** (admin) + bouton **« Signaler un problème »** (booster).
- **Mode maintenance** (Réglages) : les boosters sont refusés avec un message, l'admin entre toujours.
- **`/secours.html`** : page simple qui marche même si le site est cassé.
- **Procédure** : 1) Journal des erreurs ; 2) si tout est en panne, mode maintenance ; 3) voir le dernier déploiement sur Vercel (revenir à une version précédente) ; 4) journaux de `df-api` sur Supabase ; 5) retour arrière du serveur en redéployant `df-api` avec un commit précédent (voir `HANDOVER.md`).

## 8. Limites connues
- **Pas de sauvegarde** sur le plan gratuit Supabase, et **pas de bouton de sauvegarde** encore.
- **Quota** : 500 000 appels serveur par mois. Le site tient jusqu'à ≈ 27 boosters connectés 10 h par jour ; au-delà il faut réduire les appels (solutions dans `HANDOVER.md` § 3 octies).
- Supabase gratuit se met en pause après 7 jours sans activité.
- Si Supabase tombe, les rapports d'erreur ne partent pas (ils restent dans le téléphone).
- Pas de notification en dehors du site.

## 9. Non testé à l'écran par BTK
Paie (Avances > Paie, Réglages > Paie et avances), suppression automatique des photos Cloudinary, écran de secours, mode maintenance, journal des erreurs, fluidité du défilement, cartes de poste (P09, Cible), colonnes de grille, formulaires sous le header, bas des pages au-dessus de la barre de Chrome mobile (**encore un problème signalé par BTK : à corriger**).

## 10. À faire
Nouveau nom du site (BTK n'a pas encore donné le nom) · bouton de sauvegarde · réduire les appels serveur · blocage après trop d'essais de connexion · postes jusqu'à 100 en réglage · vérification légale des retenues · supprimer les tokens donnés dans le chat (GitHub, Cloudflare) et régénérer le secret Cloudinary.
