// Reconnaissance (module 3, M3.7) : règles pures. Contrôlé par `npm run check:recognition`.
//  • Félicitations : à l'ouverture, si le salarié a un badge qu'il n'avait jamais eu, ou un niveau plus haut que son plus haut niveau déjà vu,
//    un message le félicite. La toute première fois (rien de mémorisé), on mémorise SANS féliciter (pas de pluie de messages au départ).
//    On ne mémorise que le plus haut niveau vu : un badge perdu puis regagné ne refait pas de message, et des données encore incomplètes
//    au démarrage ne peuvent pas déclencher de faux message.
//  • « Employé du mois » : texte d'une publication pour Actualités, sans aucun montant d'argent ; l'admin la publie en un clic.
import type { Badge, BadgeId, Bilingual, MonthWinner } from './performanceScore';
import { LEVEL_NAMES } from './performanceScore';

export const BADGE_NAMES: Record<BadgeId, Bilingual> = {
  quality: { fr: 'Qualité', en: 'Quality' },
  punctuality: { fr: 'Ponctualité', en: 'Punctuality' },
  regularity: { fr: 'Régularité', en: 'Consistency' },
  rendement: { fr: 'Rendement', en: 'Efficiency' },
  versatility: { fr: 'Polyvalence', en: 'Versatility' },
  rookie: { fr: 'Recrue prometteuse', en: 'Promising rookie' },
};
const IDS = Object.keys(BADGE_NAMES) as BadgeId[];

/** Plus haut niveau déjà vu, par badge (« {} » = jamais rien vu). */
export type SeenBadges = Partial<Record<BadgeId, number>>;

/** Lit ce qui a été mémorisé ; tout ce qui est faux est ignoré. `null` = rien de mémorisé (première fois). */
export function readSeen(raw: unknown): SeenBadges | null {
  if (typeof raw !== 'string' || !raw) return null;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { return null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: SeenBadges = {};
  for (const id of IDS) { const l = (v as Record<string, unknown>)[id]; if (typeof l === 'number' && Number.isInteger(l) && l >= 1 && l <= 3) out[id] = l; }
  return out;
}

/** Badges à fêter et nouvelle mémoire (jamais plus basse que l'ancienne). Première fois : rien à fêter, on mémorise. */
export function badgesToCelebrate(seen: SeenBadges | null, current: Badge[]): { celebrate: Badge[]; next: SeenBadges } {
  const next: SeenBadges = { ...(seen || {}) };
  const celebrate: Badge[] = [];
  for (const b of current) {
    const before = next[b.id] ?? 0;
    if (b.level > before) { next[b.id] = b.level; if (seen !== null) celebrate.push(b); }
  }
  return { celebrate, next };
}

/** Message de félicitations (une phrase, sans argent). */
export function congratsText(b: Badge, lang: string): string {
  const en = lang === 'en';
  const name = en ? BADGE_NAMES[b.id].en : BADGE_NAMES[b.id].fr;
  if (b.id === 'rookie') return en ? `Congratulations! You earned the “${name}” badge.` : `Bravo ! Tu as obtenu le badge « ${name} ».`;
  const lvl = en ? LEVEL_NAMES[b.level].en : LEVEL_NAMES[b.level].fr;
  return en ? `Congratulations! You earned the “${name}” badge, ${lvl} level.` : `Bravo ! Tu as obtenu le badge « ${name} », niveau ${lvl}.`;
}

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (ym: string, lang: string): string => { const m = Number(ym.slice(5, 7)); return m >= 1 && m <= 12 ? `${(lang === 'en' ? MONTHS_EN : MONTHS_FR)[m - 1]} ${ym.slice(0, 4)}` : ym; };

/** Publication « Employé du mois » pour Actualités. Aucun montant ; ex æquo : tous les noms. Null s'il n'y a pas de gagnant. */
export function employeeOfMonthPost(month: string, winners: MonthWinner[], lang: string): { title: string; text: string } | null {
  if (!/^\d{4}-\d{2}$/.test(month) || !winners.length) return null;
  const en = lang === 'en';
  const names = winners.map(w => w.name.replace(/[\u0000-\u001f<>]/g, ' ').trim()).filter(Boolean);
  if (!names.length) return null;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} ${en ? 'and' : 'et'} ${names[names.length - 1]}`;
  const label = monthLabel(month, lang);
  const title = (en ? `Employee of the month: ${label}` : `Employé du mois : ${label}`).slice(0, 120);
  const text = en
    ? `${names.length > 1 ? 'Our employees' : 'Our employee'} of the month for ${label}: ${list}. Thank you for the steady, quality work. Congratulations!`
    : `${names.length > 1 ? 'Nos employés' : 'Notre employé'} du mois de ${label} : ${list}. Merci pour le travail régulier et de qualité. Bravo !`;
  return { title, text: text.slice(0, 2000) };
}
