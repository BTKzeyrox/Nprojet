// Liste de tâches dans une mission (module 6, M6.3). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:tasks`.
// Le responsable écrit les lignes dans la mission (`tasks`) ; l'opérateur coche sur SA session (`tasks_done` = identifiants cochés).
// Option « tout doit être coché avant d'envoyer » : `tasks_required`. Le serveur revérifie les mêmes règles (bloc MISSIONS de df-api).

export interface MissionTask { id: string; text: string }
export const TASK_LIMITS = { max: 20, id: 24, text: 120 };

const clean = (v: unknown, max: number): string => String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];

export type TasksError = 'format' | 'empty_text' | 'too_many' | 'duplicate_id' | 'required_without_tasks';

/** Vérifie la liste saisie par le responsable. Liste vide = pas de tâches (permis). Les textes sont nettoyés et coupés. */
export function checkTasks(list: unknown, required?: unknown): { ok: true; tasks: MissionTask[]; required: boolean } | { ok: false; error: TasksError } {
  if (list === undefined || list === null) list = [];
  if (!Array.isArray(list)) return { ok: false, error: 'format' };
  if (list.length > TASK_LIMITS.max) return { ok: false, error: 'too_many' };
  if (required !== undefined && required !== null && typeof required !== 'boolean') return { ok: false, error: 'format' };
  const out: MissionTask[] = [];
  const ids = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => BAD_KEYS.includes(k))) return { ok: false, error: 'format' };
    const r = raw as { id?: unknown; text?: unknown };
    if (typeof r.id !== 'string' || typeof r.text !== 'string') return { ok: false, error: 'format' };
    const id = clean(r.id, TASK_LIMITS.id), text = clean(r.text, TASK_LIMITS.text);
    if (!id) return { ok: false, error: 'format' };
    if (!text) return { ok: false, error: 'empty_text' };
    if (ids.has(id)) return { ok: false, error: 'duplicate_id' };
    ids.add(id);
    out.push({ id, text });
  }
  const req = required === true;
  if (req && out.length === 0) return { ok: false, error: 'required_without_tasks' };
  return { ok: true, tasks: out, required: req };
}

/** Liste lue (vieux site, serveur) : les lignes fausses sont écartées, jamais de plantage. */
export function cleanTasks(list: unknown): MissionTask[] {
  if (!Array.isArray(list)) return [];
  const out: MissionTask[] = [];
  const ids = new Set<string>();
  for (const raw of list) {
    if (out.length >= TASK_LIMITS.max) break;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => BAD_KEYS.includes(k))) continue;
    const r = raw as { id?: unknown; text?: unknown };
    if (typeof r.id !== 'string' || typeof r.text !== 'string') continue;
    const id = clean(r.id, TASK_LIMITS.id), text = clean(r.text, TASK_LIMITS.text);
    if (!id || !text || ids.has(id)) continue;
    ids.add(id); out.push({ id, text });
  }
  return out;
}

/** Cases cochées d'une session : seulement des identifiants qui existent dans la mission, sans doublon, dans l'ordre de la liste. */
export function cleanDone(done: unknown, tasks: MissionTask[]): string[] {
  if (!Array.isArray(done)) return [];
  const set = new Set(done.filter((x): x is string => typeof x === 'string'));
  return tasks.filter(t => set.has(t.id)).map(t => t.id);
}

export interface TaskProgress { done: number; total: number; pct: number; complete: boolean }
export function taskProgress(tasks: MissionTask[], done: unknown): TaskProgress {
  const total = tasks.length;
  const d = cleanDone(done, tasks).length;
  return { done: d, total, pct: total ? Math.round((d / total) * 100) : 0, complete: total > 0 && d === total };
}

/** Peut-on envoyer la mission ? Oui si rien n'est exigé, ou si tout est coché. */
export function canSubmitTasks(tasks: MissionTask[], done: unknown, required: boolean | undefined): boolean {
  return !required || tasks.length === 0 || taskProgress(tasks, done).complete;
}

/** Coche ou décoche une ligne. Un identifiant inconnu ne change rien. Rend une nouvelle liste. */
export function toggleTask(tasks: MissionTask[], done: unknown, taskId: string): string[] {
  const cur = cleanDone(done, tasks);
  if (!tasks.some(t => t.id === taskId)) return cur;
  return cleanDone(cur.includes(taskId) ? cur.filter(x => x !== taskId) : [...cur, taskId], tasks);
}

/** Nouvel identifiant de ligne, unique dans la liste. */
export function newTaskId(tasks: MissionTask[], seed = Date.now()): string {
  const ids = new Set(tasks.map(t => t.id));
  let id = `t${seed.toString(36)}`;
  for (let k = 2; ids.has(id); k++) id = `t${seed.toString(36)}${k}`;
  return id;
}

/** Les lignes d'un champ texte (une par ligne) : pour saisir vite plusieurs tâches. Les lignes vides sont ignorées. */
export function tasksFromLines(text: string, existing: MissionTask[] = []): MissionTask[] {
  const out: MissionTask[] = [];
  const byText = new Map(existing.map(t => [t.text, t.id]));
  let seed = Date.now();
  for (const line of String(text).split(/\r?\n/)) {
    const t = clean(line, TASK_LIMITS.text);
    if (!t) continue;
    const keep = byText.get(t);
    const id = keep && !out.some(o => o.id === keep) ? keep : newTaskId([...existing, ...out], seed++);
    out.push({ id, text: t });
  }
  return out;
}
