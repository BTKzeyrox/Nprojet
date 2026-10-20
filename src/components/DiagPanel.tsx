import React, { useEffect, useRef, useState } from 'react';
import { getLockInfo } from '../utils/useLockBodyScroll';

// Panneau de diagnostic du défilement : affiché seulement avec ?diag=1 dans l'adresse.
// Il ne lit que l'état de la page (tailles, styles, éléments au centre de l'écran) : aucune donnée de l'entreprise.
const name = (el: Element | null): string => {
  if (!el) return 'null';
  const h = el as HTMLElement;
  return `${el.tagName.toLowerCase()}${h.id ? '#' + h.id : ''}.${String(h.className || '').toString().replace(/\s+/g, '.').slice(0, 60)}`;
};

export const DiagPanel: React.FC = () => {
  const [text, setText] = useState('…');
  const [open, setOpen] = useState(true);
  const events = useRef<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const se = () => (document.scrollingElement || document.documentElement) as HTMLElement;
    const log = (e: Event) => {
      const before = se().scrollTop;
      const k = e instanceof KeyboardEvent ? ` key=${e.key}` : e instanceof WheelEvent ? ` dy=${Math.round(e.deltaY)}` : '';
      const base = `${e.type}${k} cible=${name(e.target as Element)} annulable=${e.cancelable} annulé=${e.defaultPrevented}`;
      window.setTimeout(() => {
        events.current = [`${base} défilement ${Math.round(before)}→${Math.round(se().scrollTop)}`, ...events.current].slice(0, 8);
      }, 300);
    };
    const types = ['wheel', 'keydown', 'touchmove'];
    types.forEach(t => window.addEventListener(t, log, { passive: true, capture: true }));

    const build = () => {
      const vv = window.visualViewport;
      const s = se();
      const html = document.documentElement;
      const body = document.body;
      const cs = (el: Element) => getComputedStyle(el);
      const lines: string[] = [];
      lines.push(`écran ${innerWidth}x${innerHeight} ratio ${devicePixelRatio} zoom ${vv ? vv.scale.toFixed(2) : '?'} vue ${vv ? Math.round(vv.width) + 'x' + Math.round(vv.height) + ' décalage ' + Math.round(vv.offsetTop) + '/' + Math.round(vv.offsetLeft) : '?'}`);
      lines.push(`navigateur ${navigator.userAgent.slice(0, 110)}`);
      lines.push(`défilant=${s.tagName} haut=${Math.round(s.scrollTop)} total=${s.scrollHeight} visible=${s.clientHeight} scrollY=${Math.round(scrollY)}`);
      lines.push(`html style="${html.getAttribute('style') || ''}" overflow=${cs(html).overflowX}/${cs(html).overflowY} hauteur=${cs(html).height}`);
      lines.push(`body style="${body.getAttribute('style') || ''}" overflow=${cs(body).overflowX}/${cs(body).overflowY} position=${cs(body).position} hauteur=${cs(body).height}`);
      const lk = getLockInfo();
      lines.push(`verrou compteur=${lk.count} mode=${lk.mode}`);
      const pts: Array<[string, number, number]> = [['centre', innerWidth / 2, innerHeight / 2], ['droite', innerWidth - 40, innerHeight / 2], ['bas', innerWidth / 2, innerHeight - 30]];
      for (const [label, x, y] of pts) {
        const els = document.elementsFromPoint(x, y).slice(0, 7);
        lines.push(`— ${label}:`);
        els.forEach(el => {
          const c = cs(el);
          const flags = [c.position !== 'static' ? c.position : '', c.overflowY !== 'visible' ? 'oy=' + c.overflowY : '', c.pointerEvents === 'none' ? 'pe=none' : '', c.overscrollBehaviorY !== 'auto' ? 'ob=' + c.overscrollBehaviorY : '', c.touchAction !== 'auto' ? 'ta=' + c.touchAction : '', el.scrollHeight > el.clientHeight + 1 ? `sh=${el.scrollHeight}>${el.clientHeight}` : ''].filter(Boolean).join(' ');
          lines.push(`   ${name(el)} ${flags}`);
        });
      }
      lines.push('— événements récents (molette, clavier, doigt) :');
      lines.push(...(events.current.length ? events.current.map(l => '   ' + l) : ['   (rien : essayez de défiler)']));
      setText(lines.join('\n'));
    };
    build();
    const id = window.setInterval(build, 700);
    return () => { types.forEach(t => window.removeEventListener(t, log, { capture: true } as EventListenerOptions)); window.clearInterval(id); };
  }, []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* sélection manuelle possible */ }
  };

  return (
    <div className="fixed left-2 bottom-2 z-[99990] max-w-[min(96vw,44rem)] rounded-lg border border-amber-400 bg-black/90 text-[10px] leading-snug text-amber-100 shadow-2xl" style={{ fontFamily: 'ui-monospace, monospace' }}>
      <div className="flex items-center gap-2 px-2 py-1 border-b border-amber-400/50">
        <b className="flex-1">Diagnostic du défilement</b>
        <button type="button" onClick={copy} className="px-2 py-0.5 rounded bg-amber-500 text-black font-bold cursor-pointer">{copied ? 'Copié' : 'Copier'}</button>
        <button type="button" onClick={() => setOpen(o => !o)} className="px-2 py-0.5 rounded bg-slate-700 cursor-pointer">{open ? 'Réduire' : 'Ouvrir'}</button>
      </div>
      {open && <pre className="m-0 px-2 py-1 whitespace-pre-wrap break-all max-h-[45vh] overflow-y-auto select-text" style={{ userSelect: 'text' }}>{text}</pre>}
    </div>
  );
};
