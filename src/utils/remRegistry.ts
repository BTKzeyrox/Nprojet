// Pont sans écran ni réseau entre la liste des rappels de la personne (remindersState.ts) et les règles de l'assistant (assistant.ts, testé sans navigateur).
import type { RemItem } from './reminderRules';
let provider: () => RemItem[] = () => [];
export const setRemProvider = (f: () => RemItem[]): void => { provider = f; };
export const getRemItems = (): RemItem[] => { try { return provider(); } catch { return []; } };
