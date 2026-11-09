// Assistant : créer une MISSION à partir d'une phrase (BTK, 2026-11-09, étape C3, point 1). Admin seulement.
// « mission : nettoyer la salle, pour Acme, demain 15 h, urgente » → aperçu, puis « Confirmer » : la mission est créée comme avec le bouton « Ajouter » de la page Missions (db.addContract).
// Les deux-points sont obligatoires (« la mission de Hugo ? » reste une question). Rien n'est créé avant la confirmation ; ce qui manque ou n'est pas compris est dit, jamais inventé.
import { b, type Reply } from './assistant';
import { parseWhen } from './assistantActions';
import { remDateOf } from './reminderRules';

export const MIS_OK_PREFIX = '__mis_ok:';
export const MIS_NO = '__mis_no';
export const MIS_MAX_TITLE = 120;
export type MisPriority = 'Normale' | 'Haute' | 'Urgente';
export interface MissionIntent {
  title: string; clientId: string; clientName: string; clientAsked: string; // clientAsked = ce que l'admin a écrit ; clientId vide = pas de fiche trouvée
  date: string; time: string; priority: MisPriority;
  past: boolean; // date limite déjà passée : refusée
  droppedTime: boolean; // une heure sans date : l'heure n'est pas gardée
  needClient: boolean; // le réglage « une mission a toujours un client » est actif et aucune fiche n'a été trouvée
}
export interface MisClient { id: string; name: string }

const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();
const PRE = "(?:(?:s'il (?:te|vous) pla[iî]t|stp|please)[, ]+)?(?:(?:peux|pourrais)-tu\\s+|tu peux\\s+|could you\\s+|can you\\s+)?";
// « mission : … », « crée une mission : … », « nouvelle mission : … », « ajoute une mission : … », « create mission: … »
const MIS_RE = new RegExp(`^\\s*${PRE}(?:(?:cr[ée]e|cr[ée]er|ajoute|ajouter|nouvelle|new|create|add)\\s+(?:une |a |la |the )?)?(?:nouvelle |new )?mission\\s*[:：]\\s*([\\s\\S]+)$`, 'i');
const CLIENT_SEG = /^(?:pour|chez|client|for|customer)\s*(?::|le client|the client|la societe|l'entreprise|the company)?\s*(.+)$/;

/** Retrouve la fiche client : même nom (sans accents ni majuscules), ou un seul nom qui contient / est contenu. Plusieurs candidats = aucun (on ne devine pas). */
export function matchClient(asked: string, clients: MisClient[]): MisClient | null {
  const a = norm(asked);
  if (!a) return null;
  const exact = clients.filter(c => norm(c.name) === a);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const part = clients.filter(c => { const n = norm(c.name); return n.length >= 3 && (n.includes(a) || a.includes(n)); });
  return part.length === 1 ? part[0] : null;
}

export function parseMissionIntent(q: string, nowMs: number, clients: MisClient[], requireClient: boolean): MissionIntent | 'incomplete' | null {
  const m = MIS_RE.exec(q.trim());
  if (!m) return null;
  const w = parseWhen(m[1], nowMs);
  const segs = w.rest.split(/[,;\n]+/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let priority: MisPriority = 'Normale', clientAsked = '';
  const titleParts: string[] = [];
  for (const sg of segs) {
    const n = norm(sg);
    if (/^(?:urgent(?:e)?|urgence|tres urgent(?:e)?|asap)$/.test(n)) { priority = 'Urgente'; continue; }
    if (/^(?:haute|haute priorite|prioritaire|priorite haute|high|high priority|importante?)$/.test(n)) { if (priority !== 'Urgente') priority = 'Haute'; continue; }
    if (/^(?:normale|priorite normale|normal)$/.test(n)) continue;
    const c = CLIENT_SEG.exec(n);
    if (c && !clientAsked && titleParts.length) { clientAsked = sg.slice(sg.length - c[1].length).trim(); continue; }
    titleParts.push(sg);
  }
  // « nettoyer la salle pour Acme » (sans virgule) : le dernier « pour X » devient le client seulement si une fiche porte ce nom
  if (!clientAsked && titleParts.length) {
    const last = titleParts[titleParts.length - 1];
    const k = /^(.*\S)\s+(?:pour|chez|for)\s+(?:le client\s+)?(\S.*)$/i.exec(last);
    if (k && matchClient(k[2], clients)) { titleParts[titleParts.length - 1] = k[1].trim(); clientAsked = k[2].trim(); }
  }
  const title = titleParts.join(', ').replace(/^[\s:：-]+|[\s:：-]+$/g, '').slice(0, MIS_MAX_TITLE).trim();
  if (!title) return 'incomplete';
  const found = clientAsked ? matchClient(clientAsked, clients) : null;
  const today = remDateOf(nowMs);
  const droppedTime = !!w.time && !w.date;
  const date = w.date || '', time = date ? w.time : '';
  return {
    title, clientId: found?.id || '', clientName: found?.name || '', clientAsked, date, time, priority,
    past: !!date && date < today, droppedTime, needClient: requireClient && !found,
  };
}

export const encodeMis = (a: MissionIntent): string => MIS_OK_PREFIX + encodeURIComponent(JSON.stringify({ n: a.title, c: a.clientId, d: a.date, h: a.time, p: a.priority, k: a.clientAsked }));
export function decodeMis(view: string): { title: string; clientId: string; clientAsked: string; date: string; time: string; priority: MisPriority } | null {
  if (!view.startsWith(MIS_OK_PREFIX)) return null;
  try {
    const o = JSON.parse(decodeURIComponent(view.slice(MIS_OK_PREFIX.length)));
    const title = typeof o.n === 'string' ? o.n.trim().slice(0, MIS_MAX_TITLE) : '';
    if (!title) return null;
    const pr: MisPriority = o.p === 'Urgente' || o.p === 'Haute' ? o.p : 'Normale';
    const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
    return { title, clientId: str(o.c, 80), clientAsked: str(o.k, 120), date: /^\d{4}-\d{2}-\d{2}$/.test(str(o.d, 10)) ? o.d : '', time: /^\d{2}:\d{2}$/.test(str(o.h, 5)) ? o.h : '', priority: pr };
  } catch { return null; }
}

const rep = (intent: string, title: ReturnType<typeof b>, lines: ReturnType<typeof b>[], actions: Reply['actions'] = []): Reply => ({ intent, title, lines, actions, sources: b('Page Missions.', 'Missions page.') });
const dmy = (d: string) => d.split('-').reverse().join('/');
export const missionIncomplete = (): Reply => rep('mission_incomplete', b('Il me faut le titre de la mission', 'I need the mission title'), [
  b('Exemple : « mission : nettoyer la salle, pour Acme, demain 15 h, urgente ».', 'Example: "mission: clean the room, for Acme, tomorrow 3 pm, urgent".'),
  b('Seul le titre est obligatoire ; le client, la date limite et la priorité sont facultatifs.', 'Only the title is required; client, deadline and priority are optional.'),
]);
export function missionPreview(a: MissionIntent): Reply {
  const lines = [b(`Titre : ${a.title}`, `Title: ${a.title}`)];
  if (a.clientId) lines.push(b(`Client : ${a.clientName}`, `Client: ${a.clientName}`));
  else if (a.clientAsked) lines.push(b(`Client « ${a.clientAsked} » : aucune fiche ne porte ce nom, je ne le rattache pas.`, `Client "${a.clientAsked}": no record has this name, I will not link it.`));
  lines.push(b(a.date ? `Date limite : ${dmy(a.date)}${a.time ? ' à ' + a.time : ''}` : 'Date limite : aucune', a.date ? `Deadline: ${dmy(a.date)}${a.time ? ' at ' + a.time : ''}` : 'Deadline: none'));
  lines.push(b(`Priorité : ${a.priority}`, `Priority: ${a.priority === 'Urgente' ? 'Urgent' : a.priority === 'Haute' ? 'High' : 'Normal'}`));
  if (a.droppedTime) lines.push(b('Tu as donné une heure sans jour : je ne garde pas l\'heure. Dis-moi aussi le jour pour l\'ajouter.', 'You gave a time without a day: I am not keeping the time. Tell me the day too to add it.'));
  if (a.past) return rep('mission_past', b('Cette date limite est déjà passée', 'This deadline is already past'), [...lines, b('Rien n\'est créé. Redonne la phrase avec une date à venir.', 'Nothing is created. Send the sentence again with a future date.')]);
  if (a.needClient) return rep('mission_need_client', b('Il faut un client pour cette mission', 'This mission needs a client'), [...lines, b('Le réglage « Une mission a toujours un client » est actif et je n\'ai trouvé aucune fiche. Redonne la phrase avec le nom exact d\'un client, par exemple « pour Acme ».', 'The "A mission always has a client" setting is on and I found no record. Send the sentence again with the exact name of a client, e.g. "for Acme".')]);
  return rep('mission_preview', b('Je vais créer cette mission', 'I will create this mission'), [...lines, b('Elle apparaît dans la page Missions, sans opérateur. Rien n\'est créé tant que tu n\'as pas confirmé.', 'It appears on the Missions page, with no operator. Nothing is created until you confirm.')], [{ label: b('Confirmer', 'Confirm'), go: { view: encodeMis(a) } }, { label: b('Annuler', 'Cancel'), go: { view: MIS_NO } }]);
}
export const missionDone = (ok: boolean, error?: string): Reply => ok
  ? rep('mission_done', b('La mission est créée', 'The mission is created'), [b('Tu la trouves dans la page Missions.', 'You can find it on the Missions page.')], [{ label: b('Voir les missions', 'See the missions'), go: { view: 'grid' } }])
  : rep('mission_error', b('Je n\'ai pas pu créer la mission', 'I could not create the mission'), [b(error || 'Rien n\'a été créé. Réessaie dans un instant.', error || 'Nothing was created. Try again in a moment.')]);
export const missionCanceled = (): Reply => rep('mission_cancel', b('D\'accord, rien n\'est créé', 'OK, nothing was created'), []);
