// Carte du site (module 11, M11.8) : pour CHAQUE page du menu, à quoi elle sert, comment l'utiliser, ses règles et ses chiffres avec leur formule. FR et EN.
// Sert de base à l'assistant (M11.10) et à « Pourquoi ce chiffre ? » (M11.9). Pur, sans écran, sans serveur.
// Règle d'or : on n'écrit ici que ce que le code fait vraiment (formules relues dans src/utils/*.ts et supabase/functions/df-api). Une formule change = cette fiche change.
// `npm run check:site-map` échoue si une page du menu n'a pas sa fiche, si une fiche est incomplète, ou si l'anglais contient du français.

export type Audience = 'admin' | 'employee' | 'both';
export interface Bi { fr: string; en: string }
export interface SiteFigure { name: Bi; formula: Bi }
export interface SitePage {
  id: string; // identifiant du menu (voir Sidebar)
  audience: Audience;
  title: Bi;
  purpose: Bi;
  howto: [Bi, Bi, Bi]; // le mode d'emploi en 3 lignes
  rules: Bi[]; // règles du site qui touchent cette page
  conditions?: string[]; // réglages de la page Conditions liés, au format « section.clé » (contrôlé contre companyRules)
  figures: SiteFigure[];
}
const b = (fr: string, en: string): Bi => ({ fr, en });

export const SITE_MAP: SitePage[] = [
  {
    id: 'feed', audience: 'both', title: b('Actualités', 'News'),
    purpose: b('Les annonces de l\'équipe : ce qu\'il faut savoir avant de travailler.', 'Team announcements: what to know before working.'),
    howto: [b('Lire les publications, les plus récentes en premier.', 'Read the posts, newest first.'), b('Un employé peut proposer une publication.', 'An employee can propose a post.'), b('L\'admin accepte ou refuse, avec un motif.', 'The admin accepts or refuses, with a reason.')],
    rules: [b('Une publication d\'employé n\'est visible de tous qu\'après acceptation par l\'admin.', 'An employee post is visible to everyone only after admin approval.'), b('Les derniers commentaires se voient sous la publication ; « Répondre » répond à un commentaire (comme Facebook) ; toucher un nom ouvre son profil, avec « Message ».', 'The latest comments show under the post; "Reply" answers a comment (like Facebook); tap a name to open the profile, with "Message".')],
    figures: [],
  },
  {
    id: 'dashboard', audience: 'admin', title: b('Tableau de bord', 'Dashboard'),
    purpose: b('Le point d\'entrée de l\'admin : missions du moment, alertes d\'argent et de stock, objectifs du mois.', 'The admin\'s entry point: current missions, money and stock alerts, monthly goals.'),
    howto: [b('Regarder les alertes en haut et cliquer pour ouvrir la bonne page.', 'Check the alerts at the top and click to open the right page.'), b('Suivre les barres d\'objectifs du mois.', 'Follow the monthly goal bars.'), b('Gérer les missions du tableau (créer, modifier, relier à un client).', 'Manage the board missions (create, edit, link to a client).')],
    rules: [b('Les objectifs d\'argent ne sont jamais envoyés aux employés.', 'Money goals are never sent to employees.'), b('Les objectifs se règlent dans Réglages (missions, bénéfice, plafond de dépenses).', 'Goals are set in Settings (missions, profit, expense cap).')],
    conditions: ['options.mission_requires_client'],
    figures: [{ name: b('Objectif du mois', 'Monthly goal'), formula: b('Chiffre du mois (du 1er au dernier jour) comparé à l\'objectif réglé : missions validées, bénéfice, dépenses.', 'Month figure (1st to last day) compared with the set goal: validated missions, profit, expenses.') }],
  },
  {
    id: 'validations', audience: 'admin', title: b('Validations', 'Validations'),
    purpose: b('Tout ce que l\'admin doit accepter ou refuser : débuts et fins de mission, avances, inscriptions, réinitialisations de mot de passe, changements de profil.', 'Everything the admin must accept or refuse: mission starts and ends, advances, sign-ups, password resets, profile changes.'),
    howto: [b('Ouvrir une demande et regarder les preuves.', 'Open a request and look at the proofs.'), b('Accepter, ou refuser en donnant un motif.', 'Accept, or refuse with a reason.'), b('La pastille du menu tombe à zéro quand tout est traité.', 'The menu badge drops to zero when everything is handled.')],
    rules: [b('Un refus demande un motif si le réglage « motif de refus obligatoire » est activé.', 'A refusal needs a reason when the "refusal reason required" setting is on.'), b('Le prix de la mission est figé au moment de la validation.', 'The mission price is frozen at validation time.'), b('La Santé du site signale une mission en attente depuis plus de 24 h (réglable).', 'Site health flags a mission waiting more than 24 h (adjustable).')],
    conditions: ['missions.validation_hours', 'missions.refusal_reason_required'],
    figures: [{ name: b('Pastille Validations', 'Validations badge'), formula: b('Débuts à valider + fins à valider + avances en attente + inscriptions + réinitialisations + demandes de profil.', 'Starts to validate + ends to validate + pending advances + sign-ups + resets + profile requests.') }],
  },
  {
    id: 'history', audience: 'admin', title: b('Historique', 'History'),
    purpose: b('Toutes les missions passées, avec de quoi les retrouver.', 'All past missions, with ways to find them.'),
    howto: [b('Filtrer la liste pour retrouver une mission.', 'Filter the list to find a mission.'), b('Afficher plus de lignes (50 de plus à chaque fois).', 'Show more rows (50 more each time).'), b('Ouvrir une mission pour voir son détail.', 'Open a mission to see its details.')],
    rules: [b('L\'histoire d\'un client reste figée quand une mission change de client.', 'A client\'s history stays frozen when a mission changes client.')],
    figures: [],
  },
  {
    id: 'clients', audience: 'admin', title: b('Clients', 'Clients'),
    purpose: b('Les fiches clients, leur statut calculé, leur tarif et leur chiffre d\'affaires.', 'Client records, their computed status, price and revenue.'),
    howto: [b('Créer une fiche (nom, contact, tarif facultatif).', 'Create a record (name, contact, optional price).'), b('Rattacher les anciennes missions avec l\'outil « Missions à rattacher ».', 'Link old missions with the "Missions to link" tool.'), b('Archiver un client plutôt que le supprimer s\'il a des missions.', 'Archive a client instead of deleting it if it has missions.')],
    rules: [b('Le statut n\'est jamais saisi : il se calcule avec les missions validées.', 'The status is never typed: it is computed from validated missions.'), b('Un client qui a des missions n\'est jamais supprimé, seulement archivé.', 'A client with missions is never deleted, only archived.'), b('Les clients sont visibles de l\'admin seulement.', 'Clients are visible to the admin only.'), b("Import Excel ou CSV : aperçu ligne par ligne, rien n'est écrit avant « Importer » ; les noms déjà présents sont ignorés.", 'Excel or CSV import: row-by-row preview, nothing is saved before “Import”; names already there are skipped.')],
    conditions: ['clients.new_days', 'clients.regular_missions', 'clients.regular_months', 'clients.strategic_top_pct', 'clients.strategic_months', 'clients.strategic_min_missions', 'clients.inactive_days', 'options.mission_requires_client'],
    figures: [
      { name: b('Prospect', 'Prospect'), formula: b('Aucune mission validée.', 'No validated mission.') },
      { name: b('Nouveau', 'New'), formula: b('Première mission il y a moins de N jours (60 par défaut).', 'First mission less than N days ago (60 by default).') },
      { name: b('Régulier', 'Regular'), formula: b('Au moins N missions validées sur les M derniers mois (3 sur 6 par défaut).', 'At least N validated missions in the last M months (3 in 6 by default).') },
      { name: b('Stratégique', 'Strategic'), formula: b('Parmi les P % premiers du chiffre d\'affaires des M derniers mois (20 % sur 12 par défaut), avec au moins N missions (5 par défaut).', 'Among the top P % of revenue over the last M months (20 % over 12 by default), with at least N missions (5 by default).') },
      { name: b('Inactif', 'Inactive'), formula: b('Aucune mission depuis N jours ou plus (90 par défaut).', 'No mission for N days or more (90 by default).') },
      { name: b('Prix d\'une mission', 'Mission price'), formula: b('1) prix de la mission, 2) prix du client pour ce type, 3) prix par défaut du client, 4) prix du type (Réglages), 5) prix par défaut (Réglages). Un prix à 0 est un vrai prix (mission offerte).', '1) the mission price, 2) the client\'s price for that type, 3) the client\'s default price, 4) the type price (Settings), 5) the default price (Settings). A price of 0 is a real price (free mission).') },
    ],
  },
  {
    id: 'invoices', audience: 'admin', title: b('Facturation', 'Invoicing'),
    purpose: b('Faire les factures des clients, enregistrer les paiements et annuler une facture par un avoir.', 'Make client invoices, record payments and cancel an invoice with a credit note.'),
    howto: [b('Nouvelle facture : choisir le client, cocher ses missions validées, enregistrer le brouillon.', 'New invoice: choose the client, tick its approved missions, save the draft.'), b('Émettre : le numéro est attribué par le serveur et devient définitif.', 'Issue: the number is assigned by the server and becomes final.'), b('Enregistrer chaque paiement reçu ; annuler par un avoir si la facture est fausse.', 'Record each payment received; cancel with a credit note if the invoice is wrong.')],
    rules: [b('Devis (si « Devis activés » est coché dans Conditions) : Brouillon, Envoyé, Accepté ou Refusé ; un devis accepté devient une facture brouillon en un clic.', 'Quotes (if “Quotes enabled” is ticked in Conditions): Draft, Sent, Accepted or Refused; an accepted quote becomes a draft invoice in one click.'), b('Un brouillon n\'a pas de numéro ; une facture émise ne se modifie ni ne se supprime.', 'A draft has no number; an issued invoice can be neither edited nor deleted.'), b('Un paiement ne dépasse jamais ce qui reste à payer.', 'A payment never exceeds what is left to pay.'), b('Une mission ne peut être que dans une seule facture non annulée.', 'A mission can only be on one non-cancelled invoice.'), b('Relance : « Envoyer par WhatsApp » ou « par SMS » ouvre le message déjà écrit ; tu appuies sur « envoyer » (rien ne part tout seul).', 'Chasing: "Send by WhatsApp" or "by SMS" opens the message already written; you press "send" (nothing is sent automatically).')],
    conditions: ['billing.invoice_prefix', 'billing.receipt_prefix', 'billing.payment_days', 'tax.vat_enabled', 'tax.vat_rate'],
    figures: [
      { name: b('Total d\'une ligne', 'Line total'), formula: b('Quantité × prix unitaire, arrondi à l\'Ar.', 'Quantity × unit price, rounded to the Ar.') },
      { name: b('TVA', 'VAT'), formula: b('Sous-total × taux ÷ 100, arrondie une seule fois à l\'Ar ; 0 si la TVA est désactivée.', 'Subtotal × rate ÷ 100, rounded once to the Ar; 0 if VAT is off.') },
      { name: b('En retard', 'Overdue'), formula: b('Échéance dépassée et reste à payer. Jamais pour un avoir.', 'Due date passed and an amount left to pay. Never for a credit note.') },
    ],
  },
  {
    id: 'purchasing', audience: 'admin', title: b('Achats', 'Purchasing'),
    purpose: b('Garder la liste de tes fournisseurs, faire des bons de commande, les recevoir dans le stock et compter ton stock.', 'Keep your suppliers list, make purchase orders, receive them into stock and count your stock.'),
    howto: [b('Nouveau fournisseur : nom, contact, délai habituel de livraison.', 'New supplier: name, contact, usual delivery time.'), b('Bon de commande : Brouillon, Commander, puis Recevoir (en une ou plusieurs fois).', 'Purchase order: Draft, Place order, then Receive (in one or several steps).'), b('Inventaire : écris ce que tu as compté, puis Ajuster.', 'Inventory: enter what you counted, then Adjust.')],
    rules: [b('Recevoir crée les entrées de stock et UNE dépense « Achats », après confirmation.', 'Receiving creates the stock entries and ONE “Achats” expense, after confirmation.'), b('Un bon reçu ou annulé est définitif ; un bon déjà en partie reçu ne s\'annule plus.', 'A received or cancelled order is final; a partly received order can no longer be cancelled.'), b('Un fournisseur qui a servi ne se supprime pas : on l\'archive.', 'A supplier that has been used is never deleted: it is archived.'), b('Le stock n\'est jamais saisi à la main : l\'inventaire crée des ajustements.', 'Stock is never typed by hand: the inventory creates adjustments.'), b('Budgets (dans Finances) : attention à 80 % du plafond du mois, dépassé au-dessus de 100 %.', 'Budgets (in Finance): warning at 80% of the month cap, exceeded above 100%.')],
    conditions: [],
    figures: [],
  },
  {
    id: 'performance', audience: 'admin', title: b('Performance', 'Performance'),
    purpose: b('Comment chaque salarié travaille : missions faites, refusées, délais, puis un score sur 100 et des badges calculés.', 'How each employee works: missions done, refused, timing, then a score out of 100 and calculated badges.'),
    howto: [b('Onglet Tableau : choisir la période (7 jours, 30 jours, tout) et exporter en Excel ou en CSV.', 'Table tab: pick the period (7 days, 30 days, all) and export to Excel or CSV.'), b('Onglet Scores et badges : le classement des 30 derniers jours ; toucher un salarié ouvre sa fiche.', 'Scores and badges tab: the ranking of the last 30 days; tap an employee to open the sheet.'), b('Lire le « pourquoi » de chaque score et de chaque badge avant de juger.', 'Read the “why” of each score and badge before judging.')],
    rules: [b('Ce sont des indicateurs, pas des sanctions : le contexte reste à l\'admin.', 'These are indicators, not penalties: context stays with the admin.'), b('Rien n\'est saisi à la main : scores et badges sont calculés, aucun badge n\'est donné par faveur.', 'Nothing is typed by hand: scores and badges are calculated, no badge is given as a favour.'), b('Sous 10 missions jugées sur 30 jours, aucun score n\'est affiché ; le badge Qualité demande 20 missions.', 'Under 10 judged missions in 30 days no score is shown; the Quality badge needs 20 missions.'), b('Un salarié ne voit que son propre score et ses propres badges, jamais le classement ni les points d\'attention (sauf choix contraire dans Conditions).', 'An employee only sees their own score and badges, never the ranking or the points of attention (unless you choose otherwise in Conditions).')],
    conditions: ['options.badges_enabled', 'options.employee_sees_badges', 'options.employee_sees_attention', 'leave.late_limit_time', 'leave.work_days_per_week'],
    figures: [
      { name: b('Taux d\'acceptation', 'Acceptance rate'), formula: b('Missions validées ÷ (validées + refusées), en %. Vide s\'il n\'y a aucune mission jugée.', 'Validated missions ÷ (validated + refused), in %. Empty if no mission was judged.') },
      { name: b('Délai moyen', 'Average time'), formula: b('Moyenne des durées des missions (début à fin, passage de minuit compris).', 'Average mission duration (start to end, midnight crossing included).') },
      { name: b('Score de performance', 'Performance score'), formula: b('Sur 30 jours : qualité 40 % (missions validées ÷ jugées), volume 25 % (missions ÷ moyenne de l\'équipe), ponctualité 20 % (jours sans retard), régularité 15 % (jours actifs ÷ jours attendus). Une partie impossible à calculer est retirée et les autres poids sont recalculés à 100 %.', 'Over 30 days: quality 40 % (approved ÷ judged missions), volume 25 % (missions ÷ team average), punctuality 20 % (days without delay), consistency 15 % (active days ÷ expected days). A part that cannot be calculated is dropped and the other weights are recalculated to 100 %.') },
      { name: b('Badges', 'Badges'), formula: b('Qualité, Ponctualité, Régularité, Rendement, Polyvalence (niveaux Bronze, Argent, Or) et Recrue prometteuse : chacun a un seuil, et la fiche dit pourquoi il est obtenu et ce qui manque pour le niveau suivant.', 'Quality, Punctuality, Consistency, Efficiency, Versatility (Bronze, Silver, Gold levels) and Promising rookie: each has a threshold, and the sheet says why it is earned and what is missing for the next level.') },
      { name: b('Employé du mois', 'Employee of the month'), formula: b('Meilleur score du mois civil, à partir de 5 salariés actifs et avec assez de missions jugées ; ex æquo : tous sont cités.', 'Best score of the calendar month, from 5 active employees and with enough judged missions; ties: everyone is named.') },
    ],
  },
  {
    id: 'my-performance', audience: 'employee', title: b('Ma performance', 'My performance'),
    purpose: b('Ton score sur 100 et tes badges, avec le pourquoi, pour voir où tu en es.', 'Your score out of 100 and your badges, with the why, to see where you stand.'),
    howto: [b('Lire ton score sur 100 et la période qu\'il couvre.', 'Read your score out of 100 and the period it covers.'), b('Regarder tes badges et ce qui manque pour le niveau suivant.', 'Look at your badges and what is missing for the next level.'), b('Comparer avec les périodes d\'avant dans « Tendance ».', 'Compare with earlier periods in “Trend”.')],
    rules: [b('Tu ne vois que ton score et tes badges : jamais ceux des autres, jamais de classement.', 'You only see your own score and badges: never anyone else\'s, never a ranking.'), b('Tout est calculé sur tes missions, rien n\'est donné à la main.', 'Everything is calculated from your missions, nothing is given by hand.'), b('Sous 10 missions jugées sur 30 jours, aucun score n\'est affiché.', 'Under 10 judged missions in 30 days, no score is shown.')],
    conditions: ['options.badges_enabled', 'options.employee_sees_badges', 'options.employee_sees_attention'],
    figures: [
      { name: b('Score de performance', 'Performance score'), formula: b('Sur 30 jours : qualité 40 %, volume 25 %, ponctualité 20 %, régularité 15 %. Une partie impossible à calculer est retirée et les autres poids sont recalculés à 100 %.', 'Over 30 days: quality 40 %, volume 25 %, punctuality 20 %, consistency 15 %. A part that cannot be calculated is dropped and the other weights are recalculated to 100 %.') },
    ],
  },
  {
    id: 'sheets', audience: 'both', title: b('Mes tableaux', 'My tables'),
    purpose: b('Entrer et suivre tes données comme dans Excel, puis les télécharger en Excel, Word ou PDF.', 'Enter and track your data like in Excel, then download it as Excel, Word or PDF.'),
    howto: [b('Choisir un modèle (vide, saisie de fiches, suivi de tâches) puis ajouter lignes et colonnes.', 'Pick a template (blank, record entry, task tracking) then add rows and columns.'), b('Écrire une formule avec « = », par exemple =SOMME(B1:B10).', 'Write a formula with “=”, for example =SUM(B1:B10).'), b('Cliquer sur Télécharger pour Excel, Word ou PDF.', 'Click Download for Excel, Word or PDF.')],
    rules: [b('Ce que tu supprimes va à la corbeille 30 jours : tu peux le restaurer.', 'What you delete goes to the trash for 30 days: you can restore it.'), b('Limites : 20 tableaux, 200 colonnes, 5 000 lignes.', 'Limits: 20 tables, 200 columns, 5,000 rows.'), b('Une formule en erreur montre #DIV/0!, #REF! ou #NAME? sans rien casser.', 'A formula in error shows #DIV/0!, #REF! or #NAME? without breaking anything.'), b('Le responsable lit les tableaux de l\'équipe sans pouvoir les modifier.', 'The manager reads the team\'s tables without being able to change them.'), b('Importer un fichier Excel ou CSV crée un nouveau tableau (aperçu avant création) : colonnes nombre et date devinées, 5 000 lignes au plus.', 'Importing an Excel or CSV file creates a new table (preview first): number and date columns are guessed, 5,000 rows at most.')],
    figures: [
      { name: b('Formules', 'Formulas'), formula: b('SOMME, MOYENNE, MIN, MAX, NB, SI, ET, OU, ARRONDI, RECHERCHEV, SOMME.SI, NB.SI, AUJOURDHUI, JOURS, CONCAT, GAUCHE, DROITE et autres, en français ou en anglais.', 'SUM, AVERAGE, MIN, MAX, COUNT, IF, AND, OR, ROUND, VLOOKUP, SUMIF, COUNTIF, TODAY, DAYS, CONCAT, LEFT, RIGHT and others, in French or English.') },
    ],
  },
  {
    id: 'storage', audience: 'admin', title: b('Stockage', 'Storage'),
    purpose: b('Voir l\'essentiel au Tableau de bord, puis gérer tes produits : entrer le stock, chercher un produit, ajouter sa photo.', 'See the essentials on the Dashboard, then manage your products: enter stock, find a product, add its photo.'),
    howto: [b('Tableau de bord : chiffres clés, alertes, rupture proche ; toucher Épuisés ou Stock bas ouvre la liste.', 'Dashboard: key figures, alerts, running out soon; tapping Out of stock or Low stock opens the list.'), b('Produits : nouveau produit = nom + quantité de départ ; chercher, filtrer, −1 / +1 ou Entrée / Sortie.', 'Products: new product = name + starting quantity; search, filter, −1 / +1 or Entry / Exit.'), b('Mouvements : tout l\'historique filtré. Analyses : graphiques (valeur, plus utilisés, fournisseurs, achats chers) par période.', 'Movements: the filtered history. Analytics: charts (value, most used, suppliers, costly purchases) by period.')],
    rules: [b('Stockage est réservé à l\'admin : le serveur refuse tout autre accès.', 'Storage is admin-only: the server refuses any other access.'), b('La quantité en stock n\'est jamais saisie : elle se calcule avec les mouvements.', 'Stock quantity is never typed: it is computed from movements.'), b('Import Excel ou CSV des produits (nom, prix, seuil) ; les quantités ne s\'importent pas, on les ajoute par des entrées.', 'Excel or CSV import of products (name, prices, threshold); quantities are not imported, add them with stock entries.'), b('La photo d\'un produit est envoyée sur Cloudinary ; le serveur n\'accepte que les adresses du site.', 'A product photo is sent to Cloudinary; the server only accepts the site\'s own addresses.')],
    figures: [
      { name: b('Valeur du stock', 'Stock value'), formula: b('Pour chaque produit : quantité (jamais négative) × prix d\'achat ; puis la somme.', 'For each product: quantity (never negative) × purchase price; then the sum.') },
      { name: b('Quantité en stock', 'Stock quantity'), formula: b('Entrées − sorties ± ajustements.', 'Entries − exits ± adjustments.') },
    ],
  },
  {
    id: 'stats', audience: 'admin', title: b('Statistiques', 'Statistics'),
    purpose: b('Les chiffres de l\'entreprise : missions, finances et rapport du mois.', 'The company figures: missions, finance and the monthly report.'),
    howto: [b('Choisir l\'onglet (Statistiques, Finances, Rapport) puis la période.', 'Pick the tab (Statistics, Finance, Report) then the period.'), b('Saisir les entrées et dépenses dans l\'onglet Finances.', 'Enter income and expenses in the Finance tab.'), b('Lire le rapport du mois dans l\'onglet Rapport.', 'Read the monthly report in the Report tab.')],
    rules: [b('Finances est réservé à l\'admin : le serveur refuse tout autre accès.', 'Finance is admin-only: the server refuses any other access.'), b('Les avances sont déjà dans les salaires : elles ne sont pas comptées deux fois.', 'Advances are already inside salaries: they are not counted twice.'), b('Prévu contre réel (Finances, 6 mois) : dépenses prévues = total des budgets par catégorie ; revenus et paie prévus = deux montants mensuels du responsable ; le réel est calculé, jamais saisi.', 'Planned vs actual (Finance, 6 months): planned expenses = total of the category budgets; planned revenue and payroll = two monthly amounts set by the manager; the actual is computed, never typed.'), b('Rapport automatique : arrêté, chaque semaine ou chaque mois, à une heure de Madagascar ; le serveur crée la fiche de la période finie et prévient. Aucun e-mail.', 'Automatic report: off, every week or every month, at a Madagascar time; the server creates the record for the finished period and notifies. No e-mail.'), b('La copie figée du rapport est posée une seule fois, à la première ouverture. Une période manquée (serveur arrêté plus de 2 h) n\'est pas rattrapée.', 'The frozen copy of the report is set once, at the first opening. A missed period (server stopped for over 2 hours) is not made up.')],
    figures: [
      { name: b('Facturé', 'Billed'), formula: b('Missions validées × prix client.', 'Validated missions × client price.') },
      { name: b('Encaissé', 'Collected'), formula: b('Somme des paiements reçus.', 'Sum of payments received.') },
      { name: b('À encaisser', 'To collect'), formula: b('Facturé − encaissé (jamais négatif).', 'Billed − collected (never negative).') },
      { name: b('Dépenses', 'Expenses'), formula: b('Dépenses saisies + salaires (les avances sont déjà dans les salaires).', 'Recorded expenses + salaries (advances are already in salaries).') },
      { name: b('Bénéfice', 'Profit'), formula: b('Encaissé − dépenses.', 'Collected − expenses.') },
      { name: b('Marge', 'Margin'), formula: b('Bénéfice ÷ encaissé, en %. Vide si rien n\'est encaissé.', 'Profit ÷ collected, in %. Empty if nothing is collected.') },
      { name: b('Écart prévu contre réel', 'Planned vs actual gap'), formula: b('Revenus : réel − prévu (positif = mieux que prévu). Dépenses et paie : prévu − réel (négatif = plafond dépassé). « À surveiller » à 80 % du plafond ; « rien de prévu » quand le prévu vaut 0.', 'Revenue: actual − planned (positive = better than planned). Expenses and payroll: planned − actual (negative = limit exceeded). "Watch" at 80% of the limit; "nothing planned" when planned is 0.') },
    ],
  },
  {
    id: 'grid', audience: 'employee', title: b('Missions', 'Missions'),
    purpose: b('La liste des missions disponibles pour l\'opérateur.', 'The list of missions available to the operator.'),
    howto: [b('Choisir une mission libre.', 'Pick a free mission.'), b('Le réserver et commencer la mission à l\'heure.', 'Reserve it and start the mission on time.'), b('Envoyer les preuves demandées à la fin.', 'Send the requested proofs at the end.')],
    rules: [b('Une mission « sans compte » est grisée : elle n\'est pas réservable.', 'A "no account" mission is greyed out: it cannot be reserved.'), b('Un employé ne voit jamais les prix clients ni les fiches clients.', 'An employee never sees client prices or client records.')],
    figures: [],
  },
  {
    id: 'active-post', audience: 'both', title: b('Mission en cours / Suivi des sessions', 'Current mission / Session tracking'),
    purpose: b('Pour l\'employé : sa mission active. Pour l\'admin : toutes les sessions en cours.', 'For the employee: their active mission. For the admin: all running sessions.'),
    howto: [b('Démarrer la mission avec la preuve de début.', 'Start the mission with the start proof.'), b('Travailler, puis envoyer la preuve de fin.', 'Work, then send the end proof.'), b('L\'admin valide ou refuse la session.', 'The admin validates or refuses the session.')],
    rules: [b('Début et fin passent par une validation de l\'admin.', 'Start and end go through admin validation.'), b('La Santé du site signale une mission en cours depuis plus de 12 h sans fin.', 'Site health flags a mission running over 12 h with no end.')],
    figures: [],
  },
  {
    id: 'employees', audience: 'admin', title: b('Employés', 'Employees'),
    purpose: b('La gestion de l\'équipe : profils, accès, état de chacun.', 'Team management: profiles, access, each person\'s status.'),
    howto: [b('Ouvrir un profil pour voir ou modifier les informations.', 'Open a profile to view or edit information.'), b('Régler l\'accès selon l\'heure de la vacation (auto, toujours, bloqué).', 'Set access by shift time (auto, always, blocked).'), b('Bloquer ou supprimer un profil avec confirmation.', 'Block or delete a profile with confirmation.')],
    rules: [b('Accès « auto » : la connexion n\'est permise que pendant la vacation, avec une marge avant et après.', '"Auto" access: login is only allowed during the shift, with a margin before and after.'), b('Supprimer un profil est définitif.', 'Deleting a profile is permanent.'), b('Import Excel ou CSV : tous les comptes sont des opérateurs ; un mot de passe provisoire est montré une seule fois à la fin (100 comptes au plus).', 'Excel or CSV import: every account is an operator; a temporary password is shown only once at the end (100 accounts at most).')],
    figures: [],
  },
  {
    id: 'profile', audience: 'employee', title: b('Mon profil', 'My profile'),
    purpose: b('Les informations de l\'employé, qu\'il peut demander à modifier.', 'The employee\'s information, which they can ask to change.'),
    howto: [b('Voir ses informations.', 'View your information.'), b('Demander une modification.', 'Ask for a change.'), b('Attendre l\'accord de l\'admin.', 'Wait for the admin\'s approval.')],
    rules: [b('Un changement de profil passe par une validation de l\'admin.', 'A profile change goes through admin validation.')],
    figures: [],
  },
  {
    id: 'chat', audience: 'both', title: b('Messagerie', 'Messages'),
    purpose: b('Discussions entre personnes et groupes, comme une messagerie classique.', 'Conversations between people and groups, like a regular messenger.'),
    howto: [b('Choisir une discussion ou un groupe.', 'Pick a conversation or a group.'), b('Écrire et joindre un fichier ou plusieurs photos (album : 4 cases, la 4e avec « +N »).', 'Write and attach a file or several photos (album: 4 tiles, the 4th shows “+N”).'), b('Modifier ou épingler ses propres messages.', 'Edit or pin your own messages.')],
    rules: [b('Appui long sur une discussion : l\'épingler en haut de la liste ou la cacher. Toucher le petit rond de profil : fiche « À propos » avec les actions possibles.', 'Long-press a conversation: pin it to the top of the list or hide it. Tap the small profile circle: an “About” card with the possible actions.'), b('Les discussions épinglées et cachées sont propres à chaque personne, gardées sur son appareil.', 'Pinned and hidden conversations are personal, kept on your own device.'), b('On ne modifie que ses propres messages, même l\'admin.', 'You only edit your own messages, even the admin.'), b('Supprimer pour tous : l\'auteur ou l\'admin ; le message disparaît sans trace.', 'Delete for everyone: the author or the admin; the message vanishes without a trace.'), b('Une seule réaction par personne et par message.', 'One reaction per person per message.')],
    figures: [],
  },
  {
    id: 'calendar', audience: 'both', title: b('Calendrier', 'Calendar'),
    purpose: b('Les présences et les retards, jour par jour.', 'Attendance and lateness, day by day.'),
    howto: [b('Choisir le mois et la personne.', 'Pick the month and the person.'), b('Cliquer un jour pour voir les sessions.', 'Click a day to see the sessions.'), b('Repérer les retards.', 'Spot the late arrivals.')],
    rules: [b('Le dimanche est un jour de repos.', 'Sunday is a rest day.'), b('Les heures sont celles de Madagascar (UTC+3).', 'Times are Madagascar time (UTC+3).')],
    conditions: ['leave.late_limit_time'],
    figures: [{ name: b('En retard', 'Late'), formula: b('Début de la session après l\'heure de début de la vacation + la tolérance (15 min par défaut) ; pile à la tolérance n\'est pas un retard. Vacation de jour à 08:00, de nuit à 20:00 par défaut.', 'Session start after the shift start + the tolerance (15 min by default); exactly at the tolerance is not late. Day shift at 08:00, night shift at 20:00 by default.') }],
  },
  {
    id: 'accounting', audience: 'admin', title: b('Comptabilité', 'Accounting'),
    purpose: b('Le journal des écritures (partie double), le grand livre, la balance, le résultat et le bilan. Les écritures viennent des factures, paiements, dépenses, paies et avances.', 'The journal of entries (double entry), ledger, trial balance, income statement and balance sheet. Entries come from invoices, payments, expenses, payroll and advances.'),
    howto: [b('Appuie sur « Générer les écritures » : chaque pièce sans écriture en reçoit une, jamais de doublon.', 'Tap "Generate the entries": every document without an entry gets one, never duplicates.'), b('Choisis la période, puis le Journal, le Grand livre, la Balance, le Résultat ou le Bilan.', 'Choose the period, then Journal, Ledger, Trial balance, Income or Balance sheet.'), b('Pour corriger : annule l\'écriture (écriture inverse) puis saisis la bonne.', 'To correct: reverse the entry (opposite entry), then enter the right one.')],
    rules: [b('Une écriture a toujours autant de débit que de crédit ; une écriture enregistrée ne se modifie jamais.', 'An entry always has as much debit as credit; a saved entry is never edited.'), b('Le numéro d\'écriture (EC-2026-0001) est donné par le serveur, dans l\'ordre des dates.', 'The entry number (EC-2026-0001) is given by the server, in date order.'), b('Le Comptable lit et saisit ; seul le responsable annule. Les écritures de paie ne montrent aucun nom.', 'The accountant reads and enters; only the manager reverses. Payroll entries show no name.'), b('Le plan comptable est un plan minimal de départ, à valider par un expert-comptable.', 'The chart of accounts is a minimal starting plan, to be validated by an accountant.'), b('La TVA collectée vient des factures ; la TVA déductible vient des achats saisis à la main (modèle « Achat avec TVA »), car les dépenses n\'ont pas de champ TVA.', 'Collected VAT comes from invoices; deductible VAT comes from purchases entered by hand (template "Purchase with VAT"), because expenses have no VAT field.'), b('Clôture : le responsable verrouille les mois finis (onglet Clôture) ; plus d\'écriture à ces dates. Au 31 décembre, le résultat passe au compte 110.', 'Closing: the admin locks finished months (Closing tab); no more entries on those dates. On December 31 the result moves to account 110.'), b('Rapprochement : on charge le relevé (CSV ou Excel) ; le site montre ce qui correspond, ce qui manque aux livres et ce qui manque au relevé. Rien n\'est écrit sans ton accord.', 'Reconciliation: load the statement (CSV or Excel); the site shows what matches, what is missing from the books and from the statement. Nothing is written without your consent.'), b('Export pour le comptable : Excel (journal, grand livre, balance) ou CSV, sur la période choisie ; montants en nombres entiers.', 'Export for the accountant: Excel (journal, ledger, trial balance) or CSV for the chosen period; amounts as whole numbers.'), b('La Santé du site signale une écriture déséquilibrée, des mois finis pas encore clos et la TVA à déclarer : ce sont des rappels, jamais des blocages.', 'Site health flags an unbalanced entry, finished months not yet closed and VAT to declare: these are reminders, never blockers.')],
    conditions: [],
    figures: [
      { name: b('Résultat', 'Result'), formula: b('Produits (comptes 7) moins charges (comptes 6) de la période.', 'Income (accounts 7) minus expenses (accounts 6) of the period.') },
      { name: b('Balance', 'Trial balance'), formula: b('Pour chaque compte, total des débits, total des crédits et solde ; le total des débits égale celui des crédits.', 'For each account, total debits, total credits and balance; total debits equal total credits.') },
      { name: b('TVA à payer', 'VAT due'), formula: b('TVA collectée (compte 4457) moins TVA déductible (compte 4456) de la période ; négatif = crédit de TVA.', 'Collected VAT (account 4457) minus deductible VAT (account 4456) for the period; negative = VAT credit.') },
      { name: b('Bilan', 'Balance sheet'), formula: b('Actif = soldes débiteurs ; passif = soldes créditeurs + résultat cumulé jusqu\'à la date.', 'Assets = debit balances; liabilities = credit balances + cumulative result up to the date.') },
    ],
  },
  {
    id: 'direction', audience: 'admin', title: b('Direction', 'Management'),
    purpose: b('Une page de synthèse du mois en cours : argent, comptabilité, prévu contre réel, créances en retard, meilleurs clients et salariés, stock critique, alertes.', 'A summary page for the current month: money, accounting, planned vs actual, overdue receivables, top clients and employees, critical stock, alerts.'),
    howto: [b('Lis les cartes de haut en bas : chacune résume une page du site.', 'Read the cards top to bottom: each one summarises a page of the site.'), b('Touche « Voir… » sous une carte pour ouvrir la page qui détaille.', 'Tap "See…" under a card to open the page that gives the details.'), b('Un chiffre qui te surprend : ouvre la page d\'origine, c\'est le même chiffre.', 'A figure that surprises you: open the source page, it is the same figure.')],
    rules: [b('Aucun calcul nouveau : cette page reprend les chiffres des Finances, de la Facturation, des Relances, du Stock, de la Performance et de la Santé du site.', 'No new calculation: this page reuses the figures of Finance, Invoicing, Reminders, Stock, Performance and Site health.'), b('Le chiffre d\'affaires est celui des factures émises ce mois ; sans facture, c\'est la valeur des missions validées, marquée « estimé ».', 'Revenue is that of the invoices issued this month; with no invoice, it is the value of validated missions, marked "estimated".'), b('Seuls le responsable et son accès complet voient cette page : le Comptable et les salariés ne la reçoivent pas.', 'Only the manager sees this page: accountants and employees do not get it.'), b('Les cartes Comptabilité (résultat et TVA du mois) et Prévu contre réel n\'apparaissent que s\'il y a des écritures ou un plan réglé : rien n\'est inventé.', 'The Accounting (result and VAT of the month) and Planned vs actual cards only appear when there are entries or a plan set: nothing is made up.')],
    conditions: [],
    figures: [
      { name: b('Bénéfice du mois', 'Profit this month'), formula: b('Argent encaissé moins dépenses saisies et salaires des missions validées (comme dans les Finances).', 'Money received minus entered expenses and salaries of validated missions (as in Finance).') },
      { name: b('Créances en retard', 'Overdue receivables'), formula: b('Reste à payer des factures émises dont l\'échéance est dépassée (comme dans les relances).', 'Remaining to pay on issued invoices past their due date (as in reminders).') },
      { name: b('Stock critique', 'Critical stock'), formula: b('Produits sous leur seuil d\'alerte ou à quantité négative (voyant rouge du Stock).', 'Products below their alert threshold or with a negative quantity (red light of Stock).') },
      { name: b('Résultat comptable du mois', 'Accounting result of the month'), formula: b('Produits (comptes 7) moins charges (comptes 6) des écritures du mois ; les écritures de clôture ne comptent pas (comme dans le Compte de résultat).', 'Income (class 7) minus expenses (class 6) of the month\'s entries; closing entries are not counted (as in the Income statement).') },
    ],
  },
  {
    id: 'hr', audience: 'both', title: b('Ressources humaines / Mon dossier et congés', 'Human resources / My file and leave'),
    purpose: b('Le responsable garde le dossier de chaque salarié et décide des congés ; le salarié lit son dossier et demande ses congés.', 'The manager keeps each employee file and decides on leave; the employee reads their file and requests leave.'),
    howto: [b('Salarié : onglet Congés (type, dates, envoi) ; onglet Évaluations pour lire sa fiche et marquer « lu ».', 'Employee: Leave tab (type, dates, send); Reviews tab to read the sheet and mark it read.'), b('Responsable : accepter un congé, ou le refuser avec un motif ; un congé accepté apparaît au calendrier.', 'Manager: approve a leave, or refuse it with a reason; an approved leave shows on the calendar.'), b('Responsable : onglets Dossiers et Évaluations (fiche d\'entretien avec la photo des scores, à partager).', 'Manager: Files and Reviews tabs (interview sheet with a score snapshot, to share).')],
    rules: [b('Le dossier est visible par le responsable et par le salarié concerné seulement.', 'The file is visible to the manager and the employee concerned only.'), b('Les jours de congé sont des jours ouvrés, calculés par le serveur ; le dimanche est un repos (le samedi aussi si 5 jours par semaine sont réglés).', 'Leave days are working days, computed by the server; Sunday is a rest day (Saturday too if 5 days a week is set).'), b('Un congé payé ne dépasse pas le solde de l\'année ; deux demandes ne se chevauchent pas ; un salarié annule sa demande tant que le congé n\'a pas commencé.', 'Paid leave cannot exceed the year balance; two requests cannot overlap; an employee can cancel a request until the leave has started.'), b('Un congé accepté n\'est plus compté comme jour manqué ni comme absence.', 'An approved leave is no longer counted as a missed day or an absence.'), b('Les « points à améliorer » d\'une évaluation sont une note privée : le salarié ne les reçoit jamais.', 'The "points to improve" of a review are a private note: the employee never receives them.'), b('Une évaluation en brouillon est invisible du salarié ; une fois partagée, elle ne redevient pas un brouillon.', 'A draft review is invisible to the employee; once shared it does not go back to a draft.'), b('Planning : une vacation Jour, Nuit ou Repos par salarié et par jour ; seul le responsable écrit, le salarié lit seulement son propre planning.', 'Planning: one Day, Night or Rest shift per employee per day; only the manager writes, the employee only reads their own planning.'), b('Conflits du planning, signalés mais jamais refusés : congé accepté, Jour le lendemain d\'une Nuit, trop de jours travaillés dans la semaine.', 'Planning conflicts, flagged but never refused: approved leave, Day right after a Night, too many working days in the week.')],
    conditions: ['leave.leave_days_per_year', 'leave.work_days_per_week'],
    figures: [
      { name: b('Jours ouvrés d\'une demande', 'Working days of a request'), formula: b('Jours du début à la fin inclus, sans les jours de repos (dimanche ; samedi aussi à 5 jours par semaine).', 'Days from start to end included, without rest days (Sunday; Saturday too at 5 days a week).') },
      { name: b('Solde de congé payé', 'Paid leave balance'), formula: b('Jours par an (Conditions) moins les congés payés acceptés et en attente de l\'année. Vide si le réglage est à 0.', 'Days per year (Conditions) minus the year\'s approved and pending paid leave. Empty if the setting is 0.') },
      { name: b('Ancienneté', 'Seniority'), formula: b('Mois pleins depuis la date d\'embauche (le jour du mois compte).', 'Full months since the hire date (the day of the month counts).') },
    ],
  },
  {
    id: 'advances', audience: 'both', title: b('Paie / Ma paie', 'Payroll / My pay'),
    purpose: b('La paie des salariés, les avances et les bulletins.', 'Employee pay, advances and payslips.'),
    howto: [b('L\'employé demande une avance ; l\'admin accepte ou refuse.', 'The employee requests an advance; the admin accepts or refuses.'), b('À la clôture d\'une période, les bulletins sont calculés.', 'When a period is closed, payslips are computed.'), b('L\'admin marque chaque bulletin payé (mode et référence).', 'The admin marks each payslip paid (method and reference).')],
    rules: [b('La paie est mensuelle ou par quinzaine (réglage).', 'Pay is monthly or half-monthly (setting).'), b('Les avances sont plafonnées à un % de ce qui est gagné dans la période (0 = pas de plafond).', 'Advances are capped at a % of what is earned in the period (0 = no cap).'), b('Les retenues et pénalités sont désactivées par défaut.', 'Deductions and penalties are off by default.'), b('Un employé ne voit que sa propre paie.', 'An employee only sees their own pay.')],
    conditions: ['payroll.pay_day', 'payroll.pay_rounding'],
    figures: [
      { name: b('Brut', 'Gross'), formula: b('Somme des missions validées de la période (montant figé à la validation, sinon le prix par mission des Réglages).', 'Sum of the period\'s validated missions (amount frozen at validation, otherwise the price per mission from Settings).') },
      { name: b('Retenues appliquées', 'Deductions applied'), formula: b('Les pénalités, jamais plus que brut + primes.', 'Penalties, never more than gross + bonuses.') },
      { name: b('Avances remboursées', 'Advances repaid'), formula: b('Le plus petit entre l\'avance restant due et la part de remboursement (en %) du reste après retenues.', 'The smaller of the advance still due and the repayment share (in %) of what remains after deductions.') },
      { name: b('Net', 'Net'), formula: b('Brut + primes − retenues appliquées − avances remboursées. Jamais négatif.', 'Gross + bonuses − deductions applied − advances repaid. Never negative.') },
    ],
  },
  {
    id: 'health', audience: 'admin', title: b('Santé du site', 'Site health'),
    purpose: b('Le site contrôle chaque page tout seul et signale ce qui mérite un coup d\'œil.', 'The site checks every page by itself and flags what deserves a look.'),
    howto: [b('Regarder les alertes, les plus graves d\'abord.', 'Look at the alerts, most serious first.'), b('Cliquer « Ouvrir » pour aller à la bonne page.', 'Click "Open" to go to the right page.'), b('« Vérifié » ou « Ignorer » cache l\'alerte ; elle revient si ça s\'aggrave.', '"Checked" or "Ignore" hides the alert; it returns if it gets worse.')],
    rules: [b('Ce sont des signaux à vérifier, jamais des sanctions automatiques.', 'These are signals to check, never automatic penalties.'), b('Calcul dans le navigateur de l\'admin ; un employé ne voit rien.', 'Computed in the admin\'s browser; an employee sees nothing.'), b('Les marques « Ignorer / Vérifié » sont gardées sur l\'appareil.', '"Ignore / Checked" marks are kept on the device.'), b('Aucune alerte n\'est lancée sans un minimum de données.', 'No alert fires without a minimum of data.')],
    figures: [
      { name: b('Gravité', 'Severity'), formula: b('Info (pour savoir), À voir (bientôt), Urgent (maintenant). La pastille compte À voir + Urgent.', 'Info (to know), To check (soon), Urgent (now). The badge counts To check + Urgent.') },
      { name: b('Comparaison statistique', 'Statistical comparison'), formula: b('Chiffre actuel comparé à la médiane des périodes d\'avant, avec au moins 3 périodes ; les deux chiffres sont toujours montrés.', 'Current figure compared with the median of earlier periods, with at least 3 periods; both figures are always shown.') },
    ],
  },
  {
    id: 'errors', audience: 'admin', title: b('Journal des erreurs', 'Error log'),
    purpose: b('Les plantages et erreurs du site, regroupés, avec les signalements des employés.', 'Site crashes and errors, grouped, with employee reports.'),
    howto: [b('Ouvrir une erreur pour voir le détail.', 'Open an error to see the details.'), b('Copier le rapport pour le développeur.', 'Copy the report for the developer.'), b('La marquer « résolue ».', 'Mark it "resolved".')],
    rules: [b('Les erreurs identiques sont regroupées avec un compteur.', 'Identical errors are grouped with a counter.'), b('Une erreur résolue qui revient est rouverte.', 'A resolved error that comes back is reopened.')],
    figures: [],
  },
  {
    id: 'settings', audience: 'both', title: b('Réglages', 'Settings'),
    purpose: b('Les réglages du site : horaires, prix, objectifs, Conditions de l\'entreprise, sauvegardes.', 'Site settings: hours, prices, goals, company Conditions, backups.'),
    howto: [b('Choisir la section à régler.', 'Pick the section to set.'), b('Enregistrer pour appliquer le changement.', 'Save to apply the change.'), b('Faire une sauvegarde avant un gros changement.', 'Take a backup before a big change.')],
    rules: [b('Une sauvegarde de nuit est faite automatiquement et gardée environ 14 jours.', 'A nightly backup is made automatically and kept for about 14 days.'), b('Les changements des Conditions sont notés dans un historique.', 'Conditions changes are recorded in a log.'), b('Le responsable peut cacher des pages du menu (Conditions > Pages du menu) ; rien n\'est supprimé.', 'The admin can hide menu pages (Conditions > Menu pages); nothing is deleted.'), b('Un employé ne reçoit que le règlement et les règles de congés et de présence.', 'An employee only receives the rules and the leave and attendance policy.'), b("La visite guidée s'ouvre à la première connexion sur un appareil ; « Revoir la visite guidée » la relance.", 'The guided tour opens at the first sign-in on a device; “Replay the guided tour” starts it again.'), b('Sécurité en deux étapes (facultative, responsable et Comptable) : code à 6 chiffres après le mot de passe ; garde tes codes de secours.', 'Two-step sign-in (optional, manager and Accountant): a 6-digit code after the password; keep your backup codes.'), b('« Exporter toutes les données » télécharge un fichier complet (garde-le comme un mot de passe). Un fichier importé s\'ajoute aux sauvegardes ; rien n\'est remplacé sans « Restaurer ».', '"Export all data" downloads a full file (keep it like a password). An imported file is added to the backups; nothing is replaced without "Restore".'), b('Missions récurrentes : un modèle de mission + tous les jours, certains jours de la semaine ou un jour du mois, à une heure de Madagascar. Le serveur la crée sans doublon ; 20 règles au plus.', 'Recurring missions: a mission template + every day, some weekdays or one day of the month, at a Madagascar time. The server creates it without duplicates; 20 rules at most.'), b('Une mission récurrente manquée de plus de 2 h (serveur arrêté) n\'est pas rattrapée.', 'A recurring mission missed by more than 2 hours (server stopped) is not made up.'), b('Plafond du Chef d\'équipe : au-dessus de ce prix client, seul le responsable décide (valider un début, une fin ou refuser). Le serveur refuse sans donner le montant ; 0 = pas de plafond.', 'Team lead limit: above this client price, only the manager decides (approve a start, an end or refuse). The server refuses without giving the amount; 0 = no limit.')],
    figures: [],
  },
];

export const findPage = (id: string): SitePage | undefined => SITE_MAP.find(p => p.id === id);
export const pagesFor = (role: 'admin' | 'employee'): SitePage[] => SITE_MAP.filter(p => p.audience === 'both' || p.audience === role);
