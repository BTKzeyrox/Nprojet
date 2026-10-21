"""Mesure de la fluidité du défilement (molette continue) : défilement normal contre filet de sécurité, avec et sans processeur ralenti 4 fois.
Mêmes prérequis que check-scroll-rescue.py. Ce n est pas un essai réussite/échec : il affiche, pour chaque cas, la distance parcourue, le délai du 1er mouvement, le plus grand saut et les images lentes.
"""
import statistics as st
from playwright.sync_api import sync_playwright
BREAK="document.documentElement.style.setProperty('overflow','hidden','important');document.body.style.setProperty('overflow','hidden','important');window.scrollTo(0,0)"
REC = """() => { window.__done=false; const fr=[], ys=[]; let last=performance.now();
  function f(t){ fr.push(t-last); last=t; ys.push(scrollY); if(fr.length<170) requestAnimationFrame(f); else {window.__r={fr,ys}; window.__done=true;} }
  requestAnimationFrame(f); }"""
def gesture(pg):
    pg.evaluate(REC)
    for i in range(40):
        pg.mouse.wheel(0, 40); pg.wait_for_timeout(22)
    pg.wait_for_function('window.__done===true', timeout=20000); r = pg.evaluate('window.__r'); return r['fr'], r['ys']
def report(label, fr, ys):
    moves=[ys[i+1]-ys[i] for i in range(len(ys)-1)]; act=[m for m in moves if m>0]
    first = next((i for i,m in enumerate(moves) if m>0), -1)
    worst = sorted(range(len(fr)), key=lambda i:-fr[i])[:3]
    print(f"{label:34s} total={ys[-1]-ys[0]:.0f}/1600px | 1er mouvement à l'image {first} (~{first*16.6:.0f} ms) | images avec mouvement={len(act)} | plus grand saut={max(moves):.0f}px | image moyenne={st.mean(fr):.1f} ms | pires={[round(fr[i]) for i in worst]} ms")
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for cpu in (1, 4):
        for broken in (False, True):
            ctx = b.new_context(viewport={'width':1920,'height':1080}); pg = ctx.new_page()
            pg.goto('http://localhost:4173/?demo=admin', wait_until='networkidle'); pg.wait_for_timeout(1200)
            pg.evaluate("Array.from(document.querySelectorAll('aside.df-sb nav button')).find(b=>b.innerText.includes('Tableau')).click()"); pg.wait_for_timeout(900)
            cdp = ctx.new_cdp_session(pg)
            if cpu>1: cdp.send('Emulation.setCPUThrottlingRate', {'rate': cpu})
            if broken: pg.evaluate(BREAK)
            pg.mouse.move(1000, 500)
            fr, ys = gesture(pg); report(f"{'RESCUE' if broken else 'NATIF '} 1er geste, cpu×{cpu}", fr, ys)
            pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(500)
            fr, ys = gesture(pg); report(f"{'RESCUE' if broken else 'NATIF '} 2e geste,  cpu×{cpu}", fr, ys)
            ctx.close()
    b.close()
