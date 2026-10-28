// M18.5 : fabrique le SQL qui charge (ou recharge) la simulation dans la vraie base. N'écrit RIEN lui-même : il affiche le SQL, c'est une personne qui l'exécute (après sauvegarde et accord de BTK).
// Usage : npx tsx scripts/sim-load-sql.ts [AAAA-MM-JJ]  > sim-load.sql
// Recharger = relancer avec la nouvelle date : le SQL commence par supprimer UNIQUEMENT les lignes marquées « sim- » (et le planning des 4 opérateurs de la simulation), jamais les vraies données.
import { buildSimulation, isSimShift, type SimOperator } from '../src/sim/simulation';

const today = process.argv[2] || new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); // jour de Madagascar
// Les 4 vrais comptes opérateurs créés par BTK (M18.5) : la simulation travaille avec eux, pour qu'ils voient leurs propres missions.
const operators: SimOperator[] = [
  { id: 'user-emp-operator1', name: 'Opérateur 1', username: 'operator1', shift: 'day' },
  { id: 'user-emp-operator2', name: 'Opérateur 2', username: 'operator2', shift: 'day' },
  { id: 'user-emp-operator3', name: 'Opérateur 3', username: 'operator3', shift: 'night' },
  { id: 'user-emp-operator4', name: 'Opérateur 4', username: 'operator4', shift: 'night' },
];
const sim = buildSimulation({ today, adminId: 'user-admin-1', adminName: 'Admin', operators });

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
const out: string[] = ['begin;'];
for (const [t, rows] of [...tables].reverse()) {
  if (t === 'df_shifts') out.push(`delete from public.df_shifts where data->>'employee_id' in (${operators.map(o => `'${o.id}'`).join(',')});`);
  else out.push(`delete from public.${t} where id like 'sim-%';`);
}
for (const [t, rows] of tables) {
  if (t === 'df_shifts') for (const s of rows as any[]) if (!isSimShift(s, operators)) throw new Error('planning hors simulation');
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
out.push('commit;');
console.log(out.join('\n'));
console.error(`Simulation du ${sim.start} au ${today} : ` + tables.map(([t, r]) => `${t.replace('df_', '')} ${r.length}`).join(', '));
