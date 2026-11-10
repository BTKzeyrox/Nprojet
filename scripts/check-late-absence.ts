// Retard en minutes et motif d'absence (M27.8, 2026-11-10) : la paie (site postPay.ts = serveur decPostPay) donne les mêmes montants sur des milliers de cas ; règles : retard retiré (jamais / minute / 15 min), absence payée selon le motif, jamais négatif.
// Lancer : npm run check:late-absence
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
const { postPayAr } = await import('../src/utils/postPay');
const { planWorkEntries } = await import('../src/utils/workEntry');
const { workLineDetail } = await import('../src/utils/workLineText');
const { COMPANY_DEFAULTS, COMPANY_SPEC } = await import('../src/utils/companyRules');
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const grab = (name: string) => { const m = src.match(new RegExp(`// ===== BEGIN ${name}[^\\n]*\\n([\\s\\S]*?)// ===== END ${name} =====`)); if (!m) throw new Error(`bloc ${name} introuvable`); return m[1]; };
new Function(transformSync(grab('ROLES') + '\n' + grab('DECIDE') + '\n;globalThis.__t = { decPostPay };', { loader: 'ts' }).code)();
const S = (globalThis as any).__t;

const W = (extra: any = {}, mode = 'day') => ({ price_per_mission: 5000, company: { work: { pay_default: mode, rate_day_ar: 16000, rate_hour_ar: 2000, rate_piece_ar: 150, rate_fixed_ar: 400000, ...extra } } });
const P = (extra: any = {}) => ({ id: 'we-2026-11-09-e1-presence', work_type: 'presence', status: 'pending_end', ...extra });
const pay = (post: any, settings: any, emp: any = {}) => postPayAr(post, emp, settings);

// ---- retard ----
ok(pay(P({ presence: 'late', late_minutes: 30 }), W()) === 16000, 'réglage par défaut (jamais) : un retard ne retire rien');
ok(pay(P({ presence: 'late', late_minutes: 30 }), W({ late_rule: 'per_minute' })) === 15000, 'à la minute : 30 min = 1000 Ar de moins (16 000 / 8 h = 2 000 par heure)');
ok(pay(P({ presence: 'late', late_minutes: 20 }), W({ late_rule: 'per_15' })) === 14667 || pay(P({ presence: 'late', late_minutes: 20 }), W({ late_rule: 'per_15' })) === 15000 - 0, 'par tranche de 15 min : 20 min comptent 30 min');
ok(pay(P({ presence: 'late', late_minutes: 20 }), W({ late_rule: 'per_15' })) === 15000, 'par tranche de 15 min : 20 min = 30 min = 1000 Ar de moins');
ok(pay(P({ presence: 'late', late_minutes: 15 }), W({ late_rule: 'per_15' })) === 15500 && pay(P({ presence: 'late', late_minutes: 1 }), W({ late_rule: 'per_15' })) === 15500, '15 min pile ou 1 min = une tranche = 500 Ar');
ok(pay(P({ presence: 'late' }), W({ late_rule: 'per_minute' })) === 16000, 'en retard sans minutes : rien retiré');
ok(pay(P({ presence: 'late', late_minutes: 240 }), W({ late_rule: 'per_minute' })) === 8000, '4 h de retard : 4 × 2 000 retirés');
ok(pay(P({ presence: 'late', late_minutes: 600 }), W({ late_rule: 'per_minute' })) === 0 && pay(P({ presence: 'late', late_minutes: 600 }), W({ late_rule: 'per_minute', rate_day_ar: 2000 })) === 0, 'jamais en dessous de 0 (10 h de retard sur un jour de 8 h = 0)');
ok(pay(P({ presence: 'present', late_minutes: 60 }), W({ late_rule: 'per_minute' })) === 16000, 'présent (pas en retard) : minutes ignorées');
ok(pay(P({ presence: 'late', late_minutes: 60 }), W({ late_rule: 'per_minute' }, 'hour')) === 0 && pay(P({ presence: 'late', late_minutes: 60, hours: 7 }), W({ late_rule: 'per_minute' }, 'hour')) === 14000, 'paie par heure : le retard n\'est pas retiré (les heures saisies sont déjà les vraies)');
ok(pay(P({ presence: 'late', late_minutes: 60, quantity: 10 }), W({ late_rule: 'per_minute' }, 'piece')) === 1500, 'paie à la pièce : retard sans effet');
ok(pay(P({ presence: 'late', late_minutes: 30 }), W({ late_rule: 'per_minute' }), { pay_rate_ar: 8000 }) === 7500, 'tarif propre de l\'employé : le retard suit ce tarif (8 000 / 8 h)');
ok(pay({ id: 'x', status: 'pending_end', presence: 'late', late_minutes: 30 }, W({ late_rule: 'per_minute' })) === 5000, 'une mission normale (sans type de travail) : toujours le prix par mission');

// ---- absence payée ----
ok(pay(P({ presence: 'absent', absence_reason: 'leave' }), W()) === 16000, 'défaut : absence « Congé » payée (1 jour)');
ok(pay(P({ presence: 'absent', absence_reason: 'sick' }), W()) === 0 && pay(P({ presence: 'absent', absence_reason: 'none' }), W()) === 0 && pay(P({ presence: 'absent', absence_reason: 'other' }), W()) === 0 && pay(P({ presence: 'absent' }), W()) === 0, 'défaut : maladie, sans motif, autre, ou pas de motif = 0');
ok(pay(P({ presence: 'absent', absence_reason: 'sick' }), W({ absence_paid_sick: true })) === 16000, 'réglage « Maladie payée » : 1 jour');
ok(pay(P({ presence: 'absent', absence_reason: 'leave' }), W({}, 'hour')) === 16000 && pay(P({ presence: 'absent', absence_reason: 'sick' }), W({ absence_paid_sick: true }, 'hour')) === 16000, 'paie par heure : 8 h × 2 000 = 16 000');
ok(pay(P({ presence: 'absent', absence_reason: 'leave' }), W({ absence_paid_leave: false })) === 0, 'congé non payé si on le décoche');
ok(pay(P({ presence: 'present', absence_reason: 'leave' }), W()) === 16000 && pay(P({ presence: 'half', absence_reason: 'leave' }), W()) === 8000, 'motif sans absence : sans effet (présent = 1 jour, demi = moitié)');
ok(pay(P({ presence: 'absent', absence_reason: 'leave' }), W({}, 'piece')) === 0 && pay(P({ presence: 'absent', absence_reason: 'leave' }), W({}, 'fixed')) === 0, 'paie à la pièce ou fixe : une absence ne paie rien');
ok(pay(P({ presence: 'absent', absence_reason: 'leave' }), W({ rate_day_ar: 0 })) === 0, 'tarif du jour non réglé (0) : 0');
ok(pay(P({ presence: 'absent', absence_reason: 'leave' }), W({ absence_paid_leave: 'oui' as any })) === 0, 'valeur du réglage pas vraiment « vrai » : traité comme non');

// ---- site = serveur sur beaucoup de cas ----
const pres = ['present', 'late', 'half', 'absent', undefined, 'x'];
const reasons = ['sick', 'leave', 'none', 'other', undefined, 'bizarre', 5];
const mins = [undefined, 0, 1, 14, 15, 16, 30, 45, 59, 600, 601, -5, 'x', NaN, 2.5];
const rules = ['never', 'per_minute', 'per_15', undefined, 'zzz'];
const modes = ['day', 'hour', 'piece', 'fixed', 'mission'];
const flags = [true, false, undefined, 'x'];
const emps = [{}, { pay_rate_ar: 9000 }, { pay_mode: 'hour' }, { pay_mode: 'day', pay_rate_ar: 20000 }, null];
let bad = 0, total = 0, neg = 0;
for (const pr of pres) for (const rs of reasons) for (const mn of mins) for (const rule of rules) for (const mode of modes) {
  const flag = flags[(total) % flags.length];
  const st = W({ late_rule: rule, absence_paid_sick: flag, absence_paid_leave: flags[(total + 1) % 4], absence_paid_none: flag, absence_paid_other: flags[(total + 2) % 4] }, mode);
  const post = P({ presence: pr, absence_reason: rs, late_minutes: mn, hours: total % 3 ? 7.5 : undefined, quantity: total % 2 ? 12 : undefined, rejected: 2 });
  const emp = emps[total % emps.length];
  const a = postPayAr(post, emp, st), b = S.decPostPay(post, emp, st);
  total++;
  if (a !== b) { bad++; if (bad < 4) console.log('  différence', JSON.stringify({ pr, rs, mn, rule, mode }), a, b); }
  if (!(Number.isInteger(a) && a >= 0)) neg++;
}
ok(total > 9000 && bad === 0, `site = serveur sur ${total} cas (présence × motif × minutes × règle × mode)`);
ok(neg === 0, 'jamais de montant négatif, décimal ou infini');

// ---- saisie (WORKENTRY) ----
const admin = { id: 'a', role: 'admin', name: 'Admin' }; const emp = { id: 'e1', role: 'employee', name: 'Ana', status: 'active' };
const plan = (lines: any[], settings: any = W({ late_rule: 'per_minute' })) => planWorkEntries(admin, [admin, emp], [], { date: '2026-11-09', lines }, settings, '2026-11-09T09:00:00.000Z', '2026-11-09');
const L = (extra: any) => ({ employee_id: 'e1', work_type: 'presence', ...extra });
let r = plan([L({ presence: 'late', late_minutes: '30' })]);
ok(r.saved[0].late_minutes === 30 && r.saved[0].calculated_ar === 15000, 'saisie d\'un retard de 30 min : 15 000 Ar calculés et minutes gardées');
r = plan([L({ presence: 'absent', absence_reason: 'leave' })]);
ok(r.saved[0].absence_reason === 'leave' && r.saved[0].calculated_ar === 16000, 'saisie d\'une absence en congé : motif gardé, 16 000 Ar');
r = plan([L({ presence: 'present', late_minutes: 30, absence_reason: 'leave' })]);
ok(r.saved[0].late_minutes === undefined && r.saved[0].absence_reason === undefined, 'minutes et motif ne sont gardés que pour « en retard » / « absent »');
ok(plan([L({ presence: 'late', late_minutes: '601' })]).failed[0]?.error === 'late_minutes' && plan([L({ presence: 'late', late_minutes: '2,5' })]).failed[0]?.error === 'late_minutes' && plan([L({ presence: 'late', late_minutes: 'abc' })]).failed[0]?.error === 'late_minutes' && plan([L({ presence: 'late', late_minutes: -3 })]).failed[0]?.error === 'late_minutes', 'minutes trop grandes, décimales, texte ou négatives : ligne refusée');
ok(plan([L({ presence: 'absent', absence_reason: 'vacances' })]).failed[0]?.error === 'absence_reason', 'motif inconnu : ligne refusée');
ok(plan([L({ presence: 'absent', absence_reason: '' })]).saved.length === 1 && plan([L({ presence: 'late', late_minutes: '' })]).saved.length === 1, 'motif ou minutes vides : acceptés');
ok(workLineDetail({ presence: 'late', late_minutes: 20 }) === 'En retard · 20 min de retard' && workLineDetail({ presence: 'absent', absence_reason: 'sick' }) === 'Absent · motif : maladie', 'texte des listes : « En retard · 20 min de retard », « Absent · motif : maladie »');

// ---- réglages ----
const wd: any = (COMPANY_DEFAULTS as any).work, ws: any = (COMPANY_SPEC as any).work;
ok(wd.late_rule === 'never' && wd.absence_paid_leave === true && wd.absence_paid_sick === false && wd.absence_paid_none === false && wd.absence_paid_other === false, 'valeurs de départ : retard jamais retiré, seul le congé payé');
ok(['late_rule', 'absence_paid_sick', 'absence_paid_leave', 'absence_paid_none', 'absence_paid_other'].every(k => !!ws[k]), 'réglages connus du filtre « company »');
const cc = readFileSync('src/components/CompanyConditions.tsx', 'utf8'), wv = readFileSync('src/views/WorksheetView.tsx', 'utf8');
ok(['late_rule', 'absence_paid_sick', 'absence_paid_leave', 'absence_paid_none', 'absence_paid_other'].every(k => cc.includes(`key: '${k}'`)), 'les 5 réglages sont visibles dans Réglages > Conditions, chacun avec son défaut annoncé');
ok(/data-field="late_minutes"/.test(wv) && /data-field="absence_reason"/.test(wv), 'écran : champ « Minutes de retard » et liste « Motif d\'absence » sur la ligne');
ok(/late_rule: \{ t: "enum", vals: \["never", "per_minute", "per_15"\] \}/.test(src) && /late_rule: "never", absence_paid_sick: false, absence_paid_leave: true/.test(src), 'serveur : réglages et valeurs de départ présents dans le bloc COMPANY');
console.log(`\n${n - fails}/${n} contrôles OK`);
process.exit(fails ? 1 : 0);
