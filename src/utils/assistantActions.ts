// Assistant : créer un rappel, un événement ou une tâche à partir d'une phrase (BTK, 2026-11-08, étape C1).
// Toujours un APERÇU puis « Confirmer » : rien n'est créé avant. Ce sont des éléments du module Rappels (déjà affichés dans le Calendrier),
// donc le serveur ne change pas : il valide comme d'habitude (remClean). Règles pures, heure de Madagascar.
import { b, type Reply } from './assistant';
import { remAddDays, remDateOf, remIsDate, remIsTime, remMs, remSuggest, REM_TYPE_LABEL, type RemType } from './reminderRules';

export type ActionKind = 'reminder' | 'event' | 'task' | 'checklist';
export interface ActionIntent {
  kind: ActionKind; type: RemType; title: string; date: string; time: string; allDay: boolean; subs: string[];
  needDate: boolean; // rappel / événement sans date : on la demande
  past: boolean; // date et heure déjà passées : on refuse
  guessed: string[]; // ce que j'ai deviné (« heure 09:00 par défaut ») : montré dans l'aperçu
}
export const ACT_OK_PREFIX = '__act_ok:';
export const ACT_NO = '__act_no';
export const ACT_MAX_SUBS = 30;

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'");
const DAYS: Record<string, number> = { dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const MONTHS: Record<string, number> = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12, january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const pad = (n: number) => String(n).padStart(2, '0');
const dow = (date: string) => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))).getUTCDay();
const validDate = (y: number, m: number, d: number): string | null => { const s = `${y}-${pad(m)}-${pad(d)}`; return remIsDate(s) ? s : null; };

export interface When { date: string; time: string; rest: string; guessedTime: boolean }
/** Cherche « demain », « jeudi », « le 12 novembre », « 12/11 », « dans 3 jours », « 9h30 »… et les retire du texte (le reste = le titre). */
export function parseWhen(text: string, nowMs: number): When {
  const today = remDateOf(nowMs);
  let t = ' ' + text + ' ';
  let date = '', time = '';
  const cut = (re: RegExp, f: (m: RegExpExecArray) => void): boolean => { const m = re.exec(t); if (!m) return false; f(m); t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length); return true; };
  // « dans N … »
  let relMs = 0;
  cut(/\b(?:dans|in)\s+(\d{1,3})\s*(jours?|days?|semaines?|weeks?|heures?|hours?|h|minutes?|mins?)\b/i, m => {
    const n = +m[1], u = m[2].toLowerCase();
    if (/^(j|d)/.test(u)) date = remAddDays(today, n); else if (/^(s|w)/.test(u)) date = remAddDays(today, 7 * n);
    else relMs = n * (/^(h)/.test(u) ? 3600000 : 60000);
  });
  if (relMs) { const at = nowMs + relMs; date = remDateOf(at); time = new Date(at + 3 * 3600000).toISOString().slice(11, 16); }
  // heure
  if (!time) cut(/(?:(?<![\w])(?:à|a|vers|at)\s+|@\s*)?\b(\d{1,2})\s*(?:h(?![a-z])|:)\s*([0-5]\d)?(?!\d)/i, m => { const h = +m[1]; if (h <= 23) time = `${pad(h)}:${m[2] || '00'}`; });
  if (!time) cut(/\b(\d{1,2})\s*(am|pm)\b/i, m => { let h = +m[1] % 12; if (m[2].toLowerCase() === 'pm') h += 12; time = `${pad(h)}:00`; });
  if (!time) cut(/\bmidi\b|\bnoon\b/i, () => { time = '12:00'; });
  if (!date) {
    const n = norm(t);
    let found = false;
    const tryRe = (re: RegExp, f: (m: RegExpExecArray) => string | null): void => {
      if (found) return;
      const m = re.exec(n); if (!m) return;
      const d = f(m); if (!d) return;
      date = d; found = true;
      t = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length); // n et t ont la même longueur (normalisation sans changement de taille)
    };
    tryRe(/\bapres[- ]demain\b|\bday after tomorrow\b/, () => remAddDays(today, 2));
    tryRe(/\bhier\b|\byesterday\b/, () => remAddDays(today, -1));
    tryRe(/\bdemain\b|\btomorrow\b/, () => remAddDays(today, 1));
    tryRe(/\bce soir\b|\btonight\b/, () => { if (!time) time = '18:00'; return today; });
    tryRe(/\baujourd'?hui\b|\btoday\b/, () => today);
    tryRe(/\b(?:le |on |ce |next |prochain )?(\d{1,2})(?:er)?\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/, m => {
      const y0 = +today.slice(0, 4); let d = validDate(m[3] ? +m[3] : y0, MONTHS[m[2]], +m[1]);
      if (d && !m[3] && d < today) d = validDate(y0 + 1, MONTHS[m[2]], +m[1]);
      return d;
    });
    tryRe(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/, m => {
      const y0 = +today.slice(0, 4); const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : y0;
      let d = validDate(y, +m[2], +m[1]); if (d && !m[3] && d < today) d = validDate(y0 + 1, +m[2], +m[1]);
      return d;
    });
    tryRe(/\b(?:(?:ce|le|on|next|this)\s+)?(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi|sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s+prochain)?\b/, m => {
      let diff = (DAYS[m[1]] - dow(today) + 7) % 7; if (diff === 0) diff = 7; // « jeudi » dit un jeudi : le prochain ; l'aperçu montre la date complète
      return remAddDays(today, diff);
    });
    tryRe(/\ble (\d{1,2})(?:er)?\b/, m => {
      const y = +today.slice(0, 4), mo = +today.slice(5, 7); let d = validDate(y, mo, +m[1]);
      if (!d || d < today) { const nm = mo === 12 ? 1 : mo + 1, ny = mo === 12 ? y + 1 : y; d = validDate(ny, nm, +m[1]); }
      return d;
    });
  }
  const rest = t.replace(/\s+/g, ' ').replace(/^[\s:：,.;-]+|[\s:：,.;-]+$/g, '').replace(/^(?:(?:de|que|à|a|to|of|pour|for|le|la|the)\s+|d'|qu'|l')/i, '').replace(/\s+(?:le|la|à|a|pour|on|at|for|to|de|du|ce|cet|cette)$/i, '').trim();
  return { date, time, rest, guessedTime: false };
}

const cap = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const PRE = "(?:(?:s'il (?:te|vous) pla[iî]t|stp|please)[, ]+)?(?:(?:peux|pourrais)-tu\\s+|tu peux\\s+|could you\\s+|can you\\s+)?";
const REM_RE = new RegExp(`^\\s*${PRE}(?:rappelle[- ]moi|remind me|(?:cr[ée]e|ajoute|mets|met|programme|add|create|set)\\s+(?:un |une |a )?rappel|rappel)\\b\\s*(?:de |d'|que |qu'|à |to |:|：)?\\s*([\\s\\S]*)$`, 'i');
const CAL_RE = new RegExp(`^\\s*${PRE}(?:ajoute|ajouter|cr[ée]e|cr[ée]er|planifie|programme|mets|met|inscris|add|create|schedule|put)\\s+(?:(?:un|une|au|le|la|l'|à|dans|in|on|to|a|the|my|mon|ma|sur)\\s+)*(?:calendrier|agenda|calendar)\\s*[:：,-]?\\s*([\\s\\S]*)$`, 'i');
const EVT_RE = new RegExp(`^\\s*${PRE}(?:ajoute|ajouter|cr[ée]e|cr[ée]er|planifie|programme|fixe|add|create|schedule)\\s+(?:(?:un|une|a|an)\\s+)?((?:r[ée]union|rendez-vous|rdv|[ée]v[ée]nement|meeting|event|appointment|[ée]ch[ée]ance|deadline|cong[ée])(?![a-zà-ÿ])[\\s\\S]*)$`, 'i');
const TASK_RE = new RegExp(`^\\s*${PRE}(?:(?:ajoute|ajouter|cr[ée]e|cr[ée]er|add|create)\\s+(?:une |a )?(?:t[âa]che|task|to-?do)|t[âa]che|[àa] faire|todo|to-?do)\\s*[:：,-]\\s*([\\s\\S]+)$|^\\s*${PRE}(?:ajoute|cr[ée]e|add|create)\\s+(?:une |a )?(?:t[âa]che|task)\\s+([\\s\\S]+)$`, 'i');
const LIST_RE = new RegExp(`^\\s*${PRE}(?:ajoute|cr[ée]e|cr[ée]er|fais|fait|make|create|add)\\s+(?:une |a )?(liste(?: de [^:：]{1,40}?)?|checklist|to-?do list)\\s*[:：]\\s*([\\s\\S]+)$`, 'i');

export function parseActionIntent(q: string, nowMs: number): ActionIntent | null {
  const raw = String(q ?? '').trim();
  if (!raw || raw.length > 600) return null;
  const mk = (kind: ActionKind, type: RemType, body: string, opts: { dateRequired: boolean; defaultTime?: string }): ActionIntent | null => {
    const w = parseWhen(body, nowMs);
    const title = cap(w.rest.slice(0, 120));
    if (!title) return null;
    const guessed: string[] = [];
    let date = w.date, time = w.time, allDay = false;
    const today = remDateOf(nowMs);
    if (!date && time) date = remMs(today, time) > nowMs ? today : remAddDays(today, 1);
    if (!date && !opts.dateRequired) { date = today; guessed.push('date : aujourd\'hui'); }
    if (!time) { if (kind === 'reminder') { time = opts.defaultTime || '09:00'; guessed.push(`heure : ${time}`); } else if (kind === 'task') { time = '09:00'; allDay = true; } else { time = '09:00'; allDay = true; } }
    const needDate = !date;
    const past = !!date && (allDay ? date < today : remMs(date, time) < nowMs - 60000);
    return { kind, type, title, date: date || '', time, allDay, subs: [], needDate, past, guessed };
  };
  let m = LIST_RE.exec(raw);
  if (m) {
    const subs = m[2].split(/\n|;|,|\s+\+\s+/).map(x => x.replace(/^\s*(?:[-•*·]|\d{1,2}[.)])\s+/, '').trim().slice(0, 120)).filter(Boolean).slice(0, ACT_MAX_SUBS);
    if (!subs.length) return null;
    const today = remDateOf(nowMs);
    return { kind: 'checklist', type: 'checklist', title: cap(m[1].trim().slice(0, 120)), date: today, time: '09:00', allDay: true, subs, needDate: false, past: false, guessed: ['date : aujourd\'hui'] };
  }
  m = TASK_RE.exec(raw);
  if (m) return mk('task', 'task', m[1] ?? m[2], { dateRequired: false });
  m = REM_RE.exec(raw);
  if (m) {
    const rest = (m[1] || '').trim();
    if (!rest || /^(ce que|what|mes |my |la liste|les )/i.test(norm(rest))) return null; // « rappelle-moi ce que tu as retenu » : c'est la mémoire
    const call = /\b(appel|t[ée]l[ée]phon|call|phone)/i.test(rest);
    return mk('reminder', call ? 'call' : 'simple', rest, { dateRequired: true });
  }
  m = CAL_RE.exec(raw) || EVT_RE.exec(raw);
  if (m) {
    const rest = (m[1] || '').trim();
    if (!rest) return null;
    const meet = /(?:^|[\s'])(?:r[ée]union|rendez-vous|rdv|meeting|appointment)(?![a-zà-ÿ])/i.test(rest);
    const dead = /(?:^|[\s'])(?:[ée]ch[ée]ance|deadline)(?![a-zà-ÿ])/i.test(rest);
    return mk('event', meet ? 'appointment' : dead ? 'deadline' : 'event', rest, { dateRequired: true });
  }
  return null;
}

const DOW_FR = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dateLabel = (date: string, time: string, allDay: boolean) => {
  const d = dow(date), mo = +date.slice(5, 7) - 1, day = +date.slice(8, 10), y = date.slice(0, 4);
  return b(`${DOW_FR[d]} ${day} ${MON_FR[mo]} ${y}${allDay ? ' (toute la journée)' : ' à ' + time.replace(':', ' h ').replace(/ 00$/, '')}`, `${DOW_EN[d]} ${MON_EN[mo]} ${day}, ${y}${allDay ? ' (all day)' : ' at ' + time}`);
};
const KIND_LABEL: Record<ActionKind, { fr: string; en: string }> = { reminder: { fr: 'Rappel', en: 'Reminder' }, event: { fr: 'Événement', en: 'Event' }, task: { fr: 'Tâche', en: 'Task' }, checklist: { fr: 'Liste de tâches', en: 'Task list' } };

const rep = (intent: string, title: ReturnType<typeof b>, lines: ReturnType<typeof b>[], actions: Reply['actions'] = []): Reply => ({ intent, title, lines, actions, sources: b('Calendrier › À faire (module Rappels).', 'Calendar › To do (Reminders module).') });

/** Élément envoyé au bouton « Confirmer » (petit, validé de nouveau à la lecture et par le serveur). */
export const encodeAct = (a: ActionIntent): string => ACT_OK_PREFIX + encodeURIComponent(JSON.stringify({ t: a.type, k: a.kind, n: a.title, d: a.date, h: a.time, a: a.allDay ? 1 : 0, s: a.subs }));
export function decodeAct(view: string): ActionIntent | null {
  if (!view.startsWith(ACT_OK_PREFIX)) return null;
  try {
    const o = JSON.parse(decodeURIComponent(view.slice(ACT_OK_PREFIX.length)));
    const kind = (['reminder', 'event', 'task', 'checklist'] as const).find(x => x === o.k);
    const types: RemType[] = ['simple', 'call', 'appointment', 'event', 'deadline', 'task', 'checklist'];
    const type = types.find(x => x === o.t);
    if (!kind || !type || typeof o.n !== 'string' || !o.n.trim() || !remIsDate(o.d) || !remIsTime(o.h)) return null;
    const subs = (Array.isArray(o.s) ? o.s : []).filter((x: unknown) => typeof x === 'string' && x.trim()).slice(0, ACT_MAX_SUBS).map((x: string) => x.slice(0, 120));
    return { kind, type, title: o.n.slice(0, 120), date: o.d, time: o.h, allDay: o.a === 1, subs, needDate: false, past: false, guessed: [] };
  } catch { return null; }
}

/** Élément du module Rappels prêt pour `db.remSave` (à toi seul : shared=false, rappels conseillés pour son type). */
const hash = (str: string): string => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36); };
export function buildItem(a: ActionIntent): Record<string, unknown> {
  return {
    id: 'act_' + hash(`${a.type}|${a.title}|${a.date}|${a.time}|${a.allDay}|${a.subs.join('\n')}`), // même demande confirmée deux fois = le même élément, pas deux
    type: a.type, title: a.title, date: a.date, time: a.time, all_day: a.allDay, priority: 'normal', status: 'todo', shared: false,
    subtasks: a.subs.map((text, i) => ({ id: `t${i}`, text, done: false })), fires: remSuggest(a.type, { time: a.time, all_day: a.allDay }), repeat: { freq: 'none', until: '' },
  };
}

export function actionPreview(a: ActionIntent): Reply {
  const lab = KIND_LABEL[a.kind];
  if (a.needDate) return rep('action_ask', b(`Pour quand ? (${lab.fr.toLowerCase()})`, `For when? (${lab.en.toLowerCase()})`), [b('Je n\'ai pas trouvé de date. Redis-le avec le jour et l\'heure, par exemple : « rappelle-moi demain 9 h d\'appeler le client » ou « ajoute au calendrier : réunion jeudi 10 h ».', 'I did not find a date. Say it again with the day and time, for example: "remind me tomorrow 9am to call the client" or "add to calendar: meeting Thursday 10am".')]);
  if (a.past) return rep('action_past', b('Cette date est déjà passée', 'That date has already passed'), [b(`« ${a.title} » le ${dateLabel(a.date, a.time, a.allDay).fr}. Donne-moi une date à venir.`, `"${a.title}" on ${dateLabel(a.date, a.time, a.allDay).en}. Give me a future date.`)]);
  const when = dateLabel(a.date, a.time, a.allDay);
  const lines = [b(`${lab.fr} : « ${a.title} »`, `${lab.en}: "${a.title}"`), b(`Quand : ${when.fr}`, `When: ${when.en}`)];
  if (a.subs.length) lines.push(b(`${a.subs.length} case(s) : ${a.subs.slice(0, 6).join(', ')}${a.subs.length > 6 ? '…' : ''}`, `${a.subs.length} item(s): ${a.subs.slice(0, 6).join(', ')}${a.subs.length > 6 ? '…' : ''}`));
  if (a.guessed.length) lines.push(b(`Par défaut (à corriger si besoin) : ${a.guessed.join(' ; ')}`, `Defaults (correct me if needed): ${a.guessed.join('; ')}`));
  lines.push(b('Rien n\'est créé tant que tu n\'as pas confirmé. Visible par toi seul.', 'Nothing is created until you confirm. Visible to you only.'));
  return rep('action_preview', b(`Je vais créer ${a.kind === 'reminder' ? 'ce rappel' : a.kind === 'event' ? 'cet événement' : a.kind === 'task' ? 'cette tâche' : 'cette liste'}`, `I will create this ${lab.en.toLowerCase()}`), lines, [{ label: b('Confirmer', 'Confirm'), go: { view: encodeAct(a) } }, { label: b('Annuler', 'Cancel'), go: { view: ACT_NO } }]);
}

export const actionDone = (a: ActionIntent, ok: boolean, error?: string): Reply => ok
  ? rep('action_done', b('C\'est créé', 'Created'), [b(`${KIND_LABEL[a.kind].fr} « ${a.title} » : ${dateLabel(a.date, a.time, a.allDay).fr}.`, `${KIND_LABEL[a.kind].en} "${a.title}": ${dateLabel(a.date, a.time, a.allDay).en}.`)], [{ label: b('Voir dans le Calendrier', 'See in Calendar'), go: { view: 'calendar' } }])
  : rep('action_error', b('Je n\'ai pas pu le créer', 'I could not create it'), [b(error || 'Rien n\'a été créé. Réessaie dans un instant.', error || 'Nothing was created. Try again in a moment.')]);
export const actionCanceled = (): Reply => rep('action_cancel', b('D\'accord, rien n\'est créé', 'OK, nothing was created'), []);
export { REM_TYPE_LABEL };
