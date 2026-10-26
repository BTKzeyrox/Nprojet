// Essai de l'onglet « Planning » (M15.2), sans écran réel et sans réseau : démo responsable et salarié, FR et EN, écriture des cases, conflits.
// Lancer : npm run check:planning-page
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
g.fetch = async () => { throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { HrPage } = await import('../src/views/hr/HrPage');
const { planConflicts, shiftId, mondayOf, weekDates, isOnLeave } = await import('../src/utils/planning');
const { todayMada } = await import('../src/utils/stats');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const view = (lang: 'fr' | 'en') => { mem.delta_lang = lang; return renderToString(<AppProvider><HrPage currentUser={db.getCurrentUser() as any} initialTab="planning" /></AppProvider>).replace(/<!--.*?-->/g, ''); };

// ---------- démo responsable ----------
db.enterDemo('admin');
const staff = db.getUsers().filter(u => u.role === 'employee' || u.role === 'team_lead');
const all = db.getShifts();
ok(staff.length === 6 && all.length === 84 && all.every(s => staff.some(u => u.id === s.employee_id)), 'démo : 6 salariés, 14 jours chacun, 84 entrées');
ok(new Set(all.map(s => s.id)).size === all.length && all.every(s => s.id === shiftId(s.employee_id, s.date)), 'démo : un identifiant calculé par salarié et par jour, aucun doublon');
ok(all.every(s => ['day', 'night', 'off'].includes(s.kind)), 'démo : seulement Jour, Nuit ou Repos');
const conflicts = planConflicts(all, db.getLeaves(), { maxPerWeek: 5 });
ok(conflicts.filter(c => c.kind === 'rest' && c.employee_id === 'demo_u4').length === 2, 'démo : Hugo a un repos insuffisant (Nuit puis Jour) chaque semaine, 2 conflits');
const lea = all.filter(s => s.employee_id === 'demo_u5' && s.kind !== 'off' && isOnLeave(db.getLeaves(), 'demo_u5', s.date)).length;
ok(conflicts.filter(c => c.kind === 'on_leave').length === lea && conflicts.filter(c => c.kind === 'on_leave').every(c => c.employee_id === 'demo_u5'), `démo : seuls les jours planifiés pendant le congé accepté de Léa sont en conflit (${lea})`);
ok(conflicts.every(c => c.kind !== 'too_many'), 'démo : personne ne travaille plus de 5 jours par semaine');

const frAdmin = view('fr'), enAdmin = view('en');
ok(frAdmin.length > 800 && !bad(frAdmin) && !bad(enAdmin), 'responsable : la page s\'affiche en FR et EN, sans NaN ni undefined');
ok(frAdmin.includes('Planning des équipes') && frAdmin.includes('Camille Durand') && frAdmin.includes('Conflits de la semaine'), 'responsable FR : titre, salariés, conflits');
ok((frAdmin.match(/rounded-md border font-mono font-bold/g) || []).length === 42, 'responsable : 6 salariés × 7 jours = 42 cases');
ok(enAdmin.includes('Team schedule') && enAdmin.includes('Conflicts this week') && !/Planning des équipes|Conflits de la semaine|Copier la semaine/.test(enAdmin), 'responsable EN : pas de français dans les libellés');

// ---------- écriture des cases ----------
const mon = mondayOf(todayMada());
const d1 = weekDates(mon)[0];
const before = db.getShifts().length;
let r = db.applyShifts([{ employee_id: 'demo_u2', date: d1, kind: 'night', note: ' remplacement ' }]);
const one = db.getShifts().find(s => s.id === shiftId('demo_u2', d1));
ok(r.success && one?.kind === 'night' && one.note === 'remplacement' && db.getShifts().length === before, 'une case modifiée : même entrée, pas de doublon, note nettoyée');
r = db.applyShifts([{ employee_id: 'demo_u2', date: d1, kind: 'off' }]);
ok(r.success && db.getShifts().find(s => s.id === shiftId('demo_u2', d1))?.kind === 'off' && db.getShifts().length === before, 'une case changée de vacation : toujours une seule entrée');
r = db.applyShifts([], [{ employee_id: 'demo_u2', date: d1 }]);
ok(r.success && !db.getShifts().some(s => s.id === shiftId('demo_u2', d1)) && db.getShifts().length === before - 1, 'une case vidée : l\'entrée disparaît');
const snapshot = JSON.stringify(db.getShifts());
ok(db.applyShifts([{ employee_id: 'demo_u2', date: d1, kind: 'day' }, { employee_id: 'demo_u3', date: d1, kind: 'zz' as any }]).error === 'kind' && JSON.stringify(db.getShifts()) === snapshot, 'une entrée fausse dans un lot : rien n\'est changé (tout ou rien)');
ok(db.applyShifts([{ employee_id: 'inconnu', date: d1, kind: 'day' }]).error === 'employee', 'salarié inconnu refusé');
ok(db.applyShifts([{ employee_id: db.getCurrentUser()!.id, date: d1, kind: 'day' }]).error === 'employee', 'le responsable ne se planifie pas lui-même');
ok(db.applyShifts([{ employee_id: 'demo_u2', date: '2026-02-30', kind: 'day' }]).error === 'date', 'date fausse refusée');
ok(JSON.stringify(db.getShifts()) === snapshot, 'après les refus : le planning est resté identique');

// ---------- démo salarié ----------
db.enterDemo('employee');
const mine = db.getShifts();
ok(mine.length === 14 && mine.every(s => s.employee_id === 'demo_u1'), 'salarié : ne reçoit que SON planning (14 jours)');
ok(db.applyShifts([{ employee_id: 'demo_u1', date: d1, kind: 'day' }]).error === 'admin' && db.getShifts().length === 14, 'salarié : ne peut rien écrire');
const frEmp = view('fr'), enEmp = view('en');
ok(!bad(frEmp) && !bad(enEmp) && frEmp.includes('Mon planning') && enEmp.includes('My schedule') && !/Mon planning|Semaine suivante|Non planifié/.test(enEmp), 'salarié : « Mon planning » en FR, « My schedule » en EN sans français');
ok(!frEmp.includes('Noé Lambert') && !frEmp.includes('Conflits de la semaine') && !/min-h-\[44px\] rounded-md border font-mono/.test(frEmp), 'salarié : ni les autres salariés, ni la grille du responsable');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
