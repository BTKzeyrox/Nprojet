// M18.5 : fabrique le SQL qui charge (ou recharge) la simulation dans la vraie base. N'écrit RIEN lui-même : il affiche le SQL, c'est une personne qui l'exécute (après sauvegarde et accord de BTK).
// Usage : npx tsx scripts/sim-load-sql.ts [AAAA-MM-JJ]  > sim-load.sql
// Recharger = relancer avec la nouvelle date : le SQL commence par supprimer UNIQUEMENT les lignes marquées « sim- » (et le planning des 4 opérateurs de la simulation), jamais les vraies données.
import { buildSimulation, isSimShift, type SimOperator } from '../src/sim/simulation';

const today = process.argv[2] || new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // jour de Madagascar
// Les 4 vrais comptes opérateurs créés par BTK (M18.5) : la simulation travaille avec eux, pour qu'ils voient leurs propres missions.
const operators: SimOperator[] = [
  { id: 'user-emp-operator1', name: 'Opérateur 1', username: 'operator1', shift: 'day', monthly: 84 },
  { id: 'user-emp-operator2', name: 'Opérateur 2', username: 'operator2', shift: 'day', monthly: 64 },
  { id: 'user-emp-operator3', name: 'Opérateur 3', username: 'operator3', shift: 'night', monthly: 44 },
  { id: 'user-emp-operator4', name: 'Opérateur 4', username: 'operator4', shift: 'night', monthly: 24 },
];
const wdArg = (process.argv.find(a => a.startsWith('--workdays=')) || '').slice(11).split(',').filter(Boolean).map(Number); // ex. --workdays=1,2,3,4,5 (lundi à vendredi)
const sim = buildSimulation({ today, adminId: 'user-admin-1', adminName: 'Admin', operators, workDays: wdArg.length ? wdArg : undefined });

const lit = (v: unknown): string => {
  const j = JSON.stringify(v);
  if (j.includes('$sim$')) throw new Error('texte interdit dans les données');
  return `$sim$${j}$sim$::jsonb`;
};
const tables: [string, { id: string }[]][] = [
  ['df_clients', sim.clients], ['df_contracts', sim.contracts], ['df_posts', sim.posts], ['df_invoices', sim.invoices], ['df_cash', sim.cash],
  ['df_entries', sim.entries as any], ['df_leaves', sim.leaves], ['df_shifts', sim.shifts], ['df_advances', sim.advances],
  ['df_groups', sim.groups], ['df_messages', sim.messages], ['df_news', sim.news],
];
// --tables=df_posts,df_invoices : ne recharger QUE ces tables (les autres lignes de la simulation, identiques, ne sont pas touchées)
const only = (process.argv.find(a => a.startsWith('--tables=')) || '').slice(9).split(',').filter(Boolean);
const keep = (t: string) => only.length === 0 || only.includes(t);
const out: string[] = ['begin;'];
for (const [t, rows] of [...tables].reverse()) {
  if (!keep(t)) continue;
  if (t === 'df_shifts') out.push(`delete from public.df_shifts where data->>'employee_id' in (${operators.map(o => `'${o.id}'`).join(',')});`);
  else out.push(`delete from public.${t} where id like 'sim-%';`);
}
// ----- Missions en forme COMPACTE (une ligne courte par mission, reconstruite par le SQL) : 440 missions complètes feraient un fichier trop lourd à exécuter -----
const COMPACT = process.argv.includes('--compact');
const decidedPost = (p: any) => (p.status === 'completed' || p.status === 'rejected') && /^sim-p\d+$/.test(p.id);
const missionOf = (p: any) => ({ i: p.post_number - 1, title: p.client_name, cid: p.client_id, unit: String(p.notes).replace(/^\d+ /, '').replace(/ traités$/, '') });
const reasons: string[] = [...new Set((sim.posts as any[]).filter(p => p.status === 'rejected').map(p => p.rejection_reason as string))].sort();
const hm = (t: string) => [Number(t.slice(0, 2)), Number(t.slice(3, 5))];
const tuple = (p: any) => { const [sh, sm] = hm(p.start_time), [eh, em] = hm(p.end_time); return [Number(p.id.slice(5)), operators.findIndex(o => o.id === p.employee_id), p.post_number - 1, p.target_score, p.status === 'completed' ? 'c' : 'r', p.date, sh, sm, eh, em, p.status === 'rejected' ? reasons.indexOf(p.rejection_reason) : -1]; };
const isoMada = (d: string, h: number, m: number) => new Date(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+03:00`).toISOString();
/** Même reconstruction que le SQL, en TypeScript : sert à vérifier ici que la forme compacte redonne EXACTEMENT chaque mission. */
const rebuild = (t: any[]) => { const [n, op, mi, qty, st, d, sh, sm, eh, em, rj] = t; const m = missionOf((sim.posts as any[]).find(x => x.id === `sim-p${n}`)); const o = operators[op];
  return { id: `sim-p${n}`, employee_id: o.id, employee_name: o.name, client_name: m.title, client_id: m.cid, post_number: mi + 1, account_tag: '', target_score: qty, initial_score: 0, current_score: qty, final_score: qty, remaining_score: 0,
    status: st === 'c' ? 'completed' : 'rejected', shift_type: o.shift, date: d, start_time: `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}:00`, end_time: `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`, start_proof_url: '', end_proof_url: '',
    calculated_ar: st === 'c' ? 5000 : 0, ...(rj >= 0 ? { rejection_reason: reasons[rj] } : {}), notes: `${qty} ${m.unit} traités`, created_at: isoMada(d, sh, sm), updated_at: isoMada(d, (sh + 2) % 24, em) }; };
const sortKeys = (v: any): any => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v);
if (COMPACT) for (const p of (sim.posts as any[]).filter(decidedPost)) if (JSON.stringify(sortKeys(rebuild(tuple(p)))) !== JSON.stringify(sortKeys(p))) throw new Error(`forme compacte différente pour ${p.id}`);
const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
const compactPostsSql = (): string[] => {
  const ps = (sim.posts as any[]).filter(decidedPost);
  const ms = new Map<number, ReturnType<typeof missionOf>>(); for (const p of ps) ms.set(p.post_number - 1, missionOf(p));
  const vals = ps.map(p => `(${tuple(p).map(x => (typeof x === 'string' ? q(x) : x)).join(',')})`);
  const out: string[] = [];
  for (let i = 0; i < vals.length; i += 500) out.push(`insert into public.df_posts (id, data)
select 'sim-p' || t.n, jsonb_build_object('id', 'sim-p' || t.n, 'employee_id', o.eid, 'employee_name', o.en, 'client_name', m.title, 'client_id', m.cid, 'post_number', t.mi + 1, 'account_tag', '',
  'target_score', t.qty, 'initial_score', 0, 'current_score', t.qty, 'final_score', t.qty, 'remaining_score', 0, 'status', case t.s when 'c' then 'completed' else 'rejected' end,
  'shift_type', o.osh, 'date', t.d, 'start_time', lpad(t.sh::text, 2, '0') || ':' || lpad(t.sm::text, 2, '0') || ':00', 'end_time', lpad(t.eh::text, 2, '0') || ':' || lpad(t.em::text, 2, '0') || ':00',
  'start_proof_url', '', 'end_proof_url', '', 'calculated_ar', case t.s when 'c' then 5000 else 0 end, 'notes', t.qty || ' ' || m.unit || ' traités',
  'created_at', to_char(((t.d || ' ' || lpad(t.sh::text, 2, '0') || ':' || lpad(t.sm::text, 2, '0') || ':00+03')::timestamptz) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"'),
  'updated_at', to_char(((t.d || ' ' || lpad(((t.sh + 2) % 24)::text, 2, '0') || ':' || lpad(t.em::text, 2, '0') || ':00+03')::timestamptz) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS".000Z"'))
  || case when t.rj >= 0 then jsonb_build_object('rejection_reason', r.txt) else '{}'::jsonb end
from (values ${vals.slice(i, i + 500).join(',')}) as t(n, op, mi, qty, s, d, sh, sm, eh, em, rj)
join (values ${operators.map((o, k) => `(${k},${q(o.id)},${q(o.name)},${q(o.shift)})`).join(',')}) as o(i, eid, en, osh) on o.i = t.op
join (values ${[...ms.values()].map(m => `(${m.i},${q(m.title)},${q(m.cid)},${q(m.unit)})`).join(',')}) as m(i, title, cid, unit) on m.i = t.mi
left join (values ${reasons.map((x, k) => `(${k},${q(x)})`).join(',')}) as r(i, txt) on r.i = t.rj;`);
  return out;
};
for (const [t, rows] of tables) {
  if (!keep(t)) continue;
  if (t === 'df_shifts') for (const s of rows as any[]) if (!isSimShift(s, operators)) throw new Error('planning hors simulation');
  if (t === 'df_posts' && COMPACT) { out.push(...compactPostsSql()); for (const r of rows.filter(x => !decidedPost(x))) out.push(`insert into public.df_posts (id, data) values ('${String(r.id).replace(/'/g, "''")}', ${lit(r)});`); continue; }
  for (const r of rows) out.push(`insert into public.${t} (id, data) values ('${String(r.id).replace(/'/g, "''")}', ${lit(r)});`);
}
out.push(`update public.df_settings set data = data || ${lit(sim.settings)}, updated_at = now() where id = 'general';`);
// Compteurs de numéros : la prochaine vraie facture / reçu continue après la simulation (jamais en arrière)
const maxByYear = (items: { number?: string; receipt_no?: string }[], key: 'number' | 'receipt_no', re: RegExp): Map<string, number> => {
  const m = new Map<string, number>();
  for (const x of items) { const mm = re.exec(String((x as any)[key] || '')); if (mm) m.set(mm[1], Math.max(m.get(mm[1]) || 0, Number(mm[2]))); }
  return m;
};
for (const [y, n] of maxByYear(sim.invoices as any, 'number', /^FA-(\d{4})-(\d+)$/)) out.push(`insert into public.df_counters (id, value) values ('invoice:${y}', ${n}) on conflict (id) do update set value = greatest(public.df_counters.value, ${n}), updated_at = now();`);
for (const [y, n] of maxByYear(sim.cash as any, 'receipt_no', /^RC-(\d{4})-(\d+)$/)) out.push(`insert into public.df_counters (id, value) values ('receipt:${y}', ${n}) on conflict (id) do update set value = greatest(public.df_counters.value, ${n}), updated_at = now();`);
for (const [y, n] of maxByYear(sim.entries as any, 'number', /^EC-(\d{4})-(\d+)$/)) out.push(`insert into public.df_counters (id, value) values ('entry:${y}', ${n}) on conflict (id) do update set value = greatest(public.df_counters.value, ${n}), updated_at = now();`); // écritures : sinon la 1re vraie écriture reprendrait EC-AAAA-0001, déjà pris par la simulation
out.push('commit;');
console.log(out.join('\n'));
console.error(`Simulation du ${sim.start} au ${today} : ` + tables.map(([t, r]) => `${t.replace('df_', '')} ${r.length}`).join(', '));
