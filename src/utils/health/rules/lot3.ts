// Lot 3 du module 11 : qualité des données et Conditions (ce qui se calcule dans le navigateur).
// Système : sauvegarde de nuit et erreurs (M9.2 partie A : listes que le serveur donne déjà). Quota et Sécurité (connexions échouées) = partie B (journal serveur), pas encore faits.
import type { HealthRule } from '../registry';
import { DATA_RULES } from './data';
import { CONDITIONS_RULES } from './conditions';
import { SYSTEM_RULES } from './system';

export const LOT3_RULES: HealthRule[] = [...DATA_RULES, ...CONDITIONS_RULES, ...SYSTEM_RULES];
