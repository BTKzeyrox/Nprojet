// Retour visible après un bouton d'action (Enregistrer, Copier, Publier, Envoyer, Télécharger, Supprimer…). Utilisé par : les boutons d'action de tout le site.
// Contrôlé par : npm run check:action-feedback. Pour modifier : fb('save', gestionnaire) entoure le gestionnaire SANS le changer (même appel, même événement, même résultat) ;
// pendant l'action le bouton est marqué data-fb="busy", puis data-fb="ok" (texte « Enregistré ✓ » 1,5 s) ou data-fb="err" (« Échec »). Un message en bas confirme aussi
// (utile quand la fenêtre se ferme ou que la ligne disparaît). Les styles sont dans index.css ([data-fb]).
// SIMPLE : dès le clic, le bouton affiche « ✓ » (1,5 s). Il passe en rouge « Échec » seulement si l'action échoue (erreur levée, résultat false / { success: false } / { error }, ou message d'erreur affiché dans la seconde qui suit).
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
  // aucun état ne reste : « en cours » 30 s au plus, « ✓ » 1,5 s, « Échec » 2,6 s
  timers.set(el, window.setTimeout(() => { el.removeAttribute('data-fb'); el.removeAttribute('data-fb-text'); el.removeAttribute('data-fb-label'); timers.delete(el); }, state === 'busy' ? 30000 : state === 'err' ? 2600 : SHOW_MS));
}
const isOffline = () => { try { return typeof navigator !== 'undefined' && navigator.onLine === false; } catch { return false; } };
const errText = (e: unknown) => { const m = e instanceof Error ? e.message : typeof e === 'string' ? e : ''; return m && m.length < 140 ? m : ''; };

/** Dit si le résultat d'une action est un échec : false, { ok: false }, { success: false } ou { error }. */
export function isFailure(r: unknown): boolean {
  if (r === false) return true;
  if (r && typeof r === 'object') { const o = r as { ok?: unknown; success?: unknown; error?: unknown }; if (o.ok === false || o.success === false) return true; if (typeof o.error === 'string' && o.error) return true; }
  return false;
}
let watching: (() => void) | null = null;
const ERR_WATCH_MS = 1000; // une erreur affichée juste après le clic (action lancée sans attente) fait passer le bouton en « Échec »

/** Entoure un gestionnaire de bouton : même appel, même événement, même résultat ; ajoute seulement le retour visible, tout de suite. */
export function fb<A extends unknown[], R>(kind: FbKind, fn: (...args: A) => R): (...args: A) => R {
  return (...args: A): R => {
    const T = FB_TEXT[kind];
    const el = feedbackTarget(args[0] as Ev);
    const offline = isOffline();
    let anyToast = false;
    const onToast = (e: Event) => {
      anyToast = true;
      if ((e as CustomEvent<{ type?: string }>).detail?.type === 'error') mark(el, 'err', T.fail);
    };
    // Seule l'action la plus récente surveille les erreurs : une erreur d'ailleurs ne rend pas rouge un autre bouton
    watching?.();
    const stop = () => { window.removeEventListener('df:toast', onToast); if (watching === stop) watching = null; };
    watching = stop;
    window.addEventListener('df:toast', onToast);
    window.setTimeout(stop, ERR_WATCH_MS);
    const fail = (why: string) => { mark(el, 'err', T.fail); if (!anyToast) showToast(why || `${T.fail} : l'action n'a pas marché`, 'error'); };
    const ok = () => {
      const off = offline && T.offline !== T.ok;
      mark(el, 'ok', off ? T.offline : T.ok);
      if (!anyToast) showToast(off ? OFFLINE_NOTE : T.ok, off ? 'info' : 'success');
    };
    let r: R;
    try { r = fn(...args); } catch (err) { stop(); fail(errText(err)); throw err; }
    if (r && typeof (r as unknown as Promise<unknown>).then === 'function') {
      mark(el, 'busy', T.busy);
      (r as unknown as Promise<unknown>).then(res => { if (isFailure(res)) fail(res && typeof res === 'object' ? errText((res as { error?: unknown }).error) : ''); else ok(); }, err => fail(errText(err)));
    } else if (isFailure(r)) fail(r && typeof r === 'object' ? errText((r as { error?: unknown }).error) : '');
    else ok();
    return r;
  };
}
