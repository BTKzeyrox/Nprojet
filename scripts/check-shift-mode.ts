// Modes d'horaires (normal / jour / nuit / jour et nuit), nouveaux horaires, déconnexion forcée et compte à rebours.
import { readFileSync } from 'node:fs';
import { cleanShiftMode, effShift, showShift } from '../src/utils/shiftMode';
import { isLate } from '../src/utils/attendance';
import { accessEndMs } from '../src/utils/accessRequest';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
ok(cleanShiftMode(undefined) === 'both' && cleanShiftMode('x') === 'both' && cleanShiftMode('normal') === 'normal' && cleanShiftMode('night') === 'night', 'mode inconnu ou absent = jour et nuit (comme avant)');
ok(effShift('night', 'both') === 'night' && effShift('day', 'both') === 'day' && effShift(undefined, 'both') === 'day', 'jour et nuit : la vacation de la personne');
ok(effShift('night', 'normal') === 'day' && effShift('night', 'day') === 'day' && effShift('day', 'night') === 'night', 'normal / jour seul : tout le monde de jour ; nuit seul : tout le monde de nuit');
ok(showShift({}) && showShift({ shift_mode: 'both' }) && !showShift({ shift_mode: 'normal' }) && !showShift({ shift_mode: 'day' }) && !showShift({ shift_mode: 'night' }), 'les mots jour/nuit/vacation ne s\'affichent qu\'en mode jour et nuit');
const cfg = { day_shift_start: '08:00', night_shift_start: '19:30', late_tolerance_min: 15 } as any;
ok(isLate({ shift_type: 'night', start_time: '08:30:00' } as any, { ...cfg, shift_mode: 'normal' }) && !isLate({ shift_type: 'night', start_time: '19:40:00' } as any, cfg), 'retard : en mode normal une mission « nuit » est jugée sur l\'horaire de jour');
const srv = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const cut = (t: string) => t.slice(t.indexOf('// ===== BEGIN SHIFTMODE'), t.indexOf('// ===== END SHIFTMODE')).replace(/export const /g, 'const ');
ok(cut(srv) === cut(readFileSync('src/utils/shiftMode.ts', 'utf8')) && cut(srv).length > 300, 'serveur : mêmes lignes que le site pour le mode des horaires');
ok(/const shift = effShift\(user\.shift, st\.shift_mode\)/.test(srv) && /accessShiftOf = \(u: any, st: any\).*effShift\(u\?\.shift, st\?\.shift_mode\)/.test(srv), 'serveur : le contrôle de connexion suit le mode');
const store = readFileSync('src/db/store.ts', 'utf8');
ok(/day_shift_start: '08:00'[\s\S]{0,40}day_shift_end: '17:00'[\s\S]{0,40}night_shift_start: '19:30'[\s\S]{0,40}night_shift_end: '04:30'[\s\S]{0,40}shift_mode: 'both'/.test(store), 'horaires par défaut : 08:00-17:00 et 19:30-04:30');
const set = readFileSync('src/views/admin/SettingsView.tsx', 'utf8');
ok(/data-shift-mode/.test(set) && /SHIFT_MODES\.map/.test(set) && /set\('shift_mode', m\)/.test(set), 'Réglages : 4 choix de mode');
// Déconnexion forcée
const fn = (name: string) => { const i = srv.indexOf(`async function ${name}(`); return srv.slice(i, srv.indexOf('\n}\n', i)); };
const f = fn('forceLogout');
ok(/action === "force-logout" && req\.method === "POST"\) return await forceLogout\(req, res, me\)/.test(srv) && /me\.role !== 'admin'\) return res\.status\(403\)/.test(f), 'route force-logout : responsable seulement');
ok(/m < 0 \|\| m > 120/.test(f) && /ACCESS_ROLES\.includes\(user\.role\)/.test(f) && /cancel === true/.test(f) && /'force_logout'/.test(f), 'délai 0 à 120 min, jamais le responsable, annulable, noté dans le journal');
ok(/open_mission: !!\(open && open\.length\)/.test(f) && !/from\(T\.posts\)\.(update|delete|upsert)/.test(f), 'le responsable est prévenu d\'une mission ouverte, qui n\'est jamais touchée');
ok(/forcePassed\(me\)[\s\S]{0,500}code: 'forced'/.test(srv) && /delete user\.force_logout_at; delete user\.access_until/.test(srv), 'après l\'heure : session coupée, autorisation hors horaires effacée (nouvelle demande nécessaire)');
ok(/data-force-logout/.test(readFileSync('src/components/OperatorSheet.tsx', 'utf8')) && /onForceLogout=\{minutes => db\.forceLogout/.test(readFileSync('src/views/admin/EmployeesManagement.tsx', 'utf8')) && /code === 'forced'/.test(store), 'fiche : bouton Déconnecter / Annuler, message gardé pour la page de connexion');
// Compte à rebours automatique
const s = { day_shift_end: '17:00', night_shift_end: '04:30', access_after_min: 60 } as any;
const mk = (o: any) => ({ role: 'employee', shift: 'day', ...o }) as any;
const t1 = Date.parse('2026-10-26T13:00:00Z'); // 16:00 Madagascar
ok(accessEndMs(mk({}), s, t1) === Date.parse('2026-10-26T15:00:00Z'), 'fin d\'accès = 17:00 + 60 min de marge = 18:00 (Madagascar)');
ok(accessEndMs(mk({ access_mode: 'allow' }), s, t1) === null && accessEndMs({ role: 'admin' } as any, s, t1) === null, '« toute heure » et responsable : pas de compte à rebours');
ok(accessEndMs(mk({ access_until: '2026-10-26T14:00:00Z' }), s, t1) === Date.parse('2026-10-26T14:00:00Z'), 'une autorisation hors horaires donne sa propre fin');
ok(accessEndMs(mk({ shift: 'night' }), { ...s, shift_mode: 'normal' }, t1) === Date.parse('2026-10-26T15:00:00Z'), 'mode normal : tout le monde suit l\'horaire de jour');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
