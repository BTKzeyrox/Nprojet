// Types de travail, modes de paie et modèles d'entreprise (module 25, M25.2) : règles pures, sans réseau. Cas normaux ET cas piégés.
import { readFileSync } from 'node:fs';
import {
  MEASURES, PAY_MODES, ENTRY_BY, MEASURE_LABEL, PAY_LABEL, ENTRY_LABEL, PRESENCE_LABEL, DEFAULT_PAY_MODE, isMeasure, isPayMode, isEntryBy,
  MAX_QTY, MAX_RATE_AR, cleanNumber, cleanQty, cleanRate, cleanTime, hoursBetween, dayFraction, PRESENCE_VALUES, acceptedPieces, payAmount, resolvePayMode,
  compatible, validateWorkType, describeWorkType, BUSINESS_MODELS, findModel,
} from '../src/utils/workTypes';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const noAccent = (s: string) => !/[àâçéèêëîïôùûœ]/i.test(s);

// ---------- Listes et étiquettes ----------
ok(MEASURES.length === 5 && PAY_MODES.length === 5 && ENTRY_BY.length === 4, '5 façons de mesurer, 5 modes de paie, 4 façons de saisir');
ok(MEASURES.every(m => MEASURE_LABEL[m].fr && MEASURE_LABEL[m].en && noAccent(MEASURE_LABEL[m].en)) && PAY_MODES.every(m => PAY_LABEL[m].fr && PAY_LABEL[m].en && noAccent(PAY_LABEL[m].en)) && ENTRY_BY.every(m => ENTRY_LABEL[m].fr && ENTRY_LABEL[m].en && noAccent(ENTRY_LABEL[m].en)) && PRESENCE_VALUES.every(p => PRESENCE_LABEL[p].fr && noAccent(PRESENCE_LABEL[p].en)), 'toutes les étiquettes existent en FR et EN (l\'anglais sans accent)');
ok(DEFAULT_PAY_MODE === 'mission', 'le mode par défaut est « par mission » : ce qui existe aujourd\'hui ne change pas');
ok(isMeasure('proof') && !isMeasure('x') && !isMeasure(null) && !isMeasure(undefined) && !isMeasure(3) && isPayMode('piece') && !isPayMode('Piece') && !isPayMode('') && isEntryBy('paper') && !isEntryBy('boss') && !isEntryBy({}), 'les listes refusent les valeurs inconnues, vides, de mauvaise casse ou de mauvais type');

// ---------- Lire un nombre tapé ----------
ok(cleanQty(12) === 12 && cleanQty('12') === 12 && cleanQty('12 500') === 12500 && cleanQty('12\u00a0500') === 12500 && cleanQty('12\u202f500') === 12500 && cleanQty('12,5') === 12.5 && cleanQty('12.5') === 12.5 && cleanQty(0) === 0 && cleanQty('0') === 0, 'quantité : 12, « 12 500 », virgule ou point décimal, zéro accepté');
ok(cleanQty('12,567') === null && cleanQty('1,000') === null && cleanQty('12.') === null && cleanQty('.5') === null, 'quantité : plus de 2 décimales ou écriture ambiguë refusée (jamais deviné)');
ok(cleanQty('-1') === null && cleanQty(-1) === null && cleanQty('abc') === null && cleanQty('') === null && cleanQty(' ') === null && cleanQty('1e3') === null && cleanQty('0x10') === null && cleanQty(NaN) === null && cleanQty(Infinity) === null && cleanQty(-Infinity) === null && cleanQty(null) === null && cleanQty(undefined) === null && cleanQty({}) === null && cleanQty([5]) === null && cleanQty(true) === null, 'quantité : négatif, texte, vide, « 1e3 », hexadécimal, NaN, infini, objet, tableau, booléen = refusés');
ok(cleanQty(MAX_QTY) === MAX_QTY && cleanQty(MAX_QTY + 1) === null && cleanQty('1000000000000') === null && cleanQty(Number.MAX_SAFE_INTEGER) === null, 'quantité : le maximum passe, au-dessus = refusé (faute de frappe)');
ok(cleanRate('50') === 50 && cleanRate('50,5') === 50.5 && cleanRate(MAX_RATE_AR) === MAX_RATE_AR && cleanRate(MAX_RATE_AR + 1) === null && cleanRate('-5') === null && cleanRate('cinquante') === null, 'tarif : 50, 50,5 acceptés ; trop grand, négatif ou texte refusés');
ok(cleanNumber(0.1 + 0.2, 10) === 0.3, 'arrondi à 2 décimales (pas de 0,30000000000000004)');

// ---------- Heures ----------
ok(cleanTime('08:30') === '08:30' && cleanTime('08:30:15') === '08:30' && cleanTime('24:00') === null && cleanTime('8:30') === null && cleanTime('08:60') === null && cleanTime('') === null && cleanTime(null) === null && cleanTime(830) === null, 'heure : HH:MM ou HH:MM:SS ; 24:00, 8:30, 08:60, vide, nombre refusés');
ok(hoursBetween('08:00', '16:30') === 8.5 && hoursBetween('08:00:00', '12:15:00') === 4.25 && hoursBetween('00:00', '23:59') === 23.98, 'heures : 8 h 30, 4 h 15, presque 24 h');
ok(hoursBetween('22:00', '06:00') === 8 && hoursBetween('23:30', '00:15') === 0.75, 'heures : le travail de nuit passe minuit (22 h → 6 h = 8 h)');
ok(hoursBetween('08:00', '08:00') === 0, 'heures : début = fin = 0 h, jamais 24 h');
ok(hoursBetween('', '08:00') === null && hoursBetween('08:00', 'x') === null && hoursBetween(null, null) === null && hoursBetween(undefined, '10:00') === null && hoursBetween('25:00', '10:00') === null, 'heures : une heure fausse ou absente = null');

// ---------- Présence ----------
ok(dayFraction('present') === 1 && dayFraction('late') === 1 && dayFraction('half') === 0.5 && dayFraction('absent') === 0, 'présence : présent 1, en retard 1, demi-journée 0,5, absent 0');
ok(dayFraction('inconnu') === 0 && dayFraction(null) === 0 && dayFraction(undefined) === 0 && dayFraction(1) === 0 && dayFraction('') === 0 && dayFraction('Present') === 0, 'présence : valeur inconnue = 0 (jamais de paie inventée)');

// ---------- Pièces ----------
ok(acceptedPieces(100, 5) === 95 && acceptedPieces(100, 0) === 100 && acceptedPieces(100, 100) === 0 && acceptedPieces(100, 150) === 0 && acceptedPieces(0, 5) === 0, 'pièces payées = faites − refusées ; on ne peut pas refuser plus que fait');
ok(acceptedPieces(-5, 0) === 0 && acceptedPieces(NaN, 1) === 0 && acceptedPieces('12' as any, 0) === 0 && acceptedPieces(null, null) === 0 && acceptedPieces(100, -5) === 100 && acceptedPieces(undefined, undefined) === 0, 'pièces : négatif, NaN, texte, vide = 0 payé ; refus négatif ignoré');

// ---------- Montants ----------
ok(payAmount('mission', 5000, { missions: 3 }) === 15000 && payAmount('day', 12000, { days: 2.5 }) === 30000 && payAmount('hour', 2500, { hours: 8.5 }) === 21250 && payAmount('piece', 150, { pieces: 200, rejected: 10 }) === 28500 && payAmount('fixed', 400000, { periodShare: 1 }) === 400000 && payAmount('fixed', 400000, { periodShare: 0.5 }) === 200000, 'montants : par mission, jour (2,5), heure (8,5), pièce (200 − 10 refusées), salaire fixe (mois et quinzaine)');
ok(payAmount('piece', 150, { pieces: 200, missions: 99, days: 99, hours: 99, periodShare: 99 }) === 30000, 'montant : seul le compteur du mode choisi compte (les autres sont ignorés)');
ok(payAmount('piece', 33.33, { pieces: 3 }) === 100 && payAmount('piece', 0.5, { pieces: 3 }) === 2 && payAmount('hour', 1000, { hours: 0.333 }) === 333, 'montant : arrondi à l\'Ar');
ok(payAmount('piece', -5, { pieces: 10 }) === 0 && payAmount('piece', NaN, { pieces: 10 }) === 0 && payAmount('piece', Infinity, { pieces: 10 }) === 0 && payAmount('piece', '150' as any, { pieces: 10 }) === 0 && payAmount('piece', undefined, { pieces: 10 }) === 0 && payAmount('piece', null, { pieces: 10 }) === 0 && payAmount('piece', MAX_RATE_AR + 1, { pieces: 1 }) === 0, 'montant : tarif négatif, NaN, infini, texte, vide ou absurde = 0');
ok(payAmount('mission', 5000, {}) === 0 && payAmount('day', 5000, { days: -1 }) === 0 && payAmount('hour', 5000, { hours: NaN }) === 0 && payAmount('piece', 5000, { pieces: Infinity }) === 0 && payAmount('fixed', 5000, { periodShare: -1 }) === 0, 'montant : compteur absent, négatif, NaN ou infini = 0');
ok(payAmount('piece', MAX_RATE_AR, { pieces: MAX_QTY }) === Math.round(MAX_RATE_AR * MAX_QTY) && Number.isFinite(payAmount('piece', MAX_RATE_AR, { pieces: MAX_QTY })), 'montant : les plus gros nombres permis restent des nombres exacts (pas de NaN, pas d\'infini)');
ok(Object.is(payAmount('mission', 0, { missions: 5 }), 0) && Object.is(payAmount('piece', 150, { pieces: 0 }), 0), 'montant : zéro reste 0 (jamais -0)');
// Le mode « par mission » égale ce que fait le site aujourd'hui : prix fixe × missions validées
ok([0, 1, 7, 120].every(k => payAmount('mission', 1000, { missions: k }) === k * 1000), 'par mission : identique à aujourd\'hui (prix fixe × nombre de missions validées)');

// ---------- Mode de paie d'un employé ----------
ok(resolvePayMode('piece', 'day') === 'piece' && resolvePayMode(undefined, 'day') === 'day' && resolvePayMode(null, null) === 'mission' && resolvePayMode('nimporte', 'quoi') === 'mission' && resolvePayMode('', 'hour') === 'hour' && resolvePayMode('nimporte', 'fixed') === 'fixed', 'mode d\'un employé : le sien, sinon celui de l\'entreprise, sinon « par mission » ; valeurs fausses ignorées');

// ---------- Ce qui va ensemble ----------
ok(compatible('quantity', 'piece') && compatible('presence', 'day') && compatible('presence', 'hour') && compatible('proof', 'mission') && compatible('tasks', 'mission') && compatible('none', 'fixed') && compatible('presence', 'fixed') && compatible('quantity', 'fixed'), 'compatibles : quantité↔pièce, présence↔jour/heure, preuves ou tâches↔mission, salaire fixe avec tout');
ok(!compatible('proof', 'piece') && !compatible('presence', 'piece') && !compatible('quantity', 'day') && !compatible('quantity', 'hour') && !compatible('none', 'mission') && !compatible('none', 'day') && !compatible('quantity', 'mission'), 'incompatibles : payer à la pièce sans quantité, au jour sans présence, à la mission sans preuves ni tâches');
ok(MEASURES.every(m => PAY_MODES.some(p => compatible(m, p))) && PAY_MODES.every(p => MEASURES.some(m => compatible(m, p))), 'chaque mesure a au moins un mode de paie, et chaque mode de paie au moins une mesure');

// ---------- Créer un type de travail ----------
const good = { id: 'choco', name: { fr: '  Chocolats  ', en: 'Chocolates' }, measure: 'quantity', pay: 'piece', entry: ['team_lead', 'paper', 'paper'], unit: { fr: 'boîte', en: 'box' } };
const v = validateWorkType(good);
ok(v.ok && v.value.name.fr === 'Chocolats' && v.value.entry.join() === 'team_lead,paper' && v.value.unit!.fr === 'boîte', 'type valide : nom nettoyé, doublons de saisie enlevés, unité gardée');
const bad = (patch: any, err: string) => { const r = validateWorkType({ ...good, ...patch }); return !r.ok && (r as any).error === err; };
ok(bad({ id: 'Choco' }, 'id') && bad({ id: '1a' }, 'id') && bad({ id: 'a' }, 'id') && bad({ id: '' }, 'id') && bad({ id: 'a'.repeat(40) }, 'id') && bad({ id: 'a b' }, 'id') && bad({ id: undefined }, 'id') && bad({ id: 5 }, 'id'), 'type : identifiant refusé (majuscule, chiffre au début, trop court, trop long, espace, vide, absent, nombre)');
ok(bad({ name: { fr: '', en: 'x' } }, 'name') && bad({ name: { fr: 'x', en: '  ' } }, 'name') && bad({ name: undefined }, 'name') && bad({ name: 'Chocolats' }, 'name'), 'type : nom vide ou dans une seule langue = refusé');
ok(bad({ measure: 'x' }, 'measure') && bad({ measure: undefined }, 'measure') && bad({ pay: 'x' }, 'pay') && bad({ pay: null }, 'pay'), 'type : mesure ou paie inconnue refusée');
ok(bad({ entry: [] }, 'entry') && bad({ entry: ['boss'] }, 'entry') && bad({ entry: 'admin' }, 'entry') && bad({ entry: undefined }, 'entry') && bad({ entry: [1, 2] }, 'entry'), 'type : « qui saisit » vide, inconnu ou mal écrit = refusé');
ok(bad({ measure: 'proof' }, 'incompatible') && bad({ pay: 'day' }, 'incompatible'), 'type : quantité payée au jour, ou preuves payées à la pièce = refusé (incompatible)');
ok(bad({ unit: undefined }, 'unit') && bad({ unit: { fr: 'boîte', en: '' } }, 'unit') && bad({ unit: { fr: '', en: 'box' } }, 'unit'), 'type : une quantité ou un prix à la pièce demande une unité dans les 2 langues');
ok(validateWorkType(null).ok === false && validateWorkType(undefined).ok === false && validateWorkType('x').ok === false && validateWorkType(5).ok === false && validateWorkType([]).ok === false, 'type : rien, texte, nombre ou tableau = refusé sans plantage');
const noUnit = validateWorkType({ id: 'jour', name: { fr: 'Journée', en: 'Day' }, measure: 'presence', pay: 'day', entry: ['admin'] });
ok(noUnit.ok && noUnit.value.unit === undefined, 'type sans quantité : pas d\'unité demandée ni gardée');
const dirty = validateWorkType({ ...good, name: { fr: 'A\u0000B\n\tC', en: 'x'.repeat(200) }, unit: { fr: 'u'.repeat(50), en: 'b' } });
ok(dirty.ok && dirty.value.name.fr === 'A B C' && dirty.value.name.en.length === 60 && dirty.value.unit!.fr.length === 20, 'type : caractères de contrôle remplacés par des espaces, textes coupés à 60 et 20');
ok(validateWorkType({ ...good, name: { fr: '<b>x</b>', en: '{{y}}' } }).ok, 'type : balises et accolades gardées telles quelles (le texte est toujours affiché comme du texte)');

// ---------- Phrase pour l'écran ----------
const d = describeWorkType(v.ok ? v.value : (null as any));
ok(d.fr === 'Mesuré par la quantité produite (boîte), payé par boîte ou pièce, saisi par le chef d\'équipe ou une feuille papier, saisie ensuite.' && d.en === 'Measured by the quantity produced (box), paid per box or piece, entered by the team lead or a paper sheet, entered afterwards.', 'phrase : « Mesuré par la quantité produite (boîte), payé par boîte ou pièce, saisi par… » en FR et EN');

// ---------- Modèles d'entreprise ----------
ok(BUSINESS_MODELS.length === 9 && new Set(BUSINESS_MODELS.map(m => m.id)).size === 9 && BUSINESS_MODELS.every(m => m.name.fr && m.name.en && m.about.fr && m.about.en && m.work.fr && m.work.en && noAccent(m.name.en) && noAccent(m.about.en.replace(/'/g, '')) && noAccent(m.work.en)), '9 modèles d\'entreprise, tous avec nom, description et mot de travail en FR et EN');
ok(BUSINESS_MODELS.every(m => m.types.every(t => { const r = validateWorkType(t); return r.ok; })), 'tous les types des modèles passent la vérification (aucun modèle n\'est incohérent)');
ok(BUSINESS_MODELS.every(m => new Set(m.types.map(t => t.id)).size === m.types.length) && new Set(BUSINESS_MODELS.flatMap(m => m.types.map(t => t.id))).size === BUSINESS_MODELS.flatMap(m => m.types).length, 'aucun identifiant de type en double, ni dans un modèle ni entre modèles');
ok(findModel('other')!.types.length === 0 && BUSINESS_MODELS.filter(m => m.id !== 'other').every(m => m.types.length >= 1), '« Autre » commence sans type ; tous les autres en ont au moins un');
ok(findModel('workshop')!.types.some(t => t.pay === 'piece' && t.measure === 'quantity' && t.unit!.fr === 'boîte' && t.entry.includes('team_lead') && t.entry.includes('paper')), 'atelier / chocolaterie : paie à la boîte, quantité, saisie par le chef d\'équipe ou le papier (le cas de BTK)');
ok(findModel('security')!.types.length === 1 && findModel('security')!.types[0].measure === 'proof' && findModel('security')!.types[0].pay === 'mission' && findModel('security')!.types[0].entry.join() === 'employee', 'sécurité : exactement le fonctionnement d\'aujourd\'hui (preuves, par mission, l\'employé saisit)');
ok(findModel('shop')!.menu === 'boutique' && BUSINESS_MODELS.filter(m => m.menu === 'boutique').length === 1 && BUSINESS_MODELS.every(m => m.menu === 'full' || m.menu === 'boutique'), 'menu : seule la petite boutique propose le menu court ; les autres gardent le menu complet');
ok(findModel('nimporte') === undefined && findModel(undefined) === undefined && findModel(null) === undefined && findModel('') === undefined && findModel(5) === undefined, 'modèle inconnu = rien (pas de plantage)');
ok(BUSINESS_MODELS.flatMap(m => m.types).every(t => describeWorkType(t).fr.length > 20 && describeWorkType(t).en.length > 20 && noAccent(describeWorkType(t).en.replace(/'/g, ''))), 'chaque type de chaque modèle a une phrase claire FR et EN');
// ---------- Pureté ----------
const src = readFileSync('src/utils/workTypes.ts', 'utf8');
ok(!/fetch\(|XMLHttpRequest|import .*db\/store|localStorage|Date\.now\(\)|new Date\(\)|setTimeout|setInterval|Math\.random/.test(src), 'règles pures : aucun appel réseau, aucun accès aux données, aucune horloge, aucun hasard');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
