// Contrôle des objectifs par salarié et par équipe (M15.3). Lancer : npm run check:team-goals
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { checkTeamGoal, cleanTeamGoals, reviewGoalLines, teamGoalActual, teamGoalAppliesTo, teamGoalProgress, teamGoalStatus, newTeamGoalId, TEAM_GOAL_LIMITS, TEAM_GOAL_METRIC_LABEL, TEAM_GOAL_STATUS_LABEL } from '../src/utils/teamGoals';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } };
const ok = (c: boolean, name: string) => eq(c, true, name);

const base = { id: 'tg-a', name: 'Missions du mois', scope: 'team', metric: 'done', target: 40, month: '' };
const must = (d: any) => { const v = checkTeamGoal(d, []); if (!v.ok) throw new Error('objectif de test faux : ' + v.error); return v.value; };
const bad = (d: any, error: string, name: string, others: any[] = []) => eq(checkTeamGoal(d, others), { ok: false, error }, name);

// ---- Saisie
eq(checkTeamGoal(base, []), { ok: true, value: { id: 'tg-a', name: 'Missions du mois', scope: 'team', metric: 'done', target: 40, month: '' } }, 'objectif d\'équipe valide');
eq(checkTeamGoal({ ...base, scope: 'employee', employee_id: ' demo_u1 ', metric: 'rate', target: 90, month: '2026-10' }, []), { ok: true, value: { id: 'tg-a', name: 'Missions du mois', scope: 'employee', metric: 'rate', target: 90, month: '2026-10', employee_id: 'demo_u1' } }, 'objectif de salarié valide (taux, un mois)');
eq((checkTeamGoal({ ...base, scope: 'team', employee_id: 'x y' }, []) as any).value.employee_id, undefined, 'équipe : le salarié éventuel est ignoré');
bad({ ...base, name: '  ' }, 'name', 'nom vide refusé');
bad({ ...base, name: 5 }, 'format', 'nom qui n\'est pas du texte refusé');
bad({ ...base, id: 'a b' }, 'format', 'identifiant avec espace refusé');
bad({ ...base, scope: 'tous' }, 'scope', 'portée inconnue refusée');
bad({ ...base, scope: 'employee' }, 'employee', 'objectif de salarié sans salarié refusé');
bad({ ...base, scope: 'employee', employee_id: 'a b' }, 'employee', 'salarié avec espace refusé');
bad({ ...base, metric: 'argent' }, 'metric', 'mesure inconnue refusée');
bad({ ...base, target: 0 }, 'target', 'cible 0 refusée');
bad({ ...base, target: -3 }, 'target', 'cible négative refusée');
bad({ ...base, target: 12.5 }, 'target', 'cible non entière refusée');
bad({ ...base, target: '40' }, 'target', 'cible en texte refusée');
bad({ ...base, target: 100001 }, 'target', 'plus de 100 000 missions refusé');
bad({ ...base, metric: 'rate', target: 101 }, 'target', 'taux au-dessus de 100 % refusé');
eq(checkTeamGoal({ ...base, metric: 'rate', target: 100 }, []).ok, true, 'taux de 100 % accepté');
bad({ ...base, month: '2026-13' }, 'month', 'mois 13 refusé');
bad({ ...base, month: '2026-1' }, 'month', 'mois sans zéro refusé');
bad({ ...base, month: '1999-12' }, 'month', 'année 1999 refusée');
bad({ ...base, month: 202610 }, 'format', 'mois en nombre refusé');
bad(null, 'format', 'rien du tout refusé');
bad([], 'format', 'tableau refusé');
bad(JSON.parse('{"__proto__":{"x":1},"name":"a"}'), 'format', 'clé dangereuse refusée');
bad({ ...base, id: 'tg-b', name: ' MISSIONS DU MOIS ' }, 'duplicate', 'même nom (majuscules, espaces) refusé', [must(base)]);
eq(checkTeamGoal(base, [must(base)]).ok, true, 'un objectif peut garder son propre nom en se modifiant');
bad({ ...base, id: '', name: 'Nouveau' }, 'limit', '41e objectif refusé', Array.from({ length: TEAM_GOAL_LIMITS.max }, (_, i) => ({ id: 'g' + i, name: 'n' + i })));

// ---- Liste reçue
eq(cleanTeamGoals('oups'), [], 'liste qui n\'est pas une liste : vide');
eq(cleanTeamGoals([base, base, { ...base, id: 'tg-b', name: 'Autre' }, { ...base, id: 'tg-c', name: '' }, 5, null, { ...base, id: '' }]).map((g) => g.id), ['tg-a', 'tg-b'], 'liste : faux objectifs et doublons ignorés');
eq(cleanTeamGoals(Array.from({ length: 50 }, (_, i) => ({ ...base, id: 'g' + i, name: 'n' + i }))).length, 40, 'liste : 40 objectifs au plus');

// ---- Valeur réelle : calculée à partir des missions
const P = (employee_id: string, status: string, date: string) => ({ employee_id, status, date });
const posts = [
  P('u1', 'completed', '2026-10-02'), P('u1', 'completed', '2026-10-15'), P('u1', 'rejected', '2026-10-20'), P('u1', 'in_progress', '2026-10-21'),
  P('u2', 'completed', '2026-10-05'), P('u2', 'completed', '2026-10-31'), P('u2', 'completed', '2026-09-30'), P('u2', 'rejected', '2026-11-01'), P('u2', 'pending_end', '2026-10-10'),
];
const team = { scope: 'team', metric: 'done' }, teamRate = { scope: 'team', metric: 'rate' }, u1 = { scope: 'employee', employee_id: 'u1', metric: 'done' }, u1Rate = { scope: 'employee', employee_id: 'u1', metric: 'rate' };
eq(teamGoalActual(team, posts, '2026-10'), { actual: 4, done: 4, rejected: 1, decided: 5 }, 'équipe, octobre : 4 validées (le 30 sept. et le 1er nov. ne comptent pas)');
eq(teamGoalActual(u1, posts, '2026-10'), { actual: 2, done: 2, rejected: 1, decided: 3 }, 'salarié u1, octobre : ses 2 missions validées seulement');
eq(teamGoalActual(teamRate, posts, '2026-10').actual, 80, 'taux d\'équipe : 4 sur 5 jugées = 80 %');
eq(teamGoalActual(u1Rate, posts, '2026-10').actual, 67, 'taux de u1 : 2 sur 3 = 67 % (arrondi)');
eq(teamGoalActual(teamRate, posts, '2026-08'), { actual: null, done: 0, rejected: 0, decided: 0 }, 'taux sans mission jugée : null, pas 0 ni NaN');
eq(teamGoalActual(team, posts, '2026-08').actual, 0, 'missions validées sans mission : 0');
eq(teamGoalActual({ scope: 'employee', employee_id: 'inconnu', metric: 'done' }, posts, '2026-10').actual, 0, 'salarié sans mission : 0');
eq(teamGoalActual(team, [{ employee_id: 'u1', status: 'completed', date: undefined as any }, P('u1', 'completed', '2026-10-01')], '2026-10').actual, 1, 'mission sans date ignorée');
{ const frozen = Object.freeze(posts.map((p) => Object.freeze(p))); let threw = false; try { teamGoalActual(team, frozen as any, '2026-10'); } catch { threw = true; } eq(threw, false, 'les missions reçues ne sont jamais modifiées'); }

// ---- Situation et avancement
eq(teamGoalAppliesTo({ month: '' }, '2026-10') && teamGoalAppliesTo({ month: '2026-10' }, '2026-10') && !teamGoalAppliesTo({ month: '2026-09' }, '2026-10'), true, 'sans mois : tous les mois ; avec un mois : celui-là seulement');
const g = { target: 40 };
eq(teamGoalStatus(g, 40, '2026-10', '2026-10-20'), 'reached', 'cible exactement atteinte : atteint');
eq(teamGoalStatus(g, 41, '2026-10', '2026-10-20'), 'reached', 'cible dépassée : atteint');
eq(teamGoalStatus(g, 39, '2026-10', '2026-10-20'), 'open', 'mois en cours, cible pas atteinte : en cours');
eq(teamGoalStatus(g, 39, '2026-10', '2026-11-01'), 'missed', 'mois fini, cible pas atteinte : non atteint');
eq(teamGoalStatus(g, 40, '2026-10', '2026-11-01'), 'reached', 'mois fini, cible atteinte : atteint');
eq(teamGoalStatus(g, 0, '2026-12', '2026-10-20'), 'upcoming', 'mois futur : à venir');
eq(teamGoalStatus(g, null, '2026-10', '2026-10-20'), 'no_data', 'taux sans mission jugée : sans donnée');
eq(teamGoalStatus(g, null, '2026-12', '2026-10-20'), 'upcoming', 'mois futur sans donnée : à venir');
eq(teamGoalProgress(40, 10), { pct: 25, gap: 30 }, 'avancement : 10 sur 40 = 25 %, reste 30');
eq(teamGoalProgress(40, 55), { pct: 100, gap: 0 }, 'avancement plafonné à 100 %, écart 0');
eq(teamGoalProgress(40, null), { pct: 0, gap: 40 }, 'sans donnée : 0 %');
eq(teamGoalProgress(3, 1), { pct: 33, gap: 2 }, 'avancement arrondi');
eq(/NaN|undefined|null/.test(JSON.stringify([teamGoalProgress(7, 3), teamGoalProgress(0, 3)])), false, 'aucun NaN ni undefined (cible 0 comprise)');
eq([Object.keys(TEAM_GOAL_METRIC_LABEL).length, Object.keys(TEAM_GOAL_STATUS_LABEL).length], [2, 5], 'libellés : 2 mesures, 5 situations');
ok(newTeamGoalId([]).startsWith('tg-'), 'nouvel identifiant : commence par tg-');
{ const a = newTeamGoalId([]); const b = newTeamGoalId([{ id: a }]); ok(a !== b, 'nouvel identifiant : jamais un identifiant déjà pris'); }

// ---- Lien avec les évaluations (M5.4)
{
  const goalsL = [must({ ...base, id: 'tg-t', name: 'Équipe', target: 3 }), must({ ...base, id: 'tg-1', name: 'Camille', scope: 'employee', employee_id: 'u1', target: 2 }), must({ ...base, id: 'tg-2', name: 'Noé', scope: 'employee', employee_id: 'u2', target: 1 }), must({ ...base, id: 'tg-o', name: 'Octobre seul', target: 1, month: '2026-10' })] as any[];
  const lines = reviewGoalLines(goalsL, posts, 'u1', '2026-09-10', '2026-10-20', '2026-10-25');
  eq(lines.map((l) => `${l.month} ${l.goal.id} ${l.actual} ${l.status}`), ['2026-09 tg-t 1 missed', '2026-09 tg-1 0 missed', '2026-10 tg-t 4 reached', '2026-10 tg-1 2 reached', '2026-10 tg-o 4 reached'], 'fiche : objectifs de l\'équipe et du salarié pour chaque mois de la période (pas ceux d\'un autre salarié, « octobre seul » seulement en octobre)');
  eq(reviewGoalLines(goalsL, posts, 'u1', '2026-10-20', '2026-09-10', '2026-10-25'), [], 'fiche : période à l\'envers : rien');
  eq(reviewGoalLines(goalsL, posts, 'u1', '2026-10', '2026-10-20', '2026-10-25'), [], 'fiche : date fausse : rien');
  eq([...new Set(reviewGoalLines(goalsL, posts, 'u1', '2025-10-01', '2026-10-20', '2026-10-25').map((l) => l.month))], ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'], 'fiche : sur 12 mois, seulement les 6 derniers');
  eq(reviewGoalLines(goalsL, posts, 'u1', '2026-12-30', '2027-01-05', '2026-10-25').every((l) => l.status === 'upcoming'), true, 'fiche : mois futurs : à venir, passage d\'année géré');
  eq(reviewGoalLines([], posts, 'u1', '2026-09-10', '2026-10-20', '2026-10-25'), [], 'fiche : aucun objectif : rien');
}

// ---- Site / serveur
{
  const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8').replace(/\r\n/g, '\n');
  const site = readFileSync('src/utils/teamGoals.ts', 'utf8').replace(/\r\n/g, '\n');
  const sm = src.match(/\/\/ ===== BEGIN TEAMGOALS[^\n]*\n([\s\S]*?)\/\/ ===== END TEAMGOALS =====/);
  const lm = site.match(/\/\/ BEGIN TEAMGOALS\n([\s\S]*?)\/\/ END TEAMGOALS/);
  ok(!!sm, 'serveur : bloc TEAMGOALS présent');
  ok(!!sm && !!lm && sm[1].trim() === lm[1].trim(), 'serveur : le bloc est la copie exacte de src/utils/teamGoals.ts');
  if (sm) {
    new Function(transformSync(sm[1] + '\n;globalThis.__g = { cleanTeamGoals, checkTeamGoal };', { loader: 'ts' }).code)();
    const s = (globalThis as any).__g;
    const samples = [base, { ...base, id: 'tg-b', name: 'B', scope: 'employee', employee_id: 'u1', metric: 'rate', target: 90, month: '2026-10' }, { ...base, id: 'tg-c', target: 0 }, { ...base, id: 'tg-d', month: '2026-13' }, { ...base, id: 'tg-e', name: 'E', scope: 'employee' }, 5, null];
    eq(JSON.stringify(s.cleanTeamGoals(JSON.parse(JSON.stringify(samples)))), JSON.stringify(cleanTeamGoals(samples)), 'serveur et site nettoient la même liste pareil');
    eq(JSON.stringify(s.checkTeamGoal(base, [])), JSON.stringify(checkTeamGoal(base, [])), 'serveur et site jugent pareil un objectif');
  }
  ok(/"team_goals", "recurring_missions", "mission_templates", "budgets", "health_acks"\]/.test(src), 'serveur : objectifs jamais envoyés à un opérateur (réglages réservés à l\'admin)');
  ok(/cleanTeamGoals\(sentGoals\)/.test(src), 'serveur : objectifs revérifiés à chaque enregistrement des réglages');
  ok(/sentGoals = \(rec as any\)\.team_goals === undefined \? \(existing as any\)\?\.team_goals : \(rec as any\)\.team_goals/.test(src), 'serveur : un vieux site qui n\'envoie pas les objectifs ne les efface pas');
}

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
