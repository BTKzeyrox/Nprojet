// Contenu de la visite guidée, écrit SÉPARÉMENT pour chaque rôle (M-guide) : l'opérateur apprend à FAIRE son travail, le responsable apprend à DÉCIDER et à CONTRÔLER.
// Chaque page : une explication simple (300 signes au plus) + des astuces courtes. Si une page n'a pas de texte ici, la visite retombe sur la carte du site (siteKnowledge.ts).
// Pure donnée : aucun écran, aucun serveur. Contrôlé par `npm run check:tour`.
import type { Bi } from './siteKnowledge';
import type { TourRole } from './tour';

export interface TourPageContent { text: Bi; tips: Bi[] }
const b = (fr: string, en: string): Bi => ({ fr, en });
const c = (text: Bi, ...tips: Bi[]): TourPageContent => ({ text, tips });

export const TOUR_CONTENT: Record<TourRole, Record<string, TourPageContent>> = {
  employee: {
    feed: c(
      b("Les annonces de l'équipe. Lis-les avant de commencer à travailler : une règle ou une consigne peut avoir changé.", 'Team announcements. Read them before you start working: a rule or an instruction may have changed.'),
      b("Les plus récentes sont en haut. Un point ou une épingle montre ce qui est important.", 'The newest are at the top. A pin marks what is important.'),
      b("Tu peux proposer une publication : elle apparaît chez tous après l'accord du responsable.", 'You can suggest a post: it shows for everyone after the manager approves it.'),
    ),
    grid: c(
      b("Ici tu choisis ta mission. Chaque carte dit le client et ce qu'il faut faire. Prends une mission, puis tu la suis dans « Mission en cours ».", 'Here you pick your mission. Each card shows the client and what to do. Take one, then follow it in "Current mission".'),
      b("Lis bien la description avant de prendre : une fois prise, la mission est à toi.", 'Read the description before taking: once taken, the mission is yours.'),
      b("Si une mission a une priorité ou une échéance, c'est indiqué : fais celles-là en premier.", 'If a mission has a priority or a deadline, it is shown: do those first.'),
    ),
    'active-post': c(
      b("Ta mission du jour, du début à la fin. Au départ tu envoies une photo de preuve, à la fin une autre. Le responsable valide, et seulement après ton gain est compté.", 'Your mission of the day, start to finish. At the start you send a proof photo, at the end another one. The manager approves, and only then is your pay counted.'),
      b("Envoie des preuves nettes et lisibles : une capture floue est refusée.", 'Send clear, readable proofs: a blurry capture gets refused.'),
      b("Sans réseau, tu peux continuer : tout est gardé sur ton téléphone et envoyé au retour du réseau.", 'Without network you can keep going: everything is kept on your phone and sent when the network is back.'),
      b("Si ta mission est refusée, le motif est écrit : corrige et recommence.", 'If your mission is refused, the reason is written: fix it and try again.'),
    ),
    hr: c(
      b("Ton espace personnel : ta paie, tes avances, tes congés et ton dossier. Tu ne vois que tes propres informations.", 'Your personal space: your pay, advances, leave and file. You only see your own information.'),
      b("Demande une avance ou un congé ici : tu vois si c'est en attente, accepté ou refusé.", 'Ask for an advance or leave here: you see whether it is pending, accepted or refused.'),
      b("Ton gain monte seulement avec les missions VALIDÉES.", 'Your earnings only go up with VALIDATED missions.'),
    ),
    chat: c(
      b("Les messages avec le responsable et l'équipe. Pose ta question ici plutôt que de deviner.", 'Messages with the manager and the team. Ask your question here instead of guessing.'),
      b("Les messages importants sont épinglés en haut de la discussion.", 'Important messages are pinned at the top of the chat.'),
      b("Un point sur la discussion montre qu'il y a un message non lu.", 'A dot on the chat shows there is an unread message.'),
    ),
    calendar: c(
      b("Ton planning : quels jours tu travailles, de jour ou de nuit, et tes congés. Regarde-le le soir pour préparer demain.", 'Your schedule: which days you work, day or night, and your leave. Check it in the evening to prepare tomorrow.'),
      b("Un congé accepté par le responsable apparaît ici.", 'A leave accepted by the manager shows here.'),
    ),
    settings: c(
      b("Tes réglages : langue, mot de passe, son et notifications. Tu peux aussi revoir cette visite ici.", 'Your settings: language, password, sound and notifications. You can also replay this tour here.'),
      b("Choisis un mot de passe que tu es seul à connaître.", 'Pick a password only you know.'),
      b("Active les notifications pour savoir tout de suite quand une mission est validée.", 'Turn on notifications to know right away when a mission is approved.'),
    ),
  },

  admin: {
    dashboard: c(
      b("Ton poste de contrôle. En haut, les alertes (à valider, argent, stock). Dessous, l'avancement du mois comparé à tes objectifs. Clique une alerte pour ouvrir la bonne page.", 'Your control post. At the top, alerts (to approve, money, stock). Below, the month progress against your goals. Click an alert to open the right page.'),
      b("Commence chaque matin par les alertes rouges.", 'Start each morning with the red alerts.'),
      b("Les objectifs se règlent dans Réglages et ne sont jamais montrés aux opérateurs.", 'Goals are set in Settings and never shown to operators.'),
    ),
    validations: c(
      b("Tout ce que tu dois accepter ou refuser : débuts et fins de mission, avances, inscriptions, mots de passe oubliés. Le chiffre sur le menu compte ce qui attend.", 'Everything you must accept or refuse: mission starts and ends, advances, sign-ups, forgotten passwords. The number on the menu counts what is waiting.'),
      b("Regarde toujours les preuves avant d'accepter. Un refus demande un motif : écris-le clairement, l'opérateur le lit.", 'Always look at the proofs before accepting. A refusal needs a reason: write it clearly, the operator reads it.'),
      b("Le prix client et la paie sont calculés par le serveur : tu ne les saisis pas.", 'The client price and pay are calculated by the server: you do not type them.'),
    ),
    clients: c(
      b("La liste de tes clients et de leurs missions. Une mission est liée à un client : c'est ce qui permet ensuite de facturer.", 'The list of your clients and their missions. A mission is linked to a client: this is what lets you invoice later.'),
      b("Archive un client plutôt que de le supprimer : son historique reste.", 'Archive a client instead of deleting: the history stays.'),
      b("Note ses délais de paiement : ils servent à la date d'échéance des factures.", 'Note its payment terms: they set the due date of invoices.'),
    ),
    invoices: c(
      b("Factures, reçus, devis et paiements. Le site propose les lignes à partir des missions validées du client ; tu vérifies, puis tu émets. Un numéro est attribué à l'émission.", 'Invoices, receipts, quotes and payments. The site proposes lines from the client\'s approved missions; you check, then issue. A number is given at issue.'),
      b("Une facture émise ne se modifie plus : pour corriger, fais un avoir.", 'An issued invoice cannot be edited: to fix it, make a credit note.'),
      b("Enregistre le paiement quand l'argent arrive : le reçu et l'écriture comptable se font tout seuls.", 'Record the payment when the money arrives: the receipt and the accounting entry are made automatically.'),
    ),
    stats: c(
      b("Les chiffres du site : missions, gains, dépenses, bénéfice, par période. Les graphiques te montrent si le mois va bien ou non.", 'The numbers of the site: missions, earnings, expenses, profit, by period. Charts show whether the month is going well.'),
      b("Change la période en haut pour comparer ce mois au précédent.", 'Change the period at the top to compare this month with the previous one.'),
      b("Un chiffre étrange ? Vérifie d'abord les missions refusées et les dépenses du mois.", 'A strange figure? First check the refused missions and the expenses of the month.'),
    ),
    employees: c(
      b("Les comptes de l'équipe : créer un opérateur, changer son équipe ou son poste, changer son mot de passe, voir ses résultats et son dossier.", 'The team accounts: create an operator, change team or shift, reset a password, see results and file.'),
      b("Pour un oubli de mot de passe, change-le ici et donne le nouveau en main propre.", 'For a forgotten password, change it here and hand over the new one in person.'),
      b("Avant de supprimer un compte, pense à son historique : une sauvegarde est conseillée.", 'Before deleting an account, think of its history: a backup is advised.'),
    ),
    health: c(
      b("La santé du site : le site se surveille lui-même et te dit ce qui est à voir (retards, refus trop nombreux, base, notifications). Rien d'inquiétant si tout est vert.", 'Site health: the site watches itself and tells you what needs a look (delays, too many refusals, database, notifications). Nothing to worry about if all is green.'),
      b("Ouvre-la une fois par semaine, et après un gros changement.", 'Open it once a week, and after any big change.'),
      b("Marque « vérifié » ce que tu as regardé : le point disparaît pour tes autres appareils.", 'Mark what you checked as "reviewed": the dot goes away on your other devices.'),
    ),
    settings: c(
      b("Les réglages de l'entreprise : prix, objectifs, sauvegardes, notifications, sécurité. Tu peux aussi revoir cette visite ici.", 'Company settings: prices, goals, backups, notifications, security. You can also replay this tour here.'),
      b("Fais une sauvegarde avant tout gros changement, et télécharge-la de temps en temps.", 'Make a backup before any big change, and download it from time to time.'),
      b("Active la double sécurité sur ton compte responsable.", 'Turn on two-step security on your manager account.'),
    ),
  },

  accountant: {
    invoices: c(
      b("Ton espace principal : factures, reçus, avoirs, devis et paiements. Tu prépares et tu émets ; chaque émission reçoit son numéro.", 'Your main space: invoices, receipts, credit notes, quotes and payments. You prepare and issue; each issue gets its number.'),
      b("Vérifie les lignes proposées avant d'émettre : elles viennent des missions validées.", 'Check the proposed lines before issuing: they come from approved missions.'),
      b("Pour corriger une facture émise, fais un avoir.", 'To fix an issued invoice, make a credit note.'),
    ),
    clients: c(
      b("Les fiches clients : coordonnées et délais de paiement. Les délais fixent la date d'échéance des factures.", 'Client files: contacts and payment terms. The terms set the due date of invoices.'),
      b("Garde les fiches à jour : une adresse fausse se retrouve sur la facture.", 'Keep files up to date: a wrong address ends up on the invoice.'),
    ),
    purchasing: c(
      b("Les achats : fournisseurs et bons de commande. Chaque achat reçu entre dans le stock et dans les dépenses.", 'Purchases: suppliers and purchase orders. Each received purchase goes into stock and expenses.'),
      b("Crée le fournisseur avant son premier bon de commande.", 'Create the supplier before its first purchase order.'),
    ),
    chat: c(
      b("Les messages avec le responsable et l'équipe. Pour une question sur une facture, écris ici et garde une trace.", 'Messages with the manager and the team. For a question about an invoice, write here and keep a trace.'),
      b("Un point sur la discussion signale un message non lu.", 'A dot on the chat marks an unread message.'),
    ),
    settings: c(
      b("Tes réglages : langue, mot de passe, notifications. Tu peux aussi revoir cette visite ici.", 'Your settings: language, password, notifications. You can also replay this tour here.'),
      b("Choisis un mot de passe que toi seul connais : tu touches à l'argent.", 'Pick a password only you know: you handle money.'),
    ),
  },

  team_lead: {
    validations: c(
      b("Le travail de ton équipe à valider : débuts et fins de mission de tes opérateurs. Tu acceptes ou tu refuses, et la mission change tout de suite.", 'Your team\'s work to approve: mission starts and ends of your operators. You accept or refuse, and the mission changes right away.'),
      b("Regarde les preuves avant d'accepter. Un refus demande un motif clair.", 'Look at the proofs before accepting. A refusal needs a clear reason.'),
      b("Tu ne vois aucun montant : la paie est calculée par le serveur.", 'You see no amounts: pay is calculated by the server.'),
    ),
    chat: c(
      b("Les messages avec le responsable et ton équipe. Préviens ici si un opérateur est bloqué ou absent.", 'Messages with the manager and your team. Say here if an operator is stuck or absent.'),
      b("Les messages épinglés restent en haut : utile pour une consigne du jour.", 'Pinned messages stay at the top: handy for the instruction of the day.'),
    ),
    settings: c(
      b("Tes réglages : langue, mot de passe, notifications. Tu peux aussi revoir cette visite ici.", 'Your settings: language, password, notifications. You can also replay this tour here.'),
      b("Active les notifications pour voir vite les validations qui attendent.", 'Turn on notifications to see waiting approvals quickly.'),
    ),
  },
};

/** Bienvenue par rôle, avec ce que le rôle fait dans la journée. */
export const TOUR_WELCOME_TIPS: Record<TourRole, Bi[]> = {
  employee: [
    b('Ta journée type : lire les actualités, prendre une mission, envoyer la preuve de départ, travailler, envoyer la preuve de fin, attendre la validation.', 'Your typical day: read the news, take a mission, send the start proof, work, send the end proof, wait for approval.'),
    b('Un doute ? Pose ta question dans les messages ou à l\'assistant du site.', 'In doubt? Ask in messages or ask the site assistant.'),
  ],
  admin: [
    b('Ta journée type : alertes du tableau de bord, validations, messages, puis factures et chiffres.', 'Your typical day: dashboard alerts, approvals, messages, then invoices and figures.'),
    b('Un point rouge sur le menu veut dire « quelque chose attend ».', 'A red dot on the menu means "something is waiting".'),
  ],
  accountant: [
    b('Ta journée type : factures à émettre, paiements à enregistrer, achats à saisir.', 'Your typical day: invoices to issue, payments to record, purchases to enter.'),
  ],
  team_lead: [
    b('Ta journée type : valider le travail de ton équipe, répondre aux messages.', 'Your typical day: approve your team\'s work, answer messages.'),
  ],
};
