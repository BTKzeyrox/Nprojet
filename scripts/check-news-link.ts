// Contrôle du lien vers une publication et de sa lecture dans un message. Lancer : npm run check:news-link
import { newsLink, newsNavId, newsIdFromNav, newsShareText, splitLinks } from '../src/utils/newsLink';
import { parseDeepLinkUrl, deepLinkAllowed } from '../src/utils/deepLink';

let fails = 0, total = 0;
const eq = (got: unknown, want: unknown, name: string) => { total++; if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } };
const ok = (c: boolean, name: string) => eq(!!c, true, name);
const O = 'https://nprojet-beta.vercel.app';

for (const id of ['news-1793330059483', 'news-1793330059483-a1b2c3', 'sim-n1', 'demo_n170', 'n_1.2:3']) {
  const url = newsLink(O, id);
  ok(url.startsWith(`${O}/?`), `lien : adresse du site (${id})`);
  const back = parseDeepLinkUrl(url);
  eq(back, { go: 'feed', nav: newsNavId(id) }, `lien : relu à l'identique (${id})`);
  eq(newsIdFromNav(back?.nav), id, `repère : retrouve le numéro (${id})`);
}
eq(newsLink(`${O}/`, 'n1'), newsLink(O, 'n1'), 'lien : une barre finale dans l\'adresse ne change rien');
eq(newsIdFromNav('mission-4'), null, 'repère : une autre cible n\'est pas une publication');
eq(newsIdFromNav('news:'), null, 'repère : vide = rien');
eq(newsIdFromNav(null), null, 'repère : null = rien');
ok(!parseDeepLinkUrl(newsLink(O, 'a b<script>')) || parseDeepLinkUrl(newsLink(O, 'a b<script>'))!.nav === undefined, 'identifiant dangereux : jamais gardé dans le lien');
for (const r of ['admin', 'employee', 'team_lead', 'accountant']) ok(deepLinkAllowed(r, 'feed'), `tout rôle peut ouvrir Actualités (${r})`);

// ---- Texte du message ----
const p = { id: 'news-1', title: 'Congés', text: 'Bonjour à tous' };
eq(newsShareText(p, O), `Congés — Bonjour à tous\n${newsLink(O, 'news-1')}`, 'message : titre, extrait et lien');
eq(newsShareText({ id: 'news-1', text: 'x'.repeat(300) }, O).split('\n')[0].length, 141, 'message : extrait coupé à 140 + …');
eq(newsShareText({ id: 'news-1' }, O), newsLink(O, 'news-1'), 'message : sans texte = le lien seul');
const sec = newsShareText({ id: 'news-2', title: 'Salaires secrets', text: 'Confidentiel', audience: ['accountant'] }, O);
ok(!sec.includes('Salaires') && !sec.includes('Confidentiel') && sec.includes(newsLink(O, 'news-2')) && sec.includes('Comptables'), 'publication réservée : ni titre ni extrait dans le message');
ok(newsShareText({ id: 'n', title: 'T', text: 'X', audience: ['employee', 'team_lead', 'accountant'] }, O).includes('T — X'), 'public = les trois rôles = tous : extrait permis');

// ---- Lecture du lien dans un message ----
const lk = newsLink(O, 'news-9');
const parts = splitLinks(`Regarde ça : ${lk}.`, O);
eq(parts.map(x => x.kind), ['text', 'link', 'text'], 'message : texte, lien, ponctuation');
eq(parts[1].kind === 'link' && parts[1].link, { go: 'feed', nav: 'news:news-9' }, 'message : le lien cliquable vise la bonne publication');
eq(parts[2].kind === 'text' && parts[2].text, '.', 'message : le point final reste du texte');
eq(splitLinks(lk, O).length, 1, 'message : un lien seul');
eq(splitLinks('Bonjour', O), [{ kind: 'text', text: 'Bonjour' }], 'message : sans lien = texte');
eq(splitLinks('', O), [{ kind: 'text', text: '' }], 'message vide');
eq(splitLinks('https://autre-site.com/?go=feed&nav=news:x', O).every(x => x.kind === 'text'), true, 'autre site : jamais un lien interne');
eq(splitLinks(`https://nprojet-beta.vercel.app.evil.com/?go=feed`, O).every(x => x.kind === 'text'), true, 'adresse qui ressemble au site : refusée');
eq(splitLinks(`${O}/page-sans-go`, O).every(x => x.kind === 'text'), true, 'adresse du site sans lien précis : texte');
eq(splitLinks(`${O}/?go=Feed%20X`, O).every(x => x.kind === 'text'), true, 'page invalide : texte');
const two = splitLinks(`${lk} et ${newsLink(O, 'news-10')}`, O);
eq(two.filter(x => x.kind === 'link').length, 2, 'deux liens dans un message');
eq(splitLinks(`(${lk})`, O).map(x => x.kind), ['text', 'link', 'text'], 'lien entre parenthèses');
eq(splitLinks(lk, '').every(x => x.kind === 'text'), true, 'sans adresse du site : jamais de lien');
eq(splitLinks(`${O}/?go=feed&nav=news:a<img src=x onerror=1>`, O).every(x => x.kind === 'text' || (x.kind === 'link' && !x.text.includes('<'))), true, 'balise dans un lien : jamais gardée');

console.log(fails ? `${fails} ÉCHEC(S) sur ${total}` : `${total}/${total} contrôles réussis`);
process.exit(fails ? 1 : 0);
