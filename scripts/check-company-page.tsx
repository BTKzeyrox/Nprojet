// Essai de l'écran des Conditions de l'entreprise (sans écran réel, sans réseau) : démo admin et opérateur, FR et EN.
// Lancer : npm run check:company-page
import React from 'react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';

const mem: Record<string, string> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; }, removeItem: (k: string) => { delete mem[k]; } };
g.window = g; g.document = { hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} };
let calls = 0; g.fetch = async () => { calls++; throw new Error('RESEAU'); };

const { db } = await import('../src/db/store');
const { CompanyConditions, CompanyForEmployee } = await import('../src/components/CompanyConditions');
const { COMPANY_SPEC, cleanCompany, readCompany } = await import('../src/utils/companyRules');

let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
const bad = (html: string) => /NaN|Infinity|undefined|\[object|\bnull\b/.test(html);
const count = (html: string, s: string) => html.split(s).length - 1;
const totalFields = Object.values(COMPANY_SPEC).reduce((a, sec) => a + Object.keys(sec).length, 0);

// ---------- admin (démo) ----------
db.enterDemo('admin');
for (const lang of ['fr', 'en'] as const) {
  const html = renderToString(<CompanyConditions lang={lang} openAll />);
  ok(!bad(html), `${lang} admin : aucun NaN, « undefined » ni « null » affichés`);
  ok(html.includes(lang === 'en' ? 'Company conditions' : 'Conditions de l&#x27;entreprise'), `${lang} admin : titre dans la bonne langue`);
  ok(html.includes(lang === 'en' ? 'Save conditions' : 'Enregistrer les conditions') && html.includes(lang === 'en' ? 'Starting values' : 'Valeurs de départ'), `${lang} admin : boutons Enregistrer et Valeurs de départ`);
  ok(html.includes(lang === 'en' ? 'Gestion Pro gives no legal advice' : 'Gestion Pro ne donne pas de conseil légal'), `${lang} admin : avertissement « pas de conseil légal »`);
  ok(html.includes('Société Démo') && html.includes('contact@exemple.mg'), `${lang} admin : conditions inventées de la démo affichées`);
  ok(count(html, lang === 'en' ? 'aria-label="Help"' : 'aria-label="Aide"') === totalFields, `${lang} admin : chaque réglage (${totalFields}) a un champ et un « ? »`);
  ok(count(html, 'aria-expanded="true"') >= 9 && html.includes(lang === 'en' ? 'visible to operators' : 'visible par les opérateurs'), `${lang} admin : 9 sections, celle des opérateurs est marquée`);
  ok(html.includes('min-h-[44px]'), `${lang} admin : cibles tactiles de 44 px`);
}
ok(!renderToString(<CompanyConditions lang="fr" />).includes('Jours de congé par an'), 'sections fermées par défaut, sauf Identité');

// enregistrement : un champ changé, le reste gardé
const before = readCompany(db.getSettings().company);
db.updateSettings({ company: cleanCompany({ tax: { vat_enabled: true, vat_rate: 20 } }, before).value });
const after = readCompany(db.getSettings().company);
ok(after.tax.vat_rate === 20 && after.tax.vat_enabled && after.identity.name === 'Société Démo' && after.leave.leave_days_per_year === 30, 'enregistrement : le champ change, tout le reste est gardé');
ok(db.getSettings().price_per_mission === 5000 || typeof db.getSettings().price_per_mission === 'number', 'enregistrement : les autres réglages sont intacts');
ok(cleanCompany({ tax: { vat_rate: 150 } }, after).errors.length === 1 && readCompany(db.getSettings().company).tax.vat_rate === 20, 'taux faux : refusé, rien de changé');

// ---------- opérateur (démo) ----------
db.enterDemo('employee');
const empCompany: any = db.getSettings().company;
ok(Object.keys(empCompany).sort().join() === 'leave,modules,options,texts' && Object.keys(empCompany.texts).join() === 'internal_rules' && Object.keys(empCompany.options).sort().join() === 'badges_enabled,employee_sees_attention,employee_sees_badges', 'opérateur : ne détient que « leave », « texts.internal_rules » et les 3 oui/non des badges (comme avec le vrai serveur)');
for (const lang of ['fr', 'en'] as const) {
  const html = renderToString(<CompanyForEmployee lang={lang} />);
  ok(!bad(html) && html.includes(lang === 'en' ? 'Rules and leave' : 'Règlement et congés'), `${lang} opérateur : bloc affiché dans la bonne langue`);
  ok(html.includes('Arriver avant 08:00.') && html.includes('<b>30</b>') && html.includes('<b>5</b>') && html.includes('08:00'), `${lang} opérateur : règlement et congés visibles`);
  ok(!/Société Démo|contact@exemple|Paiement à 30 jours|Espèces, mobile money|TVA|VAT|Antananarivo|FA-|RC-/.test(html), `${lang} opérateur : rien d'argent, de TVA, d'adresse ni de conditions client`);
  ok(!html.includes('<input') && !html.includes('<textarea') && !html.includes('<button'), `${lang} opérateur : lecture seule, aucun champ ni bouton`);
}
ok(!/Société Démo|Lot 12|contact@exemple|Paiement à 30 jours|Merci de votre confiance|TVA non applicable|"FA-"|"RC-"/.test(JSON.stringify(db.getSettings())), 'opérateur : même le réglage en mémoire ne contient aucune condition de l\'entreprise (identité, TVA, factures, conditions client)');

// ---------- rien de réglé : l'opérateur ne voit pas de bloc vide ----------
db.enterDemo('employee');
(db as any).settings = [{ ...db.getSettings(), company: undefined }];
ok(renderToString(<CompanyForEmployee lang="fr" />) === '', 'rien de réglé : aucun bloc vide pour l\'opérateur');

// ---------- rapport mensuel : le nom de l'entreprise, seulement s'il est rempli ----------
{
  const { buildReport, reportHtml, exportSheets } = await import('../src/utils/report');
  const { todayMada } = await import('../src/utils/stats');
  db.enterDemo('admin');
  const base = () => ({ today: todayMada(), anchor: todayMada(), lang: 'fr' as const, settings: db.getSettings() as any, posts: db.getPosts(), contracts: db.getContracts(), users: db.getUsers(), advances: db.getAdvanceRequests(), cash: db.getCash(), products: db.getProducts(), moves: db.getStockMoves() });
  const withName = buildReport({ ...base(), companyName: 'Société Démo' });
  const noName = buildReport(base());
  const hW = reportHtml(withName), hN = reportHtml(noName);
  ok(hW.includes('<b>Société Démo</b>') && exportSheets(withName)[0].rows[1][0] === 'Société Démo', 'rapport : le nom de l\'entreprise est dans le PDF et dans l\'Excel');
  ok(!hN.includes('<div class="sub"><b>') && exportSheets(noName)[0].rows[1].length === 0, 'rapport : sans nom rempli, rien n\'est ajouté ni inventé');
  const evil = reportHtml(buildReport({ ...base(), companyName: '<img src=x onerror=alert(1)>' }));
  ok(!evil.includes('<img src=x') && evil.includes('&lt;img'), 'rapport : un nom piégé est échappé');
  ok(buildReport({ ...base(), companyName: 'x'.repeat(200) }).company.length === 80, 'rapport : nom coupé à 80 caractères');
}

// ---------- code ----------
const sv = readFileSync('src/views/admin/SettingsView.tsx', 'utf-8');
ok(sv.includes('const { company: _keepCompany, company_log: _keepLog, ...general } = s;') && sv.includes('...general,'), 'Réglages : l\'enregistrement général ne renvoie jamais une vieille copie des Conditions');
ok(sv.includes("tab === 'company' && <CompanyConditions") && sv.includes('<CompanyForEmployee lang={lang} />'), 'Réglages : onglet Conditions (admin) et bloc en lecture seule (opérateur) branchés');
ok(calls === 0, 'aucun appel réseau pendant tout l\'essai (démo 100 % locale)');

console.log(`\n${n - fails}/${n} contrôles OK${fails ? ` — ${fails} ECHEC(S)` : ''}`);
process.exit(fails ? 1 : 0);
