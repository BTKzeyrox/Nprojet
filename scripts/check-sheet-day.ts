// Feuille du jour : « personne oubliée » (M27.1), « 8 sur 12 saisis » (M27.2), total du jour (M27.6). Règles pures + câblage.
// Lancer : npm run check:sheet-day
import fs from 'node:fs';
import { missingPeople, dayTotals, dayProgress, copyFromDay } from '../src/utils/sheetDay';
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('OK   ' + m); } else { fail++; console.log('ECHEC ' + m); } };
const P = (id: string, status = 'active') => ({ id, status, name: id });
const people = [P('e1'), P('e2'), P('e3'), P('e4', 'blocked')];
const D = '2026-11-09';
const line = (uid: string, type = 'presence', status = 'completed', extra: any = {}) => ({ id: `we-${D}-${uid}-${type}`, status, ...extra });

// ---- M27.1 ----
ok(missingPeople({}, [], [], D, 'presence').length === 0, 'liste vide : personne ne manque');
ok(missingPeople({ e1: { presence: 'present' }, e2: { hours: '8' }, e3: { quantity: '5' } }, people, [], D, 'presence').length === 0, 'tout rempli (présence, heures ou quantité) : personne ne manque');
ok(missingPeople({ e1: { presence: 'present' } }, people, [], D, 'presence').map(u => u.id).join() === 'e2,e3', 'seuls e2 et e3 manquent ; e4 (bloqué) ne compte pas');
ok(missingPeople({ e1: { presence: 'present' } }, people, [line('e2')], D, 'presence').map(u => u.id).join() === 'e3', 'déjà saisi ce jour-là pour ce type : ne manque plus');
ok(missingPeople({ e1: { presence: 'present' } }, people, [line('e2', 'carton')], D, 'presence').map(u => u.id).join() === 'e2,e3', 'saisi pour UN AUTRE type : manque pour celui-ci');
ok(missingPeople({ e1: { presence: 'present' } }, people, [{ id: `we-2026-11-08-e2-presence`, status: 'completed' }], D, 'presence').map(u => u.id).join() === 'e2,e3', 'saisi un AUTRE jour : manque');
ok(missingPeople({ e1: { presence: 'present' } }, people, [line('e2', 'presence', 'rejected')], D, 'presence').map(u => u.id).join() === 'e2,e3', 'ligne refusée : ne compte pas comme saisie');
ok(missingPeople({ e1: { presence: '', hours: '  ', quantity: '' } }, [P('e1')], [], D, 'presence').length === 1, 'ligne vide ou espaces : manque');
ok(missingPeople({ e1: { presence: 'present' } }, people, [line('e2', 'presence', 'pending_end')], D, 'presence').map(u => u.id).join() === 'e3', 'ligne en attente de validation : compte comme saisie');

// ---- M27.6 ----
const t = dayTotals([line('e1', 'presence', 'completed', { presence: 'present', calculated_ar: 10000 }), line('e2', 'presence', 'completed', { presence: 'late', calculated_ar: 9000.4 }), line('e3', 'presence', 'pending_end', { presence: 'half' }), line('e4', 'presence', 'completed', { presence: 'absent', calculated_ar: 0 })]);
ok(t.lines === 4 && t.present === 3 && t.validatedAr === 19000 && t.pending === 1, 'total du jour : 4 lignes, 3 présents, 19 000 Ar validés, 1 en attente');
ok(dayTotals([]).lines === 0 && dayTotals([{ id: 'x', status: 'rejected' }]).lines === 0, 'total vide ; ligne refusée non comptée');
ok(dayTotals([line('e1', 'presence', 'completed', { calculated_ar: -5 })]).validatedAr === 0, 'montant négatif : jamais compté');

// ---- M27.2 ----
const posts = [line('e1'), line('e1', 'carton'), line('e2', 'presence', 'pending_end'), line('e3', 'presence', 'rejected'), { id: 'we-2026-11-08-e3-presence', status: 'completed' }, { id: 'autre-e3', status: 'completed' }];
const g = dayProgress(people, posts, D);
ok(g.total === 3 && g.done === 2, '2 sur 3 saisis (e1 deux types = 1 personne ; e3 refusée ou veille = non ; e4 bloqué hors compte)');
ok(dayProgress([], posts, D).total === 0, 'personne à saisir : total 0 (le raccourci se masque)');
// minuit à Madagascar : le jour change à 21:00 UTC
const mada = (ms: number) => new Date(ms + 3 * 3600000).toISOString().slice(0, 10);
ok(mada(Date.UTC(2026, 10, 8, 20, 59)) === '2026-11-08' && mada(Date.UTC(2026, 10, 8, 21, 0)) === '2026-11-09', 'le jour de Madagascar change à 21:00 UTC');
ok(dayProgress(people, posts, '2026-11-10').done === 0, 'le lendemain : tout repart à 0');
// hasard : done <= total, jamais d'erreur
let bad = 0;
for (let i = 0; i < 3000; i++) {
  const ppl = Array.from({ length: Math.floor(Math.random() * 8) }, (_, k) => P('u' + k, Math.random() < 0.2 ? 'blocked' : 'active'));
  const ps = Array.from({ length: Math.floor(Math.random() * 12) }, () => line('u' + Math.floor(Math.random() * 10), Math.random() < 0.5 ? 'presence' : 'carton', ['completed', 'pending_end', 'rejected'][Math.floor(Math.random() * 3)]));
  const r = dayProgress(ppl, ps, D); const m = missingPeople({}, ppl, ps, D, 'presence');
  if (r.done > r.total || r.done < 0 || m.some(u => u.status === 'blocked')) bad++;
}
ok(bad === 0, '3000 cas au hasard : jamais plus de saisis que de personnes, jamais de bloqué dans les oubliés');

// ---- câblage ----
const v = fs.readFileSync('src/views/WorksheetView.tsx', 'utf8');
ok(/data-worksheet-missing/.test(v) && /sum\.lines > 0 \? missingPeople\(/.test(v), 'écran : ligne orange seulement une fois la saisie commencée');
ok(!/data-worksheet-save[^>]*disabled=\{[^}]*missing/.test(v), 'écran : l\'oubli ne bloque jamais l\'enregistrement');
ok(/data-day-totals/.test(v) && /dayTotals\(dayLines\)/.test(v), 'écran : total du jour sous « Déjà saisi ce jour-là »');
const sc = fs.readFileSync('src/components/WorksheetShortcut.tsx', 'utf8');
ok(/data-worksheet-progress/.test(sc) && /useNow\(15000\)/.test(sc) && /db\.subscribe/.test(sc) && /weCanEnterFor\(me, u\)/.test(sc), 'raccourci : avancement recalculé tout seul, limité aux personnes de ma liste');

// ---- M27.7 : copier la veille ----
const V = '2026-11-08';
const yl = (uid: string, extra: any = {}, type = 'presence', status = 'completed') => ({ id: `we-${V}-${uid}-${type}`, status, ...extra });
const ypost = [yl('e1', { presence: 'present', hours: 8 }), yl('e2', { presence: 'late', hours: 6.5 }), yl('e3', { quantity: 40, rejected: 3 }), yl('e4', { presence: 'present' }), yl('e5', { presence: 'present' }, 'carton'), yl('e6', { presence: 'present' }, 'presence', 'rejected')];
const ppl7 = [P('e1'), P('e2'), P('e3'), P('e4', 'blocked'), P('e5'), P('e6'), P('e7')];
const c1 = copyFromDay({}, ppl7, ypost, V, D, 'presence');
ok(c1.copied === 3 && (c1.rows.e1 as any).presence === 'present' && (c1.rows.e1 as any).hours === '8' && (c1.rows.e2 as any).hours === '6.5' && (c1.rows.e3 as any).quantity === '40' && (c1.rows.e3 as any).rejected === '3', 'copie présence, heures, quantité, refusées de la veille');
ok(!c1.rows.e4 && !c1.rows.e5 && !c1.rows.e6 && !c1.rows.e7, 'ni bloqué, ni autre type, ni ligne refusée, ni personne sans ligne la veille');
const c2 = copyFromDay({ e1: { presence: 'absent' } }, ppl7, ypost, V, D, 'presence');
ok((c2.rows.e1 as any).presence === 'absent' && (c2.rows.e1 as any).hours === undefined && c2.copied === 2, 'ne remplace jamais ce qui est déjà tapé');
const c3 = copyFromDay({}, ppl7, [...ypost, line('e2')], V, D, 'presence');
ok(!c3.rows.e2 && c3.copied === 2, 'ignore une personne déjà enregistrée aujourd\'hui');
ok(copyFromDay({}, ppl7, [], V, D, 'presence').copied === 0, 'jour sans veille (repos) : rien copié');
const rowsIn = { e1: { hours: '5' } }; copyFromDay(rowsIn, ppl7, ypost, V, D, 'presence');
ok(JSON.stringify(rowsIn) === '{"e1":{"hours":"5"}}', 'ne modifie pas la liste d\'origine (renvoie une copie)');
{ const many = Array.from({ length: 100 }, (_, k) => P('m' + k)); const mp = many.map(u => ({ id: `we-${V}-${u.id}-presence`, status: 'completed', presence: 'present', hours: 8 }));
  const r = copyFromDay({}, many, mp, V, D, 'presence'); ok(r.copied === 100 && Object.keys(r.rows).length === 100, '100 lignes copiées'); }
ok(copyFromDay({}, [P('x')], [{ id: `we-${V}-x-presence`, status: 'completed', presence: 'bizarre', hours: -4 }], V, D, 'presence').copied === 0, 'valeurs invalides (présence inconnue, heures négatives) : ignorées');
const vv = fs.readFileSync('src/views/WorksheetView.tsx', 'utf8');
ok(/data-copy-yesterday/.test(vv) && /copyFromDay\(rows, people/.test(vv) && /remAddDays\(date, -1\)/.test(vv), 'écran : bouton « Copier la veille » dans la saisie groupée');
console.log(`\n${pass}/${pass + fail} contrôles OK`);
process.exit(fail ? 1 : 0);
