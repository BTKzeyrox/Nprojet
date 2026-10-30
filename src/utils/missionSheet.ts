// Tableau préparé par mission (module 18, M18.6). Règles pures : sans écran, sans serveur. Contrôlé par `npm run check:mission-sheet`.
// Quand un opérateur démarre une session de mission, le site lui prépare UN tableau (dans « Mes tableaux »), avec les colonnes qui conviennent au TYPE de la mission.
// Identifiant imposé : `sp-` + id de la session, donc un seul tableau par session, même si le site le prépare deux fois. Le lien avec la session (`post_id`) ne change jamais.
// Le serveur revérifie tout (cleanSheetWrite, bloc SHEETS de df-api) : la session doit être celle de l'opérateur. Le responsable lit ces tableaux, sans les modifier.
import { addRow, fromTemplate, LIMITS, type ColType, type Sheet, type Template } from './sheets';
import { addRowAuto } from './sheetAuto';

export const MISSION_SHEET_PREFIX = 'sp-';
export type MissionModel = 'fiches' | 'qualite' | 'admin' | 'web' | 'aide' | 'suivi';

/** Identifiant du tableau d'une session : toujours le même pour la même session. */
export const missionSheetId = (postId: string): string => MISSION_SHEET_PREFIX + postId;
/** Vrai si ce tableau est un tableau de mission (il a un lien vers une session et l'identifiant imposé). */
export const isMissionSheet = (s: { id?: unknown; post_id?: unknown }): boolean => typeof s.post_id === 'string' && !!s.post_id && s.id === missionSheetId(s.post_id);

const plain = (v: unknown): string => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Le modèle d'un type de mission (les types sont écrits librement dans les Réglages : on reconnaît des mots, sans accents ni majuscules). Inconnu = suivi de tâches. */
export function missionModelFor(type: unknown): MissionModel {
  const t = plain(type);
  if (/fiche|saisie/.test(t)) return 'fiches';
  if (/qualit|controle/.test(t)) return 'qualite';
  if (/\bweb\b|site|lien/.test(t)) return 'web';
  if (/admin/.test(t)) return 'admin';
  if (/aide|support|demande/.test(t)) return 'aide';
  return 'suivi';
}

interface Col { fr: string; en: string; type: ColType; opts?: { fr: string[]; en: string[] } }
const STATE: Col = { fr: 'État', en: 'Status', type: 'list', opts: { fr: ['À faire', 'En cours', 'Fait'], en: ['To do', 'In progress', 'Done'] } };
const NOTE: Col = { fr: 'Remarque', en: 'Note', type: 'text' };
const MODELS: Record<MissionModel, { fr: string; en: string; cols: Col[] }> = {
  fiches: { fr: 'Saisie de fiches', en: 'Record entry', cols: [{ fr: 'Date', en: 'Date', type: 'date' }, { fr: 'N° de fiche', en: 'Record no.', type: 'code' }, { fr: 'Nom', en: 'Name', type: 'text' }, { fr: 'Quantité', en: 'Quantity', type: 'number' }, NOTE] },
  qualite: { fr: 'Contrôle qualité', en: 'Quality check', cols: [{ fr: 'N° de dossier', en: 'File no.', type: 'code' }, { fr: 'Contrôlé', en: 'Checked', type: 'check' }, { fr: 'Erreur trouvée', en: 'Error found', type: 'check' }, { fr: 'Type d\'erreur', en: 'Error type', type: 'text' }, NOTE] },
  admin: { fr: 'Tâche administrative', en: 'Admin task', cols: [{ fr: 'Document', en: 'Document', type: 'text' }, { fr: 'Action', en: 'Action', type: 'list', opts: { fr: ['Classer', 'Numéroter', 'Envoyer', 'Archiver'], en: ['File', 'Number', 'Send', 'Archive'] } }, STATE, NOTE] },
  web: { fr: 'Tâche web', en: 'Web task', cols: [{ fr: 'Page ou lien', en: 'Page or link', type: 'text' }, { fr: 'Problème', en: 'Problem', type: 'list', opts: { fr: ['Aucun', 'Lien cassé', 'Prix faux', 'Texte faux'], en: ['None', 'Broken link', 'Wrong price', 'Wrong text'] } }, STATE, NOTE] },
  aide: { fr: 'Demande d\'aide', en: 'Help request', cols: [{ fr: 'Date', en: 'Date', type: 'date' }, { fr: 'Question', en: 'Question', type: 'text' }, { fr: 'Réponse envoyée', en: 'Answer sent', type: 'check' }, { fr: 'Durée (min)', en: 'Duration (min)', type: 'number' }, NOTE] },
  suivi: { fr: 'Suivi de tâches', en: 'Task tracking', cols: [{ fr: 'Tâche', en: 'Task', type: 'text' }, STATE, NOTE] },
};

/** Le modèle (colonnes) d'un type de mission, dans la langue demandée. */
export function missionTemplate(model: MissionModel, lang: 'fr' | 'en' = 'fr'): Template {
  const m = MODELS[model];
  const en = lang === 'en';
  return { id: `mission-${model}`, fr: m.fr, en: m.en, cols: m.cols.map(c => ({ name: en ? c.en : c.fr, type: c.type, ...(c.opts ? { options: en ? c.opts.en : c.opts.fr } : {}) })) };
}

export interface MissionSheetInput { postId: string; postNumber?: number; date: string; type?: unknown; lang?: 'fr' | 'en'; now: string }

/** Le tableau préparé pour une session : titre « Mission n° 4 — 2026-10-28 », colonnes du type de mission, une première ligne déjà remplie (code REF001, date de la mission). Rend null si l'identifiant de session est faux. */
export function buildMissionSheet(i: MissionSheetInput): Sheet | null {
  if (typeof i.postId !== 'string' || !i.postId || missionSheetId(i.postId).length > 60) return null;
  const lang = i.lang === 'en' ? 'en' : 'fr';
  const model = missionModelFor(i.type);
  const num = Number.isInteger(i.postNumber) && (i.postNumber as number) > 0 ? ` ${lang === 'en' ? '#' : 'n° '}${i.postNumber}` : '';
  const title = `${lang === 'en' ? 'Mission' : 'Mission'}${num} — ${String(i.date || '').slice(0, 10)}`.slice(0, LIMITS.title);
  const base = fromTemplate(missionTemplate(model, lang), title, i.now, lang);
  const withRow = addRowAuto(base, i.now, String(i.date || '').slice(0, 10)) || base; // première ligne déjà remplie : code suivant (REF001), date de la mission
  return { ...withRow, id: missionSheetId(i.postId), post_id: i.postId };
}

/** Faut-il préparer un tableau pour cette session ? Oui si c'est l'opérateur lui-même, si la session est ouverte (demande de départ ou en cours) et si son tableau n'existe pas encore. */
export function needsMissionSheet(p: { id: string; employee_id: string; status: string }, meId: string, meRole: string, existingIds: Iterable<string>): boolean {
  if (meRole !== 'employee' || meId !== p.employee_id) return false;
  if (p.status !== 'pending_start' && p.status !== 'active') return false;
  const id = missionSheetId(p.id);
  for (const x of existingIds) if (x === id) return false;
  return true;
}
