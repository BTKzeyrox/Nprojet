// Contrôle du moteur d'alertes (module 11, étape M11.2) : format, identifiants stables, doublons, tri, règle qui plante, états par page, Ignorer / Vérifié, seuils.
// Pur, sans réseau. Lancer : npm run check:health
import { alertId, alertProblem, applyAcks, cleanAck, countsByPage, hasEnough, pageStates, runHealth, sortAlerts, type HealthContext, type HealthRule } from '../src/utils/health/registry';
import { HEALTH_PAGES, HEALTH_THRESHOLDS_DEFAULT, healthThresholds, severityRank, type HealthAck, type HealthAlert } from '../src/utils/health/types';

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };

const mk = (over: Partial<HealthAlert> = {}): HealthAlert => ({
  id: 'team:late:demo_u1', page: 'team', rule: 'late', severity: 'watch',
  title_fr: 'Camille Durand est souvent en retard', title_en: 'Camille Durand is often late',
  why_fr: '3 retards en 7 jours', why_en: '3 late arrivals in 7 days',
  todo_fr: 'Parler avec Camille', todo_en: 'Talk to Camille',
  since: '2026-10-14', value: 3, go: { view: 'calendar' }, ...over,
});
const ctx = (): HealthContext => ({ today: '2026-10-21', now: Date.parse('2026-10-21T08:00:00Z'), users: [], posts: [], contracts: [], clients: [], cash: [], products: [], moves: [], advances: [], settings: {}, thresholds: HEALTH_THRESHOLDS_DEFAULT });
const rule = (id: string, page: HealthRule['page'], list: HealthAlert[] | (() => HealthAlert[])): HealthRule => ({ id, page, run: typeof list === 'function' ? list : () => list });

// ---------- identifiants stables ----------
ok(alertId('team', 'late', 'demo_u1') === 'team:late:demo_u1', 'alertId : page + règle + sujet');
ok(alertId('stock', 'low') === 'stock:low', 'alertId : sans sujet');
ok(alertId('finance', 'Trésorerie basse', 'Éléphant & Co') === 'finance:tresorerie-basse:elephant-co', 'alertId : accents, majuscules et signes nettoyés');
ok(alertId('team', 'late', 'demo_u1') === alertId('team', 'late', 'demo_u1') && alertId('team', 'late', 'demo_u1') !== alertId('team', 'late', 'demo_u2'), 'alertId : même entrée = même identifiant, sujets différents = identifiants différents');
ok(alertId('clients', 'x', 'a'.repeat(200)).length <= 'clients:x:'.length + 40, 'alertId : sujet très long coupé');
ok(alertId('team', 'late', 42) === 'team:late:42', 'alertId : sujet numérique');
let threw = 0; for (const f of [() => alertId('nope' as any, 'x'), () => alertId('team', ''), () => alertId('team', '***')]) { try { f(); } catch { threw++; } }
ok(threw === 3, 'alertId : page inconnue ou règle vide = erreur claire');
ok(alertProblem(mk({ id: alertId('team', 'late', 'demo_u1') })) === null, 'une alerte construite avec alertId est valide');

// ---------- format ----------
ok(alertProblem(mk()) === null, 'alerte complète : valide');
ok(alertProblem(mk({ todo_fr: undefined, todo_en: undefined, since: null, value: undefined })) === null, 'conseil, date et mesure facultatifs');
const cases: [string, Partial<HealthAlert>][] = [
  ['identifiant sans page', { id: 'late' }], ['identifiant d\'une autre page', { id: 'stock:late:x' }], ['majuscules dans l\'identifiant', { id: 'team:Late:x' }],
  ['page inconnue', { page: 'zzz' as any }], ['gravité inconnue', { severity: 'grave' as any }],
  ['titre vide', { title_fr: '  ' }], ['explication anglaise absente', { why_en: '' }], ['texte avec NaN', { why_fr: 'perte de NaN Ar' }],
  ['texte avec undefined', { title_en: 'Client undefined' }], ['texte avec null', { why_en: 'value null' }], ['[object', { title_fr: '[object Object]' }],
  ['titre trop long', { title_fr: 'x'.repeat(121) }], ['explication trop longue', { why_fr: 'x'.repeat(401) }],
  ['date fausse', { since: '21/10/2026' }], ['date impossible en texte libre', { since: 'hier' }], ['mesure NaN', { value: NaN }], ['mesure infinie', { value: Infinity }],
  ['pas de destination', { go: { view: '' } }], ['conseil vide', { todo_fr: ' ' }],
];
for (const [label, over] of cases) ok(alertProblem(mk(over)) !== null, `refusée : ${label}`);
ok(alertProblem(null) !== null && alertProblem('x') !== null && alertProblem(42) !== null && alertProblem(undefined) !== null, 'refusée : pas un objet');

// ---------- moteur ----------
const a1 = mk({ id: 'team:late:a', severity: 'watch', since: '2026-10-10' });
const a2 = mk({ id: 'stock:out:b', page: 'stock', rule: 'out', severity: 'urgent', since: '2026-10-20' });
const a3 = mk({ id: 'finance:low:c', page: 'finance', rule: 'low', severity: 'info', since: null });
const a4 = mk({ id: 'team:late:d', severity: 'watch', since: '2026-10-05' });
const a5 = mk({ id: 'team:late:e', severity: 'watch', since: null });
const run = runHealth(ctx(), [rule('r1', 'team', [a1, a4, a5]), rule('r2', 'stock', [a2]), rule('r3', 'finance', [a3])]);
ok(run.errors.length === 0 && run.alerts.length === 5, 'moteur : 5 alertes, aucune erreur');
ok(run.alerts[0].id === 'stock:out:b', 'tri : l\'urgent d\'abord');
ok(run.alerts.slice(1, 4).map(a => a.id).join() === 'team:late:d,team:late:a,team:late:e', 'tri : à gravité égale le plus ancien d\'abord, « depuis inconnu » à la fin');
ok(run.alerts[4].id === 'finance:low:c', 'tri : l\'info à la fin');
const run2 = runHealth(ctx(), [rule('r3', 'finance', [a3]), rule('r1', 'team', [a5, a4, a1]), rule('r2', 'stock', [a2])]);
ok(JSON.stringify(run.alerts) === JSON.stringify(run2.alerts), 'même résultat quel que soit l\'ordre des règles');
ok(new Set(run.alerts.map(a => a.id)).size === run.alerts.length, 'identifiants tous uniques');

const dup = runHealth(ctx(), [rule('r1', 'team', [mk({ id: 'team:late:x', severity: 'info' })]), rule('r2', 'team', [mk({ id: 'team:late:x', severity: 'urgent' })]), rule('r3', 'team', [mk({ id: 'team:late:x', severity: 'watch' })])]);
ok(dup.alerts.length === 1 && dup.alerts[0].severity === 'urgent', 'doublon : une seule alerte, la plus grave gagne');

const boom = runHealth(ctx(), [rule('plante', 'team', () => { throw new Error('boum'); }), rule('r2', 'stock', [a2])]);
ok(boom.alerts.length === 1 && boom.errors.length === 1 && boom.errors[0].rule === 'plante' && boom.errors[0].message === 'boum', 'une règle qui plante est notée et les autres continuent');
const nul = runHealth(ctx(), [rule('vide', 'team', () => null as any), rule('r2', 'stock', [a2])]);
ok(nul.alerts.length === 1 && nul.errors.length === 0, 'une règle qui rend null = aucune alerte');
const bad = runHealth(ctx(), [rule('r1', 'team', [mk({ id: 'team:late:ok' }), mk({ id: 'team:late:bad', why_fr: 'NaN' })])]);
ok(bad.alerts.length === 1 && bad.alerts[0].id === 'team:late:ok' && bad.errors.length === 1, 'une alerte invalide est refusée, la bonne reste');
const wrong = runHealth(ctx(), [rule('r1', 'team', [a2])]);
ok(wrong.alerts.length === 0 && wrong.errors.length === 1, 'une règle ne peut pas poser une alerte d\'une autre page');
ok(runHealth(ctx(), []).alerts.length === 0, 'aucune règle = aucune alerte');
const frozen = Object.freeze([a1]) as HealthAlert[]; sortAlerts(frozen); ok(frozen[0] === a1, 'le tri ne modifie pas la liste d\'origine');

// ---------- états par page ----------
const st = pageStates(run.alerts);
ok(st.stock === 'urgent' && st.team === 'watch' && st.finance === 'ok' && st.clients === 'ok', 'états : urgent, à voir, ok (une info ne change pas l\'état)');
ok(HEALTH_PAGES.every(p => ['ok', 'watch', 'urgent'].includes(st[p])), 'états : toutes les pages ont un état');
ok(pageStates([mk({ severity: 'watch' }), mk({ id: 'team:late:z', severity: 'urgent' })]).team === 'urgent', 'états : l\'urgent l\'emporte sur « à voir »');
const cnt = countsByPage(run.alerts);
ok(cnt.team?.watch === 3 && cnt.stock?.urgent === 1 && cnt.finance?.info === 1 && cnt.clients === undefined, 'compte par page et par gravité');

// ---------- Ignorer / Vérifié ----------
const ack = (over: Partial<HealthAck> = {}): HealthAck => ({ id: 'team:late:demo_u1', status: 'checked', reason: 'Vu avec Camille', at: '2026-10-21T06:00:00.000Z', severity_at: 'watch', value_at: 3, ...over });
const al = mk({ value: 3 });
ok(applyAcks([al], [ack()], '2026-10-21', 14).hidden.length === 1, 'Vérifié : l\'alerte est cachée');
ok(applyAcks([al], [ack({ status: 'ignored' })], '2026-10-21', 14).hidden.length === 1, 'Ignorer : l\'alerte est cachée');
ok(applyAcks([mk({ severity: 'urgent', value: 3 })], [ack()], '2026-10-21', 14).visible.length === 1, 'plus grave qu\'avant : l\'alerte revient');
ok(applyAcks([mk({ value: 5 })], [ack()], '2026-10-21', 14).visible.length === 1, 'la mesure a augmenté (3 → 5) : l\'alerte revient');
ok(applyAcks([mk({ value: 2 })], [ack()], '2026-10-21', 14).hidden.length === 1, 'la mesure a baissé : elle reste cachée');
ok(applyAcks([al], [ack({ status: 'ignored', until: '2026-10-25' })], '2026-10-24', 14).hidden.length === 1 && applyAcks([al], [ack({ status: 'ignored', until: '2026-10-25' })], '2026-10-25', 14).visible.length === 1, 'Ignorer jusqu\'au 25/10 : cachée jusqu\'à la veille, de retour le jour dit');
ok(applyAcks([al], [ack({ status: 'ignored' })], '2026-11-03', 14).hidden.length === 1 && applyAcks([al], [ack({ status: 'ignored' })], '2026-11-04', 14).visible.length === 1, 'Ignorer sans date : cachée 13 jours, de retour au 14e');
ok(applyAcks([al], [ack({ status: 'checked' })], '2027-06-01', 14).hidden.length === 1, 'Vérifié : reste caché sans limite de temps tant que rien n\'empire');
ok(applyAcks([al], [ack({ id: 'team:late:autre' })], '2026-10-21', 14).visible.length === 1, 'une marque d\'une autre alerte ne cache rien');
ok(applyAcks([al], [{ ...ack(), status: 'zzz' } as any, null as any, { id: 'x' } as any], '2026-10-21', 14).visible.length === 1, 'marques invalides : ignorées, rien n\'est caché');
const split = applyAcks(run.alerts, [ack({ id: 'stock:out:b', severity_at: 'urgent', value_at: undefined })], '2026-10-21', 14);
ok(split.hidden.length === 1 && split.visible.length === 4 && split.hidden[0].id === 'stock:out:b', 'cache une alerte sur cinq, garde l\'ordre des autres');
ok(cleanAck(ack({ reason: 'x'.repeat(500) }))!.reason.length === 200, 'raison coupée à 200 caractères');
ok(cleanAck(ack({ reason: '  vu  ' }))!.reason === 'vu', 'raison nettoyée');
ok(cleanAck(ack({ at: 'pas une date' })) === null && cleanAck(ack({ until: '25/10' })) === null && cleanAck(ack({ id: 'Mauvais Id' })) === null && cleanAck(ack({ severity_at: 'x' as any })) === null && cleanAck(ack({ value_at: NaN })) === null, 'marque refusée : date, « jusqu\'au », identifiant, gravité ou mesure faux');

// ---------- seuils et minimum de données ----------
ok(JSON.stringify(healthThresholds(null)) === JSON.stringify(HEALTH_THRESHOLDS_DEFAULT) && JSON.stringify(healthThresholds({})) === JSON.stringify(HEALTH_THRESHOLDS_DEFAULT), 'seuils : valeurs de départ si rien n\'est réglé');
const t = healthThresholds({ watch: { validate_hours: 48, late_count: 5.6, refusal_rate_pct: 0, min_periods: -3, ignore_days: NaN, late_window_days: 9999, absent_streak_days: '3' as any } });
ok(t.validate_hours === 48 && t.late_count === 6, 'seuils : valeurs valides prises (arrondies)');
ok(t.refusal_rate_pct === 30 && t.min_periods === 3 && t.ignore_days === 14 && t.late_window_days === 7 && t.absent_streak_days === 2, 'seuils : 0, négatif, NaN, trop grand ou texte = valeur de départ');
ok(Object.keys(HEALTH_THRESHOLDS_DEFAULT).every(k => (HEALTH_THRESHOLDS_DEFAULT as any)[k] >= 1), 'seuils de départ : tous au moins 1');
ok(hasEnough(10, 10) && !hasEnough(9, 10) && !hasEnough(NaN, 1) && !hasEnough(Infinity - Infinity, 1), 'minimum de données : 10 sur 10 suffit, 9 non, NaN non');
ok(severityRank('urgent') < severityRank('watch') && severityRank('watch') < severityRank('info'), 'gravité : urgent > à voir > info');

// ---------- vitesse ----------
const many: HealthRule[] = Array.from({ length: 200 }, (_, i) => rule(`r${i}`, HEALTH_PAGES[i % HEALTH_PAGES.length], () => Array.from({ length: 50 }, (_, k) => {
  const page = HEALTH_PAGES[i % HEALTH_PAGES.length];
  return mk({ id: alertId(page, `r${i}`, k), page, rule: `r${i}`, severity: (['info', 'watch', 'urgent'] as const)[k % 3], since: `2026-10-${String(1 + (k % 20)).padStart(2, '0')}` });
})));
const t0 = Date.now(); const big = runHealth(ctx(), many); const ms = Date.now() - t0;
ok(big.alerts.length === 10000 && big.errors.length === 0 && ms < 1500, `10 000 alertes triées en ${ms} ms (limite 1500 ms)`);

console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
