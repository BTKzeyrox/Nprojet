// Assistant : résumé de la journée / de la semaine, modèles de messages, fichier à télécharger (BTK, 2026-11-09, étape C3, points 3, 2 et 4).
// Lecture seule : rien n'est créé ni envoyé. Le fichier est fabriqué sur l'appareil au moment du clic (aucun réseau). Règles pures, heure de Madagascar.
import { b, type Reply } from './assistant';
import { remDateOf, remDayDiff, remAddDays, REM_TYPE_LABEL } from './reminderRules';
import type { RemItem } from './reminderRules';
import { TEMPLATES } from './messageTemplates';

export const TPL_PREFIX = '__tpl:';
export const FILE_PREFIX = '__file:';
export type FileKind = 'csv' | 'txt-day' | 'txt-week';
export type ExtraIntent =
  | { kind: 'summary'; span: 'day' | 'week' }
  | { kind: 'file'; what: FileKind }
  | { kind: 'template'; id: string | null };

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'");
const PRE = "(?:(?:s'il (?:te|vous) plait|stp|please)[, ]+)?(?:(?:peux|pourrais)-tu\\s+|tu peux\\s+|could you\\s+|can you\\s+)?";
const SUM_RE = new RegExp(`^\\s*${PRE}(?:resume|resumer|recapitule|fais(?:-moi)? (?:le |un )?(?:resume|recap)|donne(?:-moi)? (?:le |un )?(?:resume|recap)|summar(?:y|ise|ize)|my)\\s*(?:de |d'|of |for )?(?:ma |mon |la |le |l'|my |this |the |cette |ce )?\\s*(journee|jour|day|semaine|week|aujourd'?hui|today|agenda)\\b`);
const FILE_RE = new RegExp(`^\\s*${PRE}(?:fais(?:-moi)?|cree|genere|prepare|donne(?:-moi)?|telecharge|exporte|export|download|make|create|generate)\\s+(?:moi\\s+)?(?:un |une |le |la |les |mon |ma |mes |a |my |the )?(?:fichier|file|export|csv|excel|tableau)?\\s*(?:de |d'|des |du |of |with |avec )?(?:mes |ma |mon |la |le |les |my |the )?(.*)$`);
const TPL_RE = new RegExp(`^\\s*${PRE}(?:(?:donne|montre|affiche|propose|ouvre|show|give|open)(?:-moi)?\\s+(?:les |des |un |le |mes |my |the )?)?(?:message[s]? modele[s]?|modele[s]? de messages?|modele[s]?|templates?|message templates?)\\s*[:：-]?\\s*(.*)$`);

/** Quel modèle l'admin veut-il ? Mots-clés simples, sans deviner : rien de trouvé = on montre la liste. */
const TPL_WORDS: Record<string, string[]> = {
  payment_reminder: ['relance', 'paiement', 'payer', 'facture', 'reminder', 'payment', 'invoice'],
  client_thanks: ['remerci', 'merci', 'thanks', 'thank'],
  mission_confirmation: ['confirm', 'intervention', 'mission'],
  advance_answer: ['avance', 'advance'],
  signup_answer: ['inscription', 'sign-up', 'signup', 'sign up'],
  team_notice: ['equipe', 'annonce', 'team', 'notice', 'info'],
};
export function findTemplateId(text: string): string | null {
  const n = norm(text);
  if (!n.trim()) return null;
  let best: string | null = null, bestN = 0;
  for (const [id, ws] of Object.entries(TPL_WORDS)) { const k = ws.filter(w => n.includes(w)).length; if (k > bestN) { best = id; bestN = k; } }
  return best;
}

export function parseExtraIntent(q: string): ExtraIntent | null {
  const n = norm(q).replace(/\s+/g, ' ').trim();
  if (!n || n.length > 160) return null;
  let m = SUM_RE.exec(n);
  if (m) return { kind: 'summary', span: /semaine|week/.test(m[1]) ? 'week' : 'day' };
  m = TPL_RE.exec(n);
  if (m) return { kind: 'template', id: findTemplateId(m[1] || '') };
  m = FILE_RE.exec(n) || /^\s*(?:fichier|file|export\w*)\s*(?:de |d'|des |du |of )?(.*)$/.exec(n);
  if (m && /\b(fichier|file|export\w*|csv|excel|tableau|telecharge|download)\b/.test(n)) {
    const w = m[1] || '';
    if (/resume|recap|summary/.test(n)) return { kind: 'file', what: /semaine|week/.test(n) ? 'txt-week' : 'txt-day' };
    if (/rappel|tache|liste|agenda|calendrier|evenement|reminder|task|list|calendar|event|todo/.test(w + ' ' + n)) return { kind: 'file', what: 'csv' };
  }
  return null;
}

// ===== Résumé =====
export interface DayEntry { date: string; time: string; allDay: boolean; text: string; kind: 'rem' | 'mission' }
/** Tout ce qui tombe entre aujourd'hui et `days` jours : rappels, événements, tâches non terminés + missions avec date limite. Les retards sont comptés à part. */
export function collectEntries(items: RemItem[], missions: { client_name: string; post_number: number; due_date?: string; due_time?: string }[], nowMs: number, days: number): { late: DayEntry[]; list: DayEntry[] } {
  const today = remDateOf(nowMs), end = remAddDays(today, days - 1);
  const late: DayEntry[] = [], list: DayEntry[] = [];
  const put = (e: DayEntry) => { if (e.date < today) late.push(e); else if (e.date <= end) list.push(e); };
  for (const it of items) {
    if (it.status !== 'todo' && it.status !== 'doing') continue;
    if (it.repeat.freq !== 'none') continue; // les répétitions restent dans le Calendrier (on ne les compte pas à moitié)
    put({ date: it.date, time: it.all_day ? '' : it.time, allDay: it.all_day, text: `${it.title} (${REM_TYPE_LABEL[it.type].fr})`, kind: 'rem' });
  }
  for (const c of missions) if (c.due_date) put({ date: c.due_date, time: c.due_time || '', allDay: !c.due_time, text: `Mission n°${c.post_number}${c.client_name ? ' · ' + c.client_name : ''} (date limite)`, kind: 'mission' });
  const key = (e: DayEntry) => e.date + (e.time || '00:00');
  late.sort((a, c) => key(a).localeCompare(key(c))); list.sort((a, c) => key(a).localeCompare(key(c)));
  return { late, list };
}
const DOW_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const dayName = (date: string, today: string): string => {
  const diff = remDayDiff(today, date);
  const dn = DOW_FR[new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))).getUTCDay()];
  return diff === 0 ? "aujourd'hui" : diff === 1 ? 'demain' : `${dn} ${date.slice(8, 10)}/${date.slice(5, 7)}`;
};
export function summaryReply(items: RemItem[], missions: Parameters<typeof collectEntries>[1], nowMs: number, span: 'day' | 'week'): Reply {
  const today = remDateOf(nowMs);
  const { late, list } = collectEntries(items, missions, nowMs, span === 'day' ? 1 : 7);
  const lines: ReturnType<typeof b>[] = [];
  if (late.length) lines.push(b(`🔴 En retard (${late.length}) : ${late.slice(0, 4).map(e => e.text).join(' ; ')}${late.length > 4 ? '…' : ''}`, `🔴 Overdue (${late.length}): ${late.slice(0, 4).map(e => e.text).join('; ')}${late.length > 4 ? '…' : ''}`));
  let last = '';
  for (const e of list.slice(0, 20)) {
    const day = span === 'week' && e.date !== last ? `${dayName(e.date, today)} — ` : '';
    last = e.date;
    lines.push(b(`${day}${e.time ? e.time + ' ' : ''}${e.text}`, `${day}${e.time ? e.time + ' ' : ''}${e.text}`));
  }
  if (list.length > 20) lines.push(b(`… et ${list.length - 20} autres (voir le Calendrier).`, `… and ${list.length - 20} more (see the Calendar).`));
  const empty = lines.length === 0;
  return {
    intent: span === 'day' ? 'summary_day' : 'summary_week',
    title: b(span === 'day' ? 'Ta journée' : 'Ta semaine (7 jours)', span === 'day' ? 'Your day' : 'Your week (7 days)'),
    lines: empty ? [b('Rien de prévu : ni rappel, ni événement, ni tâche, ni mission avec date limite.', 'Nothing planned: no reminder, event, task or mission with a deadline.')] : [...lines, b('Ce résumé ne contient que ce qui a une date (rappels, événements, tâches, missions avec date limite).', 'This summary only holds dated items (reminders, events, tasks, missions with a deadline).')],
    actions: [{ label: b('Voir le Calendrier', 'Open the Calendar'), go: { view: 'calendar' } }, { label: b('Télécharger ce résumé', 'Download this summary'), go: { view: FILE_PREFIX + (span === 'day' ? 'txt-day' : 'txt-week') } }],
    sources: b('Rappels, calendrier et dates limites des missions.', 'Reminders, calendar and mission deadlines.'),
    empty,
  };
}

// ===== Fichier =====
const csvCell = (v: string): string => { const s = String(v ?? '').replace(/\r?\n/g, ' '); return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export interface BuiltFile { name: string; mime: string; content: string }
export function buildFile(what: FileKind, items: RemItem[], missions: Parameters<typeof collectEntries>[1], nowMs: number): BuiltFile {
  const today = remDateOf(nowMs);
  if (what === 'csv') {
    const rows = [['Type', 'Titre', 'Date', 'Heure', 'Statut', 'Priorité', 'Sous-tâches']];
    const open = items.filter(i => i.status === 'todo' || i.status === 'doing').sort((a, c) => (a.date + a.time).localeCompare(c.date + c.time)).slice(0, 500);
    for (const i of open) rows.push([REM_TYPE_LABEL[i.type].fr, i.title, i.date, i.all_day ? '' : i.time, i.status === 'doing' ? 'en cours' : 'à faire', i.priority, (i.subtasks || []).map(s => `${s.done ? '[x]' : '[ ]'} ${s.text}`).join(' | ')]);
    return { name: `rappels-${today}.csv`, mime: 'text/csv;charset=utf-8', content: '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n' };
  }
  const week = what === 'txt-week';
  const { late, list } = collectEntries(items, missions, nowMs, week ? 7 : 1);
  const out = [`${week ? 'Ma semaine (7 jours)' : 'Ma journée'} — ${today.split('-').reverse().join('/')}`, ''];
  if (late.length) { out.push('EN RETARD'); for (const e of late) out.push(`- ${e.date.split('-').reverse().join('/')} ${e.time} ${e.text}`.replace(/\s+/g, ' ')); out.push(''); }
  let last = '';
  for (const e of list) { if (week && e.date !== last) { out.push(dayName(e.date, today).toUpperCase()); last = e.date; } out.push(`- ${e.time ? e.time + ' ' : ''}${e.text}`); }
  if (!late.length && !list.length) out.push('Rien de prévu.');
  return { name: `${week ? 'semaine' : 'journee'}-${today}.txt`, mime: 'text/plain;charset=utf-8', content: out.join('\r\n') + '\r\n' };
}
export const fileReply = (what: FileKind): Reply => ({
  intent: 'file_offer',
  title: b(what === 'csv' ? 'Fichier de tes rappels, événements et tâches' : what === 'txt-week' ? 'Fichier de ta semaine' : 'Fichier de ta journée', what === 'csv' ? 'File of your reminders, events and tasks' : what === 'txt-week' ? 'File of your week' : 'File of your day'),
  lines: [what === 'csv' ? b('Un tableau .csv (il s\'ouvre dans Excel) avec ce qui n\'est pas terminé. Il est fabriqué sur ton appareil, rien ne part sur internet.', 'A .csv table (opens in Excel) with what is not finished. It is made on your device, nothing goes over the internet.') : b('Un petit fichier texte (.txt), fabriqué sur ton appareil. Rien ne part sur internet.', 'A small text (.txt) file, made on your device. Nothing goes over the internet.')],
  actions: [{ label: b('Télécharger', 'Download'), go: { view: FILE_PREFIX + what } }],
  sources: b('Rappels, calendrier et dates limites des missions.', 'Reminders, calendar and mission deadlines.'),
});
export const fileDone = (name: string, ok: boolean): Reply => ({
  intent: ok ? 'file_done' : 'file_error',
  title: ok ? b('Fichier prêt', 'File ready') : b('Je n\'ai pas pu fabriquer le fichier', 'I could not make the file'),
  lines: [ok ? b(`« ${name} » est dans les téléchargements de ton appareil.`, `"${name}" is in your device downloads.`) : b('Rien n\'a été téléchargé. Réessaie, ou copie le texte à la main.', 'Nothing was downloaded. Try again, or copy the text by hand.')],
  actions: [], sources: b('', ''),
});
export const isFileKind = (s: string): s is FileKind => s === 'csv' || s === 'txt-day' || s === 'txt-week';

// ===== Modèles de messages =====
export function templatesReply(id: string | null): Reply {
  const lst = TEMPLATES.map(t => ({ label: { fr: t.name.fr, en: t.name.en }, go: { view: TPL_PREFIX + t.id } }));
  const one = id ? TEMPLATES.find(t => t.id === id) : null;
  if (one) return { intent: 'template_pick', title: b(`Modèle : ${one.name.fr}`, `Template: ${one.name.en}`), lines: [b('Je l\'ouvre dans l\'éditeur : tu remplis les champs, tu relis, puis tu copies. Rien n\'est envoyé.', 'I open it in the editor: fill the fields, read it, then copy. Nothing is sent.')], actions: [{ label: b('Ouvrir ce modèle', 'Open this template'), go: { view: TPL_PREFIX + one.id } }, { label: b('Voir tous les modèles', 'See all templates'), go: { view: TPL_PREFIX } }], sources: b('Modèles du site.', 'Site templates.') };
  return { intent: 'template_list', title: b('Les modèles de messages', 'Message templates'), lines: [b('Choisis un modèle : il s\'ouvre dans l\'éditeur, tu remplis les champs, tu relis, puis tu copies. Rien n\'est envoyé.', 'Pick a template: it opens in the editor, fill the fields, read it, then copy. Nothing is sent.')], actions: lst, sources: b('Modèles du site.', 'Site templates.') };
}
