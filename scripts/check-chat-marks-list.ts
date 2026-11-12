// Chat : liste « Importants et épinglés », couleurs de bulle en dégradé, « Vu » en icônes seules.
import fs from 'node:fs';
import { markedMessages, markedCount, previewOf } from '../src/utils/chatMarksList';
import { MARK_STYLE, markBackground, MARK_SHADOW } from '../src/utils/chatMarks';

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log('OK   ' + m); } else { fail++; console.log('ECHEC ' + m); } };
const msg = (id: string, o: any = {}): any => ({ id, sender_id: 'u1', sender_name: 'Rina Rakoto', message: `texte ${id}`, timestamp: new Date(Date.UTC(2026, 10, 10, 8, Number(id.replace(/\D/g, '')) || 0)).toISOString(), recipient_id: 'all', ...o });
const NOW = Date.UTC(2026, 10, 12, 12, 0);

// ---- aperçu ----
ok(previewOf({ message: '  Bonjour   à\ntous ' } as any) === 'Bonjour à tous', 'aperçu : espaces et retours à la ligne réduits');
ok(previewOf({ message: 'x'.repeat(300) } as any, 50).length === 50 && previewOf({ message: 'x'.repeat(300) } as any, 50).endsWith('…'), 'aperçu : texte long coupé avec « … »');
ok(previewOf({ message: '', attachment_url: 'u', attachment_kind: 'image' } as any) === 'Photo', 'aperçu : photo');
ok(previewOf({ message: '', attachment_url: 'u', attachment_kind: 'file', attachment_name: 'devis.pdf' } as any) === 'Fichier : devis.pdf' && previewOf({ message: '', attachment_url: 'u', attachment_kind: 'file' } as any) === 'Fichier : document', 'aperçu : fichier avec son nom (ou « document »)');
ok(previewOf({ message: '', poll: { question: 'On mange où ?' } } as any) === 'Sondage : On mange où ?', 'aperçu : sondage');
ok(previewOf({ message: '' } as any) === '…', 'aperçu : message vide');

// ---- onglets ----
const all = [msg('m1', { pinned: true, pinned_at: '2026-11-11T10:00:00Z' }), msg('m2'), msg('m3', { pinned: true, pinned_at: '2026-11-12T09:00:00Z' }), msg('m4'), msg('m5')];
{
  const imp = markedMessages(all, ['m2', 'm4', 'm1'], 'important', { now: NOW });
  ok(imp.map(m => m.id).join() === 'm4,m2,m1', 'Importants : du plus récent au plus ancien (m4, m2, m1)');
  const pin = markedMessages(all, ['m2'], 'pinned', { now: NOW });
  ok(pin.map(m => m.id).join() === 'm3,m1', 'Épinglés : par date d\'épinglage, le dernier épinglé d\'abord (m3 puis m1)');
  ok(markedMessages(all, ['zzz'], 'important', { now: NOW }).length === 0, 'aucun message important : liste vide');
}
// ---- ce qui n'apparaît jamais ----
{
  const list = [msg('m1', { pinned: true }), msg('m2', { pinned: true, deleted_at: 5 }), msg('m3', { pinned: true }), msg('m4', { pinned: true, send_at: NOW + 3600_000 }), msg('m5', { pinned: true, send_at: NOW - 1000 }), msg('m1', { pinned: true })];
  const r = markedMessages(list, [], 'pinned', { hidden: new Set(['m3']), now: NOW });
  ok(r.map(m => m.id).sort().join() === 'm1,m5', 'jamais : supprimé, « supprimé pour moi », programmé pas encore parti ; un programmé déjà parti compte ; pas de doublon');
  ok(markedMessages(all, ['m2', 'm4'], 'important', { inScope: m => m.id === 'm4', now: NOW }).map(m => m.id).join() === 'm4', 'portée : « Cette discussion » filtre');
  ok(markedMessages(null as any, null as any, 'important').length === 0 && markedMessages([null, 5, {}] as any, ['x'], 'pinned').length === 0, 'listes absentes ou lignes illisibles : vide, jamais de plantage');
}
ok(markedCount(all, ['m1', 'm2'], { now: NOW }) === 3, 'compteur : m1 (important ET épinglé) compté une fois + m2 + m3 = 3');
ok(markedCount(all, [], { now: NOW, hidden: new Set(['m1', 'm3']) }) === 0, 'compteur : les messages cachés ne comptent pas');

// ---- couleurs en dégradé ----
const lum = (h: string) => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (h: string) => 1.05 / (lum(h) + 0.05);
ok(Object.values(MARK_STYLE).every(s => /^#[0-9a-f]{6}$/.test(s.from) && /^#[0-9a-f]{6}$/.test(s.to) && s.from !== s.to), 'chaque repère a un dégradé : deux tons différents');
ok(Object.values(MARK_STYLE).every(s => contrast(s.from) >= 4.5 && contrast(s.to) >= 4.5), 'texte blanc lisible aux DEUX bouts du dégradé (contraste ≥ 4,5, norme AA)');
ok(markBackground('important') === 'linear-gradient(135deg, #9f1239 0%, #e11d48 100%)' && /^linear-gradient\(135deg, #[0-9a-f]{6} 0%, #[0-9a-f]{6} 100%\)$/.test(markBackground('pinned')), 'fond = dégradé léger à 135°');
ok(/rgba\(/.test(MARK_SHADOW) && /inset/.test(MARK_SHADOW), 'ombre douce avec fin reflet');

// ---- branchements dans l'écran ----
const cv = fs.readFileSync('src/components/ChatView.tsx', 'utf8'), cm = fs.readFileSync('src/components/ChatMarksList.tsx', 'utf8');
ok(/backgroundImage: markBackground\(mk\)/.test(cv) && /boxShadow: MARK_SHADOW/.test(cv) && /backgroundColor: MARK_STYLE\[mk\]\.bg/.test(cv), 'bulle : dégradé + ombre (avec un fond uni de repli)');
ok(/data-chat-marks-open onClick=\{\(\) => setMarksOpen\('this'\)\}/.test(cv) && /data-chat-marks-open-all onClick=\{\(\) => setMarksOpen\('all'\)\}/.test(cv), 'boutons drapeau : dans la discussion (« Cette discussion ») et dans la liste des discussions (« Toutes »)');
ok(/data-chat-marks-count/.test(cv) && /marksHere/.test(cv), 'pastille avec le nombre d\'importants et épinglés de la discussion');
ok(/setThreadId\(thread\); setShowList\(false\);[^}]*setJumpAfter\(\{ thread, id \}\)/.test(cv) && /current\.id === jumpAfter\.thread\) \{[^}]*setTimeout\(\(\) => jumpTo\(id\), 150\)/.test(cv), 'toucher un message d\'une autre discussion : on l\'ouvre d\'abord, puis on amène exactement au message');
ok(/data-marks-scope="this"/.test(cm) && /data-marks-scope="all"/.test(cm) && /data-marks-tab="important"/.test(cm) && /data-marks-tab="pinned"/.test(cm), 'fenêtre : « Cette discussion / Toutes » et onglets Importants / Épinglés');
ok((cm.match(/min-h-\[44px\]/g) || []).length >= 1 && /w-11 h-11/.test(cm) && /role="dialog"/.test(cm) && /role="tab"/.test(cm) && /aria-selected/.test(cm) && /Escape/.test(cm), 'fenêtre : boutons de 44 px, rôles pour lecteur d\'écran, Échap ferme');
ok(!/text-\[(8|9|10)px\]/.test(cm) && !/text-\[(8|9|10)px\]/.test(cv.slice(cv.indexOf('data-chat-marks-count') - 200, cv.indexOf('data-chat-marks-count') + 200)), 'aucun texte sous 11 px dans la fenêtre ni sur la pastille');
// « Vu » en icônes seules
const seen = cv.slice(cv.indexOf('« Vu » : seulement l\'icône'), cv.indexOf('« Vu » : seulement l\'icône') + 2200);
ok(!/>\s*Vu\s*</.test(seen) && !/>\s*Pas encore vu\s*</.test(seen) && !/Vu par tous'\s*:\s*`Vu par \$\{readers\.length\}\/\$\{totalOthers\}`\}\s*</.test(seen) && !/\/>\s*\{readers\.length === totalOthers \? 'Vu par tous'/.test(seen), '« Vu » : plus aucun mot affiché dans la bulle (ni Vu, ni Pas encore vu, ni Vu par tous, ni Vu par n/N)');
ok(/data-seen="all"/.test(seen) && /data-seen="none"/.test(seen) && /data-seen=\{readers\.length === totalOthers \? 'all' : 'some'\}/.test(seen), '« Vu » : trois états en icône (envoyé, vu par certains, vu par tous)');
ok(/aria-label="Vu"/.test(seen) && /aria-label="Pas encore vu"/.test(seen) && /aria-label=\{readers\.length === totalOthers \? 'Vu par tous'/.test(seen) && /onClick=\{\(\) => setSeenFor\(msg\)\}/.test(seen), '« Vu » : les mots restent pour les lecteurs d\'écran et l\'icône d\'un groupe ouvre toujours « Vu par »');
console.log(`\n${pass}/${pass + fail} contrôles réussis`);
if (fail) process.exit(1);
