# TODO — Statistiques, finances et stock (Gestion Pro)

Créé le 2026-10-18 à la demande de BTK. À lire avec `LIRE_EN_PREMIER.md`, `AI_STUDIO.md` et `TODO.md`.
La **phase 1 est faite** (2026-10-19, non testée à l'écran) ; les phases 2 à 5 sont **à faire**. Taille : S = petite, M = moyenne, L = grosse.

## But

Une page **Statistiques** pour l'admin, comme dans une vraie entreprise : suivre les **missions**, les **employés**, les **salaires**, l'**argent qui entre et qui sort**, le **bénéfice** et le **stock**. Tout avec un filtre **Jour / Semaine / Mois / Année** et une comparaison avec la période d'avant.

## Décisions déjà prises (BTK, 2026-10-18)

- L'argent qui entre vient des **clients qui paient leurs missions**.
- Les graphiques et les chiffres sont comme dans les « films » : bénéfices et dépenses faciles à lire, avec des conseils comme une vraie entreprise.
- Devise : **Ar** (Ariary), comme le reste du site.

## Décisions à prendre avec BTK (à poser avant la phase concernée)

1. **Prix client** : le client paie combien par mission ? Un prix pour toutes les missions, un prix par type de mission (Saisie, Contrôle, Administratif, Aide, Web), ou un prix par client ? (conseil : un prix par défaut + un prix par type, modifiable mission par mission)
2. **Encaissement** : le client paie à la mission, à la semaine ou au mois ? Faut-il suivre « facturé » et « encaissé » (conseil : oui, pour voir ce qui reste à encaisser) ?
3. **Catégories de dépenses** : salaires, avances, achats, loyer, internet, matériel, autres (modifiable).
4. **Stock** : que veut-on suivre exactement (objets vendus, matériel du bureau) ? À demander avant la phase 3.
5. **Remise à zéro** : doit-elle effacer les finances et le stock ? (conseil : non, garder les finances)

## Règles communes (valables pour toutes les étapes)

- Lire d'abord `LIRE_EN_PREMIER.md`, `AI_STUDIO.md`, `HANDOVER.md`. `git fetch` avant de commencer ; ne jamais écraser le travail d'un autre chat.
- **Présenter le plan à BTK et attendre son « GO »** avant d'écrire du code.
- Un commit clair par étape. `npx tsc --noEmit` et `npm run build` doivent passer avant chaque push.
- **Créer ou changer une table Supabase : demander l'accord de BTK**, faire une **sauvegarde avant** (bouton « Sauvegarder maintenant » dans Réglages > Données), et noter la procédure de retour en arrière.
- Les chiffres d'argent sont **visibles seulement par l'admin**, aussi côté serveur (voir S2.4).
- **Chaque écran doit aussi marcher en mode démo** (faux serveur local, rien d'envoyé au vrai serveur) avec des chiffres inventés.
- **Anglais** : tout texte visible nouveau doit avoir sa version dans `src/utils/enDict.json`.
- Téléphone d'abord (écran étroit), mode clair et sombre, pas de nouvelle grosse bibliothèque (il n'y a pas de bibliothèque de graphiques dans le projet : on dessine en SVG léger).
- **À chaque étape finie, mettre à jour les listes dans le même commit** (demande de BTK, 2026-10-18) : (1) cocher la case `[x]` de l'étape dans ce fichier, avec la date et le numéro du commit ; (2) ajouter une ligne au journal de `TODO.md` ; (3) écrire « non testé à l'écran » tant que BTK n'a pas vérifié. Pas d'étape cochée si `tsc` et `build` ne passent pas.

---

## PHASE 1 — Pilotage (sans nouvelle table) — taille L — **terminée côté code le 2026-10-18 (S1.1 à S1.9) ; essai à l'écran par BTK à faire**

Données déjà disponibles : missions (`posts`, `contracts`), employés (`users`, présence), avances (`advances`), paie à tarif fixe (`settings.price_per_mission`).

- [x] **S1.1 — Calcul des périodes et des chiffres** (M) — *fait le 2026-10-18, commit `e4c2c98`*
  - Fichier : `src/utils/stats.ts` (fonctions pures, sans écran).
  - Fonctions : début et fin d'un jour / semaine (lundi) / mois / année ; période d'avant ; regrouper les données par jour ou par mois ; variation en % (gérer le cas « période d'avant = 0 »).
  - Heure de Madagascar (UTC+3) pour couper les jours.
  - Réussite : un petit script Node de contrôle (comme pour la démo) vérifie 15 cas, dont fin de mois, année bissextile, semaine qui change de mois.
  - **Fait :** `src/utils/stats.ts` + `scripts/check-stats.ts` (`npm run check:stats`, **41 contrôles réussis**). Les périodes en cours sont comparées au même nombre de jours de la période d'avant (ex. 18 octobre contre 1 à 18 septembre). Le montant gagné = `calculated_ar` des missions validées (même base que la paie du serveur).
  - **Écart avec le plan :** il n'existe pas de date limite sur les missions, donc « en retard » n'est pas calculable pour l'instant (voir S1.5). « Présence » = temps passé sur les missions (pas les heures connectées, trop d'appels serveur).

- [x] **S1.2 — Page « Statistiques » et menu** (M) — *fait le 2026-10-18, commit `6b1576e`*
  - Fichiers : `src/views/admin/StatsPage.tsx` (nouveau, chargé en `lazy`), `src/App.tsx`, `src/components/Sidebar.tsx`, `src/components/BottomNav.tsx`.
  - Barre de filtre : **Jour / Semaine / Mois / Année**, flèches « avant / après », bouton « Aujourd'hui », titre de la période (« Octobre 2026 »).
  - Réussite : on change de période sans recharger la page, le choix reste quand on revient sur la page.
  - **Fait :** menu admin « Statistiques », `StatsPage.tsx` (chargée en `lazy`), filtre Jour / Semaine / Mois / Année, flèches, « Aujourd'hui » (flèche « suivant » bloquée sur la période en cours), réservée à l'admin. Le type de période est gardé d'une visite à l'autre ; la date est gardée quand on change de page. Pour l'instant la page affiche seulement le nombre de missions faites (le reste = S1.3 à S1.7).

- [x] **S1.3 — Composants de graphiques en SVG** (M) — *fait le 2026-10-18, commit `4b6b4dd`*
  - Fichier : `src/components/charts/` : barres, courbe, anneau, mini-courbe dans les cartes.
  - Lisible sur téléphone, couleurs du thème, texte alternatif pour l'accessibilité, aucun chiffre qui déborde.
  - Réussite : aucun graphique ne casse avec 0 donnée, 1 donnée ou 365 données.
  - **Fait :** `src/components/charts/Charts.tsx` (`BarChart` avec traits de la période d'avant et valeur au toucher, `DonutChart` avec légende et « Autres » au-delà de 6 parts, `Sparkline`, `compactNumber`) ; `scripts/check-charts.tsx` (`npm run check:charts`, **20 contrôles réussis** : 0, 1, 7, 24, 31 et 365 données, NaN, anneau vide). Pas de couleur seule : chaque part a son texte et son pourcentage.

- [x] **S1.4 — Cartes de chiffres du haut** (S) — *fait le 2026-10-18, commit `e678f48`*
  - Missions faites, taux de validation, salaires gagnés, avances en cours, employés actifs, missions en retard.
  - Chaque carte : chiffre, petite flèche ▲▼ et « +12 % depuis la période d'avant ».
  - **Fait :** `src/components/StatCard.tsx` + 6 cartes dans `StatsPage.tsx` : Missions faites, Taux de validation (écart en points), Salaires gagnés, Avances accordées (une hausse est en orange : c'est une charge), Employés actifs (jour / nuit), À valider (+ à faire / en cours). Mini-courbes sur Missions et Salaires. Écart avec le plan : la carte « Missions en retard » est remplacée par « À valider », car les missions n'ont pas de date limite.

- [x] **S1.5 — Section « Missions »** (M) — *fait le 2026-10-18, commit `d01df8d`*
  - Missions faites par jour (barres), par type (anneau), refusées, durée moyenne, taux de validation.
  - Missions à venir : à faire, en cours, à valider, en retard (liste cliquable vers le tableau Kanban).
  - **Fait :** barres « Missions faites par heure / jour / mois » avec traits de la période d'avant, validées / refusées / durée moyenne, anneau par type de mission, bloc « Missions à venir » (à faire, en cours, à valider, urgentes) avec boutons « Voir le tableau » et « Valider ». **Pas fait : « en retard »** (les missions n'ont pas de date limite ; une phrase l'explique sur la page). À reprendre si une date limite est ajoutée aux missions (voir P1-1 du `TODO.md`).

- [x] **S1.6 — Section « Équipe »** (M) — *fait le 2026-10-18, commit `45b2a2d`*
  - Employés actifs (jour / nuit), présence moyenne (heures connectées), classement des meilleurs, missions par employé et par heure, employés sans activité.
  - Un clic sur un employé ouvre sa fiche.
  - **Fait :** section « Équipe » : actifs, nombre de personnes qui ont travaillé, moyenne par personne, classement (barre, gagné, temps sur missions, missions par heure ; 8 premiers puis « Voir tout »), liste des personnes sans mission sur la période. Un clic sur un nom ouvre la fiche (CV). Écart avec le plan : « présence » = temps passé sur les missions (pas les heures de connexion, pour ne pas multiplier les appels serveur).

- [x] **S1.7 — Section « Salaires »** (M) — *fait le 2026-10-18, commit `45b2a2d`*
  - Salaires gagnés sur la période (missions validées × tarif), déjà payés, **reste à payer**, avances en cours et remboursées.
  - Réutiliser le calcul de `PayrollAdmin.tsx` (ne pas inventer un second calcul qui donnerait d'autres chiffres).
  - Réussite : le total de la page = le total de la page Paie pour la même période.
  - **Fait :** section « Salaires » : barres des salaires gagnés, gagné / avances accordées / avances en attente, et pour un **mois** (si la paie est mensuelle) « Net à payer / Déjà payé / Reste à payer » lus avec la route existante `payroll-period` (lecture seule, 1 appel par mois affiché, gardé 2 minutes). Même base que la paie (`calculated_ar` des missions validées). Contrôlé en démo : total Paie = total Statistiques (septembre 430 000, octobre 210 000). **Pas encore vérifié sur la vraie base.** La paie de démo (`payroll-period`) est ajoutée au faux serveur, en lecture seule.

- [x] **S1.8 — Démo, anglais, téléphone** (S) — *fait le 2026-10-19 (commit : voir le journal de `TODO.md`) ; S1.7 = commit `45b2a2d`*
  - Données de démo déjà sur 60 jours : vérifier que les graphiques sont pleins et jolis.
  - Textes anglais dans `enDict.json`.
  - **Fait :** (1) démo étendue à **2 ans** (771 missions : dense sur les 60 derniers jours, plus légère avant) pour que les vues Mois et Année soient pleines **et comparées à la période d'avant** ; 3 missions terminées aujourd'hui (la vue Jour n'est pas vide) ; 6 avances réparties sur l'année ; durées variées (1 h à 3 h 30). Construction en 36 ms, 406 Ko. (2) Nouveau contrôle `npm run check:demo-stats` (`scripts/check-demo-stats.ts`, **35 contrôles réussis**) : barres remplies, comparaison, taux, durée, types, classement, à venir, avances ; tient compte du jour de la semaine (une semaine qui vient de commencer n'a pas 7 barres). (3) Anglais : les textes de la page étaient déjà presque tous couverts ; ajout de 20 entrées dans `enDict.json` pour les phrases mal rendues (Voir tout, Aucune donnée, Classement, Sans activité, Autre, « Les missions n'ont pas encore de date limite… », par heure / jour / mois…). (4) Téléphone : la « Durée moyenne » (ex. « 1 h 52 min ») passe en `text-base` avec retour à la ligne pour ne plus déborder d'une case de 3 colonnes. **Non testé sur un vrai téléphone** (pas de navigateur disponible) : revue du code seulement.
  - **Complément (2026-10-19, autre chat en parallèle) :** les phrases anglaises construites par la page (périodes, « per person », « Show all »…) et les graphiques sont exclus du traducteur automatique (`data-notranslate`), qui abîmait « Mar » en « Tue » et mettait des majuscules à « missions » ; les graphiques ont leurs textes FR/EN (prop `lang`). Pas vérifié sur un vrai téléphone.

- [x] **S1.9 — Contrôle de la phase 1** (S) — *fait le 2026-10-19 (même commit que S1.8)*
  - `tsc`, `build`, script de contrôle des chiffres, tout noté dans `TODO.md`.
  - **Résultat :** `tsc --noEmit` sans erreur ; `npm run build` sans erreur ; `npm run check:stats` **41/41** ; `npm run check:charts` **20/20** ; `npm run check:demo-stats` **35/35** ; démo exécutée sous Node avec le réseau bloqué : **0 appel** au serveur. **Reste à faire par BTK : ouvrir la page Statistiques sur le téléphone** (admin et démo) et dire ce qui déborde ou semble faux.
  - **La phase 1 est terminée. La phase 2 (finances) attend les 5 décisions de BTK** (prix client, encaissement, catégories de dépenses, stock, remise à zéro).
  - **Complément (2026-10-19) :** nouveau contrôle `npm run check:page` (**18/18** : page rendue en démo, FR et EN, jour / semaine / mois / année, sans erreur ni NaN ; un opérateur ne voit rien ; 0 appel réseau) ; `npm run check:charts` passe à **22/22** (textes FR/EN, exclusion du traducteur).

---

## PHASE 2 — Finances : argent qui entre, argent qui sort, bénéfice — taille L

**Principe (vraie entreprise) :**
- **Facturé** = missions validées × prix client.
- **Encaissé** = paiements réellement reçus des clients (saisis par l'admin).
- **À encaisser** = facturé − encaissé.
- **Dépenses** = salaires + avances + achats + frais.
- **Bénéfice net** = encaissé − dépenses. **Marge** = bénéfice ÷ encaissé.

- [x] **S2.1 — Prix client** (M) — *sans nouvelle table* — **fait le 2026-10-19** (non testé à l'écran, voir note ci-dessous)
  - Ajouter un champ `client_price_ar` sur la mission (les missions sont des données JSON : pas de changement de table).
  - Réglages > Missions : prix client par défaut et prix par type ; modifiable mission par mission.
  - Les anciennes missions utilisent le prix par défaut (rien n'est cassé).
  - Dépend de la décision n° 1.
  - **Décision n° 1 prise par BTK (2026-10-19)** : un prix par défaut + des exceptions par type ou par mission.
  - **Fait** : `AppSettings.client_price_default_ar` et `client_prices_by_type` ; `ClientContract.client_price_ar` (prix propre à la mission) ; `PostSession.client_price_ar` (prix **figé à la validation**, comme la paie) ; règle dans `src/utils/clientPrice.ts` : prix de la mission, sinon prix du type, sinon prix par défaut (0 est un vrai prix). Réglages > Missions > « Prix client » ; champ « Prix client de cette mission » dans les options avancées (création et modification). Anciennes missions : prix recalculé par la règle (rien n'est cassé). Démo : prix inventés (8 000 / 9 000 / 12 000 Ar). Anglais ajouté. Contrôle : `npm run check:client-price` (29/29), `tsc` et `build` OK.
  - **⚠ À ne pas faire avant S2.4** : ne pas saisir de vrais prix client dans la vraie base. Aujourd'hui le serveur envoie `settings`, `contracts` et `posts` en entier aux opérateurs : ils verraient les prix client. S2.4 doit retirer `client_price_default_ar`, `client_prices_by_type` et `client_price_ar` pour les non-admins (lecture) et refuser leur écriture (sync). Le prix par défaut vaut 0 tant que BTK n'a rien réglé.

- [ ] **S2.2 — Nouvelle table `df_cash`** (M) — **accord de BTK + sauvegarde avant**
  - Même modèle que les autres tables : `id`, `data` (JSON), `updated_at`, sécurité RLS activée, aucun accès public.
  - Une ligne = une entrée ou une sortie : `kind` (in/out), `category`, `amount_ar`, `date`, `note`, `client_name?`, `mission_id?`, `created_by`.
  - Migration SQL écrite dans le dépôt (`supabase/migrations/…`) et notée dans `AI_STUDIO.md`.
  - **Ajouter `df_cash` à la liste des tables de la fonction `df_take_backup()`** (sinon elle n'est pas sauvegardée la nuit).
  - Procédure de retour en arrière écrite.

- [ ] **S2.3 — Serveur `df-api`** (M)
  - Ajouter la collection `cash` à `COLS` côté serveur et côté client (`src/db/store.ts`), aux routes `state` et `sync`.
  - Redéployer `df-api` avec le petit fichier d'import au commit exact (voir `AI_STUDIO.md`) ; retour en arrière = commit précédent.

- [ ] **S2.4 — Sécurité : admin seulement** (M) — **obligatoire**
  - `state` ne doit **jamais** envoyer `cash` à un employé ; `sync` doit **refuser** toute écriture d'un employé sur `cash`.
  - Test : avec un compte employé, la collection n'apparaît nulle part (réponse du serveur et écran).

- [ ] **S2.5 — Écran « Finances »** (L)
  - Onglet dans la page Statistiques (ou page à part).
  - Boutons « + Paiement reçu d'un client » et « + Dépense » : montant, date, catégorie, note, client.
  - Liste filtrable (période, catégorie, entrée/sortie), modifier et supprimer avec confirmation.
  - Salaires payés et avances apparaissent **automatiquement** comme dépenses (calculés, jamais saisis deux fois).

- [ ] **S2.6 — Chiffres et graphiques financiers** (L)
  - Cartes : argent entré, sorti, **bénéfice net**, **marge %**, **à encaisser**, trésorerie (argent disponible).
  - Graphiques : entrées vs sorties par jour/semaine/mois ; bénéfice cumulé ; dépenses par catégorie (anneau) ; facturé vs encaissé.
  - Chiffres « vraie entreprise » : **coût par mission**, **gain par mission**, **marge par type de mission**, **meilleur client**.

- [ ] **S2.7 — Démo et anglais** (S)
  - Entrées et sorties inventées dans la démo ; ajout / modification / suppression marchent en local.
  - Textes anglais.

- [ ] **S2.8 — Remise à zéro et sauvegarde** (S)
  - Selon la décision n° 5. Vérifier que la page Sauvegardes contient bien `df_cash` (nombre de tables passe de 16 à 17).

- [ ] **S2.9 — Contrôle de la phase 2** (S)
  - `tsc`, `build`, script de contrôle (bénéfice = encaissé − dépenses sur 10 cas), test employé (S2.4), note dans `TODO.md`.

---

## PHASE 3 — Stock et produits — taille L (dépend de la décision n° 4)

- [ ] **S3.1 — Nouvelles tables** (M) — **accord de BTK + sauvegarde avant**
  - `df_products` : nom, catégorie, unité, prix d'achat, prix de vente, **seuil d'alerte**.
  - `df_stock_moves` : produit, type (entrée / sortie / ajustement), quantité, date, note.
  - Ajouter les deux à `df_take_backup()`, RLS activée, admin seulement (comme S2.4).

- [ ] **S3.2 — Écran « Stock »** (L)
  - Liste des produits avec quantité en stock, valeur du stock, voyant rouge sous le seuil.
  - « + Entrée » et « + Sortie » (la quantité se calcule à partir des mouvements, jamais saisie à la main).

- [ ] **S3.3 — Lien avec les finances** (S)
  - Option : un achat de stock crée automatiquement une dépense « Achats » (avec confirmation).

- [ ] **S3.4 — Graphiques de stock** (M)
  - Valeur du stock dans le temps, produits les plus utilisés, produits bientôt en rupture.

- [ ] **S3.5 — Démo, anglais, contrôle** (S)

---

## PHASE 4 — Objectifs, alertes, prévisions, exports — taille M

- [ ] **S4.1 — Objectifs du mois** (M)
  - Réglages : objectif de missions, de bénéfice, de dépenses maximum. Barre d'avancement sur l'accueil et sur Statistiques.

- [ ] **S4.2 — Alertes sur l'accueil admin** (M)
  - Dépassement de budget, bénéfice en baisse, trésorerie basse, **stock bas**, missions en retard, avance trop grosse, client qui n'a pas payé depuis X jours.
  - Pastille rouge dans le menu quand il y a une alerte. Lien avec les notifications (voir P1-1 du `TODO.md`).

- [ ] **S4.3 — Prévision simple** (S)
  - « À ce rythme, fin du mois : X missions, Y Ar de bénéfice » (calcul linéaire, expliqué en une phrase, jamais présenté comme une certitude).

- [ ] **S4.4 — Export** (M)
  - Excel (bibliothèque `xlsx` déjà dans le projet) : un onglet par section. PDF : page imprimable avec les graphiques.
  - Les exports contiennent des chiffres d'argent : bouton visible seulement par l'admin.

- [ ] **S4.5 — Rapport du mois** (S)
  - Une page « Rapport mensuel » prête à montrer : résumé, 3 points forts, 3 points d'attention.

---

## PHASE 5 — Contrôle final et documents — taille S

- [ ] **S5.1 — Essai complet par BTK** (téléphone, mode clair et sombre, FR et EN, démo admin) ; liste des petits défauts.
- [ ] **S5.2 — Vitesse** : la page Statistiques s'ouvre vite avec 60 jours de données ; ne pas lancer de nouveaux appels serveur en boucle (économie de quota, voir P1-2).
- [ ] **S5.3 — Documents** : mettre à jour `PROJET.md` (menu admin), `HANDOVER.md`, `AI_STUDIO.md` (nouvelles tables, routes, procédure de retour), `TODO.md` (journal).
- [ ] **S5.4 — Nettoyage** : aucun chiffre inventé ne doit apparaître dans la vraie base ; la démo reste 100 % locale.

---

## Ordre conseillé

1. **Phase 1** (aucun risque pour les vraies données) → 2. **Décisions 1, 2, 3** → 3. **Phase 2** (tables, accord de BTK) → 4. **Phase 4** (objectifs et alertes, utile dès que les finances existent) → 5. **Décision 4** puis **Phase 3** (stock) → 6. **Phase 5**.

## Risques à surveiller

| Risque | Parade |
|---|---|
| Un employé voit l'argent | S2.4 : filtre côté serveur et test avec un compte employé |
| Deux calculs de salaire différents | S1.7 : réutiliser le calcul de la page Paie |
| Perte de données en créant des tables | Sauvegarde avant + migration notée + retour en arrière écrit |
| Nouvelles tables oubliées dans la sauvegarde de nuit | S2.2 et S3.1 : les ajouter à `df_take_backup()` |
| Quota Supabase | Pas de nouvelle synchro rapide ; calculs faits dans le navigateur |
| Chiffres faux (fuseau, fin de mois) | S1.1 : script de contrôle des périodes |
