// Contrôle des badges et du score des clients (module 3, M3.5), sans réseau.
// Lancer : npm run check:client-badges
import { computeClientBadges, cleanClientBadgeConfig, CLIENT_BADGE_DEFAULTS, clientsToWatch, clientBadgeAlert, paidOffDate, percentRank } from '../src/utils/clientBadges';
import { summarizeClients, type ClientRecord, type ClientMission } from '../src/utils/clients';

let fails = 0, n = 0;
const ok = (c: boolean, name: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${name}`); } else console.log(`OK    ${name}`); };
const TODAY = '2026-10-23';
const cl = (id: string, name = id): ClientRecord => ({ id, name, active: true });
const inv = (id: string, client: string, issue: string, due: string, total: number, over: Partial<any> = {}): any => ({ id, number: `FA-${id}`, status: 'issued', type: 'invoice', client_id: client, client: { name: client }, issue_date: issue, due_date: due, lines: [], subtotal_ar: total, tax_rate: 0, tax_ar: 0, total_ar: total, ...over });
const pay = (invoice: string, date: string, amount: number): any => ({ kind: 'in', invoice_id: invoice, date, amount_ar: amount });
const mis = (client: string, date: string, price = 10000): ClientMission => ({ client_id: client, date, price_ar: price });
const run = (clients: ClientRecord[], missions: ClientMission[], invoices: any[], cash: any[], cfg?: unknown, today = TODAY) => {
  const summaries = summarizeClients(clients, missions, today);
  return computeClientBadges({ clients, summaries, missions, invoices, cash, today, cfg });
};
const get = (r: ReturnType<typeof run>, id: string) => r.clients.get(id)!;
const ids = (r: ReturnType<typeof run>, id: string) => get(r, id).badges.map(b => b.id).sort().join();
const bad = (x: unknown) => /NaN|Infinity|undefined/.test(JSON.stringify(x)); // « null » est normal (pas de score, pas de délai)

// ---------- client sans facture, sans mission ----------
{
  const r = run([cl('a')], [], [], []);
  const a = get(r, 'a');
  ok(a.badges.length === 0 && a.score === null && a.attention.length === 0, 'client sans mission ni facture : aucun badge, pas de score');
  ok(a.payment.paid === 0 && a.payment.avg_days_over === null, 'client sans facture : pas de délai moyen inventé');
}
// ---------- bon payeur ----------
{
  const invs = [inv('1', 'a', '2026-08-01', '2026-08-31', 100000), inv('2', 'a', '2026-08-15', '2026-09-14', 100000), inv('3', 'a', '2026-09-01', '2026-10-01', 100000)];
  const cash = [pay('1', '2026-08-28', 100000), pay('2', '2026-09-12', 100000), pay('3', '2026-09-28', 100000)];
  const r = run([cl('a')], [mis('a', '2026-10-01')], invs, cash);
  ok(ids(r, 'a') === 'good_payer', 'bon payeur : 3 factures payées avant l\'échéance');
  ok(get(r, 'a').payment.avg_days_over === -2.7, 'écart moyen = -2,7 jours (3, 2 et 3 jours d\'avance)');
  ok(get(r, 'a').badges[0].why.fr.includes('avant l\'échéance') && get(r, 'a').badges[0].why.en.includes('before the due date'), 'bon payeur : le pourquoi est dit en FR et en EN');
  // pile à l'échéance
  const r2 = run([cl('a')], [], [inv('1', 'a', '2026-08-01', '2026-08-31', 5000), inv('2', 'a', '2026-08-01', '2026-08-31', 5000), inv('3', 'a', '2026-08-01', '2026-08-31', 5000)], [pay('1', '2026-08-31', 5000), pay('2', '2026-08-31', 5000), pay('3', '2026-08-31', 5000)]);
  ok(ids(r2, 'a') === 'good_payer' && get(r2, 'a').payment.avg_days_over === 0, 'bon payeur : payer pile à l\'échéance compte (écart 0)');
  // seulement 2 factures : pas assez
  const r3 = run([cl('a')], [], invs.slice(0, 2), cash.slice(0, 2));
  ok(ids(r3, 'a') === '', 'bon payeur : 2 factures seulement = pas de badge (échantillon minimum)');
  // bon passé mais une facture en retard aujourd'hui : plus « bon payeur »
  const r4 = run([cl('a')], [], [...invs, inv('4', 'a', '2026-08-20', '2026-09-19', 50000)], cash);
  ok(ids(r4, 'a') === '' && get(r4, 'a').payment.overdue_open === 1, 'bon payeur retiré dès qu\'une facture est en retard aujourd\'hui');
}
// ---------- payeur lent ----------
{
  const invs = [inv('1', 'a', '2026-06-01', '2026-06-30', 100), inv('2', 'a', '2026-06-10', '2026-07-10', 100), inv('3', 'a', '2026-07-01', '2026-07-31', 100)];
  const slow = (extra: number) => [pay('1', `2026-0${7}-${String(30 + extra - 30 + 0).padStart(2, '0')}`, 100)];
  void slow;
  const cashAt = (d1: string, d2: string, d3: string) => [pay('1', d1, 100), pay('2', d2, 100), pay('3', d3, 100)];
  // 16 jours de retard en moyenne : > 15 => lent
  const r = run([cl('a')], [], invs, cashAt('2026-07-16', '2026-07-26', '2026-08-16'));
  ok(get(r, 'a').payment.avg_days_over === 16 && ids(r, 'a') === 'slow_payer' && get(r, 'a').attention.length === 1, 'payeur lent : 16 jours de retard moyen = badge + point d\'attention');
  // exactement 15 : pas lent (strictement supérieur)
  const r15 = run([cl('a')], [], invs, cashAt('2026-07-15', '2026-07-25', '2026-08-15'));
  ok(get(r15, 'a').payment.avg_days_over === 15 && ids(r15, 'a') === '', 'payeur lent : exactement 15 jours = pas lent');
  // entre 0 et 15 : ni bon ni lent
  const r5 = run([cl('a')], [], invs, cashAt('2026-07-05', '2026-07-15', '2026-08-05'));
  ok(ids(r5, 'a') === '', 'retard moyen de 5 jours : ni bon payeur ni payeur lent');
}
// ---------- à surveiller ----------
{
  const r = run([cl('a')], [], [inv('1', 'a', '2026-07-01', '2026-07-20', 250000)], []); // 95 jours de retard
  ok(ids(r, 'a') === 'watch' && get(r, 'a').payment.max_days_late === 95 && get(r, 'a').attention[0].fr.includes('250 000 Ar'), 'à surveiller : facture en retard de 95 jours, montant dit');
  const r60 = run([cl('a')], [], [inv('1', 'a', '2026-07-01', '2026-08-24', 100)], []); // 60 jours
  ok(get(r60, 'a').payment.max_days_late === 60 && ids(r60, 'a') === '', 'à surveiller : exactement 60 jours = pas encore');
  const r61 = run([cl('a')], [], [inv('1', 'a', '2026-07-01', '2026-08-23', 100)], []);
  ok(ids(r61, 'a') === 'watch', 'à surveiller : 61 jours = oui');
  const rPartial = run([cl('a')], [], [inv('1', 'a', '2026-07-01', '2026-07-20', 100000)], [pay('1', '2026-07-25', 40000)]);
  ok(ids(rPartial, 'a') === 'watch' && get(rPartial, 'a').payment.overdue_balance === 60000, 'à surveiller : paiement partiel, le reste (60 000) est compté');
  const rPaid = run([cl('a')], [], [inv('1', 'a', '2026-07-01', '2026-07-20', 100000)], [pay('1', '2026-07-25', 100000)]);
  ok(ids(rPaid, 'a') === '', 'facture soldée : plus à surveiller');
}
// ---------- factures ignorées ----------
{
  const rDraft = run([cl('a')], [], [inv('1', 'a', '2026-07-01', '2026-07-20', 100, { status: 'draft' })], []);
  const rCancel = run([cl('a')], [], [inv('1', 'a', '2026-07-01', '2026-07-20', 100, { status: 'cancelled' })], []);
  const rCredit = run([cl('a')], [], [inv('1', 'a', '2026-07-01', '2026-07-20', 100, { type: 'credit_note' })], []);
  const rZero = run([cl('a')], [], [inv('1', 'a', '2026-07-01', '2026-07-20', 0)], []);
  ok([rDraft, rCancel, rCredit, rZero].every(r => get(r, 'a').attention.length === 0), 'brouillon, annulée, avoir, total 0 : jamais en retard');
  const unknown = run([cl('a')], [], [inv('1', 'zzz', '2026-07-01', '2026-07-20', 100)], []);
  ok(get(unknown, 'a').attention.length === 0 && unknown.clients.size === 1, 'facture d\'un client inconnu : ignorée');
}
// ---------- période des paiements ----------
{
  const old = [inv('1', 'a', '2025-01-01', '2025-01-31', 100), inv('2', 'a', '2025-01-01', '2025-01-31', 100), inv('3', 'a', '2025-01-01', '2025-01-31', 100)];
  const r = run([cl('a')], [], old, [pay('1', '2025-02-20', 100), pay('2', '2025-02-20', 100), pay('3', '2025-02-20', 100)]);
  ok(get(r, 'a').payment.paid === 0 && ids(r, 'a') === '', 'paiements de plus de 12 mois : ignorés');
  const edge = run([cl('a')], [], [inv('1', 'a', '2025-10-01', '2025-10-31', 100)], [pay('1', '2025-10-23', 100)]);
  ok(get(edge, 'a').payment.paid === 1, 'paiement il y a exactement 12 mois : compté');
}
// ---------- paiement : date où la facture est soldée ----------
{
  const i = inv('1', 'a', '2026-08-01', '2026-08-31', 100);
  ok(paidOffDate(i, [pay('1', '2026-09-10', 60), pay('1', '2026-08-20', 40)]) === '2026-09-10', 'soldée = date où le cumul atteint le total (paiements dans le désordre)');
  ok(paidOffDate(i, [pay('1', '2026-08-20', 40)]) === null, 'paiement partiel : pas soldée');
  ok(paidOffDate(i, [{ kind: 'out', invoice_id: '1', date: '2026-08-20', amount_ar: 100 } as any]) === null, 'une sortie d\'argent ne solde pas une facture');
  ok(paidOffDate(i, [pay('1', 'pas une date', 100)]) === null && paidOffDate(i, [pay('1', '2026-08-20', NaN)]) === null && paidOffDate(i, [pay('1', '2026-08-20', -50)]) === null, 'date fausse, montant NaN ou négatif : ignorés');
}
// ---------- gros volume ----------
{
  const ms = (k: number, from = '2026-10-10') => Array.from({ length: k }, (_, i) => mis('a', from));
  ok(ids(run([cl('a')], ms(11), [], []), 'a') === 'big_volume', 'gros volume : 11 missions sur 30 jours');
  ok(ids(run([cl('a')], ms(10), [], []), 'a') === '', 'gros volume : 10 missions pile = non (plus de 10)');
  ok(ids(run([cl('a')], ms(11, '2026-09-23'), [], []), 'a') === '', 'gros volume : missions de plus de 30 jours = non');
  ok(ids(run([cl('a')], ms(11, '2026-09-24'), [], []), 'a') === 'big_volume', 'gros volume : limite de 30 jours incluse');
  ok(ids(run([cl('a')], ms(11, '2026-10-30'), [], []), 'a') === '', 'missions futures : ignorées');
}
// ---------- score ----------
{
  // 4 clients : volume comparable. Le client "a" : commande tous les mois, paie à temps.
  const clients = [cl('a'), cl('b'), cl('c'), cl('d')];
  const months = ['2026-05-10', '2026-06-10', '2026-07-10', '2026-08-10', '2026-09-10', '2026-10-10'];
  const missions = [...months.map(d => mis('a', d, 50000)), mis('b', '2026-10-01', 20000), mis('c', '2026-10-01', 30000), mis('d', '2026-10-01', 10000)];
  const invs = [inv('1', 'a', '2026-07-01', '2026-07-31', 100), inv('2', 'a', '2026-08-01', '2026-08-31', 100), inv('3', 'a', '2026-09-01', '2026-09-30', 100)];
  const cash = [pay('1', '2026-07-30', 100), pay('2', '2026-08-30', 100), pay('3', '2026-09-29', 100)];
  const r = run(clients, missions, invs, cash);
  const a = get(r, 'a');
  ok(a.components.regularity === 100 && a.active_months === 6 && a.window_months === 6, 'régularité : 6 mois sur 6 = 100');
  ok(a.components.payment === 100, 'ponctualité de paiement : 3 sur 3 à temps = 100');
  ok(a.components.volume === 100, 'volume : le plus gros chiffre d\'affaires = 100');
  ok(a.score === 100, 'score : 100 quand tout est parfait');
  ok(get(r, 'd').components.volume === 0, 'volume : le plus petit = 0');
  ok(get(r, 'b').components.volume === 33.3 || get(r, 'b').components.volume === 33.4, 'volume : rang du milieu');
  ok(get(r, 'b').components.payment === null && get(r, 'b').score !== null && get(r, 'b').score! >= 0, 'client sans facture : ponctualité non calculée, poids recalculés (score sur les 2 autres parties)');
  // un client récent n'est pas pénalisé pour les mois avant son arrivée
  const rec = run([cl('a'), cl('b'), cl('c')], [mis('a', '2026-10-05'), mis('a', '2026-10-06'), mis('b', '2026-10-05'), mis('c', '2026-10-05')], [], []);
  ok(get(rec, 'a').components.regularity === 100 && get(rec, 'a').window_months === 1, 'client arrivé ce mois-ci : régularité calculée sur 1 mois, pas sur 6');
  // un client qui a commandé il y a 5 mois puis plus rien
  const gap = run([cl('a'), cl('b'), cl('c')], [mis('a', '2026-05-20'), mis('b', '2026-10-05'), mis('c', '2026-10-05')], [], []);
  ok(get(gap, 'a').active_months === 1 && get(gap, 'a').window_months === 6 && get(gap, 'a').components.regularity === 16.7, 'régularité : 1 mois actif sur 6 = 16,7');
  // une seule composante : pas de score
  const solo = run([cl('a')], [mis('a', '2026-10-05')], [], []);
  ok(get(solo, 'a').score === null && get(solo, 'a').components.regularity === 100, 'une seule composante calculable : pas de score');
  // facture en retard compte comme « pas à temps »
  const late = run([cl('a')], [mis('a', '2026-10-05')], [inv('1', 'a', '2026-08-01', '2026-08-31', 100), inv('2', 'a', '2026-08-01', '2026-08-31', 100), inv('3', 'a', '2026-08-01', '2026-08-31', 100)], [pay('1', '2026-08-30', 100), pay('2', '2026-08-30', 100)]);
  ok(get(late, 'a').components.payment === 66.7, 'ponctualité : 2 à temps + 1 en retard non soldée = 66,7');
}
// ---------- ex æquo, clients archivés, volume sans assez de clients ----------
{
  ok(percentRank(10, [10, 10, 10]) === 50 && percentRank(5, [5, 10]) === 0 && percentRank(10, [5, 10]) === 100 && percentRank(5, [5]) === null && percentRank(5, []) === null, 'rang : ex æquo = rang moyen, 0 ou 1 valeur = pas de rang');
  const r = run([cl('a'), cl('b')], [mis('a', '2026-10-01', 100), mis('b', '2026-10-01', 100)], [], []);
  ok(get(r, 'a').components.volume === null, 'volume : moins de 3 clients avec du chiffre d\'affaires = non comparé');
  const arch = run([{ id: 'x', name: 'X', active: false }, cl('y')], [], [inv('1', 'x', '2026-01-01', '2026-02-01', 100), inv('2', 'y', '2026-01-01', '2026-02-01', 100)], []);
  const watch = clientsToWatch(arch);
  ok(watch.length === 1 && watch[0].id === 'y' && get(arch, 'x').attention.length === 1, 'clients à suivre : les archivés sont laissés de côté');
}
// ---------- tri et alerte ----------
{
  const clients = [cl('a', 'Alpha'), cl('b', 'Bravo'), cl('c', 'Charlie')];
  const invs = [
    inv('1', 'a', '2026-06-01', '2026-06-30', 100), inv('2', 'a', '2026-06-01', '2026-06-30', 100), inv('3', 'a', '2026-06-01', '2026-06-30', 100), // Alpha : lent
    inv('4', 'b', '2026-06-01', '2026-06-30', 100), // Bravo : 115 jours de retard
    inv('5', 'c', '2026-08-01', '2026-08-30', 100), // Charlie : 54 jours : pas encore à surveiller
  ];
  const cash = [pay('1', '2026-07-20', 100), pay('2', '2026-07-20', 100), pay('3', '2026-07-20', 100)];
  const r = run(clients, [], invs, cash);
  const w = clientsToWatch(r);
  ok(w.map(p => p.id).join() === 'b,a', 'clients à suivre : « à surveiller » avant « payeur lent »');
  const al = clientBadgeAlert(r)!;
  ok(al.level === 'danger' && al.fr.includes('1 client à surveiller') && al.fr.includes('1 payeur lent') && al.en.includes('1 client to watch') && al.en.includes('1 slow payer'), 'alerte : 1 à surveiller + 1 payeur lent, FR et EN');
  const none = run([cl('a')], [], [], []);
  ok(clientBadgeAlert(none) === null, 'alerte : rien à signaler = pas d\'alerte');
  const slowOnly = run([cl('a')], [], invs.slice(0, 3), cash);
  ok(clientBadgeAlert(slowOnly)!.level === 'warn', 'alerte : seulement des payeurs lents = niveau « warn »');
}
// ---------- réglages ----------
{
  const d = CLIENT_BADGE_DEFAULTS;
  ok(JSON.stringify(cleanClientBadgeConfig(undefined)) === JSON.stringify(d) && JSON.stringify(cleanClientBadgeConfig('x')) === JSON.stringify(d), 'réglages : rien ou n\'importe quoi = valeurs de départ');
  ok(cleanClientBadgeConfig({ watch_days: 90 }).watch_days === 90 && cleanClientBadgeConfig({ watch_days: -1 }).watch_days === 60 && cleanClientBadgeConfig({ watch_days: NaN }).watch_days === 60, 'réglages : valeur valide gardée, absurde = départ');
  ok(cleanClientBadgeConfig({ weights: { regularity: 0, payment: 0, volume: 0 } }).weights.payment === 35, 'réglages : poids tous à 0 = départ');
  const invs = [inv('1', 'a', '2026-07-01', '2026-07-20', 100)]; // 95 jours
  ok(ids(run([cl('a')], [], invs, [], { watch_days: 120 }), 'a') === '' && ids(run([cl('a')], [], invs, [], { watch_days: 30 }), 'a') === 'watch', 'réglage « jours avant à surveiller » : change le résultat');
}
// ---------- passage d'année, aucun NaN, données non modifiées ----------
{
  const r = run([cl('a')], [mis('a', '2026-01-05'), mis('a', '2025-12-20')], [inv('1', 'a', '2025-12-01', '2025-12-31', 100)], [pay('1', '2026-01-02', 100)], undefined, '2026-01-10');
  ok(get(r, 'a').window_months >= 2 && get(r, 'a').payment.paid === 1 && !bad(r.clients.get('a')), 'passage d\'année : mois et paiements justes, aucun NaN');
  const clients = [cl('a')], invs = [inv('1', 'a', '2026-07-01', '2026-07-20', 100)], cash = [pay('1', '2026-07-25', 40)], missions = [mis('a', '2026-10-01')];
  const snap = JSON.stringify([clients, invs, cash, missions]);
  run(clients, missions, invs, cash);
  ok(JSON.stringify([clients, invs, cash, missions]) === snap, 'les données ne sont jamais modifiées par le calcul');
  const junk = run([cl('a')], [{ client_id: 'a', date: 'n/a', price_ar: NaN } as any, null as any], [null as any, { id: 'x' } as any], [null as any, { kind: 'in' } as any]);
  ok(!bad(junk.clients.get('a')), 'données cassées (null, dates fausses, NaN) : pas de plantage ni de NaN');
}
// ---------- vitesse ----------
{
  const clients = Array.from({ length: 500 }, (_, i) => cl(`c${i}`));
  const missions: ClientMission[] = [];
  for (let i = 0; i < 20000; i++) missions.push(mis(`c${i % 500}`, `2026-${String(1 + (i % 10)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, 10000 + (i % 7) * 1000));
  const invs = Array.from({ length: 3000 }, (_, i) => inv(`i${i}`, `c${i % 500}`, '2026-06-01', '2026-06-30', 100000));
  const cash = Array.from({ length: 2000 }, (_, i) => pay(`i${i}`, '2026-07-05', 100000));
  const t0 = Date.now();
  const r = run(clients, missions, invs, cash);
  const ms = Date.now() - t0;
  ok(r.clients.size === 500 && ms < 1500, `500 clients, 20 000 missions, 3 000 factures : ${ms} ms (< 1,5 s)`);
}
console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
