// Contrôle des Conditions de l'entreprise (module 0), sans réseau.
// Lancer : npm run check:company
// 1) règles du site (src/utils/companyRules.ts) sur les cas normaux et piégés ;
// 2) le bloc COMPANY du serveur donne EXACTEMENT les mêmes résultats ;
// 3) un employé ne reçoit jamais d'argent, de TVA, d'identifiants fiscaux ni le journal ; l'écriture est revérifiée par le serveur.
// Si quelqu'un retire une protection, ce contrôle échoue.
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { COMPANY_DEFAULTS, cleanCompany, companyDiff, companyForEmployee } from '../src/utils/companyRules';

const src = fs.readFileSync(new URL('../supabase/functions/df-api/index.ts', import.meta.url), 'utf8');
let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const J = (x: unknown) => JSON.stringify(x);
const clone = <T,>(x: T): T => structuredClone(x);

// ---------- serveur : extraction du bloc ----------
const m = /\/\/ ===== BEGIN COMPANY[^\n]*\n([\s\S]*?)\/\/ ===== END COMPANY =====/.exec(src);
ok(!!m, 'bloc « COMPANY » trouvé dans le serveur');
const js = transformSync(m![1], { loader: 'ts' }).code;
const srv = new Function(`${js}\nreturn { COMPANY_DEFAULTS, cleanCompany, companyDiff, companyForEmployee, stripCompany, cleanSettingsRecord };`)() as any;

// ---------- règles du site ----------
const d = clone(COMPANY_DEFAULTS);
{
  const r = cleanCompany(d);
  ok(r.errors.length === 0 && J(r.value) === J(d), 'valeurs de départ : valides et inchangées');
  ok(J(cleanCompany(undefined).value) === J(d) && J(cleanCompany({}).value) === J(d), 'rien envoyé = valeurs de départ');
  ok(d.tax.vat_enabled === false && d.billing.payment_days === 30 && d.billing.invoice_prefix === 'FA-' && d.billing.receipt_prefix === 'RC-' && d.identity.currency === 'Ar' && d.legal.tax_id === '' && d.legal.register_id === '', 'départ : TVA non, 30 jours, FA-/RC-, Ar, aucun identifiant légal inventé');
  ok(d.clients.new_days === 60 && d.clients.regular_missions === 3 && d.clients.regular_months === 6 && d.clients.strategic_top_pct === 20 && d.clients.strategic_months === 12 && d.clients.strategic_min_missions === 5 && d.clients.inactive_days === 90, 'départ : seuils des statuts clients = ceux du plan (60 j, 3 missions sur 6 mois, 20 % et 5 missions sur 12 mois, 90 j)');
  ok(d.options.invoice_per === 'client_month' && d.options.quotes_enabled === false && d.options.employee_sees_badges && !d.options.employee_sees_attention && d.options.mission_requires_client && d.missions.refusal_reason_required, 'départ : choix D5 à D11 comme prévu');
}
// cas : [section, clé, valeur envoyée, valeur attendue, refusée ?]
const cases: [string, string, unknown, unknown, boolean][] = [
  ['tax', 'vat_rate', 20, 20, false], ['tax', 'vat_rate', 0, 0, false], ['tax', 'vat_rate', 100, 100, false], ['tax', 'vat_rate', '7.555', 7.56, false],
  ['tax', 'vat_rate', 150, 0, true], ['tax', 'vat_rate', -1, 0, true], ['tax', 'vat_rate', 'abc', 0, true], ['tax', 'vat_rate', NaN, 0, true], ['tax', 'vat_rate', Infinity, 0, true], ['tax', 'vat_rate', '', 0, true], ['tax', 'vat_rate', null, 0, true],
  ['tax', 'vat_enabled', 'true', false, true], ['tax', 'vat_enabled', true, true, false], ['tax', 'vat_enabled', 1, false, true],
  ['billing', 'payment_days', 45, 45, false], ['billing', 'payment_days', '30', 30, false], ['billing', 'payment_days', 30.4, 30, false], ['billing', 'payment_days', 400, 30, true], ['billing', 'payment_days', -5, 30, true],
  ['billing', 'invoice_prefix', 'FAC/', 'FAC/', false], ['billing', 'invoice_prefix', 'FA-<b>', 'FA-b', false], ['billing', 'invoice_prefix', 'ABCDEFGHIJK', 'FA-', true], ['billing', 'invoice_prefix', 5, 'FA-', true], ['billing', 'invoice_prefix', '', '', false],
  ['identity', 'name', '<script>alert(1)</script>Ma société', 'alert(1)Ma société', false], ['identity', 'name', 'A'.repeat(81), '', true], ['identity', 'name', 'A'.repeat(80), 'A'.repeat(80), false], ['identity', 'name', 123, '', true], ['identity', 'name', 'Ligne1\nLigne2\u0000', 'Ligne1 Ligne2', false],
  ['identity', 'email', 'contact@exemple.mg', 'contact@exemple.mg', false], ['identity', 'email', 'pas un mail', '', true], ['identity', 'email', 'a@b.c<script>', '', true], ['identity', 'email', '', '', false],
  ['identity', 'logo_url', 'https://exemple.mg/logo.png', 'https://exemple.mg/logo.png', false], ['identity', 'logo_url', 'http://exemple.mg/logo.png', '', true], ['identity', 'logo_url', 'javascript:alert(1)', '', true], ['identity', 'logo_url', 'https://x.mg/a b', '', true],
  ['payroll', 'pay_day', 31, 31, false], ['payroll', 'pay_day', 32, 0, true], ['payroll', 'pay_rounding', '100', '100', false], ['payroll', 'pay_rounding', '50', 'none', true],
  ['leave', 'late_limit_time', '08:30', '08:30', false], ['leave', 'late_limit_time', '25:00', '', true], ['leave', 'late_limit_time', '8:30', '', true], ['leave', 'leave_days_per_year', 30, 30, false], ['leave', 'leave_days_per_year', 61, 0, true], ['leave', 'work_days_per_week', 8, 0, true],
  ['missions', 'validation_hours', 48, 48, false], ['missions', 'validation_hours', 721, 0, true], ['missions', 'refusal_reason_required', false, false, false],
  ['clients', 'new_days', 90, 90, false], ['clients', 'new_days', 0, 60, true], ['clients', 'new_days', 366, 60, true], ['clients', 'new_days', 'abc', 60, true], ['clients', 'new_days', '45', 45, false],
  ['clients', 'regular_months', 24, 24, false], ['clients', 'regular_months', 25, 6, true], ['clients', 'regular_missions', 0, 3, true], ['clients', 'strategic_top_pct', 50, 50, false], ['clients', 'strategic_top_pct', 101, 20, true],
  ['clients', 'strategic_months', 36, 36, false], ['clients', 'strategic_months', 37, 12, true], ['clients', 'strategic_min_missions', 1000, 1000, false], ['clients', 'strategic_min_missions', 1001, 5, true], ['clients', 'inactive_days', 730, 730, false], ['clients', 'inactive_days', -1, 90, true],
  ['options', 'invoice_per', 'mission', 'mission', false], ['options', 'invoice_per', 'weekly', 'client_month', true],
  ['texts', 'internal_rules', 'Règle 1\nRègle 2', 'Règle 1\nRègle 2', false], ['texts', 'internal_rules', '<img src=x onerror=alert(1)>Texte', 'Texte', false], ['texts', 'internal_rules', 'x'.repeat(5001), '', true], ['texts', 'internal_rules', 'x'.repeat(5000), 'x'.repeat(5000), false],
  ['legal', 'notes', ['RCS 123', '', '  ', 'NIF 456'], ['RCS 123', 'NIF 456'], false], ['legal', 'notes', Array.from({ length: 11 }, (_, i) => `l${i}`), [], true], ['legal', 'notes', ['a'.repeat(201)], [], true], ['legal', 'notes', 'texte seul', [], true], ['legal', 'notes', [1, 2], [], true],
];
const results: unknown[] = [];
for (const [sec, key, sent, want, bad] of cases) {
  const r = cleanCompany({ [sec]: { [key]: sent } });
  const got = (r.value as any)[sec][key];
  const label = `${sec}.${key} ← ${J(sent === undefined ? 'undefined' : typeof sent === 'number' && !Number.isFinite(sent) ? String(sent) : sent).slice(0, 40)}`;
  ok(J(got) === J(want) && r.errors.includes(`${sec}.${key}`) === bad && r.errors.length === (bad ? 1 : 0), label);
  results.push(r);
}
{
  // une valeur refusée garde l'existant, pas la valeur de départ
  const base = cleanCompany({ tax: { vat_enabled: true, vat_rate: 20 } }).value;
  const r = cleanCompany({ tax: { vat_rate: 999 } }, base);
  ok(r.value.tax.vat_rate === 20 && r.value.tax.vat_enabled === true && r.errors.length === 1, 'valeur refusée : l\'existant est gardé');
  const r2 = cleanCompany({ tax: { vat_rate: 5 } }, base);
  ok(r2.value.tax.vat_rate === 5 && r2.value.tax.vat_enabled === true, 'champ non envoyé : l\'existant est gardé');
  // champs et sections inconnus
  const r3 = cleanCompany({ inconnu: { a: 1 }, tax: { vat_rate: 10, secret: 'x' }, __proto__: { hack: 1 } } as any);
  ok(!('inconnu' in r3.value) && !('secret' in (r3.value.tax as any)) && r3.value.tax.vat_rate === 10, 'section et champ inconnus ignorés');
  const r4 = cleanCompany(JSON.parse('{"__proto__":{"polluted":1},"tax":{"__proto__":{"polluted":2}}}'));
  ok(!(({}) as any).polluted && !('polluted' in r4.value) && !('polluted' in (r4.value.tax as any)), 'pollution de prototype impossible');
  // entrées de mauvais type
  for (const bad of ['texte', 42, [], true]) ok(J(cleanCompany(bad).value) === J(d), `entrée de type ${typeof bad}${Array.isArray(bad) ? ' (tableau)' : ''} : valeurs de départ`);
  ok(cleanCompany({ tax: 'oups' }).errors.includes('tax') && cleanCompany({ tax: 'oups' }).value.tax.vat_rate === 0, 'section qui n\'est pas un objet : refusée');
  // le résultat ne partage pas de tableau avec les valeurs de départ
  const a = cleanCompany({}).value; a.legal.notes.push('x');
  ok(COMPANY_DEFAULTS.legal.notes.length === 0, 'les valeurs de départ ne sont jamais modifiées par un résultat');
}

// ---------- historique des changements ----------
{
  const a = cleanCompany({}).value, b = cleanCompany({ tax: { vat_enabled: true, vat_rate: 20 }, legal: { notes: ['A', 'B'] } }).value;
  const diff = companyDiff(a, b);
  ok(J(diff.map((x) => x.path).sort()) === J(['legal.notes', 'tax.vat_enabled', 'tax.vat_rate']), 'historique : seuls les champs changés sont listés');
  ok(diff.find((x) => x.path === 'tax.vat_enabled')!.before === 'false' && companyDiff(b, b).length === 0, 'historique : valeur d\'avant gardée, rien si pas de changement');
  ok(companyDiff(cleanCompany({ texts: { internal_rules: 'y'.repeat(500) } }).value, a)[0].before.length === 120, 'historique : valeur d\'avant coupée à 120 caractères');
}

// ---------- le serveur donne les mêmes résultats que le site ----------
{
  ok(J(srv.COMPANY_DEFAULTS) === J(COMPANY_DEFAULTS), 'serveur : mêmes valeurs de départ que le site');
  const inputs: unknown[] = [undefined, null, {}, 'x', 5, [], d, ...cases.map(([s, k, v]) => ({ [s]: { [k]: v } })),
    { tax: { vat_enabled: true, vat_rate: 18.456 }, identity: { name: ' <b>Ma société</b> ', email: 'a@b.mg', logo_url: 'https://a.mg/l.png' }, texts: { internal_rules: 'R1\r\nR2' }, legal: { notes: ['x', 'y'] } }];
  const same = inputs.every((x) => J(srv.cleanCompany(clone(x as any))) === J(cleanCompany(clone(x as any))));
  ok(same, `serveur : mêmes résultats que le site sur ${inputs.length} entrées`);
  const full = cleanCompany({ identity: { name: 'Société X' }, tax: { vat_enabled: true, vat_rate: 20 }, legal: { tax_id: 'NIF-SECRET-123', register_id: 'RCS-SECRET-9' }, billing: { payment_days: 45, invoice_footer: 'PIED-SECRET' }, leave: { leave_days_per_year: 30, work_days_per_week: 5, late_limit_time: '08:00' }, texts: { internal_rules: 'Règlement visible', customer_terms: 'CGV-SECRET' }, options: { quotes_enabled: true } }).value;
  ok(J(srv.companyForEmployee(clone(full))) === J(companyForEmployee(clone(full))), 'serveur : même filtre employé que le site');
}

// ---------- ce qu'un employé reçoit ----------
const full = cleanCompany({ identity: { name: 'Société X', phone: '0340000000' }, tax: { vat_enabled: true, vat_rate: 20 }, legal: { tax_id: 'NIF-SECRET-123', register_id: 'RCS-SECRET-9', notes: ['MENTION-SECRET'] }, billing: { payment_days: 45, invoice_footer: 'PIED-SECRET', late_penalty_text: 'PENALITE-SECRET' }, payroll: { pay_day: 5 }, leave: { leave_days_per_year: 30, work_days_per_week: 5, late_limit_time: '08:00' }, missions: { validation_hours: 48 }, texts: { internal_rules: 'Règlement visible', customer_terms: 'CGV-SECRET' } }).value;
const settings: any = { id: 'general', price_per_mission: 1000, rules: 'ancien', company: full, company_log: [{ at: '2026-10-01T00:00:00.000Z', by: 'a', by_name: 'Admin', path: 'tax.vat_rate', before: '0' }] };
const emp = { id: 'e1', role: 'employee', name: 'Marie' }, adm = { id: 'a1', role: 'admin', name: 'Admin' };
{
  const cut = srv.stripCompany(clone(settings), emp);
  const txt = J(cut);
  ok(!('company_log' in cut), 'employé : jamais le journal des changements');
  ok(cut.company.leave.leave_days_per_year === 30 && cut.company.leave.late_limit_time === '08:00' && cut.company.texts.internal_rules === 'Règlement visible', 'employé : reçoit les congés/présence et le règlement');
  ok(!/SECRET|vat_|tax|billing|payroll|identity|legal|payment_days|customer_terms|Société X|0340000000/.test(txt.replace(/"price_per_mission"/g, '')) , 'employé : rien d\'argent, de TVA, d\'identifiants ni de conditions client');
  ok(Object.keys(cut.company).sort().join() === 'leave,options,texts' && Object.keys(cut.company.texts).join() === 'internal_rules', 'employé : seulement « leave », « texts.internal_rules » et 3 réglages Badges (module 3)');
  ok(Object.keys(cut.company.options).sort().join() === 'badges_enabled,employee_sees_attention,employee_sees_badges' && Object.values(cut.company.options).every(v => typeof v === 'boolean'), 'employé : dans « options », seulement les 3 oui/non des badges (ni facture par client, ni devis)');
  ok(cut.price_per_mission === 1000 && cut.rules === 'ancien', 'employé : les autres réglages ne sont pas touchés par ce filtre');
  const sSet = clone(settings);
  ok(J(srv.stripCompany(sSet, adm)) === J(settings) && srv.stripCompany(sSet, adm) === sSet, 'admin : reçoit tout, journal compris');
  ok(srv.stripCompany(null, emp) === null && srv.stripCompany(undefined, emp) === undefined, 'filtre : enregistrement absent accepté');
  ok(J(srv.stripCompany({ id: 'general' }, emp)) === J({ id: 'general' }), 'employé : réglages sans « company » acceptés');
}

// ---------- écriture par l'admin ----------
const NOW = '2026-10-20T10:00:00.000Z';
{
  const forged = [{ at: '1999-01-01', by: 'pirate', by_name: 'X', path: 'faux', before: 'faux' }];
  const rec = { ...clone(settings), company: { tax: { vat_rate: 5 } }, company_log: forged, price_per_mission: 1234 };
  const r = srv.cleanSettingsRecord(rec, clone(settings), adm, NOW);
  ok(r.company.tax.vat_rate === 5 && r.company.tax.vat_enabled === true && r.company.legal.tax_id === 'NIF-SECRET-123', 'écriture : section partielle fusionnée avec l\'existant');
  ok(!r.company_log.some((e: any) => e.by === 'pirate') && r.company_log.length === 2, 'écriture : journal envoyé par le navigateur ignoré');
  const last = r.company_log[r.company_log.length - 1];
  ok(last.at === NOW && last.by === 'a1' && last.by_name === 'Admin' && last.path === 'tax.vat_rate' && last.before === '20', 'écriture : date, auteur et valeur d\'avant posés par le serveur');
  ok(r.price_per_mission === 1234, 'écriture : les autres réglages passent comme avant');
  const r2 = srv.cleanSettingsRecord({ ...clone(settings), company: { tax: { vat_rate: 999, vat_enabled: 'oui' } } }, clone(settings), adm, NOW);
  ok(r2.company.tax.vat_rate === 20 && r2.company.tax.vat_enabled === true && r2.company_log.length === 1, 'écriture : valeurs fausses refusées, existant gardé, rien dans le journal');
  const r3 = srv.cleanSettingsRecord({ id: 'general', price_per_mission: 1 }, clone(settings), adm, NOW);
  ok(J(r3.company) === J(full) && r3.company_log.length === 1, 'écriture : un ancien site qui n\'envoie pas « company » ne l\'efface pas');
  const r4 = srv.cleanSettingsRecord({ id: 'general', company: { identity: { name: '<b>Neuf</b>' } } }, undefined, adm, NOW);
  ok(r4.company.identity.name === 'Neuf' && r4.company_log.length === 1 && r4.company_log[0].before === '', 'écriture : première fois, sans réglages existants');
  let big: any = clone(settings);
  for (let i = 0; i < 130; i++) big = srv.cleanSettingsRecord({ ...big, company: { tax: { vat_rate: i % 100 } } }, big, adm, NOW);
  ok(big.company_log.length === 100, 'journal : limité à 100 lignes');
}

// ---------- lecture du code du serveur ----------
{
  const syncFn = src.slice(src.indexOf('async function sync('));
  const stateFn = src.slice(src.indexOf('async function state('), src.indexOf('async function sync('));
  const nonAdmin = syncFn.slice(syncFn.indexOf('} else if (!admin && !(isMoneyRole(me.role) && MONEY_COLS.includes(col))) {'), syncFn.indexOf("if (col === 'settings') { toSave = cleanSettingsRecord("));
  ok(nonAdmin.length > 200 && !nonAdmin.includes("'settings'"), 'sync : un employé ne peut pas écrire les réglages');
  ok(syncFn.includes("if (col === 'settings') { toSave = cleanSettingsRecord(rec, existing, me, now);"), 'sync : les réglages de l\'admin passent par la revérification');
  ok(stateFn.includes("col === 'settings'") && stateFn.includes('stripCompany(stripSettings(r, me), me)'), 'state : les réglages envoyés passent par les deux filtres');
  ok(!/SETTINGS_ADMIN_KEYS[^\n]*"company"/.test(src), 'le filtre de « company » est le filtre propre (sections), pas une simple suppression');
}

console.log(`\n${n - fails}/${n} contrôles OK${fails ? ` — ${fails} ECHEC(S)` : ''}`);
process.exit(fails ? 1 : 0);
