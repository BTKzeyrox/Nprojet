// Contrôle de la date limite et de la priorité (M6.1). Lancer : npm run check:deadlines
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { checkDeadline, dueLabel, dueSortKey, dueState, isRealDate, isRealTime } from '../src/utils/deadlines';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };

// Dates
eq([isRealDate('2026-02-28'), isRealDate('2026-02-30'), isRealDate('2024-02-29'), isRealDate('2026-13-01'), isRealDate('2026-1-1'), isRealDate(''), isRealDate(null), isRealDate(20261020), isRealDate('1999-01-01')], [true, false, true, false, false, false, false, false, false], 'vraies dates seulement (30 février, mois 13, texte, nombre, an 1999 refusés ; 29/02/2024 bon)');
eq([isRealTime('00:00'), isRealTime('23:59'), isRealTime('24:00'), isRealTime('9:30'), isRealTime('12:60'), isRealTime(null)], [true, true, false, false, false, false], 'heures : 00:00 à 23:59');

// Saisie
eq(checkDeadline({}), { ok: true, priority: 'Normale' }, 'rien saisi : pas de date, priorité Normale');
eq(checkDeadline({ due_date: '', due_time: '', priority: '' }), { ok: true, priority: 'Normale' }, 'champs vides : pas de date');
eq(checkDeadline({ due_date: '2026-10-25', due_time: '14:30', priority: 'Urgente' }), { ok: true, due_date: '2026-10-25', due_time: '14:30', priority: 'Urgente' }, 'date, heure et priorité valides');
eq(checkDeadline({ due_date: '2026-10-25' }), { ok: true, due_date: '2026-10-25', priority: 'Normale' }, 'date seule : l\'heure est facultative');
eq(checkDeadline({ due_date: '2026-02-30' }), { ok: false, error: 'date' }, '30 février refusé');
eq(checkDeadline({ due_date: '25/10/2026' }), { ok: false, error: 'date' }, 'format jj/mm/aaaa refusé');
eq(checkDeadline({ due_date: '2026-10-25', due_time: '25:00' }), { ok: false, error: 'time' }, 'heure fausse refusée');
eq(checkDeadline({ due_time: '10:00' }), { ok: false, error: 'time_without_date' }, 'heure sans date refusée');
eq(checkDeadline({ priority: 'Critique' }), { ok: false, error: 'priority' }, 'priorité inconnue refusée');
eq(checkDeadline({ due_date: ['2026-10-25'] }), { ok: false, error: 'date' }, 'tableau à la place d\'une date refusé');
eq(checkDeadline({ due_date: 20261025 }), { ok: false, error: 'date' }, 'nombre à la place d\'une date refusé');

// État
const T = '2026-10-20';
eq(dueState({}, T), { kind: 'none', days: null }, 'sans date : rien à montrer');
eq(dueState({ due_date: '2026-10-19' }, T), { kind: 'late', days: -1 }, 'hier : en retard de 1 jour');
eq(dueState({ due_date: '2026-10-20' }, T, '10:00'), { kind: 'today', days: 0 }, 'aujourd\'hui sans heure : « aujourd\'hui », pas en retard');
eq(dueState({ due_date: '2026-10-20', due_time: '09:00' }, T, '10:00').kind, 'late', 'aujourd\'hui à 09:00 et il est 10:00 : en retard');
eq(dueState({ due_date: '2026-10-20', due_time: '18:00' }, T, '10:00').kind, 'today', 'aujourd\'hui à 18:00 et il est 10:00 : pas encore');
eq(dueState({ due_date: '2026-10-22' }, T), { kind: 'soon', days: 2 }, 'dans 2 jours : bientôt');
eq(dueState({ due_date: '2026-10-23' }, T), { kind: 'later', days: 3 }, 'dans 3 jours : plus tard');
eq(dueState({ due_date: '2026-10-23' }, T, '00:00', false, 5).kind, 'soon', 'seuil « bientôt » réglable');
eq(dueState({ due_date: '2020-01-01' }, T, '00:00', true), { kind: 'done', days: null }, 'mission terminée : jamais en retard');
eq(dueState({ due_date: 'oups' as any }, T), { kind: 'none', days: null }, 'date fausse : ignorée sans erreur');
eq(dueState({ due_date: '2026-10-25' }, 'faux'), { kind: 'none', days: null }, 'aujourd\'hui faux : ignoré sans erreur');
eq(dueState({ due_date: '2026-03-01' }, '2026-02-28').days, 1, 'passage février/mars : 1 jour');
eq(dueState({ due_date: '2027-01-01' }, '2026-12-31').days, 1, 'passage d\'année : 1 jour');

// Tri
const l = [{ id: 'a' }, { id: 'b', due_date: '2026-10-25', due_time: '09:00' }, { id: 'c', due_date: '2026-10-25' }, { id: 'd', due_date: '2026-10-21' }] as any[];
eq([...l].sort((x, y) => dueSortKey(x).localeCompare(dueSortKey(y))).map(x => x.id), ['d', 'b', 'c', 'a'], 'tri : la plus proche d\'abord, avec heure avant sans heure, sans date en dernier');

// Libellés
eq([dueLabel({ kind: 'late', days: -3 }, 'fr'), dueLabel({ kind: 'late', days: -3 }, 'en'), dueLabel({ kind: 'soon', days: 2 }, 'fr'), dueLabel({ kind: 'today', days: 0 }, 'en'), dueLabel({ kind: 'none', days: null }, 'fr'), dueLabel({ kind: 'done', days: null }, 'fr')], ['En retard de 3 j', 'Late by 3 d', 'Échéance dans 2 j', 'Due today', null, null], 'libellés FR et EN (rien pour « sans date » et « terminée »)');
eq(/NaN|undefined|null/.test(JSON.stringify([dueLabel({ kind: 'late', days: 0 }, 'fr'), dueLabel({ kind: 'later', days: 9 }, 'en')])), false, 'aucun NaN ni « undefined » dans les libellés');

// Pureté : les données reçues ne sont pas modifiées
const frozen = Object.freeze({ due_date: '2026-10-25', due_time: '10:00' });
let threw = false; try { dueState(frozen, T, '09:00'); dueSortKey(frozen); checkDeadline(frozen); } catch { threw = true; }
eq(threw, false, 'les données reçues ne sont jamais modifiées');

// Site / serveur : le bloc MISSIONS du serveur donne les mêmes réponses que le site
{
  const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
  const m = src.match(/\/\/ ===== BEGIN MISSIONS[^\n]*\n([\s\S]*?)\/\/ ===== END MISSIONS =====/);
  eq(!!m, true, 'serveur : bloc MISSIONS présent');
  if (m) {
    const js = transformSync(m[1] + '\n;globalThis.__f = cleanMissionDeadline;', { loader: 'ts' }).code;
    new Function(js)();
    const srv = (globalThis as any).__f as (c: any) => { ok: boolean; save?: any; reason?: string };
    const cases: any[] = [{}, { due_date: '2026-10-25' }, { due_date: '2026-10-25', due_time: '14:30', priority: 'Urgente' }, { due_date: '2026-02-30' }, { due_date: '25/10/2026' }, { due_date: '2026-10-25', due_time: '25:00' }, { due_time: '10:00' }, { priority: 'Critique' }, { due_date: ['2026-10-25'] }, { due_date: 20261025 }, { due_date: null, due_time: null, priority: null }, { due_date: '', due_time: '', priority: '' }, { priority: 'Haute' }, { due_date: '1999-01-01' }, { due_date: '2026-10-25', due_time: '9:30' }, { due_date: {}, priority: [] }, { due_date: '2026-10-25 ', priority: 'normale' }];
    let same = 0;
    for (const c of cases) {
      const a = checkDeadline(c); const b = srv({ ...c });
      const okSame = a.ok === b.ok && (!a.ok || (b.save?.due_date === (a as any).due_date && b.save?.due_time === (a as any).due_time && b.save?.priority === (a as any).priority));
      if (okSame) same++; else console.log('   différence', JSON.stringify(c), JSON.stringify(a), JSON.stringify(b));
    }
    eq(same, cases.length, `site et serveur répondent pareil sur ${cases.length} saisies (bonnes et mauvaises)`);
  }
}

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
