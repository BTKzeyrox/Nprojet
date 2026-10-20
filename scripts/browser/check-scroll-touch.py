"""Essai du doigt (événements tactiles bruts) sur une page bloquée. Mêmes prérequis que check-scroll-rescue.py."""
import re
from playwright.sync_api import sync_playwright
def cnt(pg):
    t = pg.evaluate("Array.from(document.querySelectorAll('pre')).map(p=>p.innerText).join('\\n')")
    m = re.search(r'intervenu (\d+) fois', t); return int(m.group(1)) if m else None
BREAK="document.documentElement.style.setProperty('overflow','hidden','important');document.body.style.setProperty('overflow','hidden','important');window.scrollTo(0,0)"
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for label, steps, gap, startx, starty in (('rapide (~100 ms)', 6, 16, 960, 560), ('lent (~600 ms)', 20, 30, 960, 560), ('sur le menu fixe', 8, 16, 100, 560)):
        ctx = b.new_context(viewport={'width':1024,'height':700}, has_touch=True)
        pg = ctx.new_page(); pg.goto('http://localhost:4173/?demo=admin&diag=1', wait_until='networkidle'); pg.wait_for_timeout(1500)
        pg.evaluate(BREAK); cdp = ctx.new_cdp_session(pg)
        cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':startx,'y':starty}]})
        for i in range(1, steps+1):
            cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':startx,'y':starty-(400/steps)*i}]}); pg.wait_for_timeout(gap)
        cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]}); pg.wait_for_timeout(1200)
        y = pg.evaluate('scrollY'); c = cnt(pg)
        want = (y < 5) if 'menu' in label else (250 <= y <= 420 and c > 0)
        print(('OK   ' if want else 'ECHEC'), f"doigt {label}, page bloquée : défilement={y} (attendu {'0' if 'menu' in label else '≈400'}), interventions={c}")
        ctx.close()
    b.close()
