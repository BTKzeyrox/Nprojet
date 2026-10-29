// « Ma façon de travailler » (module 19, M19.5) : sur le SITE (le tableau de la mission est préparé tout seul) ou sur un EXCEL EXTERNE
// (le site ne prépare rien : on télécharge le modèle, on remplit dans Excel, on remet le fichier). Choix personnel, changeable à chaque mission.
// Gardé sur l'appareil (aucun envoi) : c'est un confort, pas une donnée de l'entreprise. Règle PURE (le stockage est donné), contrôlée par `npm run check:work-mode`.
export type WorkMode = 'site' | 'excel';
export interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

const personalKey = (uid: string): string => `df_work_mode_${uid}`;
const missionKey = (uid: string, postId: string): string => `df_work_mode_${uid}_${postId}`;
const std = (): KeyValueStore | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const read = (st: KeyValueStore | null, k: string): WorkMode | null => { try { const v = st?.getItem(k); return v === 'excel' || v === 'site' ? v : null; } catch { return null; } };
const write = (st: KeyValueStore | null, k: string, v: WorkMode | null): void => { try { if (v === null) st?.removeItem(k); else st?.setItem(k, v); } catch { /* stockage plein ou refusé : le choix reste le défaut */ } };

/** Le choix personnel de la personne (par défaut : sur le site). */
export function getWorkMode(uid: string, st: KeyValueStore | null = std()): WorkMode { return (uid && read(st, personalKey(uid))) || 'site'; }
export function setWorkMode(uid: string, mode: WorkMode, st: KeyValueStore | null = std()): void { if (uid) write(st, personalKey(uid), mode); }
/** Le choix pour UNE mission : celui qu'on y a fait, sinon le choix personnel. */
export function getMissionMode(uid: string, postId: string, st: KeyValueStore | null = std()): WorkMode { return (uid && postId && read(st, missionKey(uid, postId))) || getWorkMode(uid, st); }
/** `null` = retirer le choix propre à la mission (on revient au choix personnel). */
export function setMissionMode(uid: string, postId: string, mode: WorkMode | null, st: KeyValueStore | null = std()): void { if (uid && postId) write(st, missionKey(uid, postId), mode); }
