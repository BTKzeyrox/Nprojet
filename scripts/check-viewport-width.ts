// Contrôle de la largeur d'écran après rotation (défaut vu sur iPhone / iPad, 2026-11-01). Lancer : npm run check:viewport-width
import { readFileSync } from 'node:fs';
import { readViewportWidth } from '../src/utils/viewportWidth';

let fails = 0, total = 0;
const eq = (got: unknown, want: unknown, name: string) => { total++; if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log(`ECHEC ${name}\n   obtenu  ${JSON.stringify(got)}\n   attendu ${JSON.stringify(want)}`); } };
const ok = (c: boolean, name: string) => eq(!!c, true, name);
const W = (inner: number, client?: number, vv?: { width: number; scale: number } | null) => ({ innerWidth: inner, document: { documentElement: { clientWidth: client } }, visualViewport: vv });

eq(readViewportWidth(W(430, 430)), 430, 'portrait : 430');
eq(readViewportWidth(W(932, 932)), 932, 'paysage : 932');
eq(readViewportWidth(W(430, 932)), 932, 'rotation en cours : innerWidth garde l\'ancien portrait, la page est déjà large → 932 (le défaut du menu coincé)');
eq(readViewportWidth(W(932, 430)), 430, 'retour en portrait : la page fait 430 et la vue visible aussi → 430');
eq(readViewportWidth(W(430, 430, { width: 932, scale: 1 })), 932, 'vue visible déjà large (rotation) : on prend la plus large');
eq(readViewportWidth(W(932, 932, { width: 300, scale: 2 })), 932, 'zoom (scale 2) : la vue visible étroite est ignorée');
eq(readViewportWidth(W(932, undefined)), 932, 'pas de clientWidth : innerWidth');
eq(readViewportWidth(W(932, 0)), 932, 'clientWidth 0 : innerWidth');
eq(readViewportWidth(W(NaN, NaN), 1280), 1280, 'rien de lisible : valeur de repli');
eq(readViewportWidth({ innerWidth: 0 } as any, 777), 777, 'source minimale : repli');
eq(readViewportWidth(W(1024.4, 1024.4)), 1024, 'arrondi à l\'entier');

// ---- Le site utilise bien ce suivi, et plus de 100vw figé ----
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf-8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf-8');
const chat = readFileSync(new URL('../src/components/ChatView.tsx', import.meta.url), 'utf-8');
const hook = readFileSync(new URL('../src/utils/viewportWidth.ts', import.meta.url), 'utf-8');
ok(/const wide = useViewportWidth\(\)/.test(app) && !/setWide\(window\.innerWidth\)/.test(app), 'App : la largeur du menu vient du suivi fiable');
ok(/vwNow >= 768/.test(chat) && !/window\.innerWidth >= 768/.test(chat), 'Messagerie : liste / conversation suivent la rotation');
ok(!/max-width:\s*100vw/.test(css), 'CSS : plus de max-width: 100vw (bande noire après rotation)');
ok(/orientationchange/.test(hook) && /visualViewport/.test(hook) && /setTimeout\(read, ms\)/.test(hook), 'suivi : rotation, vue visible et relectures différées');
ok(/removeEventListener\('orientationchange'/.test(hook) && /clearTimeout/.test(hook), 'suivi : tout est nettoyé à la fermeture');

console.log(fails ? `${fails} ÉCHEC(S) sur ${total}` : `${total}/${total} contrôles réussis`);
process.exit(fails ? 1 : 0);
