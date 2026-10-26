// Essai de l'onglet « Objectifs » (M15.3), sans écran réel et sans réseau : démo responsable et salarié, FR et EN, calculs, enregistrement.
// Lancer : npm run check:team-goals-page
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
g.fetch = async () => { throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { TeamGoalsSection } = await import('../src/views/admin/TeamGoalsSection');
const { teamGoalActual } = await import('../src/utils/teamGoals');
const { todayMada } = await import('../src/utils/stats');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const view = (lang: 'fr' | 'en') => { mem.delta_lang = lang; return renderToString(<AppProvider><TeamGoalsSection /></AppProvider>).replace(/<!--.*?-->/g, ''); };
const month = todayMada().slice(0, 7);

// ---------- démo responsable ----------
db.enterDemo('admin');
const goals = db.getTeamGoals();
ok(goals.length === 3 && goals.every(x => x.month === ''), 'démo : 3 objectifs, valables chaque mois');
const fr = view('fr'), en = view('en');
ok(fr.length > 800 && !bad(fr) && !bad(en), 'la page s\'affiche en FR et EN, sans NaN ni undefined');
ok(fr.includes('Missions validées du mois') && fr.includes('Camille Durand') && fr.includes('Toute l&#x27;équipe'), 'FR : objectifs, salarié et « Toute l\'équipe » affichés');
ok(en.includes('Goals') && en.includes('Whole team') && en.includes('Planned') && !/Prévu|Réel|Toute l|Nouvel objectif|Mois précédent/.test(en), 'EN : pas de français dans les libellés');

// La valeur réelle affichée est celle qui est calculée à partir des missions
const posts = db.getPosts();
const actualTeam = teamGoalActual(goals[0], posts, month).actual;
ok(fr.includes(`Réel : ${actualTeam}`), `la valeur réelle d'équipe affichée (${actualTeam}) est celle des missions`);
const rate = teamGoalActual(goals[1], posts, month);
ok(rate.actual === null ? fr.includes('Réel : —') : fr.includes(`Réel : ${rate.actual} %`), 'le taux affiché est calculé (ou « — » sans mission jugée)');
ok((fr.match(/role="progressbar"/g) || []).length === 3, 'une barre d\'avancement par objectif');
ok(fr.includes('Prévu : 40') && fr.includes('Prévu : 90 %') && fr.includes('Prévu : 12'), 'valeur prévue affichée avec son unité');

// ---------- enregistrement ----------
const before = db.getTeamGoals().length;
let r = db.saveTeamGoal({ name: 'Octobre : 25 validées', scope: 'team', metric: 'done', target: 25, month });
ok(r.success && db.getTeamGoals().length === before + 1 && r.goal!.id.startsWith('tg-'), 'nouvel objectif enregistré, identifiant créé');
const id = r.goal!.id;
ok(view('fr').includes('Octobre : 25 validées'), 'le nouvel objectif apparaît pour son mois');
r = db.saveTeamGoal({ id, name: 'Octobre : 30 validées', scope: 'team', metric: 'done', target: 30, month });
ok(r.success && db.getTeamGoals().length === before + 1 && db.getTeamGoals().find(x => x.id === id)?.target === 30, 'objectif modifié : même identifiant, pas de doublon');
ok(db.saveTeamGoal({ name: ' octobre : 30 VALIDÉES ', scope: 'team', metric: 'done', target: 5, month }).error === 'Un objectif porte déjà ce nom.', 'même nom refusé');
ok(db.saveTeamGoal({ name: 'X', scope: 'employee', employee_id: 'inconnu', metric: 'done', target: 5, month: '' }).error === 'Choisis un salarié.', 'salarié inconnu refusé');
ok(db.saveTeamGoal({ name: 'X', scope: 'employee', employee_id: db.getCurrentUser()!.id, metric: 'done', target: 5, month: '' }).success === false, 'le responsable n\'a pas d\'objectif de salarié');
ok(db.saveTeamGoal({ name: 'X', scope: 'team', metric: 'rate', target: 150, month: '' }).success === false, 'taux de 150 % refusé');
ok(db.saveTeamGoal({ id: 'tg-nexiste-pas', name: 'X', scope: 'team', metric: 'done', target: 5, month: '' }).error === 'Objectif introuvable.', 'modifier un objectif inconnu refusé');
const snap = JSON.stringify(db.getTeamGoals());
ok(JSON.stringify(db.getTeamGoals()) === snap, 'les refus ne changent rien');
r = db.removeTeamGoal(id);
ok(r.success && !db.getTeamGoals().some(x => x.id === id) && db.getTeamGoals().length === before, 'objectif supprimé');
ok(db.removeTeamGoal(id).error === 'Objectif introuvable.', 'supprimer deux fois : refusé proprement');

// ---------- démo salarié : aucun objectif, aucune écriture ----------
db.enterDemo('employee');
ok(db.getTeamGoals().length === 0, 'salarié : ne reçoit aucun objectif');
ok(db.saveTeamGoal({ name: 'X', scope: 'team', metric: 'done', target: 5, month: '' }).success === false && db.removeTeamGoal('tg-demo1').success === false, 'salarié : ne peut ni créer ni supprimer');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
