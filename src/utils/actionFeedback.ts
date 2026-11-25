// Retour visible après un bouton d'action (Enregistrer, Copier, Publier, Envoyer, Télécharger, Supprimer…). Utilisé par : les boutons d'action de tout le site.
// Contrôlé par : npm run check:action-feedback. Pour modifier : fb('save', gestionnaire) entoure le gestionnaire SANS le changer (même appel, même événement, même résultat) ;
// pendant l'action le bouton est marqué data-fb="busy", puis data-fb="ok" (texte « Enregistré ✓ » 1,5 s) ou data-fb="err" (« Échec »). Un message en bas confirme aussi
// (utile quand la fenêtre se ferme ou que la ligne disparaît). Les styles sont dans index.css ([data-fb]).
// HONNÊTE : « ✓ » seulement si l'action a laissé une trace réelle (changement des données, copie dans le presse-papiers, fichier téléchargé, partage) ou répondu succès ; un bouton qui refuse (champ vide, confirmation annulée) n'affiche rien.
import { showToast } from '../components/ToastHost';

export type FbKind = 'save' | 'copy' | 'publish' | 'send' | 'download' | 'delete' | 'validate' | 'refuse' | 'add' | 'remove' | 'create' | 'restore' | 'archive' | 'import' | 'export' | 'share' | 'mark' | 'apply' | 'resend' | 'update';

/** Les mots affichés : sur le bouton (ok) et dans le message en bas. */
export const FB_TEXT: Record<FbKind, { ok: string; busy: string; offline: string; fail: string }> = {
  save: { ok: 'Enregistré ✓', busy: 'Enregistrement…', offline: 'Gardé ✓', fail: 'Échec' },
  copy: { ok: 'Copié ✓', busy: 'Copie…', offline: 'Copié ✓', fail: 'Échec' },
  publish: { ok: 'Publié ✓', busy: 'Publication…', offline: 'Gardé ✓', fail: 'Échec' },
  send: { ok: 'Envoyé ✓', busy: 'Envoi…', offline: 'Gardé ✓', fail: 'Échec' },
  download: { ok: 'Téléchargé ✓', busy: 'Téléchargement…', offline: 'Téléchargé ✓', fail: 'Échec' },
  delete: { ok: 'Supprimé ✓', busy: 'Suppression…', offline: 'Gardé ✓', fail: 'Échec' },
  validate: { ok: 'Validé ✓', busy: 'Validation…', offline: 'Gardé ✓', fail: 'Échec' },
  refuse: { ok: 'Refusé ✓', busy: 'Refus…', offline: 'Gardé ✓', fail: 'Échec' },
  add: { ok: 'Ajouté ✓', busy: 'Ajout…', offline: 'Gardé ✓', fail: 'Échec' },
  remove: { ok: 'Retiré ✓', busy: 'Retrait…', offline: 'Gardé ✓', fail: 'Échec' },
  create: { ok: 'Créé ✓', busy: 'Création…', offline: 'Gardé ✓', fail: 'Échec' },
  restore: { ok: 'Restauré ✓', busy: 'Restauration…', offline: 'Gardé ✓', fail: 'Échec' },
  archive: { ok: 'Archivé ✓', busy: 'Archivage…', offline: 'Gardé ✓', fail: 'Échec' },
  import: { ok: 'Importé ✓', busy: 'Import…', offline: 'Gardé ✓', fail: 'Échec' },
  export: { ok: 'Exporté ✓', busy: 'Export…', offline: 'Exporté ✓', fail: 'Échec' },
  share: { ok: 'Partagé ✓', busy: 'Partage…', offline: 'Gardé ✓', fail: 'Échec' },
  mark: { ok: 'Fait ✓', busy: '…', offline: 'Gardé ✓', fail: 'Échec' },
  apply: { ok: 'Appliqué ✓', busy: 'Application…', offline: 'Gardé ✓', fail: 'Échec' },
  resend: { ok: 'Renvoyé ✓', busy: 'Envoi…', offline: 'Gardé ✓', fail: 'Échec' },
  update: { ok: 'Mis à jour ✓', busy: 'Mise à jour…', offline: 'Gardé ✓', fail: 'Échec' },
};
/** Actions qui, sans réseau, restent sur le téléphone et partent plus tard : le message le dit honnêtement. */
export const OFFLINE_NOTE = 'Gardé sur ce téléphone, envoyé au retour du réseau';

const SHOW_MS = 1500;
type Ev = { currentTarget?: unknown; nativeEvent?: { submitter?: unknown } } | undefined | null;

/** Le bouton touché : le bouton lui-même, le bouton qui a envoyé le formulaire, ou le premier bouton « submit » du formulaire. */
export function feedbackTarget(e: Ev): HTMLElement | null {
  try {
    const sub = e?.nativeEvent?.submitter;
    if (sub && typeof (sub as HTMLElement).setAttribute === 'function') return sub as HTMLElement;
    const ct = e?.currentTarget as HTMLElement | undefined;
    if (!ct || typeof ct.setAttribute !== 'function') return null;
    if (ct.tagName === 'FORM') return ct.querySelector<HTMLElement>('button[type="submit"]');
    return ct;
  } catch { return null; }
}

const timers = new WeakMap<HTMLElement, number>();
const hasOwnText = (el: HTMLElement) => (el.textContent || '').trim().length > 0;
function mark(el: HTMLElement | null, state: 'busy' | 'ok' | 'err', text: string) {
  if (!el || !el.isConnected) return;
  const t = timers.get(el); if (t) window.clearTimeout(t);
  el.setAttribute('data-fb', state);
  if (hasOwnText(el) || el.hasAttribute('data-fb-text')) { el.setAttribute('data-fb-text', text); el.setAttribute('data-fb-label', '1'); } else el.removeAttribute('data-fb-label');
  // « en cours » ne reste jamais bloqué : 30 s au plus ; les autres états disparaissent après 1,5 s (échec : 2,6 s)
  timers.set(el, window.setTimeout(() => { el.removeAttribute('data-fb'); el.removeAttribute('data-fb-text'); el.removeAttribute('data-fb-label'); timers.delete(el); }, state === 'busy' ? 30000 : state === 'err' ? 2600 : SHOW_MS));
}
function clearMark(el: HTMLElement | null) {
  if (!el) return;
  const t = timers.get(el); if (t) window.clearTimeout(t);
  timers.delete(el);
  el.removeAttribute('data-fb'); el.removeAttribute('data-fb-text'); el.removeAttribute('data-fb-label');
}
const isOffline = () => { try { return typeof navigator !== 'undefined' && navigator.onLine === false; } catch { return false; } };
const errText = (e: unknown) => { const m = e instanceof Error ? e.message : typeof e === 'string' ? e : ''; return m && m.length < 140 ? m : ''; };

let extra = 0;
let installed = false;
/** Compte les traces réelles d'une action : copie, téléchargement, partage (pas le réseau : l'application interroge le serveur toute seule en continu). À appeler une fois au démarrage (main.tsx). */
let dataSeq: () => number = () => 0;
/** Source des changements de données (db.mutationSeq), donnée au démarrage par main.tsx. */
export function setEvidenceSource(fn: () => number): void { dataSeq = fn; }
export function installActionEvidence(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  try {
    const cb = navigator.clipboard as unknown as Record<string, unknown> | undefined;
    for (const k of ['writeText', 'write']) {
      const orig = cb && typeof cb[k] === 'function' ? (cb[k] as (...a: unknown[]) => Promise<unknown>).bind(cb) : null;
      if (cb && orig) { try { cb[k] = (...a: unknown[]) => { extra++; return orig(...a); }; } catch { /* lecture seule */ } }
    }
    const ec = typeof document.execCommand === 'function' ? document.execCommand.bind(document) : null;
    if (ec) document.execCommand = (cmd: string, ...r: [boolean?, string?]) => { if (cmd === 'copy' || cmd === 'cut') extra++; return ec(cmd, ...r); };
    const ac = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { if (this.hasAttribute('download')) extra++; return ac.call(this); };
    const cu = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (o: Blob | MediaSource) => { extra++; return cu(o); };
    const sh = typeof navigator.share === 'function' ? navigator.share.bind(navigator) : null;
    if (sh) navigator.share = (d?: ShareData) => { extra++; return sh(d); };
  } catch { /* navigateur sans ces fonctions */ }
}
export const evidenceNow = (): number => { try { return (dataSeq() || 0) + extra; } catch { return extra; } };

/** Dit si le résultat d'une action est un échec : false, { ok: false }, { success: false } ou { error }. */
export function isFailure(r: unknown): boolean {
  if (r === false) return true;
  if (r && typeof r === 'object') { const o = r as { ok?: unknown; success?: unknown; error?: unknown }; if (o.ok === false || o.success === false) return true; if (typeof o.error === 'string' && o.error) return true; }
  return false;
}
/** Dit si le résultat affirme clairement la réussite (true, { ok: true }, { success: true }). */
export function isSuccess(r: unknown): boolean {
  if (r === true) return true;
  return !!r && typeof r === 'object' && ((r as { ok?: unknown }).ok === true || (r as { success?: unknown }).success === true);
}
export type Verdict = 'ok' | 'fail' | 'none';
/** Le verdict : échec si le résultat le dit ou si une erreur s'est affichée ; réussite si le résultat l'affirme ou si une trace réelle existe ; sinon rien (le bouton a refusé, aucun faux « ✓ »). */
export function verdict(result: unknown, before: number, after: number, errorToast: boolean): Verdict {
  if (isFailure(result) || errorToast) return 'fail';
  if (isSuccess(result) || after !== before) return 'ok';
  return 'none';
}

const WAIT_MS = 1200; // une action lancée sans attendre sa fin (void) peut laisser sa trace un peu plus tard
const TICK_MS = 80;

/** Entoure un gestionnaire de bouton : même appel, même événement, même résultat ; ajoute seulement le retour visible. */
export function fb<A extends unknown[], R>(kind: FbKind, fn: (...args: A) => R): (...args: A) => R {
  return (...args: A): R => {
    const T = FB_TEXT[kind];
    const el = feedbackTarget(args[0] as Ev);
    const offline = isOffline();
    const before = evidenceNow();
    const t0 = Date.now();
    let errSeen = false, anyToast = false;
    const onToast = (e: Event) => { anyToast = true; if ((e as CustomEvent<{ type?: string }>).detail?.type === 'error') errSeen = true; };
    window.addEventListener('df:toast', onToast);
    let asyncDone = false;
    const finish = (res: unknown) => {
      window.removeEventListener('df:toast', onToast);
      // Une action asynchrone qui se termine sans erreur compte comme faite, sauf si elle a fini en moins de 40 ms sans rien laisser (refus immédiat : champ vide…)
      const instantRefusal = asyncDone && Date.now() - t0 < 40 && evidenceNow() === before && !isSuccess(res);
      const v = instantRefusal ? 'none' : asyncDone ? (isFailure(res) || errSeen ? 'fail' : 'ok') : verdict(res, before, evidenceNow(), errSeen);
      if (v === 'none') { clearMark(el); return; } // le bouton a refusé : on le débloque et on n'affiche rien
      if (v === 'fail') {
        mark(el, 'err', T.fail);
        if (!anyToast) { const why = res && typeof res === 'object' ? errText((res as { error?: unknown }).error) : ''; showToast(why || `${T.fail} : l'action n'a pas marché`, 'error'); }
        return;
      }
      const off = offline && T.offline !== T.ok;
      mark(el, 'ok', off ? T.offline : T.ok);
      if (!anyToast) showToast(off ? OFFLINE_NOTE : T.ok, off ? 'info' : 'success');
    };
    let r: R;
    try { r = fn(...args); } catch (err) { window.removeEventListener('df:toast', onToast); mark(el, 'err', T.fail); showToast(errText(err) || `${T.fail} : l'action n'a pas marché`, 'error'); throw err; }
    if (r && typeof (r as unknown as Promise<unknown>).then === 'function') {
      mark(el, 'busy', T.busy);
      (r as unknown as Promise<unknown>).then(res => { asyncDone = true; finish(res); }, err => { window.removeEventListener('df:toast', onToast); mark(el, 'err', T.fail); showToast(errText(err) || `${T.fail} : l'action n'a pas marché`, 'error'); });
    } else if (isFailure(r) || isSuccess(r) || evidenceNow() !== before || errSeen) finish(r);
    else {
      // Pas encore de trace : on attend un instant (action lancée sans attente) ; sans trace, rien n'est affiché
      // (un seul délai à la fois, qui se relance au plus 15 fois : pas de minuteur permanent)
      let waited = 0;
      const tick = () => {
        waited += TICK_MS;
        if (evidenceNow() !== before || errSeen || waited >= WAIT_MS) finish(r); else window.setTimeout(tick, TICK_MS);
      };
      window.setTimeout(tick, TICK_MS);
    }
    return r;
  };
}
