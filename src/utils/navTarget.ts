// « Va exactement à cet élément » : une page marque ses éléments avec data-nav="...",
// puis flashNav() défile jusqu'à lui et le fait clignoter.
export const NAV_TARGET_EVENT = 'df-nav-target';
let target: string | null = null;
let thread: string | null = null;

export const setNavTarget = (nav: string) => {
  target = nav;
  window.dispatchEvent(new Event(NAV_TARGET_EVENT));
};
export const peekNavTarget = () => target;

// Messagerie : discussion à ouvrir ('all' = groupe, sinon identifiant du booster)
export const CHAT_THREAD_EVENT = 'df-chat-thread';
export const setChatThread = (id: string) => { thread = id; window.dispatchEvent(new Event(CHAT_THREAD_EVENT)); };
export const takeChatThread = () => { const t = thread; thread = null; return t; };

// L'élément peut apparaître après le changement de page : on le cherche pendant 4 secondes
export const flashNav = (nav: string) => {
  let tries = 0;
  const step = () => {
    const el = Array.from(document.querySelectorAll<HTMLElement>('[data-nav]')).find(e => e.getAttribute('data-nav') === nav);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.remove('nav-flash');
      void el.offsetWidth; // relance l'animation si on clique deux fois
      el.classList.add('nav-flash');
      setTimeout(() => { el.classList.remove('nav-flash'); if (target === nav) target = null; }, 3000);
      return;
    }
    if (++tries < 40) setTimeout(step, 100);
    else if (target === nav) target = null;
  };
  step();
};
