// Graphiques de la Trésorerie : calculs purs, jamais de salaires ; et calendrier d'un employé au style du global.
import { readFileSync } from 'node:fs';
import { treasuryCharts } from '../src/utils/treasuryCharts';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const e = (id: string, kind: 'in' | 'out', amount_ar: number, date: string, category: string) => ({ id, kind, amount_ar, date, category, created_at: '', updated_at: '' } as any);
const cash = [e('1', 'in', 100000, '2026-10-02', 'Paiement client'), e('2', 'out', 30000, '2026-10-02', 'Loyer'), e('3', 'out', 20000, '2026-10-05', 'Transport'), e('4', 'in', 50000, '2026-10-05', 'Paiement client'), e('5', 'in', 999, '2026-09-30', 'Hors mois'), e('6', 'out', 10000, '2026-10-20', 'Futur')];
const c = treasuryCharts(cash, { start: '2026-10-01', end: '2026-10-31' }, '2026-10-10');
ok(c.labels.length === 31 && c.inflow.length === 31 && c.balance.length === 31, 'un point par jour du mois (31)');
ok(c.inflow[1] === 100000 && c.outflow[1] === 30000, 'le 2 : reçu 100 000, dépenses 30 000');
ok(c.balance[1] === 70000 && c.balance[4] === 100000, 'solde cumulé : 70 000 le 2, 100 000 le 5');
ok(c.inflow[10] === null && c.outflow[19] === null && c.balance[30] === null, 'jours à venir : pas de point');
ok(c.received === 150000 && c.spent === 60000, 'totaux du mois (la ligne hors mois est ignorée)');
ok(c.outByCategory[0].label === 'Loyer' && c.outByCategory.length === 3 && c.inByCategory[0].value === 150000, 'catégories triées par montant');
const comp = readFileSync('src/views/admin/TreasuryCharts.tsx', 'utf8') + readFileSync('src/utils/treasuryCharts.ts', 'utf8');
ok(!/salar|payroll|getPosts|getUsers|advance/i.test(comp), 'graphiques : aucun salaire, aucune paie, aucune mission lue');
ok(/<TreasuryCharts /.test(readFileSync('src/views/admin/TreasuryPage.tsx', 'utf8')), 'page Trésorerie : graphiques branchés');
const cal = readFileSync('src/views/CalendarView.tsx', 'utf8');
ok(/empMonth\(year, month, activeId/.test(cal), 'calendrier d\'un employé : mêmes données que le global');
ok(/const CELL_STATUSES: DayStatus\[\] = \['objective_reached', 'late', 'in_progress', 'test', 'absent', 'leave'\]/.test(cal), 'cases : seulement les 6 icônes de la légende');
ok((cal.match(/data-cal-chips/g) || []).length === 2 && /<StatusChip key=\{k\}/.test(cal), 'calendrier global et calendrier d\'un employé utilisent les mêmes pastilles (icône colorée + chiffre)');
ok(!/ListChecks className="w-3 h-3"|ar\(g\.pay\)|à rendre'\}\n/.test(cal) && !/data-ecal-chips/.test(cal) && !/mission\{d\.shifts\.length > 1/.test(cal), 'cases : plus de texte, de montant ni de pastille hors légende');
ok(/data-testid="day-due"/.test(cal), 'les missions à rendre sont dans la fenêtre du jour');
ok(/setPopDay\(d\.dateStr\)/.test(cal) && /<DayPanel day=\{popDay\}/.test(cal) && /data-testid="ecal-popup"/.test(cal), 'un clic sur un jour ouvre la fenêtre avec flèches jour précédent / suivant');
ok(/onSelectDay\(d, sh\)/.test(cal), 'le détail des missions du jour reste accessible');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
