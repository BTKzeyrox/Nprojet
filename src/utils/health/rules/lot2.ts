// Lot 2 du module 11 : Finances, Clients, Stock. Voir TODO_MODULES.md.
import type { HealthRule } from '../registry';
import { FINANCE_RULES } from './finance';
import { CLIENT_RULES } from './clients';
import { STOCK_RULES } from './stock';
import { SUPPLIER_RULES } from './suppliers';
import { INVOICE_RULES } from './invoices';
import { PERFORMANCE_RULES } from './performance';

export const LOT2_RULES: HealthRule[] = [...FINANCE_RULES, ...CLIENT_RULES, ...STOCK_RULES, ...SUPPLIER_RULES, ...INVOICE_RULES, ...PERFORMANCE_RULES];
