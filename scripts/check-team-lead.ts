// Contrôle du Chef d'équipe (M7.1 d) : équipe, droit de décision, décision sur une session (site = serveur), protections du serveur. Lancer : npm run check:team-lead
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { cleanTeam, sameTeam, canDecidePost, TEAM_LEAD_VIEWS, ACCOUNTANT_VIEWS, viewAllowedFor } from '../src/utils/roles';
import { planPostDecision, decisionClientPrice } from '../src/utils/postDecision';

let fails = 0;
const eq = (got: unknown, want: unknown, name: string) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };

const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const grab = (name: string) => { const m = src.match(new RegExp(`// ===== BEGIN ${name}[^\\n]*\\n([\\s\\S]*?)// ===== END ${name} =====`)); if (!m) throw new Error(`bloc ${name} introuvable`); return m[1]; };
new Function(transformSync(grab('ROLES') + '\n' + grab('DECIDE') + '\n;globalThis.__t = { cleanTeam, sameTeam, canDecidePost, planPostDecision, decisionClientPrice };', { loader: 'ts' }).code)();
const S = (globalThis as any).__t;

// ---- Équipe ----
eq(cleanTeam('  Équipe  A \n'), 'Équipe A', 'équipe : espaces et retour à la ligne nettoyés');
eq(cleanTeam('x'.repeat(100)).length, 40, 'équipe : 40 caractères au plus');
eq(cleanTeam(undefined), '', 'équipe : vide');
eq(sameTeam({ team: 'Nord' }, { team: ' nord ' }), true, 'même équipe : sans tenir compte des majuscules ni des espaces');
eq(sameTeam({ team: 'Nord' }, { team: 'Sud' }), false, 'équipes différentes');
eq(sameTeam({ team: '' }, { team: '' }), false, 'sans équipe : jamais la même');
eq(sameTeam({}, {}), false, 'sans champ équipe : jamais la même');
eq(sameTeam(null, { team: 'A' }), false, 'null : jamais la même');

// ---- Qui peut décider ----
const lead = { id: 'l1', role: 'team_lead', team: 'Nord' };
const op = (o: object = {}) => ({ id: 'e1', role: 'employee', team: 'Nord', ...o });
eq(canDecidePost(lead, op()), true, 'Chef d\'équipe : décide pour son équipe');
eq(canDecidePost(lead, op({ team: 'Sud' })), false, 'Chef d\'équipe : pas pour une autre équipe');
eq(canDecidePost(lead, op({ team: '' })), false, 'Chef d\'équipe : pas pour un opérateur sans équipe');
eq(canDecidePost({ ...lead, team: '' }, op({ team: '' })), false, 'Chef d\'équipe sans équipe : ne décide pour personne');
eq(canDecidePost(lead, { ...lead }), false, 'Chef d\'équipe : jamais sa propre session');
eq(canDecidePost(lead, op({ role: 'accountant' })), false, 'Chef d\'équipe : pas pour un Comptable');
eq(canDecidePost(lead, op({ role: 'team_lead', id: 'l2' })), false, 'Chef d\'équipe : pas pour un autre Chef d\'équipe');
eq(canDecidePost(lead, op({ role: 'admin' })), false, 'Chef d\'équipe : pas pour l\'admin');
eq(canDecidePost({ id: 'a', role: 'admin' }, op({ team: '' })), true, 'admin : décide pour tous');
eq(canDecidePost({ id: 'c', role: 'accountant', team: 'Nord' }, op()), false, 'Comptable : ne décide jamais');
eq(canDecidePost(op(), op({ id: 'e2' })), false, 'opérateur : ne décide jamais');
eq(canDecidePost(lead, null), false, 'propriétaire absent : refusé');
eq(canDecidePost(null, op()), false, 'sans utilisateur : refusé');
eq(canDecidePost({ id: 'x', role: 'zzz', team: 'Nord' }, op()), false, 'rôle inconnu : refusé');
for (const [m, o, n] of [[lead, op(), 'cas 1'], [lead, op({ team: 'Sud' }), 'cas 2'], [lead, op({ role: 'accountant' }), 'cas 3'], [{ id: 'a', role: 'admin' }, op(), 'cas 4'], [null, op(), 'cas 5'], [lead, null, 'cas 6'], [lead, { ...lead }, 'cas 7']] as const) eq(S.canDecidePost(m, o), canDecidePost(m as any, o as any), `serveur = site (décision, ${n})`);
for (const v of ['Nord', ' nord ', '', 'a\nb', undefined]) { eq(S.cleanTeam(v), cleanTeam(v), `serveur = site (équipe ${JSON.stringify(v)})`); eq(S.sameTeam({ team: v }, { team: 'nord' }), sameTeam({ team: v }, { team: 'nord' }), `serveur = site (même équipe ${JSON.stringify(v)})`); }

// ---- Pages du Chef d'équipe ----
for (const v of ['feed', 'validations', 'chat', 'settings']) eq(viewAllowedFor('team_lead', v), true, `Chef d'équipe : page permise « ${v} »`);
for (const v of ['invoices', 'clients', 'purchasing', 'advances', 'employees', 'stats', 'health', 'errors', 'dashboard', 'history', 'performance', 'calendar', 'active-post', 'grid', 'security']) eq(viewAllowedFor('team_lead', v), false, `Chef d'équipe : page refusée « ${v} »`);
eq([...TEAM_LEAD_VIEWS].some(v => ['invoices', 'clients', 'purchasing', 'advances', 'employees', 'stats'].includes(v)), false, 'liste du Chef d\'équipe : jamais argent, paie, comptes, statistiques');
eq(viewAllowedFor('accountant', 'validations'), false, 'Comptable : toujours pas de validations');
eq([...ACCOUNTANT_VIEWS].includes('invoices' as never), true, 'Comptable : Facturation toujours permise');
eq(viewAllowedFor('employee', 'advances') && viewAllowedFor('admin', 'advances'), true, 'admin et opérateur : pas limités ici');

// ---- Décision sur une session (même résultat site et serveur) ----
const NOW = '2026-10-23T10:00:00.000Z';
const settings = { price_per_mission: 1500.4, client_price_default_ar: 4000.6, client_prices_by_type: { vip: 9000, gratuit: 0 } };
const postEnd = { id: 'p1', employee_id: 'e1', status: 'pending_end', post_number: 7, client_name: 'Alice', initial_score: 10, current_score: 25, updated_at: 'old' };
const postStart = { ...postEnd, status: 'pending_start' };
const contract = { id: 'c1', post_number: 7, post_type: 'vip', current_score: 10 };
const emp = { id: 'e1', total_score_boosted: 100, total_earnings_ar: 5000 };
const cases: [string, any, any, any, any, boolean, unknown][] = [
  ['valider la fin', postEnd, contract, settings, emp, true, ''], ['valider le début', postStart, contract, settings, emp, true, ''],
  ['refuser avec motif', postEnd, contract, settings, emp, false, '  Photo floue  '], ['refuser sans motif', postEnd, contract, settings, emp, false, '   '],
  ['refuser motif absent', postEnd, contract, settings, emp, false, undefined], ['déjà terminée', { ...postEnd, status: 'completed' }, contract, settings, emp, true, ''],
  ['déjà refusée', { ...postEnd, status: 'rejected' }, contract, settings, emp, false, 'x'], ['session absente', undefined, contract, settings, emp, true, ''],
  ['sans contrat', postEnd, undefined, settings, emp, true, ''], ['sans opérateur', postEnd, contract, settings, undefined, true, ''],
  ['sans réglages', postEnd, contract, undefined, emp, true, ''], ['score final fixé', { ...postEnd, final_score: 40 }, contract, settings, emp, true, ''],
  ['score en recul', { ...postEnd, current_score: 5 }, contract, settings, emp, true, ''], ['motif trop long', postEnd, contract, settings, emp, false, 'm'.repeat(500)],
];
for (const [n, p, c, s, e, a, r] of cases) eq(S.planPostDecision(p, c, s, e, a, r, NOW), planPostDecision(p, c, s, e, a, r, NOW), `serveur = site (décision : ${n})`);
const end = planPostDecision(postEnd, contract, settings, emp, true, '', NOW);
eq([end.ok, end.kind, end.payAr], [true, 'end_ok', 1500], 'valider la fin : paie arrondie des Réglages');
eq([end.post.status, end.post.calculated_ar, end.post.client_price_ar, end.post.updated_at], ['completed', 1500, 9000, NOW], 'valider la fin : paie et prix client figés');
eq(end.contract.current_score, 25, 'valider la fin : le score du compte devient le score final');
eq([end.employee.total_score_boosted, end.employee.total_earnings_ar], [115, 6500], 'valider la fin : totaux de l\'opérateur');
eq([postEnd.status, (postEnd as any).calculated_ar, contract.current_score, emp.total_earnings_ar], ['pending_end', undefined, 10, 5000], 'les objets reçus ne sont jamais modifiés');
eq(planPostDecision({ ...postEnd, final_score: 40 }, contract, settings, emp, true, '', NOW).employee!.total_score_boosted, 130, 'score final utilisé s\'il existe');
eq(planPostDecision({ ...postEnd, current_score: 5 }, contract, settings, emp, true, '', NOW).employee!.total_score_boosted, 100, 'score en recul : jamais négatif');
const st = planPostDecision(postStart, contract, settings, emp, true, '', NOW);
eq([st.kind, st.post.status, st.post.calculated_ar, st.contract, st.employee], ['start_ok', 'active', undefined, undefined, undefined], 'valider le début : aucun argent touché');
const rf = planPostDecision(postEnd, contract, settings, emp, false, '  Photo floue  ', NOW);
eq([rf.ok, rf.kind, rf.post.status, rf.post.rejection_reason, rf.contract, rf.employee], [true, 'refused', 'rejected', 'Photo floue', undefined, undefined], 'refuser : motif nettoyé, aucun argent touché');
eq(planPostDecision(postEnd, contract, settings, emp, false, '  ', NOW).error, 'reason', 'refuser sans motif : refusé');
eq(planPostDecision(postEnd, contract, settings, emp, false, 'm'.repeat(500), NOW).post.rejection_reason.length, 300, 'motif coupé à 300');
for (const s of ['completed', 'rejected', 'active', 'force_released']) eq(planPostDecision({ ...postEnd, status: s }, contract, settings, emp, true, '', NOW).error, 'not_pending', `session « ${s} » : pas de décision`);
eq(planPostDecision(undefined, contract, settings, emp, true, '', NOW).error, 'missing', 'session absente');
eq(decisionClientPrice({ client_price_ar: 123.4 }, settings), 123, 'prix client : celui de la mission');
eq(decisionClientPrice({ client_price_ar: 0, post_type: 'vip' }, settings), 0, 'prix client : 0 est un vrai prix');
eq(decisionClientPrice({ post_type: 'vip' }, settings), 9000, 'prix client : celui du type');
eq(decisionClientPrice({ post_type: 'gratuit' }, settings), 0, 'prix client : type offert');
eq(decisionClientPrice({ post_type: 'autre' }, settings), 4001, 'prix client : prix par défaut');
eq(decisionClientPrice({ client_price_ar: -5, post_type: 'vip' }, settings), 9000, 'prix client invalide ignoré');
eq(decisionClientPrice(undefined, undefined), 0, 'prix client : rien du tout = 0');

// ---- Protections du serveur ----
const fn = (name: string) => { const m = src.match(new RegExp(`async function ${name}\\([\\s\\S]*?\\n}\\n`)); if (!m) throw new Error(`fonction ${name} introuvable`); return m[0]; };
const pd = fn('postDecide');
eq(/me\.role !== 'admin' && me\.role !== 'team_lead'/.test(pd), true, 'post-decide : admin et Chef d\'équipe seulement');
eq(/canDecidePost\(me, owner\)/.test(pd), true, 'post-decide : vérifie l\'équipe côté serveur');
eq(pd.indexOf('canDecidePost') < pd.indexOf('planPostDecision'), true, 'post-decide : droit vérifié avant tout calcul');
eq(/b\.approve === true/.test(pd), true, 'post-decide : approuver seulement si « true » exact');
eq(/auditLog\(me, 'mission_decision'/.test(pd), true, 'post-decide : écrit au journal d\'audit');
eq(/action === "post-decide" && req\.method === "POST"/.test(src), true, 'route post-decide branchée (après la connexion)');
eq(/\.\.\.user, id, username: uname, role: newRole[^\n]*\n\s*team: cleanTeam\(user\?\.team\)/.test(src), true, 'création de compte : équipe nettoyée');
eq(/for \(const k of \['is_online', 'pending_advance_ar'\]\) if \(k in rec\) toSave\[k\] = rec\[k\];/.test(src), true, 'un non-admin ne peut modifier ni son équipe ni son rôle (seuls is_online et pending_advance_ar passent)');
eq(/mates && mates\.has\(String\(p\.employee_id\)\)/.test(src) && /canDecidePost\(me, r\.data\)/.test(src), true, 'preuves : visibles seulement pour son équipe');
eq(/me\.role === 'team_lead'/.test(src.slice(src.indexOf('let teamMates'), src.indexOf('let teamMates') + 200)), true, 'équipe lue seulement pour un Chef d\'équipe');

console.log(fails ? `\n${fails} ECHEC(S)` : '\nChef d\'équipe : tout est bon.');
process.exit(fails ? 1 : 0);
