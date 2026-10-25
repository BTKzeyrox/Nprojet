// Contrôle du planning des équipes (M15.2). Lancer : npm run check:planning
import { readFileSync, existsSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { checkShift, cleanShift, shiftId, mondayOf, weekDates, isOnLeave, planConflicts, coverage, planAddDays, SHIFT_KINDS, SHIFT_LABEL, CONFLICT_LABEL } from '../src/utils/planning';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } };
const ok = (c: boolean, name: string) => eq(c, true, name);

// ---- Identifiant et saisie
eq(shiftId('user-1', '2026-10-26'), 'sh-user-1-20261026', 'identifiant : salarié + date');
eq(checkShift({ employee_id: 'u1', date: '2026-10-26', kind: 'day' }), { ok: true, value: { id: 'sh-u1-20261026', employee_id: 'u1', date: '2026-10-26', kind: 'day' } }, 'entrée valide : identifiant calculé');
eq(checkShift({ id: 'sh-u1-20261026', employee_id: ' u1 ', date: '2026-10-26', kind: 'night', note: '  Remplace Paul \u0007 ' }), { ok: true, value: { id: 'sh-u1-20261026', employee_id: 'u1', date: '2026-10-26', kind: 'night', note: 'Remplace Paul' } }, 'espaces et caractères de contrôle retirés');
eq((checkShift({ employee_id: 'u1', date: '2026-10-26', kind: 'off', note: 'x'.repeat(300) }) as any).value.note.length, 120, 'note coupée à 120 caractères');
const bad = (d: any, error: string, name: string) => eq(checkShift(d), { ok: false, error }, name);
bad({ id: 'autre', employee_id: 'u1', date: '2026-10-26', kind: 'day' }, 'id', 'identifiant choisi par le client refusé');
bad({ employee_id: '', date: '2026-10-26', kind: 'day' }, 'employee', 'salarié vide refusé');
bad({ employee_id: 'a b', date: '2026-10-26', kind: 'day' }, 'employee', 'salarié avec espace refusé');
bad({ employee_id: 'a'.repeat(61), date: '2026-10-26', kind: 'day' }, 'employee', 'salarié trop long refusé');
bad({ employee_id: 'u1', date: '2026-02-30', kind: 'day' }, 'date', '30 février refusé');
bad({ employee_id: 'u1', date: '26/10/2026', kind: 'day' }, 'date', 'format jj/mm/aaaa refusé');
bad({ employee_id: 'u1', date: '1999-12-31', kind: 'day' }, 'date', 'année 1999 refusée');
bad({ employee_id: 'u1', date: '2026-10-26', kind: 'matin' }, 'kind', 'vacation inconnue refusée');
bad({ employee_id: 'u1', date: '2026-10-26' }, 'kind', 'vacation absente refusée');
bad({ employee_id: 'u1', date: '2026-10-26', kind: 'day', note: 5 }, 'format', 'note qui n\'est pas du texte refusée');
bad({ employee_id: 7, date: '2026-10-26', kind: 'day' }, 'format', 'salarié qui n\'est pas du texte refusé');
bad(null, 'format', 'rien du tout refusé');
bad([], 'format', 'tableau refusé');
bad(JSON.parse('{"__proto__":{"x":1},"employee_id":"u1","date":"2026-10-26","kind":"day"}'), 'format', 'clé dangereuse refusée');

// ---- Revérification du serveur
const NOW = '2026-10-25T10:00:00.000Z', TODAY = '2026-10-25';
const rec = { employee_id: 'u1', date: '2026-10-26', kind: 'day' };
eq(cleanShift(rec, undefined, 'admin-1', NOW, { today: TODAY }), { ok: true, save: { id: 'sh-u1-20261026', employee_id: 'u1', date: '2026-10-26', kind: 'day', created_at: NOW, updated_at: NOW, updated_by: 'admin-1' } }, 'serveur : nouvelle entrée estampillée');
eq((cleanShift({ ...rec, kind: 'night' }, { employee_id: 'u1', date: '2026-10-26', created_at: '2026-10-01T00:00:00.000Z' }, 'admin-2', NOW, { today: TODAY }) as any).save, { id: 'sh-u1-20261026', employee_id: 'u1', date: '2026-10-26', kind: 'night', created_at: '2026-10-01T00:00:00.000Z', updated_at: NOW, updated_by: 'admin-2' }, 'serveur : modification garde la date de création');
eq(cleanShift({ ...rec, date: planAddDays(TODAY, 400) }, undefined, 'a', NOW, { today: TODAY }).ok, true, 'serveur : 400 jours devant : accepté');
eq(cleanShift({ ...rec, date: planAddDays(TODAY, 401) }, undefined, 'a', NOW, { today: TODAY }), { ok: false, reason: 'window' }, 'serveur : 401 jours devant : refusé');
eq(cleanShift({ ...rec, date: planAddDays(TODAY, -401) }, undefined, 'a', NOW, { today: TODAY }), { ok: false, reason: 'window' }, 'serveur : 401 jours derrière : refusé');
eq(cleanShift(rec, { employee_id: 'u2', date: '2026-10-26' }, 'a', NOW, { today: TODAY }), { ok: false, reason: 'id' }, 'serveur : une entrée existante d\'un autre salarié n\'est pas écrasée');
eq(cleanShift(rec, undefined, 'a', NOW, { today: 'pas-une-date' } as any), { ok: false, reason: 'format' }, 'serveur : date du jour fausse refusée');
eq(cleanShift({ ...rec, kind: 'x' }, undefined, 'a', NOW, { today: TODAY }), { ok: false, reason: 'kind' }, 'serveur : vacation fausse refusée avec son motif');

// ---- Semaine
eq([mondayOf('2026-10-26'), mondayOf('2026-10-25'), mondayOf('2026-10-31'), mondayOf('2027-01-01')], ['2026-10-26', '2026-10-19', '2026-10-26', '2026-12-28'], 'lundi de la semaine (dimanche = fin de semaine)');
eq(weekDates('2026-10-26'), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'], 'sept dates, passage de mois');
eq(weekDates('2026-12-28')[6], '2027-01-03', 'sept dates, passage d\'année');

// ---- Congés
const L = [{ employee_id: 'u1', start_date: '2026-10-27', end_date: '2026-10-29', status: 'approved' }, { employee_id: 'u1', start_date: '2026-11-03', end_date: '2026-11-04', status: 'pending' }, { employee_id: 'u2', start_date: '2026-10-26', end_date: '2026-10-26', status: 'rejected' }];
eq([isOnLeave(L, 'u1', '2026-10-26'), isOnLeave(L, 'u1', '2026-10-27'), isOnLeave(L, 'u1', '2026-10-29'), isOnLeave(L, 'u1', '2026-10-30')], [false, true, true, false], 'congé accepté : bornes comprises');
eq([isOnLeave(L, 'u1', '2026-11-03'), isOnLeave(L, 'u2', '2026-10-26'), isOnLeave(L, 'u3', '2026-10-27')], [false, false, false], 'congé en attente, refusé ou d\'un autre : ne compte pas');

// ---- Conflits
const S = (employee_id: string, date: string, kind: string) => ({ employee_id, date, kind });
eq(planConflicts([S('u1', '2026-10-27', 'day'), S('u1', '2026-10-30', 'day')], L), [{ kind: 'on_leave', employee_id: 'u1', date: '2026-10-27' }], 'conflit : Jour pendant un congé accepté');
eq(planConflicts([S('u1', '2026-10-28', 'off')], L), [], 'Repos pendant un congé : aucun conflit');
eq(planConflicts([S('u1', '2026-11-03', 'night')], L), [], 'congé seulement demandé : aucun conflit');
eq(planConflicts([S('u1', '2026-10-30', 'night'), S('u1', '2026-10-31', 'day')], L), [{ kind: 'rest', employee_id: 'u1', date: '2026-10-31' }], 'conflit : Jour le lendemain d\'une Nuit');
eq(planConflicts([S('u1', '2026-10-30', 'night'), S('u1', '2026-10-31', 'night'), S('u1', '2026-11-01', 'off'), S('u1', '2026-11-02', 'day')], []), [], 'Nuit, Nuit, Repos, Jour : aucun conflit');
eq(planConflicts([S('u1', '2026-11-01', 'night'), S('u1', '2026-11-02', 'day')], []), [{ kind: 'rest', employee_id: 'u1', date: '2026-11-02' }], 'repos insuffisant à cheval sur deux semaines : signalé');
eq(planConflicts([S('u1', '2026-10-30', 'night'), S('u2', '2026-10-31', 'day')], []), [], 'Nuit d\'un salarié, Jour d\'un autre : aucun conflit');
const six = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'].map((d) => S('u2', d, 'day'));
eq(planConflicts(six, [], { maxPerWeek: 5 }), [{ kind: 'too_many', employee_id: 'u2', date: '2026-10-26' }], 'conflit : 6 jours travaillés pour une limite de 5 (signalé au lundi)');
eq(planConflicts(six, [], { maxPerWeek: 6 }), [], '6 jours pour une limite de 6 : aucun conflit');
eq(planConflicts(six, [], { maxPerWeek: 0 }), [], 'limite 0 : pas de limite');
eq(planConflicts(six, []), [], 'limite absente : pas de limite');
eq(planConflicts([...six.slice(0, 3), S('u2', '2026-10-31', 'off'), S('u2', '2026-11-02', 'day'), S('u2', '2026-11-03', 'day'), S('u2', '2026-11-04', 'day')], [], { maxPerWeek: 3 }), [], 'les jours se comptent par semaine lundi-dimanche, pas en glissant');
eq(planConflicts([S('u2', '2026-10-31', 'off'), S('u2', '2026-10-30', 'off')], [], { maxPerWeek: 1 }), [], 'les Repos ne comptent pas comme jours travaillés');
eq(planConflicts([S('u2', '2026-10-28', 'day'), S('u1', '2026-10-27', 'day'), S('u1', '2026-10-28', 'day')], L).map((c) => `${c.date} ${c.employee_id} ${c.kind}`), ['2026-10-27 u1 on_leave', '2026-10-28 u1 on_leave'], 'résultat trié par date puis salarié');
{ const frozen = Object.freeze(six.map((s) => Object.freeze(s))); let threw = false; try { planConflicts(frozen as any, Object.freeze(L) as any, { maxPerWeek: 2 }); coverage(frozen as any, weekDates('2026-10-26')); } catch { threw = true; } eq(threw, false, 'les données reçues ne sont jamais modifiées'); }

// ---- Couverture
eq(coverage([S('u1', '2026-10-26', 'day'), S('u2', '2026-10-26', 'day'), S('u3', '2026-10-26', 'night'), S('u3', '2026-10-27', 'off')], ['2026-10-26', '2026-10-27', '2026-10-28']), [{ date: '2026-10-26', day: 2, night: 1 }, { date: '2026-10-27', day: 0, night: 0 }, { date: '2026-10-28', day: 0, night: 0 }], 'couverture : Jour et Nuit par date, Repos non compté');
eq([SHIFT_KINDS.length, Object.keys(SHIFT_LABEL).length, Object.keys(CONFLICT_LABEL).length], [3, 3, 3], 'libellés : 3 vacations, 3 conflits');

// ---- Site / serveur
{
  const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8').replace(/\r\n/g, '\n');
  const site = readFileSync('src/utils/planning.ts', 'utf8').replace(/\r\n/g, '\n');
  const grab = (s: string, name: string) => { const m = s.match(new RegExp(`(?://|\\/\\/) ===== BEGIN ${name}[^\\n]*\\n([\\s\\S]*?)// ===== END ${name} =====`)) || s.match(new RegExp(`// BEGIN ${name}\\n([\\s\\S]*?)// END ${name}`)); return m ? m[1].trim() : ''; };
  const srv = grab(src, 'SHIFTS'), loc = grab(site, 'SHIFTS');
  ok(srv.length > 200, 'serveur : bloc SHIFTS présent');
  ok(srv === loc, 'serveur : le bloc est la copie exacte de src/utils/planning.ts');
  if (srv) {
    new Function(transformSync(srv + '\n;globalThis.__p = { checkShift, cleanShift, shiftId };', { loader: 'ts' }).code)();
    const p = (globalThis as any).__p;
    const samples: any[] = [rec, { ...rec, kind: 'night', note: ' n ' }, { ...rec, kind: 'zz' }, { ...rec, date: '2026-13-01' }, { ...rec, id: 'x' }, { ...rec, employee_id: 'a b' }, null, [], { ...rec, date: planAddDays(TODAY, 500) }];
    let same = 0;
    for (const s of samples) { const a = JSON.stringify(cleanShift(s, undefined, 'a', NOW, { today: TODAY })), b = JSON.stringify(p.cleanShift(s, undefined, 'a', NOW, { today: TODAY })); if (a === b) same++; else console.log('   différence', JSON.stringify(s), a, b); }
    eq(same, samples.length, `serveur et site jugent pareil ${samples.length} entrées`);
    eq([p.shiftId('u1', '2026-10-26'), JSON.stringify(p.checkShift(rec))], [shiftId('u1', '2026-10-26'), JSON.stringify(checkShift(rec))], 'serveur et site calculent le même identifiant');
  }
  ok(/shifts: "df_shifts"/.test(src), 'serveur : collection shifts → table df_shifts');
  ok(/if \(col === 'shifts'\) return q\.eq\('data->>employee_id', me\.id\)/.test(src), 'serveur : un salarié ne reçoit que SON planning');
  const branch = src.match(/\} else if \(col === 'shifts'\) \{[\s\S]*?\} else if \(col === 'messages'/);
  ok(!!branch, 'serveur : branche d\'écriture du planning présente');
  if (branch) {
    ok(/if \(!admin\) \{ rejected\.push\(\{ col, id: rec\.id, reason: 'forbidden' \}\); continue; \}/.test(branch[0]), 'serveur : seul le responsable écrit le planning');
    ok(/cleanShift\(rec, existing, String\(me\.id\), now, \{ today: madagascarDate\(Date\.now\(\)\) \}\)/.test(branch[0]), 'serveur : chaque entrée est revérifiée (date du jour de Madagascar)');
    ok(/getUserRow\(/.test(branch[0]) && /eu\.role === 'admin'/.test(branch[0]), 'serveur : le salarié doit exister et ne peut pas être le responsable');
  }
  ok(/step\('shifts', async \(\) => \{ await sb\.from\(T\.shifts\)\.delete\(\)\.eq\('data->>employee_id', uid\); \}\)/.test(src), 'serveur : un compte supprimé emporte son planning');
  const migPath = 'supabase/migrations/20261025_create_df_shifts.sql';
  ok(existsSync(migPath), 'migration : fichier présent');
  if (existsSync(migPath)) {
    const mig = readFileSync(migPath, 'utf8');
    ok(/create table if not exists public\.df_shifts \(\s*id text primary key,\s*data jsonb not null default '\{\}'::jsonb,\s*updated_at timestamptz not null default now\(\)\s*\)/.test(mig), 'migration : table df_shifts (id, data, updated_at)');
    ok(/enable row level security/.test(mig) && /revoke all on public\.df_shifts from anon, authenticated/.test(mig), 'migration : aucun accès public');
    ok(/df_shifts_employee_idx/.test(mig), 'migration : index par salarié');
    ok(!/drop table (?!public\.df_shifts)|delete from|truncate/i.test(mig.replace(/^--.*$/gm, '')), 'migration : ne supprime aucune donnée existante');
  }
}

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
