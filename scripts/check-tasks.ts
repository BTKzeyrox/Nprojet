// Contrôle de la liste de tâches d'une mission (M6.3) : règles du site et du serveur. Lancer : npm run check:tasks
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { canSubmitTasks, checkTasks, cleanDone, cleanTasks, newTaskId, taskProgress, TASK_LIMITS, tasksFromLines, toggleTask, type MissionTask } from '../src/utils/taskList';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };
const T = (id: string, text = id): MissionTask => ({ id, text });
const three = [T('a'), T('b'), T('c')];

// Saisie
eq(checkTasks(undefined), { ok: true, tasks: [], required: false }, 'rien : pas de tâches');
eq(checkTasks([]), { ok: true, tasks: [], required: false }, 'liste vide permise');
eq(checkTasks([{ id: ' a ', text: '  Ouvrir  ' }], true), { ok: true, tasks: [{ id: 'a', text: 'Ouvrir' }], required: true }, 'textes nettoyés, exigence acceptée');
eq(checkTasks([], true), { ok: false, error: 'required_without_tasks' }, '« tout cocher » sans aucune tâche : refusé');
eq(checkTasks([{ id: 'a', text: '   ' }]), { ok: false, error: 'empty_text' }, 'tâche vide refusée');
eq(checkTasks([{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }]), { ok: false, error: 'duplicate_id' }, 'deux tâches de même identifiant refusées');
eq(checkTasks(Array.from({ length: 21 }, (_, i) => T('i' + i))), { ok: false, error: 'too_many' }, '21 tâches refusées');
eq(checkTasks(Array.from({ length: 20 }, (_, i) => T('i' + i))).ok, true, '20 tâches acceptées');
eq(checkTasks('x'), { ok: false, error: 'format' }, 'texte à la place d\'une liste refusé');
eq(checkTasks([null]), { ok: false, error: 'format' }, 'null dans la liste refusé');
eq(checkTasks([{ id: 5, text: 'x' }]), { ok: false, error: 'format' }, 'identifiant non texte refusé');
eq(checkTasks([{ id: 'a', text: ['x'] }]), { ok: false, error: 'format' }, 'texte en tableau refusé');
eq(checkTasks([{ id: 'a', text: 'x' }], 'oui'), { ok: false, error: 'format' }, 'exigence non booléenne refusée');
eq(checkTasks(JSON.parse('[{"id":"a","text":"x","__proto__":{"z":1}}]')), { ok: false, error: 'format' }, 'clé dangereuse refusée');
const long = checkTasks([{ id: 'i'.repeat(99), text: 't'.repeat(999) }]);
eq(long.ok && [long.tasks[0].id.length, long.tasks[0].text.length], [24, 120], 'identifiant et texte coupés aux limites');

// Lecture
eq(cleanTasks('x'), [], 'liste abîmée : vide');
eq(cleanTasks([null, 5, { id: 'a', text: 'ok' }, { id: 'a', text: 'doublon' }, { id: 'b' }, { id: 'c', text: '  ' }]), [T('a', 'ok')], 'lignes fausses écartées');
eq(cleanTasks(Array.from({ length: 50 }, (_, i) => T('i' + i))).length, 20, '50 lignes : coupées à 20');

// Cases cochées
eq(cleanDone(['b', 'zzz', 'b', 5, 'a'], three), ['a', 'b'], 'cases : inconnues et doublons retirés, ordre de la liste');
eq(cleanDone('x', three), [], 'cases abîmées : vide');
eq(cleanDone(['a'], []), [], 'mission sans tâche : aucune case');
eq(taskProgress(three, ['a']), { done: 1, total: 3, pct: 33, complete: false }, 'progression 1/3 = 33 %');
eq(taskProgress(three, ['a', 'b', 'c']), { done: 3, total: 3, pct: 100, complete: true }, 'progression 3/3 : complète');
eq(taskProgress([], ['a']), { done: 0, total: 0, pct: 0, complete: false }, 'pas de tâche : 0 %, jamais NaN');
eq(taskProgress(three, ['x']).done, 0, 'case d\'une ancienne tâche : ne compte pas');

// Envoi
eq([canSubmitTasks(three, [], false), canSubmitTasks(three, [], undefined), canSubmitTasks(three, ['a'], true), canSubmitTasks(three, ['a', 'b', 'c'], true), canSubmitTasks([], [], true)], [true, true, false, true, true], 'envoi : libre si rien d\'exigé ; sinon seulement tout coché ; sans tâche jamais bloqué');

// Cocher
eq(toggleTask(three, [], 'b'), ['b'], 'cocher');
eq(toggleTask(three, ['b'], 'b'), [], 'décocher');
eq(toggleTask(three, ['c'], 'a'), ['a', 'c'], 'ordre de la liste gardé');
eq(toggleTask(three, ['a'], 'zzz'), ['a'], 'identifiant inconnu : rien ne change');
const frozen = Object.freeze(['a']); let threw = false; try { toggleTask(three, frozen, 'b'); cleanDone(frozen, three); } catch { threw = true; }
eq(threw, false, 'les données reçues ne sont jamais modifiées');

// Saisie par lignes
const l1 = tasksFromLines('Ouvrir\n\n  Recopier  \r\nRelire');
eq(l1.map(x => x.text), ['Ouvrir', 'Recopier', 'Relire'], 'saisie par lignes : lignes vides ignorées, textes nettoyés');
eq(new Set(l1.map(x => x.id)).size, 3, 'saisie par lignes : identifiants tous différents');
const l2 = tasksFromLines('Relire\nOuvrir\nNouvelle', l1);
eq([l2[0].id === l1[2].id, l2[1].id === l1[0].id, l1.some(x => x.id === l2[2].id)], [true, true, false], 'une ligne gardée garde son identifiant (ses cases cochées restent), une nouvelle en reçoit un nouveau');
eq(tasksFromLines('A\nA').map(x => x.text), ['A', 'A'].slice(0, 2), 'deux lignes identiques : deux tâches');
eq(new Set(tasksFromLines('A\nA').map(x => x.id)).size, 2, 'deux lignes identiques : deux identifiants');
eq(newTaskId([T('tx')], 0).startsWith('t'), true, 'identifiant de ligne');
eq(TASK_LIMITS.max, 20, 'limite de 20');

// Site / serveur
{
  const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
  const m = src.match(/\/\/ ===== BEGIN MISSIONS[^\n]*\n([\s\S]*?)\/\/ ===== END MISSIONS =====/);
  eq(!!m, true, 'serveur : bloc MISSIONS présent');
  if (m) {
    const js = transformSync(m[1] + '\n;globalThis.__s = { cleanMissionTasks, cleanTasksDone, tasksBlockSubmit };', { loader: 'ts' }).code;
    new Function(js)();
    const srv = (globalThis as any).__s;
    const cases: any[] = [{}, { tasks: [] }, { tasks: [{ id: 'a', text: 'x' }] }, { tasks: [{ id: 'a', text: 'x' }], tasks_required: true }, { tasks: [], tasks_required: true }, { tasks_required: true }, { tasks: [{ id: 'a', text: '  ' }] }, { tasks: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }] }, { tasks: 'x' }, { tasks: [null] }, { tasks: [{ id: 5, text: 'x' }] }, { tasks: [{ id: 'a', text: 'x' }], tasks_required: 'oui' }, { tasks: Array.from({ length: 21 }, (_, i) => ({ id: 'i' + i, text: 't' })) }, { tasks: Array.from({ length: 20 }, (_, i) => ({ id: 'i' + i, text: 't' })) }, { tasks: [{ id: 'i'.repeat(99), text: 't'.repeat(999) }] }, { tasks: [{ id: ' a ', text: '  Ouvrir ' }], tasks_required: false }, { tasks: null, tasks_required: null }, { tasks: [{ id: 'a', text: 'x', extra: 1 }] }, { tasks: [{ id: 'a', text: 'A\u0000B' }] }];
    let same = 0;
    for (const c of cases) {
      const a = checkTasks(c.tasks, c.tasks_required); const b = srv.cleanMissionTasks({ ...c });
      const okSame = a.ok === b.ok && (!a.ok || (JSON.stringify(a.tasks.length ? a.tasks : undefined) === JSON.stringify(b.save.tasks) && (a.required ? b.save.tasks_required === true : !('tasks_required' in b.save))));
      if (okSame) same++; else console.log('   différence', JSON.stringify(c).slice(0, 140), JSON.stringify(a).slice(0, 140), JSON.stringify(b).slice(0, 140));
    }
    eq(same, cases.length, `site et serveur répondent pareil sur ${cases.length} listes (bonnes et mauvaises)`);
    eq(srv.cleanMissionTasks(JSON.parse('{"tasks":[{"id":"a","text":"x","__proto__":{"z":1}}]}')).ok, false, 'serveur : clé « __proto__ » refusée');
    const dones: any[] = [undefined, 'x', [], ['a'], ['b', 'zzz', 'b', 5, 'a'], ['c', 'b', 'a']];
    eq(dones.every(d => JSON.stringify(cleanDone(d, three)) === JSON.stringify(srv.cleanTasksDone(d, three))), true, 'site et serveur : mêmes cases cochées gardées');
    const ct = (req: any, tasks: any) => ({ tasks_required: req, tasks });
    const blocks: [any, any][] = [[ct(true, three), ['a']], [ct(true, three), ['a', 'b', 'c']], [ct(false, three), []], [ct(undefined, three), []], [ct(true, []), []], [undefined, []], [ct(true, three), 'x'], [ct(true, three), ['a', 'b', 'zzz']]];
    eq(blocks.every(([c, d]) => srv.tasksBlockSubmit(c, d) === !canSubmitTasks(cleanTasks(c?.tasks), d, c?.tasks_required)), true, 'site et serveur : même décision « envoi refusé ou non »');
    eq(/tasksBlockSubmit\(\(crow as any\)\?\.data, done\)[\s\S]{0,120}reason: 'tasks'/.test(src) && src.includes("rec.status === 'pending_end'"), true, 'serveur : l\'envoi de fin par un opérateur est refusé si tout n\'est pas coché');
    eq(src.includes('cleanMissionTasks(toSave)'), true, 'serveur : les missions écrites par l\'admin sont revérifiées');
  }
}

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
