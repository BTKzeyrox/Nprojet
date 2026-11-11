// Feuille du jour SANS réseau (M27.9) : règles pures de la boîte d'envoi + rejeu unique avec un « serveur » en mémoire + câblage. Lancer : npm run check:sheet-outbox
import fs from 'node:fs';
import { callPolicy, retryDelayMs } from '../src/utils/offline';
import { runOnce, cleanActionId, actionKey, type ActionRecord, type ActionStore } from '../src/utils/offlineServer';
import { queueSheet, applyAnswer, nextSheet, expireSheets, parseStored, sheetCounts, sheetLabel, sheetReviewReason, SHEET_QUEUED_TEXT } from '../src/utils/sheetOutbox';
import { planWorkEntries } from '../src/utils/workEntry';
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('OK   ' + m); } else { fail++; console.log('ECHEC ' + m); } };
const T0 = '2026-11-10T08:00:00.000Z', at = (min: number) => new Date(Date.parse(T0) + min * 60000).toISOString();
const sheet = (date = '2026-11-10', n = 3) => ({ date, type_label: 'Présence', lines: Array.from({ length: n }, (_, i) => ({ employee_id: `e${i + 1}`, work_type: 'presence', presence: 'present' })) });

// ---- Qui peut ----
ok(callPolicy('admin', 'work-entry').mode === 'queue' && callPolicy('team_lead', 'work-entry').mode === 'queue', 'responsable ET chef d\'équipe : la feuille peut attendre');
ok(callPolicy('employee', 'work-entry').mode === 'online' && callPolicy('accountant', 'work-entry').mode === 'online', 'opérateur et comptable : en ligne seulement');
ok(['upload', 'post-decide', 'news-comment', 'news-share', 'login', 'invoice-issue'].every(r => callPolicy('team_lead', r).mode === 'online'), 'le chef d\'équipe n\'obtient rien d\'autre hors ligne');
ok(queueSheet([], sheet(), 'employee', T0).error !== undefined && queueSheet([], sheet(), 'accountant', T0).error !== undefined, 'un opérateur ou un comptable ne peut pas mettre une feuille en file');

// ---- Mise en file ----
let q = queueSheet([], sheet(), 'team_lead', T0, undefined, 'abcdef0123456789').queue;
ok(q.length === 1 && q[0].id === 'abcdef0123456789' && q[0].kind === 'call' && q[0].route === 'work-entry' && q[0].state === 'pending', 'une feuille = une action « appel » avec SON numéro');
ok(queueSheet(q, sheet(), 'team_lead', T0, undefined, 'abcdef0123456789').error !== undefined, 'le même numéro n\'entre pas deux fois');
ok(!!cleanActionId(q[0].id), 'le numéro est accepté par le serveur (8 à 64 caractères)');
const big = { date: '2026-11-10', lines: [{ note: 'x'.repeat(2_000_000) }] };
ok(queueSheet([], big as any, 'admin', T0).error !== undefined, 'une feuille énorme est refusée avec un message, jamais en silence');
const l = sheetLabel(q[0]); ok(l.date === '2026-11-10' && l.type === 'Présence' && l.lines === 3, 'étiquette lisible : jour, type, nombre de lignes');
ok(/Enregistré sur ton téléphone, envoyé au retour du réseau/.test(SHEET_QUEUED_TEXT.fr) && !/réessaie plus tard/.test(SHEET_QUEUED_TEXT.fr), 'le message dit « enregistré sur ton téléphone », pas « réessaie plus tard »');

// ---- Envoi : une à la fois, dans l'ordre ----
let q2 = queueSheet(queueSheet([], sheet('2026-11-09'), 'admin', at(0), undefined, 'aaaaaaaa00000001').queue, sheet('2026-11-10'), 'admin', at(5), undefined, 'aaaaaaaa00000002').queue;
ok(nextSheet(q2, at(10), true)?.id === 'aaaaaaaa00000001', 'la plus ancienne part d\'abord');
ok(nextSheet(q2, at(10), false) === null, 'hors ligne : rien ne part');
ok(sheetCounts(q2).pending === 2 && sheetCounts(q2).lines === 6, 'compteur : 2 feuilles, 6 lignes');

// ---- Réponses du serveur ----
let r = applyAnswer(q2, 'aaaaaaaa00000001', { status: 0, error: 'Réseau indisponible.' }, at(10));
ok(r.outcome === 'waiting' && r.queue.length === 2 && r.queue[0].state === 'pending' && r.queue[0].tries === 1 && Date.parse(r.queue[0].next_try_at!) === Date.parse(at(10)) + retryDelayMs(0), 'coupure : reste en attente, nouvel essai plus tard');
ok(nextSheet(r.queue, at(10), true)?.id === 'aaaaaaaa00000002' || nextSheet(r.queue, at(10), true) === null, 'après une coupure on n\'insiste pas tout de suite');
ok(['500', '502', '503', '408', '429', '401'].every(s => applyAnswer(q2, 'aaaaaaaa00000001', { status: +s }, at(10)).outcome === 'waiting'), 'panne serveur, trop d\'appels, connexion expirée : on garde et on réessaie');
r = applyAnswer(q2, 'aaaaaaaa00000001', { status: 200 }, at(10));
ok(r.outcome === 'sent' && r.queue.length === 1 && r.queue[0].id === 'aaaaaaaa00000002', 'réussi : sort de la file');
r = applyAnswer(q2, 'aaaaaaaa00000001', { status: 400, error: 'Date impossible : aujourd\'hui ou les 31 derniers jours.' }, at(10));
ok(r.outcome === 'review' && r.queue.find(o => o.id === 'aaaaaaaa00000001')!.state === 'review' && r.queue.length === 2, 'refus : va dans « À revoir », rien n\'est supprimé');
ok(sheetReviewReason(r.queue[0], 'fr') === 'Date impossible : aujourd\'hui ou les 31 derniers jours.', 'la raison ÉCRITE par le serveur est montrée telle quelle');
ok(nextSheet(r.queue, at(60), true)?.id === 'aaaaaaaa00000002', 'une feuille refusée ne bloque pas les suivantes et ne repart pas toute seule');
const old = expireSheets(q2, at(8 * 24 * 60), 'admin');
ok(old.every(o => o.state === 'review' && o.review_code === 'too_old') && /trop longtemps/.test(sheetReviewReason(old[0], 'fr')), 'plus de 7 jours : « À revoir », jamais effacée');
ok(parseStored(JSON.stringify(q2)).length === 2 && parseStored('pas du json').length === 0 && parseStored('{"a":1}').length === 0 && parseStored(JSON.stringify([{ id: 'x', kind: 'record' }, null, 5])).length === 0, 'relecture du téléphone : le contenu abîmé est ignoré sans erreur');

// ---- Rejeu UNIQUE avec un « serveur » en mémoire (même moteur que df-api) ----
const rows = new Map<string, ActionRecord>();
const mem: ActionStore = { claim: async (k, rec) => { if (rows.has(k)) return false; rows.set(k, rec); return true; }, read: async k => rows.get(k) || null, update: async (k, rec) => { rows.set(k, rec); }, takeover: async (k, old, rec) => { if (rows.get(k) !== old) return false; rows.set(k, rec); return true; }, drop: async k => { rows.delete(k); } };
(async () => {
  const me = { id: 'tl1', name: 'Chef', role: 'team_lead', team: 'Atelier' };
  const users = ['e1', 'e2', 'e3'].map(id => ({ id, name: id, role: 'employee', status: 'active', team: 'Atelier', total_earnings_ar: 0 }));
  let posts: any[] = []; let runs = 0;
  const serverExec = (today: string, sh: any = sheet()) => async () => { runs++; const p = planWorkEntries(me, users, posts, sh, {}, '2026-11-10T08:00:00.000Z', today); if (!p.ok) return { status: 400, body: JSON.stringify({ error: p.error }) }; posts = [...posts, ...p.saved]; return { status: 200, body: JSON.stringify({ saved: p.saved.length, failed: p.failed, validated: p.validated }) }; };
  const id = 'abcdef0123456789';
  const a = await runOnce(mem, actionKey('tl1', id), 'work-entry', T0, Date.parse(T0), serverExec('2026-11-10'));
  const savedAfterFirst = posts.length;
  const b = await runOnce(mem, actionKey('tl1', id), 'work-entry', T0, Date.parse(T0) + 60000, serverExec('2026-11-10')); // la réponse s'est perdue : le téléphone renvoie
  const c = await runOnce(mem, actionKey('tl1', id), 'work-entry', T0, Date.parse(T0) + 120000, serverExec('2026-11-10')); // et encore
  ok(a.kind === 'fresh' && b.kind === 'replay' && c.kind === 'replay' && runs === 1 && posts.length === savedAfterFirst && savedAfterFirst === 3, 'envoyée 3 fois avec le même numéro : le serveur la fait UNE seule fois (3 lignes, pas 9)');
  ok(JSON.parse(b.status === 200 ? (b as any).body : '{}').saved === 3, 'le renvoi reçoit la même réponse que le premier envoi');
  ok(posts.every(p => p.status === 'pending_end'), 'saisie du chef d\'équipe : en attente, PERSONNE ne valide sa propre saisie');
  const other = await runOnce(mem, actionKey('e9', id), 'work-entry', T0, Date.parse(T0), async () => ({ status: 200, body: '{"saved":0}' }));
  ok(other.kind === 'fresh', 'le numéro d\'une autre personne ne rejoue pas ma feuille');
  // refus au rejeu : le jour est devenu trop ancien entre-temps (le serveur refuse) → la feuille passe dans « À revoir » avec la raison
  const q3 = queueSheet([], sheet('2026-10-01'), 'team_lead', T0, undefined, 'bbbbbbbb00000001').queue;
  const o = await runOnce(mem, actionKey('tl1', 'bbbbbbbb00000001'), 'work-entry', T0, Date.parse(T0), serverExec('2026-11-10', sheet('2026-10-01')));
  const body = JSON.parse(o.body);
  ok(o.status === 400, 'le serveur refuse la feuille au rejeu');
  const ap = applyAnswer(q3, 'bbbbbbbb00000001', { status: o.status, error: 'Date impossible : aujourd\'hui ou les 31 derniers jours.' }, at(1));
  ok(ap.outcome === 'review' && ap.queue.length === 1 && !!body, 'refusée au rejeu : « À revoir » avec la raison, la feuille reste sur le téléphone');
  const o2 = await runOnce(mem, actionKey('tl1', 'bbbbbbbb00000001'), 'work-entry', T0, Date.parse(T0), serverExec('2026-11-10'));
  ok(o2.kind === 'replay' && o2.status === 400, 'même numéro renvoyé : même refus, sans refaire');

  // ---- Câblage ----
  const store = fs.readFileSync('src/db/store.ts', 'utf8'), view = fs.readFileSync('src/views/WorksheetView.tsx', 'utf8'), ban = fs.readFileSync('src/components/SheetOutboxBanner.tsx', 'utf8'), api = fs.readFileSync('supabase/functions/df-api/index.ts', 'utf8');
  ok(/'x-df-action-id': id/.test(store) && /'x-df-device-time'/.test(store) && /init\?\.headers/.test(store), 'le site envoie le numéro d\'action et l\'heure du téléphone');
  ok(/const id = newOpId\(\)[\s\S]{0,1200}queueSheet\(this\.sheetQ, sheet, me\.role as OfflineRole, nowIso, undefined, id\)/.test(store), 'le MÊME numéro sert au premier envoi et à la file');
  ok(/retryNow\(\)[\s\S]{0,300}this\.sendSheets\(true\)/.test(store) && /lastPullStatus = r\.status;[\s\S]{0,300}sendSheets\(\)/.test(store) && /setDemoCut[\s\S]{0,500}sendSheets\(true\)/.test(store), 'envoi automatique : retour du réseau, réponse du serveur, fin de coupure simulée');
  ok(/df_sheet_outbox_/.test(store) && /sheetSave\(\)\) \{ this\.sheetQ = before/.test(store), 'gardée sur l\'appareil ; si l\'écriture échoue, la personne le sait (pas de faux « enregistré »)');
  ok(/r\.queued[\s\S]{0,200}SHEET_QUEUED_TEXT/.test(view) && /<SheetOutboxBanner \/>/.test(view), 'écran : message « enregistré sur ton téléphone » et bandeau');
  ok(/data-sheet-outbox-send/.test(ban) && /Envoyer maintenant/.test(ban) && /data-sheet-outbox-reason/.test(ban) && /window\.confirm/.test(ban), 'bandeau : « Envoyer maintenant », raison écrite, retrait seulement après confirmation');
  ok(/'work-entry'/.test(api.slice(api.indexOf('const ONCE_ROUTES'), api.indexOf('const ONCE_ROUTES') + 400)) && /req\.headers\.actionId && ONCE_ROUTES\.includes\(action\)/.test(api), 'serveur : work-entry est déjà « une seule fois » (aucun changement de df-api nécessaire)');
  console.log(`\n${pass} OK, ${fail} ECHEC`);
  process.exit(fail ? 1 : 0);
})();
