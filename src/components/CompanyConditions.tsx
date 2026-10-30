import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, HelpCircle, Save, RotateCcw, History, Building2, CalendarDays } from 'lucide-react';
import { db } from '../db/store';
import { askConfirm } from './ConfirmModal';
import { COMPANY_DEFAULTS, COMPANY_SPEC, cleanCompany, readCompany } from '../utils/companyRules';
import { WATCH_FIELDS } from '../utils/health/watchPrefs';
import { HEALTH_THRESHOLDS_DEFAULT } from '../utils/health/types';
import { HIDEABLE_MODULES, parseHidden, hiddenToCsv } from '../utils/moduleSwitch';
import type { CompanySettings } from '../types';

// Conditions de l'entreprise (module 0). Admin : modifie. Opérateur : lit seulement le règlement et les congés (le serveur ne lui envoie rien d'autre).
type Kind = 'text' | 'area' | 'int' | 'num' | 'bool' | 'select' | 'lines' | 'time';
interface F { sec: keyof CompanySettings; key: string; kind: Kind; fr: string; en: string; help: [string, string]; dflt: [string, string]; opts?: [string, string, string][]; unit?: [string, string] }
interface Sec { id: keyof CompanySettings; fr: string; en: string; note?: [string, string]; shared?: boolean }

const NOT_SURE: [string, string] = ['Laisser vide.', 'Leave empty.'];
const SECTIONS: Sec[] = [
  { id: 'identity', fr: 'Identité', en: 'Identity' },
  { id: 'legal', fr: 'Mentions légales', en: 'Legal notices', note: ['Rien n\'est inventé : un document n\'affiche que ce qui est rempli ici.', 'Nothing is made up: a document only shows what is filled in here.'] },
  { id: 'tax', fr: 'Taxes (TVA)', en: 'Taxes (VAT)' },
  { id: 'billing', fr: 'Facturation', en: 'Invoicing' },
  { id: 'payroll', fr: 'Paie', en: 'Payroll', note: ['Le plafond et le remboursement des avances se règlent dans Équipe > Paie.', 'The advance cap and repayment are set in Team > Payroll.'] },
  { id: 'leave', fr: 'Congés et présence', en: 'Leave and attendance', shared: true },
  { id: 'missions', fr: 'Missions', en: 'Missions' },
  { id: 'clients', fr: 'Clients (statuts)', en: 'Clients (statuses)', note: ['Ces seuils décident du statut calculé de chaque client (Nouveau, Régulier, Stratégique, Inactif). Les valeurs de départ conviennent à la plupart des entreprises.', 'These thresholds decide each client\'s calculated status (New, Regular, Strategic, Inactive). The starting values suit most companies.'] },
  { id: 'modules', fr: 'Pages du menu (cacher)', en: 'Menu pages (hide)', shared: true, note: ['Coche une page pour la CACHER du menu. Rien n\'est supprimé : les données restent, et tu peux la remontrer à tout moment. Actualités et Réglages restent toujours visibles.', 'Tick a page to HIDE it from the menu. Nothing is deleted: the data stays, and you can show it again any time. News and Settings are always visible.'] },
  { id: 'options', fr: 'Choix de fonctionnement', en: 'How the app works' },
  { id: 'texts', fr: 'Règlement et conditions', en: 'Rules and terms' },
  { id: 'watch', fr: 'Surveillance (Santé du site)', en: 'Monitoring (Site health)', note: ['Seuils des alertes, partagés par tous les administrateurs. 0 ou vide = valeur de départ. Un appareil peut en changer pour lui seul dans Réglages > Surveillance.', 'Alert thresholds, shared by all administrators. 0 or empty = starting value. A device can override them for itself in Settings > Monitoring.'] },
];
const WATCH_F: F[] = WATCH_FIELDS.map(w => ({ sec: 'watch' as const, key: w.key, kind: 'int' as const, fr: w.fr, en: w.en, unit: [w.unit.fr, w.unit.en] as [string, string], help: [`${w.fr} (en ${w.unit.fr}). 0 = valeur de départ.`, `${w.en} (in ${w.unit.en}). 0 = starting value.`] as [string, string], dflt: [`${HEALTH_THRESHOLDS_DEFAULT[w.key]} ${w.unit.fr}.`, `${HEALTH_THRESHOLDS_DEFAULT[w.key]} ${w.unit.en}.`] as [string, string] }));
const FIELDS: F[] = [
  { sec: 'identity', key: 'name', kind: 'text', fr: 'Nom de l\'entreprise', en: 'Company name', help: ['Le nom affiché sur les rapports, et plus tard sur les factures.', 'The name shown on reports, and later on invoices.'], dflt: NOT_SURE },
  { sec: 'identity', key: 'address', kind: 'text', fr: 'Adresse', en: 'Address', help: ['L\'adresse de l\'entreprise.', 'The company address.'], dflt: NOT_SURE },
  { sec: 'identity', key: 'phone', kind: 'text', fr: 'Téléphone', en: 'Phone', help: ['Le numéro à afficher sur les documents.', 'The number to show on documents.'], dflt: NOT_SURE },
  { sec: 'identity', key: 'email', kind: 'text', fr: 'E-mail', en: 'E-mail', help: ['Une adresse e-mail valide (exemple : nom@societe.mg).', 'A valid e-mail address (example: name@company.mg).'], dflt: NOT_SURE },
  { sec: 'identity', key: 'logo_url', kind: 'text', fr: 'Logo (lien https)', en: 'Logo (https link)', help: ['Le lien d\'une image du logo. Il doit commencer par https://. L\'envoi direct d\'une image viendra plus tard.', 'A link to the logo image. It must start with https://. Direct upload will come later.'], dflt: NOT_SURE },
  { sec: 'identity', key: 'currency', kind: 'text', fr: 'Devise', en: 'Currency', help: ['Le sigle de la monnaie (exemple : Ar).', 'The currency symbol (example: Ar).'], dflt: ['Ar', 'Ar'] },
  { sec: 'legal', key: 'tax_id', kind: 'text', fr: 'Numéro d\'identification fiscale', en: 'Tax ID number', help: ['Le numéro donné par l\'administration des impôts. Il s\'affiche sur les documents seulement s\'il est rempli.', 'The number given by the tax office. It is shown on documents only if filled in.'], dflt: ['Si tu ne sais pas : laisser vide et demander à l\'entreprise ou à un comptable.', 'If you do not know: leave empty and ask the company or an accountant.'] },
  { sec: 'legal', key: 'register_id', kind: 'text', fr: 'Numéro de registre (commerce)', en: 'Trade register number', help: ['Le numéro d\'inscription de l\'entreprise, s\'il existe.', 'The company registration number, if there is one.'], dflt: NOT_SURE },
  { sec: 'legal', key: 'notes', kind: 'lines', fr: 'Autres mentions (une par ligne)', en: 'Other notices (one per line)', help: ['Toute autre mention exigée sur les documents. 10 lignes au maximum.', 'Any other notice required on documents. 10 lines at most.'], dflt: NOT_SURE },
  { sec: 'tax', key: 'vat_enabled', kind: 'bool', fr: 'Cette entreprise applique la TVA', en: 'This company applies VAT', help: ['Coche seulement si l\'entreprise facture la TVA à ses clients.', 'Tick only if the company charges VAT to its clients.'], dflt: ['Non.', 'No.'] },
  { sec: 'tax', key: 'vat_rate', kind: 'num', fr: 'Taux de TVA', en: 'VAT rate', unit: ['%', '%'], help: ['Le pourcentage de TVA, entre 0 et 100.', 'The VAT percentage, between 0 and 100.'], dflt: ['0, tant que la TVA n\'est pas cochée.', '0, as long as VAT is not ticked.'] },
  { sec: 'tax', key: 'vat_exempt_text', kind: 'text', fr: 'Texte « TVA non applicable »', en: '“VAT not applicable” text', help: ['La phrase à écrire sur les factures sans TVA.', 'The sentence to print on invoices without VAT.'], dflt: NOT_SURE },
  { sec: 'billing', key: 'invoice_prefix', kind: 'text', fr: 'Début du numéro de facture', en: 'Invoice number prefix', help: ['Les lettres au début du numéro (exemple : FA-).', 'The letters at the start of the number (example: FA-).'], dflt: ['FA-', 'FA-'] },
  { sec: 'billing', key: 'receipt_prefix', kind: 'text', fr: 'Début du numéro de reçu', en: 'Receipt number prefix', help: ['Les lettres au début du numéro de reçu (exemple : RC-).', 'The letters at the start of the receipt number (example: RC-).'], dflt: ['RC-', 'RC-'] },
  { sec: 'billing', key: 'payment_days', kind: 'int', fr: 'Délai de paiement', en: 'Payment deadline', unit: ['jours', 'days'], help: ['Le nombre de jours que le client a pour payer.', 'The number of days a client has to pay.'], dflt: ['30 jours.', '30 days.'] },
  { sec: 'billing', key: 'late_penalty_text', kind: 'text', fr: 'Pénalités de retard (texte)', en: 'Late payment penalties (text)', help: ['La phrase sur les pénalités si le client paie en retard.', 'The sentence about penalties if the client pays late.'], dflt: NOT_SURE },
  { sec: 'billing', key: 'payment_methods_text', kind: 'text', fr: 'Modes de paiement acceptés', en: 'Accepted payment methods', help: ['Exemple : espèces, virement, mobile money.', 'Example: cash, bank transfer, mobile money.'], dflt: NOT_SURE },
  { sec: 'billing', key: 'invoice_footer', kind: 'text', fr: 'Texte en bas de facture', en: 'Invoice footer text', help: ['Une phrase en bas de chaque facture (exemple : merci de votre confiance).', 'A sentence at the bottom of each invoice (example: thank you for your trust).'], dflt: NOT_SURE },
  { sec: 'payroll', key: 'pay_day', kind: 'int', fr: 'Jour de paie', en: 'Pay day', unit: ['du mois', 'of month'], help: ['Le jour du mois où les salaires sont payés (1 à 31). 0 = pas réglé.', 'The day of the month when wages are paid (1 to 31). 0 = not set.'], dflt: ['0 (pas réglé).', '0 (not set).'] },
  { sec: 'payroll', key: 'pay_rounding', kind: 'select', fr: 'Arrondi de la paie', en: 'Pay rounding', opts: [['none', 'Aucun', 'None'], ['10', 'À 10 Ar', 'To 10'], ['100', 'À 100 Ar', 'To 100'], ['1000', 'À 1 000 Ar', 'To 1,000']], help: ['Arrondir les montants de paie. Pour l\'instant ce réglage est seulement enregistré.', 'Round pay amounts. For now this setting is only stored.'], dflt: ['Aucun.', 'None.'] },
  { sec: 'leave', key: 'leave_days_per_year', kind: 'int', fr: 'Jours de congé par an', en: 'Leave days per year', unit: ['jours', 'days'], help: ['Le nombre de jours de congé par an pour un salarié (0 à 60). 0 = pas réglé.', 'Leave days per employee per year (0 to 60). 0 = not set.'], dflt: NOT_SURE },
  { sec: 'leave', key: 'work_days_per_week', kind: 'int', fr: 'Jours travaillés par semaine', en: 'Working days per week', unit: ['jours', 'days'], help: ['De 1 à 7. 0 = pas réglé.', 'From 1 to 7. 0 = not set.'], dflt: NOT_SURE },
  { sec: 'leave', key: 'late_limit_time', kind: 'time', fr: 'Heure limite avant retard', en: 'Time limit before late', help: ['Au-delà de cette heure, le salarié est en retard (format 08:30).', 'After this time the employee is late (format 08:30).'], dflt: NOT_SURE },
  { sec: 'missions', key: 'validation_hours', kind: 'int', fr: 'Délai de validation attendu', en: 'Expected validation time', unit: ['heures', 'hours'], help: ['Le temps maximum pour valider une mission (0 à 720 heures). 0 = pas réglé.', 'Maximum time to validate a mission (0 to 720 hours). 0 = not set.'], dflt: NOT_SURE },
  { sec: 'missions', key: 'refusal_reason_required', kind: 'bool', fr: 'Un motif est obligatoire pour refuser', en: 'A reason is required to refuse', help: ['Le responsable doit écrire pourquoi il refuse une mission.', 'The manager must write why a mission is refused.'], dflt: ['Oui.', 'Yes.'] },
  { sec: 'clients', key: 'new_days', kind: 'int', fr: 'Client « Nouveau » pendant', en: 'Client is “New” for', unit: ['jours', 'days'], help: ['Un client est « Nouveau » si sa première mission date de moins de ce nombre de jours.', 'A client is “New” if its first mission is less than this many days old.'], dflt: ['60 jours.', '60 days.'] },
  { sec: 'clients', key: 'regular_missions', kind: 'int', fr: 'Client « Régulier » : missions', en: 'Client is “Regular”: missions', help: ['Nombre minimum de missions validées pour être « Régulier »…', 'Minimum number of validated missions to be “Regular”…'], dflt: ['3 missions.', '3 missions.'] },
  { sec: 'clients', key: 'regular_months', kind: 'int', fr: '…sur les derniers mois', en: '…over the last months', unit: ['mois', 'months'], help: ['…pendant cette période (1 à 24 mois).', '…during this period (1 to 24 months).'], dflt: ['6 mois.', '6 months.'] },
  { sec: 'clients', key: 'strategic_top_pct', kind: 'int', fr: 'Client « Stratégique » : meilleurs', en: 'Client is “Strategic”: top', unit: ['%', '%'], help: ['Les clients qui rapportent le plus (en pourcentage des clients, ex. 20 = les 20 % premiers).', 'The clients that bring in the most (as a percentage of clients, e.g. 20 = the top 20 %).'], dflt: ['20 %.', '20 %.'] },
  { sec: 'clients', key: 'strategic_months', kind: 'int', fr: '…sur les derniers mois (chiffre d\'affaires)', en: '…over the last months (revenue)', unit: ['mois', 'months'], help: ['La période prise en compte pour le chiffre d\'affaires (1 à 36 mois).', 'The period used for revenue (1 to 36 months).'], dflt: ['12 mois.', '12 months.'] },
  { sec: 'clients', key: 'strategic_min_missions', kind: 'int', fr: '…avec au moins ce nombre de missions', en: '…with at least this many missions', help: ['Pour éviter qu\'un client avec une seule grosse mission soit « Stratégique ».', 'So that a client with one single big mission is not “Strategic”.'], dflt: ['5 missions.', '5 missions.'] },
  { sec: 'clients', key: 'inactive_days', kind: 'int', fr: 'Client « Inactif » après', en: 'Client is “Inactive” after', unit: ['jours sans mission', 'days without a mission'], help: ['Un client est « Inactif » s\'il n\'a eu aucune mission depuis ce nombre de jours.', 'A client is “Inactive” if it has had no mission for this many days.'], dflt: ['90 jours.', '90 days.'] },
  { sec: 'options', key: 'invoice_per', kind: 'select', fr: 'Une facture par…', en: 'One invoice per…', opts: [['client_month', 'Client et par mois', 'Client and month'], ['mission', 'Mission', 'Mission']], help: ['Choix pour le futur module de facturation.', 'Choice for the future invoicing module.'], dflt: ['Client et par mois (moins de papier).', 'Client and month (less paper).'] },
  { sec: 'options', key: 'quotes_enabled', kind: 'bool', fr: 'Devis activés', en: 'Quotes enabled', help: ['Pour le futur module de facturation.', 'For the future invoicing module.'], dflt: ['Non.', 'No.'] },
  { sec: 'options', key: 'badges_enabled', kind: 'bool', fr: 'Badges de performance activés', en: 'Performance badges enabled', help: ['Pour le futur module des badges.', 'For the future badges module.'], dflt: ['Oui.', 'Yes.'] },
  { sec: 'options', key: 'employee_sees_badges', kind: 'bool', fr: 'Le salarié voit ses badges et son score', en: 'Employee sees own badges and score', help: ['Il ne verra jamais le score des autres.', 'He or she will never see other people\'s scores.'], dflt: ['Oui.', 'Yes.'] },
  { sec: 'options', key: 'employee_sees_attention', kind: 'bool', fr: 'Le salarié voit ses points d\'attention', en: 'Employee sees own watch points', help: ['Sinon il ne voit que ses réussites.', 'Otherwise he or she only sees achievements.'], dflt: ['Non.', 'No.'] },
  { sec: 'options', key: 'mission_requires_client', kind: 'bool', fr: 'Une mission a toujours un client', en: 'A mission always has a client', help: ['Pour le futur module des clients.', 'For the future clients module.'], dflt: ['Oui.', 'Yes.'] },
  { sec: 'texts', key: 'internal_rules', kind: 'area', fr: 'Règlement intérieur (visible par les opérateurs)', en: 'Internal rules (visible to operators)', help: ['Texte lu par les salariés dans leurs Réglages, en lecture seule.', 'Text read by employees in their Settings, read-only.'], dflt: NOT_SURE },
  { sec: 'texts', key: 'customer_terms', kind: 'area', fr: 'Conditions pour les clients', en: 'Terms for clients', help: ['Texte imprimé plus tard sur les devis et factures. Les opérateurs ne le voient pas.', 'Text printed later on quotes and invoices. Operators cannot see it.'], dflt: NOT_SURE },
  { sec: 'modules', key: 'hidden', kind: 'text', fr: 'Pages cachées', en: 'Hidden pages', help: ['La liste des pages cachées, gérée par les cases ci-dessous.', 'The list of hidden pages, managed by the boxes below.'], dflt: ['Aucune page cachée.', 'No page hidden.'] },
  ...WATCH_F,
];

const inputCls = 'w-full min-h-[44px] bg-[#141e2a] border border-slate-600 p-2.5 text-white text-sm rounded-lg focus:border-emerald-500 focus:outline-none';
const boxCls = 'bg-[#0f1722] border border-slate-700 rounded-2xl';
type Raw = Record<string, string | boolean>;

const toRaw = (c: CompanySettings): Raw => {
  const r: Raw = {};
  for (const f of FIELDS) {
    const v = (c as any)[f.sec][f.key];
    r[`${f.sec}.${f.key}`] = f.kind === 'lines' ? (v as string[]).join('\n') : f.kind === 'bool' ? !!v : String(v ?? '');
  }
  return r;
};
const fromRaw = (r: Raw): unknown => {
  const o: any = {};
  for (const f of FIELDS) {
    o[f.sec] = o[f.sec] || {};
    const v = r[`${f.sec}.${f.key}`];
    o[f.sec][f.key] = f.kind === 'lines' ? String(v).split('\n') : f.kind === 'bool' ? !!v : (f.kind === 'int' || f.kind === 'num') && String(v).trim() === '' ? 0 : v;
  }
  return o;
};

export const CompanyConditions: React.FC<{ lang: 'fr' | 'en'; openAll?: boolean }> = ({ lang, openAll }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const stored = db.getSettings();
  const current = useMemo(() => readCompany(stored.company), [stored.company]);
  const [raw, setRaw] = useState<Raw>(() => toRaw(current));
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>(() => (openAll ? Object.fromEntries(SECTIONS.map(x => [x.id, true])) : { identity: true }));
  const [help, setHelp] = useState<string | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [showLog, setShowLog] = useState(false);

  // Si les Conditions changent ailleurs (autre appareil), on recharge tant qu'on n'a rien modifié.
  useEffect(() => db.subscribe(() => { if (!touched) setRaw(toRaw(readCompany(db.getSettings().company))); }), [touched]);

  const set = (k: string, v: string | boolean) => { setRaw(p => ({ ...p, [k]: v })); setTouched(true); setSaved(false); setBad([]); };
  const labelOf = (path: string) => { const f = FIELDS.find(x => `${x.sec}.${x.key}` === path); return f ? t(f.fr, f.en) : path; };

  const save = () => {
    const r = cleanCompany(fromRaw(raw), current);
    if (r.errors.length) { setBad(r.errors); return; }
    db.updateSettings({ company: r.value });
    setRaw(toRaw(r.value)); // montre ce qui a vraiment été gardé (espaces retirés, HTML retiré…)
    setTouched(false); setSaved(true); setBad([]);
  };
  const resetDefaults = () => askConfirm({
    title: t('Remettre les valeurs de départ ?', 'Reset to starting values?'),
    message: t('Tous les champs reviennent aux valeurs prudentes de départ. Rien n\'est enregistré tant que tu ne touches pas « Enregistrer ».', 'All fields go back to the cautious starting values. Nothing is saved until you tap “Save”.'),
    confirmLabel: t('Remettre', 'Reset'),
    onConfirm: () => { setRaw(toRaw(COMPANY_DEFAULTS)); setTouched(true); setSaved(false); setBad([]); },
  });
  const log = (stored.company_log || []).slice(-10).reverse();

  return (
    <div className="space-y-3" data-notranslate="">
      <div className={`${boxCls} p-4 space-y-2`}>
        <h3 className="font-tactical font-bold text-white flex items-center gap-2"><Building2 className="w-4 h-4 text-emerald-400" />{t('Conditions de l\'entreprise', 'Company conditions')}</h3>
        <p className="text-xs text-slate-300">{t('Les règles de l\'entreprise (TVA, délais, congés…) se règlent ici, pas dans le code. Tout est facultatif. Si tu ne sais pas : laisse comme ça.', 'The company rules (VAT, deadlines, leave…) are set here, not in the code. Everything is optional. If you do not know: leave it as it is.')}</p>
        <p className="text-[11px] text-amber-300">{t('À vérifier avec un comptable ou le responsable de l\'entreprise. Gestion Pro ne donne pas de conseil légal.', 'To be checked with an accountant or the company manager. Gestion Pro gives no legal advice.')}</p>
        <button type="button" onClick={resetDefaults} className="min-h-[44px] px-4 rounded-lg border border-slate-600 text-slate-200 text-xs font-mono hover:border-emerald-500 cursor-pointer inline-flex items-center gap-2"><RotateCcw className="w-4 h-4" />{t('Valeurs de départ', 'Starting values')}</button>
      </div>

      {bad.length > 0 && <div role="alert" className="p-3 rounded-2xl border border-red-500/60 bg-red-950 text-red-200 text-sm font-semibold">{t('Rien n\'a été enregistré. À corriger : ', 'Nothing was saved. Please fix: ')}{bad.map(labelOf).join(', ')}.</div>}
      {saved && <div role="status" className="p-3 rounded-2xl border border-emerald-500/60 bg-emerald-950 text-emerald-200 text-sm font-semibold">{t('Conditions enregistrées.', 'Conditions saved.')}</div>}

      {SECTIONS.map(sec => {
        const isOpen = !!open[sec.id];
        return (
          <section key={sec.id} className={boxCls}>
            <button type="button" aria-expanded={isOpen} onClick={() => setOpen(p => ({ ...p, [sec.id]: !p[sec.id] }))} className="w-full min-h-[48px] px-4 flex items-center justify-between gap-2 text-left cursor-pointer">
              <span className="font-tactical font-bold text-white">{t(sec.fr, sec.en)}{sec.shared && <span className="ml-2 text-[10px] font-mono font-normal text-emerald-400">{t('visible par les opérateurs', 'visible to operators')}</span>}</span>
              {isOpen ? <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" /> : <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />}
            </button>
            {isOpen && (
              <div className="px-4 pb-4 space-y-4">
                {sec.note && <p className="text-[11px] text-slate-400">{t(sec.note[0], sec.note[1])}</p>}
                {sec.id === 'modules' && (
                  <div className="space-y-3">
                    {(['work', 'money', 'team', 'talk'] as const).map(g => (
                      <fieldset key={g} className="space-y-1">
                        <legend className="text-[11px] font-mono uppercase text-slate-400">{g === 'work' ? t('Travail', 'Work') : g === 'money' ? t('Argent et clients', 'Money and clients') : g === 'team' ? t('Équipe', 'Team') : t('Communication', 'Communication')}</legend>
                        {HIDEABLE_MODULES.filter(m => m.group === g).map(m => {
                          const off = parseHidden(String(raw['modules.hidden'])).includes(m.id);
                          return (
                            <label key={m.id} className="flex items-center gap-3 min-h-[44px] text-sm text-slate-200 cursor-pointer">
                              <input type="checkbox" checked={off} onChange={e => { const cur = parseHidden(String(raw['modules.hidden'])); set('modules.hidden', hiddenToCsv(e.target.checked ? [...cur, m.id] : cur.filter(x => x !== m.id))); }} className="w-5 h-5 accent-emerald-500" />
                              <span>{t(m.fr, m.en)}</span>
                              {off && <span className="text-[10px] font-mono text-amber-300">{t('cachée', 'hidden')}</span>}
                            </label>
                          );
                        })}
                      </fieldset>
                    ))}
                  </div>
                )}
                {FIELDS.filter(f => f.sec === sec.id).map(f => {
                  const k = `${f.sec}.${f.key}`, v = raw[k];
                  const isBad = bad.includes(k), id = `co-${f.sec}-${f.key}`;
                  const spec: any = (COMPANY_SPEC as any)[f.sec][f.key];
                  return (
                    <div key={k} className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <label htmlFor={id} className="block text-slate-200 text-xs font-mono">{t(f.fr, f.en)}{f.unit && <span className="text-slate-400"> ({t(f.unit[0], f.unit[1])})</span>}</label>
                        <button type="button" aria-label={t('Aide', 'Help')} aria-expanded={help === k} onClick={() => setHelp(help === k ? null : k)} className="shrink-0 w-11 h-8 -mt-1 -mr-2 flex items-center justify-center text-slate-400 hover:text-emerald-400 cursor-pointer"><HelpCircle className="w-4 h-4" /></button>
                      </div>
                      {f.kind === 'bool' ? (
                        <label className="flex items-center gap-3 min-h-[44px] text-sm text-slate-200 cursor-pointer"><input id={id} type="checkbox" checked={!!v} onChange={e => set(k, e.target.checked)} className="w-5 h-5 accent-emerald-500" />{v ? t('Oui', 'Yes') : t('Non', 'No')}</label>
                      ) : f.kind === 'select' ? (
                        <select id={id} value={String(v)} onChange={e => set(k, e.target.value)} className={inputCls}>{f.opts!.map(o => <option key={o[0]} value={o[0]}>{t(o[1], o[2])}</option>)}</select>
                      ) : f.kind === 'area' || f.kind === 'lines' ? (
                        <textarea id={id} value={String(v)} rows={f.kind === 'area' ? 6 : 4} maxLength={f.kind === 'area' ? spec.max + 200 : 3000} onChange={e => set(k, e.target.value)} className={`${inputCls} ${isBad ? 'border-red-500' : ''}`} />
                      ) : (
                        <input id={id} type={f.kind === 'int' || f.kind === 'num' ? 'number' : 'text'} inputMode={f.kind === 'num' ? 'decimal' : f.kind === 'int' ? 'numeric' : undefined} value={String(v)} readOnly={f.sec === 'modules'} onChange={e => set(k, e.target.value)} placeholder={f.kind === 'time' ? '08:30' : undefined} min={spec.min} max={spec.max} step={f.kind === 'num' ? 0.01 : undefined} maxLength={spec.t === 'text' ? spec.max + 40 : undefined} className={`${inputCls} ${isBad ? 'border-red-500' : ''}`} />
                      )}
                      {help === k && <p className="text-[11px] text-slate-300 bg-black/20 rounded-lg p-2">{t(f.help[0], f.help[1])} <span className="text-emerald-300">{t('Si je ne sais pas : ', 'If I do not know: ')}{t(f.dflt[0], f.dflt[1])}</span></p>}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <div className={`${boxCls} p-4 space-y-3`}>
        <button type="button" onClick={save} disabled={!touched} className="w-full min-h-[48px] rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold cursor-pointer inline-flex items-center justify-center gap-2"><Save className="w-4 h-4" />{t('Enregistrer les conditions', 'Save conditions')}</button>
        {touched && <p className="text-[11px] text-amber-300">{t('Modifications non enregistrées.', 'Unsaved changes.')}</p>}
        <button type="button" onClick={() => setShowLog(v => !v)} aria-expanded={showLog} className="min-h-[44px] text-xs font-mono text-slate-300 hover:text-emerald-400 cursor-pointer inline-flex items-center gap-2"><History className="w-4 h-4" />{t('Historique des changements', 'Change history')} ({log.length})</button>
        {showLog && (log.length === 0 ? <p className="text-[11px] text-slate-400">{t('Aucun changement enregistré pour l\'instant.', 'No change recorded yet.')}</p> : (
          <ul className="space-y-1">{log.map((e, i) => <li key={i} className="text-[11px] text-slate-300 break-words">{new Date(e.at).toLocaleString(lang === 'en' ? 'en-GB' : 'fr-FR')} · {e.by_name || '—'} · <b>{labelOf(e.path)}</b> · {t('avant', 'before')} : {e.before === '' ? t('(vide)', '(empty)') : e.before}</li>)}</ul>
        ))}
      </div>
    </div>
  );
};

// Ce que voit un opérateur : le règlement intérieur et les règles de congés/présence, en lecture seule (rien d'argent : le serveur ne l'envoie pas).
export const CompanyForEmployee: React.FC<{ lang: 'fr' | 'en' }> = ({ lang }) => {
  const t = (fr: string, en: string) => (lang === 'en' ? en : fr);
  const c = readCompany(db.getSettings().company);
  const rules = c.texts.internal_rules.trim();
  const l = c.leave;
  const hasLeave = l.leave_days_per_year > 0 || l.work_days_per_week > 0 || !!l.late_limit_time;
  if (!rules && !hasLeave) return null;
  return (
    <section className={`${boxCls} p-4 space-y-3`} data-notranslate="">
      <h3 className="font-tactical font-bold text-white flex items-center gap-2"><CalendarDays className="w-4 h-4 text-emerald-400" />{t('Règlement et congés', 'Rules and leave')}</h3>
      {hasLeave && (
        <ul className="text-sm text-slate-200 space-y-1">
          {l.leave_days_per_year > 0 && <li>{t('Jours de congé par an', 'Leave days per year')} : <b>{l.leave_days_per_year}</b></li>}
          {l.work_days_per_week > 0 && <li>{t('Jours travaillés par semaine', 'Working days per week')} : <b>{l.work_days_per_week}</b></li>}
          {l.late_limit_time && <li>{t('Heure limite avant retard', 'Time limit before late')} : <b>{l.late_limit_time}</b></li>}
        </ul>
      )}
      {rules && <div><p className="text-[11px] font-mono uppercase text-slate-400 mb-1">{t('Règlement intérieur', 'Internal rules')}</p><p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{rules}</p></div>}
    </section>
  );
};
