// Guides par tâche (guide G3, 2026-11-08) : « Que veux-tu faire ? ». 2 à 3 étapes par tâche, une phrase par étape, mêmes bulles et même doigt que la visite guidée.
// Utilisé par : components/PageHelp.tsx (liste des tâches) et components/TourGuide.tsx (lecture). Contrôlé par `npm run check:task-guides`.
import type { Bi } from './siteKnowledge';
import { findPage } from './siteKnowledge';
import { WORK_SETTINGS_LIVE } from './workTypes';
import type { GuideRole, GuideStep } from './guideEngine';

const b = (fr: string, en: string): Bi => ({ fr, en });
export interface TaskGuide { id: string; title: Bi; steps: GuideStep[] }
export const TASK_MAX_STEPS = 3;
export const TASK_MAX_CHARS = 140;

const worksheet = (): TaskGuide => ({
  id: 'worksheet', title: b('Saisir la feuille du jour', 'Fill in the daily sheet'),
  steps: [
    { id: 'ws-1', page: 'worksheet', target: { texts: [b('Type de travail', 'Work type')] }, title: b('Date et type', 'Date and type'), text: b('Choisis la date et le type de travail.', 'Pick the date and the work type.'), missing: b('Ouvre « Feuille du jour » dans le menu.', 'Open "Daily sheet" in the menu.') },
    { id: 'ws-2', page: 'worksheet', target: { texts: [b('Tous présents', 'All present')] }, title: b('Remplir vite', 'Fill in fast'), text: b('« Tous présents » ou une quantité pour tous remplit les cases vides.', '"All present" or one quantity for all fills the empty boxes.'), missing: b('Ajoute d\'abord des opérateurs à ta liste.', 'First add operators to your list.') },
    { id: 'ws-3', page: 'worksheet', target: { texts: [b('Enregistrer la feuille', 'Save the sheet')] }, title: b('Enregistrer', 'Save'), text: b('Enregistre : les lignes refusées restent à corriger.', 'Save: rejected lines stay to be fixed.'), missing: b('Remplis au moins une ligne.', 'Fill in at least one line.') },
  ],
});
const validate = (target: string, en: string): TaskGuide => ({
  id: 'validate', title: b('Valider le travail', 'Approve the work'),
  steps: [
    { id: 'va-1', page: 'validations', target: { texts: [b(target, en)] }, title: b('Ouvrir la demande', 'Open the request'), text: b('Chaque début ou fin de mission arrive ici.', 'Every start or end of a mission lands here.'), missing: b('Rien à valider pour le moment.', 'Nothing to approve for now.') },
    { id: 'va-2', page: 'validations', target: null, title: b('Décider', 'Decide'), text: b('Regarde la preuve, puis « Valider » ou « Refuser ».', 'Look at the proof, then "Approve" or "Reject".') },
  ],
});
const invoice = (): TaskGuide => ({
  id: 'invoice', title: b('Faire une facture', 'Make an invoice'),
  steps: [
    { id: 'in-1', page: 'invoices', target: { texts: [b('Nouvelle facture', 'New invoice')] }, title: b('Nouvelle facture', 'New invoice'), text: b('Touche « Nouvelle facture », choisis le client et les lignes.', 'Tap "New invoice", pick the client and the lines.'), missing: b('Ouvre « Factures » dans le menu.', 'Open "Invoices" in the menu.') },
    { id: 'in-2', page: 'invoices', target: { texts: [b('Émettre', 'Issue')] }, title: b('Émettre', 'Issue'), text: b('« Émettre » fige la facture et lui donne son numéro.', '"Issue" locks the invoice and gives it its number.'), missing: b('Le bouton apparaît sur une facture en brouillon.', 'The button shows on a draft invoice.') },
  ],
});

/** Les tâches proposées à chaque rôle (la Feuille du jour seulement quand le module est ouvert). */
export function taskGuides(role: unknown): TaskGuide[] {
  const w = WORK_SETTINGS_LIVE ? [worksheet()] : [];
  if (role === 'admin') return [...w, {
    id: 'add-operator', title: b('Ajouter un employé', 'Add an employee'),
    steps: [
      { id: 'ad-1', page: 'employees', target: { texts: [b('Ajouter un Opérateur', 'Add Operator')] }, title: b('Ajouter', 'Add'), text: b('Touche « Ajouter un Opérateur ».', 'Tap "Add Operator".'), missing: b('Ouvre « Opérateurs » dans le menu.', 'Open "Operators" in the menu.') },
      { id: 'ad-2', page: 'employees', target: null, title: b('Ses accès', 'Their access'), text: b('Remplis le nom, l\'identifiant et le mot de passe, puis donne-les-lui.', 'Fill in the name, username and password, then give them to the person.') },
    ],
  }, validate('Débuts', 'Starts'), invoice()];
  if (role === 'team_lead') return [...w, validate('Valider', 'Approve')];
  if (role === 'accountant') return [invoice()];
  return [{
    id: 'take', title: b('Prendre une mission', 'Take a mission'),
    steps: [
      { id: 'tk-1', page: 'grid', target: { texts: [b('Prendre', 'Take')] }, title: b('Prendre', 'Take'), text: b('Touche « Prendre » sur la mission qui te convient.', 'Tap "Take" on the mission that suits you.'), missing: b('Aucune mission libre pour le moment.', 'No free mission for now.') },
      { id: 'tk-2', page: 'active-post', target: null, title: b('Ma mission', 'My mission'), text: b('Ta mission en cours est ici : démarre, puis termine avec tes preuves.', 'Your running mission is here: start, then end with your proofs.') },
    ],
  }, {
    id: 'pay', title: b('Voir ma paie', 'See my pay'),
    steps: [{ id: 'py-1', page: 'advances', target: { texts: [b('Ma paie', 'My pay')] }, title: b('Ma paie', 'My pay'), text: b('Ta paie et tes avances sont ici.', 'Your pay and advances are here.'), missing: b('Ouvre « Avances » dans le menu.', 'Open "Advances" in the menu.') }],
  }];
}

export interface TaskProblem { role: string; task: string; problem: string }
/** Tous les problèmes de toutes les tâches (liste vide = tout est bon). */
export function taskProblems(roles: GuideRole[] = ['admin', 'team_lead', 'accountant', 'employee']): TaskProblem[] {
  const out: TaskProblem[] = [];
  const bi = (x: Bi | undefined) => !!x && typeof x.fr === 'string' && x.fr.trim() !== '' && typeof x.en === 'string' && x.en.trim() !== '';
  for (const role of roles) {
    const ids = new Set<string>(), stepIds = new Set<string>();
    for (const tk of taskGuides(role)) {
      const p = (problem: string) => out.push({ role, task: tk.id, problem });
      if (ids.has(tk.id)) p('tâche en double'); ids.add(tk.id);
      if (!bi(tk.title)) p('titre FR/EN manquant');
      if (tk.steps.length < 1 || tk.steps.length > TASK_MAX_STEPS) p(`${tk.steps.length} étapes (1 à ${TASK_MAX_STEPS} permises)`);
      for (const s of tk.steps) {
        if (!s.id || stepIds.has(s.id)) p(`étape ${s.id || '?'} : identifiant vide ou en double`); stepIds.add(s.id);
        if (!s.page || !findPage(s.page)) p(`étape ${s.id} : page inconnue`);
        if (!bi(s.title) || !bi(s.text)) p(`étape ${s.id} : texte FR/EN manquant`);
        if (bi(s.text) && (s.text.fr.length > TASK_MAX_CHARS || s.text.en.length > TASK_MAX_CHARS)) p(`étape ${s.id} : texte trop long (${TASK_MAX_CHARS} signes au plus)`);
        if (s.target && !s.missing) p(`étape ${s.id} : élément visé sans texte « absent »`);
        if (s.target && s.target.texts && s.target.texts.some(x => !bi(x))) p(`étape ${s.id} : texte à viser sans FR/EN`);
        if (s.action) p(`étape ${s.id} : pas de simulation dans un guide de tâche`);
      }
    }
  }
  return out;
}
