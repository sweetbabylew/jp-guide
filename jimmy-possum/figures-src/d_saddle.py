from style import *
import math
w,h=900,540
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="38" text-anchor="middle" font-size="24" fill="{INK}" font-weight="bold">Extras · Saddling (Carving) the Seat</text>'
svg+=f'<text x="{w/2}" y="64" text-anchor="middle" font-size="13.5" fill="{INK2}" font-style="italic">Optional on a Jimmy Possum — hollow the seat for comfort</text>'

# LEFT: seat plan with carved hollow + tool zones
sx,sy,sw,sh=80,110,330,250
svg+=f'<rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="20" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.5"/>'
svg+=f'<text x="{sx+sw/2}" y="{sy-10}" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">Plan — contour lines of the hollow</text>'
# contour lines of the hollow — deepest point sits AFT of center (under the sitter),
# so each smaller ring's center shifts toward the back (bottom of the plan)
import math
for i,rr in enumerate([95,72,48,26]):
    op=0.8-i*0.12
    svg+=f'<ellipse cx="{sx+sw/2}" cy="{sy+sh*(0.55+i*0.04):.1f}" rx="{rr}" ry="{rr*0.7}" fill="none" stroke="{RAY}" stroke-width="1.4" opacity="{op}"/>'
# deepest point marker (center of the innermost ring)
dpx,dpy=sx+sw/2, sy+sh*0.67
svg+=f'<circle cx="{dpx}" cy="{dpy:.1f}" r="3.5" fill="{RED}"/>'
svg+=f'<line x1="{dpx+55}" y1="{dpy+45:.1f}" x2="{dpx+6}" y2="{dpy+5:.1f}" stroke="{RED}" stroke-width="1"/>'
svg+=f'<text x="{dpx+78}" y="{dpy+55:.1f}" text-anchor="middle" font-size="10.5" fill="{RED}">deepest point — aft of center</text>'
# spine ridge down the middle (pommel/center)
svg+=f'<line x1="{sx+sw/2}" y1="{sy+30}" x2="{sx+sw/2}" y2="{sy+sh-20}" stroke="{INK2}" stroke-width="1" stroke-dasharray="3,4"/>'
svg+=f'<text x="{sx+sw/2}" y="{sy+sh-6}" text-anchor="middle" font-size="10.5" fill="{INK2}">centerline</text>'
svg+=f'<text x="{sx+sw/2}" y="{sy+24}" text-anchor="middle" font-size="10.5" fill="{INK2}">front edge</text>'

# RIGHT: section through seat showing the dished profile + adze/scorp/travisher sequence
ox,oy=470,150
topW=350
# uncarved blank outline (faint)
svg+=f'<rect x="{ox}" y="{oy}" width="{topW}" height="56" fill="none" stroke="{INK2}" stroke-width="1" stroke-dasharray="4,4"/>'
# carved dished profile (a scooped curve)
svg+=f'<path d="M{ox} {oy} L {ox+30} {oy} Q {ox+topW/2} {oy+58} {ox+topW-30} {oy} L {ox+topW} {oy} L {ox+topW} {oy+56} L {ox} {oy+56} Z" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
svg+=f'<text x="{ox+topW/2}" y="{oy+86}" text-anchor="middle" font-size="12" fill="{INK2}">seat in section — the scooped “saddle”</text>'

# tool sequence rows, each with a small silhouette of the tool
STEEL="#8a8f94"
def sil_adze(mx,my):
    # short handle with a curved blade hooking down off the head
    s=f'<line x1="{mx-20}" y1="{my+14}" x2="{mx+12}" y2="{my-8}" stroke="{WOOD_D}" stroke-width="5" stroke-linecap="round"/>'
    s+=f'<path d="M{mx+6} {my-14} Q {mx+24} {my-12} {mx+20} {my+12} L {mx+15} {my+10} Q {mx+16} {my-4} {mx+4} {my-6} Z" fill="{STEEL}" stroke="{INK}" stroke-width="1.2"/>'
    return s
def sil_scorp(mx,my):
    # U-shaped blade, a handle rising from each end
    s=f'<path d="M{mx-14} {my-6} A 14 14 0 0 0 {mx+14} {my-6}" fill="none" stroke="{STEEL}" stroke-width="4"/>'
    s+=f'<line x1="{mx-14}" y1="{my-6}" x2="{mx-23}" y2="{my-15}" stroke="{WOOD_D}" stroke-width="5" stroke-linecap="round"/>'
    s+=f'<line x1="{mx+14}" y1="{my-6}" x2="{mx+23}" y2="{my-15}" stroke="{WOOD_D}" stroke-width="5" stroke-linecap="round"/>'
    return s
def sil_travisher(mx,my):
    # winged wooden body, curved blade proud beneath the middle
    s=f'<path d="M{mx-24} {my+4} Q {mx} {my-16} {mx+24} {my+4} Q {mx} {my-2} {mx-24} {my+4} Z" fill="{WOOD_D}" stroke="{INK}" stroke-width="1.2"/>'
    s+=f'<path d="M{mx-11} {my+3} Q {mx} {my+11} {mx+11} {my+3}" fill="none" stroke="{STEEL}" stroke-width="3"/>'
    return s
def sil_scraper(mx,my):
    # thin steel card, gently flexed
    s=f'<path d="M{mx-15} {my-9} Q {mx} {my-14} {mx+15} {my-9} L {mx+15} {my+11} Q {mx} {my+6} {mx-15} {my+11} Z" fill="{STEEL}" stroke="{INK}" stroke-width="1.2"/>'
    return s
ty=oy+150
tools=[("1 · Adze / gouge","hog out the bulk fast",sil_adze),
       ("2 · Inshave / scorp","refine the hollow",sil_scorp),
       ("3 · Travisher","smooth the surface",sil_travisher),
       ("4 · Scraper","final clean-up",sil_scraper)]
for i,(t,d,sil) in enumerate(tools):
    byp=ty + i*52
    svg+=f'<rect x="{ox}" y="{byp}" width="345" height="46" rx="8" fill="{PAPER}" stroke="{INK2}" stroke-width="1.5"/>'
    svg+=sil(ox+36, byp+23)
    svg+=f'<text x="{ox+74}" y="{byp+20}" font-size="13" fill="{INK}" font-weight="bold">{t}</text>'
    svg+=f'<text x="{ox+74}" y="{byp+37}" font-size="11" fill="{INK2}">{d}</text>'
svg+=f'<text x="{ox+172}" y="{ty-8}" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">Coarse → fine</text>'

# left bottom note
svg+=f'<text x="{sx+sw/2}" y="{sy+sh+34}" text-anchor="middle" font-size="12" fill="{INK2}">Carve across the grain to hog out, then with it to smooth.</text>'
svg+=f'<text x="{sx+sw/2}" y="{sy+sh+52}" text-anchor="middle" font-size="12" fill="{INK2}">Keep the deepest point under the sitter — about a thumb&#39;s depth.</text>'

svg+=f'<text x="{w/2}" y="{h-12}" text-anchor="middle" font-size="11" fill="{INK2}" font-style="italic">Historically JP chairs were left flat; saddling is your option. Work green wood with a dry seat blank to avoid splits.</text>'
svg+='</svg>'
open('10_saddle.svg','w').write(svg)
print("10 ok")
