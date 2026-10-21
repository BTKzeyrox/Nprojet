// Lot 1 du module 11 : Missions, Équipe, Paie (contient les briques de l'ancien M9.1). Voir TODO_MODULES.md.
import type { HealthRule } from '../registry';
import { MISSION_RULES } from './missions';
import { TEAM_RULES } from './team';
import { PAYROLL_RULES } from './payroll';

export const LOT1_RULES: HealthRule[] = [...MISSION_RULES, ...TEAM_RULES, ...PAYROLL_RULES];
