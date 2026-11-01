// Contrôle des heures d'étapes d'une mission : demande de début envoyée, début validé, fin envoyée, fin validée (demande de BTK, 2026-11-01). Lancer : npm run check:post-stamps
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { stampPostTimes, planPostDecision } from '../src/utils/postDecision';
import { dayDetail } from '../src/utils/dayDetail';

let fails = 0, total = 0;
const eq = (got: unknown, want: unknown, name: string) => { total++; if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } };
const ok = (c: boolean, name: string) => eq(!!c, true, name);

// Copie du serveur (bloc DECIDE de df-api) : exécutée telle quelle
const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const m = src.match(/\/\/ ===== BEGIN DECIDE[^\n]*\n([\s\S]*?)\/\/ ===== END DECIDE =====/);
if (!m) throw new Error('bloc DECIDE introuvable');
new Function(transformSync(m[1] + '\n;globalThis.__s = { stampPostTimes, planPostDecision };', { loader: 'ts' }).code)();
const S = (globalThis as any).__s;
const both = (name: string, f: (impl: { stamp: typeof stampPostTimes; plan: typeof planPostDecision }) => void) => { f({ stamp: stampPostTimes, plan: planPostDecision }); f({ stamp: S.stampPostTimes, plan: S.planPostDecision }); void name; };

const T0 = '2026-11-01T04:55:00.000Z', T1 = '2026-11-01T04:57:00.000Z', T2 = '2026-11-01T06:00:00.000Z', T3 = '2026-11-01T06:05:00.000Z';
both('étapes', ({ stamp, plan }) => {
  const sent = stamp(undefined, { id: 'p', status: 'pending_start' }, T0);
  eq(sent.start_sent_at, T0, 'nouvelle mission en attente de début : heure d\'envoi posée');
  const ren = stamp(sent, { id: 'p', status: 'pending_start' }, T1);
  eq(ren.start_sent_at, T0, 'renvoi du même état : l\'heure d\'envoi ne bouge pas');
  const valid = stamp(sent, { id: 'p', status: 'active' }, T1);
  eq([valid.start_sent_at, valid.start_validated_at], [T0, T1], 'début validé : heure de validation posée, envoi gardé');
  const end = stamp(valid, { id: 'p', status: 'pending_end' }, T2);
  eq([end.start_validated_at, end.end_sent_at], [T1, T2], 'fin envoyée : heure posée, anciennes heures gardées');
  const done = stamp(end, { id: 'p', status: 'completed' }, T3);
  eq([done.start_sent_at, done.start_validated_at, done.end_sent_at, done.end_validated_at], [T0, T1, T2, T3], 'fin validée : les 4 heures sont là');
  const forged = stamp(sent, { id: 'p', status: 'pending_start', start_sent_at: '2000-01-01T00:00:00.000Z', end_validated_at: '2000-01-01T00:00:00.000Z' }, T1);
  eq([forged.start_sent_at, forged.end_validated_at], [T0, undefined], 'heure inventée par un navigateur : ignorée');
  const old = stamp({ id: 'p', status: 'active' }, { id: 'p', status: 'active', current_score: 5 }, T1);
  eq(Object.keys(old).filter(k => k.endsWith('_at')), [], 'ancienne mission : rien n\'est inventé');
  eq(stamp(undefined, null as any, T0), null, 'valeur vide : renvoyée telle quelle');
  // Décision par le serveur (route de validation)
  const p1 = plan({ id: 'p', status: 'pending_start', employee_id: 'e' }, undefined, {}, undefined, true, '', T1);
  eq([p1.post.status, p1.post.start_validated_at], ['active', T1], 'validation du début par la route : heure posée');
  const p2 = plan({ id: 'p', status: 'pending_end', employee_id: 'e', initial_score: 0, current_score: 10, start_sent_at: T0 }, undefined, { price_per_mission: 5000 }, undefined, true, '', T3);
  eq([p2.post.status, p2.post.end_validated_at, p2.post.start_sent_at], ['completed', T3, T0], 'validation de la fin par la route : heure posée, envoi gardé');
  const p3 = plan({ id: 'p', status: 'pending_end', employee_id: 'e' }, undefined, {}, undefined, false, 'Photo floue', T3);
  eq(p3.post.end_validated_at, undefined, 'refus : pas d\'heure de validation');
});
ok(/if \(col === 'posts' && toSave\) toSave = stampPostTimes\(existing, toSave, now\)/.test(src), 'serveur : les heures sont posées avant l\'enregistrement d\'une mission');

// Affichage : le détail du jour donne les 4 heures (heure de Madagascar)
const post: any = { id: 'p1', employee_id: 'e', client_name: 'C', date: '2026-11-01', start_time: '07:57:00', end_time: '09:00:00', status: 'completed', initial_score: 0, current_score: 10, final_score: 10, target_score: 10, calculated_ar: 5000,
  start_sent_at: '2026-11-01T04:55:00.000Z', start_validated_at: '2026-11-01T04:57:00.000Z', end_sent_at: '2026-11-01T06:00:00.000Z', end_validated_at: '2026-11-01T06:05:00.000Z' };
const d = dayDetail([post], undefined, 'e', '2026-11-01', Date.parse('2026-11-01T12:00:00Z'), '2026-11-01');
eq([d.missions[0].startSent, d.missions[0].startValidated, d.missions[0].endSent, d.missions[0].endValidated], ['07:55', '07:57', '09:00', '09:05'], 'détail du jour : 4 heures à l\'heure de Madagascar (+3 h)');
const oldPost = { ...post, start_sent_at: undefined, start_validated_at: undefined, end_sent_at: undefined, end_validated_at: undefined };
const d2 = dayDetail([oldPost], undefined, 'e', '2026-11-01', Date.parse('2026-11-01T12:00:00Z'), '2026-11-01');
eq([d2.missions[0].startSent, d2.missions[0].startValidated, d2.missions[0].endSent, d2.missions[0].endValidated], ['07:57', null, '09:00', null], 'ancienne mission : envoi = heure de début / de fin, validation = « — » (jamais inventée)');
const d3 = dayDetail([{ ...post, status: 'pending_start', end_time: undefined, start_validated_at: undefined, end_sent_at: undefined, end_validated_at: undefined }], undefined, 'e', '2026-11-01', Date.parse('2026-11-01T12:00:00Z'), '2026-11-01');
eq([d3.missions[0].endSent, d3.missions[0].endValidated], [null, null], 'mission pas encore finie : pas d\'heure de fin');
eq(dayDetail([{ ...post, start_sent_at: 'pas une date' }], undefined, 'e', '2026-11-01', 0, '2026-11-01').missions[0].startSent, '07:57', 'heure illisible : on retombe sur l\'heure de début');
const cal = readFileSync('src/views/CalendarView.tsx', 'utf8');
ok(/mission-times-\$\{m\.id\}/.test(cal) && /m\.startValidated/.test(cal) && /m\.endValidated/.test(cal), 'écran : chaque mission montre début envoyé / validé et fin envoyée / validée');

console.log(fails ? `${fails} ÉCHEC(S) sur ${total}` : `${total}/${total} contrôles réussis`);
process.exit(fails ? 1 : 0);
