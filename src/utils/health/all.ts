// Toutes les règles de surveillance (module 11) rassemblées : c'est la seule liste que l'écran utilise.
import type { HealthRule } from './registry';
import { LOT1_RULES } from './rules/lot1';
import { LOT2_RULES } from './rules/lot2';
import { LOT3_RULES } from './rules/lot3';
import { STATS_RULES } from './rules/stats';

export const ALL_RULES: HealthRule[] = [...LOT1_RULES, ...LOT2_RULES, ...LOT3_RULES, ...STATS_RULES];
