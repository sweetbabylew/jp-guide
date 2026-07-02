from style import *
import math
w,h=900,600
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker><marker id="ahr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="40" text-anchor="middle" font-size="25" fill="{INK}" font-weight="bold">Section 2 · Reading the Grain: Radial &amp; Tangential Faces</text>'

# LEFT: log cross-section showing where a billet comes from + ray/tangential planes
cx,cy,R=230,260,150
svg+=f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="{WOOD_D}" stroke="{INK}" stroke-width="3"/>'
svg+=f'<circle cx="{cx}" cy="{cy}" r="{R-12}" fill="{WOOD}" stroke="{INK2}"/>'
for rr in range(26,R-12,24):
    svg+=f'<circle cx="{cx}" cy="{cy}" r="{rr}" fill="none" stroke="{WOOD_D}" stroke-width="1" opacity="0.55"/>'
svg+=f'<circle cx="{cx}" cy="{cy}" r="5" fill="{INK}"/>'
svg+=f'<text x="{cx+10}" y="{cy+4}" font-size="12" fill="{INK}">pith</text>'
# a billet square positioned in upper-right quadrant, oriented radially
bx,by,bs=cx+30,cy-118,64
# draw rotated square representing billet with radial face pointing to pith
svg+=f'<g transform="rotate(38 {bx+bs/2} {by+bs/2})">'
svg+=f'<rect x="{bx}" y="{by}" width="{bs}" height="{bs}" fill="{WOOD_L}" stroke="{RED}" stroke-width="2.5"/>'
svg+=f'</g>'
# ray line from pith through billet
svg+=f'<line x1="{cx}" y1="{cy}" x2="{cx+118}" y2="{cy-118}" stroke="{RAY}" stroke-width="2.5" stroke-dasharray="2,4"/>'
svg+=f'<text x="{cx+92}" y="{cy-96}" font-size="12" fill="{RAY}" transform="rotate(-45 {cx+92} {cy-96})">medullary ray</text>'
svg+=f'<text x="{cx}" y="{cy+R+26}" text-anchor="middle" font-size="13.5" fill="{INK2}">A chair part&#39;s wide face should be <tspan fill="{RED}" font-weight="bold">radial</tspan> —</text>'
svg+=f'<text x="{cx}" y="{cy+R+44}" text-anchor="middle" font-size="13.5" fill="{INK2}">aligned on the ray, pointing at the pith.</text>'

# RIGHT: a single billet block, faces labelled radial vs tangential
ox,oy=600,180
# isometric-ish block
s=120
# front face (radial)
svg+=f'<polygon points="{ox},{oy} {ox+s},{oy} {ox+s},{oy+s} {ox},{oy+s}" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.5"/>'
# growth ring lines on radial face = straight parallel lines
for i in range(1,6):
    svg+=f'<line x1="{ox}" y1="{oy+i*s/6}" x2="{ox+s}" y2="{oy+i*s/6}" stroke="{WOOD_D}" stroke-width="1.4"/>'
svg+=f'<text x="{ox+s/2}" y="{oy+s+22}" text-anchor="middle" font-size="13" fill="{RED}" font-weight="bold">radial face</text>'
svg+=f'<text x="{ox+s/2}" y="{oy+s+40}" text-anchor="middle" font-size="11.5" fill="{INK2}">rings cross the face (straight lines)</text>'
# top face (tangential) - parallelogram
d=44
svg+=f'<polygon points="{ox},{oy} {ox+d},{oy-d} {ox+s+d},{oy-d} {ox+s},{oy}" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
# cathedral arcs on tangential face
for i in range(1,4):
    yy=oy-d+ i*d/4
    svg+=f'<path d="M{ox+d} {yy+6} Q {ox+d+ s/2} {yy-10} {ox+s+d} {yy+6}" fill="none" stroke="{WOOD_D}" stroke-width="1.2"/>'
svg+=f'<text x="{ox+s/2+d}" y="{oy-d-10}" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">tangential face</text>'
svg+=f'<text x="{ox+s/2+d}" y="{oy-d-28}" text-anchor="middle" font-size="11.5" fill="{INK2}">rings along the face (cathedrals)</text>'
# right side face
svg+=f'<polygon points="{ox+s},{oy} {ox+s+d},{oy-d} {ox+s+d},{oy+s-d} {ox+s},{oy+s}" fill="{WOOD_D}" stroke="{INK}" stroke-width="2.5"/>'

# Bottom: grain run / downhill shaving principle
yb=470
svg+=f'<text x="{w/2}" y="{yb}" text-anchor="middle" font-size="15" fill="{INK}" font-weight="bold">Always shave “downhill” — with the grain</text>'
# two sticks
def stick(x0,y0,flip,label,good):
    col = GREEN if good else RED
    s=svg_local=[]
    out=f'<rect x="{x0}" y="{y0}" width="220" height="46" rx="6" fill="{WOOD}" stroke="{INK}" stroke-width="2"/>'
    # diagonal grain lines (runout)
    for i in range(0,12):
        xx=x0+8+i*18
        if not flip:
            out+=f'<line x1="{xx}" y1="{y0+4}" x2="{xx+14}" y2="{y0+42}" stroke="{WOOD_D}" stroke-width="1.3"/>'
        else:
            out+=f'<line x1="{xx+14}" y1="{y0+4}" x2="{xx}" y2="{y0+42}" stroke="{WOOD_D}" stroke-width="1.3"/>'
    # drawknife direction arrow
    ay=y0+23
    if good:
        out+=f'<line x1="{x0+200}" y1="{ay}" x2="{x0+250}" y2="{ay}" stroke="{col}" stroke-width="3" marker-end="url(#ah)"/>'
    else:
        out+=f'<line x1="{x0+200}" y1="{ay}" x2="{x0+250}" y2="{ay}" stroke="{col}" stroke-width="3" marker-end="url(#ahr)"/>'
    out+=f'<text x="{x0+110}" y="{y0+72}" text-anchor="middle" font-size="12.5" fill="{col}" font-weight="bold">{label}</text>'
    return out
svg+=stick(120,yb+24,False,"GOOD: blade follows fibers down (clean)",True)
svg+=stick(540,yb+24,True,"BAD: blade digs under fibers (tears)",False)
svg+=f'<text x="{w/2}" y="{h-14}" text-anchor="middle" font-size="12" fill="{INK2}" font-style="italic">Skewing the drawknife lowers the cutting angle and rides more blade on the wood, helping you cut a flat, clean face. (Alexander)</text>'
svg+='</svg>'
open('03_grain.svg','w').write(svg)
print("03 ok")
