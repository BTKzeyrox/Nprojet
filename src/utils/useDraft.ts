// Branche un champ de texte sur les brouillons (utils/drafts.ts) : remet le texte gardé à l'ouverture (ou au changement de champ), le garde 1 s après la dernière frappe et en quittant l'application.
// `skip` : ne rien garder pendant que le champ sert à autre chose (modifier un message déjà envoyé). Utilisé par : ChatView, FeedView (publication, commentaire), AssistantChat.
import { useEffect, useRef } from 'react';
import { readDraft, writeDraft } from './drafts';

export function useDraft(uid: string | undefined, scope: string, text: string, setText: (t: string) => void, skip = false): void {
  const latest = useRef({ uid, scope, text, skip });
  latest.current = { uid, scope, text, skip };
  const loaded = useRef('');
  // Ouverture / changement de champ : remettre le brouillon (sans écraser ce qui est déjà tapé)
  useEffect(() => {
    if (!uid) return;
    const id = uid + '|' + scope;
    if (loaded.current === id) return;
    loaded.current = id;
    const d = readDraft(uid, scope);
    if (d && !latest.current.text) setText(d);
  }, [uid, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  // Garder 1 s après la dernière frappe (texte vidé = brouillon effacé)
  useEffect(() => {
    if (!uid || skip || loaded.current !== uid + '|' + scope) return;
    const t = setTimeout(() => writeDraft(uid, scope, text), 1000);
    return () => clearTimeout(t);
  }, [uid, scope, text, skip]);
  // En quittant l'application ou en fermant : garder tout de suite
  useEffect(() => {
    const flush = () => { const c = latest.current; if (c.uid && !c.skip && loaded.current === c.uid + '|' + c.scope) writeDraft(c.uid, c.scope, c.text); };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide); window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush); flush(); };
  }, []);
}
