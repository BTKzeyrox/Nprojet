// « Créer mon type de travail » (module 26, M26.6b) : le site et le serveur donnent les mêmes résultats ; un type faux est refusé ; le Chef d'équipe reçoit le modèle d'entreprise mais jamais les tarifs. Lancer : npm run check:custom-work-types
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { cwValidate, cleanCustomTypes, CW_MAX_TYPES } from '../src/utils/customWorkTypes';
import { BUSINESS_MODELS } from '../src/utils/workTypes';

let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const src = readFileSync('supabase/functions/df-api/index.ts', 'utf8');
const grab = (name: string) => { const m = src.match(new RegExp(`// ===== BEGIN ${name}[^\\n]*\\n([\\s\\S]*?)// ===== END ${name} =====`)); if (!m) throw new Error(`bloc ${name} introuvable`); return m[1]; };
new Function(transformSync(grab('CUSTOMWORK') + '\n;globalThis.__c = { cwValidate, cleanCustomTypes };', { loader: 'ts' }).code)();
const S = (globalThis as any).__c;
const norm = (t: string) => t.replace(/export /g, '').replace(/\s+/g, ' ').trim();
ok(norm(readFileSync('src/utils/customWorkTypes.ts', 'utf8').match(/\/\/ ===== BEGIN CUSTOMWORK =====\n([\s\S]*?)\/\/ ===== END CUSTOMWORK =====/)![1]) === norm(grab('CUSTOMWORK')), 'le bloc du serveur est la copie exacte du code du site');

const good = { id: 'c-emballage', name: { fr: 'Emballage', en: 'Packing' }, measure: 'quantity', pay: 'piece', entry: ['admin', 'team_lead'], unit: { fr: 'boîte', en: 'box' } };
ok(cwValidate(good).ok, 'un type correct est accepté');
const bad = (patch: any, err: string, m: string) => { const r: any = cwValidate({ ...good, ...patch }); ok(!r.ok && r.error === err, m); };
bad({ id: 'emballage' }, 'id', 'identifiant sans « c- » refusé (jamais celui d\'un type du modèle)');
bad({ id: 'c-' }, 'id', 'identifiant vide refusé'); bad({ id: 'C-Emb' }, 'id', 'identifiant en majuscules refusé');
bad({ name: { fr: 'Emballage', en: '' } }, 'name', 'nom anglais manquant refusé'); bad({ name: { fr: '<>', en: '<<>>' } }, 'name', 'nom fait de signes < > seulement refusé');
bad({ measure: 'x' }, 'measure', 'mesure inconnue refusée'); bad({ pay: 'x' }, 'pay', 'paie inconnue refusée');
bad({ entry: [] }, 'entry', 'personne ne saisit : refusé'); bad({ entry: ['x'] }, 'entry', 'saisie par un inconnu : refusé');
bad({ pay: 'day' }, 'incompatible', 'quantité payée au jour : refusé'); bad({ measure: 'presence', pay: 'piece' }, 'incompatible', 'présence payée à la pièce : refusé');
bad({ unit: undefined }, 'unit', 'quantité sans unité : refusé');
ok(cwValidate({ ...good, measure: 'presence', pay: 'hour', unit: undefined }).ok && cwValidate({ ...good, measure: 'proof', pay: 'mission', unit: undefined }).ok && cwValidate({ ...good, measure: 'none', pay: 'fixed', unit: undefined }).ok, 'présence/heure, preuve/mission, rien/fixe : acceptés sans unité');
ok(!cwValidate(null).ok && !cwValidate('x').ok && !cwValidate([]).ok, 'valeurs absurdes refusées sans erreur');
ok(BUSINESS_MODELS.every(m => m.types.every(t => !/^c-/.test(t.id))), 'aucun type du modèle ne commence par « c- » (pas de collision)');
const many = Array.from({ length: 20 }, (_, i) => ({ ...good, id: `c-t${i}` }));
ok(cleanCustomTypes(many).length === CW_MAX_TYPES, '12 types au plus');
ok(cleanCustomTypes([good, good]).length === 1 && cleanCustomTypes('x').length === 0 && cleanCustomTypes([null, 5, good]).length === 1, 'doublon, texte, valeurs absurdes : ignorés');
ok(JSON.stringify(cleanCustomTypes([{ ...good, entry: ['team_lead', 'admin', 'admin'] }])[0].entry) === JSON.stringify(['team_lead', 'admin']), 'qui saisit : sans doublon, toujours dans le même ordre');

// Site = serveur sur des milliers de types tirés au hasard
let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
let same = 0, total = 0;
for (let i = 0; i < 5000; i++) {
  const x = rnd() < 0.05 ? pick([null, 5, 'x', []]) : { id: pick(['c-ab', 'c-emb', 'ab', 'c-', 'C-X', 5, undefined, 'c-' + 'a'.repeat(40)]), name: pick([{ fr: 'A', en: 'B' }, { fr: '', en: 'B' }, { fr: '<b>x</b>', en: 'y' }, undefined, { fr: 'é'.repeat(80), en: 'z' }]), measure: pick(['quantity', 'presence', 'proof', 'tasks', 'none', 'x', 5]), pay: pick(['piece', 'day', 'hour', 'mission', 'fixed', 'x', undefined]), entry: pick([['admin'], ['team_lead', 'paper'], [], ['x'], 'admin', undefined, ['admin', 'admin']]), unit: pick([undefined, { fr: 'boîte', en: 'box' }, { fr: '', en: '' }, { fr: 'x'.repeat(40), en: 'y' }]) };
  const lst = [x, x, pick([x, good, null])];
  total++; if (JSON.stringify(cwValidate(x)) === JSON.stringify(S.cwValidate(x)) && JSON.stringify(cleanCustomTypes(lst)) === JSON.stringify(S.cleanCustomTypes(lst))) same++;
}
ok(same === total, `site = serveur sur ${total} types (${same} identiques)`);

// Serveur : réglages et Chef d'équipe
ok(/sentWt !== undefined\) toSave = \{ \.\.\.toSave, work_types: cleanCustomTypes\(sentWt\)/.test(src), 'serveur : les types envoyés sont revérifiés à l\'enregistrement des réglages');
ok(!/SETTINGS_ADMIN_KEYS: string\[\] = \[[^\]]*"work_types"/.test(src), 'serveur : les types ne sont pas cachés au Chef d\'équipe (pas d\'argent dedans)');
ok(/me\.role === "team_lead"\) out\.company = \{ \.\.\.out\.company, work: \{ business_model:/.test(src), 'serveur : le Chef d\'équipe reçoit le modèle d\'entreprise et rien d\'autre de la section paie');
// Site
const st = readFileSync('src/db/store.ts', 'utf8'), ui = readFileSync('src/components/CustomWorkTypes.tsx', 'utf8'), cc = readFileSync('src/components/CompanyConditions.tsx', 'utf8'), ws = readFileSync('src/views/WorksheetView.tsx', 'utf8');
ok(/saveCustomWorkType[\s\S]*role !== 'admin'/.test(st) && /removeCustomWorkType[\s\S]*role !== 'admin'/.test(st), 'magasin : créer et supprimer un type = responsable seulement');
ok(/sec\.id === 'work' && <CustomWorkTypes/.test(cc) && /data-cwt-save/.test(ui), 'Réglages : le formulaire est dans la section « Types de travail et paie » (donc caché module fermé)');
ok(/getCustomWorkTypes\(\)/.test(ws), 'Feuille du jour : propose aussi les types créés à la main');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
