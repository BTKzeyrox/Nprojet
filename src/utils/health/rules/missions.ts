// Contrôles de la page Missions (module 11, lot 1). Règles pures : elles ne changent aucune donnée.
import { alertId, hasEnough, type HealthContext, type HealthRule } from '../registry';
import type { HealthAlert } from '../types';
import { missionRequiresClient } from '../../clients';
import { toMin } from '../../attendance';
import { duration, list, madaDay, plural, sessionMs, userName } from './common';

const waitingSince = (p: HealthContext['posts'][number]): number => {
  const fromStamp = Date.parse(p.status === 'pending_end' ? (p.updated_at || '') : (p.updated_at || p.created_at || ''));
  if (Number.isFinite(fromStamp)) return fromStamp;
  return p.status === 'pending_end' ? sessionMs(p.date, p.end_time || p.start_time) : sessionMs(p.date, p.start_time);
};

/** Missions à valider (début ou fin) depuis plus de N heures. */
export const validationWait: HealthRule = {
  id: 'missions.validation-wait', page: 'missions',
  run: (ctx) => {
    const T = ctx.thresholds.validate_hours;
    const waits = ctx.posts.filter(p => p.status === 'pending_end' || p.status === 'pending_start')
      .map(p => ({ p, ms: waitingSince(p) })).filter(x => Number.isFinite(x.ms))
      .map(x => ({ ...x, h: (ctx.now - x.ms) / 3600_000 })).filter(x => x.h > T).sort((a, b) => b.h - a.h);
    if (!waits.length) return [];
    const n = waits.length, old = waits[0];
    const who = list([...new Set(waits.map(x => userName(ctx, x.p.employee_id, x.p.employee_name)))]);
    return [{
      id: alertId('missions', 'validation-wait'), page: 'missions', rule: 'validation-wait',
      severity: old.h > 3 * T ? 'urgent' : 'watch',
      title_fr: `${n} ${plural(n, 'mission attend', 'missions attendent')} ta validation depuis plus de ${T} h`,
      title_en: `${n} ${plural(n, 'mission has', 'missions have')} been waiting for your validation for over ${T} h`,
      why_fr: `La plus ancienne attend depuis ${duration(old.h, 'fr')} (${userName(ctx, old.p.employee_id, old.p.employee_name)}). Concerne : ${who}.`,
      why_en: `The oldest has been waiting for ${duration(old.h, 'en')} (${userName(ctx, old.p.employee_id, old.p.employee_name)}). Concerns: ${who}.`,
      todo_fr: 'Valider ou refuser (avec un motif) pour que le salarié soit payé.', todo_en: 'Validate or refuse (with a reason) so the employee gets paid.',
      since: madaDay(old.ms), value: n, go: { view: 'validations', filter: old.p.status === 'pending_start' ? 'starts' : 'ends', nav: `val-post-${old.p.id}` },
    } as HealthAlert];
  },
};

/** Missions « en cours » depuis plus de N heures, sans preuve de fin. */
export const activeNoEnd: HealthRule = {
  id: 'missions.active-no-end', page: 'missions',
  run: (ctx) => {
    const T = ctx.thresholds.active_no_end_hours;
    const long = ctx.posts.filter(p => p.status === 'active').map(p => ({ p, ms: sessionMs(p.date, p.start_time) }))
      .filter(x => Number.isFinite(x.ms)).map(x => ({ ...x, h: (ctx.now - x.ms) / 3600_000 })).filter(x => x.h > T).sort((a, b) => b.h - a.h);
    if (!long.length) return [];
    const n = long.length, old = long[0];
    const who = list([...new Set(long.map(x => userName(ctx, x.p.employee_id, x.p.employee_name)))]);
    return [{
      id: alertId('missions', 'active-no-end'), page: 'missions', rule: 'active-no-end',
      severity: old.h > 3 * T ? 'urgent' : 'watch',
      title_fr: `${n} ${plural(n, 'mission est', 'missions sont')} en cours depuis plus de ${T} h`,
      title_en: `${n} ${plural(n, 'mission has', 'missions have')} been in progress for over ${T} h`,
      why_fr: `La plus longue dure depuis ${duration(old.h, 'fr')} sans preuve de fin (${userName(ctx, old.p.employee_id, old.p.employee_name)}). Concerne : ${who}.`,
      why_en: `The longest has been running for ${duration(old.h, 'en')} with no end proof (${userName(ctx, old.p.employee_id, old.p.employee_name)}). Concerns: ${who}.`,
      todo_fr: 'Demander où en est la mission, ou la libérer.', todo_en: 'Ask how the mission is going, or release it.',
      since: madaDay(old.ms), value: n, go: { view: 'active-post' },
    } as HealthAlert];
  },
};

/** Missions sans fiche client alors que la page Conditions l'exige (seulement s'il existe au moins une fiche). */
export const noClient: HealthRule = {
  id: 'missions.no-client', page: 'missions',
  run: (ctx) => {
    if (!hasEnough(ctx.clients.length, 1) || !missionRequiresClient(ctx.settings.company as any)) return [];
    const n = ctx.contracts.filter(c => !c.client_id && !c.no_account).length;
    if (!n) return [];
    return [{
      id: alertId('missions', 'no-client'), page: 'missions', rule: 'no-client', severity: 'info',
      title_fr: `${n} ${plural(n, 'mission n\'a', 'missions n\'ont')} pas de client`,
      title_en: `${n} ${plural(n, 'mission has', 'missions have')} no client`,
      why_fr: 'Sans fiche client, ces missions ne comptent dans aucun chiffre par client.', why_en: 'Without a client record, these missions are not counted in any per-client figure.',
      todo_fr: 'Les rattacher dans la page Clients (outil « Missions à rattacher »).', todo_en: 'Link them in the Clients page (“Missions to link” tool).',
      since: null, value: n, go: { view: 'clients' },
    } as HealthAlert];
  },
};

/** Une même preuve (même adresse de fichier) envoyée pour plusieurs missions. Limite : on compare les adresses, pas le contenu des fichiers. */
export const sameProof: HealthRule = {
  id: 'missions.same-proof', page: 'missions',
  run: (ctx) => {
    const by = new Map<string, Set<string>>();
    const owner = new Map<string, string>();
    for (const p of ctx.posts) for (const u of [p.start_proof_url, p.end_proof_url]) {
      if (!u || typeof u !== 'string' || u.length < 8) continue;
      let s = by.get(u); if (!s) by.set(u, s = new Set());
      s.add(p.id); if (!owner.has(u)) owner.set(u, p.employee_id);
    }
    const dup = [...by.entries()].filter(([, s]) => s.size >= 2);
    if (!dup.length) return [];
    const who = list([...new Set(dup.map(([u]) => userName(ctx, owner.get(u) || '')))]);
    return [{
      id: alertId('missions', 'same-proof'), page: 'missions', rule: 'same-proof', severity: 'watch',
      title_fr: `${dup.length} ${plural(dup.length, 'preuve est utilisée', 'preuves sont utilisées')} pour plusieurs missions`,
      title_en: `${dup.length} ${plural(dup.length, 'proof is', 'proofs are')} used for several missions`,
      why_fr: `Le même fichier apparaît dans plusieurs missions (premier envoi : ${who}). C'est un signal à vérifier, pas une preuve de faute.`,
      why_en: `The same file appears in several missions (first sent by: ${who}). This is a signal to check, not proof of wrongdoing.`,
      todo_fr: 'Ouvrir les missions concernées et comparer les preuves.', todo_en: 'Open the missions concerned and compare the proofs.',
      since: null, value: dup.length, go: { view: 'history' },
    } as HealthAlert];
  },
};

/** Au moins 2 missions terminées en quelques minutes seulement, sur les 14 derniers jours, pour un même salarié. */
export const tooFast: HealthRule = {
  id: 'missions.too-fast', page: 'missions',
  run: (ctx) => {
    const T = ctx.thresholds.min_duration_minutes, from = madaDay(ctx.now - 14 * 86400_000);
    const by = new Map<string, { date: string; name: string }[]>();
    for (const p of ctx.posts) {
      if (p.status !== 'completed' || !p.end_time || !p.start_time || !p.date || p.date < from) continue;
      const minutes = (toMin(p.end_time) - toMin(p.start_time) + 1440) % 1440;
      if (minutes >= T) continue;
      const l = by.get(p.employee_id) || []; l.push({ date: p.date, name: p.employee_name }); by.set(p.employee_id, l);
    }
    const out: HealthAlert[] = [];
    for (const [id, l] of by) {
      if (!hasEnough(l.length, 2)) continue;
      const name = userName(ctx, id, l[0].name), since = l.map(x => x.date).sort()[0];
      out.push({
        id: alertId('missions', 'too-fast', id), page: 'missions', rule: 'too-fast', severity: 'watch',
        title_fr: `${name} : ${l.length} missions terminées en moins de ${T} min`, title_en: `${name}: ${l.length} missions finished in under ${T} min`,
        why_fr: `Sur les 14 derniers jours, ${l.length} missions ont duré moins de ${T} minutes. Ça peut être normal pour une petite mission : à vérifier.`,
        why_en: `Over the last 14 days, ${l.length} missions lasted under ${T} minutes. That can be normal for a small mission: worth checking.`,
        todo_fr: 'Regarder les preuves de ces missions dans l\'Historique.', todo_en: 'Look at the proofs of these missions in History.',
        since, value: l.length, go: { view: 'history' },
      });
    }
    return out;
  },
};

export const MISSION_RULES: HealthRule[] = [validationWait, activeNoEnd, noClient, sameProof, tooFast];
