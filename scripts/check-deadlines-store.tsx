// Essai de la date limite et de la priorité côté site (store + pastille + champs), sans réseau. Lancer : npm run check:deadlines-store
import React from 'react';
import { renderToString } from 'react-dom/server';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { AppProvider } = await import('../src/context/AppContext');
const { DeadlineBadges, DeadlineFields } = await import('../src/components/DeadlineFields');
const { addDays, todayMada } = await import('../src/utils/stats');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const render = (lang: 'fr' | 'en', el: React.ReactElement) => { mem.delta_lang = lang; return renderToString(<AppProvider>{el}</AppProvider>).replace(/<!-- -->/g, ''); };
const today = todayMada();

db.enterDemo('admin');
const before = db.getContracts().length;
const base = { client_name: 'Mission échéance', initial_score: 0, objective: 10 };

// ---------- ajout ----------
ok(db.addContract({ ...base, due_date: '2026-02-30' }).success === false && db.getContracts().length === before, 'date fausse : mission refusée, rien ajouté');
ok(db.addContract({ ...base, due_time: '10:00' }).success === false, 'heure sans date : refusée');
ok(db.addContract({ ...base, due_date: addDays(today, 3), due_time: '25:00' }).success === false, 'heure fausse : refusée');
ok(db.addContract({ ...base, priority: 'Critique' as any }).success === false, 'priorité inconnue : refusée');
ok(db.addContract({ ...base, due_date: addDays(today, 3), due_time: '14:30', priority: 'Urgente' }).success, 'mission avec date, heure et priorité : acceptée');
const c1 = db.getContracts().find(c => c.client_name === 'Mission échéance')!;
ok(c1.due_date === addDays(today, 3) && c1.due_time === '14:30' && c1.priority === 'Urgente', 'la mission garde sa date, son heure et sa priorité');
ok(db.addContract({ client_name: 'Sans date', initial_score: 0, objective: 5 }).success, 'mission sans date : acceptée');
const c2 = db.getContracts().find(c => c.client_name === 'Sans date')!;
ok(!('due_date' in c2) && !('due_time' in c2) && c2.priority === 'Normale', 'sans date : aucun champ de date écrit, priorité Normale');

// ---------- modification ----------
ok(db.updateContract(c2.id, { due_date: 'oups' }).success === false && !('due_date' in db.getContracts().find(c => c.id === c2.id)!), 'modifier avec une date fausse : refusé, la mission ne change pas');
ok(db.updateContract(c2.id, { due_date: addDays(today, -2), priority: 'Haute' }).success, 'modifier : date passée et priorité Haute acceptées');
ok(db.getContracts().find(c => c.id === c2.id)!.priority === 'Haute', 'la priorité est changée');
ok(db.updateContract(c2.id, { due_date: '', due_time: '', priority: 'Normale' }).success && !('due_date' in db.getContracts().find(c => c.id === c2.id)!) && !('due_time' in db.getContracts().find(c => c.id === c2.id)!), 'champ vidé : la date disparaît vraiment');
ok(db.updateContract(c1.id, { due_date: '' }).success && !('due_time' in db.getContracts().find(c => c.id === c1.id)!), 'enlever la date enlève aussi l\'heure');
ok(db.updateContract(c1.id, { post_type: 'Saisie' }).success && db.getContracts().find(c => c.id === c1.id)!.priority === 'Urgente', 'modifier autre chose ne touche pas la priorité');

// ---------- pastille ----------
const D = (p: any, lang: 'fr' | 'en' = 'fr') => render(lang, <DeadlineBadges {...p} />);
ok(D({}) === '' && D({ priority: 'Normale' }) === '', 'sans date et priorité normale : aucune pastille');
ok(D({ due_date: addDays(today, -3) }).includes('En retard de 3 j') && D({ due_date: addDays(today, -3) }, 'en').includes('Late by 3 d'), 'en retard : pastille FR et EN');
ok(D({ due_date: addDays(today, -3), done: true }) === '', 'mission terminée : plus de pastille de retard');
ok(D({ due_date: addDays(today, 1) }).includes('Échéance dans 1 j') && D({ due_date: addDays(today, 9) }, 'en').includes('Due in 9 d'), 'échéance à venir : FR et EN');
ok(D({ priority: 'Urgente' }).includes('Urgent') && D({ priority: 'Haute' }).includes('Priorité haute') && D({ priority: 'Haute' }, 'en').includes('High priority'), 'priorité : Urgent / Haute dans les deux langues');
ok(!bad(D({ due_date: '2026-02-30', priority: 'Urgente' })) && !bad(D({ due_date: 'oups' as any })), 'date fausse reçue : aucun NaN ni « undefined »');

// ---------- champs ----------
const noop = () => {};
const F = (lang: 'fr' | 'en', date = '') => render(lang, <DeadlineFields date={date} time="" priority="Normale" onChange={noop} inputClass="x" />);
const ff = F('fr'), fe = F('en', '2026-10-30');
ok(ff.includes('Date limite (facultatif)') && ff.includes('Priorité') && !ff.includes('Enlever la date limite') && ff.includes('disabled'), 'champs FR : heure grisée tant qu\'il n\'y a pas de date, pas de bouton « Enlever »');
ok(fe.includes('Deadline (optional)') && fe.includes('Remove the deadline') && fe.includes('Urgent'), 'champs EN : bouton « Remove the deadline » quand une date existe');
ok(!bad(ff) && !bad(fe), 'champs : aucun NaN ni « undefined »');

// ---------- opérateur ----------
db.enterDemo('employee');
ok(db.getContracts().every(c => ['Normale', 'Haute', 'Urgente'].includes(c.priority)), 'opérateur : voit les priorités des missions');
ok(db.updateContract('x', { due_date: today }).success === false, 'opérateur : mission inconnue refusée');
ok(calls === 0, 'aucun appel réseau pendant tout l\'essai');

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
