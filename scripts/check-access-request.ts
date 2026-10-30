// Connexion hors horaires : règles d'heure de fin, copie serveur identique, routes, une demande par personne, formulaire et carte du responsable.
import { readFileSync } from 'node:fs';
import { resolveAccessUntil, shiftEndMs, madaClock, untilFromClock } from '../src/utils/accessRequest';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const H = 3600000;
const st = { day_shift_start: '08:00', day_shift_end: '18:00', night_shift_start: '20:00', night_shift_end: '06:00' };
const at = (iso: string) => Date.parse(iso); // heures UTC ; Madagascar = UTC+3
// Dimanche 25 oct. 2026, 10:00 Madagascar = 07:00 UTC
const sun10 = at('2026-10-25T07:00:00Z');
ok(madaClock(shiftEndMs('day', st, sun10)) === '18:00' && shiftEndMs('day', st, sun10) - sun10 === 8 * H, 'jour : la fin de vacation du jour = 18:00 (8 h plus tard)');
ok(resolveAccessUntil('day', st, sun10, 'shift_end', undefined) === sun10 + 8 * H, 'autoriser par défaut : jusqu\'à la fin de la vacation');
const nightEarly = at('2026-10-25T23:00:00Z'); // 02:00 le 26 à Madagascar
ok(madaClock(shiftEndMs('night', st, nightEarly)) === '06:00' && shiftEndMs('night', st, nightEarly) - nightEarly === 4 * H, 'nuit : 02:00 → fin à 06:00');
const day21 = at('2026-10-25T18:00:00Z'); // 21:00 Madagascar, vacation de jour finie
ok(resolveAccessUntil('day', st, day21, 'shift_end', undefined) === day21 + 4 * H, 'fin de vacation à plus de 14 h : 4 h à la place');
ok([1, 2, 4, 8, 12].every(h => resolveAccessUntil('day', st, sun10, 'hours', h) === sun10 + h * H), 'durées 1/2/4/8/12 h');
ok(resolveAccessUntil('day', st, sun10, 'hours', 3) === null && resolveAccessUntil('day', st, sun10, 'hours', 'x') === null, 'durée inconnue refusée');
ok(resolveAccessUntil('day', st, sun10, 'until', sun10 + 5 * H) === sun10 + 5 * H, 'heure précise acceptée');
ok(resolveAccessUntil('day', st, sun10, 'until', sun10 - H) === null && resolveAccessUntil('day', st, sun10, 'until', sun10 + 49 * H) === null && resolveAccessUntil('day', st, sun10, 'until', 'abc') === null, 'heure passée, trop lointaine (48 h) ou fausse : refusée');
ok(untilFromClock('14:30', sun10) === at('2026-10-25T11:30:00Z') && untilFromClock('09:00', sun10) === at('2026-10-26T06:00:00Z') && untilFromClock('25:00', sun10) === null, 'heure précise « HH:MM » : la prochaine, ou rien si fausse');
// Copie serveur identique
const srv = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const cut = (t: string) => t.slice(t.indexOf('// ===== BEGIN ACCESSUNTIL'), t.indexOf('// ===== END ACCESSUNTIL'));
ok(cut(srv) === cut(readFileSync('src/utils/accessRequest.ts', 'utf8')) && cut(srv).length > 400, 'serveur : mêmes lignes que le site pour l\'heure de fin');
const fn = (name: string) => { const i = srv.indexOf(`async function ${name}(`); return srv.slice(i, srv.indexOf('\n}\n', i)); };
const req = fn('accessRequest'), dec = fn('accessDecide');
ok(/action === "access-request" && req\.method === "POST"/.test(srv) && /action === "access-decide" && req\.method === "POST"\) return await accessDecide\(req, res, me\)/.test(srv), 'routes : demande (avant connexion) et décision (connecté)');
ok(/checkPw\(password, cred\.password_hash\)/.test(req) && /guardCheck/.test(req) && /guardFail/.test(req), 'demande : mot de passe vérifié, essais limités');
ok(/why\.length < 5/.test(req) && /status === 'pending'\) return res\.status\(409\)/.test(req) && /`acc-\$\{user\.id\}`/.test(req), 'demande : raison obligatoire, une seule en attente par personne');
ok(/acc\.block\) return res\.status\(403\)/.test(req) && /acc\.ok\) return res\.status\(400\)/.test(req), 'demande : pas pour un accès bloqué, inutile si déjà autorisé');
ok(/me\.role !== 'admin'\) return res\.status\(403\)/.test(dec) && /reasonOf\(req\.body\)\.length < 3/.test(dec), 'décision : réservée au responsable, motif de refus obligatoire');
ok(/access_approved/.test(dec) && /access_refused/.test(dec) && /access_changed/.test(dec) && /auditLog\(user, 'access_request'/.test(req), 'journal : demande, autorisation, refus, changement');
ok(/access_until: iso/.test(dec) && /user\.access_until && Date\.parse\(user\.access_until\) > Date\.now\(\)\) return \{ ok: true \}/.test(srv), 'autorisation gardée sur le compte et lue par le contrôle de connexion');
ok(/user\.access_mode === 'block'\) return \{ ok: false, block: true/.test(srv) && /can_request: !acc\.block/.test(srv), 'un accès bloqué ne peut pas demander');
ok(/accessRequests = \(ar/.test(srv) && /collections: out, reads, resets, accessRequests/.test(srv), 'responsable : les demandes arrivent avec la synchronisation');
const mig = readFileSync('supabase/migrations/20261030_create_df_access_requests.sql', 'utf8');
ok(/enable row level security/.test(mig) && /revoke all on public\.df_access_requests from anon, authenticated/.test(mig), 'table : fermée au public');
ok(/df_access_requests/.test(readFileSync('supabase/schema.sql', 'utf8').split("'df_payroll'")[1] || ''), 'schema.sql : table dans la liste des tables protégées');
// Site
const login = readFileSync('src/views/LoginView.tsx', 'utf8'), card = readFileSync('src/components/AccessRequestsCard.tsx', 'utf8'), pend = readFileSync('src/utils/pendingCount.ts', 'utf8'), dash = readFileSync('src/views/admin/AdminDashboard.tsx', 'utf8');
ok(/data-access-request/.test(login) && /axReason\.trim\(\)\.length < 5/.test(login) && /canRequestAccess/.test(login) && /axReq\?\.status === 'pending'/.test(login), 'connexion : formulaire avec raison obligatoire, une demande en attente affichée');
ok(/status === 'refused'/.test(login) && /axReq\.reason/.test(login), 'connexion : le motif du refus est montré');
ok(/data-access-end/.test(card) && /Heure précise/.test(card) && /Fin de sa vacation/.test(card) && /Modifier l'heure de fin/.test(card) && /decision: 'refuse', reason/.test(card), 'responsable : fin de vacation par défaut, durées, heure précise, modifier, refuser avec motif');
ok(/access/.test(pend) && /AccessRequestsCard/.test(dash) && /\['access', 'Hors horaires', pend\.access\]/.test(dash), 'Validations : pastille et filtre « Hors horaires »');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
