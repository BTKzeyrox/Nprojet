// Contrôle M16.3 : blocage après trop d'essais. Règles, copie serveur identique, série d'essais simulée, panne = on laisse passer.
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as site from '../src/utils/loginGuard';
import { AUDIT_ACTIONS, auditLabel } from '../src/utils/auditRules';

let ok = 0, bad = 0;
const t = (name: string, c: boolean) => { if (c) ok++; else { bad++; console.error('✗', name); } };

const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const m = src.match(/\/\/ ===== BEGIN LOGINGUARD[^\n]*\n([\s\S]*?)\/\/ ===== END LOGINGUARD =====/);
t('bloc serveur trouvé', !!m);
const srv: any = {};
new Function('g', transformSync((m?.[1] || '') + '\n;g.x = { GUARD, cleanAttempt, lockLeftSec, afterFailure, guardDecision, retryMessage, guardKeys };', { loader: 'ts' }).code)(srv);
const S = srv.x;
t('GUARD identique', JSON.stringify(S.GUARD) === JSON.stringify(site.GUARD));
const norm = (x: string) => x.replace(/\s+/g, ' ').trim();
const siteCode = readFileSync('src/utils/loginGuard.ts', 'utf8');
t('copie serveur = texte du site (mot pour mot)', norm(m?.[1] || '') === norm(siteCode.slice(siteCode.indexOf('export const GUARD')).replace(/export /g, '')));
t('copie serveur : même comportement', JSON.stringify(S.afterFailure({ fails: 4, locks: 0, last_at: 1e12, locked_until: 0 }, 1e12 + 5, 'account')) === JSON.stringify(site.afterFailure({ fails: 4, locks: 0, last_at: 1e12, locked_until: 0 }, 1e12 + 5, 'account')) && S.retryMessage(90) === site.retryMessage(90) && S.guardKeys(' A ', '1.2.3.4').ip === 'i:1.2.3.4');

// Série simulée : 5 ratés = délai 60 s ; pendant le délai pas de rallonge ; puis 120 s ; oubli après 15 min de silence.
const T0 = 1_000_000_000_000;
let a: any; let now = T0;
for (let i = 1; i <= 4; i++) { const r = site.afterFailure(a, now, 'account'); a = r.next; t('essai ' + i + ' sans délai', !r.lockedNow); now += 1000; }
let r = site.afterFailure(a, now, 'account'); a = r.next;
t('5e raté = délai 60 s', r.lockedNow && r.lockSec === 60);
t('attente restante ≈ 60 s', site.lockLeftSec(a, now) === 60);
const before = a.locked_until;
r = site.afterFailure(a, now + 5000, 'account');
t('essai pendant le délai : pas de rallonge', !r.lockedNow && r.next.locked_until === before);
now = before + 1000;
t('délai fini : plus d\'attente', site.lockLeftSec(a, now) === 0);
for (let i = 1; i <= 5; i++) { r = site.afterFailure(a, now, 'account'); a = r.next; now += 1000; }
t('2e série : délai 120 s', r.lockedNow && r.lockSec === 120);
// doublement plafonné
let b: any; let n = T0; let last = 0;
for (let k = 0; k < 12; k++) { for (let i = 0; i < 5; i++) { const x = site.afterFailure(b, n, 'account'); b = x.next; if (x.lockedNow) last = x.lockSec; n += 10; } n = b.locked_until + 1; }
t('plafond compte 1800 s', last === 1800);
let c: any; n = T0; last = 0;
for (let k = 0; k < 12; k++) { for (let i = 0; i < 5; i++) { const x = site.afterFailure(c, n, 'account', true); c = x.next; if (x.lockedNow) last = x.lockSec; n += 10; } n = c.locked_until + 1; }
t('plafond responsable 300 s', last === 300);
// oubli
let d: any = { fails: 3, locks: 2, last_at: T0, locked_until: 0 };
const rr = site.afterFailure(d, T0 + 16 * 60 * 1000, 'account');
t('oubli après 15 min', rr.next.fails === 1 && rr.next.locks === 0);
// adresse : 20 ratés
let e: any; n = T0; let lockedAt = 0;
for (let i = 1; i <= 20; i++) { const x = site.afterFailure(e, n, 'ip'); e = x.next; if (x.lockedNow) lockedAt = i; n += 10; }
t('adresse : délai au 20e raté', lockedAt === 20);
// décision
t('décision : le plus long des deux', site.guardDecision({ fails: 0, locks: 1, last_at: T0, locked_until: T0 + 30_000 }, { fails: 0, locks: 1, last_at: T0, locked_until: T0 + 90_000 }, T0).waitSec === 90);
t('décision : rien = libre', !site.guardDecision(undefined, undefined, T0).blocked);
// lignes abîmées
for (const bad_ of [null, 'x', 5, [], { fails: 'a', locked_until: -1 }, { locked_until: Infinity }]) t('ligne abîmée = pas de blocage', !site.guardDecision(site.cleanAttempt(bad_), undefined, T0).blocked);
// messages & clés
t('message secondes', site.retryMessage(1) === "Trop d'essais. Réessayez dans 1 seconde." && site.retryMessage(30).includes('30 secondes'));
t('message minutes', site.retryMessage(61).includes('2 minutes') && site.retryMessage(60).includes('1 minute.'));
t('clé compte', site.guardKeys('  Admin ', '1.2.3.4').account === 'a:admin');
t('« a dmin » ≠ « admin »', site.guardKeys('a dmin', '').account !== site.guardKeys('admin', '').account);
t('clé adresse invalide ignorée', site.guardKeys('x', "1.2.3.4'; drop").ip === null && site.guardKeys('x', '').ip === null);
t('clé adresse valide', site.guardKeys('x', '2001:db8::1').ip === 'i:2001:db8::1');

// Branchement dans login() : 429 AVANT la vérification du mot de passe ; effacement après succès ; pannes ignorées.
const lg = src.slice(src.indexOf('async function login(req'));
const iCheck = lg.indexOf('guardCheck('), iPw = lg.indexOf('checkPw(');
t('login : contrôle avant mot de passe', iCheck > 0 && iCheck < iPw);
t('login : 429 + code locked', /status\(429\)\.json\(\{ error: retryMessage/.test(lg) && lg.includes("code: 'locked'"));
t('login : compteur effacé après succès', lg.indexOf('guardClear(') > iPw);
t('login : échec compté', lg.includes('guardFail(uname, ip, adminAccount)'));
const helpers = src.slice(src.indexOf('async function guardRead'), src.indexOf('// ===== BEGIN TOTP'));
t('pannes : try/catch partout', (helpers.match(/try \{/g) || []).length >= 3 && helpers.includes('blocked: false'));
t('lecture en erreur = aucun compteur', /if \(error\) \{[^}]*return undefined;/.test(helpers));
t('aucun mot de passe écrit dans la table', !/password/i.test(helpers));
// Audit
t('audit : action serveur', /const AUDIT_ACTIONS = \[[^\]]*"login_locked"/.test(src));
t('audit : action site + libellé', (AUDIT_ACTIONS as readonly string[]).includes('login_locked') && auditLabel('login_locked','fr') !== 'login_locked' && auditLabel('login_locked','en').length > 3);
// Migration
const mig = readFileSync('supabase/migrations/20261025_create_df_login_attempts.sql', 'utf8');
t('migration : RLS + revoke', /enable row level security/.test(mig) && /revoke all on public\.df_login_attempts from anon, authenticated/.test(mig));
t('migration : retour en arrière noté', /drop table public\.df_login_attempts/.test(mig));
console.log(`${ok}/${ok + bad} contrôles OK`);
process.exit(bad ? 1 : 0);
