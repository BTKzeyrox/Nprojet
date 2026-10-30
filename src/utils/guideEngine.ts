// Guide interactif (visite guidée, module 16 revu le 2026-10-29) : règles pures, sans écran, sans serveur. Contrôlé par `npm run check:guide-tour`.
// Le guide ouvre la VRAIE page, assombrit le reste et fait clignoter un contour autour de l'élément à regarder. Toucher l'élément lance une petite SIMULATION :
// rien n'est modifié, une bulle montre seulement ce qui se passerait.
import type { Bi } from './siteKnowledge';

export type GuideRole = 'admin' | 'employee' | 'accountant' | 'team_lead';

/** Quoi faire clignoter : un repère `data-tour="…"` posé dans l'application, ou le texte (français ou anglais) d'un bouton, d'un onglet ou d'un titre. */
export interface GuideTarget { tour?: string; texts?: Bi[] }
/** La simulation : `hint` dit quoi toucher ; `result` montre ce qui se passerait. Aucune donnée n'est modifiée. */
export interface GuideAction { hint: Bi; result: Bi }
export interface GuideStep {
  id: string;
  /** Identifiant de la page du menu à ouvrir (null = écran de bienvenue, sans page). */
  page: string | null;
  target: GuideTarget | null;
  title: Bi;
  text: Bi;
  action?: GuideAction;
  /** Dit quoi faire quand l'élément n'est pas là (par exemple : aucune mission pour le moment). */
  missing?: Bi;
}

/** Texte comparé sans accents, sans majuscules et sans espaces en trop. */
export const norm = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface Box { left: number; top: number; width: number; height: number }
export interface ElLike { textContent: string | null; getBoundingClientRect(): Box; closest?(selector: string): unknown }
export interface RootLike { querySelectorAll(selector: string): ArrayLike<ElLike> }

/** Ce qui peut porter le texte cherché. */
export const TEXT_SELECTOR = 'button, a, [role="tab"], [role="button"], h1, h2, h3, summary, label';
/** Les éléments du guide lui-même (la bulle, le cadre) ne sont jamais visés : leur texte contient souvent le mot cherché. */
export const GUIDE_UI_SELECTOR = '[data-guide-ui]';
const isGuideUi = (el: ElLike): boolean => typeof el.closest === 'function' && !!el.closest(GUIDE_UI_SELECTOR);
const isVisible = (el: ElLike): boolean => { if (isGuideUi(el)) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

/** Trouve l'élément à faire clignoter : d'abord le repère `data-tour` (le premier visible), sinon le texte le plus précis (égal d'abord, puis le plus court). */
export function findTarget(root: RootLike, target: GuideTarget | null | undefined): ElLike | null {
  if (!target) return null;
  if (target.tour && /^[a-z0-9-]+$/.test(target.tour)) {
    const list = root.querySelectorAll(`[data-tour="${target.tour}"]`);
    for (let i = 0; i < list.length; i++) if (isVisible(list[i])) return list[i];
  }
  if (target.texts && target.texts.length) {
    const wanted = target.texts.flatMap(b => [b.fr, b.en]).map(norm).filter(x => x.length >= 3);
    const list = root.querySelectorAll(TEXT_SELECTOR);
    let best: ElLike | null = null, bestScore = Infinity;
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      const txt = norm(el.textContent);
      if (!txt || !isVisible(el)) continue;
      for (const w of wanted) {
        if (!txt.includes(w)) continue;
        const score = (txt === w ? 0 : 1000) + txt.length; // le texte le plus exact et le plus court gagne
        if (score < bestScore) { best = el; bestScore = score; }
      }
    }
    return best;
  }
  return null;
}

/** Le cadre qui clignote : un peu plus grand que l'élément, mais jamais hors de l'écran. */
export function holeBox(r: Box, vw: number, vh: number, pad = 6): Box {
  const left = Math.max(2, r.left - pad), top = Math.max(2, r.top - pad);
  const right = Math.min(vw - 2, r.left + r.width + pad), bottom = Math.min(vh - 2, r.top + r.height + pad);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

/** Où poser la bulle d'explication : du côté OPPOSÉ à l'élément (jamais dessus). Pas d'élément = au centre. */
export function bubbleDock(hole: Box | null, vh: number): 'top' | 'bottom' | 'center' {
  if (!hole) return 'center';
  return hole.top + hole.height / 2 > vh / 2 ? 'top' : 'bottom';
}

// ---- Validité d'un guide (contrôlée par check:guide-tour) ----
export interface GuideProblem { role: string; step: string; problem: string }
export function guideProblems(role: string, steps: GuideStep[]): GuideProblem[] {
  const out: GuideProblem[] = [];
  const seen = new Set<string>();
  const bi = (b: Bi | undefined) => !!b && typeof b.fr === 'string' && b.fr.trim().length > 0 && typeof b.en === 'string' && b.en.trim().length > 0;
  if (steps.length < 4) out.push({ role, step: '-', problem: 'moins de 4 étapes' });
  steps.forEach((s, i) => {
    const p = (problem: string) => out.push({ role, step: s.id || String(i), problem });
    if (!s.id || seen.has(s.id)) p('identifiant vide ou en double'); seen.add(s.id);
    if (!bi(s.title)) p('titre FR/EN manquant');
    if (!bi(s.text)) p('texte FR/EN manquant');
    if (i === 0 && (s.page !== null || s.target !== null)) p('la première étape est la bienvenue : sans page ni élément');
    if (i > 0 && s.page === null) p('une étape après la bienvenue doit ouvrir une page');
    if (s.target && !s.target.tour && !(s.target.texts && s.target.texts.length)) p('élément à viser vide');
    if (s.target && s.target.texts && s.target.texts.some(b => !bi(b))) p('texte à viser sans FR/EN');
    if (s.action) { if (!s.target) p('simulation sans élément à toucher'); if (!bi(s.action.hint) || !bi(s.action.result)) p('simulation sans texte FR/EN'); if (!s.missing) p('simulation sans texte « élément absent »'); }
    if (s.target && !s.missing) p('élément visé sans texte « élément absent »');
  });
  return out;
}
