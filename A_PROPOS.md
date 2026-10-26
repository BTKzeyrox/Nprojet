# À PROPOS DE « Gestion Pro » : questions et réponses

> Ce fichier répond aux questions qu'on pose à BTK sur le site : à quoi ça sert, pour qui, pourquoi, comment l'utiliser autrement. Il est écrit avec des mots simples pour être donné ou montré tel quel.
> Pour le détail technique page par page, voir `GUIDE_SITE.md`. Pour installer une copie pour un autre client, voir `NOUVEAU_PROJET.md`.
> **Honnêteté** : ce qui est dit sur le marché de Madagascar est un avis, pas une étude. Il faut le vérifier en parlant à de vraies entreprises.

---

## 1. À quoi sert le site ?

**Gestion Pro** est un site (téléphone d'abord, aussi ordinateur) pour une entreprise ou un groupe qui :
- **paie son équipe à la mission** (à la tâche, à la production) ;
- **valide le travail sur preuves** (photos, fichiers) ;
- **tient ses clients, ses factures, son argent, son stock et ses achats** ;
- **garde le contact avec l'équipe** (actualité, messagerie, planning, RH).

Un site = une entreprise. L'équipe type : 5 à 50 personnes (saisie de données, contrôle, administratif, support, tâches web).

## 2. Qui fait quoi ? (les 4 rôles)

| Rôle | Ce qu'il fait |
|---|---|
| **Responsable** | Il gère tout : missions, validations, paie, clients, factures, argent, réglages, sauvegardes. |
| **Comptable** | Factures, devis, clients, achats. |
| **Chef d'équipe** | Valide les missions de son équipe seulement. |
| **Opérateur** | Prend et fait des missions, envoie les preuves, voit sa paie, ses congés, sa messagerie. |

## 3. Pourquoi l'utiliser ? Ce que ça apporte

- **Tout au même endroit** : plus de papiers, de tableurs éparpillés ni de messages perdus.
- **Paie claire** : la paie se calcule à partir des missions validées. Chaque opérateur voit la sienne.
- **Preuves gardées** : chaque mission validée a sa photo ou son fichier.
- **Pensé pour le téléphone** et pour une connexion faible (mode hors ligne en cours de préparation).
- **En français et en anglais**, clair et sombre.
- **Coût très bas** : le site tourne sur des offres gratuites (Vercel, Supabase, Cloudinary). Le coût change en usage commercial important.
- **Mode démo** : on peut l'essayer avec des chiffres inventés, sans rien risquer.

## 4. Est-ce un CRM ? Est-ce la même chose que Microworker ?

- **Pas seulement un CRM.** Un CRM suit les clients. Ici, il y a en plus la **mission payée et validée sur preuves** et la **paie de l'équipe**. Beaucoup d'entreprises ont déjà un outil de suivi clients ; ce qui les intéresse ici, c'est le reste.
- **Pas Microworker.** Microworker est une plateforme publique où des inconnus font des micro-tâches pour n'importe qui. Gestion Pro est **fermé** : une entreprise, son équipe, ses clients. Seule la paie à la mission se ressemble.

## 5. Quelle entreprise cible à Madagascar ?

Aucune cible n'est figée. Avis de départ (non vérifié) :
- centres d'appels, sociétés de saisie de données, services numériques ;
- petites agences et équipes de freelances ;
- associations et ONG avec des équipes de terrain ;
- petits commerces et ateliers (stock, achats, factures) ;
- écoles et communautés (en n'activant que l'actualité et la messagerie).

L'outil complet est peut-être trop gros pour une très petite structure : d'où l'idée de pouvoir **cacher** les modules inutiles.

## 6. D'autres façons d'utiliser le site

1. **École ou communauté** : actualité, messages, calendrier, profils.
2. **Association ou ONG** : équipes de terrain, missions, rapports avec photos, validation.
3. **Centre d'appels ou saisie de données** : paie à la production, contrôle qualité.
4. **Équipe de freelances ou agence** : clients, missions, factures, devis.
5. **Petit commerce ou atelier** : stock, achats, ventes, factures.
6. **Suivi de tâches seul** : tâches, responsables, dates limites, sans paie (voir §8).
7. **Équipe de terrain** (livraison, relevés, enquêtes) : preuves par photo, mode hors ligne.
8. **Soutien scolaire ou formation** : élèves, présences, tableau d'avancement.
9. **Site de gestion seulement**, sans messagerie ni accueil : on cache ce qui ne sert pas.
10. **Projet de démonstration pour un CV** : il montre ce que BTK sait faire, même sans client.

## 7. Peut-on cacher des modules ? Peut-on le transformer en site de réseau ?

- **Cacher, pas supprimer.** L'idée : un interrupteur par module (missions, factures, stock, RH, achats, devis, messagerie, accueil…) dans les réglages. Le code et les données restent. **Cet interrupteur global n'existe pas encore partout** ; certaines options sont déjà dans Réglages > Conditions. À faire (voir §10).
- **Exemple école-communauté** : tout désactivé sauf **l'actualité** et **la messagerie**.
- **Exemple site de gestion seulement** : messagerie et accueil cachés.

## 8. Peut-on suivre seulement des tâches, sans paie ?

En partie :
- une **mission** peut contenir une **liste de tâches** à cocher ;
- il existe un type de mission **« Tâche administrative »** ;
- le tableur intégré a un modèle **« suivi de tâches »**.

Il n'y a **pas encore** de « tâche simple » sans paie, sans client, sans validation. À ajouter si besoin : un responsable, une date limite, un statut.

## 9. Un seul site pour plusieurs entreprises ?

Aujourd'hui : **non**, un site = une entreprise. Deux façons de gérer plusieurs clients :
- **A. Une copie du site par client** (simple, sûr) : chaque entreprise a son site et sa base, avec ses propres modules. Contre : une mise à jour est à refaire sur chaque copie.
- **B. Un seul site « multi-entreprises »** avec une page réservée à BTK pour créer les entreprises et activer leurs modules. Mieux à long terme, mais gros travail : presque toutes les tables à changer, et le risque qu'une entreprise voie les données d'une autre, donc beaucoup d'essais.

Recommandé pour commencer : **A + interrupteur de modules**.

## 10. Idées à faire (rien n'est lancé sans le « GO » de BTK)

1. Interrupteur de modules par site (actualité, messagerie, missions, finances, stock, RH…).
2. Page de gestion des copies / entreprises, réservée à BTK.
3. « Tâche simple » : sans paie, sans client, avec responsable, date limite, statut.
4. Paie par **paiement mobile** (MVola, Orange Money, Airtel Money).
5. Parler à 2 ou 3 vraies entreprises avant d'ajouter d'autres modules.

## 11. Réponses courtes (à dire en 10 secondes)

- **« C'est quoi ton site ? »** Un outil pour gérer une équipe payée à la mission : le travail est validé sur preuves, la paie est calculée, et on garde les clients, les factures et les messages au même endroit.
- **« C'est pour qui ? »** Une équipe de 5 à 50 personnes : saisie de données, support, agences, associations, commerces. On peut aussi n'en garder qu'une partie, comme un site de communauté pour une école.
- **« Combien ça coûte ? »** Très peu : il tourne sur des offres gratuites.
- **« C'est prêt ? »** Les modules M0 à M12 sont faits ; les derniers essais sur de vrais téléphones et de vraies entreprises restent à faire.
