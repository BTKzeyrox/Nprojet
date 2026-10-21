// Contrôle des modèles de mission (M6.2) : règles du site et du serveur. Lancer : npm run check:templates
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { applyTemplate, checkTemplate, cleanTemplates, newTemplateId, templateFromMission, TEMPLATE_LIMITS, type MissionTemplate } from '../src/utils/missionTemplates';

let fails = 0, n = 0;
const eq = (got: unknown, want: unknown, name: string) => { n++; const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } else console.log(`OK    ${name}`); };
const tpl = (id: string, name: string, extra: Partial<MissionTemplate> = {}): MissionTemplate => ({ id, name, title: '', proof_mode: 'type', ...extra });

// Saisie
eq(checkTemplate({ name: '  Saisie  ', title: 'Fiches', post_type: 'WEB', description: 'Consigne', proof_mode: 'photo' }, []), { ok: true, value: { id: '', name: 'Saisie', title: 'Fiches', post_type: 'WEB', description: 'Consigne', proof_mode: 'photo' } }, 'modèle valide : textes nettoyés, champs vides non écrits');
eq(checkTemplate({ name: 'X' }, []), { ok: true, value: { id: '', name: 'X', title: '', proof_mode: 'type' } }, 'seulement un nom : justificatif « selon le type »');
eq(checkTemplate({ name: '   ' }, []), { ok: false, error: 'name' }, 'nom vide refusé');
eq(checkTemplate({}, []), { ok: false, error: 'name' }, 'rien saisi : nom manquant');
eq(checkTemplate({ name: 'X', proof_mode: 'zzz' }, []), { ok: false, error: 'proof' }, 'justificatif inconnu refusé');
eq(checkTemplate({ name: ['X'] }, []), { ok: false, error: 'format' }, 'tableau à la place d\'un texte refusé');
eq(checkTemplate({ name: 'X', title: 5 }, []), { ok: false, error: 'format' }, 'nombre à la place d\'un texte refusé');
eq(checkTemplate(null as any, []), { ok: false, error: 'format' }, 'null refusé sans planter');
eq(checkTemplate({ name: 'saisie' }, [tpl('a', 'Saisie')]), { ok: false, error: 'duplicate' }, 'même nom (majuscules) refusé');
eq(checkTemplate({ id: 'a', name: 'Saisie' }, [tpl('b', 'Autre')]).ok, true, 'garder son propre nom en modifiant : accepté');
eq(checkTemplate({ id: 'a', name: 'Autre' }, [tpl('b', 'Autre')]), { ok: false, error: 'duplicate' }, 'renommer avec un nom déjà pris : refusé');
const full = Array.from({ length: TEMPLATE_LIMITS.max }, (_, i) => tpl('t' + i, 'M' + i));
eq(checkTemplate({ name: 'Nouveau' }, full), { ok: false, error: 'limit' }, '31e modèle refusé');
eq(checkTemplate({ id: 't1', name: 'M1 bis' }, full.filter(x => x.id !== 't1')).ok, true, 'modifier un modèle quand la liste est pleine : accepté');
const long = checkTemplate({ name: 'n'.repeat(500), title: 't'.repeat(500), description: 'd'.repeat(5000), post_type: 'p'.repeat(500) }, []);
eq(long.ok && [long.value.name.length, long.value.title.length, long.value.description!.length, long.value.post_type!.length], [60, 80, 500, 40], 'textes trop longs coupés aux limites');
eq(checkTemplate({ name: 'A\u0000B\u0007C' }, []).ok && (checkTemplate({ name: 'A\u0000B\u0007C' }, []) as any).value.name, 'ABC', 'caractères de contrôle retirés');

// Lecture d'une liste venue du dehors
eq(cleanTemplates(undefined), [], 'pas de liste : vide');
eq(cleanTemplates('x'), [], 'texte à la place d\'une liste : vide');
eq(cleanTemplates([null, 5, 'x', [], { name: 'Sans id' }, { id: 'ok', name: 'Bon' }]), [{ id: 'ok', name: 'Bon', title: '', proof_mode: 'type' }], 'éléments faux écartés, le bon gardé');
eq(cleanTemplates([{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }, { id: 'b', name: 'a' }]).map(x => x.id), ['a'], 'identifiant ou nom en double écarté');
eq(cleanTemplates(JSON.parse('[{"id":"p","name":"P","__proto__":{"x":1}},{"id":"q","name":"Q","constructor":1}]')).map(x => x.id), [], 'clés dangereuses : modèle écarté');
eq(cleanTemplates(Array.from({ length: 80 }, (_, i) => ({ id: 'i' + i, name: 'N' + i }))).length, 30, 'liste de 80 : coupée à 30');
eq(({} as any).x, undefined, 'l\'objet de base n\'a pas été pollué');

// Aides
eq(newTemplateId([tpl('tpl-5', 'a')], 5), 'tpl-5-2', 'identifiant déjà pris : suffixe');
eq(newTemplateId([], 7), 'tpl-7', 'identifiant libre : tel quel');
eq(templateFromMission({ client_name: 'Lot 12', post_type: 'WEB', description: 'D', proof_mode: 'note', client_id: 'k', client_price_ar: 9 } as any, 'Mon modèle'), { name: 'Mon modèle', title: 'Lot 12', post_type: 'WEB', description: 'D', proof_mode: 'note' }, 'mission → modèle : ni prix, ni client, ni date');
eq(applyTemplate(tpl('a', 'A', { title: 'T', post_type: 'WEB', description: 'D', proof_mode: 'both' }), ['WEB']), { title: 'T', post_type: 'WEB', description: 'D', proof_mode: 'both' }, 'modèle → formulaire');
eq(applyTemplate(tpl('a', 'A', { post_type: 'ANCIEN' }), ['WEB']).post_type, '', 'type qui n\'existe plus : ignoré');
const frozen = Object.freeze(tpl('a', 'A')); let threw = false; try { applyTemplate(frozen, []); cleanTemplates(Object.freeze([frozen])); } catch { threw = true; }
eq(threw, false, 'les données reçues ne sont jamais modifiées');

// Site / serveur
{
  const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
  const m = src.match(/\/\/ ===== BEGIN MISSIONS[^\n]*\n([\s\S]*?)\/\/ ===== END MISSIONS =====/);
  eq(!!m, true, 'serveur : bloc MISSIONS présent');
  if (m) {
    const js = transformSync(m[1] + '\n;globalThis.__t = cleanMissionTemplates;', { loader: 'ts' }).code;
    new Function(js)();
    const srv = (globalThis as any).__t as (l: unknown) => unknown;
    const lists: unknown[] = [undefined, null, 'x', [], [{ id: 'a', name: 'A' }], [{ id: 'a', name: 'A', title: 'T', post_type: 'W', description: 'D', proof_mode: 'both' }], [{ id: 'a', name: '  A  ' }, { id: 'b', name: 'a' }], [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }], [{ name: 'Sans id' }], [{ id: 'a', name: 'A', proof_mode: 'zzz' }], [{ id: 'a', name: ['A'] }], [{ id: 'a', name: 'A', title: 5 }], [{ id: 'x'.repeat(99), name: 'n'.repeat(99), title: 't'.repeat(200), description: 'd'.repeat(900), post_type: 'p'.repeat(99) }], Array.from({ length: 50 }, (_, i) => ({ id: 'i' + i, name: 'N' + i })), [null, 5, [], { id: 'ok', name: 'Bon' }], [{ id: 'a', name: 'A\u0000B' }], [{ id: 'a', name: 'A', proof_mode: '' }], [{ id: 'a', name: 'A', proof_mode: null, description: null }]];
    let same = 0;
    for (const l of lists) { const a = JSON.stringify(cleanTemplates(l)), b = JSON.stringify(srv(l)); if (a === b) same++; else console.log('   différence', JSON.stringify(l).slice(0, 120), a.slice(0, 120), b.slice(0, 120)); }
    eq(same, lists.length, `site et serveur répondent pareil sur ${lists.length} listes (bonnes et mauvaises)`);
    const polluted = srv(JSON.parse('[{"id":"p","name":"P","__proto__":{"x":1}}]'));
    eq(polluted, [], 'serveur : clé « __proto__ » : modèle écarté');
    eq(src.includes('"mission_templates"]') || src.includes('"mission_templates",'), true, 'serveur : les modèles ne sont jamais envoyés à un employé (liste SETTINGS_ADMIN_KEYS)');
    eq(/sentTpl[\s\S]{0,200}cleanMissionTemplates\(sentTpl\)/.test(src), true, 'serveur : les modèles écrits dans les réglages sont revérifiés');
  }
}

console.log(`\n${n - fails}/${n} contrôles réussis`);
process.exit(fails ? 1 : 0);
