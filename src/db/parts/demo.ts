// Magasin de données : Moteur de démo (réservé aux tests).
// Ces méthodes sont ajoutées à la classe AppStore (db/store.ts) ; `this` est le magasin.
// Utilisé par : db/store.ts. Pour modifier : changer ici ; une nouvelle méthode s'ajoute dans ce fichier, rien d'autre à toucher.
import type { AppStore } from '../store';
import { defineMethods } from './define';
import { pollCounts, pollApplyVote } from '../../utils/pollRules';
import { canEditNews, pickAudience, publishModeFor } from '../../utils/newsAccess';
import { checkReportRecord, periodForRun, type AutoReportSetting, type ReportRecord } from '../../utils/autoReport';
import { invoiceInfo, invoiceTotals, formatNumber } from '../../utils/invoices';
import { buildDemoData, DEMO_ADMIN_ID, DEMO_BUDGETS, DEMO_RECURRING, DEMO_CLIENT_PRICES, DEMO_COMPANY, DEMO_GOALS, DEMO_MONTHLY_PLAN, DEMO_TEAM_GOALS } from '../../demo/demoData';
import { companyForEmployee, readCompany } from '../../utils/companyRules';
import { isMoneyRole } from '../../utils/roles';
import { demoSheets } from '../../utils/sheets';
import { forEmployeeReview, type Review } from '../../utils/reviews';
import { cleanEntry, assignNumbers, reverseEntry as reverseAccounting, planClose, planReopen, closingEntry } from '../../utils/accounting';
import { buildEntries } from '../../utils/accountingEntries';
import { buildAuditEntry } from '../../utils/auditRules';
import { User, NewsPost, Client, Invoice } from '../../types';
import { fixedSalaryAr } from '../../utils/fixedSalary';
import { COLS, DEFAULT_SETTINGS } from '../storeShared';

export const demoMethods = defineMethods({

  // Faux serveur du mode démo : répond comme le vrai, mais ne modifie que les données fictives en mémoire.
  demoApi(path: string, init?: RequestInit): { ok: boolean; status: number; data: any } {
    const route = path.split('?')[0];
    let body: any = {};
    try { body = JSON.parse(String(init?.body || '{}')); } catch { body = {}; }
    const me = this.currentUser;
    const ok = (data: any = { ok: true }) => ({ ok: true, status: 200, data });
    const fail = (error: string) => ({ ok: false, status: 400, data: { error } });
    const nowIso = new Date().toISOString();
    const post = (id: string) => this.news.find(n => n.id === id);
    const keep = (n: NewsPost) => ok({ news: JSON.parse(JSON.stringify(n)) });
    switch (route) {
      case 'news-react': {
        const n = post(body.id); if (!n || !me) return fail('Publication introuvable.');
        n.loves = n.loves.includes(me.id) ? n.loves.filter(x => x !== me.id) : [...n.loves, me.id];
        return keep(n);
      }
      case 'news-vote': { // faux serveur du sondage : mêmes règles que le vrai (pollApplyVote), vue du responsable
        const n = post(body.id); if (!n || !me || !n.poll) return fail('Publication introuvable.');
        const r = pollApplyVote({ question: n.poll.question, kind: n.poll.kind, options: n.poll.options, closed: !!n.poll.closed, votes: n.poll.votes || {} }, me.id, String(body.option ?? ''));
        if (!r.ok) return fail(r.error);
        n.poll = { ...n.poll, votes: r.poll.votes, counts: pollCounts(r.poll) };
        return keep(n);
      }
      case 'news-poll-close': {
        const n = post(body.id); if (!n || !me || !n.poll) return fail('Publication introuvable.');
        if (me.role !== 'admin') return fail('Réservé au responsable.');
        n.poll = { ...n.poll, closed: body.closed === true };
        return keep(n);
      }
      case 'news-comment': {
        const n = post(body.id); if (!n || !me) return fail('Publication introuvable.');
        const text = String(body.text || '').trim().slice(0, 1000);
        if (!text && !(body.files || []).length) return fail('Écris un commentaire.');
        const par = body.parentId ? n.comments.find(x => x.id === body.parentId) : undefined;
        n.comments = [...n.comments, { id: `demo_nc${Date.now()}`, user_id: me.id, user_name: me.name, role: me.role, text, files: body.files || [], ...(par ? { parent_id: par.parent_id || par.id, reply_to_name: String(body.replyToName || '').slice(0, 80) } : {}), created_at: nowIso }];
        return keep(n);
      }
      case 'news-comment-delete': {
        const n = post(body.id); if (!n) return fail('Publication introuvable.');
        n.comments = n.comments.filter(c => c.id !== body.commentId && c.parent_id !== body.commentId); // les réponses partent avec leur commentaire
        return keep(n);
      }
      case 'news-share': {
        const n = post(body.id); if (!n) return fail('Publication introuvable.');
        n.shares = (n.shares || 0) + 1;
        return keep(n);
      }
      case 'news-submit': {
        if (!me) return fail('Connexion perdue.');
        const mode = publishModeFor(me.role, this.getSettings().news_publish);
        if (mode === 'off') return fail('Le responsable n’a pas autorisé ton rôle à publier.');
        const aud = pickAudience(body.audience, body.audience_users);
        const n: NewsPost = {
          id: `demo_n${Date.now()}`, author_id: me.id, author_name: me.name, author_role: me.role, title: String(body.title || '').slice(0, 120), text: String(body.text || '').slice(0, 4000),
          files: body.files || [], created_at: nowIso, pinned: false, loves: [], comments: [], shares: 0, status: mode === 'direct' ? 'published' : 'pending', ...aud,
        };
        this.news = [n, ...this.news];
        return keep(n);
      }
      case 'news-decision': {
        const n = post(body.id); if (!n) return fail('Publication introuvable.');
        if (body.decision === 'approve') { n.status = 'published'; n.created_at = nowIso; } else { n.status = 'rejected'; n.reject_reason = String(body.reason || ''); }
        return keep(n);
      }
      case 'news-edit': {
        const n = post(body.id); if (!n || !me) return fail('Publication introuvable.');
        if (!canEditNews(n, me, this.getSettings().news_publish)) return fail('Tu ne peux pas modifier cette publication.');
        const aud = pickAudience(body.audience, body.audience_users);
        const { audience: _old, audience_users: _oldU, ...rest } = n;
        Object.assign(n, rest, { title: String(body.title || '').slice(0, 120), text: String(body.text || '').slice(0, 2000), edited_at: nowIso, ...(Array.isArray(body.files) ? { files: body.files } : {}) });
        delete n.audience; delete n.audience_users; Object.assign(n, aud);
        return keep(n);
      }
      case 'news-delete': {
        const n = post(body.id); if (!n || !me) return fail('Publication introuvable.');
        if (!canEditNews(n, me, this.getSettings().news_publish)) return fail('Tu ne peux pas supprimer cette publication.');
        this.news = this.news.filter(x => x.id !== body.id);
        return ok({ deleted: body.id });
      }
      case 'news-withdraw': return ok();
      case 'upload': return ok({ url: String(body.dataUrl || '') }); // le fichier reste dans la page (aucun envoi)
      case 'create-user': {
        const u = { ...(body.user || {}), id: body.user?.id || `demo_u${Date.now()}` } as User;
        return ok({ user: u });
      }
      case 'payroll-period': {
        // Mode démo : fiches de paie calculées dans le navigateur (lecture seule : clôturer, payer, primes ne changent rien)
        const pidStr = String(body.pid || '');
        const m = /^(\d{4})-(\d{2})(?:-([AB]))?$/.exec(pidStr);
        if (!m) return fail('Période invalide.');
        const y = Number(m[1]), mo = Number(m[2]);
        const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
        const from = m[3] === 'B' ? 16 : 1, to = m[3] === 'A' ? 15 : last;
        const p2 = (n: number) => String(n).padStart(2, '0');
        const start = `${y}-${p2(mo)}-${p2(from)}`, end = `${y}-${p2(mo)}-${p2(to)}`;
        const isClosed = end < nowIso.slice(0, 10);
        const emps = this.users.filter(u => u.role === 'employee');
        const slips = emps.map((u, i) => {
          const mine = this.posts.filter(x => x.employee_id === u.id && x.status === 'completed' && x.date >= start && x.date <= end);
          const fixedPay = fixedSalaryAr(u, this.settings, pidStr); // salaire fixe (T1)
          const gross = mine.reduce((tt, x) => tt + Math.max(0, Math.round(typeof x.calculated_ar === 'number' ? x.calculated_ar : 0)), 0) + fixedPay;
          return { id: `slip-${pidStr}-${u.id}`, pid: pidStr, period_start: start, period_end: end, user_id: u.id, name: u.name, username: u.username, phone: u.phone || '', lines: [], gross, bonuses: [], penalties: [], penalty_applied: 0, advance_due_before: 0, advance_deducted: 0, advance_carry: 0, net: gross, paid: isClosed && i % 2 === 0 && gross > 0 ? { at: `${end}T10:00:00.000Z`, method: 'Mobile money', ref: '', by_name: 'Responsable' } : null };
        }).filter(sl => sl.gross > 0);
        const pending = this.posts.filter(x => ['pending_start', 'pending_end', 'active'].includes(x.status) && x.date >= start && x.date <= end).length;
        return ok({ pid: pidStr, start, end, status: isClosed ? 'closed' : 'open', closed_at: isClosed ? `${end}T12:00:00.000Z` : null, closed_by_name: isClosed ? 'Responsable' : '', slips, pending_validation: pending, audit: [], index: [], cfg: { methods: ['Mobile money', 'Espèces'], penalties: false, cap_pct: 50, repay_pct: 30, mode: m[3] ? 'half' : 'month' } });
      }
      case 'attendance': {
        const day = decodeURIComponent((path.split('day=')[1] || '').split('&')[0]) || nowIso.slice(0, 10);
        const emps = this.users.filter(u => u.role === 'employee');
        const mine = me?.role === 'admin' ? emps : emps.filter(u => u.id === me?.id);
        return ok({ rows: mine.map((u, i) => ({ user_id: u.id, day, first_seen: `${day}T0${7 + (i % 3)}:${10 + i * 7}:00.000Z`, last_seen: `${day}T1${i % 4}:30:00.000Z`, online_sec: 3600 * (3 + (i % 4)) + i * 420 })) });
      }
      case 'audit-list': {
        // Mode démo : lignes inventées, jamais d'appel réseau
        const me0 = { id: DEMO_ADMIN_ID, name: 'Responsable' };
        const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
        const mk = (h: number, a: string, ty: string, label: string, detail: string) => buildAuditEntry(me0, a, { type: ty, id: `demo-${a}-${h}`, label }, detail, ago(h), `d${h}`);
        return ok({ rows: [mk(1, 'invoice_issue', 'invoices', 'F-2026-0012', 'Client : Alice'), mk(3, 'invoice_pay', 'invoices', 'F-2026-0011', '150000 Ar'), mk(26, 'tariff_change', 'settings', 'Réglages', 'client_price_default_ar : 1000 → 1200'), mk(50, 'delete', 'clients', 'Client test', ''), mk(72, 'settings_change', 'settings', 'Réglages', 'day_shift_start'), mk(120, 'backup_now', 'backups', 'Sauvegarde', '')].filter(Boolean) });
      }
      case 'report-list': case 'report-open': case 'report-freeze': {
        if (me?.role !== 'admin') return { ok: false, status: 403, data: { error: "Réservé à l'administrateur." } };
        if (!this.demoReports.length) { // deux fiches « en attente » : la semaine finie et le mois fini
          const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Indian/Antananarivo' });
          for (const st of [{ frequency: 'weekly', weekday: 1, month_day: 1, time: '08:00' }, { frequency: 'monthly', weekday: 1, month_day: 1, time: '08:00' }] as AutoReportSetting[]) {
            const p = periodForRun(st, today); const c = p ? checkReportRecord({ id: p.id, status: 'pending', created_at: nowIso }) : null;
            if (c && c.ok) this.demoReports.push(c.value);
          }
        }
        if (route === 'report-list') return ok({ rows: this.demoReports.map(({ html: _h, ...m }) => m) });
        const cur = this.demoReports.find(x => x.id === body.id);
        if (!cur) return { ok: false, status: 404, data: { error: 'Rapport introuvable.' } };
        if (route === 'report-open') return ok({ record: cur });
        if (cur.status === 'ready') return ok({ record: cur, already: true });
        const html = typeof body.html === 'string' ? body.html : '';
        if (!html.trim() || html.length > 400000) return fail('Texte du rapport non valide.');
        const next: ReportRecord = { ...cur, status: 'ready', frozen_at: nowIso, html };
        this.demoReports = this.demoReports.map(x => (x.id === cur.id ? next : x));
        return ok({ record: next, already: false });
      }
      case 'backups': return ok({ rows: [...this.demoBackups].sort((a, b) => b.id - a.id) });
      case 'backup-now': {
        const id = Math.max(0, ...this.demoBackups.map(b => b.id)) + 1;
        this.demoBackups = [...this.demoBackups, { id, taken_at: nowIso, tables: 20, bytes: 204800 + id * 512 }];
        return ok({ ok: true, id });
      }
      case 'backup-get': {
        const row = this.demoBackups.find(b => b.id === Number(new URLSearchParams(path.split('?')[1] || '').get('id')));
        if (!row) return fail('Sauvegarde introuvable.');
        return ok({ backup: { ...row, data: { _demo: true, users: this.users, contracts: this.contracts, posts: this.posts, advances: this.advanceRequests, messages: this.messages, groups: this.groups, news: this.news, cash: this.cash, products: this.products, stock: this.stockMoves, clients: this.clients, invoices: this.invoices, suppliers: this.suppliers, purchases: this.purchases, quotes: this.quotes } } });
      }
      case 'errors': {
        const st = new URLSearchParams(path.split('?')[1] || '').get('status') || 'open';
        return ok({ rows: this.demoErrors.filter(e => st === 'all' || e.status === st) });
      }
      case 'error-update': {
        const e = this.demoErrors.find(x => x.id === body.id); if (!e) return fail('Introuvable.');
        if (body.remove) this.demoErrors = this.demoErrors.filter(x => x.id !== body.id); else if (body.status) e.status = body.status;
        return ok();
      }
      case 'profile-request': {
        if (!me) return fail('Connexion perdue.');
        this.profileRequests = [...this.profileRequests.filter(x => x.user_id !== me.id), {
          id: `demo_p${Date.now()}`, user_id: me.id, status: 'pending', created_at: nowIso,
          old: { name: me.name, username: me.username, phone: me.phone || '', avatar_url: me.avatar_url || '' },
          name: String(body.name || me.name), username: String(body.username || me.username), phone: String(body.phone || ''), avatar_url: String(body.avatar_url || ''), note: String(body.note || ''),
        }];
        this.emit();
        return ok();
      }
      case 'profile-decision': {
        const pr = this.profileRequests.find(x => x.id === body.id); if (!pr) return fail('Demande introuvable.');
        if (body.approve) {
          this.users = this.users.map(u => (u.id === pr.user_id ? { ...u, name: pr.name, username: pr.username, phone: pr.phone, avatar_url: pr.avatar_url || u.avatar_url } : u));
          if (me && me.id === pr.user_id) this.currentUser = this.users.find(u => u.id === me.id) || me;
        }
        return ok();
      }
      case 'signup-decision': {
        const sg = this.signups.find(x => x.id === body.id); if (!sg) return fail('Demande introuvable.');
        if (body.approve) {
          const u: User = { id: `demo_u${Date.now()}`, username: sg.username, name: sg.name, role: 'employee', status: 'active', shift: sg.shift, is_online: false, avatar_url: '', phone: sg.phone, performance_badge: 'Standard', total_score_boosted: 0, total_earnings_ar: 0, pending_advance_ar: 0 };
          this.users = [...this.users, u];
        }
        return ok();
      }
      case 'queue': {
        if (!me) return fail('Connexion perdue.');
        const others = this.presence.filter(x => x.waiting_since && x.user_id !== me.id);
        if (body.join) {
          this.myQueue = { waiting_since: nowIso, position: others.length + 1, total: others.length + 1 };
          this.presence = [...this.presence.filter(x => x.user_id !== me.id), { user_id: me.id, last_seen: nowIso, day: nowIso.slice(0, 10), online_sec: 600, waiting_since: nowIso }];
        } else {
          this.myQueue = null;
          this.presence = this.presence.map(x => (x.user_id === me.id ? { ...x, waiting_since: null } : x));
        }
        this.emit();
        return ok();
      }
      case 'accounting-sync': {
        if (!isMoneyRole(me?.role)) return fail('Réservé au responsable et au comptable.');
        const built = buildEntries({ invoices: this.invoices, cash: this.cash, slips: [], advances: this.advanceRequests });
        const have = new Set(this.entries.map(e => e.id));
        const closedTo = this.getAcctClose().through;
        const fresh = built.entries.filter(e => !have.has(e.id) && (!closedTo || e.date > closedTo));
        this.entries = [...assignNumbers(fresh, this.entries), ...this.entries];
        this.emit();
        return ok({ ok: true, created: fresh.length, existing: built.entries.length - fresh.length, total: built.entries.length, skipped: built.skipped });
      }
      case 'accounting-post': {
        if (!isMoneyRole(me?.role)) return fail('Réservé au responsable et au comptable.');
        const id = `je-manual-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const v = cleanEntry({ id, date: body.date, journal: body.journal, ref: body.ref, label: body.label, lines: body.lines, source: { type: 'manual', id } }, this.getAcctClose().through);
        if (!v.ok) return fail(`Écriture refusée (${v.reason}).`);
        this.entries = [...assignNumbers([v.entry], this.entries), ...this.entries];
        this.emit();
        return ok({ ok: true, id, created: 1 });
      }
      case 'accounting-reverse': {
        if (me?.role !== 'admin') return fail('Réservé à l\'administrateur.');
        const orig = this.entries.find(e => e.id === body.id);
        const reason = String(body.reason || '').replace(/[<>]/g, '').trim().slice(0, 150), date = String(body.date || '');
        if (!orig) return fail('Cette écriture n\'existe pas.');
        if (reason.length < 3) return fail('Écris un motif (3 caractères au moins).');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < orig.date) return fail('Date incorrecte (pas avant l\'écriture annulée).');
        if (orig.reversal_of) return fail('Une annulation ne s\'annule pas : saisis une nouvelle écriture.');
        if (orig.reversed_by) return fail('Cette écriture est déjà annulée.');
        const rev = reverseAccounting(orig, date, `${orig.id}-rev`);
        rev.label = `${rev.label} (${reason})`.slice(0, 200);
        const v = cleanEntry(rev, this.getAcctClose().through);
        if (!v.ok) return fail(`Annulation refusée (${v.reason}).`);
        this.entries = [...assignNumbers([v.entry], this.entries), ...this.entries.map(e => (e.id === orig.id ? { ...e, reversed_by: rev.id } : e))];
        this.emit();
        return ok({ ok: true });
      }
      case 'accounting-close': {
        if (me?.role !== 'admin') return fail('Réservé à l\'administrateur.');
        const cur = this.getAcctClose();
        const now = new Date().toISOString(), today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
        const setClose = (through: string, e: any) => { this.settings = [{ ...(this.settings[0] as any), acct_close: { through, log: [...cur.log, { at: now, by: me.id, by_name: me.name || '', ...e }].slice(-100) } }]; };
        if (body.action === 'close') {
          const p = planClose(cur.through, body.through, today);
          if (!p.ok) return fail(p.reason === 'date' ? 'La clôture se fait à une fin de mois (exemple : 2026-10-31).' : p.reason === 'future' ? 'On ne peut pas clôturer une période qui n\'est pas encore finie.' : 'Cette période est déjà close.');
          let carried = 0;
          if (p.yearEnd) {
            const n = this.entries.filter(e => e.source?.type === 'closing' && e.source?.id === body.through && !e.reversal_of).length;
            const ce = closingEntry(this.entries, `${String(body.through).slice(0, 4)}-01-01`, body.through, `je-closing-${body.through}-${n + 1}`);
            const v = ce ? cleanEntry(ce, cur.through) : null;
            if (v && v.ok) { this.entries = [...assignNumbers([v.entry], this.entries), ...this.entries]; carried = 1; }
          }
          setClose(body.through, { action: 'close', through: body.through });
          this.emit();
          return ok({ ok: true, through: body.through, carried });
        }
        if (body.action === 'reopen') {
          const through = body.through ? String(body.through) : '';
          const reason = String(body.reason ?? '').replace(/[<>]/g, '').trim().slice(0, 150);
          const p = planReopen(cur.through, through, reason);
          if (!p.ok) return fail(p.reason === 'reason' ? 'Écris un motif (3 caractères au moins).' : p.reason === 'nothing' ? 'Aucune période n\'est close.' : p.reason === 'later' ? 'Pour rouvrir, choisis une date plus ancienne que la clôture actuelle.' : 'La clôture se fait à une fin de mois.');
          let undone = 0;
          for (const e of this.entries.filter(x => x.source?.type === 'closing' && !x.reversal_of && !x.reversed_by && x.date > through)) {
            const rev = reverseAccounting(e, e.date, `${e.id}-rev`);
            rev.label = `${rev.label} (réouverture : ${reason})`.slice(0, 200);
            const v = cleanEntry(rev, through);
            if (!v.ok) return fail(`Annulation du report à nouveau refusée (${v.reason}).`);
            this.entries = [...assignNumbers([v.entry], this.entries), ...this.entries.map(x => (x.id === e.id ? { ...x, reversed_by: rev.id } : x))];
            undone++;
          }
          setClose(through, { action: 'reopen', through, reason });
          this.emit();
          return ok({ ok: true, through, undone });
        }
        return fail('Action inconnue.');
      }
      case 'invoice-issue': {
        const inv = this.invoices.find(x => x.id === body.id);
        if (!inv || inv.status !== 'draft') return fail('Cette facture n\'est plus un brouillon.');
        const co = readCompany(this.getSettings().company);
        const client = this.clients.find(c => c.id === inv.client_id);
        const year = Number(nowIso.slice(0, 4));
        const n = this.invoices.filter(x => x.type !== 'credit_note' && x.number?.startsWith(`${co.billing.invoice_prefix}${year}-`)).length + 1;
        const t = invoiceTotals(inv.lines, co.tax.vat_enabled, co.tax.vat_rate);
        this.invoices = this.invoices.map(x => x.id === inv.id ? { ...x, ...t, status: 'issued', number: formatNumber(co.billing.invoice_prefix, year, n), issued_at: nowIso, client: { name: client?.name || inv.client.name, address: client?.address, email: client?.email, phone: client?.phone }, issuer: { name: co.identity.name, address: co.identity.address, email: co.identity.email, phone: co.identity.phone, tax_id: co.legal.tax_id, register_id: co.legal.register_id } } : x);
        this.emit();
        return ok({ ok: true });
      }
      case 'invoice-pay': {
        const inv = this.invoices.find(x => x.id === body.id);
        if (!inv || inv.status !== 'issued' || inv.type === 'credit_note') return fail('Cette facture n\'est pas émise.');
        const info = invoiceInfo(inv, this.cash, nowIso.slice(0, 10));
        const amount = Math.round(Number(body.amount));
        if (!Number.isFinite(amount) || amount < 1) return fail('Montant invalide.');
        if (amount > info.balance) return fail(`Le paiement dépasse le reste à payer (${info.balance} Ar).`);
        const co = readCompany(this.getSettings().company);
        const n = this.cash.filter(x => x.receipt_no?.startsWith(`${co.billing.receipt_prefix}${nowIso.slice(0, 4)}-`)).length + 1;
        this.cash = [{ id: `cash-${Date.now().toString(36)}`, kind: 'in', category: 'Paiement client', amount_ar: amount, date: String(body.date || nowIso.slice(0, 10)), note: String(body.note || ''), client_name: inv.client.name, invoice_id: inv.id, receipt_no: formatNumber(co.billing.receipt_prefix, Number(nowIso.slice(0, 4)), n), payment_method: String(body.method || ''), created_at: nowIso, updated_at: nowIso }, ...this.cash];
        this.emit();
        return ok({ ok: true });
      }
      case 'invoice-cancel': {
        const inv = this.invoices.find(x => x.id === body.id);
        if (!inv || inv.status !== 'issued' || inv.type === 'credit_note') return fail('Cette facture ne peut pas être annulée.');
        if (invoiceInfo(inv, this.cash, nowIso.slice(0, 10)).paid > 0) return fail('Cette facture a déjà reçu un paiement : supprime d\'abord le paiement.');
        const n = this.invoices.filter(x => x.type === 'credit_note' && x.number?.startsWith(`AV-${nowIso.slice(0, 4)}-`)).length + 1;
        const credit: Invoice = { ...inv, id: `cn-${Date.now().toString(36)}`, type: 'credit_note', number: formatNumber('AV-', Number(nowIso.slice(0, 4)), n), credit_of: inv.id, cancelled_by: undefined, issue_date: nowIso.slice(0, 10), issued_at: nowIso, created_at: nowIso, updated_at: nowIso };
        delete credit.cancelled_by;
        this.invoices = [credit, ...this.invoices.map(x => x.id === inv.id ? { ...x, status: 'cancelled' as const, cancelled_by: credit.id } : x)];
        this.emit();
        return ok({ ok: true });
      }
      case 'typing': return ok({ typing: [] });
      default: return ok(); // chat-read, report-error, queue, set-password, décisions… : accepté, sans rien envoyer
    }
  },
  isDemo(): boolean { return this.demo; },
  enterDemo(role: 'admin' | 'employee'): User {
    if ((import.meta as any).env?.PROD) throw new Error('Le mode démo n\'existe plus sur le site (réservé aux tests).');
    this.stopPolling();
    this.resetLocal();
    this.token = null;
    this.demo = true;
    const d = buildDemoData();
    // Les fiches clients ne sont pas visibles par un opérateur : ni les fiches, ni le lien client_id sur les missions (comme le vrai serveur)
    const strip = <T extends object>(x: T): T => { const { client_id, ...rest } = x as any; return rest as T; };
    this.users = role === 'admin' ? d.users : d.users.map(u => (u.id === 'demo_u1' ? u : { ...u, hr: undefined })); this.contracts = role === 'admin' ? d.contracts : d.contracts.map(strip); this.posts = role === 'admin' ? d.posts : d.posts.map(strip); this.advanceRequests = d.advances;
    this.clients = role === 'admin' ? d.clients : [];
    this.messages = d.messages; this.groups = d.groups; this.news = d.news;
    this.signups = d.signups; this.resets = d.resets; this.profileRequests = d.profileRequests; this.presence = d.presence; this.myQueue = null;
    this.demoErrors = d.errors;
    this.settings = [{ ...DEFAULT_SETTINGS, ...DEMO_CLIENT_PRICES, ...DEMO_GOALS, ...(role === 'admin' ? { budgets: DEMO_BUDGETS, team_goals: DEMO_TEAM_GOALS, monthly_plan: DEMO_MONTHLY_PLAN, recurring_missions: DEMO_RECURRING } : {}), company: role === 'admin' ? readCompany(DEMO_COMPANY) : (companyForEmployee(DEMO_COMPANY as any) as any) }]; // prix client, objectifs et conditions inventés ; l'opérateur de la démo ne reçoit que le règlement et les congés, comme avec le vrai serveur
    this.cash = role === 'admin' ? d.cash : []; // les finances ne sont visibles que par le responsable, même en démo
    this.products = role === 'admin' ? d.products : []; // le stock aussi
    this.stockMoves = role === 'admin' ? d.stock : [];
    this.invoices = role === 'admin' ? d.invoices : [];
    this.quotes = role === 'admin' ? d.quotes : [];
    this.suppliers = role === 'admin' ? d.suppliers : [];
    this.purchases = role === 'admin' ? d.purchases : [];
    this.entries = role === 'admin' ? d.entries : [];
    this.reviews = role === 'admin' ? d.reviews : d.reviews.filter(r => r.employee_id === 'demo_u1' && r.status === 'shared').map(r => forEmployeeReview(r) as Review);
    this.sheets = role === 'admin' ? demoSheets(new Date().toISOString()).map(x => ({ ...x, owner_id: 'demo_u1', owner_name: 'Camille Durand' })) : []; // l'opérateur démo reçoit ses exemples à l'ouverture de la page
    this.leaves = role === 'admin' ? d.leaves : d.leaves.filter(l => l.employee_id === 'demo_u1'); // un salarié ne voit que ses congés, même en démo
    this.shifts = role === 'admin' ? d.shifts : d.shifts.filter(s => s.employee_id === 'demo_u1'); // idem pour le planning
    this.demoBackups = [{ id: 1, taken_at: new Date(Date.now() - 20 * 3600 * 1000).toISOString(), tables: 20, bytes: 204800 }];
    this.currentUser = d.users.find(u => (role === 'admin' ? u.id === DEMO_ADMIN_ID : u.id === 'demo_u1')) as User;
    this.emit();
    return this.currentUser;
  },
  /** Mode démo : simule une coupure du réseau pour essayer le mode hors ligne (marques « en attente », compteur, retour du réseau). */
  isDemoCut(): boolean { return this.demo && this.demoCut; },
  setDemoCut(on: boolean): void {
    if (!this.demo || on === this.demoCut) return;
    if (on) {
      const base = this.emptySynced();
      for (const c of COLS) for (const rec of this.arr(c)) if (rec && typeof rec.id === 'string') base[c].set(rec.id, JSON.stringify(rec));
      this.demoBase = base; this.demoCut = true; this.setConn(true);
    } else { this.demoCut = false; this.demoBase = null; this.setConn(false); void this.sendSheets(true); }
    this.emit();
  },
});

export type DemoMethods = typeof demoMethods;
