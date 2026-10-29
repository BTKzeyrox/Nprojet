// Trésorerie du Comptable : argent reçu et dépenses, JAMAIS de salaires ni de paie.
import { readFileSync } from 'node:fs';
let fails = 0, n = 0;
const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log('ECHEC', m); } else console.log('OK   ', m); };
const r = (f: string) => readFileSync(f, 'utf8');
const page = r('src/views/admin/TreasuryPage.tsx'), fin = r('src/views/admin/FinanceTab.tsx'), roles = r('src/utils/roles.ts');
const side = r('src/components/Sidebar.tsx'), app = r('src/App.tsx'), bottom = r('src/components/BottomNav.tsx');
ok(/moneyOnly/.test(page) && /salariesAr=\{0\}/.test(page) && /advancesAr=\{0\}/.test(page), 'page : onglet Finances en mode « argent seulement », salaires à 0');
ok(!/payroll|getAdvance|getPosts|getUsers|getContracts/.test(page), 'page : ne lit ni paie, ni avances, ni missions, ni comptes');
ok(/const salariesAr = moneyOnly \? 0/.test(fin) && /!moneyOnly && tile\(t\('Salaires/.test(fin), 'Finances : en mode argent seulement, salaires forcés à 0 et tuile cachée');
ok(/!moneyOnly && <FinanceInsights/.test(fin) && /!moneyOnly && <BudgetsCard/.test(fin) && /!moneyOnly && <PlanVsActualCard/.test(fin), 'Finances : cartes qui lisent missions et paie cachées en mode argent seulement');
ok(/ACCOUNTANT_VIEWS = \[[^\]]*'treasury'/.test(roles) && !/ACCOUNTANT_VIEWS = \[[^\]]*'(stats|advances|employees|hr)'/.test(roles), 'Comptable : « treasury » permis ; Statistiques, Paie, Employés, RH toujours interdits');
ok(/isAccountant \? \[\{ id: 'treasury'/.test(side), 'menu : Trésorerie seulement pour le Comptable');
ok(/activeView === 'treasury' \? <TreasuryPage \/>/.test(app) && /id: 'treasury'/.test(bottom), 'App et barre du bas : page branchée');
ok(/isMoneyRole\(this\.currentUser\.role\)/.test(r('src/db/store.ts')), 'écriture de l\'argent : déjà permise au Comptable par le store');
console.log(`\n${n - fails}/${n} contrôles réussis`);
if (fails) { console.log(`${fails} ÉCHEC(S)`); process.exit(1); }
