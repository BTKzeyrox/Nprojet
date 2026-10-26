// Guide du site : remplit les parties AUTOMATIQUES de GUIDE_SITE.md à partir du code (rien n'est écrit à la main dans ces parties).
//   npm run guide        → réécrit les blocs <!-- AUTO:xxx --> … <!-- /AUTO:xxx -->
//   npm run check:guide  → échoue si un bloc automatique n'est plus à jour, ou si le texte écrit à la main cite un fichier ou un contrôle qui n'existe pas.
// Les parties écrites à la main (le but, les rôles, les recettes, les pièges) restent telles quelles.
import fs from 'node:fs';
import path from 'node:path';
import { SITE_MAP, type Bi } from '../src/utils/siteKnowledge';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p: string) => fs.existsSync(path.join(root, p));
const GUIDE = 'GUIDE_SITE.md';

// Fichier(s) d'écran de chaque page du menu. Une page du menu sans entrée ici fait échouer le contrôle (il faut la documenter).
export const PAGE_FILES: Record<string, string[]> = {
  feed: ['src/views/FeedView.tsx'],
  dashboard: ['src/views/admin/AdminDashboard.tsx'],
  validations: ['src/views/admin/AdminDashboard.tsx', 'src/views/TeamValidations.tsx (Chef d\'équipe)'],
  history: ['src/views/admin/HistoryPage.tsx'],
  clients: ['src/views/admin/ClientsPage.tsx'],
  invoices: ['src/views/admin/InvoicesView.tsx', 'src/views/admin/QuotesSection.tsx'],
  purchasing: ['src/views/admin/PurchasingPage.tsx', 'src/views/admin/SuppliersSection.tsx', 'src/views/admin/PurchaseOrdersSection.tsx', 'src/views/admin/InventorySection.tsx', 'src/views/admin/BudgetsCard.tsx'],
  performance: ['src/views/admin/PerformancePage.tsx', 'src/views/admin/PerformanceScores.tsx'],
  'my-performance': ['src/components/MyPerformance.tsx'],
  sheets: ['src/components/MySheets.tsx'],
  stats: ['src/views/admin/StatsPage.tsx', 'src/views/admin/FinanceTab.tsx', 'src/views/admin/StockTab.tsx', 'src/views/admin/ReportTab.tsx'],
  grid: ['src/views/employee/EmployeeDashboard.tsx', 'src/components/PostsGrid20.tsx'],
  'active-post': ['src/views/employee/EmployeeDashboard.tsx', 'src/views/admin/AdminDashboard.tsx'],
  employees: ['src/views/admin/EmployeesManagement.tsx'],
  profile: ['src/views/employee/EmployeeDashboard.tsx', 'src/components/CVViewerModal.tsx'],
  chat: ['src/components/ChatView.tsx', 'src/components/AssistantChat.tsx'],
  calendar: ['src/views/CalendarView.tsx'],
  direction: ['src/views/admin/DirectionPage.tsx'],
  accounting: ['src/views/admin/AccountingPage.tsx'],
  hr: ['src/views/hr/HrPage.tsx', 'src/views/hr/DossiersSection.tsx', 'src/views/hr/LeavesSection.tsx', 'src/views/hr/ReviewsSection.tsx'],
  advances: ['src/components/PayrollAdmin.tsx', 'src/components/MyPayroll.tsx', 'src/views/admin/EmployeesManagement.tsx'],
  health: ['src/views/admin/HealthPage.tsx'],
  errors: ['src/views/admin/ErrorsLog.tsx'],
  settings: ['src/views/admin/SettingsView.tsx', 'src/components/CompanyConditions.tsx'],
};

const AUD: Record<string, string> = { admin: 'responsable', employee: 'opérateur', both: 'responsable et opérateur' };
const fr = (b: Bi) => b.fr;

function pages(): string {
  const out: string[] = [];
  for (const p of SITE_MAP) {
    out.push(`### ${fr(p.title)}  \`${p.id}\``);
    out.push(`- **Qui** : ${AUD[p.audience]}`);
    out.push(`- **À quoi ça sert** : ${fr(p.purpose)}`);
    out.push(`- **Comment l'utiliser** : ${p.howto.map((h, i) => `${i + 1}. ${fr(h)}`).join(' ')}`);
    if (p.rules.length) out.push(`- **Règles** :\n${p.rules.map(r => `  - ${fr(r)}`).join('\n')}`);
    if (p.figures.length) out.push(`- **Chiffres et formules** :\n${p.figures.map(f => `  - ${fr(f.name)} : ${fr(f.formula)}`).join('\n')}`);
    if (p.conditions?.length) out.push(`- **Réglages liés** (Réglages > Conditions) : ${p.conditions.map(c => `\`${c}\``).join(', ')}`);
    out.push(`- **Dans le code** : ${(PAGE_FILES[p.id] || ['(à documenter)']).map(f => (f.startsWith('src/') && !f.includes(' ') ? `\`${f}\`` : f)).join(', ')}`);
    out.push('');
  }
  return out.join('\n').trimEnd();
}

function tables(): string {
  const s = read('supabase/functions/df-api/index.ts');
  const m = /const T = \{([\s\S]*?)\n\} as const/.exec(s);
  const rows: string[] = ['| Collection (site) | Table (base) | Remarque |', '|---|---|---|'];
  for (const l of (m ? m[1] : '').split('\n')) {
    const mm = /^\s*(\w+): "(df_\w+)",?\s*(?:\/\/\s*(.*))?$/.exec(l);
    if (mm) rows.push(`| \`${mm[1]}\` | \`${mm[2]}\` | ${(mm[3] || '').trim()} |`);
  }
  return rows.join('\n');
}

function actions(): string {
  const s = read('supabase/functions/df-api/index.ts');
  const i = s.indexOf('Deno.serve(');
  const names = [...new Set([...s.slice(i).matchAll(/action === "([a-z-]+)"/g)].map(x => x[1]))];
  return names.map(n => `\`${n}\``).join(', ');
}

function header(p: string): string {
  const L = read(p).split('\n').slice(0, 8);
  for (const l of L) {
    if (l.startsWith('//')) return l.slice(2).trim();
    if (l.startsWith('/*')) return l.replace(/^\/\*+\s*|\s*\*+\/$/g, '').trim();
  }
  return '';
}
function codeMap(): string {
  const groups: [string, string][] = [
    ['Règles du site (`src/utils/`)', 'src/utils'], ['Santé du site : moteur (`src/utils/health/`)', 'src/utils/health'], ['Santé du site : contrôles par page (`src/utils/health/rules/`)', 'src/utils/health/rules'],
  ];
  const out: string[] = [];
  for (const [title, dir] of groups) {
    out.push(`**${title}**`, '', '| Fichier | Rôle |', '|---|---|');
    for (const f of fs.readdirSync(path.join(root, dir)).filter(x => x.endsWith('.ts')).sort()) {
      const h = header(`${dir}/${f}`);
      out.push(`| \`${f}\` | ${(h || '—').replace(/\|/g, '/')} |`);
    }
    out.push('');
  }
  return out.join('\n').trimEnd();
}

function checks(): string {
  const pkg = JSON.parse(read('package.json')).scripts as Record<string, string>;
  const out: string[] = ['| Commande | Ce qu\'elle vérifie |', '|---|---|'];
  for (const [name, cmd] of Object.entries(pkg)) {
    if (!name.startsWith('check:')) continue;
    const f = /scripts\/(check-[\w-]+\.tsx?)/.exec(cmd)?.[0];
    const h = f && exists(f) ? header(f) : '';
    out.push(`| \`npm run ${name}\` | ${(h || (f ? `(voir \`${f}\`)` : '(plusieurs contrôles)')).replace(/\|/g, '/')} |`);
  }
  return out.join('\n');
}

export const BLOCKS: Record<string, () => string> = { pages, tables, actions, codemap: codeMap, checks };

const wrap = (name: string, body: string) => `<!-- AUTO:${name} -->\n${body}\n<!-- /AUTO:${name} -->`;
const re = (name: string) => new RegExp(`<!-- AUTO:${name} -->[\\s\\S]*?<!-- /AUTO:${name} -->`);

export function render(text: string): string {
  let t = text;
  for (const [name, fn] of Object.entries(BLOCKS)) {
    if (!re(name).test(t)) throw new Error(`bloc AUTO:${name} introuvable dans ${GUIDE}`);
    t = t.replace(re(name), () => wrap(name, fn()));
  }
  return t;
}

/** Fichiers et contrôles cités à la main (entre accents graves) : ils doivent exister. */
export function brokenRefs(text: string): string[] {
  const hand = text.replace(/<!-- AUTO:(\w+) -->[\s\S]*?<!-- \/AUTO:\1 -->/g, '');
  const pkg = JSON.parse(read('package.json')).scripts as Record<string, string>;
  const bad: string[] = [];
  for (const m of hand.matchAll(/`([^`\n]+)`/g)) {
    const v = m[1].trim();
    const cmd = /^npm run ([\w:-]+)$/.exec(v);
    if (cmd) { if (!pkg[cmd[1]]) bad.push(`commande inconnue : ${v}`); continue; }
    if (/^(src|scripts|supabase|public)\/[\w./@-]+$/.test(v) && !v.includes('*') && !exists(v)) bad.push(`fichier introuvable : ${v}`);
    if (/^[A-Z_]+\.md$/.test(v) && !exists(v)) bad.push(`document introuvable : ${v}`);
  }
  return [...new Set(bad)];
}

const mode = process.argv[2];
if (mode === 'write' || mode === 'check') {
  const cur = read(GUIDE);
  if (mode === 'write') {
    fs.writeFileSync(path.join(root, GUIDE), render(cur));
    console.log(`${GUIDE} mis à jour (${render(cur).split('\n').length} lignes).`);
  } else {
    let fails = 0, n = 0;
    const ok = (c: boolean, m: string) => { n++; if (!c) { fails++; console.log(`ECHEC ${m}`); } else console.log(`OK    ${m}`); };
    ok(render(cur) === cur, 'les parties automatiques du guide sont à jour (sinon : npm run guide)');
    ok(SITE_MAP.every(p => PAGE_FILES[p.id]?.length), 'chaque page du menu a ses fichiers d\'écran listés');
    ok(Object.keys(PAGE_FILES).every(id => SITE_MAP.some(p => p.id === id)), 'aucun fichier listé pour une page qui n\'existe plus');
    const missing = Object.values(PAGE_FILES).flat().map(f => f.split(' ')[0]).filter(f => f.startsWith('src/') && !exists(f));
    ok(missing.length === 0, `les fichiers d'écran existent (${missing.join(', ') || 'tous'})`);
    const bad = brokenRefs(cur);
    ok(bad.length === 0, `le texte écrit à la main ne cite que des fichiers et des commandes qui existent (${bad.join(' ; ') || 'rien de cassé'})`);
    ok(/^# /m.test(cur) && cur.length > 20000, 'le guide est complet (titre et taille)');
    for (const h of ['## 1.', '## 2.', '## 3.', '## 4.', '## 5.', '## 6.', '## 7.', '## 8.', '## 9.', '## 10.']) ok(cur.includes(h), `section ${h} présente`);
    console.log(`\n${n - fails}/${n} contrôles réussis`);
    process.exit(fails ? 1 : 0);
  }
}
