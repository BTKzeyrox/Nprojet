// Rappels et tâches (module 25, BTK 2026-11-05) : règles PURES (sans écran, sans réseau, sans importation).
// La copie du serveur (bloc REMINDERS de df-api) est comparée par scripts/check-reminders.ts : on ne modifie qu'ici, puis on recopie.
// Heure de référence : Madagascar (UTC+3, pas d'heure d'été).
// ===== BEGIN REMINDERS (copie dans supabase/functions/df-api/index.ts) =====
const REM_TZ_MS = 3 * 3600 * 1000;
const REM_DAY_MS = 86400000;
const REM_TYPES = ['task', 'appointment', 'event', 'deadline', 'payment', 'followup', 'call', 'checklist', 'important', 'simple'] as const;
type RemType = typeof REM_TYPES[number];
const REM_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const REM_STATUSES = ['todo', 'doing', 'done', 'canceled'] as const;
const REM_MAX_FIRES = 8;
const REM_MAX_SUBTASKS = 30;
const REM_OVERDUE_DAYS = 30;
/** Types permis par rôle (le serveur l'impose). */
const REM_ROLE_TYPES: Record<string, RemType[]> = {
  admin: ['task', 'appointment', 'event', 'deadline', 'payment', 'followup', 'call', 'checklist', 'important', 'simple'],
  accountant: ['task', 'appointment', 'event', 'deadline', 'payment', 'followup', 'call', 'checklist', 'simple'],
  team_lead: ['task', 'appointment', 'event', 'followup', 'call', 'checklist', 'important', 'simple'],
  employee: ['task', 'appointment', 'event', 'call', 'simple'],
};
/** Un rappel : k = 'before' (n minutes avant), 'morning' (d jours avant, à l'heure at), 'at' (à l'heure), 'exact' (date et heure précises : iso), 'overdue' (en retard : chaque jour à at). */
interface RemFire { id: string; k: 'before' | 'morning' | 'at' | 'exact' | 'overdue'; n?: number; d?: number; at?: string; iso?: string }
interface RemSub { id: string; text: string; done: boolean }
interface RemItem {
  id: string; kind: 'item'; user_id: string; type: RemType; title: string;
  date: string; time: string; all_day: boolean; duration_min: number;
  priority: typeof REM_PRIORITIES[number]; status: typeof REM_STATUSES[number]; done_at: string;
  note: string; place: string; person: string; label: string; link: string; amount: number;
  subtasks: RemSub[]; repeat: { freq: 'none' | 'day' | 'week' | 'month' | 'year'; until: string };
  shared: boolean; fires: RemFire[]; snooze_until: number; template: string; created_ms: number;
}
const remStr = (v: unknown, n: number): string => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const remIsDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))).toISOString().slice(0, 10) === s;
const remIsTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
/** Instant (ms) d'une date + heure de Madagascar. */
function remMs(date: string, time: string): number {
  return Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), +time.slice(0, 2), +time.slice(3, 5)) - REM_TZ_MS;
}
/** Date « AAAA-MM-JJ » (Madagascar) d'un instant. */
function remDateOf(ms: number): string { return new Date(ms + REM_TZ_MS).toISOString().slice(0, 10); }
function remAddDays(date: string, n: number): string { return remDateOf(remMs(date, '12:00') + n * REM_DAY_MS); }
function remDayDiff(a: string, b: string): number { return Math.round((remMs(b, '12:00') - remMs(a, '12:00')) / REM_DAY_MS); }
function remAddMonths(date: string, n: number): string {
  const y = +date.slice(0, 4), m = +date.slice(5, 7) - 1, d = +date.slice(8, 10);
  const t = new Date(Date.UTC(y, m + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Série de rappels conseillée pour un type (l'heure de l'élément et « le matin » = morning, 8 h par défaut). */
function remSuggest(type: RemType, opts: { time?: string; all_day?: boolean; morning?: string } = {}): RemFire[] {
  const at = remIsTime(opts.morning) ? opts.morning : '08:00';
  const f = (k: RemFire['k'], extra: Partial<RemFire>, i: number): RemFire => ({ id: `s${i}`, k, ...extra });
  let l: Omit<RemFire, 'id'>[] = [];
  if (type === 'appointment' || type === 'event') {
    l = [{ k: 'morning', d: 3, at }, { k: 'morning', d: 2, at }, { k: 'morning', d: 1, at }, { k: 'morning', d: 0, at }];
    if (!opts.all_day) l.push({ k: 'before', n: 300 }, { k: 'before', n: 60 }, { k: 'at' });
  } else if (type === 'task') l = [{ k: 'morning', d: 1, at: '18:00' }, { k: 'morning', d: 0, at }, { k: 'at' }, { k: 'overdue', at }];
  else if (type === 'deadline') l = [{ k: 'morning', d: 7, at }, { k: 'morning', d: 3, at }, { k: 'morning', d: 1, at }, { k: 'morning', d: 0, at }, { k: 'overdue', at }];
  else if (type === 'payment') l = [{ k: 'morning', d: 3, at }, { k: 'morning', d: 1, at }, { k: 'morning', d: 0, at }, { k: 'overdue', at }];
  else if (type === 'followup' || type === 'call') l = [{ k: 'morning', d: 0, at }, { k: 'before', n: 60 }, { k: 'at' }];
  else if (type === 'checklist') l = [{ k: 'morning', d: 0, at }, { k: 'at' }];
  else if (type === 'important') l = [{ k: 'morning', d: 7, at }, { k: 'morning', d: 1, at }, { k: 'morning', d: 0, at }];
  else l = [{ k: 'at' }];
  if (opts.all_day) l = l.filter(x => x.k !== 'before' && x.k !== 'at');
  return l.slice(0, REM_MAX_FIRES).map((x, i) => f(x.k, x as Partial<RemFire>, i));
}

function remCleanFire(x: unknown, i: number): RemFire | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const k = o.k;
  const id = remStr(o.id, 12) || `r${i}`;
  if (k === 'at') return { id, k };
  if (k === 'before') { const n = Math.round(Number(o.n)); return Number.isFinite(n) && n >= 1 && n <= 60 * 24 * 60 ? { id, k, n } : null; }
  if (k === 'morning') { const d = Math.round(Number(o.d)); return Number.isFinite(d) && d >= 0 && d <= 365 && remIsTime(o.at) ? { id, k, d, at: o.at as string } : null; }
  if (k === 'overdue') return remIsTime(o.at) ? { id, k, at: o.at as string } : null;
  if (k === 'exact') { const t = typeof o.iso === 'string' ? Date.parse(o.iso) : NaN; return Number.isFinite(t) ? { id, k, iso: new Date(t).toISOString() } : null; }
  return null;
}

/** Nettoie ce que le téléphone envoie : types permis par rôle, textes courts, au plus 8 rappels. Rend null si le titre, le type ou la date manquent. */
function remClean(input: unknown, role: string, userId: string, nowMs: number): RemItem | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const type = REM_TYPES.find(t => t === o.type);
  if (!type || !(REM_ROLE_TYPES[role] || REM_ROLE_TYPES.employee).includes(type)) return null;
  const title = remStr(o.title, 120);
  if (!title || !remIsDate(o.date)) return null;
  const all_day = o.all_day === true;
  const time = remIsTime(o.time) ? o.time : '09:00';
  const rawFires = Array.isArray(o.fires) ? o.fires : [];
  const fires = rawFires.map(remCleanFire).filter((x): x is RemFire => !!x).slice(0, REM_MAX_FIRES);
  const subs = (Array.isArray(o.subtasks) ? o.subtasks : []).slice(0, REM_MAX_SUBTASKS).map((s: any, i: number) => ({ id: remStr(s?.id, 12) || `t${i}`, text: remStr(s?.text, 120), done: s?.done === true })).filter(s => s.text);
  const rp = (o.repeat && typeof o.repeat === 'object' ? o.repeat : {}) as Record<string, unknown>;
  const freq = (['day', 'week', 'month', 'year'] as const).find(x => x === rp.freq) || 'none';
  const priority = REM_PRIORITIES.find(p => p === o.priority) || 'normal';
  const status = REM_STATUSES.find(p => p === o.status) || 'todo';
  const amount = Number(o.amount);
  return {
    id: remStr(o.id, 40) || `rem_${nowMs}_${Math.floor(Math.random() * 1e6)}`, kind: 'item', user_id: userId, type, title, date: o.date, time, all_day,
    duration_min: Math.max(0, Math.min(1440, Math.round(Number(o.duration_min)) || 0)), priority, status, done_at: status === 'done' ? remStr(o.done_at, 30) : '',
    note: remStr(o.note, 1000), place: remStr(o.place, 120), person: remStr(o.person, 120), label: remStr(o.label, 20), link: /^[a-z][a-z-]{0,29}$/.test(String(o.link)) ? String(o.link) : '',
    amount: Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : 0, subtasks: subs,
    repeat: { freq, until: freq !== 'none' && remIsDate(rp.until) ? rp.until : '' }, shared: o.shared === true, fires,
    snooze_until: Number.isFinite(Number(o.snooze_until)) ? Math.max(0, Math.round(Number(o.snooze_until))) : 0, template: remStr(o.template, 40), created_ms: Number.isFinite(Number(o.created_ms)) && Number(o.created_ms) > 0 ? Math.round(Number(o.created_ms)) : nowMs,
  };
}

/** Début (ms) de chaque occurrence entre deux dates (incluses). Sans répétition : une seule. */
function remOccurrences(it: Pick<RemItem, 'date' | 'time' | 'all_day' | 'repeat'>, fromDate: string, toDate: string): string[] {
  const out: string[] = [];
  const { freq, until } = it.repeat;
  if (freq === 'none') return it.date >= fromDate && it.date <= toDate ? [it.date] : [];
  for (let i = 0; i < 4000; i++) {
    const d = freq === 'day' ? remAddDays(it.date, i) : freq === 'week' ? remAddDays(it.date, 7 * i) : freq === 'month' ? remAddMonths(it.date, i) : remAddMonths(it.date, 12 * i);
    if (d > toDate || (until && d > until)) break;
    if (d >= fromDate) out.push(d);
  }
  return out;
}
const remStart = (it: Pick<RemItem, 'time' | 'all_day'>, date: string): number => remMs(date, it.all_day ? '00:00' : it.time);

/** Moments (ms) où un rappel doit partir pour UNE occurrence, avec la clé unique de chaque envoi. */
function remFiresOf(it: RemItem, occDate: string, quiet?: { from: string; to: string } | null): { at: number; key: string; fire: RemFire; occ: string }[] {
  const start = remStart(it, occDate);
  const out: { at: number; key: string; fire: RemFire; occ: string }[] = [];
  for (const f of it.fires) {
    let ats: number[] = [];
    if (f.k === 'at') ats = [start];
    else if (f.k === 'before') ats = [start - (f.n || 0) * 60000];
    else if (f.k === 'morning') ats = [remMs(remAddDays(occDate, -(f.d || 0)), f.at || '08:00')];
    else if (f.k === 'exact') ats = it.repeat.freq === 'none' ? [Date.parse(f.iso || '')] : [];
    else if (f.k === 'overdue') { for (let d = 1; d <= REM_OVERDUE_DAYS; d++) ats.push(remMs(remAddDays(occDate, d), f.at || '08:00')); }
    for (const a of ats) {
      if (!Number.isFinite(a) || a < it.created_ms - 60000) continue; // un rappel déjà passé à la création est ignoré
      out.push({ at: quiet ? remQuietShift(a, quiet) : a, key: `rem:${it.id}:${occDate}:${f.id}:${f.k === 'overdue' ? remDateOf(a) : ''}`.slice(0, 120), fire: f, occ: occDate });
    }
  }
  return out;
}
/** Heures calmes : un rappel qui tombe dans la plage est repoussé à la fin de la plage. */
function remQuietShift(at: number, q: { from: string; to: string }): number {
  if (!remIsTime(q.from) || !remIsTime(q.to) || q.from === q.to) return at;
  const day = remDateOf(at);
  const mins = Math.round((at + REM_TZ_MS) / 60000) % 1440;
  const f = +q.from.slice(0, 2) * 60 + +q.from.slice(3), t = +q.to.slice(0, 2) * 60 + +q.to.slice(3);
  const inside = f < t ? mins >= f && mins < t : mins >= f || mins < t;
  if (!inside) return at;
  const endDay = f < t || mins < t ? day : remAddDays(day, 1);
  return remMs(endDay, q.to);
}

/** Rappels qui doivent partir dans la fenêtre (fromMs, toMs]. Un élément fait ou annulé ne rappelle plus ; l'attente (snooze) est un envoi de plus. */
function remDue(it: RemItem, fromMs: number, toMs: number, quiet?: { from: string; to: string } | null): { at: number; key: string; fire: RemFire; occ: string }[] {
  if (it.status === 'done' || it.status === 'canceled') return [];
  const out: { at: number; key: string; fire: RemFire; occ: string }[] = [];
  const dTo = remAddDays(remDateOf(toMs), 366);
  const occs = it.repeat.freq === 'none' ? [it.date] : remOccurrences(it, remAddDays(remDateOf(fromMs), -REM_OVERDUE_DAYS - 2), dTo);
  for (const occ of occs) for (const x of remFiresOf(it, occ, quiet)) if (x.at > fromMs && x.at <= toMs) out.push(x);
  if (it.snooze_until > fromMs && it.snooze_until <= toMs) out.push({ at: it.snooze_until, key: `rem:${it.id}:snooze:${it.snooze_until}`, fire: { id: 'snooze', k: 'at' }, occ: it.date });
  return out;
}

/** Texte du compte à rebours (« dans 3 jours (J-3) », « demain », « aujourd'hui à 15:00 », « dans 5 heures », « c'est maintenant »). */
function remCountdown(lang: 'fr' | 'en', it: Pick<RemItem, 'time' | 'all_day'>, occDate: string, atMs: number, snoozed = false): string {
  const fr = lang !== 'en';
  const start = remStart(it, occDate);
  const diffMin = Math.round((start - atMs) / 60000);
  const days = remDayDiff(remDateOf(atMs), occDate);
  const hhmm = it.all_day ? '' : it.time;
  if (snoozed && diffMin < -1) return fr ? 'Rappel reporté' : 'Snoozed reminder';
  if (diffMin < -59 && days < 0) return fr ? `En retard de ${-days} jour${-days > 1 ? 's' : ''}` : `${-days} day${-days > 1 ? 's' : ''} overdue`;
  if (diffMin < -1) return fr ? 'En retard' : 'Overdue';
  if (diffMin <= 1 && !it.all_day) return fr ? "C'est maintenant" : 'It is now';
  if (days >= 2) return fr ? `Dans ${days} jours (J-${days})${hhmm ? ` à ${hhmm}` : ''}` : `In ${days} days (D-${days})${hhmm ? ` at ${hhmm}` : ''}`;
  if (days === 1) return fr ? `Demain${hhmm ? ` à ${hhmm}` : ''} (J-1)` : `Tomorrow${hhmm ? ` at ${hhmm}` : ''} (D-1)`;
  if (diffMin >= 120 && days === 0 && !it.all_day) { const h = Math.round(diffMin / 60); return fr ? `Dans ${h} heures (aujourd'hui à ${hhmm})` : `In ${h} hours (today at ${hhmm})`; }
  if (diffMin >= 60 && days === 0 && !it.all_day) return fr ? `Dans 1 heure (à ${hhmm})` : `In 1 hour (at ${hhmm})`;
  if (diffMin > 1 && days === 0 && !it.all_day) return fr ? `Dans ${diffMin} minutes` : `In ${diffMin} minutes`;
  return fr ? `Aujourd'hui${hhmm ? ` à ${hhmm}` : ''}` : `Today${hhmm ? ` at ${hhmm}` : ''}`;
}
const REM_TYPE_LABEL: Record<RemType, { fr: string; en: string }> = {
  task: { fr: 'Tâche', en: 'Task' }, appointment: { fr: 'Rendez-vous', en: 'Appointment' }, event: { fr: 'Événement', en: 'Event' }, deadline: { fr: 'Échéance', en: 'Deadline' },
  payment: { fr: 'Paiement', en: 'Payment' }, followup: { fr: 'Relance', en: 'Follow-up' }, call: { fr: 'Appel', en: 'Call' }, checklist: { fr: 'Contrôle', en: 'Checklist' },
  important: { fr: 'Date importante', en: 'Important date' }, simple: { fr: 'Rappel', en: 'Reminder' },
};
/** Notification : titre = le titre de l'élément (ou le type si « masquer le titre »), texte = compte à rebours. */
function remText(it: RemItem, occDate: string, atMs: number, hideTitle: boolean, snoozed = false): { fr: { title: string; body: string }; en: { title: string; body: string } } {
  const lab = REM_TYPE_LABEL[it.type];
  const mk = (lang: 'fr' | 'en') => ({ title: hideTitle ? lab[lang] : remStr(it.title, 80), body: `${hideTitle ? '' : `${lab[lang]} · `}${remCountdown(lang, it, occDate, atMs, snoozed)}`.slice(0, 160) });
  return { fr: mk('fr'), en: mk('en') };
}
/** Reporter : 10 min, 1 h, ou demain à l'heure du matin. */
function remSnoozeUntil(choice: '10m' | '1h' | 'tomorrow', nowMs: number, morning = '08:00'): number {
  if (choice === '10m') return nowMs + 10 * 60000;
  if (choice === '1h') return nowMs + 3600000;
  return remMs(remAddDays(remDateOf(nowMs), 1), remIsTime(morning) ? morning : '08:00');
}
// ===== END REMINDERS =====

export {
  REM_TYPES, REM_ROLE_TYPES, REM_PRIORITIES, REM_STATUSES, REM_MAX_FIRES, REM_TYPE_LABEL,
  remStr, remIsDate, remIsTime, remMs, remDateOf, remAddDays, remDayDiff, remAddMonths, remSuggest, remClean, remOccurrences, remStart, remFiresOf, remDue, remCountdown, remText, remSnoozeUntil, remQuietShift,
};
export type { RemType, RemFire, RemSub, RemItem };
