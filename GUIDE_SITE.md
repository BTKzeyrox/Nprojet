# GUIDE DU SITE « Gestion Pro » (Nprojet)

> **But de ce fichier : expliquer le site entièrement, sans avoir à lire le code.** Une IA (ou une personne) qui reprend le projet lit ce guide, puis `LIRE_EN_PREMIER.md` pour les règles de travail avec BTK.
> **Date de l'état décrit : 2026-10-24.** Les parties marquées `AUTO` sont générées depuis le code par `npm run guide` : ne les modifie pas à la main. `npm run check:guide` échoue si elles sont périmées ou si le texte écrit à la main cite un fichier ou une commande qui n'existe plus.
> **Règle** : toute étape qui change une page, une règle, une table ou un piège met ce guide à jour **dans le même commit** (lancer `npm run guide`, puis compléter les sections écrites à la main).

---

## 1. Le site en deux minutes

**Gestion Pro** est un site (téléphone d'abord, aussi ordinateur) pour une entreprise qui **paie son équipe à la mission** et doit **valider le travail sur preuves**, puis tenir ses clients, factures, argent, stock et achats.

- **Un site = une entreprise.** Il n'y a pas de gestion de plusieurs entreprises sur le même site.
- **Pour qui** : une équipe de 5 à 50 personnes (saisie de données, contrôle, administratif, support, tâches web). Le responsable gère tout ; les opérateurs font les missions.
- **Langues** : français et anglais. Le français est la source. L'anglais vient soit de `t(fr, en)` écrit dans la page (pages récentes, marquées `data-notranslate` pour que la traduction automatique n'y touche pas), soit de la traduction automatique `src/utils/enTranslate.ts` qui s'appuie sur le dictionnaire `src/utils/enDict.json`. Le chinois n'existe plus dans le code (`HANDOVER.md` en parle encore : cette partie est périmée).
- **Thème** : clair et sombre, tailles de texte réglables sur l'appareil.
- **Coût** : tout tourne sur des offres gratuites (Vercel pour le site, Supabase pour la base et le serveur, Cloudinary pour les photos). Voir §9 pour ce qui change en usage commercial.
- **Mode démo** : le site s'ouvre avec des chiffres inventés, sans aucun appel au serveur. La démo cache ce qui est simulé (IA externe, notifications téléphone, mot de passe, sauvegardes).

Ce qui est fait : les modules **M0 à M12** du plan (`TODO_MODULES.md`) plus **M8.1** (page Direction). Ce qui reste : essais de BTK (M8.2, M12.6), vitesse (M8.3), nettoyage (M8.4) et le module **M15** (en cours : **M15.1 missions récurrentes**, **M15.2 planning** et **M15.3 objectifs** et **M15.4 budget prévu contre réel** faites, **M15.5 rapport automatique** commencé : règles seulement), les modules proposés M14, M16 et M17 et le mode hors ligne M13 (§10).

---

## 2. Les rôles : qui voit quoi

Quatre rôles (`src/utils/roles.ts`, copie exacte dans le serveur, comparée par `npm run check:roles`). Un seul **Responsable** (identifiant `user-admin-1`, à ne jamais changer) ; il crée les autres comptes.

| Rôle | Ce qu'il peut faire | Ce qu'il ne voit jamais |
|---|---|---|
| **Responsable** (`admin`) | Tout : missions, validations, paie, clients, factures, argent, stock, achats, RH, réglages, sauvegardes, audit, Santé du site, Direction. | — |
| **Comptable** (`accountant`) | Factures, avoirs, devis, clients, achats, messagerie, réglages personnels. Il lit et écrit l'argent (collections d'argent). | Paie, comptes des salariés, présence, réglages du site, statistiques, dépenses (décision en attente, §10). |
| **Chef d'équipe** (`team_lead`) | Valide les débuts et fins de mission **de son équipe seulement**. Le serveur fait le calcul (valider fige la paie et le prix client, qu'il ne doit pas voir). **Plafond (M15.6) :** si le responsable règle un plafond (Réglages > Missions), une mission dont le prix client est au-dessus ne peut plus être décidée par le Chef d'équipe (début, fin ni refus) : le responsable décide. | Paie, réglages, argent, prix clients, autres équipes. |
| **Opérateur** (`employee`) | Prend et fait des missions, envoie les preuves, voit sa paie, ses congés, son dossier, ses tableaux, la messagerie. | Argent, clients, factures, prix clients, fiches des autres, points à améliorer de ses évaluations. |

**Comment c'est appliqué** : le navigateur filtre l'affichage, mais **le vrai contrôle est dans le serveur** (`df-api`). Il ne renvoie jamais à un opérateur les collections d'argent ou le journal de sécurité (`READ_ADMIN_COLS`), retire le téléphone et le CV des autres personnes (`stripUser`), filtre les congés et évaluations par salarié, et refuse toute écriture non permise. Une règle de sécurité sans test qui échoue si on la retire est considérée comme absente.

---

## 3. Les pages, une par une

Chaque fiche ci-dessous est la même que celle que l'assistant du site utilise (`src/utils/siteKnowledge.ts`). **Une formule qui change dans le code = cette fiche change.**

<!-- AUTO:pages -->
### Actualités  `feed`
- **Qui** : responsable et opérateur
- **À quoi ça sert** : Les annonces de l'équipe : ce qu'il faut savoir avant de travailler.
- **Comment l'utiliser** : 1. Lire les publications, les plus récentes en premier. 2. Un employé peut proposer une publication. 3. L'admin accepte ou refuse, avec un motif.
- **Règles** :
  - Une publication d'employé n'est visible de tous qu'après acceptation par l'admin.
  - Les derniers commentaires se voient sous la publication ; « Répondre » répond à un commentaire (comme Facebook) ; toucher un nom ouvre son profil, avec « Message ».
- **Dans le code** : `src/views/FeedView.tsx`

### Tableau de bord  `dashboard`
- **Qui** : responsable
- **À quoi ça sert** : Le point d'entrée de l'admin : missions du moment, alertes d'argent et de stock, objectifs du mois.
- **Comment l'utiliser** : 1. Regarder les alertes en haut et cliquer pour ouvrir la bonne page. 2. Suivre les barres d'objectifs du mois. 3. Gérer les missions du tableau (créer, modifier, relier à un client).
- **Règles** :
  - Les objectifs d'argent ne sont jamais envoyés aux employés.
  - Les objectifs se règlent dans Réglages (missions, bénéfice, plafond de dépenses).
- **Chiffres et formules** :
  - Objectif du mois : Chiffre du mois (du 1er au dernier jour) comparé à l'objectif réglé : missions validées, bénéfice, dépenses.
- **Réglages liés** (Réglages > Conditions) : `options.mission_requires_client`
- **Dans le code** : `src/views/admin/AdminDashboard.tsx`

### Validations  `validations`
- **Qui** : responsable
- **À quoi ça sert** : Tout ce que l'admin doit accepter ou refuser : débuts et fins de mission, avances, inscriptions, réinitialisations de mot de passe, changements de profil.
- **Comment l'utiliser** : 1. Ouvrir une demande et regarder les preuves. 2. Accepter, ou refuser en donnant un motif. 3. La pastille du menu tombe à zéro quand tout est traité.
- **Règles** :
  - Un refus demande un motif si le réglage « motif de refus obligatoire » est activé.
  - Le prix de la mission est figé au moment de la validation.
  - La Santé du site signale une mission en attente depuis plus de 24 h (réglable).
- **Chiffres et formules** :
  - Pastille Validations : Débuts à valider + fins à valider + avances en attente + inscriptions + réinitialisations + demandes de profil.
- **Réglages liés** (Réglages > Conditions) : `missions.validation_hours`, `missions.refusal_reason_required`
- **Dans le code** : `src/views/admin/AdminDashboard.tsx`, src/views/TeamValidations.tsx (Chef d'équipe)

### Historique  `history`
- **Qui** : responsable
- **À quoi ça sert** : Toutes les missions passées, avec de quoi les retrouver.
- **Comment l'utiliser** : 1. Filtrer la liste pour retrouver une mission. 2. Afficher plus de lignes (50 de plus à chaque fois). 3. Ouvrir une mission pour voir son détail.
- **Règles** :
  - L'histoire d'un client reste figée quand une mission change de client.
- **Dans le code** : `src/views/admin/HistoryPage.tsx`

### Clients  `clients`
- **Qui** : responsable
- **À quoi ça sert** : Les fiches clients, leur statut calculé, leur tarif et leur chiffre d'affaires.
- **Comment l'utiliser** : 1. Créer une fiche (nom, contact, tarif facultatif). 2. Rattacher les anciennes missions avec l'outil « Missions à rattacher ». 3. Archiver un client plutôt que le supprimer s'il a des missions.
- **Règles** :
  - Le statut n'est jamais saisi : il se calcule avec les missions validées.
  - Un client qui a des missions n'est jamais supprimé, seulement archivé.
  - Les clients sont visibles de l'admin seulement.
  - Import Excel ou CSV : aperçu ligne par ligne, rien n'est écrit avant « Importer » ; les noms déjà présents sont ignorés.
- **Chiffres et formules** :
  - Prospect : Aucune mission validée.
  - Nouveau : Première mission il y a moins de N jours (60 par défaut).
  - Régulier : Au moins N missions validées sur les M derniers mois (3 sur 6 par défaut).
  - Stratégique : Parmi les P % premiers du chiffre d'affaires des M derniers mois (20 % sur 12 par défaut), avec au moins N missions (5 par défaut).
  - Inactif : Aucune mission depuis N jours ou plus (90 par défaut).
  - Prix d'une mission : 1) prix de la mission, 2) prix du client pour ce type, 3) prix par défaut du client, 4) prix du type (Réglages), 5) prix par défaut (Réglages). Un prix à 0 est un vrai prix (mission offerte).
- **Réglages liés** (Réglages > Conditions) : `clients.new_days`, `clients.regular_missions`, `clients.regular_months`, `clients.strategic_top_pct`, `clients.strategic_months`, `clients.strategic_min_missions`, `clients.inactive_days`, `options.mission_requires_client`
- **Dans le code** : `src/views/admin/ClientsPage.tsx`

### Facturation  `invoices`
- **Qui** : responsable
- **À quoi ça sert** : Faire les factures des clients, enregistrer les paiements et annuler une facture par un avoir.
- **Comment l'utiliser** : 1. Nouvelle facture : choisir le client, cocher ses missions validées, enregistrer le brouillon. 2. Émettre : le numéro est attribué par le serveur et devient définitif. 3. Enregistrer chaque paiement reçu ; annuler par un avoir si la facture est fausse.
- **Règles** :
  - Devis (si « Devis activés » est coché dans Conditions) : Brouillon, Envoyé, Accepté ou Refusé ; un devis accepté devient une facture brouillon en un clic.
  - Un brouillon n'a pas de numéro ; une facture émise ne se modifie ni ne se supprime.
  - Un paiement ne dépasse jamais ce qui reste à payer.
  - Une mission ne peut être que dans une seule facture non annulée.
  - Relance : « Envoyer par WhatsApp » ou « par SMS » ouvre le message déjà écrit ; tu appuies sur « envoyer » (rien ne part tout seul).
- **Chiffres et formules** :
  - Total d'une ligne : Quantité × prix unitaire, arrondi à l'Ar.
  - TVA : Sous-total × taux ÷ 100, arrondie une seule fois à l'Ar ; 0 si la TVA est désactivée.
  - En retard : Échéance dépassée et reste à payer. Jamais pour un avoir.
- **Réglages liés** (Réglages > Conditions) : `billing.invoice_prefix`, `billing.receipt_prefix`, `billing.payment_days`, `tax.vat_enabled`, `tax.vat_rate`
- **Dans le code** : `src/views/admin/InvoicesView.tsx`, `src/views/admin/QuotesSection.tsx`

### Achats  `purchasing`
- **Qui** : responsable
- **À quoi ça sert** : Garder la liste de tes fournisseurs, faire des bons de commande, les recevoir dans le stock et compter ton stock.
- **Comment l'utiliser** : 1. Nouveau fournisseur : nom, contact, délai habituel de livraison. 2. Bon de commande : Brouillon, Commander, puis Recevoir (en une ou plusieurs fois). 3. Inventaire : écris ce que tu as compté, puis Ajuster.
- **Règles** :
  - Recevoir crée les entrées de stock et UNE dépense « Achats », après confirmation.
  - Un bon reçu ou annulé est définitif ; un bon déjà en partie reçu ne s'annule plus.
  - Un fournisseur qui a servi ne se supprime pas : on l'archive.
  - Le stock n'est jamais saisi à la main : l'inventaire crée des ajustements.
  - Budgets (dans Finances) : attention à 80 % du plafond du mois, dépassé au-dessus de 100 %.
- **Dans le code** : `src/views/admin/PurchasingPage.tsx`, `src/views/admin/SuppliersSection.tsx`, `src/views/admin/PurchaseOrdersSection.tsx`, `src/views/admin/InventorySection.tsx`, `src/views/admin/BudgetsCard.tsx`

### Performance  `performance`
- **Qui** : responsable
- **À quoi ça sert** : Comment chaque salarié travaille : missions faites, refusées, délais, puis un score sur 100 et des badges calculés.
- **Comment l'utiliser** : 1. Onglet Tableau : choisir la période (7 jours, 30 jours, tout) et exporter en Excel ou en CSV. 2. Onglet Scores et badges : le classement des 30 derniers jours ; toucher un salarié ouvre sa fiche. 3. Lire le « pourquoi » de chaque score et de chaque badge avant de juger.
- **Règles** :
  - Ce sont des indicateurs, pas des sanctions : le contexte reste à l'admin.
  - Rien n'est saisi à la main : scores et badges sont calculés, aucun badge n'est donné par faveur.
  - Sous 10 missions jugées sur 30 jours, aucun score n'est affiché ; le badge Qualité demande 20 missions.
  - Un salarié ne voit que son propre score et ses propres badges, jamais le classement ni les points d'attention (sauf choix contraire dans Conditions).
- **Chiffres et formules** :
  - Taux d'acceptation : Missions validées ÷ (validées + refusées), en %. Vide s'il n'y a aucune mission jugée.
  - Délai moyen : Moyenne des durées des missions (début à fin, passage de minuit compris).
  - Score de performance : Sur 30 jours : qualité 40 % (missions validées ÷ jugées), volume 25 % (missions ÷ moyenne de l'équipe), ponctualité 20 % (jours sans retard), régularité 15 % (jours actifs ÷ jours attendus). Une partie impossible à calculer est retirée et les autres poids sont recalculés à 100 %.
  - Badges : Qualité, Ponctualité, Régularité, Rendement, Polyvalence (niveaux Bronze, Argent, Or) et Recrue prometteuse : chacun a un seuil, et la fiche dit pourquoi il est obtenu et ce qui manque pour le niveau suivant.
  - Employé du mois : Meilleur score du mois civil, à partir de 5 salariés actifs et avec assez de missions jugées ; ex æquo : tous sont cités.
- **Réglages liés** (Réglages > Conditions) : `options.badges_enabled`, `options.employee_sees_badges`, `options.employee_sees_attention`, `leave.late_limit_time`, `leave.work_days_per_week`
- **Dans le code** : `src/views/admin/PerformancePage.tsx`, `src/views/admin/PerformanceScores.tsx`

### Ma performance  `my-performance`
- **Qui** : opérateur
- **À quoi ça sert** : Ton score sur 100 et tes badges, avec le pourquoi, pour voir où tu en es.
- **Comment l'utiliser** : 1. Lire ton score sur 100 et la période qu'il couvre. 2. Regarder tes badges et ce qui manque pour le niveau suivant. 3. Comparer avec les périodes d'avant dans « Tendance ».
- **Règles** :
  - Tu ne vois que ton score et tes badges : jamais ceux des autres, jamais de classement.
  - Tout est calculé sur tes missions, rien n'est donné à la main.
  - Sous 10 missions jugées sur 30 jours, aucun score n'est affiché.
- **Chiffres et formules** :
  - Score de performance : Sur 30 jours : qualité 40 %, volume 25 %, ponctualité 20 %, régularité 15 %. Une partie impossible à calculer est retirée et les autres poids sont recalculés à 100 %.
- **Réglages liés** (Réglages > Conditions) : `options.badges_enabled`, `options.employee_sees_badges`, `options.employee_sees_attention`
- **Dans le code** : `src/components/MyPerformance.tsx`

### Mes tableaux  `sheets`
- **Qui** : responsable et opérateur
- **À quoi ça sert** : Entrer et suivre tes données comme dans Excel, puis les télécharger en Excel, Word ou PDF.
- **Comment l'utiliser** : 1. Choisir un modèle (vide, saisie de fiches, suivi de tâches) puis ajouter lignes et colonnes. 2. Écrire une formule avec « = », par exemple =SOMME(B1:B10). 3. Cliquer sur Télécharger pour Excel, Word ou PDF.
- **Règles** :
  - Ce que tu supprimes va à la corbeille 30 jours : tu peux le restaurer.
  - Limites : 20 tableaux, 200 colonnes, 5 000 lignes.
  - Une formule en erreur montre #DIV/0!, #REF! ou #NAME? sans rien casser.
  - Le responsable lit les tableaux de l'équipe sans pouvoir les modifier.
  - Importer un fichier Excel ou CSV crée un nouveau tableau (aperçu avant création) : colonnes nombre et date devinées, 5 000 lignes au plus.
- **Chiffres et formules** :
  - Formules : SOMME, MOYENNE, MIN, MAX, NB, SI, ET, OU, ARRONDI, RECHERCHEV, SOMME.SI, NB.SI, AUJOURDHUI, JOURS, CONCAT, GAUCHE, DROITE et autres, en français ou en anglais.
- **Dans le code** : `src/components/MySheets.tsx`

### Statistiques  `stats`
- **Qui** : responsable
- **À quoi ça sert** : Les chiffres de l'entreprise : missions, finances, stock et rapport du mois.
- **Comment l'utiliser** : 1. Choisir l'onglet (Statistiques, Finances, Stock, Rapport) puis la période. 2. Saisir les entrées et dépenses dans l'onglet Finances. 3. Saisir les entrées, sorties et ajustements dans l'onglet Stock.
- **Règles** :
  - Finances et Stock sont réservés à l'admin : le serveur refuse tout autre accès.
  - La quantité en stock n'est jamais saisie : elle se calcule avec les mouvements.
  - Les avances sont déjà dans les salaires : elles ne sont pas comptées deux fois.
  - Stock : import Excel ou CSV des produits (nom, prix, seuil) ; les quantités ne s'importent pas, on les ajoute par des entrées.
  - Prévu contre réel (Finances, 6 mois) : dépenses prévues = total des budgets par catégorie ; revenus et paie prévus = deux montants mensuels du responsable ; le réel est calculé, jamais saisi.
  - Rapport automatique : arrêté, chaque semaine ou chaque mois, à une heure de Madagascar ; le serveur crée la fiche de la période finie et prévient. Aucun e-mail.
  - La copie figée du rapport est posée une seule fois, à la première ouverture. Une période manquée (serveur arrêté plus de 2 h) n'est pas rattrapée.
- **Chiffres et formules** :
  - Facturé : Missions validées × prix client.
  - Encaissé : Somme des paiements reçus.
  - À encaisser : Facturé − encaissé (jamais négatif).
  - Dépenses : Dépenses saisies + salaires (les avances sont déjà dans les salaires).
  - Bénéfice : Encaissé − dépenses.
  - Marge : Bénéfice ÷ encaissé, en %. Vide si rien n'est encaissé.
  - Valeur du stock : Pour chaque produit : quantité (jamais négative) × prix d'achat ; puis la somme.
  - Quantité en stock : Entrées − sorties ± ajustements.
  - Écart prévu contre réel : Revenus : réel − prévu (positif = mieux que prévu). Dépenses et paie : prévu − réel (négatif = plafond dépassé). « À surveiller » à 80 % du plafond ; « rien de prévu » quand le prévu vaut 0.
- **Dans le code** : `src/views/admin/StatsPage.tsx`, `src/views/admin/FinanceTab.tsx`, `src/views/admin/StockTab.tsx`, `src/views/admin/ReportTab.tsx`

### Missions  `grid`
- **Qui** : opérateur
- **À quoi ça sert** : La liste des missions disponibles pour l'opérateur.
- **Comment l'utiliser** : 1. Choisir une mission libre. 2. Le réserver et commencer la mission à l'heure. 3. Envoyer les preuves demandées à la fin.
- **Règles** :
  - Une mission « sans compte » est grisée : elle n'est pas réservable.
  - Un employé ne voit jamais les prix clients ni les fiches clients.
- **Dans le code** : `src/views/employee/EmployeeDashboard.tsx`, `src/components/PostsGrid20.tsx`

### Mission en cours / Suivi des sessions  `active-post`
- **Qui** : responsable et opérateur
- **À quoi ça sert** : Pour l'employé : sa mission active. Pour l'admin : toutes les sessions en cours.
- **Comment l'utiliser** : 1. Démarrer la mission avec la preuve de début. 2. Travailler, puis envoyer la preuve de fin. 3. L'admin valide ou refuse la session.
- **Règles** :
  - Début et fin passent par une validation de l'admin.
  - La Santé du site signale une mission en cours depuis plus de 12 h sans fin.
- **Dans le code** : `src/views/employee/EmployeeDashboard.tsx`, `src/views/admin/AdminDashboard.tsx`

### Employés  `employees`
- **Qui** : responsable
- **À quoi ça sert** : La gestion de l'équipe : profils, accès, état de chacun.
- **Comment l'utiliser** : 1. Ouvrir un profil pour voir ou modifier les informations. 2. Régler l'accès selon l'heure de la vacation (auto, toujours, bloqué). 3. Bloquer ou supprimer un profil avec confirmation.
- **Règles** :
  - Accès « auto » : la connexion n'est permise que pendant la vacation, avec une marge avant et après.
  - Supprimer un profil est définitif.
  - Import Excel ou CSV : tous les comptes sont des opérateurs ; un mot de passe provisoire est montré une seule fois à la fin (100 comptes au plus).
- **Dans le code** : `src/views/admin/EmployeesManagement.tsx`

### Mon profil  `profile`
- **Qui** : opérateur
- **À quoi ça sert** : Les informations de l'employé, qu'il peut demander à modifier.
- **Comment l'utiliser** : 1. Voir ses informations. 2. Demander une modification. 3. Attendre l'accord de l'admin.
- **Règles** :
  - Un changement de profil passe par une validation de l'admin.
- **Dans le code** : `src/views/employee/EmployeeDashboard.tsx`, `src/components/CVViewerModal.tsx`

### Messagerie  `chat`
- **Qui** : responsable et opérateur
- **À quoi ça sert** : Discussions entre personnes et groupes, comme une messagerie classique.
- **Comment l'utiliser** : 1. Choisir une discussion ou un groupe. 2. Écrire et joindre un fichier ou plusieurs photos (album : 4 cases, la 4e avec « +N »). 3. Modifier ou épingler ses propres messages.
- **Règles** :
  - On ne modifie que ses propres messages, même l'admin.
  - Supprimer pour tous : l'auteur ou l'admin ; le message disparaît sans trace.
  - Une seule réaction par personne et par message.
- **Dans le code** : `src/components/ChatView.tsx`, `src/components/AssistantChat.tsx`

### Calendrier  `calendar`
- **Qui** : responsable et opérateur
- **À quoi ça sert** : Les présences et les retards, jour par jour.
- **Comment l'utiliser** : 1. Choisir le mois et la personne. 2. Cliquer un jour pour voir les sessions. 3. Repérer les retards.
- **Règles** :
  - Le dimanche est un jour de repos.
  - Les heures sont celles de Madagascar (UTC+3).
- **Chiffres et formules** :
  - En retard : Début de la session après l'heure de début de la vacation + la tolérance (15 min par défaut) ; pile à la tolérance n'est pas un retard. Vacation de jour à 08:00, de nuit à 20:00 par défaut.
- **Réglages liés** (Réglages > Conditions) : `leave.late_limit_time`
- **Dans le code** : `src/views/CalendarView.tsx`

### Comptabilité  `accounting`
- **Qui** : responsable
- **À quoi ça sert** : Le journal des écritures (partie double), le grand livre, la balance, le résultat et le bilan. Les écritures viennent des factures, paiements, dépenses, paies et avances.
- **Comment l'utiliser** : 1. Appuie sur « Générer les écritures » : chaque pièce sans écriture en reçoit une, jamais de doublon. 2. Choisis la période, puis le Journal, le Grand livre, la Balance, le Résultat ou le Bilan. 3. Pour corriger : annule l'écriture (écriture inverse) puis saisis la bonne.
- **Règles** :
  - Une écriture a toujours autant de débit que de crédit ; une écriture enregistrée ne se modifie jamais.
  - Le numéro d'écriture (EC-2026-0001) est donné par le serveur, dans l'ordre des dates.
  - Le Comptable lit et saisit ; seul le responsable annule. Les écritures de paie ne montrent aucun nom.
  - Le plan comptable est un plan minimal de départ, à valider par un expert-comptable.
  - La TVA collectée vient des factures ; la TVA déductible vient des achats saisis à la main (modèle « Achat avec TVA »), car les dépenses n'ont pas de champ TVA.
  - Clôture : le responsable verrouille les mois finis (onglet Clôture) ; plus d'écriture à ces dates. Au 31 décembre, le résultat passe au compte 110.
  - Rapprochement : on charge le relevé (CSV ou Excel) ; le site montre ce qui correspond, ce qui manque aux livres et ce qui manque au relevé. Rien n'est écrit sans ton accord.
  - Export pour le comptable : Excel (journal, grand livre, balance) ou CSV, sur la période choisie ; montants en nombres entiers.
  - La Santé du site signale une écriture déséquilibrée, des mois finis pas encore clos et la TVA à déclarer : ce sont des rappels, jamais des blocages.
- **Chiffres et formules** :
  - Résultat : Produits (comptes 7) moins charges (comptes 6) de la période.
  - Balance : Pour chaque compte, total des débits, total des crédits et solde ; le total des débits égale celui des crédits.
  - TVA à payer : TVA collectée (compte 4457) moins TVA déductible (compte 4456) de la période ; négatif = crédit de TVA.
  - Bilan : Actif = soldes débiteurs ; passif = soldes créditeurs + résultat cumulé jusqu'à la date.
- **Dans le code** : `src/views/admin/AccountingPage.tsx`

### Direction  `direction`
- **Qui** : responsable
- **À quoi ça sert** : Une page de synthèse du mois en cours : argent, créances en retard, meilleurs clients et salariés, stock critique, alertes.
- **Comment l'utiliser** : 1. Lis les cartes de haut en bas : chacune résume une page du site. 2. Touche « Voir… » sous une carte pour ouvrir la page qui détaille. 3. Un chiffre qui te surprend : ouvre la page d'origine, c'est le même chiffre.
- **Règles** :
  - Aucun calcul nouveau : cette page reprend les chiffres des Finances, de la Facturation, des Relances, du Stock, de la Performance et de la Santé du site.
  - Le chiffre d'affaires est celui des factures émises ce mois ; sans facture, c'est la valeur des missions validées, marquée « estimé ».
  - Seuls le responsable et son accès complet voient cette page : le Comptable et les salariés ne la reçoivent pas.
- **Chiffres et formules** :
  - Bénéfice du mois : Argent encaissé moins dépenses saisies et salaires des missions validées (comme dans les Finances).
  - Créances en retard : Reste à payer des factures émises dont l'échéance est dépassée (comme dans les relances).
  - Stock critique : Produits sous leur seuil d'alerte ou à quantité négative (voyant rouge du Stock).
- **Dans le code** : `src/views/admin/DirectionPage.tsx`

### Ressources humaines / Mon dossier et congés  `hr`
- **Qui** : responsable et opérateur
- **À quoi ça sert** : Le responsable garde le dossier de chaque salarié et décide des congés ; le salarié lit son dossier et demande ses congés.
- **Comment l'utiliser** : 1. Salarié : onglet Congés (type, dates, envoi) ; onglet Évaluations pour lire sa fiche et marquer « lu ». 2. Responsable : accepter un congé, ou le refuser avec un motif ; un congé accepté apparaît au calendrier. 3. Responsable : onglets Dossiers et Évaluations (fiche d'entretien avec la photo des scores, à partager).
- **Règles** :
  - Le dossier est visible par le responsable et par le salarié concerné seulement.
  - Les jours de congé sont des jours ouvrés, calculés par le serveur ; le dimanche est un repos (le samedi aussi si 5 jours par semaine sont réglés).
  - Un congé payé ne dépasse pas le solde de l'année ; deux demandes ne se chevauchent pas ; un salarié annule sa demande tant que le congé n'a pas commencé.
  - Un congé accepté n'est plus compté comme jour manqué ni comme absence.
  - Les « points à améliorer » d'une évaluation sont une note privée : le salarié ne les reçoit jamais.
  - Une évaluation en brouillon est invisible du salarié ; une fois partagée, elle ne redevient pas un brouillon.
  - Planning : une vacation Jour, Nuit ou Repos par salarié et par jour ; seul le responsable écrit, le salarié lit seulement son propre planning.
  - Conflits du planning, signalés mais jamais refusés : congé accepté, Jour le lendemain d'une Nuit, trop de jours travaillés dans la semaine.
- **Chiffres et formules** :
  - Jours ouvrés d'une demande : Jours du début à la fin inclus, sans les jours de repos (dimanche ; samedi aussi à 5 jours par semaine).
  - Solde de congé payé : Jours par an (Conditions) moins les congés payés acceptés et en attente de l'année. Vide si le réglage est à 0.
  - Ancienneté : Mois pleins depuis la date d'embauche (le jour du mois compte).
- **Réglages liés** (Réglages > Conditions) : `leave.leave_days_per_year`, `leave.work_days_per_week`
- **Dans le code** : `src/views/hr/HrPage.tsx`, `src/views/hr/DossiersSection.tsx`, `src/views/hr/LeavesSection.tsx`, `src/views/hr/ReviewsSection.tsx`

### Paie / Ma paie  `advances`
- **Qui** : responsable et opérateur
- **À quoi ça sert** : La paie des salariés, les avances et les bulletins.
- **Comment l'utiliser** : 1. L'employé demande une avance ; l'admin accepte ou refuse. 2. À la clôture d'une période, les bulletins sont calculés. 3. L'admin marque chaque bulletin payé (mode et référence).
- **Règles** :
  - La paie est mensuelle ou par quinzaine (réglage).
  - Les avances sont plafonnées à un % de ce qui est gagné dans la période (0 = pas de plafond).
  - Les retenues et pénalités sont désactivées par défaut.
  - Un employé ne voit que sa propre paie.
- **Chiffres et formules** :
  - Brut : Somme des missions validées de la période (montant figé à la validation, sinon le prix par mission des Réglages).
  - Retenues appliquées : Les pénalités, jamais plus que brut + primes.
  - Avances remboursées : Le plus petit entre l'avance restant due et la part de remboursement (en %) du reste après retenues.
  - Net : Brut + primes − retenues appliquées − avances remboursées. Jamais négatif.
- **Réglages liés** (Réglages > Conditions) : `payroll.pay_day`, `payroll.pay_rounding`
- **Dans le code** : `src/components/PayrollAdmin.tsx`, `src/components/MyPayroll.tsx`, `src/views/admin/EmployeesManagement.tsx`

### Santé du site  `health`
- **Qui** : responsable
- **À quoi ça sert** : Le site contrôle chaque page tout seul et signale ce qui mérite un coup d'œil.
- **Comment l'utiliser** : 1. Regarder les alertes, les plus graves d'abord. 2. Cliquer « Ouvrir » pour aller à la bonne page. 3. « Vérifié » ou « Ignorer » cache l'alerte ; elle revient si ça s'aggrave.
- **Règles** :
  - Ce sont des signaux à vérifier, jamais des sanctions automatiques.
  - Calcul dans le navigateur de l'admin ; un employé ne voit rien.
  - Les marques « Ignorer / Vérifié » sont gardées sur l'appareil.
  - Aucune alerte n'est lancée sans un minimum de données.
- **Chiffres et formules** :
  - Gravité : Info (pour savoir), À voir (bientôt), Urgent (maintenant). La pastille compte À voir + Urgent.
  - Comparaison statistique : Chiffre actuel comparé à la médiane des périodes d'avant, avec au moins 3 périodes ; les deux chiffres sont toujours montrés.
- **Dans le code** : `src/views/admin/HealthPage.tsx`

### Journal des erreurs  `errors`
- **Qui** : responsable
- **À quoi ça sert** : Les plantages et erreurs du site, regroupés, avec les signalements des employés.
- **Comment l'utiliser** : 1. Ouvrir une erreur pour voir le détail. 2. Copier le rapport pour le développeur. 3. La marquer « résolue ».
- **Règles** :
  - Les erreurs identiques sont regroupées avec un compteur.
  - Une erreur résolue qui revient est rouverte.
- **Dans le code** : `src/views/admin/ErrorsLog.tsx`

### Réglages  `settings`
- **Qui** : responsable et opérateur
- **À quoi ça sert** : Les réglages du site : horaires, prix, objectifs, Conditions de l'entreprise, sauvegardes.
- **Comment l'utiliser** : 1. Choisir la section à régler. 2. Enregistrer pour appliquer le changement. 3. Faire une sauvegarde avant un gros changement.
- **Règles** :
  - Une sauvegarde de nuit est faite automatiquement et gardée environ 14 jours.
  - Les changements des Conditions sont notés dans un historique.
  - Le responsable peut cacher des pages du menu (Conditions > Pages du menu) ; rien n'est supprimé.
  - Un employé ne reçoit que le règlement et les règles de congés et de présence.
  - La visite guidée s'ouvre à la première connexion sur un appareil ; « Revoir la visite guidée » la relance.
  - Sécurité en deux étapes (facultative, responsable et Comptable) : code à 6 chiffres après le mot de passe ; garde tes codes de secours.
  - « Exporter toutes les données » télécharge un fichier complet (garde-le comme un mot de passe). Un fichier importé s'ajoute aux sauvegardes ; rien n'est remplacé sans « Restaurer ».
  - Missions récurrentes : un modèle de mission + tous les jours, certains jours de la semaine ou un jour du mois, à une heure de Madagascar. Le serveur la crée sans doublon ; 20 règles au plus.
  - Une mission récurrente manquée de plus de 2 h (serveur arrêté) n'est pas rattrapée.
  - Plafond du Chef d'équipe : au-dessus de ce prix client, seul le responsable décide (valider un début, une fin ou refuser). Le serveur refuse sans donner le montant ; 0 = pas de plafond.
- **Dans le code** : `src/views/admin/SettingsView.tsx`, `src/components/CompanyConditions.tsx`
<!-- /AUTO:pages -->

**Fenêtres et écrans qui ne sont pas des pages du menu** : connexion (`src/views/LoginView.tsx`), fiche CV d'un employé (`src/components/CVViewerModal.tsx`), « Pourquoi ce chiffre ? » (`src/components/WhyFigure.tsx`), assistant du site (`src/components/AssistantChat.tsx`), cloche de notifications, bannière de démo.

---

## 4. Le parcours d'une mission

1. Le **responsable** crée une mission : un **client**, un **type** (par défaut : Saisie de fiches, Contrôle qualité, Tâche administrative, Demande d'aide, Tâche web ; la liste se règle dans les réglages, `post_types`), une description, une quantité (« score » à faire), un justificatif demandé (`proof_mode` : selon le type, aucun, photo, note ou les deux), une date limite et une priorité (`src/utils/deadlines.ts`), éventuellement une liste de tâches à cocher (`src/utils/taskList.ts`) ou un modèle (`src/utils/missionTemplates.ts`).
2. Un **opérateur** la prend et la démarre avec une **preuve de début**. État : `pending_start`.
3. Le **responsable ou le Chef d'équipe** valide le début (`start_ok`) → état `active`. Il peut aussi refuser.
4. L'opérateur travaille puis envoie une **preuve de fin** → `pending_end`.
5. **Validation** (`end_ok`) → `completed`. À ce moment le serveur **fige la paie de l'opérateur et le prix client** (`calculated_ar`). **Refus** (`refused`) → `rejected`, avec un motif si le réglage « motif de refus obligatoire » est actif.
6. L'administrateur peut aussi **libérer de force** une session (`force_released`).
7. La paie se calcule à la clôture d'une période (mensuelle ou par quinzaine) ; les avances sont plafonnées par un réglage.

Règles de décision : `src/utils/postDecision.ts` (copie exacte dans le bloc `DECIDE` de `df-api`, comparée par `npm run check:team-lead`). Le prix client suit une règle à 5 niveaux (`src/utils/clientPrice.ts`). Les retards se calculent dans `src/utils/attendance.ts` selon l'heure limite des Conditions.

Notifications : un téléphone abonné reçoit des rappels (`src/utils/push.ts` côté appareil, `src/utils/pushRules.ts` pour les règles, `public/sw.js` pour l'affichage). Le service worker ne sert **qu'aux notifications**, pas au mode sans internet.

---

## 5. Comment les données circulent

```
Navigateur (React + Vite, hébergé sur Vercel)
   │  src/db/store.ts : UNE SEULE porte d'entrée aux données (mémoire locale + liste de ce qui a changé)
   ▼
Serveur df-api (Supabase Edge Function, fichier supabase/functions/df-api/index.ts)
   │  vérifie QUI demande, revérifie CHAQUE donnée, filtre ce que chacun peut lire
   ▼
Tables df_* (Supabase Postgres, aucun accès public : tout passe par df-api)
```

- **Lecture** : l'action `state` renvoie, collection par collection, ce qui a changé et la liste des identifiants. Le site la rappelle toutes les ~20 s par personne connectée (quota gratuit de Supabase : environ 500 000 appels par mois).
- **Écriture** : le site modifie sa copie locale (`store.ts`), puis l'action `sync` envoie les changements. Pour chaque collection, le serveur applique sa fonction `clean…` (ex. `cleanClient`, `cleanLeave`, `cleanReview`) qui **ne fait jamais confiance au navigateur** et peut **refuser** (raison renvoyée, texte clair côté site).
- **Chiffres officiels** (numéro de facture, de reçu) : attribués par le serveur par des fonctions SQL, jamais par le navigateur.
- **Démo** : `db.enterDemo('admin' | 'employee')` charge `src/demo/demoData.ts`, rien n'est envoyé.
- **Règle d'or du code** : les règles sont écrites **une fois, pures** (sans écran ni serveur) dans `src/utils/`, puis **copiées à l'identique** dans un bloc `BEGIN … / END …` de `df-api`. Un script `check:…` compare les deux copies et refuse toute différence.
- **Mots de passe** : `scrypt` (`scrypt$sel$hash`), jamais en clair. **Photos** : Cloudinary. **PDF et textes** : bucket `df-files`.
- **Sauvegardes** : `select public.df_take_backup();` (aussi chaque nuit, toutes les tables `df_*`), restauration depuis la page Réglages (admin).

### Les tables (AUTO)

<!-- AUTO:tables -->
| Collection (site) | Table (base) | Remarque |
|---|---|---|
| `users` | `df_users` |  |
| `clients` | `df_clients` | avant les missions et les sessions : une fiche créée dans le même envoi existe déjà quand on vérifie le lien |
| `suppliers` | `df_suppliers` | avant les dépenses, le stock et les bons de commande : le fournisseur existe déjà quand on vérifie le lien |
| `posts` | `df_posts` |  |
| `contracts` | `df_contracts` |  |
| `securityLogs` | `df_security_logs` |  |
| `advances` | `df_advances` |  |
| `messages` | `df_messages` |  |
| `groups` | `df_groups` |  |
| `settings` | `df_settings` |  |
| `news` | `df_news` |  |
| `cash` | `df_cash` |  |
| `products` | `df_products` |  |
| `stock` | `df_stock_moves` |  |
| `purchases` | `df_purchase_orders` | après les produits et les fournisseurs : un bon ne se crée que si tout ce qu'il cite existe |
| `invoices` | `df_invoices` | factures et avoirs (les compteurs de numéros ne sont JAMAIS une collection : uniquement des fonctions SQL) |
| `reviews` | `df_reviews` | fiches d'évaluation (M5.4) : le salarié ne reçoit que SES fiches partagées, sans « points à améliorer » |
| `sheets` | `df_sheets` | « Mes tableaux » (M12.4) : l'opérateur écrit et lit les siens, l'admin lit tous (lecture seule) |
| `leaves` | `df_leaves` | demandes de congé (M5.2) : le salarié ne voit que les siennes, l'admin voit tout |
| `shifts` | `df_shifts` | planning des équipes (M15.2) : le responsable écrit, le salarié ne voit que SON planning |
| `entries` | `df_entries` | écritures comptables (M14.3) : JAMAIS écrites par la synchro, seulement par les routes accounting-* ; lecture responsable et Comptable |
| `quotes` | `df_quotes` | devis (module 2, M2.9) : après les clients et les factures (un devis cite un client et, une fois facturé, une facture) |
<!-- /AUTO:tables -->

Remarques : le dossier salarié n'a pas de table (champ `hr` dans `df_users`). La table de numéros de factures est faite de **fonctions SQL**, jamais d'une collection.

### Les actions du serveur (AUTO)

<!-- AUTO:actions -->
`login`, `forgot`, `signup`, `report-error`, `push-due`, `recurring-due`, `report-due`, `state`, `attendance`, `errors`, `error-update`, `backups`, `backup-get`, `backup-import`, `backup-now`, `audit-list`, `report-list`, `report-open`, `report-freeze`, `post-decide`, `sync`, `push-key`, `push-subscribe`, `push-unsubscribe`, `push-test`, `news-react`, `news-comment`, `news-comment-delete`, `news-comment-react`, `typing`, `news-share`, `news-submit`, `news-decision`, `news-withdraw`, `create-user`, `set-password`, `totp-status`, `totp-start`, `totp-enable`, `totp-disable`, `totp-new-backup`, `totp-reset`, `logout`, `reset-decision`, `signup-decision`, `invoice-issue`, `invoice-cancel`, `invoice-pay`, `accounting-sync`, `accounting-post`, `accounting-reverse`, `accounting-close`, `payroll-period`, `payroll-close`, `payroll-reopen`, `payroll-pay`, `payroll-bonus`, `payroll-bonus-delete`, `payroll-mine`, `chat-read`, `queue`, `upload`, `profile-request`, `profile-decision`
<!-- /AUTO:actions -->

Les collections passent par `state` (lecture) et `sync` (écriture) ; les autres actions sont des opérations précises (connexion, validation, paie, facture, notifications…).

---

## 6. Les modules (ce qui a été construit, et où)

Chaque module suit la même méthode (`TODO_MODULES.md`, « démarche commune ») : décisions de BTK → règles pures + contrôle → table (avec sauvegarde avant) → serveur → écrans → démo → contrôles → documents → essai de BTK.

| Module | Ce qu'il ajoute | Règles (site) | Table / serveur | Contrôle |
|---|---|---|---|---|
| **M0 Conditions** | Page « Conditions de l'entreprise » : identité, mentions légales, TVA, facturation, paie, congés, missions, règlement. Tout est facultatif. | `src/utils/companyRules.ts` | réglages (`df_settings`) | `npm run check:company` |
| **M1 Clients** | Fiches clients, statut calculé, prix à 5 niveaux, missions liées | `src/utils/clients.ts`, `src/utils/clientPrice.ts` | `df_clients` | `npm run check:clients` |
| **M2 Facturation** | Factures, avoirs, reçus, relances, créances, devis (annulation d'une facture = avoir, jamais suppression) | `src/utils/invoices.ts`, `src/utils/receivables.ts`, `src/utils/invoiceStats.ts`, `src/utils/invoiceDoc.ts`, `src/utils/quotes.ts` | `df_invoices`, `df_quotes` | `npm run check:invoices`, `npm run check:receivables`, `npm run check:quotes` |
| **M3 Performance et badges** | Score 0 à 100, badges à niveaux, tendance, points d'attention, employé du mois ; badges et relation des clients. **Tout est calculé et expliqué**, rien n'est donné à la main. | `src/utils/performanceScore.ts`, `src/utils/clientBadges.ts`, `src/utils/recognition.ts`, `src/utils/performanceExport.ts` | aucune (calculé) | `npm run check:badges` |
| **M4 Achats et stock** | Fournisseurs, bons de commande, inventaire, budgets par catégorie | `src/utils/purchasing.ts`, `src/utils/stock.ts` | `df_suppliers`, `df_purchase_orders` (le stock : `df_products`, `df_stock_moves`, existait déjà avant les modules) | `npm run check:purchasing`, `npm run check:stock` |
| **M5 Ressources humaines** | Dossier salarié, congés, bulletin de paie imprimable, évaluations | `src/utils/hrFile.ts`, `src/utils/leaves.ts`, `src/utils/payslip.ts`, `src/utils/reviews.ts` | champ `hr` de `df_users`, `df_leaves`, `df_reviews` | `npm run check:hr`, `npm run check:leaves`, `npm run check:reviews` |
| **M6 Missions avancées** | Date limite et priorité, modèles, liste de tâches, notifications push | `src/utils/deadlines.ts`, `src/utils/missionTemplates.ts`, `src/utils/taskList.ts`, `src/utils/pushRules.ts` | dans `df_posts` | `npm run check:deadlines`, `npm run check:templates`, `npm run check:tasks`, `npm run check:push` |
| **M7 Droits et traçabilité** | Quatre rôles, Chef d'équipe, journal d'audit, restauration | `src/utils/roles.ts`, `src/utils/auditRules.ts`, `src/utils/postDecision.ts`, `src/utils/teamLead.ts` | journal dans `df_security_logs` | `npm run check:roles`, `npm run check:audit`, `npm run check:team-lead` |
| **M8.1 Direction** | Une page de synthèse du mois, **sans nouveau calcul** | `src/utils/direction.ts` | aucune | `npm run check:direction` |
| **M14 Comptabilité** (code fait jusqu'à M14.9 ; reste la relecture d'un expert-comptable, M14.10) | Plan comptable minimal, écritures à partie double, grand livre, balance, résultat, bilan, TVA. **Règles pures (M14.1), écritures automatiques depuis factures, avoirs, argent, paie et avances (M14.2), table `df_entries` et serveur en ligne depuis `df-api` v37 (M14.3) ; page « Comptabilité » faite (M14.4) : journal, grand livre, balance, résultat, bilan, saisie et annulation. Aucune écriture n'est générée tant que personne n'appuie sur « Générer ». TVA mois par mois (M14.5), clôture par fin de mois avec report à nouveau (M14.6), rapprochement bancaire et Mobile Money (M14.7), export Excel et CSV pour le comptable (M14.8). Santé du site (M14.9) : trois rappels, jamais bloquants : écriture déséquilibrée (urgent), mois finis depuis plus de 10 jours pas encore clos, TVA à payer sur un mois fini depuis plus de 15 jours. Le site ne garde pas « déclaration faite » : un mois clos n'est plus signalé.** À valider par un expert-comptable. | `src/utils/accounting.ts`, `src/utils/accountingEntries.ts`, `src/views/admin/AccountingPage.tsx`, `src/utils/health/rules/accounting.ts` | `df_entries` | `npm run check:accounting`, `npm run check:accounting-entries`, `npm run check:accounting-server`, `npm run check:accounting-page`, `npm run check:health-accounting` |
| **M11 Admin IA Pro** | Santé du site (alertes automatiques par page), assistant sans IA externe, « Pourquoi ce chiffre ? », carte du site, IA externe facultative (désactivée par défaut) | `src/utils/health/`, `src/utils/assistant.ts`, `src/utils/siteKnowledge.ts`, `src/utils/siteSnapshot.ts`, `src/utils/advice.ts`, `src/utils/aiAssist.ts` | aucune (calcul dans le navigateur de l'admin) | `npm run check:health`, `npm run check:assistant`, `npm run check:site-map` |
| **M12 Mes tableaux** | Tableur simple pour saisir à la place d'Excel : formules sûres, tri, filtre, corbeille, exports | `src/utils/sheets.ts`, `src/utils/sheetFormula.ts`, `src/utils/sheetExport.ts` | `df_sheets` | `npm run check:sheets` |
| **M15.1 Missions récurrentes** (M15 en cours) | Une règle crée une mission toute seule (chaque jour, jours de la semaine ou jour du mois) à l'heure de Madagascar, jamais en double ; arrêt et reprise sans rattrapage. Réglages > Missions. | `src/utils/recurring.ts` | aucune table : règles dans les réglages (`recurring_missions`, admin seulement) ; tâche planifiée `df-recurring-due` toutes les 15 min → route `recurring-due` | `npm run check:recurring` |
| **M15.2 Planning des équipes** (M15 en cours) | Onglet « Planning » de la page Ressources humaines : grille de la semaine par salarié (Jour, Nuit, Repos, un clic par case), conflits signalés (congé accepté, Nuit puis Jour, trop de jours dans la semaine), copie de la semaine précédente. Le salarié voit « Mon planning », en lecture seule. | `src/utils/planning.ts` | table `df_shifts` ; bloc `SHIFTS` de `df-api` (seul le responsable écrit, un salarié ne reçoit que son planning) | `npm run check:planning`, `npm run check:planning-page` |
| **M15.3 Objectifs par salarié et par équipe** (M15 en cours) | Onglet « Objectifs » de la page Performance : une cible (valeur prévue) par mois ou chaque mois, pour l'équipe ou un salarié ; mesures : missions validées, taux de validation. La valeur réelle est calculée à partir des missions, jamais saisie. Lien avec les évaluations : l'éditeur de fiche (page RH) montre ces objectifs sur la période, calculés, sans les enregistrer. | `src/utils/teamGoals.ts` | aucune table : objectifs dans les réglages (`team_goals`, admin seulement) ; bloc `TEAMGOALS` de `df-api` | `npm run check:team-goals`, `npm run check:team-goals-page` |
| **M15.4 Budget prévu contre réel** (M15 en cours) | Carte « Prévu contre réel » de l'onglet Finances : pour les 6 derniers mois, revenus, dépenses, paie et bénéfice, prévu contre réel, écart et situation (dans le prévu, attention, hors prévu, en cours). Prévu : dépenses = total des budgets par catégorie (module 4), revenus et paie = deux montants mensuels réglés sur la carte. Réel : toujours calculé, jamais saisi. | `src/utils/budgetPlan.ts` | aucune table : plan dans les réglages (`monthly_plan`, admin seulement) ; bloc `BUDGETPLAN` de `df-api` | `npm run check:budget-plan`, `npm run check:budget-plan-page` |
| **M15.5 Rapport automatique** (M15 en cours ; **code fini le 2026-10-27 : règles, serveur en ligne (v45) et écran ; réglage sur « Arrêté » tant que BTK ne l'active pas ; essai de BTK à faire en M15.9**) | Le responsable choisit (Statistiques > Rapport > « Rapport automatique ») : arrêté, chaque semaine ou chaque mois, à une heure de Madagascar. À l'heure prévue, le serveur crée UNE fiche pour la période FINIE (semaine passée, lundi à dimanche, ou mois passé) et prévient le responsable ; l'identifiant vient de la période : jamais de doublon. La copie figée du rapport est posée une seule fois, à la première ouverture par le responsable, puis ne change plus. 24 fiches gardées. Pas d'e-mail. Une période manquée (serveur arrêté plus de 2 h) n'est pas rattrapée. Le rapport sait faire le mois et la semaine (la semaine n'a ni objectifs du mois, ni prévision, ni alertes). Ouvrir un rapport « en attente » le calcule avec les données du moment puis le fige. | `src/utils/autoReport.ts`, `src/views/admin/AutoReportCard.tsx` (écran), `src/utils/report.ts` (mois et semaine) | table `df_reports` (migration `20261027_create_df_reports.sql`, appliquée le 2026-10-27) : jamais une collection de la synchro, seulement les routes `report-list`, `report-open`, `report-freeze` (responsable) et `report-due` (tâche planifiée avec secret, migration `20261027_auto_report_cron.sql`, appliquée le 2026-10-27) ; bloc `AUTOREPORT` de `df-api` ; réglage `auto_report` (admin seulement) | `npm run check:auto-report`, `check:auto-report-ui`, `check:report-week` |
| **M15.6 Validation à plusieurs niveaux** (M15 en cours ; **en ligne depuis le 2026-10-27, serveur v46 ; essai de BTK à faire en M15.9**) | Un plafond réglable en Ar (Réglages > Missions > « Plafond du Chef d'équipe », 0 = aucun). Le montant comparé est le **prix client** de la mission (la paie est la même pour toutes). Au-dessus du plafond (strictement), le Chef d'équipe ne peut ni valider un début, ni valider une fin, ni refuser : le serveur répond 403 sans dire le montant ; le responsable n'est jamais bloqué. Le plafond n'est jamais envoyé au Chef d'équipe. **Limite :** le Chef d'équipe voit l'erreur au moment de décider, sa liste ne marque pas ces missions à l'avance. | `src/utils/approvalLimit.ts` | pas de nouvelle table ; réglage `team_lead_limit_ar` (admin seulement) ; bloc `LEADLIMIT` et `postDecide` de `df-api` | `npm run check:approval-limit` |
| **M15.8 Santé du site, carte du site et démo du module 15** (M15 en cours ; code fait le 2026-10-27, rien à déployer) | La Santé du site signale (à voir) les conflits du planning des 14 prochains jours et la paie ou les dépenses du mois en cours au-dessus du prévu ; la carte du site et l'assistant décrivent les missions récurrentes, le planning, le prévu contre réel, le rapport automatique et le plafond du Chef d'équipe ; la démo montre une règle récurrente. **Limites :** pas d'alerte pour le rapport automatique ni pour le plafond ; l'alerte ouvre la page, pas l'onglet. | `src/utils/health/rules/management.ts`, `src/utils/siteKnowledge.ts` | pas de nouvelle table ni de changement du serveur | `npm run check:health-management`, `npm run check:site-map` |
| **M16 Facilité et sécurité** (en cours) | M16.1 fait : import Excel et CSV (clients, produits, salariés, tableaux) avec aperçu ligne par ligne. M16.2 faite : visite guidée par rôle à la première connexion sur un appareil (textes pris dans la carte du site), à revoir dans Réglages. M16.3 faite : après 5 mots de passe ratés sur un compte (ou 20 depuis une même adresse), la connexion est refusée pendant 1 minute, puis 2, 4… jusqu'à 30 minutes (5 minutes pour le responsable) ; jamais définitif, un bon mot de passe ne passe pas pendant le délai ; le début de chaque délai est écrit dans le journal d'audit. M16.4 faite : sécurité en deux étapes facultative (Réglages) pour le responsable et le Comptable : code à 6 chiffres d'une application d'authentification après le mot de passe, 8 codes de secours à usage unique, le responsable peut remettre à zéro celle d'un Comptable. M16.5 faite : « Exporter toutes les données » (fichier complet) et « Importer un fichier d'export » dans Réglages > Sauvegardes ; un fichier importé s'ajoute à la liste, la reprise se fait par « Restaurer » avec toutes ses protections. M16.7 faite : la Santé du site (page Système) signale les délais de connexion des dernières 24 h ; tout le module est dans la carte du site, l'assistant et ce guide. M16.6 faite (liens) : dans Factures > À relancer, « Envoyer par WhatsApp » et « Envoyer par SMS » ouvrent le message de relance déjà écrit (numéro du client mis au format Madagascar) ; la personne appuie sur « envoyer » ; aucun envoi automatique. Le reste ( export complet, WhatsApp) à venir | `src/utils/importRules.ts`, `src/utils/importFile.ts`, `src/utils/tour.ts`, `src/components/TourGuide.tsx`, `src/utils/loginGuard.ts`, `src/utils/totp.ts`, `src/components/TwoStepCard.tsx` | `df_login_attempts` (compteurs d'essais), `df_totp` (secret et empreintes des codes de secours ; serveur seulement ; la visite est gardée sur l'appareil ; l'import réutilise les règles de saisie, le serveur revérifie) | `npm run check:import`, `npm run check:import-page`, `npm run check:tour`, `npm run check:login-guard`, `npm run check:totp`, `npm run check:totp-page`, `npm run check:export` |

Versions du serveur en ligne : voir `AI_STUDIO.md` (chaque déploiement note la version, le commit et le retour en arrière). Exemples : M5.1 et M5.2 en v26, M5.4 en v29 (sauvegarde n° 35), Mes tableaux en v31.

**Décisions de fond à connaître** (prises par BTK) :
- Argent, factures, clients, tarifs : **réservés au responsable côté serveur**.
- Une facture émise **ne se supprime jamais** : on l'annule par un **avoir**.
- Les chiffres de la démo restent locaux ; aucun chiffre inventé dans la vraie base.
- Le salarié ne reçoit **jamais** les points faibles le concernant (« points à améliorer » d'une évaluation, points d'attention de la performance).
- La paie est à la **mission** (tarif figé à la validation).
- Un module à la fois ; une étape = un commit + le plan à jour.

---

## 7. Où est quoi dans le code, et comment modifier

### Carte des fichiers (AUTO : première phrase de chaque fichier)

<!-- AUTO:codemap -->
**Règles du site (`src/utils/`)**

| Fichier | Rôle |
|---|---|
| `accounting.ts` | Comptabilité (module 14, M14.1) : règles pures, sans écran, sans serveur, sans table. Contrôlé par `npm run check:accounting`. |
| `accountingEntries.ts` | Écritures AUTOMATIQUES (module 14, M14.2) : règles pures qui transforment chaque pièce du site en écriture comptable. Sans écran, sans serveur, sans table. |
| `accountingExport.ts` | Export pour le comptable (module 14, M14.8) : règles pures, sans écran, sans serveur. Contrôlé par `npm run check:accounting-export`. |
| `advice.ts` | Solutions proposées (suggestions) pour chaque règle de la Santé du site. Texte fixe, FR/EN, jamais d'accusation : ce sont des pistes que l'admin juge lui-même. |
| `aiAssist.ts` | Assistant IA externe (niveau B, M11.13) côté site. ADMIN SEULEMENT, DÉSACTIVÉ PAR DÉFAUT (case dans Réglages, réglée sur cet appareil). |
| `alerts.ts` | Alertes de l'accueil admin (sans écran, sans serveur). Contrôlé par `npm run check:phase4`. |
| `alertsDb.ts` | Le menu affiche la pastille à chaque affichage : on garde le résultat jusqu'à la prochaine modification des données (ou du jour / de la personne connectée). |
| `approvalLimit.ts` | Validation à plusieurs niveaux (module 15, M15.6). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:approval-limit`. |
| `assistant.ts` | Assistant « Admin IA Pro », niveau A (module 11, M11.10) : AUCUNE IA externe, que des règles et des calculs faits dans le navigateur de l'admin. |
| `attachments.ts` | Pièces jointes des publications et commentaires : préparation (compression) puis envoi. |
| `attendance.ts` | Retard d'une session (utilisé par le calendrier et par les alertes). Pur, sans écran. |
| `auditRules.ts` | Journal d'audit (M7.2) : règles pures, sans écran ni serveur. Le serveur (bloc AUDIT de df-api) a la même copie ; `npm run check:audit` compare les deux. |
| `autoReport.ts` | Rapport automatique (module 15, M15.5). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:auto-report`. |
| `avatarColor.ts` | Couleur d'une personne = couleur dominante de sa photo de profil (rouge sur photo rouge, etc.). |
| `backupExcel.ts` | Sauvegarde Excel : une feuille par thème. Aucun mot de passe n'est exporté. |
| `bankRecon.ts` | Rapprochement bancaire et Mobile Money (module 14, M14.7) : règles pures, sans écran, sans serveur, sans table. Contrôlé par `npm run check:bank-recon`. |
| `budgetPlan.ts` | Budget prévu contre réel (module 15, M15.4). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:budget-plan`. |
| `chartData.ts` | Données des graphiques : parties réelles, prévision en pointillé, rythme d'un objectif (purs, sans écran). |
| `chartParts.ts` | Règles pures des graphiques « C3 » : parts de l'anneau, barres de classement, jauge d'objectif, mini-courbe. |
| `chartScale.ts` | Calculs des graphiques (purs, sans écran) : graduations rondes, courbe douce, point le plus proche, statistiques. |
| `chatPrefs.ts` | Préférences de messagerie propres à chaque personne, gardées sur son appareil : |
| `clientBadges.ts` | Badges et score de relation des CLIENTS (module 3, M3.5) : règles pures, sans écran ni serveur. Contrôlé par `npm run check:client-badges`. |
| `clientBadgesDb.ts` | Badges des clients calculés avec les données du site (module 3). Réservé au responsable : un salarié n'a ni clients ni factures. |
| `clientPrice.ts` | Prix client : ce que le client paie pour une mission validée. |
| `clients.ts` | Clients (module 1) : statut calculé, chiffres et prix. Règles pures : pas d'écran, pas de serveur, pas de table. |
| `companyRules.ts` | Conditions de l'entreprise (module 0) : valeurs de départ, validation et filtre employé. |
| `dataUrls.ts` | Photos « collées » dans un enregistrement (module 13, M13.5b) : quand l'envoi d'une photo échoue (pas de réseau), l'appli garde la version compressée |
| `deadlines.ts` | Date limite et priorité d'une mission (module 6, M6.1). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:deadlines`. |
| `direction.ts` | Page « Direction » (module 8, M8.1) : UNE page de synthèse pour le responsable. Règle pure, sans écran ni serveur. |
| `enTranslate.ts` | Traduction automatique de l'interface en anglais (français → English). |
| `errorReport.ts` | Rapports d'erreur : construction, mémoire locale (20 derniers), envoi limité au journal, texte à copier. |
| `exportDoc.ts` | Télécharger un document (bulletin, facture, reçu, rapport) en PDF ou en Excel, en plus d'« Imprimer ». |
| `exportFile.ts` | Export complet et reprise (module 16, M16.5) : règles pures. Le fichier est exactement celui du bouton « Télécharger » des sauvegardes |
| `finance.ts` | Finances : règles pures (sans écran, sans serveur). Utilisées par l'onglet « Finances » et par le contrôle `npm run check:finance`. |
| `financeStats.ts` | Finances : chiffres « vraie entreprise » (sans écran, sans serveur). Utilisés par l'onglet Finances et par `npm run check:finance-stats`. |
| `fontSize.ts` | Taille du texte, réglée sur cet appareil (garde dans le navigateur) |
| `formatUtils.ts` | — |
| `goals.ts` | Objectifs du mois et prévision simple (sans écran, sans serveur). Contrôlé par `npm run check:phase4`. |
| `healthDb.ts` | « Santé du site » : relie le moteur d'alertes (src/utils/health/) aux données du site. ADMIN SEULEMENT (liste vide pour un employé : il n'a ni argent ni stock). |
| `healthNotif.ts` | Notifications de la cloche pour l'admin (M11.7 / M9.4) : règles PURES (aucun écran, aucun serveur). |
| `hrFile.ts` | Dossier du salarié (module 5, M5.1) : règles pures, sans écran ni serveur. |
| `i18n.ts` | — |
| `imageUtils.ts` | Justificatif de remplacement (image SVG générée localement, sans service externe). |
| `importFile.ts` | Import Excel et CSV (module 16, M16.1) : lire un fichier choisi par le responsable et le rendre en tableau de textes. |
| `importRules.ts` | Import Excel et CSV (module 16, M16.1) : règles pures, sans écran, sans serveur, sans réseau, sans lecture de fichier. |
| `invoiceDoc.ts` | Facture, avoir et reçu imprimables (A4), même méthode que le bulletin de paie : page claire isolée, tout échappé, « Imprimer » puis « Enregistrer en PDF ». |
| `invoiceStats.ts` | Chiffres de facturation pour Finances, Statistiques et le rapport du mois (module 2, M2.8). Pur : sans écran, sans serveur. Contrôlé par `npm run check:invoice-stats`. |
| `invoices.ts` | Facturation : règles pures (sans écran, sans serveur). Utilisées par l'écran « Facturation » et par `npm run check:invoices`. |
| `keyboard.ts` | Clavier virtuel ouvert ? (iPhone : la vue visible rétrécit et la page est poussée vers le haut) |
| `leaves.ts` | Congés et absences (module 5, M5.2) : règles pures, sans écran ni serveur. |
| `loginGuard.ts` | Blocage après trop d'essais de connexion (module 16, M16.3) : règles pures, sans écran, sans serveur, sans réseau. |
| `messageLinks.ts` | Rappels par WhatsApp et SMS (module 16, M16.6) : règles pures. Aucun envoi automatique, aucun service payant, aucune clé : |
| `messageTemplates.ts` | Modèles de messages FR/EN (M11.11). Pur : pas d'écran, pas de serveur, pas d'envoi. L'admin relit et modifie le texte avant de l'utiliser. |
| `missionGuides.ts` | Guides des 5 types de mission : ce qu'il faut faire, quel justificatif envoyer, ce que le responsable vérifie. |
| `missionTemplates.ts` | Modèles de mission (module 6, M6.2). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:templates`. |
| `modalGuard.ts` | Fermeture d'une fenêtre par un clic sur le fond sombre. Règles pures, sans écran. Contrôlé par `npm run check:reason-modal`. |
| `modeSwitch.ts` | Bouton « Vue opérateur / Retour responsable » du menu : visible ou masqué (réglé sur cet appareil). |
| `moduleSwitch.ts` | Interrupteur de modules : le responsable peut CACHER des pages du menu (rien n'est supprimé, les données restent). |
| `navIntent.ts` | Filtre à appliquer sur la page Validations quand on arrive depuis une notification |
| `navTarget.ts` | « Va exactement à cet élément » : une page marque ses éléments avec data-nav="...", |
| `notifSound.ts` | Préférence du son, gardée sur CET appareil (pas sur le serveur) : chaque téléphone règle le sien |
| `notifications.ts` | — |
| `offline.ts` | Mode hors ligne (module 13, M13.2) : règles pures, SANS écran, SANS serveur, SANS stockage. Contrôlé par `npm run check:offline`. |
| `offlineShell.ts` | Enregistre le service worker pour que l'appli s'ouvre sans réseau (module 13, M13.4). Seulement en production (jamais en développement : |
| `offlineSync.ts` | Pont entre le magasin de données et la file d'actions hors ligne (module 13, M13.5) : règles pures, sans réseau, sans stockage. |
| `offlineVault.ts` | Copie locale du mode hors ligne (module 13, M13.3) : garder sur l'appareil, PAR PERSONNE, la dernière copie des données et la file d'actions, |
| `payslip.ts` | — |
| `pendingCount.ts` | Nombre de choses à valider par l'admin (une seule source pour la cloche, le menu et l'Accueil) |
| `performance.ts` | Statistiques de performance par opérateur (lecture du store, aucun appel serveur). |
| `performanceExport.ts` | Export des scores et des badges (module 3, M3.8) : tableau Excel/CSV de la page Performance et section du rapport mensuel. |
| `performanceScore.ts` | Performance des salariés (module 3, partie A) : score 0-100, badges à niveaux, tendance, points d'attention, employé du mois. |
| `phoneUtils.ts` | Téléphone : chiffres uniquement, format fixe « 261 34 12 345 67 » |
| `planning.ts` | Planning des équipes (module 15, M15.2). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:planning`. |
| `postBand.ts` | Couleur d'une carte de mission selon le « Reste » (score qu'il reste à faire) |
| `postDecision.ts` | Décision sur une session (M7.1 d) : valider ou refuser. Règles pures, sans écran ni serveur. |
| `prefetch.ts` | Précharge les pages en arrière-plan (quand le navigateur est au repos) : l'ouverture devient instantanée |
| `presence.ts` | Un opérateur est « en ligne » s'il a donné signe de vie il y a moins de 90 s |
| `printFormat.ts` | Règles communes des documents imprimés et téléchargés (PDF et pages imprimables) : A4, Times New Roman, taille normale (12 pt). |
| `proofs.ts` | Toutes les preuves d'une session (début puis fin), sans doublon |
| `purchasing.ts` | Fournisseurs, bons de commande, inventaire et budgets (module 4) : règles pures, sans écran ni serveur. |
| `push.ts` | Notifications push côté téléphone/navigateur (M6.4). Aucune dépendance : service worker + API Push du navigateur. |
| `pushRules.ts` | Notifications push (module 6, M6.4) : règles pures, sans réseau. Contrôlé par `npm run check:push`. |
| `quotes.ts` | Règles des DEVIS (module 2, M2.9). Fonctions pures, sans écran ni serveur. Copiées dans le bloc QUOTES de supabase/functions/df-api/index.ts |
| `receivables.ts` | Créances et relances (module 2, M2.7) : règles pures, sans écran ni serveur. Contrôlé par `npm run check:receivables`. |
| `recognition.ts` | Reconnaissance (module 3, M3.7) : règles pures. Contrôlé par `npm run check:recognition`. |
| `recurring.ts` | Missions récurrentes (module 15, M15.1). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:recurring`. |
| `report.ts` | Rapport du mois (S4.5) et données d'export Excel / PDF (S4.4). Sans écran, sans serveur : contrôlé par `npm run check:phase4`. |
| `reviews.ts` | Évaluation périodique (module 5, M5.4) : règles pures, sans écran ni serveur. |
| `roles.ts` | Rôles (M7.1) : règles pures, sans écran ni serveur. Le serveur (bloc ROLES de df-api) a la même copie ; `npm run check:roles` compare les deux. |
| `scrollRescue.ts` | Filet de sécurité du défilement (grand écran, tablette). |
| `sheetExport.ts` | « Mes tableaux » : exports Excel (.xlsx), Word (.doc) et PDF (impression). Les formules sont exportées en VALEURS (ce que l'écran montre). |
| `sheetFormula.ts` | « Mes tableaux » (module 12) : lecteur de formules SÛR, type Excel. Aucun `eval`, aucun accès au réseau ni au navigateur : texte → arbre → valeur. |
| `sheets.ts` | « Mes tableaux » (module 12) : règles pures d'un tableau (colonnes, lignes, corbeille, calcul, contrôle de saisie, tri/filtre, totaux, graphique, modèles, annuler/rétablir). |
| `sheetsStore.ts` | « Mes tableaux » : ancien rangement sur l'appareil (avant le serveur). Sert seulement à REPRENDRE une fois les tableaux déjà saisis, puis la copie est retirée. Jamais d'accès sans try/catch. |
| `siteKnowledge.ts` | Carte du site (module 11, M11.8) : pour CHAQUE page du menu, à quoi elle sert, comment l'utiliser, ses règles et ses chiffres avec leur formule. FR et EN. |
| `siteSnapshot.ts` | Instantané du site et « Pourquoi ce chiffre ? » (module 11, M11.9). Pur : pas d'écran, pas de serveur. ADMIN SEULEMENT (chiffres d'argent). |
| `snapshotDb.ts` | Relie l'instantané et « Pourquoi ce chiffre ? » aux données du site. ADMIN SEULEMENT : sans admin, aucune donnée n'est lue. |
| `splash.ts` | Écran de démarrage « BTK » (défini dans index.html) : retrait en fondu quand le site est prêt. |
| `stats.ts` | Calcul des périodes (jour, semaine, mois, année) et des chiffres de la page Statistiques. |
| `statsNav.ts` | Onglet de la page Statistiques gardé d'une visite à l'autre (et réglable depuis l'accueil : un clic sur une alerte ouvre le bon onglet). |
| `stock.ts` | Stock : règles pures (sans écran, sans serveur). Utilisées par l'onglet « Stock » et par le contrôle `npm run check:stock`. |
| `swRules.ts` | Règles du service worker « l'appli s'ouvre sans réseau » (module 13, M13.4). Pures, sans navigateur. |
| `taskList.ts` | Liste de tâches dans une mission (module 6, M6.3). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:tasks`. |
| `teamGoals.ts` | Objectifs par salarié et par équipe (module 15, M15.3). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:team-goals`. |
| `teamLead.ts` | Sessions en attente (début ou fin) des opérateurs de l'équipe du Chef d'équipe, les plus anciennes d'abord. Rien d'autre : jamais un autre groupe. |
| `totp.ts` | Sécurité en deux étapes (module 16, M16.4) : règles pures, sans écran, sans serveur. |
| `tour.ts` | Visite guidée (module 16, M16.2) : règles pures, sans écran, sans serveur. Les textes viennent de la carte du site (siteKnowledge.ts) : |
| `updateWatcher.ts` | Rechargement automatique après une mise à jour du site. |
| `useChatUnread.ts` | Nombre de nouveaux messages non lus (pastille rouge sur l'icône Messages) |
| `useLockBodyScroll.ts` | — |
| `usePerformance.ts` | Performance des salariés (module 3, M3.3) : branche les règles pures (performanceScore.ts) sur les données du site. |
| `xlsxA4.ts` | Excel au format A4 (règle de BTK) : Times New Roman 12, page A4 prête à imprimer, texte jamais rétréci. |

**Santé du site : moteur (`src/utils/health/`)**

| Fichier | Rôle |
|---|---|
| `acks.ts` | « Ignorer » / « Vérifié » : marques posées par l'admin sur une alerte. Pour l'instant gardées DANS CE NAVIGATEUR (une clé par admin) : |
| `all.ts` | Toutes les règles de surveillance (module 11) rassemblées : c'est la seule liste que l'écran utilise. |
| `menu.ts` | Où va chaque page surveillée dans le menu (pastilles) et comment ouvrir la destination d'une alerte. Pur. |
| `registry.ts` | Registre et moteur d'alertes (module 11) : exécute les règles de chaque page, ne garde que des alertes valides, |
| `stats.ts` | Détection statistique SIMPLE (module 11, M11.6) : on compare à la médiane des périodes d'avant. Jamais de boîte noire : |
| `types.ts` | Moteur d'alertes « Admin IA Pro » (module 11) : format commun de toutes les alertes. Règles pures, sans écran, sans serveur. |
| `watchPrefs.ts` | Réglages « Surveillance » (M11.14) : seuils de la Santé du site, réglés SUR CET APPAREIL (aucun serveur). Pur, sauf lecture/écriture du stockage local, protégée. |

**Santé du site : contrôles par page (`src/utils/health/rules/`)**

| Fichier | Rôle |
|---|---|
| `accounting.ts` | Contrôles de la page Comptabilité (module 14, M14.9). Règles pures : elles lisent, ne changent rien. |
| `clients.ts` | Contrôles de la page Clients (module 11, lot 2). Règles pures. |
| `common.ts` | Petits outils communs aux règles d'alertes (dates de Madagascar, noms, pluriels, durées). Purs. |
| `conditions.ts` | Contrôles de la page Conditions et des Réglages (module 11, lot 3) : réglage manquant ou qui se contredit. Règles pures. |
| `data.ts` | Contrôles « Qualité des données » (module 11, lot 3) : des chiffres ou des liens qui ne peuvent pas être justes. Règles pures. |
| `finance.ts` | Contrôles de la page Finances (module 11, lot 2). Règles pures : elles ne changent aucune donnée. |
| `hr.ts` | Contrôles de la page Ressources humaines (module 5 + module 11) : demandes de congé en attente, fin d'essai ou de contrat proche. Règles pures. |
| `invoices.ts` | Contrôles de la page Factures (module 11, M11.12). Règles pures : elles lisent, ne changent rien. |
| `lot1.ts` | Lot 1 du module 11 : Missions, Équipe, Paie (contient les briques de l'ancien M9.1). Voir TODO_MODULES.md. |
| `lot2.ts` | Lot 2 du module 11 : Finances, Clients, Stock. Voir TODO_MODULES.md. |
| `lot3.ts` | Lot 3 du module 11 : qualité des données et Conditions (ce qui se calcule dans le navigateur). |
| `management.ts` | Contrôles du module 15 (management), M15.8. Règles pures : elles lisent, ne changent rien. |
| `missions.ts` | Contrôles de la page Missions (module 11, lot 1). Règles pures : elles ne changent aucune donnée. |
| `payroll.ts` | Contrôles de la page Paie et avances (module 11, lot 1). Règles pures. |
| `performance.ts` | Contrôles de la page Performance (module 11, M11.12). Règle pure : elle réutilise le calcul de performance (module 3), ne change rien. |
| `stats.ts` | Contrôles statistiques (module 11, M11.6) : un chiffre s'écarte nettement de la médiane des périodes d'avant. Règles pures. |
| `stock.ts` | Contrôles de la page Stock (module 11, lot 2). Règles pures. |
| `suppliers.ts` | Contrôles de la page Achats / Fournisseurs (module 11, M11.12). Règles pures : elles lisent, ne changent rien. |
| `system.ts` | Contrôles « Système » (module 11, M9.2 partie A) : sauvegarde de nuit et erreurs du site. Règles pures. |
| `team.ts` | Contrôles de la page Équipe (module 11, lot 1) : absences, retards, refus, inactivité. Règles pures. |
<!-- /AUTO:codemap -->

Autres dossiers : `src/views/` (pages), `src/components/` (morceaux d'écran réutilisables, graphiques dans `src/components/charts/`), `src/db/store.ts` (accès aux données), `src/demo/demoData.ts` (données de démo), `src/types/index.ts` (types), `supabase/functions/df-api/index.ts` (serveur), `supabase/migrations/` (tables), `scripts/` (contrôles).

### Recettes (ce qu'il faut faire, dans l'ordre)

**Ajouter une règle ou un calcul** : écrire la fonction pure dans `src/utils/…` (une phrase d'en-tête qui dit à quoi elle sert), écrire `scripts/check-….ts` (cas normaux **et** piégés : vide, zéro, gros nombres, texte, dates fausses), ajouter la commande dans `package.json`.

**Ajouter une nouvelle collection (table)** :
1. Accord de BTK, puis `select public.df_take_backup();`.
2. Migration `supabase/migrations/` (nom `AAAAMMJJ_create_df_xxx.sql`) : `id text primary key`, `data jsonb`, `updated_at`, **RLS activée, aucun droit pour `anon` ni `authenticated`**, retour en arrière écrit en commentaire. Modèle : `supabase/migrations/20261023_create_df_leaves.sql`.
3. Serveur : entrée dans `T`, bloc `BEGIN … / END …` avec la fonction `clean…`, filtre de lecture dans `state` (qui voit quoi), branche dans `sync` (qui écrit quoi), suppression avec le compte (`purgeEmployee`) si les données sont personnelles.
4. Site : `COLS`, `SORTERS`, `emptySynced`, champ privé, `arr`/`setArr` et méthodes dans `src/db/store.ts`, type dans `src/types/index.ts` ou dans le fichier de règles.
5. Démo : données inventées dans `src/demo/demoData.ts`, filtrées par rôle comme le fait le serveur.
6. Contrôle : `scripts/check-….ts` compare la copie du serveur à celle du site et vérifie chaque protection.

**Ajouter une page** : écran dans `src/views/…`, import paresseux et branche dans `src/App.tsx` (partie admin ou opérateur), entrée dans `src/components/Sidebar.tsx`, **fiche dans `src/utils/siteKnowledge.ts`** (mode d'emploi en **3 lignes** de 130 caractères au plus, règles de 200 au plus, but de 260 au plus, anglais sans mot français), fichier d'écran dans `PAGE_FILES` de `scripts/make-guide.ts`, nom de la page dans `src/utils/health/menu.ts` si elle a des alertes, puis `npm run guide`.

**Ajouter une alerte de la Santé du site** : règle dans `src/utils/health/rules/….ts` (format commun : `src/utils/health/types.ts`), inscription dans `src/utils/health/all.ts`, **solution écrite dans `src/utils/advice.ts`** (sinon `check:assistant` échoue), test dans un `scripts/check-health-….ts`.

**Ajouter un réglage dans Conditions** : `src/utils/companyRules.ts` (valeur de départ et règle de validation), champ dans `src/components/CompanyConditions.tsx`, `conditions` dans la fiche de la page concernée.

**Déployer le serveur** (`df-api`) : modifier le fichier dans GitHub **ne change pas le serveur en ligne**. Procédure : (1) pousser le commit, (2) `select public.df_take_backup();`, (3) migration si besoin, (4) comparer le `index.ts` en ligne à celui du dépôt, (5) déployer un `index.ts` **d'une seule ligne** qui importe le fichier du dépôt à un **commit précis** (le fichier fait plus de 230 Ko, on ne le recopie pas), **Verify JWT désactivé**, (6) noter version, commit et retour en arrière dans `AI_STUDIO.md`. Retour en arrière = redéployer la ligne du commit précédent.

**Documents à mettre à jour avec chaque étape** : `TODO_MODULES.md` (case cochée, date, commit), `TODO.md` (journal), `AI_STUDIO.md` (tables, routes, versions), `PROJET.md` si le menu change, **ce guide**.

### Les contrôles (AUTO)

`npm run build` et `npx tsc --noEmit` doivent passer, et tous les contrôles ci-dessous. Lancer avec `TZ=Indian/Antananarivo` (certains tests dépendent de l'heure de Madagascar).

<!-- AUTO:checks -->
| Commande | Ce qu'elle vérifie |
|---|---|
| `npm run check:sheets-shared` | Contrôle « Mes tableaux » : le bloc SHEETS du serveur donne EXACTEMENT les mêmes résultats que le site (src/utils/sheets.ts). Sans réseau. Lancer : npm run check:sheets-shared |
| `npm run check:sheets` | (voir `scripts/check-sheets.ts`) |
| `npm run check:hr` | Contrôle des règles du dossier salarié (module 5, M5.1), sans réseau ni écran. |
| `npm run check:leaves` | Contrôle des règles des congés (module 5, M5.2), sans réseau ni écran. |
| `npm run check:health-hr` | Contrôle des alertes RH et de l'effet des congés sur la Santé du site (modules 5 et 11). Pur, sans réseau. |
| `npm run check:hr-page` | Essai de la page Ressources humaines (sans écran réel, sans réseau) : démo admin et salarié, dossiers, congés, FR et EN. Complété à chaque étape du module 5. |
| `npm run check:reviews` | Contrôle des règles des évaluations (module 5, M5.4), sans réseau ni écran. |
| `npm run check:direction` | Contrôle de la page « Direction » (M8.1) : AUCUN nouveau calcul. Chaque chiffre est comparé à celui de sa règle d'origine, sur la démo et sur des cas piégés. |
| `npm run check:direction-page` | Essai de la page « Direction » (M8.1), sans écran réel ni réseau : démo admin, FR et EN, rôles. Lancer : npm run check:direction-page |
| `npm run check:guide` | (plusieurs contrôles) |
| `npm run check:accounting` | Contrôle des règles de comptabilité (module 14, M14.1), sans réseau ni écran. Lancer : npm run check:accounting |
| `npm run check:accounting-entries` | Contrôle des écritures automatiques (module 14, M14.2) : chaque total est comparé à celui des autres pages (créances, TVA, argent). Sans réseau. |
| `npm run check:accounting-server` | Contrôle du serveur de comptabilité (module 14, M14.3) : copie exacte des règles du site, mêmes résultats, protections, anonymat de la paie, migration. |
| `npm run check:bank-recon` | Contrôle du rapprochement bancaire et Mobile Money (M14.7), sans réseau. Lancer : npm run check:bank-recon |
| `npm run check:accounting-page` | Essai de la page Comptabilité (M14.4), sans écran réel ni réseau : démo, génération, saisie, annulation, FR et EN, rôles. Lancer : npm run check:accounting-page |
| `npm run check:accounting-close` | Contrôle de la clôture de la comptabilité (M14.6), sans réseau : règles, report à nouveau, démo (clôture, refus d'écrire, réouverture), serveur, écran FR/EN. |
| `npm run check:accounting-export` | Contrôle de l'export pour le comptable (M14.8), sans réseau. Lancer : npm run check:accounting-export |
| `npm run check:payslip` | Contrôle du bulletin de paie imprimable (M5.3), sans écran ni réseau. Lancer : npm run check:payslip |
| `npm run check:clients` | Contrôle des règles des clients (module 1) : statuts, chiffres, rattachement, prix à 5 niveaux. Sans écran, sans serveur. |
| `npm run check:import` | Contrôle de l'import Excel et CSV (module 16, M16.1) : lecture CSV, colonnes reconnues, aperçu ligne par ligne, doublons, tableau libre, mots de passe. Sans écran, sans réseau. |
| `npm run check:tour` | Contrôle de la visite guidée (module 16, M16.2) : étapes par rôle, pages permises, textes FR/EN, « déjà vue » par personne, carte Réglages. Sans réseau. |
| `npm run check:import-page` | Essai de l'import Excel et CSV côté site (module 16, M16.1), sans écran réel ni réseau : boutons dans les 4 pages (FR et EN), |
| `npm run check:clients-server` | Contrôle de la sécurité des clients dans le serveur df-api (module 1, étape M1.3), sans réseau. |
| `npm run check:missions-link` | Contrôle de M1.5 (missions liées aux clients), sans réseau : règles pures, store en démo, accord avec le serveur, rendu FR et EN, branchement des formulaires. |
| `npm run check:invoices-sql` | (plusieurs contrôles) |
| `npm run check:invoices-server` | Contrôle du serveur de facturation (M2.4), sans réseau : les vraies fonctions sont extraites de df-api/index.ts et comparées aux règles du site. |
| `npm run check:invoices` | Contrôle des règles de facturation (M2.3), sans réseau et sans écran. Lancer : npm run check:invoices |
| `npm run check:clients-page` | Essai de la page Clients (sans écran réel, sans réseau) : démo admin et opérateur, ajout / modification / archivage / suppression, FR et EN. |
| `npm run check:clients-demo` | Essai de la démo des clients (M1.7) : 6 fiches inventées avec tous les statuts, missions liées, opérateur sans rien voir, FR et EN, 0 appel réseau. |
| `npm run check:health` | Contrôle du moteur d'alertes (module 11, étape M11.2) : format, identifiants stables, doublons, tri, règle qui plante, états par page, Ignorer / Vérifié, seuils. |
| `npm run check:health-lot1` | Contrôle des règles du lot 1 du module 11 (Missions, Équipe, Paie) : cas normaux, seuils pile, minimum de données, pièges (dimanche, minuit, dates fausses), anglais, démo. |
| `npm run check:badges` | Contrôle des règles de performance des salariés (module 3, partie A) : score, badges, niveaux, échantillon minimum, tendance, employé du mois. |
| `npm run check:offline` | Contrôle des règles du mode hors ligne (module 13, M13.2), sans réseau. Lancer : npm run check:offline |
| `npm run check:offline-vault` | Contrôle de la copie locale chiffrée du mode hors ligne (module 13, M13.3), sans réseau. Lancer : npm run check:offline-vault |
| `npm run check:offline-sync` | Contrôle du pont magasin ↔ file d'actions hors ligne (module 13, M13.5), sans réseau. Lancer : npm run check:offline-sync |
| `npm run check:offline-store` | Contrôle du mode hors ligne branché sur le VRAI magasin de données (module 13, M13.5), sans réseau réel. |
| `npm run check:offline-shell` | Contrôle de « l'appli s'ouvre sans réseau » (module 13, M13.4), sans réseau. Lancer : npm run check:offline-shell (construit le site d'abord). |
| `npm run check:performance-export` | Contrôle de l'export des scores et des badges (module 3, M3.8), sans réseau. Lancer : npm run check:performance-export |
| `npm run check:recognition` | Contrôle de la reconnaissance (module 3, M3.7), sans réseau. Lancer : npm run check:recognition |
| `npm run check:client-badges` | Contrôle des badges et du score des clients (module 3, M3.5), sans réseau. |
| `npm run check:performance-config` | Contrôle des réglages de la performance (module 3, M3.4), sans réseau. |
| `npm run check:performance-page` | Essai des écrans « Scores et badges » (module 3, M3.3) : démo responsable et opérateur, vie privée (D8, D9), FR et EN, sans réseau. |
| `npm run check:health-lot2` | Contrôle des règles du lot 2 du module 11 (Finances, Clients, Stock). Pur, sans réseau. Lancer : npm run check:health-lot2 |
| `npm run check:health-lot3` | Contrôle des règles du lot 3 du module 11 (qualité des données, Conditions). Pur, sans réseau. Lancer : npm run check:health-lot3 |
| `npm run check:health-stats` | Contrôle de la détection statistique (module 11, M11.6) : médiane, minimum de périodes, seuils pile, proportion du mois, semaines. Pur. Lancer : npm run check:health-stats |
| `npm run check:health-system` | Contrôle des règles « Système » (M9.2 partie A) : sauvegarde de nuit et erreurs. Pur, sans réseau. Lancer : npm run check:health-system |
| `npm run check:health-ui` | Contrôle de l'assemblage « Santé du site » (M11.7) : toutes les règles ensemble, marques Ignorer/Vérifié, pastilles du menu, destinations. Pur. Lancer : npm run check:health-ui |
| `npm run check:site-map` | Contrôle de la carte du site (M11.8) : chaque page du menu a sa fiche, fiches complètes en FR et EN, réglages liés qui existent. Pur. Lancer : npm run check:site-map |
| `npm run check:site-snapshot` | Contrôle de l'instantané du site et de « Pourquoi ce chiffre ? » (M11.9). Pur, sans réseau. Lancer : npm run check:site-snapshot |
| `npm run check:health-suppliers` | Contrôle des règles Achats / Fournisseurs du module 11 (M11.12). Pur, sans réseau. Lancer : npm run check:health-suppliers |
| `npm run check:health-invoices` | Contrôle des règles Factures du module 11 (M11.12). Pur, sans réseau. Lancer : npm run check:health-invoices |
| `npm run check:health-accounting` | Contrôle des règles Comptabilité du module 11 (M14.9). Pur, sans réseau. Lancer : npm run check:health-accounting |
| `npm run check:health-management` | Contrôle des règles du module 15 dans la Santé du site (M15.8) : conflits de planning, paie et dépenses au-dessus du prévu. Pur, sans réseau. |
| `npm run check:reason-modal` | Contrôle de la fenêtre de validation / refus (ReasonModal) : un clic qui atterrit sur le fond ne doit pas la fermer quand l'appui |
| `npm run check:health-performance` | Contrôle de la règle Performance du module 11 (M11.12). Pur, sans réseau. Lancer : npm run check:health-performance |
| `npm run check:health-notif` | Contrôle des notifications de la cloche (M11.7 / M9.4) : règles pures + câblage. Lancer : npm run check:health-notif |
| `npm run check:watch-shared` | Contrôle des seuils de Surveillance PARTAGÉS (Conditions > Surveillance, M11.14 « Accord Surveillance »). Sans réseau. Lancer : npm run check:watch-shared |
| `npm run check:health-acks-shared` | Contrôle des marques « Ignorer / Vérifié » PARTAGÉES (M11.7 / « Accord Ignorer »). Sans réseau. Lancer : npm run check:health-acks-shared |
| `npm run check:speed` | Vitesse et quota (M8.3). 2 ans de données (≈17 500 missions, 10 000 lignes d'argent, 14 600 mouvements, 2 190 factures) : chaque calcul des écrans est chronométré, |
| `npm run check:assistant` | Contrôle de l'assistant niveau A (M11.10) : résumé du jour, quoi faire, récap d'un employé, « et si », compréhension des phrases. Pur, sans réseau. Lancer : npm run check:assistant |
| `npm run check:templates` | Contrôle des modèles de messages (M11.11). Pur. Lancer : npm run check:templates |
| `npm run check:recurring` | Contrôle des missions récurrentes (M15.1). Lancer : npm run check:recurring |
| `npm run check:approval-limit` | Contrôle de la validation à plusieurs niveaux (M15.6) : plafond du Chef d'équipe, copie serveur, garde-fous. Lancer : npm run check:approval-limit |
| `npm run check:auto-report` | Contrôle du rapport automatique (M15.5, règles pures). Lancer : npm run check:auto-report |
| `npm run check:auto-report-ui` | Essai du rapport automatique côté site, en mode démo (aucun réseau) : réglage, liste, ouverture, copie figée une seule fois, droits. |
| `npm run check:report-week` | Contrôle du rapport par SEMAINE (M15.5) : le mois reste comme avant. Lancer : npm run check:report-week |
| `npm run check:planning` | Contrôle du planning des équipes (M15.2). Lancer : npm run check:planning |
| `npm run check:team-goals` | Contrôle des objectifs par salarié et par équipe (M15.3). Lancer : npm run check:team-goals |
| `npm run check:budget-plan` | Contrôle du budget prévu contre réel (M15.4). Lancer : npm run check:budget-plan |
| `npm run check:budget-plan-page` | Essai de la carte « Prévu contre réel » (M15.4), sans écran réel et sans réseau : démo responsable et salarié, FR et EN, calculs, enregistrement. |
| `npm run check:team-goals-page` | Essai de l'onglet « Objectifs » (M15.3), sans écran réel et sans réseau : démo responsable et salarié, FR et EN, calculs, enregistrement. |
| `npm run check:planning-page` | Essai de l'onglet « Planning » (M15.2), sans écran réel et sans réseau : démo responsable et salarié, FR et EN, écriture des cases, conflits. |
| `npm run check:ai-assistant` | Contrôle de l'assistant IA externe (M11.13) : garde-fous purs, appel simulé (aucun vrai réseau), fonction serveur lue. Lancer : npm run check:ai-assistant |
| `npm run check:monitoring-final` | Contrôle final de la surveillance (M11.14) : réglages « Surveillance », alertes de la démo, vitesse avec 2 ans de données, opérateur sans accès, anglais. Lancer : npm run check:monitoring-final |
| `npm run check:cash` | Contrôle de la sécurité des finances dans le serveur df-api (sans réseau). |
| `npm run check:company` | Contrôle des Conditions de l'entreprise (module 0), sans réseau. |
| `npm run check:modules` | Contrôle de l'interrupteur de modules (pages cachées), sans réseau. |
| `npm run check:purchasing` | Contrôle des règles pures du module 4 (fournisseurs, bons de commande, réception, inventaire, budgets, statistiques), sans réseau. |
| `npm run check:purchasing-page` | Essai de la page Achats (sans écran réel, sans réseau) : démo admin et opérateur, fournisseurs, FR et EN. Complété à chaque étape du module 4. |
| `npm run check:demo-simple` | Démo simplifiée : en mode démo, on CACHE ce qui est inutile ou simulé (notifications téléphone, IA externe, sauvegardes, restauration, remise à zéro, |
| `npm run check:quotes-page` | Essai des devis (M2.9) sans écran réel ni réseau : démo, enregistrement, états, transformation en facture, écran FR et EN. |
| `npm run check:quotes` | Contrôle des DEVIS (module 2, M2.9), sans réseau : le serveur (bloc QUOTES de df-api/index.ts) est extrait et comparé aux règles du site (src/utils/quotes.ts). |
| `npm run check:purchasing-server` | Contrôle de la sécurité des fournisseurs, bons de commande et budgets dans le serveur df-api (module 4), sans réseau. |
| `npm run check:company-page` | Essai de l'écran des Conditions de l'entreprise (sans écran réel, sans réseau) : démo admin et opérateur, FR et EN. |
| `npm run check:finance` | Contrôle des règles de l'onglet Finances (sans réseau). Lancer : npm run check:finance |
| `npm run check:finance-stats` | Contrôle des chiffres financiers (sans réseau). Lancer : npm run check:finance-stats |
| `npm run check:stock` | Contrôle du stock (S3), sans réseau : règles du serveur (extraites du vrai fichier df-api), calculs, store en démo, démo cohérente, rendu FR/EN. |
| `npm run check:phase4` | Contrôle de la phase 4 (objectifs, alertes, prévision, export, rapport), sans réseau. Lancer : npm run check:phase4 |
| `npm run check:phase2` | Contrôle final de la phase 2 (finances), sans réseau. Lancer : npm run check:phase2 |
| `npm run check:finance-page` | Essai de l'onglet Finances (sans écran, sans réseau) : démo admin, ajout / modification / suppression, rendu FR et EN. |
| `npm run check:page` | Essai de rendu de la page Statistiques (sans écran) : démo admin, 4 périodes × 2 langues, aucune erreur ni « NaN ». |
| `npm run check:chart-scale` | Contrôle des calculs des graphiques (sans écran). Lancer : npm run check:chart-scale |
| `npm run check:charts` | Contrôle des graphiques : aucun ne doit casser (ni « NaN ») avec 0, 1 ou 365 données. |
| `npm run check:stats` | Contrôle des calculs de la page Statistiques (sans écran, sans serveur). |
| `npm run check:demo-stats` | Contrôle : les chiffres et graphiques des statistiques sont pleins avec les données de démonstration. |
| `npm run check:client-price` | Contrôle du prix client (sans écran, sans serveur). |
| `npm run check:deadlines` | Contrôle de la date limite et de la priorité (M6.1). Lancer : npm run check:deadlines |
| `npm run check:team-lead` | Contrôle du Chef d'équipe (M7.1 d) : équipe, droit de décision, décision sur une session (site = serveur), protections du serveur. Lancer : npm run check:team-lead |
| `npm run check:audit` | Contrôle du journal d'audit (M7.2) : règles du site, copie serveur identique, protections du serveur, migration. Lancer : npm run check:audit |
| `npm run check:login-guard` | Contrôle M16.3 : blocage après trop d'essais. Règles, copie serveur identique, série d'essais simulée, panne = on laisse passer. |
| `npm run check:totp` | Contrôle M16.4 (partie règles) : TOTP contre les vecteurs officiels RFC 6238, secours, copie serveur. Le branchement serveur est contrôlé plus bas (ajouté avec le bloc). |
| `npm run check:ui-fixes` | Contrôle des corrections du 2026-10-26 : commentaires visibles dans l'actualité, profil cliquable avec « Message », un seul œil sur les mots de passe, vacation à l'inscription, messagerie sans emoji. |
| `npm run check:admin-decide` | Contrôle : le responsable valide ou refuse une session par le SERVEUR (post-decide), une décision à la fois ; le mot facultatif est accepté et nettoyé. |
| `npm run check:message-links` | Contrôle M16.6 : numéros malgaches, liens WhatsApp et SMS, aucune injection, aucun appel réseau. |
| `npm run check:export` | Contrôle M16.5 : validation du fichier d'export, copie serveur identique, route backup-import (admin, jamais d'écrasement), écrans. |
| `npm run check:print-format` | Contrôle des règles d'impression (A4, Times New Roman, taille normale, coupure propre), sans écran ni réseau. Lancer : npm run check:print-format |
| `npm run check:xlsx-a4` | Contrôle des fichiers Excel A4 (Times New Roman 12, un autre fichier si c'est long), sans écran ni réseau. Lancer : npm run check:xlsx-a4 |
| `npm run check:totp-page` | Contrôle M16.4 (écrans) : la carte « Sécurité en deux étapes » ne montre rien tant que le serveur n'a pas dit « oui » et ne fait aucun appel pendant l'affichage ; le mode démo n'appelle jamais le serveur. |
| `npm run check:module3` | (plusieurs contrôles) |
| `npm run check:roles` | Contrôle des rôles (M7.1) : règles du site, copie serveur identique, protections du serveur. Lancer : npm run check:roles |
| `npm run check:backup-restore` | Contrôle M7.3 : restauration d'une sauvegarde (fonction SQL, route df-restore, écran). Lancer : npm run check:backup-restore |
| `npm run check:push` | Contrôle des notifications push (M6.4) : règles, chiffrement (exemple officiel RFC 8291), signature VAPID, copie serveur. Lancer : npm run check:push |
| `npm run check:push-store` | Essai des notifications côté site (store démo, carte Réglages, service worker, routes serveur), sans réseau. Lancer : npm run check:push-store |
| `npm run check:invoices-page` | Essai de l'écran Facturation côté site (store démo, sans réseau). Lancer : npm run check:invoices-page |
| `npm run check:invoice-doc` | Contrôle de la facture, de l'avoir et du reçu imprimables (M2.6). Lancer : npm run check:invoice-doc |
| `npm run check:receivables` | Contrôle des créances et relances (M2.7). Lancer : npm run check:receivables |
| `npm run check:invoice-stats` | Contrôle des chiffres de facturation dans Finances et dans le rapport (M2.8), sans réseau. Lancer : npm run check:invoice-stats |
| `npm run check:signup-setting` | Réglage « Inscriptions ouvertes / fermées » : le serveur refuse une nouvelle demande seulement si l'admin a mis `signup_open` à false. |
| `npm run check:tasks` | Contrôle de la liste de tâches d'une mission (M6.3) : règles du site et du serveur. Lancer : npm run check:tasks |
| `npm run check:tasks-store` | Essai de la liste de tâches côté site (store + écrans), sans réseau. Lancer : npm run check:tasks-store |
| `npm run check:templates-store` | Essai des modèles de mission côté site (store + écrans), sans réseau. Lancer : npm run check:templates-store |
| `npm run check:deadlines-store` | Essai de la date limite et de la priorité côté site (store + pastille + champs), sans réseau. Lancer : npm run check:deadlines-store |
<!-- /AUTO:checks -->

---

## 8. Problèmes rencontrés et leurs solutions

| Problème | Solution retenue |
|---|---|
| Les fichiers Excel doivent aussi être en A4, Times New Roman 12, sans rétrécir, et un autre fichier si c'est long (règle de BTK) | Tout passe par `src/utils/xlsxA4.ts` (bibliothèque `exceljs`, chargée au clic ; `xlsx` ne sert plus qu'à lire les fichiers importés). Police Times New Roman 12 dans chaque case, page A4 à 100 % (jamais « ajuster à une page »), portrait ou paysage selon la largeur, marges normales, en-tête répété à chaque page, numéro de page. Au-delà de 500 lignes dans un fichier (`EXCEL_MAX_ROWS`), le site fait `nom-partie-1.xlsx`, `nom-partie-2.xlsx`… avec l'en-tête répété. Contrôle : `npm run check:xlsx-a4`. |
| Les PDF et les pages imprimables doivent être en A4, Times New Roman, taille normale, sans texte rétréci (règle de BTK) | Règle commune dans `src/utils/printFormat.ts` : page dessinée à 180 mm de large (marges de 15 mm), texte à 12 pt, coupure de page entre deux lignes ou deux blocs (jamais au milieu d'une ligne). Quand la machine n'a pas Times New Roman (téléphones), la police Tinos (mêmes largeurs de lettres), livrée dans `public/fonts`, la remplace. Contrôle : `npm run check:print-format`. |
| Le serveur en ligne ne change pas quand on modifie le fichier dans GitHub | Redéployer à chaque fois (§7). Comparer le fichier en ligne au dépôt avant de déployer. |
| `index.ts` du serveur trop gros pour être recopié (plus de 230 Ko) | Fichier d'une ligne qui importe le dépôt à un commit précis. Le retour en arrière est le commit précédent. |
| Le site et le serveur doivent appliquer **exactement** les mêmes règles | Le code est écrit une fois, copié dans un bloc délimité du serveur, et un contrôle compare les deux textes. |
| Un salarié ne doit jamais recevoir certaines données | Le serveur filtre à la lecture (`state`) et retire les champs privés (`stripUser`, champ `improvements` des évaluations). Un test échoue si la protection disparaît. |
| Un vieux navigateur renvoie une fiche sans un champ récent et l'efface | Le serveur garde l'ancien champ quand il n'est pas envoyé (ex. dossier `hr`). |
| Valider une mission fige la paie et le prix client, que le Chef d'équipe ne doit pas voir | Le calcul est fait **par le serveur** (bloc `DECIDE`), jamais dans le navigateur du Chef d'équipe. |
| Plusieurs sessions d'IA travaillent en même temps | Marquer l'étape « PRIS » dans `TODO_MODULES.md` avant de commencer, faire `git pull --rebase` avant chaque push. Les conflits arrivent surtout dans `TODO_MODULES.md`, `src/db/store.ts`, `src/demo/demoData.ts`, `src/utils/healthDb.ts` : garder les deux côtés. |
| Une alerte de la Santé du site sans solution écrite | `check:assistant` échoue : ajouter la phrase dans `src/utils/advice.ts` (une entrée par nom d'alerte). |
| Une fiche de la carte du site trop longue ou incomplète | `check:site-map` échoue (3 lignes de mode d'emploi, longueurs maximales, anglais sans français). |
| `HANDOVER.md` parle encore du chinois | Cette partie est périmée : se fier à ce guide et à `PROJET.md`. |
| Tests de dates faux la nuit | Lancer les contrôles avec `TZ=Indian/Antananarivo` (jour de Madagascar). |
| Quota gratuit Supabase (≈ 500 000 appels par mois) | Calculs faits dans le navigateur de l'admin, pas de nouvel appel en boucle, synchro toutes les 20 s seulement. |
| Fenêtre plein écran qui se coupe dans une page `fixed` | Toujours `createPortal(…, document.body)`. |
| Page qui défile derrière une fenêtre | Jamais `document.body.style.overflow` à la main : utiliser `useLockBodyScroll`. |
| Numéros de facture en double | Attribués par des fonctions SQL du serveur, jamais par le navigateur ; une facture émise ne se supprime pas (avoir). |
| Écrire sur GitHub | Avec `git` et le token de BTK passé à la commande seulement (jamais dans un fichier ni dans l'adresse du dépôt) ; le connecteur GitHub ne sert qu'à lire. |
| Le plan Vercel gratuit interdit l'usage commercial | Voir §9 : à régler avant de vendre. |

---

## 9. Limites connues et ce qui n'est PAS vérifié

**Pas testé par BTK sur un vrai téléphone, avec de vraies données** : la plupart des écrans récents (RH, Direction, Mes tableaux, évaluations, congés). Les contrôles automatiques passent, mais aucun ne remplace un essai à l'écran, en clair et sombre, en français et en anglais.

**À valider par un professionnel** : le bulletin de paie (CNaPS, OSTIE, IRSA) et les factures (mentions légales, TVA) : le plan lui-même demande la relecture d'un comptable.

**Excel A4 : pas encore ouvert dans le vrai Excel ni imprimé.** Les contrôles relisent le fichier fabriqué (police, A4, marges, en-têtes, coupure en parties) mais seul un essai avec Excel ou LibreOffice, puis l'aperçu avant impression, le confirme. Si plusieurs fichiers sont faits, le navigateur peut demander d'autoriser les téléchargements multiples (une seule fois). La « Sauvegarde Excel » de beaucoup de messages donne donc plusieurs fichiers ; la vraie sauvegarde complète reste le fichier JSON. Une page imprimée plus large que l'A4 continue sur la page suivante, à la même taille.

**PDF : pas encore essayé sur un vrai téléphone ni à l'impression.** Le PDF reste une image de la page (le texte ne se sélectionne pas). Les contrôles automatiques vérifient les règles (A4, 12 pt, police, coupure de page), mais pas le rendu réel : à regarder à l'écran avec un bulletin, une facture et un rapport longs.

**Ce que le site ne fait pas (confirmé le 2026-10-24)** :
- Comptabilité (M14, code fait, **à valider par un expert-comptable**) : plan comptable minimal de 20 comptes, journal, grand livre, balance, résultat, bilan, TVA mois par mois, clôture, rapprochement et export. Limites : la TVA déductible vient d'écritures saisies à la main (les dépenses n'ont pas de champ TVA) ; le site ne garde pas « TVA déclarée » (un mois clos n'est plus signalé) ; la date limite légale de la TVA n'est pas codée.
- Missions récurrentes (M15.1, code fait) et planning des équipes (M15.2, fait) existent ; pas encore de rapport automatique, de validation à plusieurs niveaux ni de plusieurs sites.
- Import Excel ou CSV (M16.1) : clients, produits, salariés et tableaux libres, avec aperçu avant écriture. Pas encore : factures, missions, quantités de stock (à ajouter par des entrées).
- Pas de mode sans internet **pour l'instant** : c'est le module M13 (en cours, par une autre session ; règles et copie locale chiffrée déjà écrites, rien n'est branché dans les écrans).
- Double étape (2FA, M16.4) : facultative, seulement pour le responsable et le Comptable, par application d'authentification (pas de SMS, pas de clé physique). Le secret est gardé côté serveur, au même niveau que les mots de passe. Après 5 mots de passe ou codes ratés sur un compte (20 depuis une adresse), délai croissant de 1 à 30 minutes (5 minutes au plus pour le responsable), jamais définitif (M16.3). Si le responsable perd son téléphone ET ses codes de secours : une ligne SQL dans Supabase (écrite dans la migration `20261025_create_df_totp.sql`).
- Pas de plusieurs entreprises sur le même site (étude M17 proposée).
- WhatsApp et SMS (M16.6) : seulement des **liens** qui ouvrent le message de relance déjà écrit ; la personne appuie sur « envoyer ». Pas d'envoi automatique (il demande un service payant et une clé, à décider par BTK). L'adresse e-mail d'un client ouvre seulement le logiciel de mail.
- Export complet (M16.5) : le fichier contient les mots de passe chiffrés et les secrets de double étape : à garder comme un mot de passe. Un fichier importé s'ajoute aux sauvegardes (gardé 14 jours) ; le remettre en service passe par « Restaurer » avec ses protections. Les photos et fichiers ne sont pas dans le fichier (ils restent sur Cloudinary).
- Pas d'envoi automatique du rapport mensuel (Excel et PDF à la demande).
- Le Comptable n'a pas accès aux statistiques ni aux dépenses.
- L'historique de tarifs d'un salarié (dossier) est **informatif** : la paie utilise les tarifs globaux des réglages.
- Le Chef d'équipe ne décide pas des congés (seul le responsable).

**Avant de vendre le site** : le plan gratuit de Vercel n'autorise pas l'usage commercial (plan payant : environ 20 $ par mois), et la base payante de Supabase coûte de l'ordre de 25 $ par mois (à vérifier). Un site = une entreprise : chaque client demande donc son propre hébergement. Vérifier aussi les licences du code et des bibliothèques utilisées.

---

## 10. Feuille de route

**Reste du plan en cours** : M8.2 (essai complet par BTK), M8.3 (vitesse avec 2 ans de données), M8.4 (documents et nettoyage), M12.6 (essai de « Mes tableaux »), M11.13 (IA externe, attend la clé et l'accord de BTK).

**En cours par une autre session** : **M13 Mode hors ligne** (travailler sans connexion, tout part au retour du réseau) : règles `src/utils/offline.ts`, copie locale chiffrée `src/utils/offlineVault.ts`, **pas encore branchés** (service worker, file d'attente, écrans et serveur restent à faire). Voir `TODO_MODULES.md`.

**Nouveaux modules proposés** (détail et étapes dans `TODO_MODULES.md`, chacun commence par « GO Mx » de BTK ; rien n'est codé) :
- **M14 Comptabilité complète** : plan comptable malgache, journaux, écritures automatiques depuis factures, paiements, dépenses et paie, grand livre, balance, résultat, bilan, TVA collectée et déclaration, clôture, rapprochement bancaire et Mobile Money, export pour le comptable. Valider avec un expert-comptable. Accès du Comptable aux dépenses et finances à régler ici.
- **M15 Management complet** : planning des équipes, missions récurrentes, objectifs par salarié et par équipe, budget prévu contre réel, rapport envoyé automatiquement, chaîne de validation à plusieurs niveaux, plusieurs sites.
- **M16 Facilité et sécurité** : import Excel, visite guidée, blocage après trop d'essais, double vérification, export complet des données, rappels WhatsApp ou SMS (le mode sans internet est M13).
- **M17 Plusieurs entreprises sur le même site** : étude d'abord (touche toutes les tables et tous les droits).

**Décisions de BTK en attente** : accès du Comptable aux statistiques et aux dépenses ; noms envoyés ou non à l'IA externe ; « Facturé » comme total des factures émises. (Déjà faits : seuils de surveillance et marques « Ignorer / Vérifié » partagés entre appareils, serveur v27 et v28.)
