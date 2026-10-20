// Contrôle final de la phase 2 (finances), sans réseau. Lancer : npm run check:phase2
// Vérifie : bénéfice = encaissé − dépenses sur 10 périodes, démo financière cohérente (S2.7), remise à zéro et sauvegarde (S2.8), opérateur sans accès.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { computeFinance } = await import('../src/utils/financeStats');
const { periodRange, todayMada } = await import('../src/utils/stats');
const { checkDraft } = await import('../src/utils/finance');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8'); // lancé depuis la racine du projet (npm run)

// ---------- Démo admin : des finances inventées et cohérentes (S2.7) ----------
db.enterDemo('admin');
const cash = db.getCash(), posts = db.getPosts(), contracts = db.getContracts(), s = db.getSettings();
const today = todayMada();
const tomorrow = new Date(Date.now() + 86400000 + 3 * 3600000).toISOString().slice(0, 10);
ok(cash.length >= 100, `démo : ${cash.length} lignes d'argent inventées`);
ok(cash.some(c => c.kind === 'in') && cash.some(c => c.kind === 'out'), 'démo : des entrées ET des sorties');
ok(new Set(cash.map(c => c.id)).size === cash.length, 'démo : identifiants tous différents');
ok(cash.every(c => checkDraft({ kind: c.kind, category: c.category, amount: c.amount_ar, date: c.date, note: c.note, client_name: c.client_name }).ok), 'démo : chaque ligne passe les règles du serveur (montant, date, catégorie)');
ok(cash.every(c => c.date <= tomorrow), 'démo : aucune date dans le futur');
const months = new Set(cash.map(c => c.date.slice(0, 7)));
ok(months.size >= 20, `démo : ${months.size} mois couverts (vue Année pleine)`);
ok(new Set(cash.filter(c => c.kind === 'in').map(c => c.client_name)).size >= 3, 'démo : au moins 3 clients différents (« meilleur client »)');
ok(new Set(cash.filter(c => c.kind === 'out').map(c => c.category)).size >= 4, 'démo : au moins 4 catégories de dépenses (anneau)');

// ---------- Bénéfice = encaissé − dépenses, sur 10 périodes (S2.9) ----------
const input = { cash, posts, contracts, prices: s, pricePerMission: s.price_per_mission || 0 };
const addM = (iso: string, k: number) => { const d = new Date(`${iso.slice(0, 7)}-15T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - k); return d.toISOString().slice(0, 10); };
const periods: { g: 'month' | 'year' | 'week'; anchor: string }[] = [
  ...[1, 2, 3, 4, 5, 6, 7].map(k => ({ g: 'month' as const, anchor: addM(today, k) })),
  { g: 'month', anchor: today }, { g: 'year', anchor: today }, { g: 'week', anchor: addM(today, 2) },
];
let anyProfit = false;
for (const p of periods) {
  const r = periodRange(p.g, p.anchor);
  const f = computeFinance(input, p.g, r);
  const inSum = f.series.inflow.reduce((a, b) => a + b, 0), outSum = f.series.outflow.reduce((a, b) => a + b, 0);
  const label = `${p.g} ${r.start}`;
  ok(f.profit === f.received - (f.spent + f.salaries) && f.totalOut === f.spent + f.salaries, `${label} : bénéfice ${f.profit} = reçu ${f.received} − dépenses ${f.spent + f.salaries}`);
  ok(inSum === f.received && outSum === f.totalOut && f.series.cumulative[f.series.cumulative.length - 1] === f.profit, `${label} : barres et courbe cumulée = les mêmes totaux`);
  ok(f.toCollect >= 0 && f.toCollect === Math.max(0, f.billed - f.received) && (f.received > 0 ? f.marginPct === Math.round((f.profit / f.received) * 100) : f.marginPct === null), `${label} : à encaisser jamais négatif, marge cohérente`);
  ok(f.expensesByCategory.reduce((a, b) => a + b.value, 0) === f.totalOut, `${label} : anneau des dépenses = total des dépenses`);
  if (f.profit !== 0) anyProfit = true;
}
ok(anyProfit, 'les périodes de la démo ont de vrais chiffres (pas tout à zéro)');

// Les mois passés : les clients ont payé environ 92 % du facturé ; ce mois-ci il reste de l'argent à encaisser
const first = posts.filter(p => p.status === 'completed').map(p => p.date).sort()[0];
const past = [2, 3, 4, 5, 6].map(k => computeFinance(input, 'month', periodRange('month', addM(today, k))));
ok(past.every(f => f.billed > 0 && Math.abs(f.received - f.billed * 0.92) <= 2000), 'mois passés : reçu ≈ 92 % du facturé');
const now = computeFinance(input, 'month', periodRange('month', today));
ok(now.billed > now.received, `ce mois-ci : il reste de l'argent à encaisser (${now.billed - now.received} Ar)`);
const all = computeFinance(input, 'year', { start: first, end: today, days: 800 });
ok(all.treasury === cash.reduce((t, e) => t + (e.kind === 'in' ? e.amount_ar : -e.amount_ar), 0) - posts.filter(p => p.status === 'completed').reduce((t, p) => t + (p.calculated_ar || 0), 0), 'trésorerie = tout reçu − toutes les dépenses − tous les salaires');

// ---------- Ajout / modification / suppression en démo (S2.7) ----------
const before = db.getCash().length;
const a = db.addCash({ kind: 'in', category: 'Paiement client', amount: '12 500', date: today, client_name: 'Client Essai' });
ok(a.success && db.getCash().length === before + 1, 'démo : ajout marche en local');
ok(db.updateCash(a.id as string, { kind: 'in', category: 'Paiement client', amount: 13000, date: today, client_name: 'Client Essai' }).success && db.getCash().find(x => x.id === a.id)?.amount_ar === 13000, 'démo : modification marche en local');
ok(db.deleteCash(a.id as string).success && db.getCash().length === before, 'démo : suppression marche en local');

// ---------- Sauvegardes de démo (S2.8) ----------
const backups = await db.listBackups();
ok(backups.ok && backups.rows.length > 0 && backups.rows.every(b => b.tables === 20), 'démo : la page Sauvegardes annonce 20 tables (df_cash, df_products, df_stock_moves et df_clients comprises)');

// ---------- Opérateur : rien ----------
db.enterDemo('employee');
ok(db.getCash().length === 0, 'démo opérateur : aucune ligne d\'argent visible');

// ---------- Remise à zéro et sauvegarde (S2.8) : lecture du code ----------
const restore = read('supabase/functions/df-restore/index.ts');
ok(!/df_cash/.test(restore), 'df-restore : ne touche pas à df_cash (la remise à zéro garde les finances)');
ok(/wipe\("df_posts"\)/.test(restore), 'df-restore : efface toujours les missions faites (donc les salaires calculés repartent à 0)');
const screen = read('src/components/RestoreSection.tsx');
ok(screen.includes('Vos finances (paiements reçus et dépenses) et votre stock sont gardés'), 'écran de remise à zéro : dit que les finances sont gardées');
ok(read('src/utils/enDict.json').includes('Your finances (payments received and expenses) and your stock are kept'), 'écran de remise à zéro : phrase anglaise présente');
ok(/'Finances'\)/.test(read('src/utils/backupExcel.ts')), 'sauvegarde Excel : feuille « Finances »');
const mig = read('supabase/migrations/20261019_create_df_cash.sql');
ok(/enable row level security/.test(mig) && /revoke all on public\.df_cash from anon, authenticated/.test(mig), 'migration df_cash : sécurité RLS et aucun accès public');
ok(existsSync(join(process.cwd(), 'scripts/check-cash.ts')), 'contrôle du serveur (check:cash) présent');

ok(calls === 0, `aucun appel réseau (${calls})`);
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
