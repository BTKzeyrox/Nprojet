// Contrôle de l'interrupteur de modules (pages cachées), sans réseau.
// Lancer : npm run check:modules
import fs from 'node:fs';
import { HIDEABLE_MODULES, parseHidden, hiddenToCsv, isViewHidden } from '../src/utils/moduleSwitch';
import { cleanCompany, companyForEmployee, COMPANY_DEFAULTS } from '../src/utils/companyRules';
const r = (p: string) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
let ok = 0, bad = 0;
const t = (n: string, c: boolean) => { if (c) ok++; else { bad++; console.log('ECHEC ' + n); } };
t('rien de caché au départ', parseHidden(COMPANY_DEFAULTS.modules.hidden).length === 0);
t('actualités, réglages, santé, erreurs, équipe : jamais cachables', ['feed', 'settings', 'health', 'errors', 'employees', 'profile'].every(id => !HIDEABLE_MODULES.some(m => m.id === id)));
t('liste nettoyée : inconnus, doublons, espaces', hiddenToCsv(['chat', ' chat ', 'xx', 'feed', 'stats']) === 'chat,stats' && parseHidden(' chat , ,feed,stats,chat ').join() === 'chat,stats');
t('valeur étrangère ignorée', parseHidden(undefined).length === 0 && parseHidden(5).length === 0 && parseHidden({}).length === 0);
t('page cachée / visible', isViewHidden('chat,stats', 'chat') && !isViewHidden('chat,stats', 'feed') && !isViewHidden('', 'chat'));
const c = cleanCompany({ modules: { hidden: 'chat,stats' } });
t('les Conditions gardent la liste', c.errors.length === 0 && c.value.modules.hidden === 'chat,stats');
t('liste trop longue refusée', cleanCompany({ modules: { hidden: 'a'.repeat(401) } }).errors.includes('modules.hidden'));
t('un opérateur reçoit la liste (sans argent)', companyForEmployee(c.value).modules?.hidden === 'chat,stats');
const side = r('src/components/Sidebar.tsx'), nav = r('src/components/BottomNav.tsx'), app = r('src/App.tsx'), cc = r('src/components/CompanyConditions.tsx');
t('menu : les pages cachées disparaissent', /!isViewHidden\(readCompany\(db\.getSettings\(\)\.company\)\.modules\.hidden, it\.id\)/.test(side));
t('barre du bas : idem', /\.filter\(it => !isViewHidden\(hiddenPages, it\.id\)\)/.test(nav));
t('page cachée ouverte = retour aux Actualités', /if \(isViewHidden\(hiddenPages, activeView\)\) setActiveView\('feed'\)/.test(app));
t('réglages : cases pour cacher, par groupe', /HIDEABLE_MODULES\.filter\(m => m\.group === g\)/.test(cc) && /sec\.id === 'modules'/.test(cc));
t('serveur : même champ modules.hidden et envoyé aux opérateurs', /modules: \{ hidden: \{ t: "text", max: 400 \} \}/.test(r('supabase/functions/df-api/index.ts')) && /modules: full\.modules \}/.test(r('supabase/functions/df-api/index.ts')));
console.log(`${ok}/${ok + bad} contrôles OK`);
process.exit(bad ? 1 : 0);
