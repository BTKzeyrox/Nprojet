// Lot 3 du module 11 : qualité des données et Conditions (ce qui se calcule dans le navigateur).
// Système (sauvegarde de nuit, quota, erreurs) et Sécurité (connexions échouées) demandent un journal serveur : M9.2, accord + sauvegarde avant.
import type { HealthRule } from '../registry';
import { DATA_RULES } from './data';
import { CONDITIONS_RULES } from './conditions';

export const LOT3_RULES: HealthRule[] = [...DATA_RULES, ...CONDITIONS_RULES];
