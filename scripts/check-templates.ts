// Contrôle des modèles de messages (M11.11). Pur. Lancer : npm run check:templates
import { TEMPLATES, FIELDS, compose, findTemplate, type Field } from '../src/utils/messageTemplates';
let n = 0, fails = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK', m); };
const good: Record<Field, string> = { client: 'Société Soleil', employee: 'Camille', date: '2026-11-05', amount: '150000', reason: 'mission terminée sans souci' };
const bad = /undefined|null|NaN|\[object|\{\w+\}/;
const accents = /[àâçéèêëîïôùûœ]/i;

ok(TEMPLATES.length >= 5 && new Set(TEMPLATES.map(t => t.id)).size === TEMPLATES.length, 'au moins 5 modèles, identifiants uniques');
for (const t of TEMPLATES) {
  const used = [...t.fr.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(','), usedEn = [...t.en.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(','), decl = [...new Set(t.fields)].sort().join(',');
  ok(used === decl && usedEn === decl, `${t.id} : les champs du texte FR et EN = les champs déclarés (${decl})`);
  ok(t.fields.every(f => f in FIELDS), `${t.id} : tous les champs sont connus`);
  for (const lang of ['fr', 'en'] as const) {
    const r = compose(t.id, good, lang);
    ok(r.ok && !bad.test(r.ok ? r.text : '') && (lang === 'fr' || !accents.test((r.ok ? r.text : '').replace(/Société|mission terminée sans souci/g, ''))), `${t.id} ${lang} : texte complet, propre`);
  }
  for (const f of t.fields) {
    const r = compose(t.id, { ...good, [f]: '' }, 'fr');
    ok(!r.ok && r.missing.includes(f), `${t.id} : champ « ${f} » vide = message refusé`);
    const r2 = compose(t.id, { ...good, [f]: '   ' }, 'fr');
    ok(!r2.ok, `${t.id} : champ « ${f} » en espaces = refusé`);
  }
}
const pr = compose('payment_reminder', good, 'fr');
ok(pr.ok && pr.text.includes('150 000 Ar') && pr.text.includes('05/11/2026') && pr.text.includes('Société Soleil'), 'relance : montant « 150 000 Ar », date 05/11/2026, nom du client');
ok(!compose('payment_reminder', { ...good, date: '05/11/2026' }).ok && !compose('payment_reminder', { ...good, date: '2026-13-45' }).ok, 'date mal écrite ou impossible = refusée (invalid)');
ok(!compose('payment_reminder', { ...good, amount: 'abc' }).ok && !compose('payment_reminder', { ...good, amount: '-5' }).ok && !compose('payment_reminder', { ...good, amount: '0' }).ok, 'montant pas un nombre, négatif ou zéro = refusé');
ok(compose('payment_reminder', { ...good, amount: '1 500,5' }).ok, 'montant avec espace et virgule accepté');
const inj = compose('client_thanks', { ...good, client: '{reason} {amount}', reason: 'ok' });
ok(inj.ok && inj.text.includes('{reason} {amount}') && inj.text.split('ok').length === 2, 'injection : un champ qui contient « {reason} » n\'est pas re-remplacé');
const long = compose('client_thanks', { ...good, reason: 'x'.repeat(5000) });
ok(long.ok && long.text.length < 500, 'texte très long coupé à 200 caractères');
const nl = compose('client_thanks', { ...good, client: 'Ligne1\nLigne2\r\nLigne3' });
ok(nl.ok && !/[\r\n]/.test(nl.text), 'retours à la ligne dans un champ aplatis');
ok(!compose('inconnu', good).ok && findTemplate('inconnu') === undefined, 'modèle inconnu = refusé, sans plantage');
ok(!compose('team_notice', {}).ok, 'aucune valeur = refusé');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) process.exit(1);
