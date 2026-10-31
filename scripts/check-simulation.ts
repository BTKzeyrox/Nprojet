// Contrôle du générateur de simulation (module 18, M18.4) : les données inventées doivent être COHÉRENTES entre elles, vues par les vraies règles du site
// (factures contre missions, paie, argent, comptabilité, planning, congés). Pur, sans réseau, sans base. Lancer : npm run check:simulation
import { buildSimulation, isSimId, isSimShift, SIM_OPERATORS, SIM_PAY_PER_MISSION, SIM_PRICES, SIM_PREFIX, type SimData } from '../src/sim/simulation';
import { computeFinance } from '../src/utils/financeStats';
import { clientPriceForPost } from '../src/utils/clientPrice';
import { invoiceTotalsAll } from '../src/utils/invoices';
import { trialBalance, incomeStatement } from '../src/utils/accounting';
import { buildEntries } from '../src/utils/accountingEntries';
import { planConflicts } from '../src/utils/planning';
import { workingDays } from '../src/utils/leaves';
import { isLate, isLateDay } from '../src/utils/attendance';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const TODAY = '2026-10-28';
const d0 = buildSimulation({ today: TODAY });
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const sum = (a: number[]) => a.reduce((t, x) => t + x, 0);
const prices = { ...SIM_PRICES, price_per_mission: SIM_PAY_PER_MISSION } as any;
const dups = (ids: string[]) => ids.length !== new Set(ids).size;

// ----- Forme générale : 2 clients, 10 missions, 4 opérateurs, 2 mois -----
ok(d0.clients.length === 2 && d0.contracts.length === 10, '2 clients et 10 missions');
ok(d0.contracts.filter(c => c.client_id === 'sim-cl1').length === 5 && d0.contracts.filter(c => c.client_id === 'sim-cl2').length === 5, '5 missions par client, toutes rattachées à une fiche client');
ok(new Set(d0.contracts.map(c => c.post_type)).size === 5 && new Set(d0.contracts.map(c => c.client_name)).size === 10, '5 types de missions différents, 10 titres différents');
ok(d0.operators.length === 4 && d0.operators.filter(o => o.shift === 'day').length === 2 && d0.operators.filter(o => o.shift === 'night').length === 2, '4 opérateurs : 2 de jour, 2 de nuit');
const span = dayDiff(d0.start, TODAY);
ok(span >= 50 && span <= 60, `la simulation couvre environ 2 mois (${span} jours, du ${d0.start} au ${TODAY})`);
ok(d0.start.endsWith('-01') || span === 59, 'le début est le 1er d\'un mois (ou exactement 60 jours)');

// ----- Même entrée = mêmes données ; dates variées -----
ok(JSON.stringify(buildSimulation({ today: TODAY })) === JSON.stringify(d0), 'déterministe : deux générations du même jour sont identiques');
ok(JSON.stringify(buildSimulation({ today: '2026-10-29' })) !== JSON.stringify(d0), 'un autre jour donne d\'autres données');
let threw = 0; for (const bad of ['', 'hier', '2026-13-40x', undefined as any]) { try { buildSimulation({ today: bad }); } catch { threw++; } }
ok(threw === 4, 'date fausse : refusée avec une erreur claire');

// ----- Missions -----
const ops = new Set(d0.operators.map(o => o.id));
ok(d0.posts.every(p => ops.has(p.employee_id) && p.date >= d0.start && p.date <= TODAY), 'toutes les missions sont faites par un opérateur de la simulation, dans la période');
ok(d0.posts.every(p => dow(p.date) !== 0), 'aucune mission le dimanche');
ok(d0.posts.every(p => d0.contracts.some(c => c.post_number === p.post_number && c.client_name === p.client_name && c.client_id === p.client_id)), 'chaque mission faite correspond à une mission du tableau (numéro, titre, client)');
const done = d0.posts.filter(p => p.status === 'completed'), rej = d0.posts.filter(p => p.status === 'rejected'), live = d0.posts.filter(p => !['completed', 'rejected'].includes(p.status));
ok(rej.length / (done.length + rej.length) >= 0.01 && rej.length / (done.length + rej.length) <= 0.15, `quelques refus (${rej.length} sur ${done.length + rej.length})`);
ok(rej.every(p => !!p.rejection_reason && p.calculated_ar === 0) && done.every(p => p.calculated_ar === SIM_PAY_PER_MISSION), 'refus : motif écrit et rien à payer ; validée : le prix de la mission');
ok(d0.operators.every(o => done.filter(p => p.employee_id === o.id).length >= 20), 'chaque opérateur a au moins 20 missions validées');
const cfg = { day_shift_start: '08:00', night_shift_start: '20:00', late_tolerance_min: 15 } as any;
const firstOfDay = (o: string, d: string) => done.filter(p => p.employee_id === o && p.date === d).sort((a, b) => ((p: any) => (p.shift_type === 'night' && p.start_time < '12:00' ? '9' : '0') + p.start_time)(a).localeCompare(((p: any) => (p.shift_type === 'night' && p.start_time < '12:00' ? '9' : '0') + p.start_time)(b)))[0];
ok(done.every(p => p.shift_type === (d0.operators.find(o => o.id === p.employee_id)!.shift)) && d0.operators.every(o => [...new Set(done.filter(p => p.employee_id === o.id).map(p => p.date))].every(d => { const f = firstOfDay(o.id, d), h = Number(f.start_time!.slice(0, 2)); return f.shift_type === 'day' ? h >= 7 && h < 9 : h >= 19 && h < 21; })), 'vacation cohérente : la 1re mission du jour commence vers 8 h (jour) ou 20 h (nuit)');
const dayKeys = [...new Set(d0.posts.map(p => `${p.employee_id}|${p.date}`))];
const late = dayKeys.map(k => { const [e, d] = k.split('|'); return { employee_id: e, date: d, late: isLateDay(d0.posts.filter(p => p.employee_id === e && p.date === d), cfg) }; }).filter(x => x.late);
ok(late.length / dayKeys.length < 0.1, `ponctualité : ${late.length} jour(s) en retard sur ${dayKeys.length} jours travaillés (moins de 10 %)`);
ok(d0.operators.every(o => { const days = [...new Set(late.filter(p => p.employee_id === o.id).map(p => p.date))].sort(); return days.every(dd => days.filter(x => x >= dd && dayDiff(dd, x) < 7).length < 3); }), 'jamais 3 retards en 7 jours pour le même opérateur (pas de fausse alerte « souvent en retard »)');
ok(d0.operators.every(o => { const per = new Map<string, number>(); for (const p of d0.posts.filter(p => p.employee_id === o.id && p.status !== 'active' && p.status !== 'pending_end' && p.status !== 'pending_start')) per.set(p.date, (per.get(p.date) || 0) + 1); return [...per.values()].every(n => n >= 1 && n <= 5); }), 'de 1 à 5 missions par opérateur et par jour travaillé');
const monthDone = (o: string, m: string) => done.filter(p => p.employee_id === o && p.date.startsWith(m)).length;
const fullMonth = d0.start.slice(0, 7);
ok(d0.operators.every(o => Math.abs(monthDone(o.id, fullMonth) - (o.monthly ?? 40)) <= 6), 'chaque opérateur est proche de son niveau mensuel (84, 64, 44, 24) le premier mois');
ok(monthDone(d0.operators[0].id, fullMonth) >= 80 && monthDone(d0.operators[3].id, fullMonth) < 40, 'niveaux visibles : le 1er opérateur au niveau le plus haut, le dernier le plus bas');
ok(d0.operators.every(o => new Set(d0.posts.filter(p => p.employee_id === o.id).map(p => p.client_id)).size === 2), 'chaque opérateur travaille pour les deux clients');
ok(live.length === 3 && live.every(p => p.date === TODAY) && ['active', 'pending_end', 'pending_start'].every(s => live.some(p => p.status === s)), 'aujourd\'hui : une mission en cours, une à valider, une qui demande à démarrer');
ok(!dups(d0.posts.map(p => p.id)), 'identifiants de missions uniques');

// ----- Factures contre missions -----
const issued = d0.invoices.filter(i => i.status === 'issued'), drafts = d0.invoices.filter(i => i.status === 'draft');
ok(issued.length >= 2 && drafts.length === 1, `${issued.length} factures émises et 1 brouillon`);
ok(issued.every(i => i.total_ar === sum(i.lines.map(l => l.total_ar)) && i.lines.every(l => l.total_ar === Math.round(l.qty * l.unit_price_ar))), 'chaque facture = somme de ses lignes ; chaque ligne = quantité × prix');
const refsOf = (i: { lines: { refs?: string[] }[] }) => i.lines.flatMap(l => l.refs || []);
const allRefs = issued.flatMap(refsOf);
ok(!dups(allRefs), 'aucune mission facturée deux fois');
ok(allRefs.every(id => done.some(p => p.id === id)), 'seules des missions validées sont facturées');
ok(issued.every(i => i.total_ar === sum(refsOf(i).map(id => clientPriceForPost(done.find(p => p.id === id)!, d0.contracts, prices)))), 'le total de chaque facture = prix client de ses missions (même règle que Finances)');
ok(issued.every(i => refsOf(i).every(id => done.find(p => p.id === id)!.client_id === i.client_id && done.find(p => p.id === id)!.date.slice(0, 7) < i.issue_date.slice(0, 7) + '')), 'une facture ne reprend que les missions de son client, d\'un mois fini');
ok(done.filter(p => !allRefs.includes(p.id)).every(p => p.date.slice(0, 7) === TODAY.slice(0, 7)), 'les seules missions non facturées sont celles du mois en cours (le brouillon)');
const num = issued.map(i => i.number!);
ok(num.every(x => /^FA-\d{4}-\d{4}$/.test(x)) && !dups(num) && [...issued].sort((a, b) => a.issue_date.localeCompare(b.issue_date)).every((i, k) => i.number === `FA-${i.issue_date.slice(0, 4)}-${String(k + 1).padStart(4, '0')}`), 'numéros de facture continus, dans l\'ordre des dates');
ok(drafts.every(i => !i.number) && issued.every(i => i.issue_date <= TODAY && i.due_date > i.issue_date), 'brouillon sans numéro ; factures émises jamais dans le futur, échéance après l\'émission');

// ----- Argent -----
const pays = d0.cash.filter(c => c.invoice_id);
ok(pays.every(c => c.kind === 'in' && issued.some(i => i.id === c.invoice_id && i.client.name === c.client_name)), 'chaque paiement est lié à une facture émise du bon client');
ok(issued.every(i => sum(pays.filter(c => c.invoice_id === i.id).map(c => c.amount_ar)) <= i.total_ar), 'jamais plus payé que facturé');
ok(!dups(pays.map(c => c.receipt_no!)) && pays.every(c => /^RC-\d{4}-\d{4}$/.test(c.receipt_no || '')), 'reçus numérotés, sans doublon');
ok(d0.cash.every(c => c.date >= d0.start && c.date <= TODAY && c.amount_ar > 0 && Number.isInteger(c.amount_ar)), 'argent : dates dans la période, montants entiers positifs');
const ti = invoiceTotalsAll(d0.invoices, d0.cash, TODAY);
ok(ti.to_collect > 0 && ti.to_collect === sum(issued.map(i => i.total_ar)) - sum(pays.map(c => c.amount_ar)), `il reste ${ti.to_collect} Ar à encaisser (facturé moins payé), à relancer`);
ok(issued.some(i => sum(pays.filter(c => c.invoice_id === i.id).map(c => c.amount_ar)) === 0) || issued.some(i => { const p = sum(pays.filter(c => c.invoice_id === i.id).map(c => c.amount_ar)); return p > 0 && p < i.total_ar; }), 'au moins une facture partiellement payée ou impayée (la relance a de quoi montrer)');
ok(!dups(d0.cash.map(c => c.id)), 'identifiants d\'argent uniques');

// ----- Paie et Finances : le moteur du site retrouve nos chiffres -----
const [y, m] = TODAY.split('-').map(Number), prevM = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
for (const key of [prevM, TODAY.slice(0, 7)]) {
  const range = { start: `${key}-01`, end: key === TODAY.slice(0, 7) ? TODAY : `${key}-31`, days: 31 };
  const f = computeFinance({ cash: d0.cash, posts: d0.posts, contracts: d0.contracts, prices, pricePerMission: SIM_PAY_PER_MISSION, clients: d0.clients as any }, 'month', range);
  const dm = done.filter(p => p.date >= range.start && p.date <= range.end);
  ok(f.done === dm.length && f.salaries === dm.length * SIM_PAY_PER_MISSION, `${key} : ${dm.length} missions validées, paie ${f.salaries} Ar = missions × ${SIM_PAY_PER_MISSION}`);
  ok(f.billed === sum(dm.map(p => clientPriceForPost(p, d0.contracts, prices))), `${key} : facturable de Finances = prix client des missions validées`);
  ok(f.received === sum(d0.cash.filter(c => c.kind === 'in' && c.date >= range.start && c.date <= range.end).map(c => c.amount_ar)) && f.spent === sum(d0.cash.filter(c => c.kind === 'out' && c.date >= range.start && c.date <= range.end).map(c => c.amount_ar)), `${key} : encaissé et dépensé de Finances = lignes d'argent`);
  ok([f.profit, f.billed, f.received, f.spent, f.salaries, f.treasury].every(Number.isFinite) && (f.received > 0 ? f.bestClient !== null : f.bestClient === null), `${key} : aucun NaN ; « meilleur client » seulement s'il y a eu un paiement`);
}
ok(d0.operators.every(o => sum(done.filter(p => p.employee_id === o.id).map(p => p.calculated_ar ?? 0)) > 0 && sum(done.filter(p => p.employee_id === o.id).map(p => p.calculated_ar ?? 0)) % SIM_PAY_PER_MISSION === 0), 'la paie de chaque opérateur est un multiple du prix de la mission');

// ----- Comptabilité -----
const tb = trialBalance(d0.entries);
ok(tb.balanced && d0.entries.every(e => sum(e.lines.map(l => l.debit)) === sum(e.lines.map(l => l.credit))), 'balance équilibrée et chaque écriture équilibrée');
ok(!dups(d0.entries.map(e => e.id)) && !dups(d0.entries.map(e => e.number || e.id)), 'écritures : identifiants et numéros uniques');
const rebuilt = buildEntries({ invoices: d0.invoices, cash: d0.cash, slips: [], advances: d0.advances });
ok(rebuilt.skipped.length === 0 && rebuilt.entries.length === d0.entries.length - 1, 'toutes les pièces ont leur écriture (aucune refusée) ; seul le capital de départ est saisi à la main');
const st = incomeStatement(d0.entries, d0.start, TODAY);
ok(st.totalIncome === sum(issued.map(i => i.subtotal_ar)) && st.totalIncome > 0, 'produits (ventes) de la comptabilité = factures émises : le brouillon ne compte pas');
const bal = (acc: string) => { const r = tb.rows.find(x => x.account === acc); return r ? r.balance_debit - r.balance_credit : 0; };
ok(['512', '514', '531', '411'].every(a => bal(a) >= 0), 'aucun compte d\'argent ou de clients en négatif (banque, mobile money, caisse, clients)');
ok(bal('411') === ti.to_collect, 'compte clients (411) = reste à encaisser des factures');
ok(!d0.entries.some(e => e.date > TODAY || e.date < d0.start), 'aucune écriture hors de la période');

// ----- Congés et planning -----
ok(d0.leaves.length === 4 && ['approved', 'pending'].every(s => d0.leaves.some(l => l.status === s)) && d0.leaves.every(l => ops.has(l.employee_id) && l.days === workingDays(l.start_date, l.end_date, 5) && l.end_date >= l.start_date), 'congés : 4 demandes (acceptées et en attente), jours ouvrés bien comptés');
ok(d0.leaves.filter(l => l.status === 'approved' && l.start_date < TODAY).length >= 2 && !d0.posts.some(p => d0.leaves.some(l => l.status === 'approved' && l.employee_id === p.employee_id && p.date >= l.start_date && p.date <= l.end_date)), 'aucune mission un jour de congé accepté (deux congés passés visibles dans le calendrier)');
ok(d0.shifts.length === 4 * 14 && !dups(d0.shifts.map(s => s.id)) && d0.shifts.every(s => /^sh-.+-\d{8}$/.test(s.id) && ops.has(s.employee_id)), 'planning : 2 semaines pour les 4 opérateurs, identifiants au format du site');
ok(planConflicts(d0.shifts, d0.leaves as any, { maxPerWeek: 5 }).length === 0, 'planning sans conflit (congé accepté = repos, pas de Nuit puis Jour, 5 jours au plus par semaine)');
ok(d0.shifts.every(s => dow(s.date) === 0 || dow(s.date) === 6 ? s.kind === 'off' : true), 'week-end : repos');

// ----- Autres éléments -----
ok(d0.advances.length === 2 && d0.advances.some(a => a.status === 'approved') && d0.advances.some(a => a.status === 'pending') && d0.advances.every(a => ops.has(a.employee_id) && a.amount_ar > 0), 'avances : une acceptée, une en attente');
ok(d0.messages.length >= 6 && d0.news.length === 2 && d0.groups.length === 1 && d0.groups[0].members.includes(d0.adminId) && d0.messages.every(x => x.sent_ms === new Date(x.timestamp).getTime()), 'messages, groupe et actualités présents ; heures cohérentes');
ok(d0.settings.price_per_mission === SIM_PAY_PER_MISSION && d0.settings.monthly_plan.revenue_ar > 0 && Object.keys(d0.settings.budgets).length >= 3 && !('company' in (d0.settings as object)), 'réglages : prix, plan du mois et budgets, jamais les conditions de l\'entreprise');

// ----- Marques, noms, vraies personnes -----
const idsOf = (d: SimData): string[] => [...d.clients, ...d.contracts, ...d.posts, ...d.invoices, ...d.cash, ...d.leaves, ...d.advances, ...d.groups, ...d.messages, ...d.news].map(x => x.id);
ok(idsOf(d0).every(isSimId), `toute ligne créée a un identifiant « ${SIM_PREFIX}… » (retrouvable pour recharger sans toucher au réel)`);
ok(d0.shifts.every(s => isSimShift(s, d0.operators)) && !isSimShift({ employee_id: 'quelqu-un-d-autre' }, d0.operators), 'le planning se reconnaît par ses opérateurs');
const all = JSON.stringify(d0).toLowerCase();
ok(!/demo|démo|kiot|radama|tokiherivola|rivage|delta services|horizon|lumière/.test(all.replace(/simulation/g, '')), 'aucun mot de démo ni nom de vraie personne ou d\'ancien client');
ok(SIM_OPERATORS.every(o => o.name.split(' ').length === 2) && new Set(SIM_OPERATORS.map(o => o.username)).size === 4, 'noms d\'opérateurs : prénom et nom, identifiants de connexion distincts');

// ----- Comptes réels : on peut brancher les vrais identifiants -----
const real = [{ id: 'u-real-1', name: 'Opérateur 1', username: 'operator1', shift: 'day' as const, monthly: 84 }, { id: 'u-real-2', name: 'Opérateur 2', username: 'operator2', shift: 'day' as const, monthly: 64 }, { id: 'u-real-3', name: 'Opérateur 3', username: 'operator3', shift: 'night' as const, monthly: 44 }, { id: 'u-real-4', name: 'Opérateur 4', username: 'operator4', shift: 'night' as const, monthly: 24 }];
const dr = buildSimulation({ today: TODAY, adminId: 'u-admin', adminName: 'Admin', operators: real });
ok(dr.posts.every(p => real.some(o => o.id === p.employee_id)) && dr.shifts.every(s => real.some(o => o.id === s.employee_id)) && dr.cash.every(c => c.created_by === 'u-admin') && trialBalance(dr.entries).balanced, 'avec les vrais identifiants des comptes : tout leur est rattaché, comptabilité équilibrée');
ok(JSON.stringify(dr.posts.map(p => [p.date, p.post_number, p.status])) === JSON.stringify(d0.posts.map(p => [p.date, p.post_number, p.status])), 'les identifiants choisis ne changent pas les données (mêmes dates, missions, statuts)');

// ----- Robustesse : plusieurs jours de départ (début de mois, fin d'année, bissextile, dimanche) -----
for (const t of ['2026-10-01', '2026-10-02', '2026-01-03', '2027-03-31', '2028-02-29', '2026-11-01', '2026-12-31']) {
  const d = buildSimulation({ today: t });
  const iss = d.invoices.filter(i => i.status === 'issued');
  const good = trialBalance(d.entries).balanced && d.posts.length > 100 && !dups(d.posts.map(p => p.id)) && d.posts.every(p => p.date <= t && p.date >= d.start && dow(p.date) !== 0)
    && d.cash.every(c => c.date <= t) && iss.every(i => i.issue_date <= t) && !dups(iss.flatMap(refsOf)) && planConflicts(d.shifts, d.leaves as any, { maxPerWeek: 5 }).length === 0
    && ['512', '514', '531', '411'].every(a => { const r = trialBalance(d.entries).rows.find(x => x.account === a); return !r || r.balance_debit - r.balance_credit >= 0; });
  ok(good, `${t} (${['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'][dow(t)]}) : données cohérentes (${d.posts.length} missions, ${iss.length} factures, du ${d.start})`);
}

// ----- Jours de travail (Réglages) : la simulation les suit (option workDays) -----
for (const wd of [[1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6]]) {
  for (const t of ['2026-10-28', '2026-10-31', '2026-11-04']) {
    const d = buildSimulation({ today: t, workDays: wd }), isWd = (x: string) => wd.includes(dow(x));
    const approved = d.leaves.filter(l => l.status === 'approved');
    const good = d.posts.every(p => isWd(p.date))
      && d.leaves.every(l => isWd(l.start_date) && isWd(l.end_date))
      && d.posts.every(p => !approved.some(l => l.employee_id === p.employee_id && p.date >= l.start_date && p.date <= l.end_date))
      && d.operators.every(o => { const per = new Map<string, number>(); for (const p of d.posts.filter(p => p.employee_id === o.id)) per.set(p.date, (per.get(p.date) || 0) + 1); return [...per.values()].every(n => n <= 5); });
    ok(good, `jours de travail ${wd.join('')} le ${t} : aucune mission ni congé en dehors de ces jours, aucune mission pendant un congé accepté, 5 par jour au plus`);
  }
}
ok(JSON.stringify(buildSimulation({ today: '2026-10-28' })) === JSON.stringify(buildSimulation({ today: '2026-10-28', workDays: [1, 2, 3, 4, 5, 6] })), 'sans option : lundi à samedi, comme avant');

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
