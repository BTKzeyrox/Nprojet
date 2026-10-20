// Contrôle des règles des clients (module 1) : statuts, chiffres, rattachement, prix à 5 niveaux. Sans écran, sans serveur.
// Lancer : npm run check:clients
import { addMonths, clientThresholds, normalizeName, paymentTermsDays, rankClients, summarizeClients, suggestClientMatches, CLIENT_THRESHOLDS_DEFAULT, type ClientMission, type ClientRecord } from '../src/utils/clients';
import { addDays } from '../src/utils/stats';
import { clientPriceWithClient } from '../src/utils/clientPrice';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };

const TODAY = '2026-10-20';
const d = (ago: number) => addDays(TODAY, -ago);
const cl = (id: string, extra: Partial<ClientRecord> = {}): ClientRecord => ({ id, name: id, ...extra });
const ms = (id: string, dates: string[], price = 1000): ClientMission[] => dates.map(date => ({ client_id: id, date, price_ar: price }));
const sum = (clients: ClientRecord[], missions: ClientMission[], thr = CLIENT_THRESHOLDS_DEFAULT, today = TODAY) => summarizeClients(clients, missions, today, thr);

// --- Mois et dates ---
eq(addMonths('2024-03-01', -6), '2023-09-01', 'il y a 6 mois : 1er mars 2024 -> 1er septembre 2023');
eq(addMonths('2024-08-31', -6), '2024-02-29', 'fin de mois : 31 août 2024 - 6 mois = 29 février 2024 (bissextile)');
eq(addMonths('2026-08-31', -6), '2026-02-28', 'fin de mois : 31 août 2026 - 6 mois = 28 février 2026');
eq(addMonths('2026-01-15', -1), '2025-12-15', 'changement d\'année : janvier - 1 mois = décembre');
eq(addMonths('2026-03-31', 1), '2026-04-30', '31 mars + 1 mois = 30 avril');
eq(addMonths('2026-12-31', 2), '2027-02-28', '31 décembre + 2 mois = 28 février');

// --- Statuts ---
eq(sum([cl('a')], []).get('a')!.statuses, ['prospect'], 'client sans mission = Prospect');
eq(sum([cl('a')], ms('a', [d(59)])).get('a')!.statuses, ['new'], 'première mission il y a 59 jours = Nouveau');
eq(sum([cl('a')], ms('a', [d(60)])).get('a')!.statuses, ['active'], 'première mission il y a 60 jours = plus Nouveau (statut neutre Actif)');
eq(sum([cl('a')], ms('a', [d(89)])).get('a')!.statuses.includes('inactive'), false, 'dernière mission il y a 89 jours = pas Inactif');
eq(sum([cl('a')], ms('a', [d(90)])).get('a')!.statuses, ['inactive'], 'dernière mission il y a 90 jours = Inactif');
eq(sum([cl('a')], ms('a', [d(5), d(40), d(90)])).get('a')!.statuses, ['regular'], '3 missions sur 6 mois = Régulier');
eq(sum([cl('a')], ms('a', [d(5), d(40)])).get('a')!.statuses.includes('regular'), false, '2 missions sur 6 mois = pas Régulier');
eq(sum([cl('a')], ms('a', ['2026-04-20', '2026-04-20', '2026-04-20'])).get('a')!.missions_window, 3, 'limite des 6 mois : le jour exact compte');
eq(sum([cl('a')], ms('a', ['2026-04-19', '2026-04-19', '2026-04-19'])).get('a')!.missions_window, 0, 'limite des 6 mois : la veille ne compte pas');
const rI = sum([cl('a')], ms('a', [d(100), d(101), d(102)])).get('a')!;
eq([rI.statuses, rI.main], [['inactive', 'regular'], 'inactive'], 'Régulier + Inactif : les deux s\'appliquent, l\'écran montre Inactif d\'abord');
eq(sum([cl('a')], ms('a', ['2024-02-29']), CLIENT_THRESHOLDS_DEFAULT, '2024-03-01').get('a')!.days_since_last, 1, 'année bissextile : 29 février -> 1er mars = 1 jour');
eq(sum([cl('a', { active: false })], []).get('a')!.archived, true, 'client archivé : indiqué sans changer son statut');
eq(sum([cl('a')], ms('a', [d(5)]), { ...CLIENT_THRESHOLDS_DEFAULT, new_days: 3 }).get('a')!.statuses, ['active'], 'seuil réglable : Nouveau = 3 jours');
eq(sum([cl('a')], ms('a', [d(5)]), { ...CLIENT_THRESHOLDS_DEFAULT, inactive_days: 5 }).get('a')!.statuses.includes('inactive'), true, 'seuil réglable : Inactif = 5 jours');

// --- Chiffres ---
const s1 = sum([cl('a'), cl('b')], [...ms('a', [d(10), d(400)], 500), ...ms('b', [d(10)], 9999)]).get('a')!;
eq([s1.missions_total, s1.revenue_total, s1.missions_12m, s1.revenue_12m], [2, 1000, 1, 500], 'chiffres : total et 12 derniers mois séparés, autre client ignoré');
eq(sum([cl('a')], [...ms('a', [d(-3)]), ...ms('zzz', [d(2)])]).get('a')!.missions_total, 0, 'mission future et client inconnu ignorés');
eq(sum([cl('a')], [{ client_id: 'a', date: d(3), price_ar: NaN }, { client_id: 'a', date: d(3), price_ar: -50 }, { client_id: 'a', date: d(3), price_ar: 1200.4 }]).get('a')!.revenue_total, 1200, 'prix invalide = 0, prix arrondi');
eq(sum([cl('a')], ms('a', ['2026-10-20'])).get('a')!.days_since_last, 0, 'mission d\'aujourd\'hui : 0 jour');

// --- Stratégique (top 20 %, au moins 5 missions, ex æquo) ---
const ten = Array.from({ length: 10 }, (_, i) => cl('c' + (i + 1)));
const five = (i: number, price: number) => ms('c' + i, [d(5), d(10), d(15), d(20), d(25)], price);
const mission10 = [...Array.from({ length: 10 }, (_, k) => five(k + 1, (k + 1) * 200)).flat()];
const strat = (map: Map<string, any>) => [...map.values()].filter(s => s.statuses.includes('strategic')).map(s => s.id).sort();
eq(strat(sum(ten, mission10)), ['c10', 'c9'], '10 clients : les 20 % premiers du chiffre d\'affaires (2) sont Stratégiques');
const c9short = [...mission10.filter(m => !(m.client_id === 'c9' && m.date === d(25)))].map(m => (m.client_id === 'c9' ? { ...m, price_ar: 2250 } : m));
eq(strat(sum(ten, c9short)), ['c10'], 'Stratégique demande au moins 5 missions (c9 en a 4)');
const tie = mission10.map(m => (m.client_id === 'c8' ? { ...m, price_ar: 1800 } : m)); // c8 = 5 x 1800 = 9000 = c9
eq(strat(sum(ten, tie)), ['c10', 'c8', 'c9'], 'ex æquo à la limite : tous les clients à égalité sont inclus');
eq(strat(sum([cl('x'), cl('y'), cl('z')], [...five(1, 1).map(m => ({ ...m, client_id: 'x', price_ar: 900 })), ...five(2, 1).map(m => ({ ...m, client_id: 'y', price_ar: 500 })), ...five(3, 1).map(m => ({ ...m, client_id: 'z', price_ar: 100 }))])), ['x'], '3 clients : le premier seulement (20 % de 3 arrondi vers le haut = 1)');
eq(strat(sum([cl('x')], ms('x', [d(1), d(2), d(3), d(4), d(5)]))), ['x'], 'un seul client avec assez de missions : Stratégique');
eq(strat(sum([cl('x')], ms('x', [d(1), d(2), d(3), d(4), d(5)], 0))), [], 'chiffre d\'affaires à zéro : jamais Stratégique');
const rich = sum(ten, mission10).get('c10')!;
eq([rich.statuses, rich.main], [['strategic', 'regular', 'new'], 'strategic'], 'Stratégique + Régulier + Nouveau (première mission il y a 25 jours) : l\'écran montre Stratégique');
eq(strat(sum(ten, [...mission10, ...ms('c1', [d(400), d(401), d(402), d(403), d(404), d(405)], 999999)])), ['c10', 'c9'], 'des missions de plus de 12 mois ne comptent pas pour Stratégique');

// --- Rattachement des anciennes missions ---
eq(normalizeName('  Société  ÉCHO, S.A.R.L. '), 'societe echo s a r l', 'nom comparable : accents, majuscules et ponctuation retirés');
const cs = [cl('1', { name: 'Société Écho' }), cl('2', { name: 'Alpha' }), cl('3', { name: 'ALPHA ' })];
eq(suggestClientMatches(['societe echo', 'Alpha', 'Inconnu', 'Alpha', ''], cs), [{ text: 'societe echo', client_id: '1', ambiguous: false }, { text: 'Alpha', client_id: null, ambiguous: true }, { text: 'Inconnu', client_id: null, ambiguous: false }], 'rattachement : un seul client, deux clients identiques (ambigu), inconnu ; doublons et vides retirés');

// --- Échéance ---
eq([paymentTermsDays({ payment_terms_days: 45 }, 30), paymentTermsDays({}, 30), paymentTermsDays(undefined, 30), paymentTermsDays({ payment_terms_days: -1 }, 30), paymentTermsDays({}, NaN)], [45, 30, 30, 30, 0], 'échéance : celle du client, sinon celle des Conditions, jamais invalide');

// --- Classement ---
const rk = rankClients([cl('p'), cl('b'), cl('a'), cl('i')], new Map([['p', { main: 'prospect', revenue_12m: 0 }], ['b', { main: 'regular', revenue_12m: 100 }], ['a', { main: 'regular', revenue_12m: 100 }], ['i', { main: 'inactive', revenue_12m: 0 }]] as any));
eq(rk.map(c => c.id), ['i', 'a', 'b', 'p'], 'classement : Inactif d\'abord, puis Régulier (à égalité : par nom), puis Prospect');

// --- Règle de prix à 5 niveaux ---
const S = { client_price_default_ar: 100, client_prices_by_type: { SAISIE: 200 } } as any;
const C = { price_default_ar: 300, price_by_type: { SAISIE: 400 } };
eq(clientPriceWithClient({ client_price_ar: 500, post_type: 'SAISIE' }, C, S), 500, 'prix 1 : celui de la mission gagne sur tout');
eq(clientPriceWithClient({ post_type: 'SAISIE' }, C, S), 400, 'prix 2 : celui du client pour ce type');
eq(clientPriceWithClient({ post_type: 'WEB' }, C, S), 300, 'prix 3 : celui du client par défaut');
eq(clientPriceWithClient({ post_type: 'SAISIE' }, { price_default_ar: undefined }, S), 200, 'prix 4 : celui du type dans les Réglages');
eq(clientPriceWithClient({ post_type: 'WEB' }, undefined, S), 100, 'prix 5 : prix par défaut des Réglages');
eq(clientPriceWithClient({ post_type: 'WEB' }, undefined, {} as any), 0, 'aucun prix réglé : 0');
eq(clientPriceWithClient({ client_price_ar: 0 }, C, S), 0, '0 est un vrai prix (mission offerte)');
eq(clientPriceWithClient({ client_price_ar: NaN, post_type: 'SAISIE' }, { price_by_type: { SAISIE: -5 }, price_default_ar: NaN }, S), 200, 'prix invalides (NaN, négatif) ignorés : on passe au niveau suivant');
eq(clientPriceWithClient({ client_price_ar: 99.6 }, undefined, S), 100, 'prix arrondi à l\'Ar');

// --- Seuils venant de la page Conditions ---
eq(clientThresholds(undefined), CLIENT_THRESHOLDS_DEFAULT, 'seuils : rien reçu = valeurs de départ');
eq(clientThresholds({}), CLIENT_THRESHOLDS_DEFAULT, 'seuils : section absente = valeurs de départ');
eq(clientThresholds({ clients: { new_days: 30, inactive_days: 120 } }).new_days, 30, 'seuils : valeur réglée gardée');
eq(clientThresholds({ clients: { new_days: 30, inactive_days: 120 } }).regular_missions, 3, 'seuils : valeur non réglée = valeur de départ');
eq(clientThresholds({ clients: { new_days: 0, regular_months: -2, inactive_days: NaN } as any }), CLIENT_THRESHOLDS_DEFAULT, 'seuils : 0, négatif ou NaN refusés (valeurs de départ)');
eq(clientThresholds({ clients: { new_days: '30' } as any }).new_days, 60, 'seuils : un texte n\'est pas un nombre (valeur de départ)');
eq(clientThresholds({ clients: { new_days: 30.6 } }).new_days, 31, 'seuils : arrondi au jour');
{
  // un seuil réglé change vraiment le statut : 70 jours depuis la première mission = « Actif » avec 60 j, « Nouveau » avec 90 j
  const one = [cl('a')], list = ms('a', [d(70)]);
  eq([sum(one, list).get('a')!.main, sum(one, list, clientThresholds({ clients: { new_days: 90 } })).get('a')!.main], ['active', 'new'], 'seuils : changer « Nouveau » à 90 jours change le statut');
}

// --- Pureté et vitesse ---
const frozen = Object.freeze([Object.freeze(cl('a'))]) as ClientRecord[];
let threw = false; try { sum(frozen, Object.freeze(ms('a', [d(3)])) as ClientMission[]); } catch { threw = true; }
eq(threw, false, 'les données reçues ne sont jamais modifiées');
const many = Array.from({ length: 2000 }, (_, i) => cl('k' + i));
const lots: ClientMission[] = Array.from({ length: 40000 }, (_, i) => ({ client_id: 'k' + (i % 2000), date: d(i % 700), price_ar: 1000 + (i % 7) * 500 }));
const t0 = Date.now(); const big = sum(many, lots); const ms1 = Date.now() - t0;
eq([big.size, ms1 < 400], [2000, true], `2 000 clients et 40 000 missions : calculé en ${ms1} ms (moins de 400 ms)`);

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
