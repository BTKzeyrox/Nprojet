// Contrôle des seuils de Surveillance PARTAGÉS (Conditions > Surveillance, M11.14 « Accord Surveillance »). Sans réseau. Lancer : npm run check:watch-shared
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { COMPANY_DEFAULTS, COMPANY_SPEC, cleanCompany, companyForEmployee, companyDiff } from '../src/utils/companyRules';
import { HEALTH_THRESHOLDS_DEFAULT, HEALTH_THRESHOLDS_MAX, healthThresholds } from '../src/utils/health/types';
import { WATCH_FIELDS } from '../src/utils/health/watchPrefs';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const src = fs.readFileSync(new URL('../supabase/functions/df-api/index.ts', import.meta.url), 'utf8');
const m = /\/\/ ===== BEGIN COMPANY[^\n]*\n([\s\S]*?)\/\/ ===== END COMPANY =====/.exec(src)!;
const srv = new Function(`${transformSync(m[1], { loader: 'ts' }).code}\nreturn { COMPANY_DEFAULTS, cleanCompany, companyForEmployee, companyDiff, COMPANY_SPEC };`)() as any;
const keys = Object.keys(HEALTH_THRESHOLDS_DEFAULT);

ok(JSON.stringify(Object.keys(COMPANY_SPEC.watch)) === JSON.stringify(keys) && JSON.stringify(Object.keys(COMPANY_DEFAULTS.watch)) === JSON.stringify(keys), 'les 17 seuils de la section = ceux de la Santé du site (mêmes noms, même ordre)');
ok(keys.every(k => (COMPANY_SPEC.watch[k] as any).max === (HEALTH_THRESHOLDS_MAX as any)[k] && (COMPANY_SPEC.watch[k] as any).min === 0), 'chaque maximum = celui de la Santé du site ; 0 permis (= valeur de départ)');
ok(JSON.stringify(srv.COMPANY_SPEC.watch) === JSON.stringify(COMPANY_SPEC.watch) && JSON.stringify(srv.COMPANY_DEFAULTS.watch) === JSON.stringify(COMPANY_DEFAULTS.watch), 'le serveur a exactement la même section (limites et valeurs de départ)');
ok(WATCH_FIELDS.length === keys.length, 'la page Conditions propose un champ par seuil');

for (const who of [{ name: 'site', f: cleanCompany }, { name: 'serveur', f: srv.cleanCompany }]) {
  const r = who.f({ watch: { validate_hours: 48, late_count: 5, refusal_rate_pct: 150, dormant_days: -3, error_hours: 'abc', min_periods: '7' } });
  ok(r.value.watch.validate_hours === 48 && r.value.watch.late_count === 5 && r.value.watch.min_periods === 7, `${who.name} : valeurs valides gardées (texte numérique accepté)`);
  ok(r.value.watch.refusal_rate_pct === 0 && r.value.watch.dormant_days === 0 && r.value.watch.error_hours === 0 && r.errors.includes('watch.refusal_rate_pct') && r.errors.includes('watch.dormant_days') && r.errors.includes('watch.error_hours'), `${who.name} : hors limites, négatif et texte refusés (retour à 0 = départ)`);
  ok(JSON.stringify(who.f({ watch: { evil: 1, __proto__: { x: 1 } } }).value.watch) === JSON.stringify(COMPANY_DEFAULTS.watch), `${who.name} : champ inconnu ignoré`);
  ok(JSON.stringify(who.f(undefined).value.watch) === JSON.stringify(COMPANY_DEFAULTS.watch) && who.f('x').errors.length > 0, `${who.name} : rien envoyé = valeurs de départ ; mauvais format refusé`);
}
const full = cleanCompany({ watch: { validate_hours: 48 }, leave: { leave_days_per_year: 20 } }).value;
ok(!('watch' in (srv.companyForEmployee(full) as any)) && !('watch' in companyForEmployee(full as any)), 'un opérateur ne reçoit jamais les seuils (site et serveur)');
ok(companyDiff(COMPANY_DEFAULTS, full).some(d => d.path === 'watch.validate_hours') && srv.companyDiff(COMPANY_DEFAULTS, full).some((d: any) => d.path === 'watch.validate_hours'), 'un changement de seuil est écrit dans l\'historique des Conditions');
ok(healthThresholds({ watch: full.watch as any }).validate_hours === 48 && healthThresholds({ watch: full.watch as any }).late_count === 3, 'les seuils à 0 gardent la valeur de départ, les autres s\'appliquent');

const hd = fs.readFileSync('src/utils/healthDb.ts', 'utf8'), cc = fs.readFileSync('src/components/CompanyConditions.tsx', 'utf8');
ok(/\.\.\.\(st\.company\?\.watch \|\| \{\}\), \.\.\.loadWatchPrefs\(me\.id\)/.test(hd), 'priorité : réglage de l\'appareil > réglage partagé > valeur de départ');
ok(/id: 'watch'/.test(cc) && /\.\.\.WATCH_F/.test(cc), 'page Conditions : section « Surveillance » présente');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
