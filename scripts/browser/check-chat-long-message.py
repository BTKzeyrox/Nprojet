"""Un très long message ne doit pas gonfler la ligne de conversation (la règle globale « Mots jamais coupés » désactive la classe truncate).
Mêmes prérequis que check-scroll-rescue.py. Attendu : toutes les hauteurs de ligne de liste égales (70), aucune bulle au-delà de l'écran, aucun débordement horizontal."""
import sys
from playwright.sync_api import sync_playwright
LONG = ("écran 1280x680 ratio 1.5 zoom 1.00 navigateur Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 html style=\"font-size: 100%; --sbw: 19rem;\" overflow=hidden/auto div.flex.items-center.gap-2.px-2.py-1.border-b.border-amber-400/ ") * 4
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for W,H in ((390,800),(1280,680)):
        pg = b.new_context(viewport={'width':W,'height':H}, has_touch=(W<500), is_mobile=(W<500)).new_page()
        pg.goto('http://localhost:4173/?demo=admin', wait_until='networkidle'); pg.wait_for_timeout(1200)
        # ouvrir la messagerie (menu bas sur téléphone, menu de gauche sinon)
        pg.evaluate("""()=>{const bs=Array.from(document.querySelectorAll('button,a')).filter(b=>/Messagerie/i.test(b.innerText||b.getAttribute('aria-label')||b.title||'')); (bs[0]||{}).click&&bs[0].click()}"""); pg.wait_for_timeout(1000)
        pg.evaluate("""()=>{const r=Array.from(document.querySelectorAll('button')).find(b=>b.className.includes('border-l-4')&&/Groupe général/.test(b.innerText)); r&&r.click()}"""); pg.wait_for_timeout(800)
        inp = pg.locator('input[placeholder^="Écrire un message"]:visible').first
        inp.fill(LONG); pg.keyboard.press('Enter'); pg.wait_for_timeout(900)
        bub = pg.evaluate("""()=>Array.from(document.querySelectorAll('p,span,div')).filter(e=>e.childElementCount===0&&e.innerText&&e.innerText.includes('écran 1280x680')).map(e=>({w:Math.round(e.getBoundingClientRect().width),right:Math.round(e.getBoundingClientRect().right),h:Math.round(e.getBoundingClientRect().height)}))""")
        ov = pg.evaluate("({sw:document.scrollingElement.scrollWidth, cw:document.scrollingElement.clientWidth})")
        # retour à la liste (téléphone) pour voir la ligne
        pg.evaluate("""()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>/retour|back|liste/i.test((b.getAttribute('aria-label')||b.title||'')));b&&b.click()}"""); pg.wait_for_timeout(500)
        rows = pg.evaluate("""()=>Array.from(document.querySelectorAll('button')).filter(b=>b.className.includes('border-l-4')).map(b=>Math.round(b.getBoundingClientRect().height))""")
        print(f"{W}x{H} bulles={bub} débordement={ov} hauteurs des lignes de liste={rows}")
        pg.screenshot(path=f'/tmp/pw/chatfix_{W}.png')
    b.close()
