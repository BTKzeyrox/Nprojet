// Modèles de mission (module 6, M6.2). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:templates`.
// Un modèle garde : un nom (pour le retrouver), un titre, un type, une consigne et le justificatif demandé. Jamais de prix, de client, de date ni de score.
// Les mêmes règles sont revérifiées par le serveur (bloc MISSIONS de df-api) ; `check:templates` compare les deux.

export type ProofMode = 'type' | 'none' | 'photo' | 'note' | 'both';
export const PROOF_MODES: ProofMode[] = ['type', 'none', 'photo', 'note', 'both'];

export interface MissionTemplate { id: string; name: string; title: string; post_type?: string; description?: string; proof_mode: ProofMode }

export const TEMPLATE_LIMITS = { max: 30, id: 40, name: 60, title: 80, type: 40, description: 500 };

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const clean = (v: unknown, max: number): string => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

export type TemplateError = 'name' | 'duplicate' | 'limit' | 'proof' | 'format';
export interface TemplateDraft { id?: unknown; name?: unknown; title?: unknown; post_type?: unknown; description?: unknown; proof_mode?: unknown }

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Vérifie un modèle saisi. `others` = les autres modèles (pour refuser deux noms identiques et dépasser la limite). */
export function checkTemplate(d: TemplateDraft, others: MissionTemplate[]): { ok: true; value: MissionTemplate } | { ok: false; error: TemplateError } {
  if (!d || typeof d !== 'object') return { ok: false, error: 'format' };
  for (const k of ['name', 'title', 'post_type', 'description', 'id'] as const) { const v = (d as any)[k]; if (v !== undefined && v !== null && typeof v !== 'string') return { ok: false, error: 'format' }; }
  const name = clean(d.name ?? '', TEMPLATE_LIMITS.name) || '';
  if (!name) return { ok: false, error: 'name' };
  const proof = d.proof_mode === undefined || d.proof_mode === null || d.proof_mode === '' ? 'type' : d.proof_mode;
  if (typeof proof !== 'string' || !PROOF_MODES.includes(proof as ProofMode)) return { ok: false, error: 'proof' };
  const id = clean(d.id ?? '', TEMPLATE_LIMITS.id) || '';
  if (others.some(o => o.id !== id && sameName(o.name, name))) return { ok: false, error: 'duplicate' };
  if (!id && others.length >= TEMPLATE_LIMITS.max) return { ok: false, error: 'limit' };
  const title = clean(d.title ?? '', TEMPLATE_LIMITS.title) || '';
  const type = clean(d.post_type ?? '', TEMPLATE_LIMITS.type) || '';
  const desc = clean(d.description ?? '', TEMPLATE_LIMITS.description) || '';
  return { ok: true, value: { id, name, title, ...(type ? { post_type: type } : {}), ...(desc ? { description: desc } : {}), proof_mode: proof as ProofMode } };
}

/** Liste de modèles lue (réglages venus du serveur ou d'un vieux site) : les modèles faux sont écartés, pas de doublon d'identifiant ni de nom, 30 au plus. Ne plante jamais. */
export function cleanTemplates(list: unknown): MissionTemplate[] {
  if (!Array.isArray(list)) return [];
  const out: MissionTemplate[] = [];
  const ids = new Set<string>();
  for (const raw of list) {
    if (out.length >= TEMPLATE_LIMITS.max) break;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    if (Object.keys(raw).some(k => BAD_KEYS.has(k))) continue;
    const v = checkTemplate(raw as TemplateDraft, out);
    if (!v.ok || !v.value.id || ids.has(v.value.id)) continue;
    ids.add(v.value.id);
    out.push(v.value);
  }
  return out;
}

/** Nouvel identifiant : unique parmi les modèles donnés. */
export function newTemplateId(existing: MissionTemplate[], seed = Date.now()): string {
  const ids = new Set(existing.map(t => t.id));
  let id = `tpl-${seed}`;
  for (let k = 2; ids.has(id); k++) id = `tpl-${seed}-${k}`;
  return id;
}

/** Une mission devient un modèle : on garde seulement titre, type, consigne et justificatif. */
export function templateFromMission(m: { client_name?: string; post_type?: string; description?: string; proof_mode?: string }, name: string): TemplateDraft {
  return { name, title: m.client_name || '', post_type: m.post_type || '', description: m.description || '', proof_mode: m.proof_mode || 'type' };
}

/** Ce que le formulaire « Nouvelle mission » reçoit quand on choisit un modèle. Un type qui n'existe plus dans la liste des types est ignoré (jamais un type fantôme). */
export function applyTemplate(t: MissionTemplate, knownTypes: string[]): { title: string; post_type: string; description: string; proof_mode: ProofMode } {
  return { title: t.title || '', post_type: t.post_type && knownTypes.includes(t.post_type) ? t.post_type : '', description: t.description || '', proof_mode: t.proof_mode };
}
