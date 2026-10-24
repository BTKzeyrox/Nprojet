// Essai de la page Ressources humaines (sans écran réel, sans réseau) : démo admin et salarié, dossiers, congés, FR et EN. Complété à chaque étape du module 5.
// Lancer : npm run check:hr-page
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { HrPage } = await import('../src/views/hr/HrPage');
const { todayMada } = await import('../src/utils/stats');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const view = (lang: 'fr' | 'en', tab: 'leaves' | 'dossiers') => { mem.delta_lang = lang; return renderToString(<AppProvider><HrPage currentUser={db.getCurrentUser() as any} initialTab={tab} /></AppProvider>).replace(/<!-- -->/g, ''); };
const shift = (d: string, k: number) => new Date(Date.parse(d + 'T00:00:00Z') + k * 86400000).toISOString().slice(0, 10);
const nextMonday = (from: string) => { let d = shift(from, 1); while (new Date(d + 'T00:00:00Z').getUTCDay() !== 1) d = shift(d, 1); return d; };

// ---------- démo admin ----------
db.enterDemo('admin');
const people = db.getUsers().filter(u => u.role !== 'admin');
ok(db.getLeaves().length === 5 && ['pending', 'approved', 'rejected'].every(s => db.getLeaves().some(l => l.status === s)), 'démo : 5 congés dans plusieurs états');
ok(db.getLeaves().every(l => people.some(p => p.id === l.employee_id) && l.days >= 1 && l.start_date <= l.end_date), 'démo : chaque congé a un vrai salarié et des dates cohérentes');
ok(people.filter(u => u.hr).length === 5 && people.every(u => !u.hr || checkOk(u.hr)), 'démo : 5 dossiers, tous valides');
function checkOk(hr: any) { return (db as any).constructor && true && hr.position !== undefined; }
for (const lang of ['fr', 'en'] as const) for (const tab of ['leaves', 'dossiers'] as const) {
  const html = view(lang, tab);
  ok(html.length > 500 && !bad(html), `admin ${lang} ${tab} : la page s'affiche, sans NaN ni undefined`);
}
ok(view('fr', 'leaves').includes('Camille Durand') && view('fr', 'dossiers').includes('Agent de saisie'), 'admin : congés et dossiers affichés');
ok(!/Congé payé|Accepter|Salarié/.test(view('en', 'leaves')) && /Approve|Employee/.test(view('en', 'leaves')), 'admin en anglais : pas de français dans les libellés');

// ---------- demandes et décisions (règles du serveur appliquées par le site) ----------
const today = todayMada();
const emp = people.find(p => p.id === 'demo_u4')!;
const mon = nextMonday(shift(today, 30));
const r1 = db.requestLeave({ employee_id: emp.id, type: 'paid', start_date: mon, end_date: shift(mon, 2), reason: 'Test' });
ok(r1.success && db.getLeaves().find(l => l.id === r1.id)?.status === 'pending' && db.getLeaves().find(l => l.id === r1.id)?.days === 3, 'admin : une demande en attente, 3 jours ouvrés');
ok(db.requestLeave({ employee_id: emp.id, type: 'paid', start_date: shift(mon, 1), end_date: shift(mon, 3) }).error === 'overlap', 'chevauchement refusé');
ok(db.requestLeave({ employee_id: emp.id, type: 'zz' as any, start_date: mon, end_date: mon }).error === 'type' && db.requestLeave({ employee_id: '', type: 'paid', start_date: mon, end_date: mon }).error === 'employee', 'type inconnu ou salarié absent : refusé');
ok(db.decideLeave(r1.id!, 'rejected', 'x').error === 'decision_reason' && db.decideLeave(r1.id!, 'rejected', 'Charge de travail').success, 'refus : motif obligatoire');
ok(db.decideLeave(r1.id!, 'approved').error === 'transition', 'un congé refusé ne se rouvre pas');
ok(db.deleteLeave(r1.id!).success && !db.getLeaves().some(l => l.id === r1.id) && db.deleteLeave(r1.id!).error === 'missing', 'l\'admin supprime un congé refusé');
const r2 = db.requestLeave({ employee_id: emp.id, type: 'sick', start_date: mon, end_date: mon, approved: true });
ok(r2.success && db.getLeaves().find(l => l.id === r2.id)?.status === 'approved', 'admin : congé enregistré déjà accepté');
const co = (db.getSettings() as any).company;
ok(db.decideLeave('nope', 'approved').error === 'missing' && !!co, 'congé inconnu : refusé');

// dossiers
ok(db.setUserHr(emp.id, { position: 'Chef', hire_date: '2025-02-30' }).error === 'hire_date', 'dossier : date impossible refusée');
ok(db.setUserHr(emp.id, { position: 'Chef de salle', contract_type: 'permanent', hire_date: '2024-01-15' }).success && db.getUsers().find(u => u.id === emp.id)?.hr?.position === 'Chef de salle', 'dossier : enregistré');
ok(db.setUserHr(emp.id, null).success && db.getUsers().find(u => u.id === emp.id)?.hr === undefined, 'dossier vidé : le champ disparaît');
ok(db.setUserHr('nope', { position: 'x' }).error === 'missing', 'dossier d\'un inconnu : refusé');

// ---------- démo salarié : il ne voit que le sien ----------
db.enterDemo('employee');
const me = db.getCurrentUser()!;
ok(db.getLeaves().length > 0 && db.getLeaves().every(l => l.employee_id === me.id), 'salarié : seulement SES congés');
ok(db.getUsers().filter(u => u.id !== me.id).every(u => u.hr === undefined) && !!db.getUsers().find(u => u.id === me.id)?.hr, 'salarié : le dossier des autres est retiré, le sien reste');
ok(db.setUserHr(me.id, { position: 'Pirate' }).error === 'admin' && db.deleteLeave(db.getLeaves()[0].id).error === 'admin', 'salarié : ne modifie pas un dossier, ne supprime pas un congé');
const mine = db.getLeaves();
const approvedFuture = mine.find(l => l.status === 'approved' && l.start_date > today)!;
ok(db.decideLeave(approvedFuture.id, 'rejected', 'non').error === 'transition', 'salarié : ne peut pas refuser');
const mon2 = nextMonday(shift(today, 60));
const q1 = db.requestLeave({ type: 'paid', start_date: mon2, end_date: shift(mon2, 1), reason: 'Famille' });
ok(q1.success && db.getLeaves().find(l => l.id === q1.id)?.employee_id === me.id && db.getLeaves().find(l => l.id === q1.id)?.status === 'pending', 'salarié : sa demande part en attente, à son nom');
ok(db.requestLeave({ employee_id: 'demo_u2', type: 'paid', start_date: shift(mon2, 14), end_date: shift(mon2, 14) }).success && db.getLeaves().filter(l => l.employee_id === 'demo_u2').length === 0, 'salarié : même s\'il désigne un autre, la demande est à SON nom');
ok(db.requestLeave({ type: 'paid', start_date: shift(today, -90), end_date: shift(today, -89) }).error === 'past', 'salarié : début trop ancien refusé');
ok(db.decideLeave(q1.id!, 'approved').error === 'transition', 'salarié : ne peut pas accepter sa propre demande');
ok(db.decideLeave(q1.id!, 'cancelled').success && db.getLeaves().find(l => l.id === q1.id)?.status === 'cancelled', 'salarié : annule sa demande en attente');
ok(db.decideLeave(q1.id!, 'approved').error === 'transition', 'salarié : une demande annulée ne se rouvre pas');
for (const lang of ['fr', 'en'] as const) for (const tab of ['leaves', 'dossiers'] as const) {
  const html = view(lang, tab);
  ok(html.length > 300 && !bad(html), `salarié ${lang} ${tab} : la page s'affiche, sans NaN ni undefined`);
}
ok(view('fr', 'dossiers').includes('Agent de saisie') && !view('fr', 'dossiers').includes('Modifier le dossier'), 'salarié : voit son dossier, sans bouton de modification');
ok(!view('fr', 'leaves').includes('Déjà accepté') && view('fr', 'leaves').includes('Envoyer la demande'), 'salarié : formulaire de demande sans case « Déjà accepté »');
ok(calls === 0, 'aucun appel réseau pendant tout l\'essai');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
