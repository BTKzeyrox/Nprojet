// Annuler une ligne de la feuille du jour (point faible T2). Lancer : npm run check:work-cancel
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { planWorkCancel } from '../src/utils/workEntry';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const blk = src.match(/\/\/ ===== BEGIN WORKENTRY[^\n]*\n([\s\S]*?)\/\/ ===== END WORKENTRY =====/)![1];
const S: any = new Function(transformSync('const decPostPay = (..._a: any[]) => 0;\n' + blk + '\nreturn planWorkCancel;', { loader: 'ts' }).code)();
const admin = { id: 'a', role: 'admin' }, lead = { id: 'l', role: 'team_lead' }, emp = { id: 'e', role: 'employee', total_earnings_ar: 50000 };
const line = (o: any = {}) => ({ id: 'we-2026-11-05-e-pack', employee_id: 'e', work_type: 'pack', status: 'completed', calculated_ar: 12000, ...o });

let r: any = planWorkCancel(admin, line(), emp, false);
ok(r.ok && r.id === 'we-2026-11-05-e-pack' && r.user.total_earnings_ar === 38000, 'ligne validée : la paie (12 000) est retirée du total (50 000 → 38 000)');
ok(emp.total_earnings_ar === 50000, 'l\'employé de départ n\'est pas modifié (copie)');
r = planWorkCancel(admin, line({ status: 'pending_end' }), emp, false);
ok(r.ok && r.user === null, 'ligne en attente : aucune paie à retirer');
ok((planWorkCancel(admin, line({ calculated_ar: 999999 }), emp, false) as any).user.total_earnings_ar === 0, 'jamais de total négatif');
ok((planWorkCancel(lead, line(), emp, false) as any).error === 'role' && (planWorkCancel({ id: 'x', role: 'employee' }, line(), emp, false) as any).error === 'role' && (planWorkCancel(null, line(), emp, false) as any).error === 'role', 'responsable seulement (chef d\'équipe, opérateur, personne : refusé)');
ok((planWorkCancel(admin, { id: 'post-1', employee_id: 'e', status: 'completed', calculated_ar: 10 }, emp, false) as any).error === 'notline', 'une mission normale ne s\'annule pas ici');
ok((planWorkCancel(admin, line({ id: 'we-x', work_type: '' }), emp, false) as any).error === 'notline' && (planWorkCancel(admin, null, emp, false) as any).error === 'notline' && (planWorkCancel(admin, line({ status: 'rejected' }), emp, false) as any).error === 'notline', 'ligne sans type, absente ou refusée : refusé');
ok((planWorkCancel(admin, line(), emp, true) as any).error === 'closed', 'période de paie clôturée : refusé');
ok(planWorkCancel(admin, line(), null, false).ok === true && (planWorkCancel(admin, line(), null, false) as any).user === null, 'employé disparu : la ligne s\'annule quand même, sans toucher au total');
let seed = 3; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
let same = 0; const N = 4000;
for (let i = 0; i < N; i++) {
  const me = pick([null, admin, lead, { role: 'employee' }]);
  const p = pick([null, 4, line(), line({ status: pick(['completed', 'pending_end', 'rejected', 'active']) }), line({ calculated_ar: pick([NaN, -5, '7', 1e12, 0]) }), line({ id: pick(['post-1', 'we-q', 5]) }), line({ work_type: pick(['', 3, 'x']) })]);
  const e = pick([null, emp, { ...emp, total_earnings_ar: pick([NaN, -3, '8', 5]) }]);
  const c = pick([true, false]);
  if (JSON.stringify(planWorkCancel(me, p, e, c)) === JSON.stringify(S(me, p, e, c))) same++;
}
ok(same === N, `site = serveur sur ${N} cas au hasard (${same} identiques)`);
const st = readFileSync('src/db/store.ts', 'utf8'), ws = readFileSync('src/views/WorksheetView.tsx', 'utf8');
ok(/async workCancelRoute|async function workCancelRoute/.test(src) && /action === "work-line-cancel" && req\.method === "POST"/.test(src) && /planWorkCancel\(me, post, urow\?\.data \|\| null, closed\)/.test(src), 'serveur : route branchée, période clôturée vérifiée');
ok(/closed = \(prs \|\| \[\]\)\.some/.test(src) && /'work_cancel'/.test(src), 'serveur : période clôturée et journal d\'audit');
ok(/async cancelWorkLine/.test(st) && /'work-line-cancel'/.test(st), 'magasin : démo et serveur');
ok(/data-worksheet-existing/.test(ws) && /me\.role === 'admin' && dayLines\.length > 0/.test(ws) && /window\.confirm/.test(ws), 'écran : liste des lignes du jour avec « Annuler » (responsable, avec confirmation)');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
