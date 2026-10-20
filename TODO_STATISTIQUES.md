# TODO — Statistiques, finances et stock (Gestion Pro)

Créé le 2026-10-18 à la demande de BTK. À lire avec `LIRE_EN_PREMIER.md`, `AI_STUDIO.md` et `TODO.md`.
Les **phases 1 et 2 sont faites côté code, et la phase 3 (stock) aussi sauf la création des tables sur `nprojet` et le déploiement de `df-api` v9** (2026-10-19 ; non testées à l'écran) ; finances et stock réservés à l'admin côté serveur (voir S2.9 et S3.1) ; essai avec un compte employé à faire ; les phases 3 à 5 sont **à faire**. Taille : S = petite, M = moyenne, L = grosse.

## But

Une page **Statistiques** pour l'admin, comme dans une vraie entreprise : suivre les **missions**, les **employés**, les **salaires**, l'**argent qui entre et qui sort**, le **bénéfice** et le **stock**. Tout avec un filtre **Jour / Semaine / Mois / Année** et une comparaison avec la période d'avant.

## Décisions déjà prises (BTK, 2026-10-18)

- L'argent qui entre vient des **clients qui paient leurs missions**.
- Les graphiques et les chiffres sont comme dans les « films » : bénéfices et dépenses faciles à lire, avec des conseils comme une vraie entreprise.
- Devise : **Ar** (Ariary), comme le reste du site.

## Décisions à prendre avec BTK (état au 2026-10-19)

1. **Prix client** — **PRISE par BTK (2026-10-19)** : un prix par défaut, avec des exceptions par type ou par mission (option recommandée). Fait dans S2.1.
2. **Encaissement** — **PRISE par BTK (2026-10-19)** : chaque paiement reçu est noté quand il arrive (pas de rythme fixe imposé). Fait dans S2.5 (« + Paiement reçu »). « Facturé » (missions validées × prix client) et « à encaisser » (facturé − encaissé) se calculent à partir de ces lignes : à afficher dans S2.6.
3. **Catégories de dépenses** — proposition appliquée dans S2.5 (Achats, Loyer, Internet, Matériel, Transport, Autres ; entrées « Paiement client » et « Autre entrée » ; on peut en écrire une autre). **À confirmer par BTK** (BTK n'a pas encore répondu à cette question précise).
4. **Stock** — **en attente** (phase 3 seulement). Recommandation : ne pas le faire si le site gère seulement des missions.
5. **Remise à zéro** — **PRISE par BTK (2026-10-19)** : non, garder les finances. Déjà vrai dans le code (S2.2 : `df-restore` n'efface pas `df_cash`) ; vérifié et écrit dans l'écran de remise à zéro (fait dans S2.8).

**Choix à valider par BTK (laissé par S2.5)** : les salaires sont calculés (non modifiables) et les avances ne sont **pas** ajoutées aux dépenses (ce serait les compter deux fois). Recommandation : garder ainsi.

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
- **Dépenses** = salaires + achats + frais (les avances sont des salaires versés d'avance : comprises dans les salaires, non ajoutées ; voir S2.5).
- **Bénéfice net** = encaissé − dépenses. **Marge** = bénéfice ÷ encaissé.

- [x] **S2.1 — Prix client** (M) — *sans nouvelle table* — **fait le 2026-10-19** (non testé à l'écran, voir note ci-dessous)
  - Ajouter un champ `client_price_ar` sur la mission (les missions sont des données JSON : pas de changement de table).
  - Réglages > Missions : prix client par défaut et prix par type ; modifiable mission par mission.
  - Les anciennes missions utilisent le prix par défaut (rien n'est cassé).
  - Dépend de la décision n° 1.
  - **Décision n° 1 prise par BTK (2026-10-19)** : un prix par défaut + des exceptions par type ou par mission.
  - **Fait** : `AppSettings.client_price_default_ar` et `client_prices_by_type` ; `ClientContract.client_price_ar` (prix propre à la mission) ; `PostSession.client_price_ar` (prix **figé à la validation**, comme la paie) ; règle dans `src/utils/clientPrice.ts` : prix de la mission, sinon prix du type, sinon prix par défaut (0 est un vrai prix). Réglages > Missions > « Prix client » ; champ « Prix client de cette mission » dans les options avancées (création et modification). Anciennes missions : prix recalculé par la règle (rien n'est cassé). Démo : prix inventés (8 000 / 9 000 / 12 000 Ar). Anglais ajouté. Contrôle : `npm run check:client-price` (29/29), `tsc` et `build` OK.
  - **⚠ À ne pas faire avant S2.4** : ne pas saisir de vrais prix client dans la vraie base. Aujourd'hui le serveur envoie `settings`, `contracts` et `posts` en entier aux opérateurs : ils verraient les prix client. S2.4 doit retirer `client_price_default_ar`, `client_prices_by_type` et `client_price_ar` pour les non-admins (lecture) et refuser leur écriture (sync). Le prix par défaut vaut 0 tant que BTK n'a rien réglé.

- [x] **S2.2 — Nouvelle table `df_cash`** (M) — **accord de BTK + sauvegarde avant** — *fait le 2026-10-19 (commit « stats S2.2 »)*
  - Même modèle que les autres tables : `id`, `data` (JSON), `updated_at`, sécurité RLS activée, aucun accès public.
  - Une ligne = une entrée ou une sortie : `kind` (in/out), `category`, `amount_ar`, `date`, `note`, `client_name?`, `mission_id?`, `created_by`.
  - Migration SQL écrite dans le dépôt (`supabase/migrations/…`) et notée dans `AI_STUDIO.md`.
  - ~~Ajouter `df_cash` à la liste de `df_take_backup()`~~ : **inutile**, la fonction prend toutes les tables `df_*` (sauf `df_backups`, `df_presence`, `df_restore`, `df_errors`).
  - Procédure de retour en arrière écrite.
  - **Fait :** sauvegarde n° 4 (16 tables) juste avant ; table créée (migration `supabase/migrations/20261019_create_df_cash.sql`) : RLS activée, aucune règle, **aucun droit pour `anon` ni `authenticated`** (comme `df_news`), propriétaire `postgres`, 0 ligne. Sauvegarde n° 5 : **17 tables, `df_cash` incluse**. À savoir : la sauvegarde de nuit a bien tourné toute seule le 2026-10-18 à 23 h UTC (n° 3). La remise à zéro (`df-restore`) efface une liste de tables écrite à la main qui ne contient pas `df_cash` : **les finances ne sont pas effacées** (décision n° 5).

- [x] **S2.3 — Serveur `df-api`** (M) — *fait le 2026-10-19 (commit « stats S2.3 et S2.4 »)*
  - Ajouter la collection `cash` à `COLS` côté serveur et côté client (`src/db/store.ts`), aux routes `state` et `sync`.
  - Redéployer `df-api` avec le petit fichier d'import au commit exact (voir `AI_STUDIO.md`) ; retour en arrière = commit précédent.

- [x] **S2.4 — Sécurité : admin seulement** (M) — **obligatoire** — *fait le 2026-10-19 (même commit que S2.3)*
  - `state` ne doit **jamais** envoyer `cash` à un employé ; `sync` doit **refuser** toute écriture d'un employé sur `cash`.
  - Test : avec un compte employé, la collection n'apparaît nulle part (réponse du serveur et écran).

  - **S2.3 fait :** `cash: "df_cash"` ajouté à la liste des collections de `df-api` (donc lue par `state` et écrite par `sync` comme les autres) ; côté site : `src/types/index.ts` (`CashEntry`), `src/db/store.ts` (`COLS`, `getCash()`, tri par date). Le site tolère un serveur qui n'envoie pas encore `cash` (ordre de mise en ligne sans risque). Chaque ligne envoyée par l'admin passe par `cleanCash` (type in/out, montant > 0 et raisonnable, date réelle, catégorie obligatoire, textes coupés, créateur et date de création posés par le serveur, champs inconnus jetés).
  - **S2.4 fait :** (1) lecture : `state` n'envoie **jamais** `cash` à un employé (liste `ADMIN_ONLY_READ`) ; (2) écriture : `sync` refuse **toute** modification ou suppression de `cash` par un employé, **avant** toute autre règle (liste `ADMIN_ONLY_WRITE`, qui ne contient pas le journal de sécurité car un employé y écrit ses propres lignes) ; (3) aucune autre route du serveur ne touche `df_cash`. Contrôle automatique : `npm run check:cash` (**28/28**) teste la vraie fonction `cleanCash` du serveur et lit le code ; **il échoue si on retire une protection** (essayé).
  - **Pas encore fait : l'essai réel avec un compte employé** (le réseau de Claude n'atteint pas Supabase). À faire par BTK quand l'écran Finances existera (S2.5) : se connecter en employé et vérifier qu'aucun chiffre d'argent n'apparaît.


- [x] **S2.5 — Écran « Finances »** (L) — *fait le 2026-10-19 (commit « stats S2.5 »), non testé à l'écran*
  - Onglet dans la page Statistiques (ou page à part).
  - Boutons « + Paiement reçu d'un client » et « + Dépense » : montant, date, catégorie, note, client.
  - Liste filtrable (période, catégorie, entrée/sortie), modifier et supprimer avec confirmation.
  - Salaires payés et avances apparaissent **automatiquement** comme dépenses (calculés, jamais saisis deux fois).

  - **Fait :** onglet **Finances** dans la page Statistiques (deux onglets : Statistiques / Finances ; la période du haut sert aux deux). `src/views/admin/FinanceTab.tsx` (nouveau) : 4 cartes (argent reçu, dépenses, salaires calculés, solde), boutons « Paiement reçu » et « Dépense » (fenêtre : montant, date, catégorie, client pour un paiement, note), liste filtrable (Tout / Entrées / Sorties + catégorie, 20 lignes puis « Voir tout »), modifier, supprimer avec confirmation sur la ligne. Règles dans `src/utils/finance.ts` (mêmes règles que `cleanCash` du serveur) ; `db.addCash`, `db.updateCash`, `db.deleteCash` dans `store.ts` (admin seulement ; les lignes partent avec la synchro habituelle et le serveur les revérifie). Catégories de départ : entrées « Paiement client », « Autre entrée » ; sorties « Achats », « Loyer », « Internet », « Matériel », « Transport », « Autres » ; on peut en écrire une autre (elle est ensuite proposée). FR et EN.
  - **Choix à valider par BTK (écart avec le « Principe » ci-dessus) :** la ligne « Salaires » est **calculée** (missions validées de la période, comme la carte « Salaires gagnés ») et **non modifiable**. Les **avances ne sont pas ajoutées** aux dépenses : ce sont des salaires versés d'avance, les ajouter les compterait deux fois. Elles sont seulement rappelées sous les cartes (« Avances versées : … déjà comprises dans les salaires »). Si BTK préfère « salaires payés (fiches de paie) + avances », il faut lire les fiches de paie du mois (appel serveur) : plus lourd, à décider.
  - **Contrôles :** `npm run check:finance` (**27/27** : montants, dates, catégories, filtres, totaux, solde ; le serveur accepte exactement ce que le site prépare) ; `npm run check:finance-page` (**28/28** : démo admin, ajout / modification / suppression, rendu FR et EN, opérateur refusé, 0 appel réseau) ; `check:cash` 28/28, `check:stats` 41/41, `check:page` 18/18, `check:charts` 22/22, `check:demo-stats`, `check:client-price` 29/29, `tsc` et `build` sans erreur.
  - **Pas vérifié :** le rendu sur un vrai téléphone (fenêtre d'ajout, clavier, mode clair), l'envoi réel au serveur et l'essai avec un compte employé (S2.4). La démo n'a pas encore de lignes d'argent inventées : c'est S2.7.
- [x] **S2.6 — Chiffres et graphiques financiers** (L) — *fait le 2026-10-19 (commit « stats S2.6 »), non testé à l'écran*
  - Cartes : argent entré, sorti, **bénéfice net**, **marge %**, **à encaisser**, trésorerie (argent disponible).
  - Graphiques : entrées vs sorties par jour/semaine/mois ; bénéfice cumulé ; dépenses par catégorie (anneau) ; facturé vs encaissé.
  - Chiffres « vraie entreprise » : **coût par mission**, **gain par mission**, **marge par type de mission**, **meilleur client**.

  - **Fait :** `src/utils/financeStats.ts` (calculs purs) et `src/views/admin/FinanceInsights.tsx` (affichage), placés en haut de l'onglet Finances. Cartes : bénéfice net, marge %, à encaisser, trésorerie, coût par mission, gain par mission, meilleur client. Graphiques : argent reçu (barres) et dépenses (traits) ; bénéfice cumulé (courbe `LineChart`, peut passer sous 0) ; facturé (barres) et reçu (traits) ; dépenses par catégorie (anneau, salaires inclus) ; marge par type de mission (liste). Règles : facturé = prix client figé des missions validées ; à encaisser = facturé − reçu, jamais négatif ; trésorerie = tout l'argent reçu − toutes les dépenses − tous les salaires depuis le début ; marge d'un type = prix client − salaires (sans les autres dépenses). Les lignes d'argent n'ont pas d'heure : en vue « Jour » elles tombent sur la première barre.
  - **Contrôles :** `npm run check:finance-stats` (**26/26**, chiffres vérifiés à la main sur un cas), `check:finance-page` 28/28, `check:finance` 27/27, `check:cash`, `check:stats`, `check:page`, `check:charts`, `check:demo-stats`, `check:client-price`, `tsc` et `build` sans erreur.
  - **Pas vérifié :** rendu sur téléphone, mode clair. Tant que le prix client vaut 0, « à encaisser » et les marges restent à 0 (un message le dit).

- [x] **S2.7 — Démo et anglais** (S) — *fait le 2026-10-20 (commit « stats S2.7 à S2.9 »), non testé à l'écran*
  - Entrées et sorties inventées dans la démo ; ajout / modification / suppression marchent en local.
  - Textes anglais.
  - **Fait :** `buildDemoCash` dans `src/demo/demoData.ts` : environ 100 lignes inventées sur 2 ans, calculées à partir des missions validées de la démo (les mois passés, les clients ont payé environ 92 % du facturé ; ce mois-ci environ 70 %, il reste donc de l'argent « à encaisser »). Dépenses : Loyer, Internet, Achats, Transport, Matériel (tous les 4 mois) + une dépense aujourd'hui (la vue « Jour » n'est pas vide). 4 clients inventés (« meilleur client »). Chiffres de démo : bénéfice positif sur l'année, marge entre 6 et 31 % selon les mois. Générateur à part (graine propre) : **les autres données de la démo ne changent pas**. Les prix client de la démo vont dans `DEMO_CLIENT_PRICES` et sont maintenant au nom des **vrais types de la démo** (« CONTRÔLE QUALITÉ » 9 000, « WEB » 12 000, sinon 8 000) : avant, les noms de types ne correspondaient pas et tout valait 8 000. Un opérateur en démo ne voit **aucune** ligne d'argent. La démo annonce 17 tables dans Sauvegardes. Ajout / modification / suppression marchent en local (testé).
  - **Anglais :** les écrans Finances prennent leur texte anglais directement dans le code (`t(fr, en)`), donc rien à ajouter au dictionnaire pour eux ; `check:finance-page` vérifie le rendu FR et EN. Une phrase nouvelle (écran de remise à zéro) est ajoutée à `enDict.json`.

- [x] **S2.8 — Remise à zéro et sauvegarde** (S) — *fait le 2026-10-20, non testé à l'écran*
  - Selon la décision n° 5. Vérifier que la page Sauvegardes contient bien `df_cash` (nombre de tables passe de 16 à 17).
  - **Fait :** (1) `df-restore` ne touche pas à `df_cash` (vérifié dans le code, contrôlé par `check:phase2`) : **la remise à zéro garde les finances**. (2) L'écran « Restauration du site » le dit en toutes lettres (nouvelle phrase, FR et EN), avec un avertissement : **les salaires calculés repartent à 0**, car la remise à zéro efface les missions faites. Conséquence à connaître : après une remise à zéro, les paiements reçus restent mais les salaires de l'ancienne période ne sont plus comptés (les bénéfices passés seraient trop beaux) ; garder l'export Excel avant de remettre à zéro. (3) La sauvegarde Excel a une nouvelle feuille « Finances » (date, sens, catégorie, montant, client, note ; vide pour un opérateur). (4) **Vérifié sur la vraie base `nprojet` (lecture seule, 2026-10-20)** : `df_take_backup()` prend toutes les tables `df_*` sauf `df_backups`, `df_presence`, `df_restore`, `df_errors` ; la sauvegarde n° 4 (avant la création de `df_cash`) a **16** tables, la n° 5 en a **17** ; `df_cash` existe et contient 0 ligne (aucun vrai chiffre saisi).

- [x] **S2.9 — Contrôle de la phase 2** (S) — *fait le 2026-10-20 ; `df-api` v8 déployé ; **reste : essai réel (admin puis employé), voir ci-dessous***
  - `tsc`, `build`, script de contrôle (bénéfice = encaissé − dépenses sur 10 cas), test employé (S2.4), note dans `TODO.md`.
  - **Fait :** nouveau contrôle `npm run check:phase2` (`scripts/check-phase2.ts`, **65/65**) : bénéfice = encaissé − dépenses sur **10 périodes** de la démo (7 mois passés, mois en cours, année, une semaine), barres et courbe cumulée = mêmes totaux, anneau des dépenses = total, « à encaisser » jamais négatif, marge cohérente, trésorerie, démo cohérente (aucune date dans le futur, chaque ligne passe les règles du serveur), ajout / modification / suppression en démo, 17 tables, opérateur sans accès, remise à zéro qui garde `df_cash`, migration avec RLS. `tsc` et `build` sans erreur ; `check:finance-stats` 26/26, `check:finance` 27/27, `check:finance-page` 29/29, `check:cash` 28/28, `check:charts` 22/22, `check:stats` 41/41, `check:page` 18/18, `check:client-price` 29/29.
  - **`df-api` v8 déployé le 2026-10-20 (accord de BTK : « Go »).** Avant : la version en ligne était la v7 (commit `5466b76`), **sans aucun code `cash`** (la « v8 » citée dans `TODO.md` n'avait jamais été déployée). Maintenant : v8 = commit `eb7129a7648f71449956d0f2392f7fc6595f4ccd` (fonction d'appel de 1 ligne qui charge `supabase/functions/df-api/index.ts` de ce commit ; fichier téléchargé et comparé au dépôt avant : identique), `verify_jwt` désactivé comme la v7, projet `nprojet`. **Retour en arrière :** redéployer la même ligne avec le commit `5466b76` (v7). Les finances sont donc enregistrées par le serveur et réservées à l'admin (lecture et écriture). **La v8 n'a pas encore reçu de requête** (logs lus juste après : seulement du trafic v7) : à vérifier dès la première ouverture du site (voir ci-dessous).
  - **Reste à faire par BTK :** (1) ouvrir le site en admin, aller dans Statistiques > Finances, ajouter un paiement reçu et une dépense, recharger la page : les lignes doivent rester ; (2) se connecter avec un compte employé : aucune ligne `cash` ni prix client visible. Si quelque chose casse, dire « retour en arrière » : on remet la v7.
  - **Pas vérifié :** rendu sur un vrai téléphone ; première requête réelle sur la v8 ; essai avec un compte employé sur le vrai serveur. **Note :** `check:demo-stats` échoue entre 00 h et 03 h à Madagascar si la machine est en UTC (6 contrôles « day », la démo « aujourd'hui » et les statistiques ne coupent pas le jour à la même heure) ; ce n'est pas lié à la phase 2 et existait déjà.

---

## PHASE 3 — Stock et produits — taille L (dépend de la décision n° 4)

- [x] **S3.1 — Nouvelles tables** (M) — **accord de BTK + sauvegarde avant** — *fait le 2026-10-20 : accord (« Phase 3 (stock), puis 4 et 5 » puis « Go »), sauvegarde n° 6 avant, migration appliquée sur `nprojet`, `df-api` v9 déployé*
  - `df_products` : nom, catégorie, unité, prix d'achat, prix de vente, **seuil d'alerte**.
  - `df_stock_moves` : produit, type (entrée / sortie / ajustement), quantité, date, note.
  - Ajouter les deux à `df_take_backup()`, RLS activée, admin seulement (comme S2.4).
  - **Fait :** migration écrite : `supabase/migrations/20261020_create_df_stock.sql` (même modèle que `df_cash` : `id`, `data jsonb`, `updated_at`, RLS activée, aucun accès pour `anon` / `authenticated`, index). Serveur (`df-api`, bloc `BEGIN STOCK`) : collections `products` et `stock`, **lecture et écriture réservées à l'admin**, `cleanProduct` et `cleanStockMove` (le serveur revérifie tout), un mouvement d'un produit inexistant est refusé, supprimer un produit supprime ses mouvements. `df_take_backup()` prend déjà toutes les tables `df_*` : rien à ajouter, **à vérifier après la création (19 tables attendues)**. `df-restore` ne touche pas au stock.
  - **Fait en ligne le 2026-10-20 :** (1) migration appliquée sur `nprojet` ; (2) contrôle : `df_products`, `df_stock_moves` et `df_cash` ont la RLS activée et **0 droit pour `anon` / `authenticated`** ; sauvegarde n° 8 prise : **19 tables** (la n° 7, de nuit, en avait 17) ; (3) **`df-api` v9 déployé = commit `6c1fe78b8b8eab0a55cbab37abfea41ebc68fbc2`** (fichier GitHub comparé au dépôt : identique ; `verify_jwt` désactivé comme avant). Retour en arrière : `df-api` → redéployer le commit `eb7129a7648f71449956d0f2392f7fc6595f4ccd` (v8) ; tables (vides) : `drop table public.df_stock_moves; drop table public.df_products;`. **La v9 n'a pas encore reçu de requête** (logs lus juste après) : essai réel à faire (voir ci-dessous).
  - **Reste à faire par BTK :** ouvrir Statistiques > Stock en admin, ajouter un produit et une entrée, recharger la page : ils doivent rester ; compte employé : aucun produit visible.

- [x] **S3.2 — Écran « Stock »** (L) — *fait le 2026-10-20 (code et contrôles), non testé à l'écran ni avec le vrai serveur*
  - Liste des produits avec quantité en stock, valeur du stock, voyant rouge sous le seuil.
  - « + Entrée » et « + Sortie » (la quantité se calcule à partir des mouvements, jamais saisie à la main).
  - **Fait :** 3e onglet « Stock » dans Statistiques (`src/views/admin/StockTab.tsx`, règles pures dans `src/utils/stock.ts`). Par produit : voyant (rouge à « seuil ou moins »), quantité, valeur (quantité × prix d'achat), boutons Entrée / Sortie / Historique / Modifier / Supprimer (confirmation). Une fenêtre unique pour les mouvements avec 3 types (entrée, sortie, **ajustement + ou −** pour corriger après un comptage). Règles : une sortie plus grande que le stock est refusée ; un ajustement ou une suppression de mouvement qui rendrait le stock négatif est refusé ; supprimer un produit demande confirmation et supprime ses mouvements. Boutons de 44 px minimum. Prix d'achat, de vente et seuil acceptent les espaces et la virgule.

- [x] **S3.3 — Lien avec les finances** (S) — *fait le 2026-10-20, non testé à l'écran*
  - Option : un achat de stock crée automatiquement une dépense « Achats » (avec confirmation).
  - **Fait :** dans une **entrée**, case « Créer aussi la dépense « Achats » » (décochée par défaut). Elle affiche le montant (quantité × prix payé par unité) et la date avant d'enregistrer ; sans prix payé, la dépense est refusée et rien n'est créé. La dépense et l'entrée gardent un lien (`cash_id`). Supprimer le produit ou le mouvement **ne supprime pas** la dépense (elle se supprime dans Finances).

- [x] **S3.4 — Graphiques de stock** (M) — *fait le 2026-10-20, non testé à l'écran*
  - Valeur du stock dans le temps, produits les plus utilisés, produits bientôt en rupture.
  - **Fait :** courbe de la valeur à la fin de chacun des 12 derniers mois (prix d'achat **actuels** appliqués aux quantités de l'époque) ; barres des 5 produits les plus sortis sur la période choisie en haut (les ajustements ne comptent pas comme usage) ; liste « Bientôt en rupture » = produits vides dans moins de 14 jours selon les sorties des 30 derniers jours (sans sortie récente, on ne devine pas).

- [x] **S3.5 — Démo, anglais, contrôle** (S) — *fait le 2026-10-20*
  - **Fait :** démo : 6 produits et environ 380 mouvements inventés sur 12 mois (`buildDemoStock`, graine propre : les autres données de la démo ne changent pas), aucun produit sous zéro, 3 produits sous le seuil, une valeur de stock qui varie ; un opérateur en démo ne voit rien ; la démo annonce 19 tables. Anglais : `t(fr, en)` dans tout l'écran. Sauvegarde Excel : feuilles « Produits » et « Mouvements de stock ». L'écran de remise à zéro dit maintenant « finances **et stock** gardés » (FR/EN). Contrôle : `npm run check:stock` (**92/92** : règles du serveur extraites du vrai fichier, calculs, store, démo, FR/EN) ; `check:phase2` adapté (19 tables). `tsc`, `build` et tous les anciens contrôles OK.

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
