// Bloque le zoom de TOUTE la page sur ordinateur (pincement à deux doigts sur le pavé tactile, Ctrl + molette, Ctrl +, Ctrl −, Ctrl 0).
// Le zoom des photos (visionneuse) continue de marcher : on ne coupe que le zoom du navigateur, l'événement reste reçu par la visionneuse.
// Utilisé par : main.tsx. Test : scripts/check-page-zoom-lock.ts.
export function isPageZoomWheel(e: { ctrlKey: boolean; metaKey?: boolean }): boolean {
  return !!e.ctrlKey; // un pincement sur pavé tactile arrive comme une molette avec Ctrl
}
export function isPageZoomKey(e: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  if (!e.ctrlKey && !e.metaKey) return false;
  return ['+', '=', '-', '_', '0'].includes(e.key);
}
export function installPageZoomLock(target: Window = window): () => void {
  const onWheel = (e: WheelEvent) => { if (isPageZoomWheel(e)) e.preventDefault(); };
  const onKey = (e: KeyboardEvent) => { if (isPageZoomKey(e)) e.preventDefault(); };
  const onGesture = (e: Event) => e.preventDefault(); // Safari
  target.addEventListener('wheel', onWheel, { passive: false });
  target.addEventListener('keydown', onKey);
  target.addEventListener('gesturestart', onGesture);
  target.addEventListener('gesturechange', onGesture);
  return () => {
    target.removeEventListener('wheel', onWheel);
    target.removeEventListener('keydown', onKey);
    target.removeEventListener('gesturestart', onGesture);
    target.removeEventListener('gesturechange', onGesture);
  };
}
