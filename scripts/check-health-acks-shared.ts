// Contrôle des marques « Ignorer / Vérifié » PARTAGÉES (M11.7 / « Accord Ignorer »). Sans réseau. Lancer : npm run check:health-acks-shared
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { cleanAckList, mergeAcks } from '../src/utils/health/acks';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const J = JSON.stringify;
const src = fs.readFileSync(new URL('../supabase/functions/df-api/index.ts', import.meta.url), 'utf8');
const m = /\/\/ ===== BEGIN HEALTH_ACKS[^\n]*\n([\s\S]*?)\/\/ ===== END HEALTH_ACKS =====/.exec(src);
ok(!!m, 'bloc « HEALTH_ACKS » trouvé dans le serveur');
const srv = new Function(`${transformSync(m![1], { loader: 'ts' }).code}\nreturn { cleanHealthAckList, applyHealthAcks };`)() as any;

const A = (id: string, at: string, over: any = {}) => ({ id, status: 'ignored', reason: 'ok', at, severity_at: 'watch', ...over });
const T1 = '2026-10-24T05:00:00.000Z', T2 = '2026-10-24T06:00:00.000Z';
const cases: [string, unknown][] = [
  ['liste valide', [A('team:late-often:u1', T1), A('stock:empty', T2, { status: 'checked', until: '2026-11-01', value_at: 3 })]],
  ['pas une liste', { a: 1 }], ['rien', undefined], ['null', null], ['texte', 'x'],
  ['gravité fausse', [A('team:x', T1, { severity_at: 'high' })]], ['statut faux', [A('team:x', T1, { status: 'deleted' })]],
  ['id faux', [A('Pas Valable', T1), A('', T1), A('a:b:c:d', T1)]], ['date fausse', [A('team:x', 'hier')]],
  ['until faux', [A('team:x', T1, { until: '12/11/2026' })]], ['value_at faux', [A('team:x', T1, { value_at: NaN }), A('team:y', T1, { value_at: '3' })]],
  ['doublon : la plus récente gagne', [A('team:x', T2, { reason: 'nouvelle' }), A('team:x', T1, { reason: 'ancienne' })]],
  ['motif trop long', [A('team:x', T1, { reason: ' ' + 'z'.repeat(500) })]],
  ['éléments piégés', [null, 5, 'x', [], A('team:x', T1, { __proto__: { evil: 1 } }), { id: 'team:y', status: 'ignored' }]],
  ['400 marques', Array.from({ length: 400 }, (_, i) => A(`team:r${i}`, new Date(Date.parse(T1) + i * 1000).toISOString()))],
];
for (const [name, v] of cases) ok(J(cleanAckList(v)) === J(srv.cleanHealthAckList(v)), `site = serveur : ${name}`);
ok(cleanAckList(cases[0][1])!.length === 2 && cleanAckList(cases[2][1]) === null, 'liste valide gardée ; « rien » = pas de liste');
ok(cleanAckList(cases[11][1])![0].reason === 'nouvelle' && cleanAckList(cases[11][1])!.length === 1, 'doublon : la marque la plus récente gagne');
ok(cleanAckList(cases[14][1])!.length === 300 && cleanAckList(cases[14][1])![299].id === 'team:r399', '400 marques : les 300 plus récentes seulement');
ok(cleanAckList(cases[12][1])![0].reason.length === 200, 'motif coupé à 200 caractères');
{ const r = mergeAcks([A('team:x', T1, { reason: 'a' })] as any, [A('team:x', T2, { reason: 'b' }), A('team:y', T1)] as any); ok(r.length === 2 && r.find(x => x.id === 'team:x')!.reason === 'b' && !!r.find(x => x.id === 'team:y'), 'réunion de deux listes : la plus récente gagne, rien ne se perd'); }

// règle d'écriture du serveur
const ex = { health_acks: [A('team:old', T1)], budgets: { x: 1 } };
ok(J(srv.applyHealthAcks({ a: 1 }, { health_acks: [A('team:new', T2)] }, ex).health_acks.map((x: any) => x.id)) === J(['team:new']), 'serveur : la liste envoyée remplace l\'ancienne');
ok(J(srv.applyHealthAcks({ a: 1 }, { a: 2 }, ex).health_acks.map((x: any) => x.id)) === J(['team:old']), 'serveur : ancien site qui n\'envoie rien = l\'existant est gardé');
ok(J(srv.applyHealthAcks({ a: 1 }, { health_acks: 'n\'importe quoi' }, ex).health_acks.map((x: any) => x.id)) === J(['team:old']), 'serveur : valeur qui n\'est pas une liste = l\'existant est gardé');
ok(Array.isArray(srv.applyHealthAcks({ a: 1 }, { health_acks: [] }, ex).health_acks) && srv.applyHealthAcks({ a: 1 }, { health_acks: [] }, ex).health_acks.length === 0, 'serveur : liste vide envoyée = tout remis (liste vide gardée pour les autres appareils)');
ok(!('health_acks' in srv.applyHealthAcks({ a: 1 }, {}, {})), 'serveur : jamais de marques = pas de champ');
ok(srv.applyHealthAcks({ a: 1 }, { health_acks: [{ id: 'bad' }] }, ex).health_acks.length === 0, 'serveur : marques fausses jetées');
ok(J(srv.applyHealthAcks({ a: 1, b: 2 }, { health_acks: [] }, ex)).includes('"a":1,"b":2'), 'serveur : les autres réglages ne bougent pas');

ok(/"mission_templates", "budgets", "health_acks"\]/.test(src), 'serveur : jamais envoyé à un opérateur (liste des réglages réservés à l\'admin)');
ok(/AUDIT_SETTINGS_SKIP = \[[^\]]*"health_acks"/.test(src), 'serveur : pas de ligne d\'audit à chaque « Vérifié »');
ok(/applyHealthAcks\(toSave, rec, existing\)/.test(src), 'serveur : la vérification est appelée à chaque écriture des réglages');
const hd = fs.readFileSync('src/utils/healthDb.ts', 'utf8');
ok(/health_acks: list/.test(hd) && /cleanAckList/.test(hd) && !/isDemo/.test(hd), 'site : écrit dans les réglages, lit la liste vérifiée');
ok(/mergedKey/.test(hd) && /mergeAcks\(shared \|\| \[\], local\)/.test(hd), 'site : les marques déjà gardées sur l\'appareil sont reprises une seule fois');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
