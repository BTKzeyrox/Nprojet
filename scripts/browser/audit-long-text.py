"""Audit : remplace le texte des zones « truncate » de chaque page (démo admin et opérateur, 1280 et 390 px) par un long texte et signale un débordement horizontal ou une ligne qui explose.
Mêmes prérequis que check-scroll-rescue.py. Les cases de chiffres clés (montants) signalées sont normales : on n'y met pas de texte."""
import sys, json
from playwright.sync_api import sync_playwright
LONGTXT = ("Texte assez long avec plusieurs mots pour tester le retour à la ligne dans une liste ou une carte de la page. " * 2) + "IDENTIFIANTSANSESPACE0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
JS = """(LONG)=>{
  const vw=document.documentElement.clientWidth;
  const sel='.truncate, [class*="line-clamp"]';
  const els = Array.from(document.querySelectorAll(sel)).filter(e=>!e.closest('aside, nav, header, .fixed, [role=dialog]') && e.childElementCount===0 && e.getBoundingClientRect().width>0 && (e.textContent||'').trim().length>0);
  const sig=new Set(); const out=[];
  els.forEach(e=>{
    const key=String(e.className).slice(0,70)+'|'+(e.closest('button,li,tr,article,[class*="rounded-2xl"],[class*="rounded-xl"]')||{className:''}).className.slice(0,40);
    if(sig.has(key)) return; sig.add(key);
    const row=e.closest('button,li,tr,article,[class*="rounded-2xl"],[class*="rounded-xl"]')||e.parentElement;
    const rh0=row.getBoundingClientRect().height; const old=e.textContent;
    e.textContent=LONG;
    const rh1=row.getBoundingClientRect().height; const r=e.getBoundingClientRect(); const sw=document.scrollingElement.scrollWidth;
    const overflowX = r.right>vw+2 || sw>vw+2;
    const explodes = rh1>rh0*2.5 && rh1>220;
    if(overflowX||explodes) out.push({cls:String(e.className).slice(0,70), rowBefore:Math.round(rh0), rowAfter:Math.round(rh1), debordeDroite:overflowX});
    e.textContent=old;
  });
  return {tested:sig.size, bad:out};
}"""
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    for role in ('admin','employee'):
        ctx = b.new_context(viewport={'width':1280,'height':680}); pg = ctx.new_page()
        pg.goto(f'http://localhost:4173/?demo={role}', wait_until='networkidle'); pg.wait_for_timeout(1300)
        names = pg.evaluate("""()=>Array.from(document.querySelectorAll('aside.df-sb nav button')).map(b=>(b.innerText||b.title||b.getAttribute('aria-label')||'').trim().split('\\n')[0]).filter(Boolean)""")
        ctx.close()
        for W,H in ((1280,680),(390,800)):
            mob = W<500
            ctx = b.new_context(viewport={'width':W,'height':H}, has_touch=mob, is_mobile=mob); pg = ctx.new_page()
            pg.goto(f'http://localhost:4173/?demo={role}', wait_until='networkidle'); pg.wait_for_timeout(1300)
            tot=0; bad_all=[]
            for nm in dict.fromkeys(names):
                if nm.lower().startswith(('déconn','quitt')): continue
                found = pg.evaluate("""(nm)=>{const bs=Array.from(document.querySelectorAll('button')).filter(b=>((b.innerText||b.title||b.getAttribute('aria-label')||'').trim().split('\\n')[0])===nm); const b=bs[0]; if(!b) return false; b.click(); return true}""", nm)
                if not found: continue
                pg.wait_for_timeout(700)
                r = pg.evaluate(JS, LONGTXT); tot+=r['tested']
                for x in r['bad']: bad_all.append((nm,x))
            print(f"{role:8s} {W}px : {tot} types de zones de texte testés sur {len(names)} pages, {len(bad_all)} problème(s)")
            for nm,x in bad_all[:14]: print("   !!", f"[{nm}]", x)
            ctx.close()
    b.close()
