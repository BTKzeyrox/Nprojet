"""Contrôle de la police Poppins dans un vrai Chromium : chargée, appliquée à TOUS les textes (démo admin et opérateur), aucun débordement horizontal ni texte coupé à 1280 et 390 px.
Mêmes prérequis que check-scroll-rescue.py. Attendu : « n utilisent PAS Poppins : 0 » et 0 problème partout."""
from playwright.sync_api import sync_playwright
JS_OVER = """()=>{
  const vw=document.documentElement.clientWidth; const sw=document.scrollingElement.scrollWidth;
  const clipped=[]; 
  document.querySelectorAll('body *').forEach(e=>{
    if(e.closest('.fixed, aside, svg')) return;
    const c=getComputedStyle(e);
    if((c.overflowX==='hidden'||c.overflowX==='clip') && e.scrollWidth>e.clientWidth+2 && e.clientWidth>20 && (e.textContent||'').trim().length>0 && e.children.length===0)
      clipped.push(String(e.className).slice(0,50)+' « '+(e.textContent||'').trim().slice(0,24)+' »');
  });
  const wide=[]; document.querySelectorAll('main *').forEach(e=>{ if(e.closest('.fixed, svg, .overflow-x-auto, [class*=overflow-x]')) return; const r=e.getBoundingClientRect(); if(r.width>0 && r.right>vw+2) wide.push(String(e.className).slice(0,40)); });
  return {over: sw>vw+2, sw, vw, clipped: clipped.slice(0,5), nClipped: clipped.length, wide: wide.slice(0,3), nWide: wide.length};
}"""
with sync_playwright() as p:
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width':1280,'height':680}); pg = ctx.new_page()
    pg.goto('http://localhost:4173/?demo=admin', wait_until='networkidle'); pg.wait_for_timeout(1500)
    f = pg.evaluate("""async()=>{await document.fonts.ready; const loaded=[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.weight); const cs=e=>getComputedStyle(e).fontFamily.split(',')[0];
      return {loaded, body:cs(document.body), h:cs(document.querySelector('h1,h2,h3,.font-tactical')||document.body), mono:cs(document.querySelector('.font-mono')||document.body), check:document.fonts.check('600 16px Poppins'), splash:getComputedStyle(document.getElementById('df-splash')||document.body).fontFamily.split(',')[0]}}""")
    print("POLICE:", f)
    names = pg.evaluate("""()=>Array.from(document.querySelectorAll('aside.df-sb nav button')).map(b=>(b.innerText||b.title||b.getAttribute('aria-label')||'').trim().split('\\n')[0]).filter(Boolean)""")
    pg.screenshot(path='/tmp/pw/poppins_dash_1280.png'); ctx.close()
    for role in ('admin','employee'):
        for W,H in ((1280,680),(390,800)):
            mob=W<500; ctx=b.new_context(viewport={'width':W,'height':H}, has_touch=mob, is_mobile=mob); pg=ctx.new_page()
            pg.goto(f'http://localhost:4173/?demo={role}', wait_until='networkidle'); pg.wait_for_timeout(1300)
            ns = names if role=='admin' else pg.evaluate("""()=>Array.from(document.querySelectorAll('aside.df-sb nav button')).map(b=>(b.innerText||b.title||b.getAttribute('aria-label')||'').trim().split('\\n')[0]).filter(Boolean)""") or names
            rows=[]; tot_over=0
            for nm in dict.fromkeys(ns):
                if nm.lower().startswith(('déconn','quitt')): continue
                ok=pg.evaluate("""(nm)=>{const b=Array.from(document.querySelectorAll('button')).find(b=>((b.innerText||b.title||b.getAttribute('aria-label')||'').trim().split('\\n')[0])===nm); if(!b) return false; b.click(); return true}""", nm)
                if not ok: continue
                pg.wait_for_timeout(650); r=pg.evaluate(JS_OVER)
                if r['over'] or r['nWide'] or r['nClipped']: rows.append((nm,r))
                tot_over += 1 if r['over'] else 0
            print(f"{role:8s} {W}px : {len(list(dict.fromkeys(ns)))} pages, pages avec débordement horizontal={tot_over}, pages avec texte coupé ou élément hors écran={len(rows)}")
            for nm,r in rows[:6]: print("    ", nm, {k:r[k] for k in ('over','nClipped','clipped','nWide','wide')})
            ctx.close()
    b.close()
