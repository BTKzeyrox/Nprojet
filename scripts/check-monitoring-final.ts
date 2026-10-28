// Contrôle final de la surveillance (M11.14) : réglages « Surveillance », alertes de la démo, vitesse avec 2 ans de données, opérateur sans accès, anglais. Lancer : npm run check:monitoring-final
import fs from 'node:fs';
import { runHealth, pageStates, type HealthContext } from '../src/utils/health/registry';
import { ALL_RULES } from '../src/utils/health/all';
import { HEALTH_THRESHOLDS_DEFAULT, HEALTH_THRESHOLDS_MAX, healthThresholds, HEALTH_PAGES, type HealthThresholds } from '../src/utils/health/types';
import { WATCH_FIELDS, parseWatchPrefs, checkWatchInput } from '../src/utils/health/watchPrefs';
import { buildDemoData } from '../src/demo/demoData';
let n = 0, fails = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK', m); };
const keys = Object.keys(HEALTH_THRESHOLDS_DEFAULT) as (keyof HealthThresholds)[];

// ---- réglages ----
ok(keys.every(k => WATCH_FIELDS.some(f => f.key === k)) && WATCH_FIELDS.length === keys.length, `réglages : les ${keys.length} seuils ont chacun un champ (aucun oublié, aucun en trop)`);
ok(WATCH_FIELDS.every(f => f.fr.length > 3 && f.en.length > 3 && f.unit.fr && f.unit.en && !/[àâçéèêëîïôùûœ]/i.test(f.en + f.unit.en)), 'réglages : textes FR et EN présents, anglais sans accents français');
ok(Object.keys(parseWatchPrefs('pas du json')).length === 0 && Object.keys(parseWatchPrefs(null)).length === 0 && Object.keys(parseWatchPrefs('[1]')).length === 0 && Object.keys(parseWatchPrefs('"x"')).length === 0, 'réglages : stockage illisible = valeurs de départ, sans exception');
const p1 = parseWatchPrefs({ validate_hours: 48, late_count: 0, absent_streak_days: -3, refusal_rate_pct: 101, min_periods: 2.5, ignore_days: '7', dormant_days: 90, hack: 5 });
ok(p1.validate_hours === 48 && Object.keys(p1).length === 1, 'réglages : seul le valide est gardé (0, négatif, au-dessus du maximum, décimal, texte, valeur de départ, champ inconnu = ignorés)');
ok(checkWatchInput('validate_hours', '').ok && (checkWatchInput('validate_hours', '') as any).value === null, 'saisie : vide = valeur de départ');
ok(!checkWatchInput('validate_hours', 'abc').ok && !checkWatchInput('validate_hours', '2.5').ok && !checkWatchInput('validate_hours', '-4').ok && !checkWatchInput('validate_hours', '0').ok && !checkWatchInput('validate_hours', `${HEALTH_THRESHOLDS_MAX.validate_hours + 1}`).ok, 'saisie : lettres, décimal, négatif, zéro et trop grand = refusés avec un message');
ok((checkWatchInput('validate_hours', '24') as any).value === null && (checkWatchInput('validate_hours', '36') as any).value === 36, 'saisie : la valeur de départ n\'est pas enregistrée ; une autre l\'est');
const th = healthThresholds({ watch: { ...{ validate_hours: 99 } } });
ok(th.validate_hours === 99 && th.late_count === HEALTH_THRESHOLDS_DEFAULT.late_count, 'seuils : un réglage change son seuil, les autres gardent leur valeur');

// ---- démo ----
const demo = buildDemoData();
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const mk = (over: Partial<HealthContext> = {}): HealthContext => ({ today, now: Date.now(), users: demo.users, posts: demo.posts, contracts: demo.contracts, clients: demo.clients, cash: demo.cash, products: demo.products, moves: demo.stock, advances: demo.advances, settings: {} as any, thresholds: HEALTH_THRESHOLDS_DEFAULT, backups: null, errors: null, ...over } as HealthContext);
const base = runHealth(mk(), ALL_RULES);
ok(base.errors.length === 0, 'démo : aucune règle en panne');
const sev = new Set(base.alerts.map(a => a.severity));
ok(sev.has('watch') && sev.size >= 2, `démo : plusieurs gravités visibles (${[...sev].join(', ')})`);
const states = pageStates(base.alerts, HEALTH_PAGES);
const stateSet = new Set(Object.values(states));
ok(stateSet.has('ok') && (stateSet.has('watch') || stateSet.has('urgent')), `démo : des pages « OK » et des pages avec alerte (${[...stateSet].join(', ')})`);
// « Mission terminée en moins de X minutes (trop rapide) » va dans le sens CONTRAIRE des autres seuils : plus X est grand, plus il y a d'alertes.
// Pour « très strict » il faut donc la valeur MAXIMALE, et pour « très large » la valeur MINIMALE (1).
const INVERSE = new Set<string>(['min_duration_minutes']);
const strict = runHealth(mk({ thresholds: Object.fromEntries(keys.map(k => [k, INVERSE.has(k) ? (HEALTH_THRESHOLDS_MAX as any)[k] : 1])) as any }), ALL_RULES).alerts.length;
const lax = runHealth(mk({ thresholds: Object.fromEntries(keys.map(k => [k, INVERSE.has(k) ? 1 : (HEALTH_THRESHOLDS_MAX as any)[k]])) as any }), ALL_RULES).alerts.length;
ok(strict >= base.alerts.length && base.alerts.length >= lax && strict > lax, `seuils : très stricts (${strict}) ≥ départ (${base.alerts.length}) ≥ très larges (${lax}) ; le réglage change bien le résultat`);

// ---- vitesse avec 2 ans de données ----
const U = demo.users.filter(u => u.role === 'employee');
const posts: any[] = [], cash: any[] = [], moves: any[] = [];
const T0 = Date.parse(today + 'T00:00:00Z');
for (let d = 0; d < 730; d++) {
  const date = new Date(T0 - d * 864e5).toISOString().slice(0, 10);
  for (let k = 0; k < 24; k++) { const src: any = demo.posts[(d * 24 + k) % demo.posts.length]; posts.push({ ...src, id: `big_${d}_${k}`, employee_id: U[k % U.length].id, date }); }
  for (let k = 0; k < 14; k++) { const src: any = demo.cash[(d * 14 + k) % demo.cash.length]; cash.push({ ...src, id: `bc_${d}_${k}`, date }); }
  for (let k = 0; k < 20; k++) { const src: any = demo.stock[(d * 20 + k) % demo.stock.length]; moves.push({ ...src, id: `bm_${d}_${k}`, date }); }
}
const bigCtx = mk({ posts, cash, moves } as any);
const t0 = Date.now(); const big = runHealth(bigCtx, ALL_RULES); const ms = Date.now() - t0;
ok(big.errors.length === 0, `2 ans de données (${posts.length} missions, ${cash.length} lignes d'argent, ${moves.length} mouvements) : aucune règle en panne`);
ok(ms < 2500, `vitesse : toutes les règles sur 2 ans de données en ${ms} ms (limite 2500 ms)`);

// ---- opérateur et branchements (code lu) ----
const hdb = fs.readFileSync('src/utils/healthDb.ts', 'utf8'), sb = fs.readFileSync('src/components/Sidebar.tsx', 'utf8'), app = fs.readFileSync('src/App.tsx', 'utf8'), sv = fs.readFileSync('src/views/admin/SettingsView.tsx', 'utf8');
ok(/me\?\.role !== 'admin'\) return \{ alerts: \[\]/.test(hdb), 'opérateur : getHealth renvoie une liste vide si ce n\'est pas l\'admin');
ok(/isAdmin \? getMenuBadges\(\)/.test(sb) && /isAdmin \? \[\{ id: 'health'/.test(sb), 'opérateur : ni pastille ni entrée « Santé du site » dans son menu');
const adminPart = app.indexOf("viewUser.role === 'admin' ?"), healthRoute = app.indexOf("activeView === 'health'");
ok(adminPart > 0 && healthRoute > adminPart, 'opérateur : la route « health » est dans la partie admin de l\'application');
ok(/<WatchSettingsSection \/>/.test(sv) && /<AiSettingsSection \/>/.test(sv), 'réglages : les sections Surveillance et IA sont dans la page Réglages');
ok(/loadWatchPrefs\(me\.id\)/.test(hdb) && /emit\(\)/.test(hdb.split('setWatchPrefs')[1] || ''), 'réglages : appliqués aux alertes et recalcul immédiat après un changement');
const en = JSON.parse(fs.readFileSync('src/utils/enDict.json', 'utf8'));
ok(en['Santé du site'] === 'Site health', 'anglais : « Santé du site » traduit');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
