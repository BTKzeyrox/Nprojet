// Guides par tâche « Que veux-tu faire ? » (guide G3). Lancer : npm run check:task-guides
import { readFileSync } from 'node:fs';
import { taskGuides, taskProblems, TASK_MAX_STEPS } from '../src/utils/taskGuides';
import { WORK_SETTINGS_LIVE } from '../src/utils/workTypes';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const probs = taskProblems();
ok(probs.length === 0, 'toutes les tâches sont valides (pages connues, textes FR/EN courts, 3 étapes au plus)' + (probs.length ? ' : ' + JSON.stringify(probs.slice(0, 4)) : ''));
for (const r of ['admin', 'team_lead', 'accountant', 'employee']) ok(taskGuides(r).length >= 1, `${r} : au moins une tâche proposée`);
ok(taskGuides('inconnu').length >= 1 && taskGuides(undefined).length >= 1, 'rôle inconnu : les tâches de l\'opérateur (le moins de droits)');
ok(taskGuides('employee').every(t => !['invoice', 'add-operator', 'worksheet'].includes(t.id)), 'l\'opérateur ne se voit proposer aucune tâche de responsable');
ok(taskGuides('accountant').every(t => t.id === 'invoice') && taskGuides('team_lead').every(t => ['worksheet', 'validate'].includes(t.id)), 'Comptable et chef d\'équipe : seulement leurs tâches');
ok(taskGuides('admin').some(t => t.id === 'worksheet') === WORK_SETTINGS_LIVE, 'la tâche « Feuille du jour » suit l\'interrupteur du module 26');
ok(taskGuides('admin').every(t => t.steps.length <= TASK_MAX_STEPS), '3 étapes au plus');
ok(!JSON.stringify(taskGuides('admin')).includes('"action"'), 'aucune simulation : le doigt ne touche rien');
const pp = readFileSync('src/components/PageHelp.tsx', 'utf8'), tg = readFileSync('src/components/TourGuide.tsx', 'utf8');
ok(/data-page-help-tasks/.test(pp) && /gp-task-open/.test(pp) && /Que veux-tu faire \?/.test(pp), 'l\'aide de la page liste « Que veux-tu faire ? »');
ok(/TASK_EVENT = 'gp-task-open'/.test(tg) && /const steps = task \|\| guideSteps\(role\)/.test(tg), 'la visite joue le petit guide à la place de la visite complète');
ok(/if \(!task\) markTourSeen/.test(tg) && /setTask\(null\); again\(\)/.test(tg), 'un guide de tâche ne compte pas comme « visite vue » ; relancer la visite sort du mode tâche');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
