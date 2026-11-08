// Messagerie : la page ne bouge pas au bout d'une liste, et le champ de message est à 40 px (BTK, 2026-11-05).
import { readFileSync } from 'node:fs';
import { shouldBlockTouchMove } from '../src/utils/chatScrollGuard';
const r = (f: string) => readFileSync(f, 'utf8');
let bad = 0; const ok = (c: boolean, m: string) => { if (!c) { bad++; console.log('✗', m); } else console.log('✓', m); };
const box = (top: number, total = 1000, view = 400) => ({ scrollTop: top, scrollHeight: total, clientHeight: view });
ok(shouldBlockTouchMove(box(0), -20) === true, 'tout en haut + doigt vers le bas : bloqué (la page ne bouge pas)');
ok(shouldBlockTouchMove(box(600), 20) === true, 'tout en bas + doigt vers le haut : bloqué');
ok(shouldBlockTouchMove(box(300), 20) === false && shouldBlockTouchMove(box(300), -20) === false, 'au milieu : la liste défile librement');
ok(shouldBlockTouchMove(box(0), 20) === false, 'tout en haut + doigt vers le haut : la liste peut descendre');
ok(shouldBlockTouchMove(box(600), -20) === false, 'tout en bas + doigt vers le bas : la liste peut remonter');
ok(shouldBlockTouchMove(box(0, 300, 400), 15) === true && shouldBlockTouchMove(box(0, 300, 400), -15) === true, 'liste plus courte que l\'écran : tout geste bloqué');
ok(shouldBlockTouchMove(box(0), 0) === false, 'doigt immobile : rien à bloquer');
const chat = r('src/components/ChatView.tsx'), app = r('src/App.tsx'), css = r('src/index.css');
ok((chat.match(/guardScroller\(el\)/g) || []).length === 2, 'ChatView : garde-fou sur la liste des messages ET la liste des discussions');
ok(/classList\.add\('df-chat-open'\)/.test(app) && /classList\.remove\('df-chat-open'\)/.test(app), 'App : classe df-chat-open posée à l\'ouverture et retirée à la sortie (jamais de blocage resté)');
ok(/html\.df-chat-open, html\.df-chat-open body \{[^}]*overflow: hidden[^}]*overscroll-behavior: none/.test(css), 'CSS : page figée et sans rebond quand la messagerie est ouverte, sur tous les écrans');
ok(/<textarea[\s\S]{0,1800}flex-1 min-w-0 resize-none[^"]*text-base[\s\S]{0,200}height: 40/.test(chat), 'champ de message : 40 px de haut au départ (grandit ensuite), texte 16 px (en dessous l\'iPhone zoome)');
ok(!/flex-1 min-w-0 h-12/.test(chat) && /w-10 h-10 rounded-full[^`]*bg-blue-600/.test(chat), 'boutons Joindre et Envoyer : 40 px');
// Citation d'une réponse : bloc arrondi AÉRÉ dans la bulle, avec de l'espace en haut, à gauche et à droite (BTK, 2026-11-07 : « trop serré »)
{
  const chat = r('src/components/ChatView.tsx');
  ok(/data-reply-quote className=\{`[^`]*-mx-1\.5 w-\[calc\(100%\+0\.75rem\)\]/.test(chat), 'citation : espace gauche et droit autour du bloc');
  ok(/data-reply-quote className=\{`[^`]*mt-0\.5[^`]*rounded-xl/.test(chat), 'citation : bloc arrondi avec de l\'espace en haut');
}
process.exit(bad ? 1 : 0);
