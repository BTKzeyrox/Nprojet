// Contrôle du rapport par SEMAINE (M15.5) : le mois reste comme avant. Lancer : npm run check:report-week
import { buildReport, exportSheets, reportHtml } from '../src/utils/report';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } };
const ok = (c: boolean, name: string) => eq(c, true, name);

const post = (id: string, date: string) => ({ id, date, status: 'completed', user_id: 'u1', client_id: 'c1', start_time: '08:00', end_time: '12:00' }) as any;
const base = {
  lang: 'fr' as const, settings: { id: 'general', price_per_mission: 10000 } as any, companyName: 'Test', posts: [post('a', '2026-10-20'), post('b', '2026-10-22'), post('c', '2026-10-05')], contracts: [], users: [{ id: 'u1', name: 'Ali', role: 'employee' }] as any,
  advances: [], cash: [], products: [], moves: [], clients: [], invoices: [],
};

// Semaine finie du lundi 19 au dimanche 25 octobre 2026, vue le mardi 27
const w = buildReport({ ...base, today: '2026-10-27', anchor: '2026-10-19', granularity: 'week' });
eq(w.granularity, 'week', 'semaine : type');
eq(w.title, 'Rapport hebdomadaire', 'semaine : titre FR');
eq(buildReport({ ...base, lang: 'en', today: '2026-10-27', anchor: '2026-10-19', granularity: 'week' }).title, 'Weekly report', 'semaine : titre EN');
ok(/19/.test(w.month) && /25/.test(w.month) && /oct/i.test(w.month), 'semaine : titre de période (19 au 25 oct.)');
eq(w.inProgress, false, 'semaine finie : pas « en cours »');
eq(w.range, { start: '2026-10-19', end: '2026-10-25' }, 'semaine : du lundi au dimanche');
eq(w.stats.cur.done, 2, 'semaine : 2 missions du 20 et du 22 (celle du 5 est hors semaine)');
eq(w.goals, [], 'semaine : pas d\'objectifs du mois');
eq(w.forecast, null, 'semaine : pas de prévision de fin de mois');
eq(w.alerts, [], 'semaine : pas d\'alertes du moment');

// Le mois, sans « granularity » : exactement comme avant
const m = buildReport({ ...base, today: '2026-10-27', anchor: '2026-10-01' });
eq(m.granularity, 'month', 'mois : type par défaut');
eq(m.title, 'Rapport mensuel', 'mois : titre');
eq(m.stats.cur.done, 3, 'mois : 3 missions en octobre');
eq(m.inProgress, true, 'mois d\'octobre vu le 27 : en cours');
eq(JSON.stringify(buildReport({ ...base, today: '2026-10-27', anchor: '2026-10-01', granularity: 'month' })), JSON.stringify(m), 'mois : « month » donne le même rapport que sans réglage');

// Semaine en cours
const cur = buildReport({ ...base, today: '2026-10-22', anchor: '2026-10-19', granularity: 'week' });
eq(cur.inProgress, true, 'semaine en cours : signalée');

// Textes : plus de mot « mois » dans le rapport d'une semaine
const html = reportHtml(w);
ok(html.includes('Cette semaine') && html.includes('Semaine d&#39;avant') || html.includes('Semaine d\'avant'), 'semaine : colonnes « Cette semaine » et « Semaine d\'avant »');
ok(!html.includes('Ce mois<') && !html.includes('Mois d\'avant'), 'semaine : plus de « Ce mois » ni « Mois d\'avant »');
ok(reportHtml(cur).includes('semaine en cours'), 'semaine en cours : « semaine en cours » écrit');
ok(!/Objectifs du mois|Prévision de fin de mois/.test(html), 'semaine : ni objectifs du mois ni prévision');
ok(reportHtml(m).includes('Ce mois') && reportHtml(m).includes('mois en cours'), 'mois : textes d\'avant gardés');
ok(!/ce mois-ci/.test(w.strengths.concat(w.attention).join(' ')), 'semaine : pas de « ce mois-ci » dans les points forts et d\'attention');
const sheets = exportSheets(w);
ok(JSON.stringify(sheets).includes('Cette semaine') && !JSON.stringify(sheets).includes('Ce mois'), 'Excel semaine : en-têtes « Cette semaine »');
ok(JSON.stringify(exportSheets(m)).includes('Ce mois'), 'Excel mois : en-têtes d\'avant gardés');

// Semaine à venir : rien à analyser, sans « mois »
const fut = buildReport({ ...base, today: '2026-10-27', anchor: '2026-11-02', granularity: 'week' });
ok(fut.strengths.join(' ').includes('Semaine à venir'), 'semaine à venir : « Semaine à venir »');

console.log(fails ? `\n${fails} échec(s) sur ${n} contrôles.` : `OK : ${n}/${n} contrôles.`);
process.exit(fails ? 1 : 0);
