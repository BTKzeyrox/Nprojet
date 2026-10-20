"""Essai du filet de sécurité du défilement dans un vrai Chromium (Playwright, Python).
Prérequis : npm run build, puis servir dist sur le port 4173 (python3 -m http.server 4173 --directory dist). Lancer : python3 scripts/browser/check-scroll-rescue.py
Cas : page saine (le filet ne fait rien), page bloquée (il répare : molette, clavier), menu fixe / fenêtre ouverte / champ de saisie (il ne touche à rien).
"""
import re, json
from playwright.sync_api import sync_playwright

def diag_count(page):
    t = page.evaluate("()=>Array.from(document.querySelectorAll('pre')).map(p=>p.innerText).join('\\n')")
    m = re.search(r'intervenu (\d+) fois', t); return int(m.group(1)) if m else None

BREAK = "document.documentElement.style.setProperty('overflow','hidden','important');document.body.style.setProperty('overflow','hidden','important')"
def new(p, w, h, touch=False):
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': w, 'height': h}, has_touch=touch, is_mobile=False)
    pg = ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:100]))
    pg.goto('http://localhost:4173/?demo=admin&diag=1', wait_until='networkidle'); pg.wait_for_timeout(1500)
    return b, ctx, pg, errs
ok = lambda c: 'OK  ' if c else 'ECHEC'
res = []
with sync_playwright() as p:
    # A. page saine : le filet ne doit rien faire
    b, ctx, pg, errs = new(p, 1366, 768)
    pg.mouse.move(800, 400)
    for _ in range(3): pg.mouse.wheel(0, 120); pg.wait_for_timeout(40)
    pg.wait_for_timeout(500); y = pg.evaluate('scrollY')
    pg.keyboard.press('PageDown'); pg.wait_for_timeout(500); y2 = pg.evaluate('scrollY')
    pg.keyboard.press('End'); pg.wait_for_timeout(600); y3 = pg.evaluate('scrollY'); mx = pg.evaluate('document.scrollingElement.scrollHeight-innerHeight')
    pg.keyboard.press('Home'); pg.wait_for_timeout(600); y4 = pg.evaluate('scrollY'); pg.wait_for_timeout(300)
    c = diag_count(pg)
    print(f"{ok(c==0 and abs(y-360)<2 and y3==mx and y4==0)} A. page saine : molette={y} (attendu 360), PageDown={y2}, End={y3}/{mx}, Home={y4}, interventions={c} (attendu 0), erreurs={errs}")
    b.close()

    # B. page bloquée (overflow hidden resté par erreur) : le filet doit réparer
    b, ctx, pg, errs = new(p, 1366, 768)
    pg.evaluate(BREAK); pg.wait_for_timeout(200)
    pg.mouse.move(800, 400); pg.mouse.wheel(0, 300); pg.wait_for_timeout(500); yw = pg.evaluate('scrollY')
    pg.keyboard.press('PageDown'); pg.wait_for_timeout(500); yk = pg.evaluate('scrollY')
    pg.keyboard.press('End'); pg.wait_for_timeout(500); ye = pg.evaluate('scrollY'); mx = pg.evaluate('document.scrollingElement.scrollHeight-innerHeight')
    pg.keyboard.press('Home'); pg.wait_for_timeout(500); yh = pg.evaluate('scrollY'); pg.wait_for_timeout(300)
    c = diag_count(pg)
    print(f"{ok(abs(yw-300)<2 and yk>yw and ye==mx and yh==0 and c>0)} B. page bloquée : molette→{yw} (attendu 300), PageDown→{yk}, End→{ye}/{mx}, Home→{yh}, interventions={c} (attendu >0), erreurs={errs}")
    # C. zone à ne pas toucher : au-dessus du menu de gauche (fixe) la page ne doit pas bouger
    pg.evaluate('window.scrollTo(0,0)'); pg.mouse.move(120, 400)
    for _ in range(3): pg.mouse.wheel(0, 400); pg.wait_for_timeout(200)
    pg.wait_for_timeout(300); ys = pg.evaluate('scrollY')
    print(f"{ok(ys==0)} C. molette sur le menu de gauche (page bloquée) : page={ys} (attendu 0, le menu défile seul)")
    # C2. champ de saisie : les flèches et la barre d'espace ne doivent pas faire défiler la page
    pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(200)
    pg.evaluate("(()=>{const i=document.createElement('input');i.id='tst';document.querySelector('main').prepend(i);i.focus()})()")
    pg.keyboard.press('ArrowDown'); pg.keyboard.press(' '); pg.keyboard.press('PageDown'); pg.wait_for_timeout(500)
    print(f"{ok(pg.evaluate('scrollY')==0)} C2. frappe dans un champ : page={pg.evaluate('scrollY')} (attendu 0)")
    b.close()

    # D. fenêtre ouverte : la page derrière reste figée même bloquée
    b, ctx, pg, errs = new(p, 1366, 768)
    pg.evaluate("Array.from(document.querySelectorAll('aside.df-sb nav button')).find(b=>b.innerText.includes('Réglages')).click()"); pg.wait_for_timeout(900)
    pg.evaluate(BREAK); pg.evaluate('window.scrollTo(0,0)')
    pg.evaluate("document.body.insertAdjacentHTML('beforeend','<div role=\"dialog\" id=\"dlg\" style=\"position:fixed;inset:80px;background:#fff;z-index:99999\">fenêtre</div>')")
    pg.mouse.move(600, 300); pg.mouse.wheel(0, 400); pg.wait_for_timeout(500)
    print(f"{ok(pg.evaluate('scrollY')==0)} D. molette sur une fenêtre ouverte : page={pg.evaluate('scrollY')} (attendu 0)")
    b.close()

    # E. doigt sur tablette (écran tactile), page bloquée puis saine
    for label, broken in (('saine', False), ('bloquée', True)):
        b, ctx, pg, errs = new(p, 1024, 700, touch=True)
        if broken: pg.evaluate(BREAK)
        cdp = ctx.new_cdp_session(pg)
        def swipe(x, y0, y1, steps=8):
            cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y0}]})
            for i in range(1, steps+1):
                cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x,'y':y0+(y1-y0)*i/steps}]}); pg.wait_for_timeout(16)
            cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
        swipe(700, 500, 150); pg.wait_for_timeout(900)
        y = pg.evaluate('scrollY'); c = diag_count(pg)
        print(f"{ok(y>150 and (c==0 if not broken else c>0))} E. doigt, page {label} : défilement={y} (attendu >150), interventions={c} ({'0 attendu' if not broken else '>0 attendu'}), erreurs={errs}")
        b.close()
