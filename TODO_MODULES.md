# TODO — Modules de gestion complète (Gestion Pro)

Créé le 2026-10-20 à la demande de BTK. **Rien n'est codé : c'est un plan.** À lire avec `LIRE_EN_PREMIER.md`, `AI_STUDIO.md`, `HANDOVER.md`, `TODO_STATISTIQUES.md` (phases 1 à 5 déjà faites) et `TODO.md`.
Taille : S = petite, M = moyenne, L = grosse. « Accord » = demander le « GO » de BTK avant d'agir.

## But

Passer d'un outil de **suivi de missions et de statistiques** à un **gestionnaire d'entreprise complet** : **clients**, **facturation et reçus**, **salariés**, **argent**, **stock et achats**, avec un **suivi de performance et des badges** pour les salariés **et** les clients. Le nom « Gestion Pro » doit être mérité.

## Ce qui existe déjà (ne pas refaire)

| Domaine | Déjà là |
|---|---|
| Missions | Tableau À faire / En cours / À valider, 5 types, validation, preuves |
| Équipe et paie | Comptes, présence, calendrier, paie à tarif fixe par mission, avances |
| Argent | Prix client, paiements reçus, dépenses, bénéfice, marge, trésorerie, à encaisser (onglet Finances) |
| Stock | Produits, entrées, sorties, ajustements, voyant rouge, valeur |
| Pilotage | Statistiques, objectifs du mois, alertes, prévision, rapport mensuel (Excel et PDF) |
| Sécurité | Argent, stock, prix client, objectifs : jamais envoyés à un opérateur (`df-api` v10) |
| Démo | Mode démo 100 % local avec chiffres inventés |

## Comment lire ce plan : la démarche commune à chaque module

Chaque module suit **toujours le même chemin**, dans cet ordre. C'est la méthode qui a servi pour les finances et le stock, et elle a bien marché.

1. **Décisions de BTK** (questions courtes, une réponse par question, valeur par défaut proposée).
2. **Plan court** présenté à BTK, puis attente du « GO ». Pas de code avant.
3. **Règles pures** : les calculs sont écrits dans `src/utils/…` (sans écran, sans serveur), avec un script de contrôle `npm run check:…` qui teste les cas normaux **et** les cas piégés (vide, zéro, gros nombres, texte, dates fausses).
4. **Types et accès aux données** : `src/types/index.ts`, `src/db/store.ts` (une seule porte d'entrée).
5. **Nouvelle table (si besoin)** : **accord de BTK**, sauvegarde avant (`select public.df_take_backup();`), migration écrite dans `supabase/migrations/AAAAMMJJ_….sql` (même modèle que `df_cash` : `id`, `data` JSON, `updated_at`, **RLS activée, aucun droit pour `anon` ni `authenticated`**), retour en arrière écrit, vérification dans la sauvegarde suivante (le nombre de tables augmente).
6. **Serveur `df-api`** : un bloc délimité `BEGIN … / END …` avec une fonction `clean…` qui **revérifie tout** (le serveur ne fait jamais confiance au navigateur), la liste « admin seulement » en lecture et en écriture, et un test qui échoue si on retire une protection. Redéploiement = **accord de BTK**, fichier GitHub comparé au dépôt, retour en arrière = commit précédent.
7. **Écrans** : téléphone d'abord (cibles de 44 px minimum), clair et sombre, français et anglais (`t(fr, en)`), pas de nouvelle grosse bibliothèque.
8. **Démo** : chiffres inventés, cohérents entre eux, jamais d'appel réseau.
9. **Contrôles** : `tsc`, `build`, tous les `check:…` ; écrire **ce qui n'est PAS vérifié** (écran, téléphone, vrai serveur).
10. **Documents** dans le même commit : cocher l'étape ici (date et commit), ligne au journal de `TODO.md`, `AI_STUDIO.md` (tables, routes, retour en arrière), `PROJET.md` si le menu change.
11. **Essai de BTK** (téléphone, admin puis compte opérateur) **avant** de dire que le module est fini.

**Règles transversales (valables pour tous les modules)**
- Argent, factures, clients, tarifs : **réservés à l'admin côté serveur**. Un opérateur ne reçoit rien (même méthode que `ADMIN_ONLY_READ` / `ADMIN_ONLY_WRITE` et le bloc `PRIVACY`).
- Un chiffre officiel (numéro de facture, numéro de reçu) est **attribué par le serveur**, jamais par le navigateur.
- Une facture émise **ne se supprime jamais** : on l'**annule par un avoir** (écriture inverse), comme en comptabilité.
- Quota Supabase gratuit : calculs faits dans le navigateur de l'admin, pas de nouvel appel en boucle, pas de nouvelle synchro rapide.
- Aucun chiffre inventé dans la vraie base ; la démo reste locale.
- Un module à la fois. Chaque module est utilisable seul quand il est fini.
- **Une étape à la fois (règle de BTK, 2026-10-20) :** chaque étape (M1.3, M1.4…) finie = **un commit, un push sur `main` et ce fichier mis à jour dans le même commit** (case cochée avec la date). Jamais le module en un seul gros commit.
- **« GO M1 » = tout le module M1, étape par étape :** on commence par la première étape non cochée, on pousse, puis on enchaîne la suivante **sans attendre BTK**, jusqu'à la fin du module. Arrêt seulement pour une action qui efface des données, un vrai doute, ou un essai que seul BTK peut faire (écran, téléphone). Les accords déjà inclus dans « GO Mx » : table du module, sauvegarde avant, déploiement de `df-api`.
- **Écriture sur GitHub :** avec le token de BTK et le terminal (`git`), jamais avec le connecteur git (lecture seule). Le token n'est écrit nulle part.

---

## MODULE 0 — Page « Conditions de l'entreprise » — taille M (à faire AVANT les autres)

**Pourquoi (demande de BTK, 2026-10-20) :** BTK ne connaît pas les règles des entreprises, et elles changent d'une entreprise à l'autre (TVA, délai de paiement, numéros, mentions légales, règles de congés, de paie…). Le site ne doit donc **rien écrire en dur** : toutes ces règles vivent dans **une page de réglages**, modifiable par l'admin quand l'entreprise lui dit ce qu'elle veut. Si les conditions changent, on change la page, pas le code.

**Où :** Réglages > « Conditions de l'entreprise » (admin seulement). Un bouton « Valeurs de départ » remet des choix prudents. Chaque champ a une phrase d'aide en mots simples (« C'est quoi ? », « Si je ne sais pas : laisser comme ça »).

**Sections et champs (tous facultatifs, avec valeur de départ) :**
| Section | Champs | Valeur de départ |
|---|---|---|
| Identité | nom de l'entreprise, adresse, téléphone, e-mail, logo, devise | Ar, le reste vide |
| Mentions légales | numéro d'identification fiscale, numéro de registre, autres mentions libres (une ligne par mention) | vide : **rien d'inventé** ; les documents n'affichent que ce qui est rempli |
| Taxes | TVA oui/non, taux, texte « TVA non applicable » | Non |
| Facturation | préfixe et forme du numéro, délai de paiement (jours), pénalités de retard (texte libre), mode de paiement accepté, texte en bas de facture | `FA-` / `RC-`, 30 jours, vide |
| Paie | jour de paie, règle des avances (plafond), arrondi | selon l'existant |
| Congés et présence | jours de congé par an, jours travaillés par semaine, heure limite pour le retard | vide |
| Missions | délai de validation attendu, règle de refus (motif obligatoire : oui) | oui |
| Badges | seuils et poids de la performance (module 3) | valeurs proposées |
| Choix de fonctionnement (ex-décisions D5 à D11) | facture par mission / par client et par mois ; devis activés oui/non ; le salarié voit ses badges et son score oui/non ; le salarié voit ses points d'attention oui/non ; mission toujours liée à un client oui/non ; module Badges activé oui/non | par client et par mois ; devis non ; badges oui ; points d'attention non ; client obligatoire oui ; badges oui |
| Règlement intérieur | texte libre affiché aux salariés (lecture seule) | vide |
| Conditions pour les clients | texte libre imprimé sur devis et factures (conditions de vente) | vide |

**Fonctionnement :**
- Les autres modules **lisent** cette page ; aucun chiffre ni texte légal n'est fixé dans le code.
- **Historique :** chaque changement garde la date, la valeur d'avant et qui l'a fait ; un document déjà émis (facture) garde les conditions **de son jour** (copie figée).
- **Admin seulement** : un opérateur ne reçoit que le règlement intérieur et les règles de congés/présence qui le concernent (rien d'argent, ni TVA, ni tarifs).
- **Pas de nouvelle table pour démarrer** : les champs vont dans `df_settings` (ligne `general`, déjà admin-protégée en écriture), avec un bloc `COMPANY` dans `df-api` qui revérifie chaque champ (longueurs, nombres, taux entre 0 et 100, texte échappé). Un historique séparé (`df_settings_log`) viendra avec le module 7 si BTK l'accepte.
- Aide intégrée : à côté de chaque champ, un petit « ? » qui explique en une phrase. En bas : « À vérifier avec un comptable ou le responsable de l'entreprise. Gestion Pro ne donne pas de conseil légal. »

- [ ] **M0.1 — Valeurs de départ et textes d'aide** (S) : écrits le 2026-10-20 (`src/components/CompanyConditions.tsx`, un « ? » par champ, français et anglais) ; **BTK doit les relire** pendant l'essai (M0.6).
- [x] **M0.2 — Règles pures** (S) — **fait le 2026-10-20** (`check:company` 102/102, mêmes résultats sur le site et sur le serveur) : `src/utils/companyRules.ts` (valeurs de départ, validation, fusion avec l'existant) + `check:company` (taux hors limites, texte trop long, vide, HTML malveillant, champ inconnu).
- [x] **M0.3 — Serveur** (M) — **fait et déployé le 2026-10-20** avec l'accord de BTK : sauvegarde n° 10 (19 tables) prise avant, `df-api` v11 = commit `cf098bd` (fichier GitHub comparé au dépôt : identique), retour en arrière = v10 = `9a88594`. **Pas encore vérifié par un vrai appel** (aucun appel dans les journaux juste après le déploiement) : le premier essai de BTK le confirmera.
- [x] **M0.4 — Écran** (M) — **fait le 2026-10-20** (Réglages > Conditions ; `check:company-page`) ; non vu sur un vrai téléphone : page Réglages > Conditions, par sections repliables, aides « ? », bouton « Valeurs de départ », avertissement d'enregistrement, téléphone d'abord, clair et sombre, français et anglais.
- [x] **M0.5 — Branchement** (S) — **fait le 2026-10-20** pour le rapport mensuel (nom de l'entreprise dans le PDF et l'Excel, seulement s'il est rempli) ; démo avec conditions inventées ; les futurs documents liront la même page : le rapport mensuel et les futurs documents lisent l'identité de l'entreprise ; la démo a des conditions inventées, locales.
- [ ] **M0.6 — Essai de BTK** : compte admin puis compte opérateur (ne voit que le règlement et les congés).

---

## DÉCISIONS À PRENDRE AVEC BTK (avant le module 1)

> **Mise à jour 2026-10-20 (demande de BTK) :** plus aucune décision n'est figée. **Chacune devient un réglage** dans la page Conditions (module 0), avec la valeur proposée par défaut ; l'entreprise choisit et peut changer plus tard. Les modules lisent ces réglages (ex. : si « devis » est sur Non, l'écran des devis n'apparaît pas). BTK n'a donc rien à trancher maintenant.

| # | Question | Défaut proposé |
|---|---|---|
| D1 | Format du numéro de facture | `FA-2026-0001` (préfixe, année, compteur sans trou) |
| D2 | Format du numéro de reçu | `RC-2026-0001` |
| D3 | Mentions de l'entreprise sur les documents : nom commercial, adresse, téléphone, e-mail, logo, **identifiants fiscaux et TVA si l'entreprise en a** | BTK les donne ; **à confirmer avec un comptable** (Claude ne garantit pas la conformité légale) |
| D4 | TVA : facture avec TVA ou sans | Sans TVA tant que BTK n'a pas dit le contraire (taux réglable ensuite) |
| D5 | Une facture par mission, ou **une facture par client et par mois** | Par client et par mois (moins de papier) |
| D6 | Délai de paiement par défaut (échéance) | 30 jours, réglable par client |
| D7 | Devis : tout de suite ou plus tard | Plus tard (module 2, étape facultative) |
| D8 | Badges : un salarié voit-il **ses propres** badges et son score ? | Oui (motivation) ; il ne voit jamais le score ni le classement des autres |
| D9 | Badges : les points faibles d'un salarié sont-ils visibles par lui ? | Non : il voit seulement ses réussites ; le responsable voit aussi les « points d'attention » |
| D10 | Le client voit-il quelque chose (espace client) ? | Non (admin seulement). Un espace client est une autre grosse étape, hors de ce plan |
| D11 | Une mission doit-elle **toujours** avoir un client ? | Oui pour les nouvelles missions ; les anciennes gardent leur texte libre |

---

## MODULE 1 — Clients (gestion de la relation client) — taille L

**But :** une vraie **fiche client**, un **statut calculé tout seul**, un **tarif par client**, et le lien mission ↔ client.

**Données** (nouvelle table `df_clients`, accord de BTK + sauvegarde) : `id`, `name` (raison sociale), `contact_name`, `phone`, `email`, `address`, `note`, `payment_terms_days` (échéance, défaut D6), `price_default_ar?` (tarif propre au client), `price_by_type?` (exceptions par type de mission), `active`, `created_at`. **Aucun statut stocké** : il se calcule.

**Règle de prix (ordre de priorité) :** prix de la mission → prix du client pour ce type → prix du client par défaut → prix du type (réglages) → prix par défaut (réglages). Le prix reste **figé à la validation** de la mission, comme aujourd'hui (`clientPrice.ts` à étendre).

**Lien avec les missions :** nouveau champ `client_id` sur la mission (`ClientContract`) ; la session de mission le copie. Les anciennes missions gardent leur texte libre (rien n'est cassé) ; un outil « Rattacher » propose les correspondances de noms, l'admin confirme une par une.

**Statut calculé (proposition, seuils réglables) :**
- **Prospect** : fiche créée, aucune mission.
- **Nouveau** : première mission il y a moins de 60 jours.
- **Régulier** : au moins 3 missions validées sur les 6 derniers mois.
- **Stratégique (« favori »)** : dans les 20 % premiers du chiffre d'affaires sur 12 mois, avec au moins 5 missions.
- **Inactif** : aucune mission depuis 90 jours.
- Un client peut cumuler (ex. Régulier + Stratégique) ; l'écran montre le plus important, les autres au détail.

- [x] **M1.1 — Décisions** (S) — **fait le 2026-10-20** : D10 = admin seulement (aucun espace client) ; D11 = réglage « mission_requires_client » de la page Conditions (déjà là, Oui par défaut) ; seuils de statut = valeurs proposées ci-dessus (60 jours, 3 missions sur 6 mois, 20 % et 5 missions sur 12 mois, 90 jours), gardées dans `CLIENT_THRESHOLDS_DEFAULT` ; **ils deviendront des réglages dans la page Conditions à l'étape M1.3** (section « clients » à ajouter au bloc COMPANY du serveur, avec le même contrôle des deux côtés).
  - **Écart avec le plan :** un statut neutre **Actif** est ajouté (client avec des missions mais ni Nouveau, ni Régulier, ni Stratégique, ni Inactif), sinon un client de 70 jours avec 1 mission aurait été montré comme « Prospect ». Ordre d'affichage : Inactif, Stratégique, Régulier, Nouveau, Actif, Prospect.
- [x] **M1.2 — Règles pures** (M) — **fait le 2026-10-20** (`check:clients` **47/47**) : `src/utils/clients.ts` (statut, chiffre d'affaires, nombre de missions, dernier mouvement, règle de prix à 5 niveaux) + `check:clients`. *Réussite :* statut juste sur 12 cas (limite des 60 / 90 jours, année bissextile, client sans mission, ex æquo). **Fait :** `src/utils/clients.ts` (`summarizeClients`, `addMonths`, `normalizeName`, `suggestClientMatches`, `rankClients`, `paymentTermsDays`) et `clientPriceWithClient` dans `src/utils/clientPrice.ts` (règle à 5 niveaux, l'existant n'est pas modifié). Cas contrôlés : limites 59/60 et 89/90 jours, limite des 6 mois (jour exact compté, veille non), fin de mois et année bissextile, ex æquo à la limite des 20 %, au moins 5 missions, missions de plus de 12 mois, mission future, prix invalides, rattachement ambigu, 2 000 clients × 40 000 missions en moins de 400 ms. **Pas encore branché sur un écran ni sur le serveur.**
- [x] **M1.3 — Table et serveur** (M) — **fait le 2026-10-20** (accord : « GO M1 ») : sauvegarde n° 12 prise avant, migration `20261020_create_df_clients.sql` appliquée (table vide, RLS active, aucun droit pour `anon` ni `authenticated`, vérifié), `df-api` **v12 = commit `32b386d`** en ligne (retour en arrière = v11 = `cf098bd` ; table : `drop table public.df_clients;`). Bloc `CLIENTS` (`cleanClient` revérifie nom, e-mail, échéance 0 à 365 jours, prix, exceptions par type, textes coupés, champs inconnus ignorés, statut jamais stocké), `clients` ajouté à `ADMIN_ONLY_READ` et `ADMIN_ONLY_WRITE`, traité avant les missions dans `sync`. **Lien `client_id`** : retiré de ce que reçoit un opérateur (comme le prix client), une session écrite par un opérateur garde le `client_id` d'origine, un lien écrit par l'admin doit viser une fiche qui existe. **Un client qui a des missions ou des sessions ne se supprime pas** (refus `in_use` : on le désactive). Site : type `Client`, `client_id` sur mission et session, `getClients()` (admin). Démo : « 20 tables » dans Sauvegardes. `npm run check:clients-server` **67/67** (plus tous les autres contrôles et le build). **Pas encore confirmé par un vrai appel** (aucun appel dans les journaux juste après le déploiement) ; le serveur n'a pas été testé avec un vrai compte opérateur.
- [x] **M1.3b — Seuils des statuts dans la page Conditions** (S) — **fait le 2026-10-20** (étape ajoutée : M1.1 l'avait promis « à l'étape M1.3 » et M1.3 ne l'avait pas fait) : section « Clients (statuts) » dans Réglages > Conditions (7 seuils : Nouveau 60 j, Régulier 3 missions sur 6 mois, Stratégique 20 % et 5 missions sur 12 mois, Inactif 90 j), mêmes règles sur le site (`companyRules.ts`) et sur le serveur (bloc `COMPANY`), `clientThresholds()` dans `src/utils/clients.ts`. Sauvegarde n° 13 prise avant, `df-api` **v13 = commit `5ba6037`** (retour en arrière = v12 = `32b386d`). `check:company` **119/119**, `check:clients` **55/55**. Les deux sections n'ont pas été vues à l'écran.
- [x] **M1.4 — Écran « Clients »** (L) — **fait le 2026-10-20** : entrée « Clients » dans le menu (admin seulement), `src/views/admin/ClientsPage.tsx`. Liste avec recherche (nom, contact, téléphone, e-mail, sans accents ni majuscules), filtre par statut avec compte (Tous, Stratégique, Régulier, Nouveau, Actif, Prospect, Inactif, Archivés), 4 tris, 4 cartes (clients, stratégiques, inactifs, chiffre d'affaires 12 mois). Fiche ouverte au toucher : contact (téléphone et e-mail cliquables), échéance (la sienne ou celle des Conditions, dite comme telle), prix par défaut et par type, missions validées, **facturé, reçu, reste à encaisser**, statuts avec leur explication. Création, modification (un champ vidé disparaît vraiment), archivage et réactivation, suppression **refusée si le client a des missions** (on l'archive). Même nom (sans accents ni majuscules) refusé. Règles pures dans `src/utils/clients.ts` (`checkClientDraft`, `clientMissionsFromPosts`, `clientReceived`, `filterClients`, `countByStatus`), méthodes `addClient`, `updateClient`, `setClientActive`, `deleteClient` du store. **Serveur durci** (v14) : un tableau, un booléen ou un texte vide n'est plus lu comme un nombre. Sauvegarde n° 14, `df-api` **v14 = commit `d8c9438`** (retour en arrière = v13 = `5ba6037`). `check:clients` **90/90**, `check:clients-server` **68/68** (dont site et serveur comparés sur 50 fiches), `check:clients-page` **44/44** (FR et EN, opérateur sans rien, 0 appel réseau). **Pas vu sur un vrai téléphone.** **Limites écrites :** (1) « Reçu » compte les paiements de Finances qui portent le même nom que la fiche (les lignes d'argent n'ont pas de lien vers le client) ; deux fiches de même nom ne reçoivent rien ; (2) le **délai de paiement moyen** n'est pas affiché : il demande des factures (module 2) ; (3) les missions ne sont reliées aux fiches qu'avec M1.5, donc toutes les fiches restent « Prospect » d'ici là.
- [ ] **M1.5 — Missions liées** (M) — ⏳ **en cours : reprise le 2026-10-20 vers 21 h 25 UTC par une 4e session, à la demande de BTK (qui confirme que la 3e session est fermée) ; si tu es une autre session : arrête-toi, relis le dépôt, ne la refais pas en parallèle** : choix du client dans le formulaire de mission (liste + « Nouveau client » rapide) ; outil « Rattacher les anciennes missions ».
- [ ] **M1.6 — Statistiques et alertes** (S) : « meilleur client » et « argent reçu par client » passent sur les vraies fiches ; l'alerte « client sans paiement depuis X jours » utilise `client_id`.
- [ ] **M1.7 — Démo, anglais, contrôle du module** (S) : 6 clients inventés avec tous les statuts, essai opérateur (rien de visible).

---

## MODULE 2 — Facturation, reçus et créances — taille L (dépend du module 1)

**But :** émettre des **factures** numérotées, des **reçus** de paiement, suivre les **créances** (ce que les clients doivent) et relancer.

**Données :** table `df_invoices` (une ligne = une facture, avec ses lignes dans le JSON), table `df_counters` (compteurs de numéros, un par type et par année), reçus stockés dans la ligne de paiement (`df_cash`) avec leur numéro. Aucune écriture sur les sessions de mission : une mission est « déjà facturée » quand une facture **non annulée** la cite (ça évite de donner à d'autres le droit d'écrire sur les missions).

**Facture :** `number` (attribué à l'émission), `client_id` + copie du nom et des mentions du client à ce moment-là (un document émis ne change plus), `issue_date`, `due_date`, `lines` (mission, description, quantité, prix unitaire, total), `subtotal`, `tax_rate`, `tax`, `total`, `status`, `paid` (calculé), `note`.
**États :** *Brouillon* (modifiable, sans numéro) → *Émise* (numérotée, plus modifiable) → *Partiellement payée* → *Payée* ; *En retard* (calculé : échéance dépassée et reste à payer) ; *Annulée* (par avoir).
**Numérotation :** route dédiée `invoice-issue` qui attribue le numéro **dans une seule opération atomique** (fonction SQL avec verrou) : pas de doublon même avec deux clics, **pas de trou** (un brouillon n'a pas de numéro).
**Reçu :** à chaque paiement rattaché à un client, le serveur attribue `RC-…` ; impression d'un reçu d'une page (montant, date, mode de paiement, facture payée, reste à payer).
**Créances :** balance âgée par client (0-30, 31-60, 61-90, plus de 90 jours) ; relance = texte prêt à copier (FR / EN) avec la liste des factures en retard.
**PDF :** même méthode que le rapport mensuel (page claire isolée, tout échappé, « Imprimer » puis « Enregistrer en PDF »), sans nouvelle bibliothèque.

- [ ] **M2.1 — Décisions** (S) : D1 à D7 ; BTK donne les mentions de l'entreprise (D3).
- [ ] **M2.2 — Réglages entreprise** (S) : Réglages > Entreprise (nom, adresse, contact, logo, mentions, TVA éventuelle, préfixes de numéros, délai par défaut). Admin seulement.
- [ ] **M2.3 — Règles pures** (M) : `src/utils/invoices.ts` (lignes, totaux et arrondis à l'Ar, TVA, états, échéance, retard, balance âgée, « missions à facturer ») + `check:invoices` (dont : total des lignes = total de la facture ; un paiement trop grand est refusé ; arrondi ; 0 ligne refusée).
- [ ] **M2.4 — Tables, compteur et serveur** (L) — **accord + sauvegarde avant** : migrations `df_invoices`, `df_counters`, fonction SQL du numéro ; blocs `INVOICES` et `RECEIPTS` dans `df-api` (`cleanInvoice` revérifie les totaux, refuse de modifier une facture émise, refuse la suppression, route `invoice-issue` et `invoice-cancel` par avoir) ; admin seulement. *Réussite :* 2 émissions en même temps = 2 numéros différents et qui se suivent (test sur la vraie base seulement avec accord).
- [ ] **M2.5 — Écran « Facturation »** (L) : liste des factures (filtres par état, client, période), création depuis « missions validées non facturées » d'un client (cases à cocher), brouillon, émission avec confirmation (« le numéro sera définitif »), enregistrement d'un paiement (crée la ligne d'argent liée et le reçu), annulation par avoir.
- [ ] **M2.6 — PDF et reçus** (M) : facture et reçu imprimables avec les mentions de l'entreprise.
- [ ] **M2.7 — Créances et relances** (M) : balance âgée, liste « à relancer », texte de relance, alerte sur l'accueil.
- [ ] **M2.8 — Lien avec Finances et Statistiques** (M) : « facturé » = factures émises (plus seulement missions × prix) ; « à encaisser » = factures non payées ; export Excel (onglets Factures, Créances).
- [ ] **M2.9 — Devis (facultatif, D7)** (M) : mêmes lignes, état *Envoyé / Accepté / Refusé*, un clic pour transformer en facture.
- [ ] **M2.10 — Démo, anglais, contrôle du module** (S) : factures de démo dans tous les états, essai opérateur.

---

## MODULE 3 — Suivi de performance et badges (salariés et clients) — taille L

**But :** mesurer la performance de façon **juste et expliquée**, la rendre visible sous forme de **score** et de **badges**, pour les **salariés** et pour les **clients**. La partie salariés peut commencer **tout de suite** (elle n'a pas besoin des modules 1 et 2) ; la partie clients arrive après eux.

**Principes (pour que ce soit équitable et utile) :**
- **Toujours expliqué :** chaque badge et chaque score affiche **pourquoi** (« 97 % validées sur 42 missions »).
- **Échantillon minimum :** pas de badge « qualité » sous 20 missions, par exemple ; on affiche « pas assez de données ».
- **Fenêtre glissante :** les calculs portent sur les 30 derniers jours (mois) et les 90 derniers (tendance), pas sur toute la vie.
- **Niveaux :** Bronze, Argent, Or ; un badge peut se perdre si le niveau baisse.
- **Calculé, pas saisi :** aucun badge n'est donné à la main (pas de favoritisme) ; l'admin règle seulement les seuils.
- **Pas d'argent de l'entreprise dans les badges des salariés** (un salarié ne doit rien deviner des finances).
- **Anti-triche :** les missions refusées comptent ; une mission rouverte ne compte qu'une fois ; une durée absurde (trop courte) est ignorée.

### 3.A — Salariés

**Score de performance (0 à 100), proposition de poids réglables :** qualité 40 % (taux de validation) · volume 25 % (missions vs moyenne de l'équipe) · ponctualité 20 % (retards et absences du calendrier) · régularité 15 % (jours actifs sur la période).

**Badges proposés :**
| Badge | Critère (par défaut) | Niveaux |
|---|---|---|
| **Qualité** | taux de validation sur 20 missions ou plus | ≥ 90 / 95 / 98 % |
| **Ponctualité** | jours sans retard sur 30 jours | 90 / 95 / 100 % |
| **Régularité** | jours de travail d'affilée | 5 / 10 / 20 jours |
| **Rendement** | missions par heure vs moyenne de l'équipe | +10 / +25 / +40 % |
| **Polyvalence** | types de mission différents validés | 2 / 3 / 5 types |
| **Recrue prometteuse** | 10 premières missions avec 100 % de validation | un seul niveau |
| **Employé du mois** | meilleur score du mois (à partir de 5 salariés actifs) | décerné par le calcul, confirmé par l'admin |

**Écrans :** fiche performance d'un salarié (score, badges avec « pourquoi », tendance sur 3 mois, points d'attention visibles par l'admin seulement) ; classement du mois (admin) ; page **Performance** existante enrichie ; **vue du salarié sur lui-même** : son score et ses badges, jamais ceux des autres (D8, D9).

### 3.B — Clients (dépend des modules 1 et 2)

**Score de relation client (0 à 100) :** régularité des commandes 35 % · ponctualité de paiement 35 % · volume (chiffre d'affaires) 30 %.

**Badges proposés :**
| Badge | Critère (par défaut) |
|---|---|
| **Nouveau** | première mission il y a moins de 60 jours |
| **Régulier** | 3 missions ou plus sur 6 mois |
| **Stratégique** | dans les 20 % du chiffre d'affaires sur 12 mois |
| **Bon payeur** | délai moyen de paiement ≤ échéance, sur 3 factures ou plus |
| **Payeur lent** | délai moyen > échéance + 15 jours (point d'attention) |
| **À surveiller** | facture en retard de plus de 60 jours (point d'attention) |
| **Inactif** | aucune mission depuis 90 jours |
| **Gros volume** | plus de 10 missions sur un mois |

Visible **par l'admin seulement**. Le statut du module 1 et ces badges se complètent : le statut dit « où en est la relation », les badges disent « comment ça se passe ».

- [ ] **M3.1 — Décisions** (S) : D8 et D9 ; validation des critères, des seuils et des poids.
- [ ] **M3.2 — Règles pures salariés** (M) : `src/utils/performanceScore.ts` (score, badges, niveaux, échantillon minimum, tendance) + `check:badges` (cas : 0 mission, 1 mission, 20 missions pile, refusées, durée absurde, ex æquo, équipe de 1 personne, mois sans activité).
- [ ] **M3.3 — Écrans salariés** (L) : fiche performance, classement du mois, vue « mon score » côté salarié (sans argent, sans les autres), puces de badge sur la fiche CV et dans la liste Équipe.
- [ ] **M3.4 — Réglages** (S) : seuils et poids réglables (Réglages > Performance), valeurs par défaut rétablissables ; un salarié ne reçoit **pas** les seuils des autres (pas d'information utile pour tricher).
- [ ] **M3.5 — Règles pures clients** (M, après M2) : `src/utils/clientBadges.ts` + `check:client-badges` (délai de paiement, retard, ex æquo, client sans facture).
- [ ] **M3.6 — Écrans clients** (M) : badges et score sur la fiche et la liste des clients, filtre « points d'attention », ajout aux alertes de l'accueil.
- [ ] **M3.7 — Reconnaissance** (S, facultatif) : message de félicitations à l'obtention d'un badge (notification dans l'appli), publication « Employé du mois » en un clic dans Actualités (validée par l'admin).
- [ ] **M3.8 — Export et rapport** (S) : badges et scores dans l'export Excel de Performance et dans le rapport mensuel.
- [ ] **M3.9 — Démo, anglais, contrôle du module** (S).

*Aucune nouvelle table pour la version de départ : les badges se calculent à la volée. Une table `df_badges` (historique, « employé du mois » décerné) n'arrive que plus tard, si BTK veut garder la trace.*

---

## MODULE 4 — Fournisseurs, achats et stock — taille M (dépend du stock existant)

**But :** relier le stock et les dépenses à de vrais **fournisseurs**, avec des **bons de commande** et un **inventaire**.

**Données :** table `df_suppliers` (nom, contact, délai, note) ; table `df_purchase_orders` (fournisseur, lignes produit × quantité × prix, états *Brouillon / Commandé / Reçu / Annulé*).

- [ ] **M4.1 — Fournisseurs** (M) : fiche fournisseur ; le champ « fournisseur » devient une liste dans l'entrée de stock et dans la dépense « Achats » — **accord + sauvegarde** pour la table.
- [ ] **M4.2 — Bons de commande** (L) : création, réception (crée **automatiquement** les entrées de stock **et** la dépense « Achats » après confirmation), réception partielle.
- [ ] **M4.3 — Inventaire** (M) : comptage physique d'un produit ou de tout le stock, écart affiché, ajustement en un clic (mouvement « ajustement » déjà existant), historique.
- [ ] **M4.4 — Budgets par catégorie** (M) : plafond mensuel par catégorie de dépense (Loyer, Internet, Achats…), barre d'avancement et alerte (étend les objectifs de S4.1).
- [ ] **M4.5 — Statistiques, démo, anglais, contrôle** (S) : classement des fournisseurs, produits les plus chers à l'achat.

---

## MODULE 5 — Ressources humaines — taille M

**But :** un **dossier du salarié** complet et la gestion des **congés et absences** (déjà prévus dans `TODO.md` P4-1).

- [ ] **M5.1 — Dossier du salarié** (M) : poste, date d'embauche, type de contrat, contact d'urgence, documents (CV existant), historique des changements de tarif. Données sensibles : **visibles par l'admin et par le salarié concerné seulement**.
- [ ] **M5.2 — Congés et absences** (M) : demande par le salarié (dates, motif), validation ou refus par l'admin (motif), l'absence validée apparaît dans le calendrier et n'est plus comptée comme jour manqué ; solde de congés si BTK le veut.
- [ ] **M5.3 — Bulletin de paie imprimable** (M) : mêmes données que la page Paie (déjà calculées par le serveur), page claire à imprimer, avances et retenues incluses.
- [ ] **M5.4 — Évaluation périodique** (S) : fiche d'entretien (objectifs, commentaires), alimentée par les scores du module 3.
- [ ] **M5.5 — Démo, anglais, contrôle** (S).

---

## MODULE 6 — Missions avancées — taille M (voir `TODO.md` P2)

- [ ] **M6.1 — Date limite et priorité** (M) : champs `due_date` et `priority`, pastille « En retard » sur la carte, tri, échéance dans le calendrier. **Débloque** l'alerte « missions en retard » et le badge **Ponctualité des livraisons**.
- [ ] **M6.2 — Modèles de mission** (S) et **M6.3 — Liste de tâches dans une mission** (M).
- [ ] **M6.4 — Notifications** (L) : rappels de date limite, validation, refus (`TODO.md` P1-1 : push navigateur, e-mail seulement pour validation / refus).

---

## MODULE 7 — Droits, traçabilité et sauvegardes — taille M

- [ ] **M7.1 — Rôles intermédiaires** (L) : **Comptable** (voit factures et argent, ne gère pas les comptes) et **Chef d'équipe** (valide les missions de son équipe, sans paie ni réglages). Chaque route du serveur dit quels rôles sont autorisés. **Décision de BTK avant** (ex. : le chef d'équipe voit-il la paie de son équipe ? défaut : non).
- [ ] **M7.2 — Journal d'audit** (M) : qui a fait quoi et quand (émission ou annulation d'une facture, suppression, changement de tarif, de réglage) ; admin seulement ; conservé 12 mois.
- [ ] **M7.3 — Restaurer depuis une sauvegarde** (M) : aujourd'hui on sauvegarde et on télécharge, on ne restaure pas ; prévoir double confirmation et une sauvegarde automatique juste avant.

---

## MODULE 8 — Tableau de bord de direction et contrôle final — taille S à M

- [ ] **M8.1 — Page « Direction »** (M) : une seule page de synthèse (chiffre d'affaires du mois, bénéfice, créances en retard, top clients, top salariés, stock critique, alertes), sans nouveau calcul : elle réutilise les règles existantes.
- [ ] **M8.2 — Essai complet par BTK** (téléphone, clair et sombre, FR et EN, admin puis chaque rôle) ; liste des petits défauts.
- [ ] **M8.3 — Vitesse et quota** : mesurer les calculs avec 2 ans de données ; aucun appel serveur en boucle.
- [ ] **M8.4 — Documents et nettoyage** : `PROJET.md`, `HANDOVER.md`, `AI_STUDIO.md`, `TODO.md` ; aucune donnée de démo dans la vraie base.

---

## MODULE 9 — Détection automatique (retards, absences, actions suspectes) — taille M

**Demande de BTK (2026-10-20) :** que le site détecte tout seul un employé en retard ou absent, ou une action suspecte, sans que l'admin analyse à la main.

**Ce qui existe déjà :** le calendrier calcule « en retard » et « absent » par jour (il faut ouvrir la page) ; un journal de sécurité (`df_security_logs`, « Petit Malin ») garde certaines violations ; les alertes automatiques (S4.2) couvrent l'argent et le stock, **pas les salariés**.

**Approche : des règles claires, pas une « IA » opaque.** Chaque alerte dit **pourquoi** (« 3 retards en 7 jours »). Zéro coût, zéro appel externe, calcul dans le navigateur de l'admin, même cache que `alertsDb.ts`. Une vraie IA (modèle de langage) n'est pas nécessaire ici et ne se justifie pas.

**Alertes salariés (règles réglables dans la page Conditions) :**
- Absent aujourd'hui (jour travaillé, aucune mission, pas de congé validé) ; absent 2 jours de suite.
- En retard 3 fois sur 7 jours.
- Mission « en cours » depuis plus de X heures sans preuve de fin.
- Taux de refus élevé (ex. plus de 30 % sur 10 missions).

**Actions suspectes (règles) :**
- Connexions échouées répétées sur un compte ; connexion à une heure inhabituelle.
- Mission validée en un temps impossible (trop court) ; mêmes preuves envoyées deux fois (même empreinte de fichier).
- Salarié qui tente d'écrire un champ interdit (déjà bloqué par le serveur : on le **note** dans le journal).
- Gros changement de tarif, de prix client ou d'avance ; suppression en masse.
- Un salarié très au-dessus de l'équipe sur le volume (contrôle de plausibilité, **pas une accusation**).

**Règles d'équité :** une alerte est un **signal à vérifier**, jamais une sanction automatique ; l'admin peut « Ignorer » ou « Marquer vérifié » (la raison est gardée) ; seuil minimum de données avant d'alerter ; le salarié ne voit pas ces alertes, sauf un message neutre si l'admin l'envoie.

- [ ] **M9.1 — Règles pures** (M) : `src/utils/watch.ts` + `check:watch` (jour férié, congé, mission de nuit, 0 mission, équipe de 1, dates fausses).
- [ ] **M9.2 — Journal serveur** (M) — **accord + sauvegarde avant** : le serveur note connexions échouées, écritures refusées, changements de tarif (table `df_audit` ou extension de `df_security_logs`).
- [ ] **M9.3 — Écran « À surveiller »** (M) : liste triée par gravité, boutons Ignorer / Vérifié, lien vers la fiche salarié ; pastille dans le menu comme pour Statistiques.
- [ ] **M9.4 — Notifications** (S) : alerte envoyée à l'admin (cloche de l'appli ; e-mail facultatif).
- [ ] **M9.5 — Réglages, démo, anglais, contrôle** (S).

---

## MODULE 10 — Assistant de l'administration (dans la messagerie) — taille L

**Demande de BTK (2026-10-20) :** un assistant, comme un administrateur automatique, dans les messages. Il rappelle ce que l'admin a oublié (validations, actions à faire), connaît les conditions de l'entreprise, le stock, et sait faire le **récapitulatif d'un employé** (son parcours, son travail, ses chiffres, son financement).

**Idée : deux niveaux, on commence par le sûr et gratuit.**

**Niveau A — Assistant à règles (gratuit, sans service externe, à faire d'abord).**
- Conversation « Assistant » épinglée dans la messagerie de l'admin (visible **seulement par l'admin**).
- **Rappels automatiques** (ce que l'admin a oublié) : missions à valider depuis plus de X heures, inscriptions et demandes en attente, factures en retard, stock bas, avance en attente, alertes du module 9 non vérifiées, objectifs en danger. Un message par sujet, regroupé en un résumé du matin, jamais de spam (une fois par sujet, sauf si ça empire).
- **Récapitulatif d'un employé** : le menu « Récap de… » (ou la commande « résumé de Marie ») génère une fiche : date d'arrivée et ancienneté (« 2 ans et 1 mois »), nombre de missions, taux de validation, badges (module 3), présence et retards, salaire gagné, avances, reste dû. Texte lisible + bouton « Imprimer / PDF ».
- **Questions simples** par boutons et mots-clés : « Quoi à faire aujourd'hui ? », « Stock bas ? », « Qui a un retard ? », « Que dit la règle des congés ? » (lit la page Conditions).
- Tout est **calculé par les règles déjà testées** (mêmes fonctions que Statistiques et Finances) : pas d'invention possible.

**Niveau B — Vrai assistant IA (modèle de langage), facultatif, plus tard.**
- Permet de poser des questions libres en langage naturel.
- **Ce qu'il demande :** une clé d'un service d'IA (secret côté Supabase, jamais dans le code), un petit coût à l'usage, et une fonction serveur dédiée (route `assistant`), **avec accord de BTK**.
- **Confidentialité :** les données financières et personnelles quittent alors le serveur vers un service externe. Règles : admin seulement ; on n'envoie que le **résumé calculé** nécessaire à la question (jamais mots de passe, jetons, identifiants, fichiers) ; une case « Activer l'IA externe » **désactivée par défaut** dans la page Conditions, avec un avertissement clair ; journal des questions posées.
- L'IA **ne peut rien modifier** : elle lit et explique. Toute action (valider, payer, supprimer) reste un bouton que l'admin confirme lui-même.
- **Honnêteté :** une IA peut se tromper ; chaque réponse montre ses sources (« d'après 42 missions du 01/09 au 20/10 ») et un lien vers l'écran d'origine.

**Niveau A+ — Aide à la rédaction (demande de BTK, 2026-10-20).** Le niveau A ne sait pas écrire une phrase adaptée (exemple : s'excuser auprès d'un client pour un retard). On ajoute donc deux étapes, dans cet ordre.
- **A+1 — Modèles de messages (gratuit, sans clé, sans service externe).** Une bibliothèque de messages professionnels : excuse pour retard, relance de facture, confirmation de mission, refus poli, remerciement. L'admin choisit le cas ; l'assistant remplit le nom du client, la date et le motif ; l'admin modifie si besoin avant d'envoyer. Textes FR et EN, ton toujours poli. Couvre la plupart des besoins.
- **A+2 — Rédaction libre par IA (clé gratuite, facultatif, désactivé par défaut).** Pour les cas hors modèles. Services à palier gratuit possibles (exemples : Google Gemini, Groq) ; **les limites et conditions du palier gratuit changent souvent : les vérifier le jour du codage**, ne pas se fier à ce plan.
- **Règles de confidentialité de A+2 :**
  - l'IA reçoit **seulement** le motif, le ton demandé et, au besoin, le prénom du destinataire ; **jamais** salaires, finances, données d'employés, mots de passe, jetons ;
  - les rappels et les récaps d'employés restent calculés par les règles du niveau A : rien de sensible ne sort ;
  - **rien ne part automatiquement** : l'admin relit et envoie lui-même ;
  - certains paliers gratuits peuvent utiliser les textes pour entraîner le modèle : raison de plus de n'y mettre aucune donnée sensible ;
  - la clé est un secret côté Supabase, jamais dans le dépôt ; case « Activer la rédaction par IA » désactivée par défaut dans la page Conditions, avec avertissement ; limite de demandes par jour.

**Sécurité transversale :** conversation créée côté admin seulement ; un opérateur ne la reçoit jamais (même filtre que les routes admin) ; aucun chiffre d'argent n'est écrit dans une conversation visible d'un opérateur.

- [ ] **M10.1 — Règles pures des rappels** (M) : `src/utils/assistantReminders.ts` + `check:assistant` (rien à signaler = aucun message ; pas de doublon ; priorité ; textes FR/EN).
- [ ] **M10.2 — Récap d'un employé** (M) : `src/utils/employeeRecap.ts` (ancienneté, chiffres, badges, paie) + test (employé sans mission, arrivé aujourd'hui, 2 ans pile, compte supprimé).
- [ ] **M10.3 — Conversation « Assistant »** (L) : fil épinglé dans la messagerie admin, messages générés **dans le navigateur de l'admin** (pas de nouvelle table pour le niveau A), boutons de réponses rapides, résumé du matin réglable (heure, on/off) dans la page Conditions.
- [ ] **M10.4 — Récap imprimable** (S) : page claire isolée comme le rapport mensuel.
- [ ] **M10.5 — Essai de BTK** : admin (voit l'assistant), opérateur (ne voit rien), téléphone, clair et sombre, FR et EN.
- [ ] **M10.5b — Modèles de messages (A+1)** (M) : `src/utils/messageTemplates.ts` (modèles FR/EN avec champs : client, date, motif) + test (champ manquant = message refusé, jamais de « undefined » dans le texte) + écran « Rédiger un message » dans l'assistant, modification libre avant envoi.
- [ ] **M10.5c — Rédaction par IA (A+2)** (L) : **accord + clé + limites du palier gratuit vérifiées avant** ; route serveur dédiée, case d'activation désactivée par défaut, filtre qui n'envoie que motif et ton, test d'injection, limite par jour, aperçu obligatoire avant envoi.
- [ ] **M10.6 — (facultatif, niveau B)** (L) — **accord + clé + coût expliqués avant** : route `assistant` dans `df-api`, bouton d'activation, avertissement de confidentialité, test d'injection (un texte malveillant dans un nom de mission ne doit rien déclencher), limite de questions par jour.

---

## Ordre conseillé

1. **Module 0** (page Conditions de l'entreprise) — les autres modules en dépendent.
2. **Plus de décisions à prendre** : D1 à D11 sont des réglages de la page Conditions.
3. **Module 1** (Clients) — il débloque tout le reste.
4. **Module 3.A** (performance et badges des salariés) — peut se faire en parallèle, sans nouvelle table.
5. **Module 2** (Facturation et reçus).
6. **Module 3.B** (badges clients), puis **Module 4** (fournisseurs et achats).
7. **Module 5** (RH), **Module 6** (missions avancées), **Module 7** (droits et audit).
8. **Module 9** (détection automatique) — les règles de retard et d'absence peuvent venir tôt, après le module 0.
9. **Module 10, niveau A** (assistant à règles dans la messagerie) — après les modules 3 et 9, car il s'appuie sur leurs calculs ; puis A+1 (modèles de messages), puis A+2 (rédaction par IA, clé gratuite) et le niveau B (IA externe) seulement si BTK le veut.
10. **Module 8** (direction et contrôle final).

## Risques à surveiller

| Risque | Parade |
|---|---|
| Deux factures avec le même numéro | Numéro attribué par le serveur dans une opération atomique, jamais par le navigateur ; test à deux émissions simultanées |
| Une facture émise modifiée ou supprimée | Le serveur refuse ; annulation seulement par un avoir |
| Facture non conforme aux règles du pays | BTK la fait relire par un comptable (D3, D4) ; Claude ne garantit pas la conformité légale |
| Un opérateur ou un client voit de l'argent | Admin seulement côté serveur, test avec un vrai compte opérateur à chaque module |
| Badges injustes ou truqués | Échantillon minimum, calcul expliqué, seuils réglés par l'admin, rien de saisi à la main |
| Un salarié se compare aux autres et se décourage | Il ne voit que son propre score et ses réussites (D8, D9) |
| Données de démo mélangées à la vraie base | La démo reste 100 % locale ; contrôle « 0 appel réseau » à chaque module |
| Perte de données en créant des tables | Sauvegarde avant, migration écrite, retour en arrière écrit |
| Quota Supabase | Calculs dans le navigateur, pas de nouvelle synchro rapide |
| Trop de choses d'un coup | Un module à la fois, utilisable seul, essai de BTK avant de passer au suivant |

## Journal de ce plan
- 2026-10-20 : plan créé à la demande de BTK (clients, facturation et reçus, salariés, argent, stock, suivi de performance avec badges pour salariés et clients). **Rien n'est codé.** En attente : réponses aux décisions D1 à D11 et « GO » pour le module 1.
- 2026-10-20 : Module 10 complété avec le niveau A+ (modèles de messages gratuits, puis rédaction par IA à clé gratuite, désactivée par défaut, sans données sensibles). **Rien n'est codé.**
- 2026-10-20 : **Module 1, M1.1 et M1.2 faits** (règles pures des clients, `npm run check:clients` 47/47, règle de prix à 5 niveaux). Prochaine étape **M1.3 : table `df_clients`, accord de BTK + sauvegarde avant** (rien n'a été créé dans la base).
- 2026-10-20 : **Module 1, M1.3 fait** : table `df_clients` créée (sauvegarde n° 12), `df-api` v12 = `32b386d`, `check:clients-server` 67/67. Prochaine étape **M1.4 : écran Clients**.
- 2026-10-20 : **Module 1, M1.3b fait** : seuils des statuts clients réglables dans Réglages > Conditions, `df-api` v13 = `5ba6037` (sauvegarde n° 13). Prochaine étape **M1.4 : écran Clients**.
- 2026-10-20 : **Module 1, M1.4 fait** : page Clients (liste, recherche, filtres, tri, fiche, création, modification, archivage), `df-api` v14 = `d8c9438` (sauvegarde n° 14). Prochaine étape **M1.5 : missions liées aux clients**.
- 2026-10-20 (21 h UTC) : **état vérifié** : M1.1 à M1.4 faits, M1.5 à M1.7 à faire ; `df-api` v14 = `d8c9438` (déployée), `df_clients` protégée (RLS, aucun accès public, 0 ligne), sauvegardes n° 12 à 14 la contiennent, tâche de nuit active ; tous les contrôles passent sauf `check:demo-stats` dans un conteneur en UTC après minuit à Madagascar (passe avec `TZ=Indian/Antananarivo` : problème du test, pas du site). Une 2e session reprend **M1.5**.
