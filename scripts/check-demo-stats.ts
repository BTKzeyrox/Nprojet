// Contrôle : les chiffres et graphiques des statistiques sont pleins avec les données de démonstration.
// Lancer : npm run check:demo-stats
import { buildDemoData } from '../src/demo/demoData';
import { computeStats, todayMada, type StatsGranularity } from '../src/utils/stats';

const d = buildDemoData();
const today = todayMada();
const input = { posts: d.posts, contracts: d.contracts, users: d.users, advances: d.advances, pricePerMission: 5000 };
let fails = 0;
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${name}${detail ? ' — ' + detail : ''}`); if (!ok) fails++; };

for (const g of ['day', 'week', 'month', 'year'] as StatsGranularity[]) {
  const s = computeStats(input, g, today, today, 'fr');
  const filled = s.series.done.filter(v => v > 0).length;
  const total = s.series.done.length;
  check(`${g} : missions faites`, s.cur.done > 0, `${s.cur.done} (avant : ${s.prev.done})`);
  // jours écoulés de la période en cours (une semaine qui vient de commencer ne peut pas avoir 7 barres)
  const elapsed = g === 'day' ? 1 : Math.max(1, Math.round((new Date(today).getTime() - new Date(s.ranges.cur.start).getTime()) / 86400000) + 1);
  const minFilled = g === 'day' ? 2 : g === 'year' ? 9 : Math.max(1, Math.floor(elapsed * 0.45));
  check(`${g} : barres remplies`, filled >= minFilled, `${filled} sur ${total} (jours écoulés : ${elapsed})`);
  check(`${g} : salaires`, s.cur.earned > 0 && s.series.earned.some(v => v > 0), `${s.cur.earned} Ar`);
  check(`${g} : comparaison avec la période d'avant`, g === 'day' ? true : s.prev.done > 0, `${s.prev.done}`);
  check(`${g} : taux de validation`, s.cur.rate !== null && s.cur.rate >= 80 && s.cur.rate <= 100, `${s.cur.rate} %`);
  check(`${g} : durée moyenne`, s.cur.avgMin !== null && s.cur.avgMin > 30 && s.cur.avgMin < 300, `${s.cur.avgMin} min`);
  check(`${g} : types de mission`, s.byType.length >= (g === 'day' || (g === 'week' && elapsed < 4) ? 1 : 3), s.byType.map(t => `${t.label} ${t.count}`).join(', '));
  check(`${g} : classement`, s.team.ranking.length >= (g === 'day' ? 2 : 5), `${s.team.ranking.length} personnes`);
}
const m = computeStats(input, 'month', today, today, 'fr');
check('à venir : à faire / en cours / à valider', m.upcoming.todo > 0 && m.upcoming.active > 0 && m.upcoming.toValidate > 0, JSON.stringify(m.upcoming));
check('avances en attente', m.salary.pendingAdvanceCount >= 1, `${m.salary.pendingAdvanceCount} (${m.salary.pendingAdvanceAr} Ar)`);
const y = computeStats(input, 'year', today, today, 'fr');
check('année : avances accordées', y.cur.advances > 0, `${y.cur.advances} Ar`);
console.log(fails === 0 ? '\nTout est bon.' : `\n${fails} contrôle(s) en échec.`);
process.exit(fails === 0 ? 0 : 1);
