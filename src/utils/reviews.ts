// Évaluation périodique (module 5, M5.4) : règles pures, sans écran ni serveur.
// Une fiche d'entretien vit dans la table `df_reviews` (collection `reviews`). Seul le responsable la crée et la modifie.
// Elle est alimentée par les scores du module 3 : le site en prend une PHOTO (score, composantes, badges) à la création ; la photo ne bouge plus une fois la fiche partagée.
// Le salarié ne reçoit que SES fiches PARTAGÉES, sans les « points à améliorer » (décision D9 : jamais de points faibles côté salarié). Il peut seulement la marquer « lue ».
// `cleanReview` a une copie exacte dans le bloc REVIEWS de `supabase/functions/df-api/index.ts` : `npm run check:reviews` compare les deux.
// IMPORTANT : le bloc « BEGIN REVIEWCLEAN … END REVIEWCLEAN » ne doit utiliser ni import ni constante extérieure.

export type ReviewStatus = 'draft' | 'shared';
export interface ReviewObjective { id: string; text: string; done?: boolean }
export interface ReviewSnapshot {
  score: number | null;
  components: { quality: number | null; volume: number | null; punctuality: number | null; regularity: number | null };
  badges: { id: string; level: 1 | 2 | 3 }[];
  done: number; decided: number; rate: number | null; taken_at: string;
}
export interface Review {
  id: string;
  employee_id: string;
  employee_name: string;
  period_start: string;
  period_end: string;
  status: ReviewStatus;
  objectives: ReviewObjective[];
  strengths?: string;
  comments?: string;
  improvements?: string; // POUR LE RESPONSABLE SEULEMENT : le serveur le retire avant d'envoyer la fiche au salarié
  rating?: number; // 1 à 5, facultatif
  snapshot?: ReviewSnapshot;
  acknowledged_at?: string;
  acknowledged_by?: string;
  shared_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// BEGIN REVIEWCLEAN
const RV_BADGES = ['quality', 'punctuality', 'regularity', 'rendement', 'versatility', 'rookie'];
const RV_MAX_SPAN = 400;
const rvDate = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return null;
  return v >= '2000-01-01' && v <= '2100-12-31' ? v : null;
};
const rvText = (v: unknown, max: number): string => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);
const rvPct = (v: unknown): number | null | undefined => { // undefined = invalide, null = vide
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) return undefined;
  return Math.round(v);
};
function rvSnapshot(raw: any): { ok: true; snap: any } | { ok: false } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  const score = rvPct(raw.score), rate = rvPct(raw.rate);
  const c = raw.components && typeof raw.components === 'object' && !Array.isArray(raw.components) ? raw.components : null;
  if (score === undefined || rate === undefined || !c) return { ok: false };
  const comps: any = {};
  for (const k of ['quality', 'volume', 'punctuality', 'regularity']) { const x = rvPct(c[k]); if (x === undefined) return { ok: false }; comps[k] = x; }
  if (!Array.isArray(raw.badges) || raw.badges.length > RV_BADGES.length) return { ok: false };
  const seen = new Set<string>();
  const badges: any[] = [];
  for (const b of raw.badges) {
    if (!b || typeof b !== 'object' || !RV_BADGES.includes(b.id) || seen.has(b.id) || !(b.level === 1 || b.level === 2 || b.level === 3)) return { ok: false };
    seen.add(b.id); badges.push({ id: b.id, level: b.level });
  }
  const cnt = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000 ? v : null);
  const done = cnt(raw.done), decided = cnt(raw.decided);
  if (done === null || decided === null || typeof raw.taken_at !== 'string' || isNaN(Date.parse(raw.taken_at))) return { ok: false };
  return { ok: true, snap: { score, components: comps, badges, done, decided, rate, taken_at: new Date(raw.taken_at).toISOString() } };
}
/**
 * Vérifie une fiche d'évaluation et applique le changement. Le serveur ne fait jamais confiance au navigateur.
 * actor : { id, admin }. Le responsable crée et modifie ; il ne repasse jamais une fiche partagée en brouillon.
 * Après partage : la période et la photo des scores sont figées ; tout changement de ce que le salarié voit (objectifs, forces, commentaires, note) efface son « lu ».
 * Le salarié ne peut qu'accuser lecture (« lu ») de SA fiche partagée ; une fois lu, cela ne s'annule pas.
 */
function cleanReview(rec: any, existing: any, actor: { id: string; admin: boolean }, now: string): { ok: true; save: any } | { ok: false; reason: string } {
  if (!rec || typeof rec !== 'object' || Array.isArray(rec) || typeof rec.id !== 'string' || !rec.id || rec.id.length > 80) return { ok: false, reason: 'id' };
  if (!actor.admin) {
    if (!existing || existing.employee_id !== actor.id || existing.status !== 'shared') return { ok: false, reason: 'forbidden' };
    if (existing.acknowledged_at || !rec.acknowledged_at) return { ok: true, save: existing }; // rien d'autre ne change : tout autre champ envoyé est ignoré
    return { ok: true, save: { ...existing, acknowledged_at: now, acknowledged_by: actor.id, updated_at: now } };
  }
  const status = rec.status === 'draft' || rec.status === 'shared' ? rec.status : null;
  if (!status) return { ok: false, reason: 'status' };
  if (existing && existing.status === 'shared' && status === 'draft') return { ok: false, reason: 'transition' };
  if (existing && rec.employee_id !== undefined && rec.employee_id !== existing.employee_id) return { ok: false, reason: 'employee' };
  const empId = existing ? existing.employee_id : (typeof rec.employee_id === 'string' ? rec.employee_id : '');
  if (!empId || empId.length > 80) return { ok: false, reason: 'employee' };
  const frozen = !!existing && existing.status === 'shared'; // période et photo figées après partage
  let start = frozen ? existing.period_start : rvDate(rec.period_start), end = frozen ? existing.period_end : rvDate(rec.period_end);
  if (!start || !end || end < start) return { ok: false, reason: 'period' };
  if (Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z') > RV_MAX_SPAN * 86400000) return { ok: false, reason: 'period' };
  if (!Array.isArray(rec.objectives) || rec.objectives.length > 10) return { ok: false, reason: 'objectives' };
  const seen = new Set<string>();
  const objectives: any[] = [];
  for (const o of rec.objectives) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, reason: 'objectives' };
    const id = rvText(o.id, 80), text = rvText(o.text, 200);
    if (!id || !text || seen.has(id)) return { ok: false, reason: 'objectives' };
    seen.add(id);
    objectives.push(o.done === true ? { id, text, done: true } : { id, text });
  }
  let rating: number | undefined;
  if (rec.rating !== undefined && rec.rating !== null && rec.rating !== '') {
    if (typeof rec.rating !== 'number' || !Number.isInteger(rec.rating) || rec.rating < 1 || rec.rating > 5) return { ok: false, reason: 'rating' };
    rating = rec.rating;
  }
  let snapshot = existing ? existing.snapshot : undefined;
  if (!frozen && rec.snapshot !== undefined && rec.snapshot !== null) {
    const sv = rvSnapshot(rec.snapshot);
    if (!sv.ok) return { ok: false, reason: 'snapshot' };
    snapshot = sv.snap;
  }
  const strengths = rvText(rec.strengths, 1000), comments = rvText(rec.comments, 2000), improvements = rvText(rec.improvements, 1000);
  const save: any = {
    id: rec.id, employee_id: empId, employee_name: rvText(existing ? existing.employee_name : rec.employee_name, 80), period_start: start, period_end: end, status, objectives,
    created_by: existing ? existing.created_by : actor.id, created_at: existing ? existing.created_at : now, updated_at: now,
  };
  if (strengths) save.strengths = strengths;
  if (comments) save.comments = comments;
  if (improvements) save.improvements = improvements;
  if (rating !== undefined) save.rating = rating;
  if (snapshot) save.snapshot = snapshot;
  if (status === 'shared') save.shared_at = existing && existing.shared_at ? existing.shared_at : now;
  if (existing && existing.acknowledged_at) {
    const visible = (r: any) => JSON.stringify([r.objectives || [], r.strengths || '', r.comments || '', r.rating ?? null]);
    if (visible(existing) === visible(save)) { save.acknowledged_at = existing.acknowledged_at; save.acknowledged_by = existing.acknowledged_by; } // sinon : le salarié relit
  }
  return { ok: true, save };
}
// END REVIEWCLEAN

export const checkReview = cleanReview;

/** Ce que le salarié reçoit : jamais les « points à améliorer ». Même règle que le serveur. */
export function forEmployeeReview<T extends { improvements?: string }>(r: T): Omit<T, 'improvements'> {
  const { improvements: _hidden, ...mine } = r;
  return mine;
}

/** Photo des scores du module 3 pour un salarié (à passer comme `snapshot`). `p` vient de `computePerformance` ; rien n'est inventé. */
export function snapshotOf(p: { score: number | null; components: ReviewSnapshot['components']; badges: { id: string; level: number }[]; window: { done: number; decided: number; rate: number | null } } | undefined | null, nowIso: string): ReviewSnapshot | undefined {
  if (!p) return undefined;
  return {
    score: p.score, components: { ...p.components }, badges: p.badges.map(b => ({ id: b.id, level: b.level as 1 | 2 | 3 })),
    done: p.window.done, decided: p.window.decided, rate: p.window.rate, taken_at: nowIso,
  };
}

export const REVIEW_REASON: Record<string, [string, string]> = {
  id: ['Fiche illisible.', 'Unreadable review.'], status: ['État de la fiche incorrect.', 'Wrong review state.'], employee: ['Choisis un salarié.', 'Choose an employee.'],
  period: ['Période incorrecte (la fin ne peut pas être avant le début ; 400 jours au plus).', 'Wrong period (the end cannot be before the start; 400 days at most).'],
  objectives: ['Objectifs incorrects (10 au plus, 200 caractères chacun, pas de ligne vide).', 'Wrong objectives (10 at most, 200 characters each, no empty line).'],
  rating: ['La note va de 1 à 5.', 'The rating goes from 1 to 5.'], snapshot: ['Photo des scores illisible.', 'Unreadable score snapshot.'],
  transition: ['Une fiche partagée ne redevient pas un brouillon.', 'A shared review does not go back to a draft.'], forbidden: ['Interdit.', 'Forbidden.'],
};
export const reviewReasonText = (reason: string, lang: 'fr' | 'en' = 'fr'): string => (REVIEW_REASON[reason] || ['Fiche refusée.', 'Review refused.'])[lang === 'en' ? 1 : 0];
