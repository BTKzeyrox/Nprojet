// Contrôle : réglages synchronisés par compte (règles identiques site/serveur, plan de synchro, branchements). Lancer : npm run check:prefs-sync
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as P from '../src/utils/prefsRules';
let f = 0, t = 0;
const eq = (g: unknown, w: unknown, n: string) => { t++; if (JSON.stringify(g) !== JSON.stringify(w)) { f++; console.log(`ECHEC ${n}\n  obtenu ${JSON.stringify(g)}\n  attendu ${JSON.stringify(w)}`); } };
const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const m = src.match(/\/\/ ===== BEGIN PREFS[^\n]*\n([\s\S]*?)\/\/ ===== END PREFS =====/);
if (!m) throw new Error('bloc PREFS introuvable dans df-api');
new Function(transformSync(m[1] + '\n;globalThis.__p = { PREF_NAMES, cleanPrefs };', { loader: 'ts' }).code)();
const S = (globalThis as any).__p;
eq(S.PREF_NAMES, P.PREF_NAMES, 'noms des réglages identiques (site / serveur)');
const samples: unknown[] = [{ theme: 'dark', lang: 'en', font: '17', evil: 'x', __proto__: { a: 1 } }, { sound: null, watch: 'x'.repeat(6001) }, { watch: 'x'.repeat(6000) }, { theme: 5, lang: {}, font: [] }, null, undefined, 'texte', [], { constructor: 'x', theme: 'light' }];
samples.forEach((x, i) => eq(S.cleanPrefs(x), P.cleanPrefs(x), `même nettoyage site / serveur #${i}`));
eq(P.cleanPrefs({ theme: 'dark', evil: 'x', sound: null }), { theme: 'dark', sound: null }, 'réglage inconnu ignoré, null gardé');
eq(P.cleanPrefs({ watch: 'x'.repeat(6001) }), {}, 'valeur trop longue refusée');
eq(P.cleanPrefs({ theme: 3 }), {}, 'valeur non texte refusée');
eq(P.localKeyOf('theme', 'u1'), 'delta_theme', 'clé thème');
eq(P.localKeyOf('health_notif', 'u1'), 'df_notif_health_u1', 'clé Santé propre au compte');
eq(P.nameOfLocalKey('df_watch_u2', 'u2'), 'watch', 'clé inverse');
eq(P.localKeyOf('chat_pinthreads', 'u1'), 'df_chat_pinthreads_u1', 'discussions épinglées');
eq(P.localKeyOf('chat_archived', 'u1'), 'df_chat_archived_u1', 'conversations cachées');
eq(P.localKeyOf('chat_hidden', 'u1'), 'df_chat_hidden_u1', 'messages supprimés pour moi');
eq(P.localKeyOf('chat_seen', 'u1'), 'df_chat_seen_u1', 'lu / non lu');
eq(P.cleanPrefs({ chat_hidden: 'x'.repeat(59000) }).chat_hidden?.length, 59000, 'longue liste de messages cachés acceptée');
eq(P.cleanPrefs({ chat_pinthreads: 'x'.repeat(7000) }), {}, 'liste courte : limite normale');
// les clés de messagerie synchronisées sont bien celles de chatPrefs.ts
const cp = readFileSync('src/utils/chatPrefs.ts', 'utf8');
eq(['hidden', 'archived', 'pinthreads', 'seen'].every(k => cp.includes(`key('${k}', uid)`)), true, 'chatPrefs.ts utilise les mêmes clés');
eq(/visibilitychange/.test(readFileSync('src/App.tsx', 'utf8')) && /syncPrefsFromAccount\(\)\.then\(changed => \{ const a/.test(readFileSync('src/App.tsx', 'utf8')), true, 'retour au premier plan : resynchro, sans recharger pendant la saisie');
eq(P.nameOfLocalKey('df_watch_u2', 'u1'), null, 'le réglage d\'un autre compte n\'est pas pris');
eq(P.nameOfLocalKey('df_session_token_v2', 'u1'), null, 'JAMAIS la clé de connexion');
eq(P.PREF_NAMES.map(n => P.localKeyOf(n, 'u')).includes('df_session_token_v2'), false, 'le jeton de connexion n\'est pas synchronisé');
// plan
eq(P.planPrefsSync({ theme: 'dark' }, { theme: 'light' }), { toLocal: { theme: 'dark' }, toServer: {} }, 'le compte gagne sur l\'appareil');
eq(P.planPrefsSync({}, { theme: 'light', lang: 'fr' }), { toLocal: {}, toServer: { theme: 'light', lang: 'fr' } }, 'appareil neuf pour le compte : envoyé au compte');
eq(P.planPrefsSync({ theme: 'dark' }, { theme: 'dark' }), { toLocal: {}, toServer: {} }, 'identiques : rien à faire');
eq(P.planPrefsSync({ theme: 'dark' }, { theme: 'dark', font: '18' }), { toLocal: {}, toServer: { font: '18' } }, 'mélange');
eq(P.planPrefsSync({ theme: 'dark' }, {}), { toLocal: { theme: 'dark' }, toServer: {} }, 'appareil vide : reprend le compte');
// serveur
eq(/action === "prefs" && req\.method === "GET"/.test(src) && /action === "prefs-set" && req\.method === "POST"/.test(src), true, 'serveur : 2 routes');
eq(/eq\('id', String\(me\.id\)\)/.test(src.slice(src.indexOf('async function prefsGetRoute'), src.indexOf('async function prefsSetRoute'))), true, 'serveur : chacun ne lit QUE ses réglages');
eq(/const id = String\(me\.id\)/.test(src.slice(src.indexOf('async function prefsSetRoute'))), true, 'serveur : chacun n\'écrit QUE les siens');
const app = readFileSync('src/App.tsx', 'utf8');
eq(/syncPrefsFromAccount\(\)\.then/.test(app) && /installPrefsSync\(\)/.test(app) && /window\.location\.reload\(\)/.test(app) && /df_prefs_reload/.test(app), true, 'appli : synchro à l\'ouverture du compte, un seul rechargement');
const mig = readFileSync('supabase/migrations/20261102_create_df_prefs.sql', 'utf8');
eq(/create table if not exists public\.df_prefs/.test(mig) && /enable row level security/.test(mig) && /revoke all on public\.df_prefs from anon, authenticated/.test(mig), true, 'migration : table fermée au public');
console.log(f ? `${f} ÉCHEC(S) sur ${t}` : `${t}/${t} contrôles réussis`); process.exit(f ? 1 : 0);
