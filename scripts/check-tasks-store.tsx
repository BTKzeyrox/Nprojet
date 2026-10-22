// Essai de la liste de tâches côté site (store + écrans), sans réseau. Lancer : npm run check:tasks-store
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { TaskBar, TaskChecklist, TaskListEditor } = await import('../src/components/TaskChecklist');
const { tasksFromLines } = await import('../src/utils/taskList');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const render = (lang: 'fr' | 'en', el: React.ReactElement) => { mem.delta_lang = lang; return renderToString(<AppProvider>{el}</AppProvider>).replace(/<!-- -->/g, ''); };
const anyDb = db as any;

// ---------- admin : création et modification ----------
db.enterDemo('admin');
const lines = tasksFromLines('Ouvrir le fichier\nRecopier les fiches\nRelire');
const base = { client_name: 'Mission tâches', initial_score: 0, objective: 10 };
ok(db.addContract({ ...base, tasks: [{ id: 'a', text: '' }] }).success === false, 'tâche vide : mission refusée');
ok(db.addContract({ ...base, tasks: [], tasks_required: true }).error === 'Ajoute au moins une tâche pour exiger qu\'elles soient toutes cochées.', '« tout cocher » sans tâche : refusé avec un message clair');
ok(db.addContract({ ...base, tasks: Array.from({ length: 21 }, (_, i) => ({ id: 'i' + i, text: 't' })) }).error === 'Maximum 20 tâches par mission.', '21 tâches : refusé');
ok(db.addContract({ ...base, tasks: lines, tasks_required: true }).success, 'mission avec 3 tâches et « tout cocher » : acceptée');
const c = db.getContracts().find(x => x.client_name === 'Mission tâches')!;
ok(c.tasks?.length === 3 && c.tasks_required === true, 'la mission garde ses tâches et l\'exigence');
ok(db.addContract({ client_name: 'Sans tâche', initial_score: 0, objective: 5 }).success, 'mission sans tâche acceptée');
const c0 = db.getContracts().find(x => x.client_name === 'Sans tâche')!;
ok(!('tasks' in c0) && !('tasks_required' in c0), 'sans tâche : aucun champ écrit');

// modifier : mêmes lignes = mêmes identifiants
const ids = c.tasks!.map(t => t.id);
ok(db.updateContract(c.id, { tasks: tasksFromLines('Relire\nOuvrir le fichier\nRecopier les fiches\nEnvoyer', c.tasks), tasks_required: true }).success, 'modification : une tâche ajoutée, une remontée');
const c2 = db.getContracts().find(x => x.id === c.id)!;
ok(c2.tasks!.length === 4 && c2.tasks!.find(t => t.text === 'Ouvrir le fichier')!.id === ids[0], 'une tâche gardée garde son identifiant');
ok(db.updateContract(c.id, { tasks: [{ id: 'z', text: '  ' }] }).success === false && db.getContracts().find(x => x.id === c.id)!.tasks!.length === 4, 'modifier avec une tâche vide : refusé, la mission ne change pas');
ok(db.updateContract(c.id, { post_type: 'Saisie' }).success && db.getContracts().find(x => x.id === c.id)!.tasks!.length === 4, 'modifier autre chose ne touche pas aux tâches');

// ---------- session : l'admin coche ----------
const start = (id: string) => db.startPost({ employeeId: id, clientName: 'Mission tâches', accountTag: 'T', targetScore: 10, initialScore: 0, postNumber: c.post_number, shiftType: 'day', status: 'active', autoReplaceExisting: true });
const sA = start('demo_u1');
ok(sA.success && !!sA.post, 'session démarrée sur la mission');
const pid = sA.post!.id;
const t0 = db.getContracts().find(x => x.id === c.id)!.tasks!;
ok(db.toggleSessionTask(pid, 'inconnu').error === 'Tâche introuvable.', 'cocher une tâche inconnue : refusé');
ok(db.toggleSessionTask('nope', t0[0].id).error === 'Mission introuvable', 'cocher sur une session inconnue : refusé');
const r1 = db.toggleSessionTask(pid, t0[1].id);
ok(r1.success && r1.done!.length === 1, 'une tâche cochée');
ok(db.toggleSessionTask(pid, t0[1].id).done!.length === 0, 'décochée');
db.toggleSessionTask(pid, t0[0].id);
ok(db.submitEndPost({ postId: pid, finalScore: 5 }).error === 'Coche toutes les tâches avant d\'envoyer la mission.' && db.getPosts().find(p => p.id === pid)!.status === 'active', 'envoi refusé tant que tout n\'est pas coché ; la session reste ouverte');
for (const t of t0) if (!db.getPosts().find(p => p.id === pid)!.tasks_done?.includes(t.id)) db.toggleSessionTask(pid, t.id);
ok(db.getPosts().find(p => p.id === pid)!.tasks_done!.length === 4, 'tout coché : 4 sur 4');
ok(db.submitEndPost({ postId: pid, finalScore: 5 }).success && db.getPosts().find(p => p.id === pid)!.status === 'pending_end', 'tout coché : envoi accepté');
ok(db.toggleSessionTask(pid, t0[0].id).error === 'La mission n\'est plus ouverte.', 'après l\'envoi : on ne coche plus');

// exigence retirée : l'envoi n'est plus bloqué
ok(db.updateContract(c.id, { tasks_required: false }).success, 'exigence retirée');
const sB = start('demo_u2');
ok(sB.success && db.submitEndPost({ postId: sB.post!.id, finalScore: 3 }).success, 'sans exigence : envoi possible même sans rien cocher');
// liste vidée : l'exigence disparaît aussi
ok(db.updateContract(c.id, { tasks_required: true }).success && db.updateContract(c.id, { tasks: [] }).success, 'exigence puis liste vidée');
const c3 = db.getContracts().find(x => x.id === c.id)!;
ok(!('tasks' in c3) && !('tasks_required' in c3), 'liste vidée : les tâches et l\'exigence disparaissent vraiment');

// ---------- écrans ----------
const tasks3 = [{ id: 'a', text: 'Ouvrir' }, { id: 'b', text: 'Recopier' }, { id: 'c', text: 'Relire' }];
const B = (lang: 'fr' | 'en', done: string[]) => render(lang, <TaskBar tasks={tasks3} done={done} />);
ok(B('fr', []) .includes('Tâches 0/3') && B('en', ['a']).includes('Tasks 1/3') && B('fr', ['a', 'b', 'c']).includes('100%'), 'barre : 0/3, 1/3 en anglais, 100 %');
ok(render('fr', <TaskBar />) === '' && render('fr', <TaskBar tasks={[]} />) === '', 'pas de tâches : aucune barre');
const L = (lang: 'fr' | 'en', done: string[], required = false, on = true) => render(lang, <TaskChecklist tasks={tasks3} done={done} required={required} onToggle={on ? () => {} : undefined} />);
const lf = L('fr', ['b'], true), le = L('en', [], true);
ok(lf.includes('Tâches à faire · 1/3') && lf.includes('Tout doit être coché avant d&#x27;envoyer') && lf.includes('aria-checked="true"') && lf.includes('aria-checked="false"'), 'liste FR : compteur, exigence, cases cochée et non cochée');
ok(le.includes('Tasks to do · 0/3') && le.includes('Everything must be ticked before sending'), 'liste EN');
ok(lf.includes('min-h-[44px]') && !bad(lf) && !bad(le), 'cibles de 44 px, aucun NaN ni « undefined »');
ok(L('fr', [], false, false).includes('disabled'), 'lecture seule : cases désactivées');
ok(render('fr', <TaskChecklist tasks={[]} />) === '', 'liste vide : rien');
const E = (lang: 'fr' | 'en') => render(lang, <TaskListEditor text={'A\nB\n\nC'} required onChange={() => {}} inputClass="x" />);
ok(E('fr').includes('3/20 tâches') && E('en').includes('3/20 tasks') && E('fr').includes('checked'), 'éditeur : 3 tâches sur 20, exigence cochée, FR et EN');

// ---------- opérateur ----------
db.enterDemo('employee');
const emp = anyDb.contracts[0];
emp.tasks = [{ id: 'a', text: 'Ouvrir' }, { id: 'b', text: 'Relire' }]; emp.tasks_required = true;
const sE = db.startPost({ employeeId: 'demo_u1', clientName: emp.client_name || 'X', accountTag: 'T', targetScore: 10, initialScore: 0, postNumber: emp.post_number, shiftType: 'day', status: 'active', autoReplaceExisting: true });
ok(sE.success, 'opérateur : session démarrée');
const eid = sE.post!.id;
ok(db.toggleSessionTask(eid, 'a').success, 'opérateur : coche sur SA session');
const other = anyDb.posts.find((p: any) => p.employee_id !== 'demo_u1' && p.status === 'active');
ok(!other || db.toggleSessionTask(other.id, 'a').error === 'Ce n\'est pas ta mission.', 'opérateur : ne coche jamais la session d\'un autre');
ok(db.submitEndPost({ postId: eid, finalScore: 5 }).error === 'Coche toutes les tâches avant d\'envoyer la mission.', 'opérateur : envoi refusé tant que tout n\'est pas coché');
db.toggleSessionTask(eid, 'b');
ok(db.submitEndPost({ postId: eid, finalScore: 5 }).success, 'opérateur : tout coché, envoi accepté');
ok(calls === 0, 'aucun appel réseau pendant tout l\'essai');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
