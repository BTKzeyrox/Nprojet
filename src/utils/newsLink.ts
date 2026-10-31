// Lien direct vers une publication des Actualités, et lecture de ces liens dans un message (règles pures, sans écran, sans réseau ; contrôlé par scripts/check-news-link.ts)
import { cleanDeepLink, deepLinkUrl, parseDeepLinkUrl, type DeepLink } from './deepLink';
import { audienceLabel, cleanAudience } from './newsAccess';

export const NEWS_NAV_PREFIX = 'news:';
/** Repère d'une publication dans la page (attribut data-nav). */
export const newsNavId = (postId: string): string => `${NEWS_NAV_PREFIX}${postId}`;
/** Numéro de publication d'un repère, ou null. */
export const newsIdFromNav = (nav: string | null | undefined): string | null => (typeof nav === 'string' && nav.startsWith(NEWS_NAV_PREFIX) && nav.length > NEWS_NAV_PREFIX.length ? nav.slice(NEWS_NAV_PREFIX.length) : null);

/** Lien (adresse complète) qui ouvre Actualités sur cette publication. Sans identifiant sûr : simple lien vers Actualités. */
export function newsLink(origin: string, postId: string): string {
  const path = deepLinkUrl({ go: 'feed', nav: newsNavId(postId) });
  return `${String(origin || '').replace(/\/+$/, '')}${path}`;
}

/** Texte du message de partage. Une publication réservée à certains rôles ne montre NI titre NI extrait : seulement le lien (la personne hors public verra « publication introuvable »). */
export function newsShareText(post: { id: string; title?: string; text?: string; audience?: unknown }, origin: string, lang: 'fr' | 'en' = 'fr'): string {
  const url = newsLink(origin, post.id);
  if (cleanAudience(post.audience)) return `${lang === 'en' ? 'Post' : 'Publication'} (${audienceLabel(post.audience, lang)}) : ${url}`;
  const text = String(post.text || '').trim();
  const body = `${post.title ? `${post.title} — ` : ''}${text.slice(0, 140)}${text.length > 140 ? '…' : ''}`.trim();
  return body ? `${body}\n${url}` : url;
}

/** Nom affiché à la place de l'adresse longue : « Voir la publication » pour une publication, sinon le nom de la page. */
export function linkLabel(link: DeepLink, lang: 'fr' | 'en' = 'fr'): string {
  if (newsIdFromNav(link.nav)) return lang === 'en' ? 'View the post' : 'Voir la publication';
  return lang === 'en' ? 'Open the page' : 'Ouvrir la page';
}

export type LinkPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; link: DeepLink };
const URL_RE = /https?:\/\/[^\s<>"']+/g;

/** Coupe un message en morceaux : texte simple et liens vers une page de CE site (même adresse). Les autres adresses restent du texte. */
export function splitLinks(message: string, origin: string): LinkPart[] {
  const src = String(message ?? '');
  const out: LinkPart[] = [];
  const base = String(origin || '').replace(/\/+$/, '');
  let last = 0;
  for (const m of src.matchAll(URL_RE)) {
    let raw = m[0];
    const trail = raw.match(/[.,;:!?)\]]+$/); // ponctuation collée au lien : elle reste du texte
    if (trail) raw = raw.slice(0, raw.length - trail[0].length);
    const at = m.index ?? 0;
    if (!base || !raw.startsWith(`${base}/`)) continue;
    const link = cleanDeepLink(parseDeepLinkUrl(raw));
    if (!link) continue;
    if (at > last) out.push({ kind: 'text', text: src.slice(last, at) });
    out.push({ kind: 'link', text: raw, link });
    last = at + raw.length;
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) });
  return out.length ? out : [{ kind: 'text', text: src }];
}
