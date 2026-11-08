// Assistant : publier une annonce (et plus tard un sondage) dans les Actualités depuis une phrase (BTK, 2026-11-08, étape C2).
// Aperçu d'abord, « Confirmer » ensuite : rien n'est publié avant. Le responsable publie comme d'habitude (db.publishNews).
import { b, type Reply } from './assistant';

export const ANN_OK_PREFIX = '__ann_ok:';
export const ANN_NO = '__ann_no';
export const ANN_MAX_TEXT = 2000; // comme le serveur (NEWS_MAX_TEXT)

export interface Announce { text: string }

const PRE = "(?:(?:s'il (?:te|vous) pla[iî]t|stp|please)[, ]+)?(?:(?:peux|pourrais)-tu\\s+|tu peux\\s+|could you\\s+|can you\\s+)?";
// « publie : … », « publie une annonce : … », « annonce : … », « poste dans les actualités : … » (les deux-points sont obligatoires : « annonce » seul reste une phrase ordinaire)
const ANN_RE = new RegExp(`^\\s*${PRE}(?:publie|publier|poste|poster|annonce|diffuse|publish|post|announce)(?:\\s+(?:une|un|cette|l')\\s*(?:annonce|publication|message|post))?(?:\\s+(?:dans|sur|aux?|in|on|to)\\s+(?:les |la |le |the )?(?:actualit[ée]s?|fil|news|feed))?\\s*[:：]\\s*([\\s\\S]+)$`, 'i');

export function parseAnnounceIntent(q: string): Announce | null {
  const raw = String(q ?? '').trim();
  if (!raw) return null;
  const m = ANN_RE.exec(raw);
  if (!m) return null;
  const text = m[1].replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, ANN_MAX_TEXT);
  return text ? { text } : null;
}

const rep = (intent: string, title: ReturnType<typeof b>, lines: ReturnType<typeof b>[], actions: Reply['actions'] = []): Reply => ({ intent, title, lines, actions, sources: b('Actualités.', 'News feed.') });
const short = (t: string, n = 400) => { const s = t.trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

export const encodeAnn = (a: Announce): string => ANN_OK_PREFIX + encodeURIComponent(JSON.stringify({ t: a.text }));
export function decodeAnn(view: string): Announce | null {
  if (!view.startsWith(ANN_OK_PREFIX)) return null;
  try {
    const o = JSON.parse(decodeURIComponent(view.slice(ANN_OK_PREFIX.length)));
    const text = typeof o.t === 'string' ? o.t.trim().slice(0, ANN_MAX_TEXT) : '';
    return text ? { text } : null;
  } catch { return null; }
}

export function announcePreview(a: Announce): Reply {
  return rep('announce_preview', b('Je vais publier cette annonce', 'I will publish this announcement'), [
    b(`« ${short(a.text)} »`, `"${short(a.text)}"`),
    b('Où : dans les Actualités, visible par toute l\'équipe, pas épinglée.', 'Where: in the News feed, visible to the whole team, not pinned.'),
    b('Rien n\'est publié tant que tu n\'as pas confirmé.', 'Nothing is published until you confirm.'),
  ], [{ label: b('Confirmer', 'Confirm'), go: { view: encodeAnn(a) } }, { label: b('Annuler', 'Cancel'), go: { view: ANN_NO } }]);
}
export const announceDone = (ok: boolean, error?: string): Reply => ok
  ? rep('announce_done', b('C\'est publié', 'Published'), [b('L\'annonce est dans les Actualités.', 'The announcement is in the News feed.')], [{ label: b('Voir les Actualités', 'See the News feed'), go: { view: 'feed' } }])
  : rep('announce_error', b('Je n\'ai pas pu la publier', 'I could not publish it'), [b(error || 'Rien n\'a été publié. Réessaie dans un instant.', error || 'Nothing was published. Try again in a moment.')]);
export const announceCanceled = (): Reply => rep('announce_cancel', b('D\'accord, rien n\'est publié', 'OK, nothing was published'), []);
