// Contrôle de la validation à plusieurs niveaux (M15.6) : plafond du Chef d'équipe, copie serveur, garde-fous. Lancer : npm run check:approval-limit
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { cleanTeamLeadLimit, decisionNeedsAdmin, TEAM_LEAD_LIMIT_MAX } from '../src/utils/approvalLimit';
import { decisionClientPrice } from '../src/utils/postDecision';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } };
const ok = (c: boolean, name: string) => eq(c, true, name);

// ---- Le plafond du réglage
eq(cleanTeamLeadLimit(undefined), 0, 'absent = pas de plafond');
eq(cleanTeamLeadLimit(null), 0, 'null = pas de plafond');
eq(cleanTeamLeadLimit(0), 0, '0 = pas de plafond');
eq(cleanTeamLeadLimit(-5000), 0, 'négatif = pas de plafond');
eq(cleanTeamLeadLimit(0.4), 0, 'moins de 1 Ar = pas de plafond');
eq(cleanTeamLeadLimit('50000'), 0, 'texte = pas de plafond (jamais « cru »)');
eq(cleanTeamLeadLimit(NaN), 0, 'NaN = pas de plafond');
eq(cleanTeamLeadLimit(Infinity), 0, 'infini = pas de plafond');
eq(cleanTeamLeadLimit({}), 0, 'objet = pas de plafond');
eq(cleanTeamLeadLimit(50000), 50000, '50 000 Ar gardé');
eq(cleanTeamLeadLimit(50000.6), 50001, 'arrondi à l\'entier');
eq(cleanTeamLeadLimit(5e12), TEAM_LEAD_LIMIT_MAX, 'trop grand : ramené au maximum');

// ---- Qui est bloqué
ok(decisionNeedsAdmin('team_lead', 60000, 50000), 'Chef d\'équipe : prix au-dessus du plafond → le responsable décide');
ok(!decisionNeedsAdmin('team_lead', 50000, 50000), 'Chef d\'équipe : prix ÉGAL au plafond → peut décider (strictement au-dessus seulement)');
ok(!decisionNeedsAdmin('team_lead', 49999, 50000), 'Chef d\'équipe : prix sous le plafond → peut décider');
ok(!decisionNeedsAdmin('team_lead', 9e9, 0), 'plafond 0 : jamais bloqué (comme avant M15.6)');
ok(!decisionNeedsAdmin('team_lead', 9e9, undefined), 'plafond absent : jamais bloqué');
ok(!decisionNeedsAdmin('team_lead', 9e9, 'abc'), 'plafond faux : jamais bloqué (pas de blocage par erreur)');
ok(!decisionNeedsAdmin('admin', 9e9, 1000), 'le responsable n\'est JAMAIS bloqué');
ok(!decisionNeedsAdmin('accountant', 9e9, 1000), 'Comptable : pas concerné (il ne décide déjà jamais)');
ok(!decisionNeedsAdmin('employee', 9e9, 1000), 'opérateur : pas concerné');
ok(!decisionNeedsAdmin(undefined, 9e9, 1000), 'rôle absent : pas concerné');
ok(!decisionNeedsAdmin('team_lead', undefined, 1000), 'prix absent : pas bloqué');
ok(!decisionNeedsAdmin('team_lead', '70000', 1000), 'prix en texte : pas bloqué');
ok(!decisionNeedsAdmin('team_lead', NaN, 1000), 'prix NaN : pas bloqué');
ok(!decisionNeedsAdmin('team_lead', 0, 1000), 'prix 0 : pas bloqué');
ok(decisionNeedsAdmin('team_lead', 1, 0.5) === false, 'plafond sous 1 Ar : pas de plafond');

// ---- Le prix comparé est le prix client de la mission (propre, sinon du type, sinon par défaut)
const settings = { client_price_default_ar: 30000, client_prices_by_type: { vip: 120000 } };
eq(decisionNeedsAdmin('team_lead', decisionClientPrice({ post_type: 'vip' }, settings), 50000), true, 'mission du type « vip » (120 000) : au-dessus du plafond de 50 000');
eq(decisionNeedsAdmin('team_lead', decisionClientPrice({ post_type: 'standard' }, settings), 50000), false, 'mission standard (prix par défaut 30 000) : sous le plafond');
eq(decisionNeedsAdmin('team_lead', decisionClientPrice({ client_price_ar: 80000, post_type: 'standard' }, settings), 50000), true, 'prix propre de la mission (80 000) : au-dessus');
eq(decisionNeedsAdmin('team_lead', decisionClientPrice(undefined, settings), 50000), false, 'contrat introuvable : prix par défaut (30 000), sous le plafond');
eq(decisionNeedsAdmin('team_lead', decisionClientPrice(undefined, {}), 50000), false, 'aucun prix réglé nulle part (0) : pas bloqué');

// ---- Serveur : même texte, mêmes réponses
const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8').replace(/\r\n/g, '\n');
const m = src.match(/\/\/ ===== BEGIN LEADLIMIT[^\n]*\n([\s\S]*?)\/\/ ===== END LEADLIMIT =====/);
ok(!!m, 'serveur : bloc LEADLIMIT présent');
if (m) {
  const site = readFileSync('src/utils/approvalLimit.ts', 'utf8').replace(/\r\n/g, '\n').split('\n').filter((l, i, a) => !(i < a.findIndex((x) => !x.startsWith('//')))).join('\n');
  const strip = (s: string) => s.replace(/^export /gm, '').trim();
  ok(strip(site) === strip(m[1]), 'serveur : le bloc est la copie exacte de src/utils/approvalLimit.ts (sans « export »)');
  new Function(transformSync(m[1] + '\n;globalThis.__l = { cleanTeamLeadLimit, decisionNeedsAdmin, TEAM_LEAD_LIMIT_MAX };', { loader: 'ts' }).code)();
  const S = (globalThis as any).__l;
  let same = 0, total = 0;
  for (const lim of [undefined, null, 0, -1, 0.4, 1, 50000, 50000.6, '50000', NaN, Infinity, 5e12]) { total++; if (S.cleanTeamLeadLimit(lim) === cleanTeamLeadLimit(lim)) same++; }
  for (const role of ['team_lead', 'admin', 'accountant', 'employee', undefined]) for (const price of [0, 49999, 50000, 50001, 9e9, NaN, '70000', undefined]) for (const lim of [0, 50000, undefined, 'x']) { total++; if (S.decisionNeedsAdmin(role, price, lim) === decisionNeedsAdmin(role, price, lim)) same++; }
  eq(same, total, `serveur et site donnent les mêmes réponses (${total} cas)`);
}

// ---- Serveur : la décision est bloquée AVANT toute écriture, sans dire le montant
const h = src.match(/async function postDecide\([\s\S]*?\n}\n/);
ok(!!h, 'serveur : postDecide trouvée');
if (h) {
  const b = h[0];
  const iBlock = b.indexOf('decisionNeedsAdmin('), iPlan = b.indexOf('planPostDecision('), iWrite = b.indexOf('.upsert(');
  ok(iBlock > 0 && iBlock < iPlan && iBlock < iWrite, 'serveur : le plafond est vérifié avant le calcul et avant toute écriture');
  ok(/status\(403\)/.test(b.slice(iBlock, iBlock + 400)), 'serveur : refus 403 au-dessus du plafond');
  ok(/decisionNeedsAdmin\(me\.role,/.test(b), 'serveur : le rôle vient de la session (jamais de ce qu\'envoie le navigateur)');
  ok(/cleanTeamLeadLimit\(st\?\.data\?\.team_lead_limit_ar\)/.test(b), 'serveur : le plafond vient des réglages en base');
  ok(/me\.role === 'team_lead' && teamLimit > 0/.test(b), 'serveur : le prix est cherché aussi pour un début et un refus (pas seulement une fin)');
  const msg = b.slice(iBlock, iBlock + 400).match(/error: '([^']*)'/);
  ok(!!msg && !/\d/.test(msg[1]) && !/\$\{/.test(msg[1]), 'serveur : le message ne dit aucun montant');
  ok(b.indexOf("const { data: st }") < b.indexOf("let cRow"), 'serveur : les réglages sont lus avant le contrat');
}
ok(/SETTINGS_ADMIN_KEYS: string\[\] = \[[^\]]*"team_lead_limit_ar"/.test(src), 'serveur : le plafond est un réglage réservé à l\'admin');
{
  const p = src.match(/\/\/ ===== BEGIN PRIVACY[^\n]*\n([\s\S]*?)\/\/ ===== END PRIVACY =====/);
  ok(!!p, 'serveur : bloc PRIVACY présent');
  if (p) {
    const srv = new Function(transformSync(p[1], { loader: 'ts' }).code + '\nreturn { stripSettings };')() as any;
    const rec = { id: 'general', team_lead_limit_ar: 50000, price_per_mission: 1000 };
    ok(!('team_lead_limit_ar' in srv.stripSettings({ ...rec }, { role: 'team_lead' })), 'Chef d\'équipe : ne reçoit jamais le plafond');
    ok(!('team_lead_limit_ar' in srv.stripSettings({ ...rec }, { role: 'employee' })), 'opérateur : ne reçoit jamais le plafond');
    ok('team_lead_limit_ar' in srv.stripSettings({ ...rec }, { role: 'admin' }), 'responsable : reçoit le plafond');
  }
}

// ---- Écran Réglages
const sv = readFileSync('src/views/admin/SettingsView.tsx', 'utf8');
ok(/team_lead_limit_ar: Math\.max\(0, Math\.round\(Number\(s\.team_lead_limit_ar\) \|\| 0\)\)/.test(sv), 'Réglages : le plafond est enregistré en entier, jamais négatif');
ok(/Plafond du Chef d'équipe/.test(sv), 'Réglages : champ « Plafond du Chef d\'équipe »');

console.log(fails ? `\n${fails} échec(s) sur ${n} contrôles.` : `OK : ${n}/${n} contrôles.`);
process.exit(fails ? 1 : 0);
