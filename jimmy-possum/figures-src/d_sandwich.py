from style import *
import math
w,h=900,560
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="38" text-anchor="middle" font-size="24" fill="{INK}" font-weight="bold">Section 4 · “Sandwich” (Stack) Drilling the Arm</text>'
svg+=f'<text x="{w/2}" y="64" text-anchor="middle" font-size="13.5" fill="{INK2}" font-style="italic">Drill arm and seat in one pass so their holes line up perfectly at assembly</text>'

# A stack: workbench, then arm, seat, backrest clamped; bit passing through all at the back tilt
ox,oy=210,140
sw_=480
def slab(y,label,col,thick=34):
    s=f'<rect x="{ox}" y="{y}" width="{sw_}" height="{thick}" rx="5" fill="{col}" stroke="{INK}" stroke-width="2.5"/>'
    s+=f'<text x="{ox+sw_+12}" y="{y+thick/2+4}" font-size="13" fill="{INK}">{label}</text>'
    return s
# stack order top->down: backrest, arm, seat  (Schwarz stacks them; here show arm over seat for the JP)
svg+=slab(oy, "backrest", WOOD_L)
svg+=slab(oy+44, "arm", WOOD)
svg+=slab(oy+88, "seat", WOOD_D, 40)
# clamps (left + right) hugging the stack
for cxp in (ox+30, ox+sw_-46):
    svg+=f'<rect x="{cxp}" y="{oy-12}" width="16" height="{12+44+44+40+12}" rx="4" fill="none" stroke="{INK}" stroke-width="3"/>'
    svg+=f'<rect x="{cxp-6}" y="{oy-12}" width="28" height="10" rx="3" fill="{INK2}"/>'
    svg+=f'<rect x="{cxp-6}" y="{oy+88+40+2}" width="28" height="10" rx="3" fill="{INK2}"/>'
svg+=f'<text x="{ox+30+8}" y="{oy+88+40+30}" text-anchor="middle" font-size="11" fill="{INK2}">clamp</text>'

# bit drilling through all three at a back tilt (12-ish deg)
mx=ox+sw_*0.5
ang=math.radians(12)
topy=oy-62
topx=mx- math.tan(ang)*( (oy+88+40) - topy)
svg+=f'<line x1="{mx}" y1="{oy+88+40}" x2="{topx:.0f}" y2="{topy}" stroke="#8a8f94" stroke-width="6"/>'
# arrow showing drill going down
svg+=f'<line x1="{topx-20:.0f}" y1="{topy-30}" x2="{mx-6:.0f}" y2="{oy-2}" stroke="{INK}" stroke-width="2" stroke-dasharray="2,4" marker-end="url(#ah)"/>'
svg+=f'<text x="{topx:.0f}" y="{topy-10}" text-anchor="middle" font-size="12.5" fill="{INK}">brace &amp; bit (one bore, all layers)</text>'
# vertical ref + tilt arc
svg+=f'<line x1="{mx}" y1="{oy+88+40}" x2="{mx}" y2="{oy-30}" stroke="{INK2}" stroke-width="1" stroke-dasharray="2,3"/>'
svg+=f'<path d="M{mx} {oy-10} A 60 60 0 0 0 {mx-math.sin(ang)*60:.0f} {oy-10-math.cos(ang)*60+60:.0f}" fill="none" stroke="{RED}" stroke-width="1.4"/>'
svg+=f'<text x="{mx-44}" y="{oy-40}" font-size="12.5" fill="{RED}" font-weight="bold">back tilt (set by bevel)</text>'
# bench below
svg+=f'<rect x="{ox-40}" y="{oy+88+40+18}" width="{sw_+120}" height="26" fill="{WOOD_D}" stroke="{INK}" stroke-width="2"/>'
svg+=f'<text x="{ox+sw_+12}" y="{oy+88+40+36}" font-size="12" fill="{INK2}">bench (back hangs off edge)</text>'

# right note: rise-and-run / shift back
svg+=f'<text x="{w/2}" y="{h-78}" text-anchor="middle" font-size="14" fill="{INK}" font-weight="bold">Then account for the rise &amp; run</text>'
svg+=f'<text x="{w/2}" y="{h-56}" text-anchor="middle" font-size="12.5" fill="{INK2}">A back-leaning stick travels rearward as it climbs. With the arm at sitting height, the stick&#39;s top</text>'
svg+=f'<text x="{w/2}" y="{h-38}" text-anchor="middle" font-size="12.5" fill="{INK2}">sits a measured distance behind the seat hole — so slide the arm back that much before drilling it.</text>'
svg+=f'<text x="{w/2}" y="{h-14}" text-anchor="middle" font-size="11" fill="{INK2}" font-style="italic">Idea credited to “Rudy”: stack the parts and drill them all at once. (Schwarz, The American Peasant) · cf. Lewis&#39;s “sandwich drill the outer spindles.”</text>'
svg+='</svg>'
open('08_sandwich_drill.svg','w').write(svg)
print("08 ok")
