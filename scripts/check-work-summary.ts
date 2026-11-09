// Résumé avant d'enregistrer la feuille du jour : mêmes chiffres que ceux que le serveur inscrira à la validation.
import fs from 'node:fs';
import { summarizeSheet } from '../src/utils/sheetSummary';
import { planWorkEntries } from '../src/utils/workEntry';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('OK   ' + m); } else { fail++; console.log('ECHEC ' + m); } };
const admin = { id: 'adm', role: 'admin', name: 'Direction' }, lead = { id: 'tl', role: 'team_lead', name: 'Chef', team: 'A' };
const mk = (id: string, extra: any = {}) => ({ id, role: 'employee', name: id, status: 'active', team: 'A', total_earnings_ar: 0, ...extra });
const people = [mk('e1'), mk('e2'), mk('e3'), mk('e4')];
const settings = (mode: string) => ({ price_per_mission: 1500, company: { work: { pay_default: mode, rate_day_ar: 10000, rate_hour_ar: 2000, rate_piece_ar: 50 } } });
const TODAY = '2026-11-08', NOW = '2026-11-08T08:00:00.000Z';
const total = (sheetLines: any[], s: any, me: any = admin) => {
  const plan = planWorkEntries(me, people.map(p => ({ ...p })), [], { date: TODAY, lines: sheetLines.map(l => ({ ...l, work_type: 'presence' })) }, s, NOW, TODAY);
  return plan.saved.reduce((a: number, p: any) => a + p.calculated_ar, 0);
};

// ---- compteurs ----
{
  const rows = { e1: { presence: 'present' }, e2: { presence: 'late' }, e3: { presence: 'half' }, e4: { presence: 'absent' } };
  const s = summarizeSheet(rows, people, 'presence', admin, settings('day'));
  ok(s.lines === 4 && s.present === 1 && s.late === 1 && s.half === 1 && s.absent === 1, 'compte les lignes, présents, retards, demi-journées et absents');
  ok(summarizeSheet({}, people, 'presence', admin, settings('day')).lines === 0, 'feuille vide : 0 ligne (rien à résumer)');
  ok(summarizeSheet({ e1: { presence: '' }, e2: { hours: '  ' } }, people, 'presence', admin, settings('day')).lines === 0, 'une case vide ou des espaces ne comptent pas comme une ligne');
}
// ---- le total = ce que le serveur inscrira (mêmes règles, même résultat) ----
{
  const rows = { e1: { presence: 'present' }, e2: { presence: 'late' }, e3: { presence: 'half' }, e4: { presence: 'absent' } };
  const lines = Object.entries(rows).map(([employee_id, r]) => ({ employee_id, presence: r.presence }));
  const s = summarizeSheet(rows, people, 'presence', admin, settings('day'));
  ok(s.totalAr === 25000 && s.totalAr === total(lines, settings('day')), 'paie par jour : 10 000 + 10 000 + 5 000 + 0 = 25 000 Ar, identique au serveur');
}
{
  const rows = { e1: { presence: 'present', hours: '8' }, e2: { presence: 'present', hours: '7,5' }, e3: { hours: '4' } };
  const lines = [{ employee_id: 'e1', presence: 'present', hours: '8' }, { employee_id: 'e2', presence: 'present', hours: '7,5' }, { employee_id: 'e3', hours: '4' }];
  const s = summarizeSheet(rows, people, 'presence', admin, settings('hour'));
  ok(s.hours === 19.5 && s.totalAr === 39000 && s.totalAr === total(lines, settings('hour')), 'paie à l\'heure : 19,5 h × 2 000 = 39 000 Ar, identique au serveur (virgule acceptée)');
}
{
  const rows = { e1: { quantity: '100', rejected: '10' }, e2: { quantity: '1 200' } };
  const lines = [{ employee_id: 'e1', quantity: '100', rejected: '10' }, { employee_id: 'e2', quantity: '1 200' }];
  const s = summarizeSheet(rows, people, 'presence', admin, settings('piece'));
  ok(s.quantity === 1300 && s.rejected === 10 && s.totalAr === total(lines, settings('piece')), 'paie à la pièce : quantité, refusées et total identiques au serveur (« 1 200 » avec espace accepté)');
}
// ---- cas particuliers ----
{
  const s = summarizeSheet({ e1: { presence: 'present' } }, people, 'presence', lead, settings('day'));
  ok(s.totalAr === null && s.present === 1, 'chef d\'équipe : pas de montant (le responsable valide ensuite), mais les compteurs restent');
  const sf = summarizeSheet({ e1: { presence: 'present' }, e2: { presence: 'present' } }, [mk('e1', { pay_mode: 'fixed' }), mk('e2')], 'presence', admin, settings('day'));
  ok(sf.fixed === 1 && sf.totalAr === 10000, 'salaire fixe : pas de montant par ligne, signalé à part');
  const bad = summarizeSheet({ e1: { presence: 'present', hours: 'abc', quantity: '-5', rejected: '1e3' } }, people, 'presence', admin, settings('day'));
  ok(bad.hours === 0 && bad.quantity === 0 && bad.rejected === 0 && bad.lines === 1, 'texte, négatif ou « 1e3 » : ignorés dans le résumé (le serveur refusera la ligne avec la raison)');
  const over = summarizeSheet({ e1: { quantity: '5', rejected: '9' } }, people, 'presence', admin, settings('piece'));
  ok(over.rejected === 5, 'les refusées ne dépassent jamais la quantité');
  ok(Number.isFinite(summarizeSheet({ e1: { presence: 'present', hours: '99999999999999999999' } }, people, 'presence', admin, settings('hour')).totalAr as number), 'un nombre énorme ne produit jamais NaN ni infini');
}
// ---- branchements ----
const view = fs.readFileSync('src/views/WorksheetView.tsx', 'utf8');
ok(/summarizeSheet\(rows, people, type\.id, me, db\.getSettings\(\)\)/.test(view) && /data-worksheet-summary/.test(view) && /data-summary-total/.test(view), 'écran : le résumé est affiché au-dessus du bouton « Enregistrer la feuille »');
ok(view.indexOf('data-worksheet-summary') < view.indexOf('data-worksheet-save'), 'écran : le résumé est AVANT le bouton d\'enregistrement');

console.log(`\n${pass}/${pass + fail} contrôles réussis`);
if (fail) process.exit(1);
