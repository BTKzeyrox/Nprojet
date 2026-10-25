// Contrôle des missions récurrentes (M15.1). Lancer : npm run check:recurring
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { buildContract, checkRecurring, cleanRecurring, describeRule, dueOccurrences, madagascarDate, nextRun, occurrenceId, runsOn, scheduledMs, RECURRING_LIMITS, type RecurringRule } from '../src/utils/recurring';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } };
const ok = (c: boolean, name: string) => eq(c, true, name);

const base = { id: 'rr-a', name: 'Rapport du matin', title: 'Rapport quotidien', frequency: 'daily', time: '08:00', start_date: '2026-10-01' };
const val = (d: any, others: RecurringRule[] = []) => checkRecurring(d, others);
const must = (d: any): RecurringRule => { const v = val(d); if (!v.ok) throw new Error('règle de test fausse : ' + JSON.stringify(d) + ' → ' + v.error); return v.value; };
const MS = (y: number, m: number, d: number, h: number, mi = 0) => Date.UTC(y, m - 1, d, h - 3, mi); // heure de Madagascar → millisecondes UTC

// ---- Saisie
{
  const v = val(base);
  eq(v.ok && v.value, { id: 'rr-a', name: 'Rapport du matin', title: 'Rapport quotidien', proof_mode: 'type', objective: 0, priority: 'Normale', frequency: 'daily', weekdays: [], month_day: 1, time: '08:00', start_date: '2026-10-01', active: true }, 'règle quotidienne : valeurs par défaut');
}
eq(val({ ...base, frequency: 'weekly', weekdays: [4, 1, 1] }).ok && (val({ ...base, frequency: 'weekly', weekdays: [4, 1, 1] }) as any).value.weekdays, [1, 4], 'semaine : jours triés, sans doublon');
eq(val({ ...base, frequency: 'monthly', month_day: 31 }).ok, true, 'mois : le 31 est accepté');
const bad = (d: any, error: string, name: string, others: RecurringRule[] = []) => eq(val(d, others), { ok: false, error }, name);
bad({ ...base, name: '  ' }, 'name', 'nom vide refusé');
bad({ ...base, title: '' }, 'title', 'titre vide refusé');
bad({ ...base, id: 'a b' }, 'format', 'identifiant avec espace refusé');
bad({ ...base, name: 5 }, 'format', 'nom qui n\'est pas du texte refusé');
bad({ ...base, proof_mode: 'video' }, 'proof', 'justificatif inconnu refusé');
bad({ ...base, priority: 'Critique' }, 'priority', 'priorité inconnue refusée');
bad({ ...base, objective: -1 }, 'objective', 'quantité négative refusée');
bad({ ...base, objective: 1000001 }, 'objective', 'quantité trop grande refusée');
bad({ ...base, objective: '5' }, 'objective', 'quantité en texte refusée');
bad({ ...base, due_after_days: 31 }, 'due', 'délai de 31 jours refusé');
bad({ ...base, due_after_days: 1.5 }, 'due', 'délai non entier refusé');
bad({ ...base, due_time: '10:00' }, 'due', 'heure limite sans délai refusée');
bad({ ...base, due_after_days: 1, due_time: '25:00' }, 'due', 'heure limite fausse refusée');
bad({ ...base, frequency: 'yearly' }, 'frequency', 'fréquence inconnue refusée');
bad({ ...base, frequency: 'weekly', weekdays: [] }, 'weekdays', 'semaine sans jour refusée');
bad({ ...base, frequency: 'weekly', weekdays: [8] }, 'weekdays', 'jour 8 refusé');
bad({ ...base, frequency: 'weekly' }, 'weekdays', 'semaine sans liste refusée');
bad({ ...base, frequency: 'monthly', month_day: 0 }, 'month_day', 'jour 0 du mois refusé');
bad({ ...base, frequency: 'monthly', month_day: 32 }, 'month_day', 'jour 32 du mois refusé');
bad({ ...base, time: '8:00' }, 'time', 'heure 8:00 refusée');
bad({ ...base, time: '24:00' }, 'time', 'heure 24:00 refusée');
bad({ ...base, start_date: '2026-02-30' }, 'start', '30 février refusé');
bad({ ...base, start_date: '01/10/2026' }, 'start', 'format jj/mm/aaaa refusé');
bad({ ...base, end_date: '2026-09-30' }, 'end', 'fin avant le début refusée');
bad({ ...base, active: 'oui' }, 'format', 'actif qui n\'est pas vrai/faux refusé');
bad(null, 'format', 'rien du tout refusé');
bad([], 'format', 'tableau refusé');
bad(JSON.parse('{"__proto__":{"x":1},"name":"a"}'), 'format', 'clé dangereuse refusée');
eq(val({ ...base, id: 'rr-b', name: ' RAPPORT DU MATIN ' }, [must(base)]), { ok: false, error: 'duplicate' }, 'même nom (majuscules, espaces) refusé');
eq(val(base, [must(base)]).ok, true, 'une règle peut garder son propre nom en se modifiant');
eq(val({ ...base, id: '' , name: 'Nouveau' }, Array.from({ length: RECURRING_LIMITS.max }, (_, i) => must({ ...base, id: 'r' + i, name: 'n' + i }))), { ok: false, error: 'limit' }, '21e règle refusée');

// ---- Nettoyage d'une liste reçue
eq(cleanRecurring('oups'), [], 'liste qui n\'est pas une liste : vide');
eq(cleanRecurring([base, base, { ...base, id: 'rr-b', name: 'Autre' }, { ...base, id: 'rr-c', name: '' }, 5, null, { ...base, id: '' }]).map((r) => r.id), ['rr-a', 'rr-b'], 'liste : fausses règles et doublons ignorés');
eq(cleanRecurring(Array.from({ length: 30 }, (_, i) => ({ ...base, id: 'r' + i, name: 'n' + i }))).length, 20, 'liste : 20 règles au plus');

// ---- Jours qui tombent
const daily = must(base);
const weekly = must({ ...base, id: 'rr-w', name: 'Hebdo', frequency: 'weekly', weekdays: [1, 7] }); // lundi et dimanche
const monthly31 = must({ ...base, id: 'rr-m', name: 'Mensuel', frequency: 'monthly', month_day: 31 });
const monthly15 = must({ ...base, id: 'rr-m15', name: 'Mensuel 15', frequency: 'monthly', month_day: 15, end_date: '2026-12-15' });
eq([runsOn(daily, '2026-10-01'), runsOn(daily, '2026-09-30'), runsOn(daily, '2026-02-30')], [true, false, false], 'quotidien : dès le début, jamais avant, jamais une date fausse');
eq([runsOn(weekly, '2026-10-25'), runsOn(weekly, '2026-10-26'), runsOn(weekly, '2026-10-27')], [true, true, false], 'semaine : dimanche 25 et lundi 26 oui, mardi 27 non');
eq([runsOn(monthly31, '2026-10-31'), runsOn(monthly31, '2026-11-30'), runsOn(monthly31, '2026-11-29'), runsOn(monthly31, '2027-02-28'), runsOn(monthly31, '2028-02-29'), runsOn(monthly31, '2028-02-28')], [true, true, false, true, true, false], 'le 31 : dernier jour des mois courts (30 nov, 28 fév 2027, 29 fév 2028)');
eq([runsOn(monthly15, '2026-12-15'), runsOn(monthly15, '2027-01-15')], [true, false], 'date de fin : le dernier jour compte, pas après');

// ---- Heures de Madagascar
eq(scheduledMs('2026-10-26', '08:00'), Date.UTC(2026, 9, 26, 5, 0), '08:00 à Madagascar = 05:00 UTC');
eq(scheduledMs('2026-10-26', '01:30'), Date.UTC(2026, 9, 25, 22, 30), '01:30 à Madagascar = 22:30 UTC la veille');
eq([madagascarDate(Date.UTC(2026, 9, 25, 21, 30)), madagascarDate(Date.UTC(2026, 9, 25, 20, 59))], ['2026-10-26', '2026-10-25'], 'minuit à Madagascar = 21:00 UTC');

// ---- Missions à créer maintenant
const at = (h: number, mi = 0, d = 26) => MS(2026, 10, d, h, mi);
eq(dueOccurrences([daily], at(7, 59)).length, 0, 'avant l\'heure : rien');
eq(dueOccurrences([daily], at(8, 0)).map((o) => o.id), ['rec-rr-a-20261026'], 'à l\'heure pile : une mission, identifiant calculé');
eq(dueOccurrences([daily], at(9, 59)).length, 1, 'jusqu\'à 1 h 59 après : encore créée (le serveur passe toutes les 15 min)');
eq(dueOccurrences([daily], at(10, 0)).length, 0, '2 h après : plus rien (pas de rattrapage)');
eq(dueOccurrences([{ ...daily, active: false }], at(8, 0)).length, 0, 'règle arrêtée : rien');
eq(dueOccurrences([{ ...daily, active: false }, { ...daily, active: true }], at(8, 0)).length, 1, 'arrêt puis reprise : repart sans rattrapage des jours manqués');
eq(dueOccurrences([must({ ...base, time: '23:30' })], MS(2026, 10, 27, 0, 30)).map((o) => o.date), ['2026-10-26'], 'règle de 23:30 vue à 00:30 : c\'est celle de la veille');
eq(dueOccurrences([weekly], at(8, 0, 27)).length, 0, 'mardi : la règle du lundi/dimanche ne crée rien');
eq(dueOccurrences([weekly], at(8, 0, 26)).length, 1, 'lundi : la règle du lundi/dimanche crée une mission');
eq(dueOccurrences([daily, daily], at(8, 0)).map((o) => o.id), ['rec-rr-a-20261026', 'rec-rr-a-20261026'], 'même règle donnée deux fois : même identifiant (le serveur n\'en garde qu\'une)');
eq(JSON.stringify(dueOccurrences([daily], at(8, 20)).map((o) => o.id)) === JSON.stringify(dueOccurrences([daily], at(8, 5)).map((o) => o.id)), true, 'deux passages à 15 min d\'écart : même identifiant → jamais de doublon');
eq(occurrenceId('rr-a', '2026-10-26'), 'rec-rr-a-20261026', 'identifiant : règle + date');
eq(dueOccurrences([monthly31], MS(2026, 11, 30, 8, 0)).length, 1, 'le 31 : se crée le 30 novembre');
eq(dueOccurrences([monthly31], MS(2026, 11, 29, 8, 0)).length, 0, 'le 31 : rien le 29 novembre');

// ---- Mission créée
{
  const r = must({ ...base, objective: 12, priority: 'Haute', post_type: 'SAISIE', description: 'Détails', client_id: 'cl-1', due_after_days: 2, due_time: '17:00', proof_mode: 'photo' });
  const c = buildContract(r, '2026-10-30', 7, 1500.4);
  eq(c, { id: 'rec-rr-a-20261030', post_number: 7, client_name: 'Rapport quotidien', account_tag: 'ACC-7', game_mode: '', description: 'Détails', post_type: 'SAISIE', proof_mode: 'photo', current_rank: '—', target_rank: '—', initial_score: 0, target_score: 12, recommended_shift: 'any', estimated_reward_ar: 1500, priority: 'Haute', region_server: '—', no_account: false, recurring_rule_id: 'rr-a', recurring_date: '2026-10-30', client_id: 'cl-1', due_date: '2026-11-01', due_time: '17:00' }, 'mission créée : mêmes champs qu\'à la main, date limite = jour + 2 (passage de mois)');
  const c2 = buildContract(daily, '2026-12-31', 1, 0);
  eq([c2.due_date, c2.due_time, c2.client_id, c2.estimated_reward_ar], [undefined, undefined, undefined, 0], 'sans délai : pas de date limite, pas de client');
  eq(buildContract(must({ ...base, due_after_days: 0 }), '2026-10-30', 1, 0).due_date, '2026-10-30', 'délai 0 : le jour même');
  eq(buildContract(must({ ...base, due_after_days: 1 }), '2026-12-31', 1, 0).due_date, '2027-01-01', 'passage d\'année : date limite 1er janvier');
}

// ---- Prochaine fois et phrase
eq(nextRun(daily, MS(2026, 10, 26, 7, 0)), MS(2026, 10, 26, 8, 0), 'prochaine fois : ce matin à 08:00');
eq(nextRun(daily, MS(2026, 10, 26, 8, 0)), MS(2026, 10, 27, 8, 0), 'à 08:00 pile : demain');
eq(nextRun({ ...daily, active: false }, MS(2026, 10, 26, 7, 0)), null, 'règle arrêtée : aucune prochaine fois');
eq(nextRun(must({ ...base, end_date: '2026-10-10' }), MS(2026, 10, 26, 7, 0)), null, 'règle finie : aucune prochaine fois');
eq(nextRun(monthly31, MS(2026, 11, 1, 0, 0)), MS(2026, 11, 30, 8, 0), 'le 31 : prochaine fois le 30 novembre');
eq([describeRule(daily), describeRule(weekly), describeRule(monthly31), describeRule(must({ ...base, id: 'rr-1', name: 'x1', frequency: 'monthly', month_day: 1 })), describeRule(weekly, 'en')], ['Chaque jour à 08:00', 'Chaque lundi, dimanche à 08:00', 'Le 31 de chaque mois à 08:00', 'Le 1er de chaque mois à 08:00', 'Every Monday, Sunday at 08:00'], 'phrases en français et en anglais');
eq(/NaN|undefined|null/.test(JSON.stringify([describeRule(daily), describeRule(weekly), describeRule(monthly31)])), false, 'aucun NaN ni « undefined » dans les phrases');

// ---- Pureté
{
  const frozen = Object.freeze({ ...base, weekdays: Object.freeze([]) });
  let threw = false; try { const r = must(frozen); Object.freeze(r); dueOccurrences([r], at(8, 0)); nextRun(r, at(8, 0)); buildContract(r, '2026-10-26', 1, 0); cleanRecurring([frozen]); } catch { threw = true; }
  eq(threw, false, 'les données reçues ne sont jamais modifiées');
}

// ---- Site / serveur : le bloc RECURRING du serveur est le même texte et donne les mêmes réponses
{
  const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8').replace(/\r\n/g, '\n');
  const m = src.match(/\/\/ ===== BEGIN RECURRING[^\n]*\n([\s\S]*?)\/\/ ===== END RECURRING =====/);
  ok(!!m, 'serveur : bloc RECURRING présent');
  if (m) {
    const site = readFileSync('src/utils/recurring.ts', 'utf8').replace(/\r\n/g, '\n').split('\n').filter((l, i, a) => !(i < a.findIndex((x) => !x.startsWith('//')) )).join('\n');
    const strip = (s: string) => s.replace(/^export /gm, '').trim();
    ok(strip(site) === strip(m[1]), 'serveur : le bloc est la copie exacte de src/utils/recurring.ts (sans « export »)');
    const js = transformSync(m[1] + '\n;globalThis.__s = { cleanRecurring, dueOccurrences, buildContract, nextRun };', { loader: 'ts' }).code;
    new Function(js)();
    const s = (globalThis as any).__s;
    const rules = cleanRecurring([base, { ...base, id: 'rr-w', name: 'Hebdo', frequency: 'weekly', weekdays: [1, 7], due_after_days: 3 }, { ...base, id: 'rr-m', name: 'Mensuel', frequency: 'monthly', month_day: 31, active: false }, { ...base, id: 'x', name: '' }]);
    eq(JSON.stringify(s.cleanRecurring(JSON.parse(JSON.stringify([base, { ...base, id: 'rr-w', name: 'Hebdo', frequency: 'weekly', weekdays: [1, 7], due_after_days: 3 }, { ...base, id: 'rr-m', name: 'Mensuel', frequency: 'monthly', month_day: 31, active: false }, { ...base, id: 'x', name: '' }])))), JSON.stringify(rules), 'serveur et site nettoient la même liste pareil');
    let same = 0, total = 0;
    for (const t of [at(7, 59), at(8, 0), at(9, 59), at(10, 0), MS(2026, 10, 27, 0, 30), at(8, 0, 27), MS(2026, 11, 30, 8, 0)]) {
      total++;
      const a = JSON.stringify(dueOccurrences(rules, t).map((o) => [o.id, o.date, o.at])), b = JSON.stringify(s.dueOccurrences(rules, t).map((o: any) => [o.id, o.date, o.at]));
      if (a === b) same++; else console.log('   différence', t, a, b);
    }
    eq(same, total, `serveur et site créent les mêmes missions aux mêmes instants (${total} instants)`);
    eq(JSON.stringify(s.buildContract(rules[1], '2026-10-26', 3, 100)), JSON.stringify(buildContract(rules[1], '2026-10-26', 3, 100)), 'serveur et site fabriquent la même mission');
  }
  // La route et les garde-fous
  ok(/action === "recurring-due" && req\.method === "POST"\) return await recurringDue\(request, res\)/.test(src), 'serveur : route recurring-due (POST) branchée avant la connexion');
  const h = src.match(/async function recurringDue\([\s\S]*?\n}\n/);
  ok(!!h, 'serveur : fonction recurringDue présente');
  if (h) {
    ok(/x-cron-secret/.test(h[0]) && /timingSafeEqual/.test(h[0]) && /push_cron_secret/.test(h[0]), 'serveur : la tâche planifiée doit donner le secret (comparaison à temps constant)');
    ok(/status\(401\)/.test(h[0]), 'serveur : sans le bon secret → refus 401');
    ok(/ignoreDuplicates: true/.test(h[0]) && /existingIds\.has\(/.test(h[0]), 'serveur : une mission déjà créée n\'est jamais recréée ni écrasée');
    ok(!/\.delete\(/.test(h[0]), 'serveur : la tâche ne supprime jamais rien');
  }
  ok(/"recurring_missions", "mission_templates", "budgets", "health_acks"\]/.test(src), 'serveur : règles jamais envoyées à un opérateur (réglages réservés à l\'admin)');
  ok(/cleanRecurring\(sentRec\)/.test(src), 'serveur : règles revérifiées à chaque enregistrement des réglages');
  const mig = readFileSync('supabase/migrations/20261025_recurring_missions_cron.sql', 'utf8');
  ok(/cron\.schedule\(\s*'df-recurring-due'/.test(mig) && /\*\/15 \* \* \* \*/.test(mig) && /recurring-due/.test(mig) && /push_cron_secret/.test(mig), 'migration : tâche df-recurring-due toutes les 15 min avec le secret');
  ok(/cron\.unschedule\('df-recurring-due'\)/.test(mig), 'migration : retour en arrière noté');
  ok(!/create table|drop table/i.test(mig), 'migration : aucune table créée ni supprimée');
}

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
