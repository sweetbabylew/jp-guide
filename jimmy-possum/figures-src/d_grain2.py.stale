from style import *
import math
w,h=900,520
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker><marker id="ahr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="40" text-anchor="middle" font-size="24" fill="{INK}" font-weight="bold">Reading a Riven Face: Radial vs. Tangential</text>'

# ---- TWO BLOCKS side by side: radial-faced vs tangential-faced ----
# Radial block (left): wide face shows STRAIGHT rings
bx,by,s=130,150,140
svg+=f'<text x="{bx+s/2}" y="{by-58}" text-anchor="middle" font-size="15" fill="{RED}" font-weight="bold">RADIAL face</text>'
svg+=f'<text x="{bx+s/2}" y="{by-42}" text-anchor="middle" font-size="12" fill="{INK2}">rings cross the face → straight lines</text>'
# front face
svg+=f'<polygon points="{bx},{by} {bx+s},{by} {bx+s},{by+s} {bx},{by+s}" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.5"/>'
for i in range(1,7):
    yy=by+i*s/7
    svg+=f'<line x1="{bx}" y1="{yy:.0f}" x2="{bx+s}" y2="{yy:.0f}" stroke="{WOOD_D}" stroke-width="2"/>'
# top (tangential) face — small, cathedral
d=40
svg+=f'<polygon points="{bx},{by} {bx+d},{by-d} {bx+s+d},{by-d} {bx+s},{by}" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
for i in range(1,4):
    yy=by-d+i*d/4
    svg+=f'<path d="M{bx+d} {yy+5} Q {bx+d+s/2} {yy-9} {bx+s+d} {yy+5}" fill="none" stroke="{WOOD_D}" stroke-width="1.1"/>'
# right side
svg+=f'<polygon points="{bx+s},{by} {bx+s+d},{by-d} {bx+s+d},{by+s-d} {bx+s},{by+s}" fill="{WOOD_D}" stroke="{INK}" stroke-width="2.5"/>'
svg+=f'<text x="{bx+s/2}" y="{by+s+26}" text-anchor="middle" font-size="11.5" fill="{INK2}">use this face wide on arms &amp; crest</text>'

# Tangential block (right): wide face shows CATHEDRALS
tx=570
svg+=f'<text x="{tx+s/2}" y="{by-58}" text-anchor="middle" font-size="15" fill="{INK}" font-weight="bold">TANGENTIAL face</text>'
svg+=f'<text x="{tx+s/2}" y="{by-42}" text-anchor="middle" font-size="12" fill="{INK2}">rings along the face → “cathedrals”</text>'
svg+=f'<polygon points="{tx},{by} {tx+s},{by} {tx+s},{by+s} {tx},{by+s}" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.5"/>'
for i in range(1,5):
    yy=by+8+i*s/5
    svg+=f'<path d="M{tx} {yy:.0f} Q {tx+s/2} {yy-26:.0f} {tx+s} {yy:.0f}" fill="none" stroke="{WOOD_D}" stroke-width="1.8"/>'
# top (radial) face
svg+=f'<polygon points="{tx},{by} {tx+d},{by-d} {tx+s+d},{by-d} {tx+s},{by}" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
for i in range(1,5):
    xx=tx+d+i*s/5
    svg+=f'<line x1="{xx:.0f}" y1="{by-d+3}" x2="{xx-d:.0f}" y2="{by-2}" stroke="{WOOD_D}" stroke-width="1.1"/>'
svg+=f'<polygon points="{tx+s},{by} {tx+s+d},{by-d} {tx+s+d},{by+s-d} {tx+s},{by+s}" fill="{WOOD_D}" stroke="{INK}" stroke-width="2.5"/>'

# divider
svg+=f'<line x1="{w/2}" y1="135" x2="{w/2}" y2="350" stroke="{RULE}" stroke-width="1" stroke-dasharray="3,5"/>'

# ---- bottom: downhill shaving ----
yb=400
svg+=f'<text x="{w/2}" y="{yb}" text-anchor="middle" font-size="16" fill="{INK}" font-weight="bold">Shave “downhill,” with the grain</text>'
def stick(x0,y0,flip,label,good):
    col=GREEN if good else RED
    out=f'<rect x="{x0}" y="{y0}" width="220" height="44" rx="6" fill="{WOOD}" stroke="{INK}" stroke-width="2"/>'
    for i in range(0,12):
        xx=x0+8+i*18
        if not flip: out+=f'<line x1="{xx}" y1="{y0+4}" x2="{xx+13}" y2="{y0+40}" stroke="{WOOD_D}" stroke-width="1.3"/>'
        else: out+=f'<line x1="{xx+13}" y1="{y0+4}" x2="{xx}" y2="{y0+40}" stroke="{WOOD_D}" stroke-width="1.3"/>'
    ay=y0+22
    mk='url(#ah)' if good else 'url(#ahr)'
    out+=f'<line x1="{x0+198}" y1="{ay}" x2="{x0+248}" y2="{ay}" stroke="{col}" stroke-width="3" marker-end="{mk}"/>'
    out+=f'<text x="{x0+110}" y="{y0+66}" text-anchor="middle" font-size="12.5" fill="{col}" font-weight="bold">{label}</text>'
    return out
svg+=stick(120,yb+18,False,"GOOD: blade follows fibers down (clean)",True)
svg+=stick(540,yb+18,True,"BAD: blade digs under fibers (tears)",False)
svg+='</svg>'
open('03_grain.svg','w').write(svg)
print("grain v2 ok")
