// Contrôle de la phase 4 (objectifs, alertes, prévision, export, rapport), sans réseau. Lancer : npm run check:phase4
import React from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { goalRows, forecastMonth, monthFigures } = await import('../src/utils/goals');
const { computeAlerts } = await import('../src/utils/alerts');
const { getAdminAlerts } = await import('../src/utils/alertsDb');
const { buildReport, exportSheets, reportHtml } = await import('../src/utils/report');
const { computeFinance } = await import('../src/utils/financeStats');
const { periodRange, todayMada, addDays } = await import('../src/utils/stats');
const { GoalsBars, ForecastCard, AlertsList } = await import('../src/components/GoalsPanel');
const { ReportTab } = await import('../src/views/admin/ReportTab');
const { AppProvider } = await import('../src/context/AppContext');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (h: string) => /NaN|Infinity|undefined|\[object/.test(h);
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

// ---------- Objectifs du mois ----------
const M = (o: Partial<ReturnType<typeof monthFigures>> = {}) => ({ missions: 30, profit: 200000, expenses: 500000, received: 700000, start: '2026-10-01', end: '2026-10-31', day: 10, daysInMonth: 31, ...o });
ok(goalRows({}, M()).length === 0, 'aucun objectif réglé : aucune ligne');
ok(goalRows({ goal_missions: 0, goal_profit_ar: -5, goal_max_expenses_ar: NaN as any }, M()).length === 0, '0, négatif et NaN = pas d\'objectif');
const r1 = goalRows({ goal_missions: 100 }, M({ missions: 30 }))[0];
ok(r1.pct === 30 && r1.kind === 'reach' && r1.state === 'ok', 'missions : 30 sur 100 au jour 10 sur 31 = dans le rythme');
ok(goalRows({ goal_missions: 100 }, M({ missions: 20 }))[0].state === 'warn', 'missions : 20 sur 100 au jour 10 = en retard (à surveiller)');
ok(goalRows({ goal_missions: 100 }, M({ missions: 130 }))[0].state === 'good' && goalRows({ goal_missions: 100 }, M({ missions: 130 }))[0].pct === 130, 'missions : 130 % = atteint, pourcentage non plafonné');
ok(goalRows({ goal_profit_ar: 400000 }, M({ profit: -50000 }))[0].pct === 0, 'bénéfice négatif : avancement 0 %, jamais négatif');
const e1 = (v: number) => goalRows({ goal_max_expenses_ar: 1000000 }, M({ expenses: v }))[0];
ok(e1(500000).state === 'ok' && e1(900000).state === 'warn' && e1(1000000).state === 'warn' && e1(1000001).state === 'over' && e1(1000001).kind === 'limit', 'dépenses : ok sous 90 %, à surveiller dès 90 %, dépassé au-dessus du plafond');
ok(goalRows({ goal_missions: 10, goal_profit_ar: 10, goal_max_expenses_ar: 10 }, M()).length === 3, 'trois objectifs = trois lignes');

// ---------- Prévision ----------
const f = forecastMonth(M({ missions: 30, profit: 200000, expenses: 500000, received: 700000, day: 10, daysInMonth: 30 }))!;
ok(f.missions === 90 && f.profit === 600000 && f.expenses === 1500000 && f.received === 2100000, 'prévision : jour 10 sur 30 = chiffres × 3');
ok(forecastMonth(M({ day: 2 })) === null && forecastMonth(M({ day: 3 })) !== null, 'prévision : pas avant 3 jours');
ok(forecastMonth(M({ day: 31, daysInMonth: 31, missions: 77 }))!.missions === 77, 'prévision : dernier jour = chiffres réels');
ok(forecastMonth(M({ profit: -1000, day: 10, daysInMonth: 30 }))!.profit === -3000, 'prévision : un bénéfice négatif reste négatif');

// ---------- Alertes (cas inventés) ----------
const today = '2026-10-20';
const base = { today, settings: { price_per_mission: 5000, client_price_default_ar: 10000 } as any, cash: [] as any[], posts: [] as any[], contracts: [] as any[], advances: [] as any[], products: [] as any[], moves: [] as any[] };
const cashE = (id: string, kind: 'in' | 'out', amount: number, date: string, client = '', category = kind === 'in' ? 'Paiement client' : 'Achats') => ({ id, kind, category, amount_ar: amount, date, client_name: client, note: '', created_by: 'a', created_at: date, updated_at: date });
const post = (id: string, emp: string, date: string, price = 10000, sal = 5000) => ({ id, employee_id: emp, status: 'completed', date, calculated_ar: sal, client_price_ar: price, post_number: 1, client_name: 'M' }) as any;
ok(computeAlerts(base).length === 0, 'aucune donnée : aucune alerte');
const bud = computeAlerts({ ...base, settings: { ...base.settings, goal_max_expenses_ar: 100000 }, cash: [cashE('a', 'out', 120000, '2026-10-05'), cashE('b', 'in', 500000, '2026-10-06', 'C')] });
ok(bud.some(a => a.id === 'budget' && a.level === 'danger' && a.fr.includes('Budget dépassé')), 'budget dépassé = alerte rouge');
const bud2 = computeAlerts({ ...base, settings: { ...base.settings, goal_max_expenses_ar: 100000 }, cash: [cashE('a', 'out', 92000, '2026-10-05'), cashE('b', 'in', 500000, '2026-10-06', 'C')] });
ok(bud2.some(a => a.id === 'budget' && a.level === 'warn'), 'budget à 92 % = alerte orange');
ok(!computeAlerts({ ...base, settings: { ...base.settings, goal_max_expenses_ar: 100000 }, cash: [cashE('a', 'out', 50000, '2026-10-05'), cashE('b', 'in', 500000, '2026-10-06', 'C')] }).some(a => a.id === 'budget'), 'budget à 50 % : pas d\'alerte');
const neg = computeAlerts({ ...base, cash: [cashE('a', 'out', 30000, '2026-09-05')] });
ok(neg.some(a => a.id === 'cash-low' && a.level === 'danger' && a.en.includes('Negative cash')), 'trésorerie négative = alerte rouge (FR et EN)');
ok(computeAlerts({ ...base, settings: { ...base.settings, alert_low_cash_ar: 100000 }, cash: [cashE('a', 'in', 60000, '2026-10-05', 'C')] }).some(a => a.id === 'cash-low' && a.level === 'warn'), 'trésorerie sous le seuil réglé = alerte orange');
ok(!computeAlerts({ ...base, cash: [cashE('a', 'in', 60000, '2026-10-05', 'C')] }).some(a => a.id === 'cash-low'), 'trésorerie positive, seuil 0 : pas d\'alerte');
const prod = (id: string, thr: number) => ({ id, name: id, category: '', unit: 'u', buy_price_ar: 100, sell_price_ar: 0, alert_threshold: thr, created_by: 'a', created_at: '', updated_at: '' }) as any;
const mv = (pid: string, type: 'in' | 'out', qty: number) => ({ id: pid + type + qty, product_id: pid, type, qty, date: '2026-10-01', note: '', created_by: 'a', created_at: '', updated_at: '' }) as any;
const stk = computeAlerts({ ...base, products: [prod('Papier', 5), prod('Encre', 5)], moves: [mv('Papier', 'in', 4), mv('Encre', 'in', 20)] });
ok(stk.some(a => a.id === 'stock-low' && a.fr.includes('1 produit') && a.fr.includes('Papier') && !a.fr.includes('Encre')), 'stock bas : seulement le produit sous le seuil');
ok(computeAlerts({ ...base, products: [prod('Papier', 5)], moves: [mv('Papier', 'in', 4), mv('Papier', 'out', 4)] }).find(a => a.id === 'stock-low')?.level === 'danger', 'stock vide = alerte rouge');
const adv = computeAlerts({ ...base, posts: [post('p1', 'u1', '2026-10-03')], advances: [{ id: 'a1', employee_id: 'u1', employee_name: 'Ana', amount_ar: 9000, status: 'pending', reason: '', request_date: today }, { id: 'a2', employee_id: 'u1', employee_name: 'Ana', amount_ar: 2000, status: 'pending', reason: '', request_date: today }, { id: 'a3', employee_id: 'u2', employee_name: 'Bob', amount_ar: 1, status: 'approved', reason: '', request_date: today }] as any });
ok(adv.some(a => a.id === 'advance-big' && a.fr.includes('1 demande') && a.fr.includes('Ana')), 'avance trop grosse : seule celle au-dessus du gagné du mois (9 000 > 5 000)');
// Client qui n'a pas payé : seulement s'il reste de l'argent à encaisser
const posts3 = [post('p1', 'u1', '2026-09-01'), post('p2', 'u1', '2026-09-02'), post('p3', 'u1', '2026-10-02')];
const unp = computeAlerts({ ...base, posts: posts3, cash: [cashE('a', 'in', 10000, '2026-08-01', 'Alpha'), cashE('b', 'in', 10000, '2026-10-10', 'Beta')] });
const ua = unp.find(a => a.id === 'unpaid');
ok(!!ua && ua.fr.includes('Alpha (80 j)') && !ua.fr.includes('Beta') && ua.fr.includes('plus de 30 jours'), 'client sans paiement depuis 80 jours : Alpha oui, Beta (10 jours) non');
ok(!computeAlerts({ ...base, settings: { ...base.settings, alert_unpaid_days: 90 }, posts: posts3, cash: [cashE('a', 'in', 10000, '2026-08-01', 'Alpha')] }).some(a => a.id === 'unpaid'), 'seuil réglé à 90 jours : plus d\'alerte à 80 jours');
ok(!computeAlerts({ ...base, posts: [post('p1', 'u1', '2026-09-01')], cash: [cashE('a', 'in', 10000, '2026-08-01', 'Alpha'), cashE('b', 'in', 5000, '2026-10-01', 'Beta')] }).some(a => a.id === 'unpaid'), 'tout est encaissé : pas d\'alerte « client qui n\'a pas payé »');
// Bénéfice en baisse (mois en cours contre le mois d'avant, même nombre de jours)
const drop = computeAlerts({ ...base, cash: [cashE('a', 'in', 300000, '2026-09-05', 'C'), cashE('b', 'in', 100000, '2026-10-05', 'C')] });
ok(drop.some(a => a.id === 'profit-drop' && a.fr.includes('67 %')), 'bénéfice en baisse de 67 % par rapport au mois dernier');
ok(!computeAlerts({ ...base, cash: [cashE('a', 'in', 300000, '2026-09-05', 'C'), cashE('b', 'in', 290000, '2026-10-05', 'C')] }).some(a => a.id === 'profit-drop'), 'baisse de 3 % : pas d\'alerte (seuil 20 %)');
const sorted = computeAlerts({ ...base, settings: { ...base.settings, goal_max_expenses_ar: 100000 }, cash: [cashE('a', 'out', 92000, '2026-10-05'), cashE('z', 'out', 500000, '2026-09-01')], products: [prod('Papier', 5)], moves: [mv('Papier', 'in', 1)] });
ok(sorted.length >= 2 && sorted.findIndex(a => a.level === 'warn') > sorted.map(a => a.level).lastIndexOf('danger'), 'alertes rouges avant les orange');

// ---------- Démo : objectifs, alertes, rapport ----------
db.enterDemo('admin');
const s = db.getSettings();
ok(s.goal_missions! > 0 && s.goal_profit_ar! > 0 && s.goal_max_expenses_ar! > 0, 'démo : trois objectifs inventés');
const today2 = todayMada();
const fin = { cash: db.getCash(), posts: db.getPosts(), contracts: db.getContracts(), prices: s, pricePerMission: s.price_per_mission || 0 };
const mf = monthFigures(fin, today2), cf = computeFinance(fin, 'month', periodRange('month', today2));
ok(mf.missions === cf.done && mf.profit === cf.profit && mf.expenses === cf.totalOut && mf.received === cf.received, 'objectifs : chiffres du mois = chiffres de l\'onglet Finances');
const demoAlerts = getAdminAlerts();
ok(demoAlerts.every(a => a.fr && a.en && a.go && !bad(a.fr + a.en)), `démo : ${demoAlerts.length} alerte(s), textes FR et EN complets, sans NaN`);

const rin = (anchor: string, lang: 'fr' | 'en') => ({ today: today2, anchor, lang, settings: s, posts: db.getPosts(), contracts: db.getContracts(), users: db.getUsers(), advances: db.getAdvanceRequests(), cash: db.getCash(), products: db.getProducts(), moves: db.getStockMoves() });
const anchors = [today2, addDays(periodRange('month', today2).start, -1), addDays(periodRange('month', today2).start, -200), addDays(periodRange('month', today2).end, 5)];
for (const lang of ['fr', 'en'] as const) for (const a of anchors) {
  const rep = buildReport(rin(a, lang));
  const html = reportHtml(rep);
  ok(rep.strengths.length >= 1 && rep.strengths.length <= 3 && rep.attention.length >= 1 && rep.attention.length <= 3, `rapport ${lang} ${a.slice(0, 7)} : 1 à 3 points forts et 1 à 3 points d'attention`);
  ok(!bad(html) && html.startsWith('<!doctype html>') && !html.includes('<script'), `rapport ${lang} ${a.slice(0, 7)} : page propre (sans NaN, sans script)`);
}
const rep = buildReport(rin(today2, 'fr'));
ok(rep.goals.length === 3 && rep.forecast !== null === (mf.day >= 3), 'rapport du mois en cours : 3 objectifs, prévision selon le jour du mois');
ok(buildReport(rin(anchors[1], 'fr')).goals.length === 0 && buildReport(rin(anchors[1], 'fr')).forecast === null, 'rapport d\'un mois passé : ni objectifs ni prévision');
const sheets = exportSheets(rep);
ok(sheets.length === 8 && new Set(sheets.map(x => x.name)).size === 8 && sheets.every(x => x.name.length <= 31 && !/[\\/?*[\]:]/.test(x.name)), 'Excel : 8 onglets, noms uniques et valides');
ok(sheets.every(x => x.rows.every(r => r.every(c => typeof c === 'string' || typeof c === 'number' && Number.isFinite(c)))), 'Excel : toutes les cellules sont du texte ou un nombre fini');
ok(sheets[0].rows.some(r => r[0] === 'Bénéfice net (Ar)' && r[1] === rep.fin.profit), 'Excel : le bénéfice du résumé = celui de la page Finances');
ok(sheets.find(x => x.name === 'Finances')!.rows.filter(r => r[0] && /^\d{4}-/.test(String(r[0]))).length === rep.cashLines.length, 'Excel : une ligne par mouvement d\'argent du mois');
// Texte malveillant : tout est échappé dans la page imprimable
const evil = buildReport({ ...rin(today2, 'fr'), products: [{ id: 'x', name: '<img src=x onerror=alert(1)>', category: '', unit: 'u', buy_price_ar: 1, sell_price_ar: 0, alert_threshold: 9, created_by: 'a', created_at: '', updated_at: '' }], moves: [], cash: [...db.getCash(), cashE('ev', 'in', 99999999, today2, '<b>Evil</b>')] });
const evilHtml = reportHtml(evil);
ok(!evilHtml.includes('<img') && evilHtml.includes('&lt;img src=x onerror=alert(1)&gt;'), 'page imprimable : un nom de produit piégé est échappé (alerte stock bas)');
const evil2 = reportHtml(buildReport({ ...rin(today2, 'fr'), cash: [cashE('ev', 'in', 99999999, today2, '<b>Evil</b>')], posts: [], advances: [{ id: 'z', employee_id: 'q', employee_name: '<u>Zed</u>', amount_ar: 5, status: 'pending', reason: '', request_date: today2 }] as any }));
ok(!evil2.includes('<b>Evil') && !evil2.includes('<u>Zed') && (evil2.includes('&lt;b&gt;Evil') || evil2.includes('&lt;u&gt;Zed')), 'page imprimable : un nom de client ou d\'employé piégé est échappé');

// ---------- Rendu des blocs (admin et opérateur) ----------
const html = (el: React.ReactElement) => renderToString(<AppProvider>{el}</AppProvider>);
const count3 = (h: string) => (h.match(/role="progressbar"/g) || []).length;
for (const lang of ['fr', 'en'] as const) {
  const a = html(<AlertsList lang={lang} />), b = html(<GoalsBars lang={lang} />), c = html(<ForecastCard lang={lang} />), d = html(<ReportTab anchor={today2} lang={lang} />);
  ok(![a, b, c, d].some(bad), `${lang} : blocs rendus sans NaN ni « undefined »`);
  ok(count3(b) === 3 && b.includes(lang === 'en' ? 'White mark: where you should be today' : 'Trait blanc : où vous devriez en être aujourd'), `${lang} : objectifs = 3 jauges avec la consigne du trait blanc`);
  ok(b.includes(lang === 'en' ? 'Monthly goals' : 'Objectifs du mois') && d.includes('<iframe') && d.includes('sandbox="allow-same-origin allow-modals"'), `${lang} : objectifs et rapport (page isolée dans un cadre sans script)`);
}
ok(html(<ReportTab anchor={today2} lang="fr" />).includes('Excel') && html(<ReportTab anchor={today2} lang="fr" />).includes('Imprimer'), 'rapport : boutons Excel et Imprimer / PDF');
db.enterDemo('employee');
ok(getAdminAlerts().length === 0, 'opérateur : aucune alerte calculée');
ok(['AlertsList', 'GoalsBars', 'ForecastCard', 'ReportTab'].every((k, i) => html([<AlertsList lang="fr" />, <GoalsBars lang="fr" />, <ForecastCard lang="fr" />, <ReportTab anchor={today2} lang="fr" />][i]) === ''), 'opérateur : alertes, objectifs, prévision et rapport ne montrent rien');

// ---------- Serveur : prix client et objectifs cachés aux employés ----------
const src = read('supabase/functions/df-api/index.ts');
const m = /\/\/ ===== BEGIN PRIVACY[^\n]*\n([\s\S]*?)\/\/ ===== END PRIVACY =====/.exec(src);
ok(!!m, 'bloc « PRIVACY » trouvé dans le serveur');
const js = transformSync(m![1], { loader: 'ts' }).code;
const srv = new Function(`${js}\nreturn { SETTINGS_ADMIN_KEYS, stripSettings, withoutClientPrice };`)() as { SETTINGS_ADMIN_KEYS: string[]; stripSettings: (r: any, me: any) => any; withoutClientPrice: (r: any, me: any) => any };
const full = { id: 'general', price_per_mission: 5000, client_price_default_ar: 8000, client_prices_by_type: { WEB: 1 }, goal_missions: 1, goal_profit_ar: 2, goal_max_expenses_ar: 3, alert_unpaid_days: 30, alert_low_cash_ar: 4, post_types: ['WEB'], maintenance_on: false };
const emp = { id: 'u1', role: 'employee' }, adm = { id: 'a', role: 'admin' };
const cut = srv.stripSettings(full, emp);
ok(['client_price_default_ar', 'client_prices_by_type', 'goal_missions', 'goal_profit_ar', 'goal_max_expenses_ar', 'alert_unpaid_days', 'alert_low_cash_ar'].every(k => !(k in cut)), 'serveur : un employé ne reçoit ni prix client ni objectifs ni seuils');
ok(cut.price_per_mission === 5000 && cut.post_types[0] === 'WEB' && cut.id === 'general' && !('client_price_default_ar' in cut) && 'client_price_default_ar' in full, 'serveur : le reste des réglages est gardé et l\'original n\'est pas modifié');
ok(srv.stripSettings(full, adm) === full, 'serveur : l\'admin reçoit tout');
ok(!('client_price_ar' in srv.withoutClientPrice({ id: 'c', client_price_ar: 9000, estimated_reward_ar: 5000 }, emp)) && srv.withoutClientPrice({ id: 'c', client_price_ar: 9000, estimated_reward_ar: 5000 }, emp).estimated_reward_ar === 5000, 'serveur : prix client retiré d\'une mission, la rémunération de l\'employé reste');
ok(srv.withoutClientPrice({ client_price_ar: 1 }, adm).client_price_ar === 1, 'serveur : l\'admin garde le prix client des missions');
const settingsBlock = /export interface AppSettings \{[\s\S]*?\n\}/.exec(read('src/types/index.ts'))?.[0] || '';
const keysInTypes = [...settingsBlock.matchAll(/^\s+((?:goal_|alert_unpaid|alert_low_cash|client_price)[a-z_]*)\??:/gm)].map(x => x[1]);
ok(keysInTypes.length >= 7 && keysInTypes.every(k => srv.SETTINGS_ADMIN_KEYS.includes(k)), `serveur : les ${keysInTypes.length} réglages d'argent du site sont tous dans la liste cachée aux employés`);
const stateFn = /async function state\([\s\S]*?\n}\n/.exec(src)?.[0] || '', syncFn = /async function sync\([\s\S]*?\n}\n/.exec(src)?.[0] || '';
ok(stateFn.includes("col === 'settings'") && stateFn.includes('stripSettings(') && stateFn.includes("col === 'contracts'") && stateFn.includes('withoutClientPrice(c, me)'), 'state : réglages et missions passent par le filtre');
ok(/const stripPost[\s\S]*?withoutClientPrice\(p, me\)[\s\S]*?withoutClientPrice\(p, me\)/.test(src), 'state : le prix client est retiré aussi de ses propres sessions');
ok(syncFn.includes('client_price_ar: existing?.client_price_ar'), 'sync : un employé ne peut pas écrire un prix client (celui du serveur est gardé)');

// ---------- Côté site ----------
ok(read('src/components/Sidebar.tsx').includes('isAdmin ? getAdminAlerts().length : 0') && read('src/components/Sidebar.tsx').includes("id: 'stats'") , 'menu : la pastille d\'alertes ne se calcule que pour l\'admin');
ok(read('src/views/admin/SettingsView.tsx').includes('goal_missions') && read('src/views/admin/SettingsView.tsx').includes('alert_unpaid_days'), 'Réglages : champs objectifs et alertes présents');
ok(calls === 0, `aucun appel réseau (${calls})`);

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
