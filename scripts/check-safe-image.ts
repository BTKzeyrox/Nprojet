// Photos hors ligne : plus d'icône « image cassée », photos déjà vues gardées (200 max, Cloudinary seulement), cache vidé à la déconnexion. Lancer : npm run check:safe-image
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isCompactClass, placeholderLabel } from '../src/utils/safeImage';
import { isPhotoRequest, photoOverflow, PHOTO_MAX, PHOTO_HOST } from '../src/utils/swRules';
let fails = 0;
const ok = (c: boolean, m: string) => { if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
ok(isCompactClass('w-12 h-12 rounded-md object-cover') && isCompactClass('w-full h-10') && isCompactClass('md:w-8 h-full') && isCompactClass('w-16'), 'petites images (de 1 à 16) : cadre sans texte');
ok(!isCompactClass('w-full h-full object-cover') && !isCompactClass('w-24 h-24') && !isCompactClass('max-w-full max-h-[75vh]') && !isCompactClass('w-1/2') && !isCompactClass(''), 'grandes images : cadre avec texte');
ok(placeholderLabel(false) === 'Hors ligne' && placeholderLabel(true) === 'Image indisponible', 'texte du cadre : « Hors ligne » sans réseau, sinon « Image indisponible »');
ok(isPhotoRequest('GET', PHOTO_HOST, 'image') && !isPhotoRequest('POST', PHOTO_HOST, 'image') && !isPhotoRequest('GET', PHOTO_HOST, 'script') && !isPhotoRequest('GET', PHOTO_HOST, '') && !isPhotoRequest('GET', 'exemple.supabase.co', 'image') && !isPhotoRequest('GET', 'res.cloudinary.com.evil.com', 'image'), 'seules les images de Cloudinary sont gardées (ni données, ni autre site, ni autre méthode)');
ok(photoOverflow(PHOTO_MAX) === 0 && photoOverflow(PHOTO_MAX + 1) === 1 && photoOverflow(260) === 60 && photoOverflow(0) === 0 && photoOverflow(NaN) === 0 && PHOTO_MAX === 200, 'au plus 200 photos : on retire les plus anciennes');
const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(n) ? [p] : []; });
const NOT_REMOTE = new Set(['src/components/SafeImage.tsx', 'src/components/Avatar.tsx', 'src/components/LightboxModal.tsx', 'src/components/ReportProblemModal.tsx']);
const bad: string[] = [];
for (const f of walk('src')) {
  if (NOT_REMOTE.has(f.replace(/\\/g, '/'))) continue;
  readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
    if (!/<img\b/.test(l)) return;
    // permis : aperçus locaux (images choisies ou collées, jamais en échec) et l'image de la messagerie qui a son propre cadre de remplacement
    if (/pendingUrls|setFailed|onError=/.test(l)) return;
    bad.push(`${f}:${i + 1}`);
  });
}
ok(bad.length === 0, `aucune balise <img> nue pour une photo distante (utiliser <SafeImage>) ${bad.length ? '→ ' + bad.join(', ') : ''}`);
const av = readFileSync('src/components/Avatar.tsx', 'utf8');
ok(/onError=\{\(\) => setFailed\(true\)\}/.test(av) && /addEventListener\('online', retry\)/.test(av) && /if \(src && !failed\)/.test(av), 'photo de profil : initiales si la photo ne charge pas, la photo revient avec la connexion');
const si = readFileSync('src/components/SafeImage.tsx', 'utf8');
ok(/role="img"/.test(si) && /addEventListener\('online', retry\)/.test(si) && /onError=\{e => \{ setFailed\(true\)/.test(si), 'SafeImage : cadre de remplacement, nouvel essai au retour de la connexion');
const sw = readFileSync('public/sw.js', 'utf8');
ok(/isPhotoRequest\(req\.method, url\.hostname, req\.destination\)/.test(sw) && /mode: 'cors', credentials: 'omit'/.test(sw) && /var PHOTOS = 'df-images'/.test(sw), 'service worker : photos Cloudinary gardées dans un cache à part, en mode cors');
const app = readFileSync('src/App.tsx', 'utf8'), ctl = readFileSync('src/db/offlineController.ts', 'utf8'), ic = readFileSync('src/utils/imageCache.ts', 'utf8');
ok(/const handleLogout = async \(\) => \{[\s\S]*?void clearImageCache\(\);[\s\S]*?db\.logout\(\)/.test(app) && /await clearImageCache\(\);[^\n]*\n\s*this\.writeWho\(null\)/.test(ctl) && /PHOTO_CACHE = 'df-images'/.test(ic) && /caches\.delete\(PHOTO_CACHE\)/.test(ic), 'photos gardées effacées à la déconnexion et avec la copie locale');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon.');
process.exit(fails ? 1 : 0);
