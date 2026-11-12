// Calendrier : le détail d'un jour suit les types de travail (feuille du jour). Une ligne de présence/heures/quantité n'est JAMAIS une mission.
// Règles de texte = celles de workLineText (Validations, Historique). Contrôle : npm run check:calendar-worktypes
import { readFileSync } from 'node:fs';
import { dayDetail, queuedLineRows } from '../src/utils/dayDetail';
import { dayView, empMonth, globalMonth, globalSummary } from '../src/utils/calendarGlobal';
import { workLineDetail, workLineBy } from '../src/utils/workLineText';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const D = '2026-10-28';
const base: any = { account_tag: '', employee_id: 'a', employee_name: 'A', date: D, start_time: '08:00:00', initial_score: 0, current_score: 0, target_score: 0, calculated_ar: 0 };
const mission = { ...base, id: 'm1', client_name: 'Client X', status: 'completed', initial_score: 10, current_score: 20, target_score: 20 };
const pres = { ...base, id: 'w1', client_name: 'Présence', work_type: 'presence', presence: 'late', late_minutes: 15, status: 'completed', entered_by_name: 'Chef Dupont' };
const qty = { ...base, id: 'w2', client_name: 'Emballage', work_type: 'pack', quantity: 200, rejected: 10, status: 'pending_end' };
const posts: any[] = [mission, pres, qty];
const d = dayDetail(posts, undefined, 'a', D, 0, '2026-10-29', 'all', id => id === 'w2');
ok(d.missions.length === 1 && d.missions[0].id === 'm1', 'les missions ne contiennent PAS les lignes de travail');
ok(d.totals.missions === 1, 'total de missions = 1 (les lignes de la feuille ne comptent pas)');
ok(d.workLines.length === 2, 'les 2 lignes de la feuille sont dans « Travail saisi »');
const w1 = d.workLines.find(w => w.id === 'w1')!, w2 = d.workLines.find(w => w.id === 'w2')!;
ok(w1.text === workLineDetail(pres) && w1.text.includes('retard') && w1.by === workLineBy(pres) && w1.by.includes('Chef Dupont') && w1.state === 'validated', 'présence : même texte que les Validations + « Saisi par »');
ok(w2.text.includes('200 faites') && w2.text.includes('10 refusées') && w2.state === 'waiting' && w2.unsent === true, 'quantité : texte des règles, en attente, marquée « pas encore envoyée »');
const onlyPres = dayDetail([pres], undefined, 'a', D, 0, '2026-10-29');
ok(onlyPres.missions.length === 0 && onlyPres.workLines.length === 1, 'présence seule : zéro mission');
// feuille gardée sur le téléphone (hors ligne)
const queue = [{ id: 'q1', state: 'pending', payload: { date: D, type_label: 'Présence', lines: [{ employee_id: 'a', work_type: 'presence', presence: 'present', hours: 8 }, { employee_id: 'b', work_type: 'presence', presence: 'absent', absence_reason: 'sick' }] } }];
const q = queuedLineRows(queue, 'a', D);
ok(q.length === 1 && q[0].unsent && q[0].text === 'Présent · 8 h' && q[0].type === 'Présence', 'feuille hors ligne : ligne de la personne, « pas encore envoyée »');
ok(queuedLineRows(queue, 'a', '2026-10-27').length === 0 && queuedLineRows(queue, 'c', D).length === 0 && queuedLineRows(null as any, 'a', D).length === 0, 'autre jour, autre personne ou file cassée : rien (jamais d\'erreur)');
ok(dayDetail([], undefined, 'a', D, 0, '2026-10-29', 'all', undefined, queue).workLines.length === 1, 'dayDetail ajoute les lignes gardées sur le téléphone');
// vue du jour
const cfg: any = { day_shift_start: '08:00', night_shift_start: '20:00', shift_mode: 'day' };
const rows = dayView(D, [{ id: 'a', name: 'A', shift: 'day' } as any], { posts, leaves: [], today: '2026-10-29', cfg }, { a: D });
ok(rows[0].missions === 1 && rows[0].validated === 1 && rows[0].workLines === 2, 'vue du jour : 1 mission, 2 lignes de feuille comptées à part');
const rp = dayView(D, [{ id: 'a', name: 'A', shift: 'day' } as any], { posts: [pres], leaves: [], today: '2026-10-29', cfg }, { a: D });
ok(rp[0].missions === 0 && rp[0].firstStart === null && rp[0].workLines === 1, 'présence seule : 0 mission, pas de « 1re mission » inventée');
const ctx2: any = { posts: [mission, pres, qty], leaves: [], today: '2026-10-29', cfg };
const em = empMonth(2026, 9, 'a', ctx2, { a: D })[27];
ok(em.missions === 1 && em.validated === 1 && em.workLines === 2, 'mois d\'une personne : 1 mission, 2 lignes de feuille à part');
const gm = globalMonth(2026, 9, [{ id: 'a', name: 'A', shift: 'day' } as any], ctx2, { a: D })[27];
ok(gm.missions === 1 && gm.workLines === 2, 'mois global : même séparation');
const gs = globalSummary(2026, 9, [{ id: 'a', name: 'A', shift: 'day' } as any], ctx2, { a: D });
ok(gs.missions === 1 && gs.validated === 1 && gs.refused === 0 && gs.workLines === 2 && gs.inProgress === 0 && gs.rows[0].workLines === 2, 'résumé du mois : missions sans les lignes de feuille, « en cours » aussi');
const ui = readFileSync('src/views/CalendarView.tsx', 'utf8');
ok(/Travail saisi/.test(ui) && /day-worklines-/.test(ui) && /getQueuedSheets\(\)/.test(ui) && /présence[^`]*seule/.test(ui) && /Feuille du jour/.test(ui), 'écran : bloc « Travail saisi », feuilles gardées, compteur « présence seule »');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
