// Salaire fixe dans la fiche de paie (T1). Lancer : npm run check:fixed-salary
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { fixedSalaryAr } from '../src/utils/fixedSalary';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const m = src.match(/\/\/ ===== BEGIN FIXEDSALARY =====\n([\s\S]*?)\/\/ ===== END FIXEDSALARY =====/);
if (!m) throw new Error('bloc serveur introuvable');
const mine = readFileSync('src/utils/fixedSalary.ts', 'utf8').match(/\/\/ ===== BEGIN FIXEDSALARY =====\n([\s\S]*?)\/\/ ===== END FIXEDSALARY =====/)![1];
ok(mine.replace(/\s+/g, ' ').trim() === m[1].replace(/\s+/g, ' ').trim(), 'le bloc du serveur est la copie exacte du code du site');
const S: any = new Function(transformSync(m[1] + '\nreturn fixedSalaryAr;', { loader: 'ts' }).code)();
const E = (o: any = {}) => ({ id: 'e', role: 'employee', status: 'active', pay_mode: 'fixed', ...o });
const st = (o: any = {}) => ({ company: { work: { pay_default: 'mission', rate_fixed_ar: 600000, ...o } } });
ok(fixedSalaryAr(E(), st(), '2026-11') === 600000, 'mois entier : le salaire du mois');
ok(fixedSalaryAr(E(), st(), '2026-11-A') === 300000 && fixedSalaryAr(E(), st(), '2026-11-B') === 300000, 'quinzaine A ou B : la moitié');
ok(fixedSalaryAr(E({ pay_rate_ar: 800000 }), st(), '2026-11') === 800000, 'tarif propre de l\'employé : il remplace celui de l\'entreprise');
ok(fixedSalaryAr(E({ pay_mode: undefined }), st({ pay_default: 'fixed' }), '2026-11') === 600000, 'mode de l\'entreprise « salaire fixe » : appliqué à l\'employé sans mode');
ok(fixedSalaryAr(E({ pay_mode: 'hour' }), st({ pay_default: 'fixed' }), '2026-11') === 0, 'employé payé à l\'heure : pas de salaire fixe');
ok(fixedSalaryAr(E({ pay_mode: undefined }), st(), '2026-11') === 0, 'ni lui ni l\'entreprise en « fixe » : 0 (une mission normale se paie comme avant)');
ok(fixedSalaryAr(E({ status: 'suspended' }), st(), '2026-11') === 0 && fixedSalaryAr(E({ role: 'admin' }), st(), '2026-11') === 0 && fixedSalaryAr(E({ role: 'accountant' }), st(), '2026-11') === 0, 'suspendu, responsable, comptable : 0');
ok(fixedSalaryAr(E(), st({ rate_fixed_ar: 0 }), '2026-11') === 0 && fixedSalaryAr(E(), st({ rate_fixed_ar: -5 }), '2026-11') === 0 && fixedSalaryAr(E(), st({ rate_fixed_ar: 1e9 }), '2026-11') === 0, 'salaire absent, négatif ou énorme : 0');
for (const bad of ['', 'x', '2026-13', '2026-00', '2026-11-C', '2026-1', undefined, null, 5]) ok(fixedSalaryAr(E(), st(), bad) === 0, `période illisible (${JSON.stringify(bad)}) : 0`);
ok(fixedSalaryAr(null, st(), '2026-11') === 0 && fixedSalaryAr(E(), null, '2026-11') === 0 && fixedSalaryAr('x', {}, '2026-11') === 0, 'rien ou n\'importe quoi : 0');
ok(fixedSalaryAr(E(), st({ rate_fixed_ar: 100001 }), '2026-11-A') === 50001, 'arrondi à l\'Ar');
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
let same = 0; const N = 5000;
for (let i = 0; i < N; i++) {
  const e = pick([null, 3, E(), E({ pay_rate_ar: pick([0, 5e5, -1, NaN, '9', 2e8]) }), E({ pay_mode: pick(['hour', 'x', undefined, 'fixed']) }), E({ status: pick(['active', 'suspended', undefined, 'pending']) }), E({ role: pick(['employee', 'admin', 'team_lead']) })]);
  const s = pick([null, {}, st(), st({ pay_default: pick(['fixed', 'day', 'z']), rate_fixed_ar: pick([0, 4e5, NaN, '5', 1e9]) })]);
  const pid = pick(['2026-11', '2026-11-A', '2026-11-B', '2026-02', 'x', 4, undefined, '2026-12-A', '2026-13']);
  if (fixedSalaryAr(e, s, pid) === S(e, s, pid)) same++;
}
ok(same === N, `site = serveur sur ${N} cas au hasard (${same} identiques)`);
const dm = readFileSync('src/db/store.ts', 'utf8');
ok(/fixedSalaryAr\(u, this\.settings, pidStr\)/.test(dm), 'démo : la fiche de paie ajoute le salaire fixe');
ok(/fixedSalaryAr\(u, stg, info\.pid\)/.test(src) && /client: 'Salaire fixe'/.test(src) && /if \(onlyUser && uid !== onlyUser\) continue/.test(src), 'serveur : une ligne « Salaire fixe » par fiche (et pour la bonne personne)');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
