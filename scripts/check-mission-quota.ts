// Objectif de missions par jour (2 à 5, réglable) : règle pure, affichage dans le détail du jour, jamais de blocage.
import { readFileSync } from 'node:fs';
import { cleanQuota, quotaState, quotaText } from '../src/utils/missionQuota';
import { dayDetail } from '../src/utils/dayDetail';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const eq = (a: unknown, b: unknown, m: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (${JSON.stringify(a)})`);
eq(cleanQuota(undefined), { min: 2, max: 5 }, 'défaut : 2 à 5');
eq(cleanQuota({ missions_per_day_min: 3, missions_per_day_max: 8 }), { min: 3, max: 8 }, 'réglage pris en compte');
eq(cleanQuota({ missions_per_day_min: 6, missions_per_day_max: 4 }), { min: 2, max: 5 }, 'max plus petit que le min : retour aux défauts');
eq(cleanQuota({ missions_per_day_min: 'x', missions_per_day_max: -1 }), { min: 2, max: 5 }, 'valeurs fausses : défauts');
const q = { min: 2, max: 5 };
eq([0, 1, 2, 5, 6].map(c => quotaState(c, q)), ['none', 'under', 'ok', 'ok', 'over'], '0 = aucune, 1 = sous le minimum, 2 et 5 = dans l\'objectif, 6 = au-dessus');
ok(/sous le minimum/.test(quotaText(1, q, false)) && /pour l'instant/.test(quotaText(1, q, true)) && !/sous le minimum/.test(quotaText(1, q, true)), 'aujourd\'hui : « pour l\'instant », jamais « sous le minimum » avant la fin du jour');
ok(/au-dessus du maximum/.test(quotaText(6, q, false)) && /dans l'objectif/.test(quotaText(3, q, false)), 'phrases : au-dessus du maximum, dans l\'objectif');
const P = (id: string, status: string) => ({ id, employee_id: 'a', client_name: 'M', account_tag: '', target_score: 10, initial_score: 0, current_score: 10, status, date: '2026-10-26', start_time: '08:00:00', end_time: '09:00:00', calculated_ar: 0 }) as any;
const d = dayDetail([P('1', 'completed'), P('2', 'rejected'), P('3', 'force_released'), P('4', 'active'), P('5', 'pending_start')], undefined, 'a', '2026-10-26', Date.now(), '2026-10-26');
ok(d.totals.missions === 5 && d.totals.counted === 3, 'comptées : validées, en cours, en attente (pas les refusées ni libérées)');
const cal = readFileSync('src/views/CalendarView.tsx', 'utf8'), set = readFileSync('src/views/admin/SettingsView.tsx', 'utf8'), srv = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
ok(/data-testid="mission-quota"/.test(cal) && /day > today \|\| r\.leave !== null/.test(cal), 'calendrier : ligne d\'objectif dans le détail du jour, pas pour un jour futur ni un congé');
ok(!/mission-quota|quotaText/.test(cal.split('GlobalCalendar')[0].slice(0, 400)) && !/missions_per_day/.test(srv), 'aucune règle serveur : l\'objectif ne bloque jamais une mission');
ok(/data-mission-quota/.test(set) && /set\('missions_per_day_min'/.test(set) && /set\('missions_per_day_max'/.test(set), 'Réglages : minimum et maximum');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
