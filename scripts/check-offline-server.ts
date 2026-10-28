// Contrôle des actions numérotées du serveur (module 13, M13.7). Lancer : npm run check:offline-server
// 1) règles pures (une action = une exécution) avec une « table » en mémoire ; 2) le bloc du serveur est la copie exacte du site et se comporte pareil ;
// 3) le câblage dans df-api (routes, en-têtes autorisés, avant/après connexion) ; 4) la migration.
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import * as site from '../src/utils/offlineServer';
import type { ActionRecord, ActionStore } from '../src/utils/offlineServer';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const good = JSON.stringify(got) === JSON.stringify(want); if (!good) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };
const ok = (c: boolean, name: string) => eq(c, true, name);

function memStore() {
  const rows = new Map<string, ActionRecord>();
  const log = { claims: 0, drops: 0 };
  const store: ActionStore = {
    async claim(k, r) { log.claims++; if (rows.has(k)) return false; rows.set(k, r); return true; },
    async read(k) { return rows.get(k) ?? null; },
    async update(k, r) { rows.set(k, r); },
    async takeover(k, old, r) { const cur = rows.get(k); if (!cur || cur.state !== 'running' || cur.started_at !== old.started_at) return false; rows.set(k, r); return true; },
    async drop(k) { log.drops++; rows.delete(k); },
  };
  return { store, rows, log };
}
const NOW = Date.UTC(2026, 9, 28, 9, 0, 0);
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function suite(M: typeof site, label: string) {
  const L = (s: string) => `${label} : ${s}`;
  // ---- numéro d'action
  eq(M.cleanActionId('a1b2c3d4'), 'a1b2c3d4', L('numéro de 8 caractères accepté'));
  eq(M.cleanActionId('  op-2026-10-28.x:7f3a9c  '), 'op-2026-10-28.x:7f3a9c', L('espaces autour retirés, - . : acceptés'));
  eq(M.cleanActionId('abc'), null, L('trop court refusé'));
  eq(M.cleanActionId('a'.repeat(65)), null, L('trop long refusé'));
  eq(M.cleanActionId('a'.repeat(64)), 'a'.repeat(64), L('64 caractères acceptés'));
  eq(M.cleanActionId('abcd efgh'), null, L('espace au milieu refusé'));
  eq(M.cleanActionId('abcdefg/h'), null, L('« / » refusé'));
  eq(M.cleanActionId("abcdefg'h"), null, L('apostrophe refusée'));
  eq(M.cleanActionId(12345678), null, L('nombre refusé'));
  eq(M.cleanActionId(null), null, L('rien refusé'));
  eq(M.cleanActionId(''), null, L('vide refusé'));
  eq(M.actionKey('u1', 'abcdefgh'), 'u1:abcdefgh', L('clé = personne + numéro'));
  eq(M.actionKey(null, 'abcdefgh'), 'anon:abcdefgh', L('sans connexion : anon'));
  ok(M.actionKey('u1', 'abcdefgh') !== M.actionKey('u2', 'abcdefgh'), L('deux personnes, même numéro : deux clés'));
  // ---- heure du téléphone
  eq(M.cleanDeviceTime('2026-10-28T08:59:00.000Z', NOW), { iso: '2026-10-28T08:59:00.000Z', skew_s: 60 }, L('heure du téléphone gardée, écart 60 s'));
  eq(M.cleanDeviceTime('2026-10-28T09:10:00.000Z', NOW).skew_s, -600, L('téléphone en avance : écart négatif'));
  eq(M.cleanDeviceTime('2026-10-27T09:00:00Z', NOW).skew_s, 86400, L('action faite hier hors ligne : écart 1 jour'));
  eq(M.cleanDeviceTime('2026-10-29T09:00:01Z', NOW), { iso: null, skew_s: null }, L('plus d\'un jour dans le futur : ignorée'));
  eq(M.cleanDeviceTime('2019-12-31T23:59:59Z', NOW), { iso: null, skew_s: null }, L('avant 2020 : ignorée'));
  eq(M.cleanDeviceTime('pas une date', NOW), { iso: null, skew_s: null }, L('texte quelconque : ignoré'));
  eq(M.cleanDeviceTime('', NOW), { iso: null, skew_s: null }, L('vide : ignoré'));
  eq(M.cleanDeviceTime(1790000000000, NOW), { iso: null, skew_s: null }, L('nombre : ignoré'));
  eq(M.cleanDeviceTime('2026-10-28T08:00:00Z' + ' '.repeat(50), NOW), { iso: null, skew_s: null }, L('texte trop long : ignoré'));
  // ---- une seule exécution
  {
    const { store, rows } = memStore(); let runs = 0;
    const exec = async () => { runs++; return { status: 200, body: '{"ok":true,"id":"c1"}' }; };
    const a = await M.runOnce(store, 'u1:abcdefgh', 'news-comment', '2026-10-28T08:50:00Z', NOW, exec);
    ok(a.kind === 'fresh' && a.status === 200 && a.body === '{"ok":true,"id":"c1"}' && runs === 1, L('1re fois : exécutée'));
    const b = await M.runOnce(store, 'u1:abcdefgh', 'news-comment', '2026-10-28T08:50:00Z', NOW + 5000, exec);
    ok(b.kind === 'replay' && b.status === 200 && b.body === a.body && runs === 1, L('2e fois (même numéro) : même réponse, PAS refaite'));
    await M.runOnce(store, 'u1:abcdefgh', 'news-comment', '', NOW + 9000, exec); await M.runOnce(store, 'u1:abcdefgh', 'news-comment', '', NOW + 9500, exec);
    ok(runs === 1, L('5 renvois de suite : toujours une seule exécution'));
    const r = rows.get('u1:abcdefgh')!;
    ok(r.state === 'done' && r.route === 'news-comment' && r.received_at === '2026-10-28T09:00:00.000Z' && r.device_time === '2026-10-28T08:50:00.000Z' && r.skew_s === 600, L('la fiche garde heure de réception, heure du téléphone, écart'));
    await M.runOnce(store, 'u2:abcdefgh', 'news-comment', '', NOW, exec);
    ok(runs === 2, L('une autre personne avec le même numéro : exécutée'));
    await M.runOnce(store, 'u1:zzzzzzzz', 'news-comment', '', NOW, exec);
    ok(runs === 3, L('un autre numéro : exécuté'));
  }
  // ---- refus gardé et rejoué
  {
    const { store } = memStore(); let runs = 0;
    const exec = async () => { runs++; return { status: 400, body: '{"error":"Écris un commentaire ou joins un fichier."}' }; };
    const a = await M.runOnce(store, 'u1:refus001', 'news-comment', '', NOW, exec);
    const b = await M.runOnce(store, 'u1:refus001', 'news-comment', '', NOW + 1, exec);
    ok(a.status === 400 && b.kind === 'replay' && b.status === 400 && b.body.includes('Écris un commentaire') && runs === 1, L('un refus 400 est rejoué avec SA raison, sans refaire'));
  }
  // ---- erreur serveur : nouvel essai permis
  {
    const { store, rows } = memStore(); let runs = 0;
    const exec = async () => { runs++; return runs === 1 ? { status: 500, body: '{"error":"Erreur serveur."}' } : { status: 200, body: '{"ok":true}' }; };
    const a = await M.runOnce(store, 'u1:panne001', 'news-react', '', NOW, exec);
    ok(a.status === 500 && !rows.has('u1:panne001'), L('erreur serveur 500 : la fiche est effacée'));
    const b = await M.runOnce(store, 'u1:panne001', 'news-react', '', NOW + 1, exec);
    ok(b.kind === 'fresh' && b.status === 200 && runs === 2, L('...donc le téléphone peut réessayer'));
    const c = await M.runOnce(store, 'u1:panne001', 'news-react', '', NOW + 2, exec);
    ok(c.kind === 'replay' && runs === 2, L('...et ensuite plus jamais refait'));
  }
  // ---- exception
  {
    const { store, rows } = memStore(); let runs = 0;
    const exec = async () => { runs++; if (runs === 1) throw new Error('boum'); return { status: 200, body: '{"ok":true}' }; };
    let caught = ''; try { await M.runOnce(store, 'u1:boum0001', 'post-decide', '', NOW, exec); } catch (e: any) { caught = e.message; }
    ok(caught === 'boum' && !rows.has('u1:boum0001'), L('exception : remontée, fiche effacée'));
    const b = await M.runOnce(store, 'u1:boum0001', 'post-decide', '', NOW + 1, exec);
    ok(b.kind === 'fresh' && runs === 2, L('...et on peut réessayer'));
  }
  // ---- appels simultanés
  {
    const { store } = memStore(); let runs = 0;
    const exec = async () => { runs++; await wait(30); return { status: 200, body: '{"ok":true}' }; };
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => M.runOnce(store, 'u1:meme0001', 'news-submit', '', NOW, exec)));
    const kinds = [a, b, c].map(x => x.kind).sort();
    ok(runs === 1 && kinds.join() === 'busy,busy,fresh', L('3 appels en même temps : un seul exécuté, les 2 autres « déjà en cours »'));
    const busy = [a, b, c].find(x => x.kind === 'busy')!;
    ok(busy.status === 409 && JSON.parse(busy.body).code === 'in_progress' && /en cours/.test(JSON.parse(busy.body).error), L('« déjà en cours » : 409 avec une raison claire'));
    const d = await M.runOnce(store, 'u1:meme0001', 'news-submit', '', NOW + 1, exec);
    ok(d.kind === 'replay' && runs === 1, L('après coup : réponse rejouée'));
  }
  // ---- appel tombé en panne
  {
    const { store, rows } = memStore(); let runs = 0;
    const exec = async () => { runs++; return { status: 200, body: '{"ok":true}' }; };
    rows.set('u1:tombe001', { state: 'running', route: 'news-submit', started_at: new Date(NOW - 60_000).toISOString(), received_at: new Date(NOW - 60_000).toISOString(), device_time: null, skew_s: null });
    const a = await M.runOnce(store, 'u1:tombe001', 'news-submit', '', NOW, exec);
    ok(a.kind === 'busy' && runs === 0, L('« en cours » depuis 1 min : on attend'));
    const b = await M.runOnce(store, 'u1:tombe001', 'news-submit', '', NOW + 61_000, exec);
    ok(b.kind === 'fresh' && runs === 1, L('« en cours » depuis plus de 2 min : considéré tombé en panne, refait une fois'));
    const c = await M.runOnce(store, 'u1:tombe001', 'news-submit', '', NOW + 62_000, exec);
    ok(c.kind === 'replay' && runs === 1, L('...puis rejoué'));
    // deux reprises en même temps : une seule gagne
    rows.set('u1:tombe002', { state: 'running', route: 'x', started_at: new Date(NOW - 300_000).toISOString(), received_at: '', device_time: null, skew_s: null });
    let r2 = 0; const slow = async () => { r2++; await wait(20); return { status: 200, body: '{}' }; };
    const [x, y] = await Promise.all([M.runOnce(store, 'u1:tombe002', 'x', '', NOW, slow), M.runOnce(store, 'u1:tombe002', 'x', '', NOW, slow)]);
    ok(r2 === 1 && [x.kind, y.kind].sort().join() === 'busy,fresh', L('deux reprises simultanées : une seule refait'));
  }
  // ---- réponse trop longue
  {
    const { store, rows } = memStore();
    const big = JSON.stringify({ text: 'x'.repeat(20_000) });
    const exec = async () => ({ status: 200, body: big });
    const a = await M.runOnce(store, 'u1:grand001', 'news-submit', '', NOW, exec);
    ok(a.body === big && rows.get('u1:grand001')!.body === undefined && rows.get('u1:grand001')!.body_cut === true, L('réponse > 16 000 caractères : donnée au 1er appel, pas gardée en entier'));
    const b = await M.runOnce(store, 'u1:grand001', 'news-submit', '', NOW + 1, exec);
    const j = JSON.parse(b.body);
    ok(b.kind === 'replay' && b.status === 200 && j.ok === true && j.replayed === true && b.body.length < 400, L('rejouée : code gardé + note claire (jamais vide)'));
  }
  eq([...M.ONCE_ROUTES].sort(), ['news-comment', 'news-comment-delete', 'news-comment-react', 'news-react', 'news-share', 'news-submit', 'post-decide', 'report-error'], L('les 8 appels non répétables sont numérotés'));
  ok(!M.ONCE_ROUTES.includes('sync') && !M.ONCE_ROUTES.includes('login') && !M.ONCE_ROUTES.includes('invoice-pay'), L('sync (déjà sans danger), connexion et argent ne sont pas concernés'));
  ok(M.ACTION_RUNNING_MS === 120_000 && M.ACTION_KEEP_DAYS === 30 && M.ACTION_BODY_MAX === 16_000, L('limites : 2 min, 30 jours, 16 000 caractères'));
}

await suite(site, 'site');

// ---- le serveur : même texte, même comportement
const idx = readFileSync('supabase/functions/df-api/index.ts', 'utf8').replace(/\r\n/g, '\n');
const m = idx.match(/\/\/ ===== BEGIN OFFLINE_ACTIONS[^\n]*\n([\s\S]*?)\/\/ ===== END OFFLINE_ACTIONS =====/);
ok(!!m, 'serveur : bloc OFFLINE_ACTIONS présent');
if (m) {
  const file = readFileSync('src/utils/offlineServer.ts', 'utf8').replace(/\r\n/g, '\n');
  const sm = file.match(/\/\/ ===== BEGIN OFFLINE_ACTIONS[^\n]*\n([\s\S]*?)\/\/ ===== END OFFLINE_ACTIONS =====/)!;
  const strip = (s: string) => s.replace(/^export /gm, '').trim();
  ok(strip(sm[1]) === strip(m[1]), 'serveur : le bloc est la copie exacte de src/utils/offlineServer.ts (sans « export »)');
  ok(file.split('\n').find(l => l.includes('BEGIN OFFLINE_ACTIONS')) === idx.split('\n').find(l => l.includes('BEGIN OFFLINE_ACTIONS')), 'serveur : même ligne de repère');
  const js = transformSync(m[1] + '\n;globalThis.__o = { ONCE_ROUTES, ACTION_RUNNING_MS, ACTION_KEEP_DAYS, ACTION_BODY_MAX, cleanActionId, cleanDeviceTime, actionKey, runOnce };', { loader: 'ts' }).code;
  new Function(js)();
  await suite((globalThis as any).__o, 'serveur');
}

// ---- câblage dans df-api
const all = idx.split('\n'), serveAt = all.findIndex(l => l.startsWith('Deno.serve(')); // le routeur seulement (d'autres fonctions appellent aussi authenticate)
const line = (re: RegExp) => { const i = all.slice(serveAt).findIndex(l => re.test(l)); return i < 0 ? -1 : i + serveAt; };
ok(/"Access-Control-Allow-Headers": "[^"]*x-df-action-id[^"]*x-df-device-time/.test(idx), 'câblage : les deux en-têtes sont autorisés par CORS (sinon le navigateur bloque l\'appel)');
ok(/actionId: request\.headers\.get\("x-df-action-id"\)/.test(idx) && /deviceTime: request\.headers\.get\("x-df-device-time"\)/.test(idx), 'câblage : les en-têtes sont lus');
const iAnon = line(/action === "report-error" && req\.method === "POST" && req\.headers\.actionId\) return await onceRoute\(action, req, res, null\)/), iPlain = line(/action === "report-error" && req\.method === "POST"\) return await reportError/), iAuth = line(/const me = await authenticate\(req\)/), iOnce = line(/req\.headers\.actionId && ONCE_ROUTES\.includes\(action\)\) return await onceRoute\(action, req, res, me\)/), iState = line(/action === "state" && req\.method === "GET"/), iMaint = line(/const mm = await maintenanceMessage\(me\)/), iShift = line(/const acc = await shiftAccess\(me\)/);
ok(iAnon >= 0 && iAnon < iPlain && iPlain < iAuth, 'câblage : rapport d\'erreur numéroté traité avant la connexion, avant l\'appel ordinaire');
ok(iOnce > iMaint && iOnce > iShift && iOnce > iAuth && iOnce < iState, 'câblage : les autres appels numérotés passent APRÈS la connexion, la maintenance et le contrôle de plage horaire');
for (const r of site.ONCE_ROUTES) ok(new RegExp(`action === "${r}"`).test(idx) && (r === 'news-submit' || new RegExp(`if \\(action === "${r}"\\) return await`).test(idx.slice(idx.indexOf('async function callOnce')))), `câblage : ${r} est exécuté par callOnce`);
ok(/ignoreDuplicates: true/.test(idx) && /\.eq\("data->>state", "running"\)\.eq\("data->>started_at", old\.started_at\)/.test(idx), 'câblage : création sans écraser, reprise seulement si personne n\'a changé la fiche');
ok(/x-df-replayed/.test(idx), 'câblage : une réponse rejouée est marquée');
ok(/df_actions/.test(idx) && idx.includes('const ACTIONS = "df_actions"'), 'câblage : table df_actions');
ok(!/callOnce\([^)]*\)[\s\S]{0,200}sync/.test(idx.slice(idx.indexOf('async function onceRoute'), idx.indexOf('Deno.serve'))), 'câblage : sync n\'est pas touché');
// un appel SANS numéro marche comme avant
ok(iPlain >= 0 && /action === "post-decide" && req\.method === "POST"\) return await postDecide/.test(idx) && /action === "news-comment" && req\.method === "POST"\) return await newsAction\('comment'/.test(idx), 'câblage : sans numéro, les appels sont traités exactement comme avant');

// ---- migration
const mig = readFileSync('supabase/migrations/20261028_create_df_actions.sql', 'utf8');
ok(/create table if not exists public\.df_actions/.test(mig) && /enable row level security/.test(mig) && /revoke all on public\.df_actions from anon, authenticated/.test(mig), 'migration : table fermée au public');
ok(/drop table public\.df_actions/.test(mig) && /sauvegarde/i.test(mig) && /Accord hors ligne/.test(mig), 'migration : retour en arrière, sauvegarde et accord écrits');
ok(!/drop table public\.(?!df_actions)/.test(mig.replace(/--[^\n]*/g, '')) , 'migration : ne supprime rien d\'autre');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
