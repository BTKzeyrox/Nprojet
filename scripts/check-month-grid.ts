// M27.10 : grille de présence du mois.
import fs from 'node:fs';
import { monthGrid, daysInMonthOf } from '../src/utils/monthGrid';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('OK   ' + m); } else { fail++; console.log('ECHEC ' + m); } };
const ln = (emp: string, date: string, presence: string, status = 'completed', extra: any = {}) => ({ id: `we-${date}-${emp}-presence`, work_type: 'presence', employee_id: emp, date, presence, status, ...extra });
const people = [{ id: 'e1', name: 'Rina' }, { id: 'e2', name: 'Tojo' }];
const TODAY = '2026-11-12'; // jeudi

// ---- jours du mois ----
ok(daysInMonthOf(2026, 10) === 30 && daysInMonthOf(2026, 0) === 31 && daysInMonthOf(2027, 1) === 28 && daysInMonthOf(2028, 1) === 29, 'nombre de jours : 30, 31, février 28 et 29 (année bissextile)');
{
  const g = monthGrid(2026, 10, people, [], TODAY);
  ok(g.days.length === 30 && g.days[0].date === '2026-11-01' && g.days[29].date === '2026-11-30', 'novembre 2026 : 30 colonnes, du 1er au 30');
  ok(g.days[0].dow === 0 && g.days[0].rest === true, 'le 1er novembre 2026 est un dimanche : jour de repos (réglage par défaut)');
  ok(g.days[11].future === false && g.days[12].future === true, 'les jours après aujourd\'hui sont « à venir » (le jour même ne l\'est pas)');
  ok(monthGrid(2027, 1, people, [], '2027-02-10').days.length === 28, 'février 2027 : 28 colonnes');
}
// ---- lettres, totaux, en attente ----
{
  const posts = [
    ln('e1', '2026-11-02', 'present'), ln('e1', '2026-11-03', 'late'), ln('e1', '2026-11-04', 'half'), ln('e1', '2026-11-05', 'absent'),
    ln('e1', '2026-11-06', 'present', 'pending_end'),
  ];
  const r = monthGrid(2026, 10, people, posts, TODAY).rows.find(x => x.id === 'e1')!;
  ok(r.cells[1].letter === 'P' && r.cells[2].letter === 'R' && r.cells[3].letter === 'H' && r.cells[4].letter === 'A', 'lettres P, R, H (affiché ½), A');
  ok(r.days === 2.5, 'jours payés = 1 + 1 + 0,5 + 0 = 2,5 (la ligne en attente n\'est pas payée)');
  ok(r.cells[5].letter === 'P' && r.cells[5].pending === true && r.pendingCells === 1, 'ligne en attente : visible mais marquée « en attente » et comptée à part');
  ok(r.counts.P === 2 && r.counts.R === 1 && r.counts.H === 1 && r.counts.A === 1, 'compteurs par lettre (en attente comprise)');
}
// ---- jours oubliés ----
{
  const posts = [ln('e1', '2026-11-02', 'present'), ln('e1', '2026-11-03', 'present')];
  const g = monthGrid(2026, 10, people, posts, TODAY); // jours de travail passés : lun 2 au jeu 12 sauf dimanches → 2,3,4,5,6,7,9,10,11,12 = 10 jours
  const r1 = g.rows.find(x => x.id === 'e1')!, r2 = g.rows.find(x => x.id === 'e2')!;
  ok(r2.missing === 10, 'personne sans aucune ligne : 10 jours de travail passés oubliés (dimanches et jours à venir exclus)');
  ok(r1.missing === 8, 'deux jours saisis : 8 oubliés');
  ok(r2.cells[0].missing === false && r2.cells[12].missing === false, 'dimanche (repos) et jour à venir : jamais « oublié »');
  const late = monthGrid(2026, 10, [{ id: 'e2', name: 'Tojo', since: '2026-11-09' }], [], TODAY).rows[0];
  ok(late.missing === 4, 'une personne arrivée le 9 : seulement les jours depuis son arrivée (9, 10, 11, 12)');
  const custom = monthGrid(2026, 10, people, [], TODAY, [1, 2, 3, 4, 5]).rows[1]; // lundi à vendredi seulement
  ok(custom.cells[6].missing === false && custom.missing === 9, 'jours de travail réglables (lundi à vendredi) : le samedi 7 n\'est plus « oublié » → 9 oubliés (2, 3, 4, 5, 6, 9, 10, 11, 12)');
}
// ---- choix de la ligne quand il y en a plusieurs ----
{
  const posts = [ln('e1', '2026-11-02', 'half', 'pending_end'), ln('e1', '2026-11-02', 'present', 'completed', { id: 'x2' }), ln('e1', '2026-11-03', 'half', 'completed', { id: 'y1' }), ln('e1', '2026-11-03', 'present', 'completed', { id: 'y2' })];
  const r = monthGrid(2026, 10, people, posts, TODAY).rows[0];
  ok(r.cells[1].letter === 'P' && r.cells[1].pending === false, 'même jour : la ligne validée l\'emporte sur celle en attente');
  ok(r.cells[2].letter === 'P' && r.days === 2, 'même jour, deux types de travail validés : la plus forte présence (jamais de double paie dans le total)');
}
// ---- lignes ignorées ----
{
  const posts = [
    ln('e1', '2026-10-31', 'present'), ln('e1', '2026-12-01', 'present'),                         // hors du mois
    { id: 'm1', employee_id: 'e1', date: '2026-11-04', presence: 'present', status: 'completed' }, // mission normale (pas de work_type)
    ln('e1', '2026-11-05', 'present', 'rejected'), ln('e1', '2026-11-06', 'present', 'pending_start'),
    ln('e1', '2026-11-09', 'bizarre'), ln('e1', '2026-11-10', undefined as any),
    null, 7, 'x', { work_type: 'presence', employee_id: 5, date: '2026-11-11', presence: 'present', status: 'completed' },
  ];
  const r = monthGrid(2026, 10, people, posts as any, TODAY).rows[0];
  ok(r.cells.every(c => c.letter === '') && r.days === 0, 'ignore : hors du mois, missions normales, lignes refusées ou sans état valable, présence inconnue, valeurs illisibles');
  ok(monthGrid(2026, 10, null as any, null as any, TODAY).rows.length === 0, 'listes absentes : grille vide, jamais de plantage');
  ok(monthGrid(2026, 10, [{ id: 'e9', name: undefined as any }, null as any, { id: 3 as any, name: 'x' }], [], TODAY).rows.length === 1, 'personne sans nom gardée ; personne sans identifiant valable ignorée');
}
// ---- branchements ----
const view = fs.readFileSync('src/views/WorksheetView.tsx', 'utf8');
const comp = fs.readFileSync('src/components/PresenceMonthGrid.tsx', 'utf8');
ok(/<PresenceMonthGrid people=\{people\} today=\{today\} L=\{L\} en=\{en\} \/>/.test(view), 'écran : la grille est sous la Feuille du jour (mêmes personnes que la saisie)');
ok(/data-month-grid-scroll/.test(comp) && /overflow-x-auto/.test(comp) && /sticky left-0/.test(comp), 'écran : défilement horizontal dans son propre conteneur, colonne des noms visible');
ok(/data-month-prev/.test(comp) && /data-month-next/.test(comp) && /min-h-\[44px\]/.test(comp) && /aria-label=\{t\('Mois précédent'/.test(comp), 'écran : mois précédent et suivant, boutons de 44 px, avec étiquette');
ok(/data-month-legend/.test(comp) && /Jours = jours payés/.test(comp), 'écran : légende (lettres, tiret, tirets, jours payés)');
ok(!/text-\[(8|9|10)px\]/.test(comp), 'écran : aucun texte sous 11 px');
console.log(`\n${pass}/${pass + fail} contrôles réussis`);
if (fail) process.exit(1);
