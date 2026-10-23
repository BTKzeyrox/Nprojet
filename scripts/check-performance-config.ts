// Contrôle des réglages de la performance (module 3, M3.4), sans réseau.
// Lancer : npm run check:performance-config
// 1) règles du site (cleanPerformanceConfig) : toute valeur invalide retombe sur la valeur de départ ;
// 2) le bloc PERFORMANCE du serveur donne EXACTEMENT les mêmes résultats ;
// 3) l'écriture des réglages passe par le serveur (applyPerformance) ; un salarié reçoit les réglages (il en a besoin pour calculer le même score).
import fs from 'node:fs';
import { transformSync } from 'esbuild';
import { PERFORMANCE_DEFAULTS, cleanPerformanceConfig, computePerformance } from '../src/utils/performanceScore';

const src = fs.readFileSync(new URL('../supabase/functions/df-api/index.ts', import.meta.url), 'utf8');
let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const J = (x: unknown) => JSON.stringify(x);
const D = PERFORMANCE_DEFAULTS;

const m = /\/\/ ===== BEGIN PERFORMANCE[^\n]*\n([\s\S]*?)\/\/ ===== END PERFORMANCE =====/.exec(src);
ok(!!m, 'bloc « PERFORMANCE » trouvé dans le serveur');
const srv = new Function(`${transformSync(m![1], { loader: 'ts' }).code}\nreturn { PERFORMANCE_DEFAULTS, cleanPerformanceConfig, applyPerformance };`)() as any;

ok(J(srv.PERFORMANCE_DEFAULTS) === J(D), 'valeurs de départ : identiques sur le site et le serveur');
ok(J(cleanPerformanceConfig(undefined)) === J(D) && J(cleanPerformanceConfig(null)) === J(D) && J(cleanPerformanceConfig('x')) === J(D) && J(cleanPerformanceConfig([])) === J(D), 'rien ou n\'importe quoi envoyé = valeurs de départ');
ok(J(cleanPerformanceConfig(D)) === J(D), 'les valeurs de départ sont valides et inchangées');
ok(D.weights.quality + D.weights.volume + D.weights.punctuality + D.weights.regularity === 100, 'poids de départ : total 100');

const cases: [string, any][] = [
  ['fenêtre 45', { window_days: 45 }], ['fenêtre 3 (trop court)', { window_days: 3 }], ['fenêtre 200', { window_days: 200 }], ['fenêtre texte', { window_days: '30' }], ['fenêtre NaN', { window_days: NaN }], ['fenêtre 30.6', { window_days: 30.6 }],
  ['min missions 0', { score_min_missions: 0 }], ['min missions 15', { score_min_missions: 15 }], ['min missions Infinity', { score_min_missions: Infinity }], ['min qualité 500', { quality_min_missions: 500 }], ['min qualité 501', { quality_min_missions: 501 }],
  ['poids tous à 0', { weights: { quality: 0, volume: 0, punctuality: 0, regularity: 0 } }], ['poids 50/50/0/0', { weights: { quality: 50, volume: 50, punctuality: 0, regularity: 0 } }], ['poids négatif', { weights: { quality: -5, volume: 25, punctuality: 20, regularity: 15 } }], ['poids 101', { weights: { quality: 101 } }], ['poids texte', { weights: 'x' }],
  ['niveaux qualité 80/90/99', { quality_levels: [80, 90, 99] }], ['niveaux qui ne montent pas', { quality_levels: [95, 90, 98] }], ['niveaux égaux', { punctuality_levels: [90, 90, 100] }], ['niveaux 2 valeurs', { streak_levels: [5, 10] }], ['niveaux 4 valeurs', { streak_levels: [5, 10, 20, 30] }], ['niveaux hors limites', { quality_levels: [0, 50, 101] }], ['niveaux décimaux', { rendement_levels: [10.26, 25.04, 40] }], ['niveaux texte', { versatility_levels: ['2', 3, 5] }],
  ['recrue 2 missions', { rookie_missions: 2 }], ['recrue 20 missions', { rookie_missions: 20 }], ['recrue 400 jours', { rookie_days: 400 }], ['équipe min 1', { month_min_team: 1 }], ['équipe min 3', { month_min_team: 3 }],
  ['durées 5/600', { min_duration_min: 5, max_duration_min: 600 }], ['durée max 30', { max_duration_min: 30 }], ['durée min 61', { min_duration_min: 61 }], ['jours de travail 8', { default_work_days: 8 }], ['jours de travail 5', { default_work_days: 5 }],
  ['champ inconnu', { hack: 'x', window_days: 30 }], ['__proto__', JSON.parse('{"__proto__":{"window_days":1},"window_days":14}')],
];
for (const [name, v] of cases) ok(J(cleanPerformanceConfig(v)) === J(srv.cleanPerformanceConfig(v)), `site = serveur : ${name}`);
ok(cleanPerformanceConfig({ window_days: 45 }).window_days === 45 && cleanPerformanceConfig({ window_days: 3 }).window_days === D.window_days, 'fenêtre : 45 gardé, 3 refusé');
ok(cleanPerformanceConfig({ quality_levels: [95, 90, 98] }).quality_levels.join() === D.quality_levels.join(), 'niveaux qui ne montent pas : valeurs de départ');
ok(cleanPerformanceConfig({ weights: { quality: 0, volume: 0, punctuality: 0, regularity: 0 } }).weights.quality === 40, 'poids tous à zéro : valeurs de départ');
ok(!('hack' in cleanPerformanceConfig({ hack: 1 })) && !('hack' in srv.cleanPerformanceConfig({ hack: 1 })), 'champ inconnu : jeté');

// écriture : le serveur revérifie
{
  const a = srv.applyPerformance({ id: 'general', performance: { window_days: 9999 } }, { performance: { window_days: 9999, weights: { quality: 70, volume: 10, punctuality: 10, regularity: 10 } } }, undefined);
  ok(a.performance.window_days === 30 && a.performance.weights.quality === 70 && a.id === 'general', 'écriture : valeur absurde refusée, bonne valeur gardée, reste du réglage intact');
  const b = srv.applyPerformance({ id: 'general' }, { id: 'general' }, { performance: { window_days: 60 } });
  ok(b.performance.window_days === 60, 'ancien site qui n\'envoie pas « performance » : l\'existant est gardé');
  const c = srv.applyPerformance({ id: 'general' }, { id: 'general' }, { id: 'general' });
  ok(!('performance' in c), 'aucun réglage ni existant : rien n\'est écrit (valeurs de départ)');
  const d = srv.applyPerformance({ id: 'general', performance: 'x' }, { performance: 'x' }, undefined);
  ok(J(d.performance) === J(D), 'texte envoyé : valeurs de départ');
}
ok(/toSave = applyPerformance\(toSave, rec, existing\)/.test(src), 'serveur : applyPerformance est bien appelé à l\'enregistrement des réglages');
const adminKeys = /const SETTINGS_ADMIN_KEYS[^=]*=\s*\[([^\]]*)\]/.exec(src)?.[1] || '';
ok(!adminKeys.includes('performance'), 'serveur : les réglages de performance sont envoyés aux salariés (nécessaire pour calculer le même score ; rien d\'argent dedans)');

// un réglage change vraiment le calcul
{
  const users = [{ id: 'u1', name: 'A', role: 'employee', status: 'active', shift: 'day' }] as any;
  const base = { users, posts: [], contracts: [], today: '2026-10-23', lateLimitTime: '08:00', workDaysPerWeek: 6 } as any;
  ok(computePerformance({ ...base, cfg: { window_days: 45 } }).cfg.window_days === 45, 'le calcul utilise la fenêtre réglée');
  ok(computePerformance({ ...base, cfg: { window_days: 3 } }).cfg.window_days === 30, 'le calcul ignore une fenêtre absurde');
}
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
