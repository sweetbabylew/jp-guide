from style import *
import math

# ---- DIAGRAM 17: Quarter log, side view — split off the juvenile wood near the pith ----
w,h=1000,430
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="36" text-anchor="middle" font-size="24" fill="{INK}" font-weight="bold">Split Off the Juvenile Wood</text>'
svg+=f'<text x="{w/2}" y="60" text-anchor="middle" font-size="13" fill="{INK2}" font-style="italic">Quarter log, side view — quarter each half, then get rid of the juvenile wood near the pith before splitting any further</text>'

# quarter lying on its bark: pith along the TOP edge, bark along the BOTTOM
LX,RX = 175,945          # log ends
TY,BY = 180,330          # top (pith) and bottom (underside of bark)

def wavepts(x1,x2,y,amp,wl,ph,step=10):
    pts=[]; n=int((x2-x1)/step)
    for i in range(n+1):
        x=x1+i*step
        yy=y+amp*math.sin((x-x1)/wl*6.283+ph)+0.45*amp*math.sin((x-x1)/(wl*0.41)*6.283+ph*1.9)
        pts.append((x,yy))
    return pts
def poly(pts,stroke,wd,op=1.0,dash=None):
    d=f' stroke-dasharray="{dash}"' if dash else ''
    s=' '.join(f"{x:.0f},{y:.1f}" for x,y in pts)
    return f'<polyline points="{s}" fill="none" stroke="{stroke}" stroke-width="{wd}" opacity="{op}"{d} stroke-linejoin="round" stroke-linecap="round"/>'

# body: the TOP edge itself follows the pith&#39;s wiggle (no straight line fighting it)
toppts=wavepts(LX,RX,181,2.2,90,0.7,step=8)
tp=' '.join(f"L{x:.0f},{y:.1f}" for x,y in toppts)
svg+=f'<path d="M{LX},{BY} L{LX},{toppts[0][1]:.1f} {tp} L{RX},{BY} Z" fill="{WOOD}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>'

# sapwood band + bark along the bottom edge
svg+=f'<rect x="{LX+1}" y="293" width="{RX-LX-2}" height="20" fill="{WOOD_L}"/>'
svg+=f'<line x1="{LX+2}" y1="293" x2="{RX-2}" y2="293" stroke="{WOOD_D}" stroke-width="1" opacity="0.8"/>'
svg+=f'<line x1="{LX+4}" y1="303" x2="{RX-4}" y2="303" stroke="{INK2}" stroke-width="0.8" opacity="0.25"/>'
svg+=f'<rect x="{LX+1}" y="313" width="{RX-LX-2}" height="17" fill="#6b4f33"/>'
# rough underside of the bark
bump=''.join(f'q10,6 20,0 ' for _ in range((RX-LX)//20))
svg+=f'<path d="M{LX+1},{BY} {bump}" fill="#6b4f33" stroke="{INK}" stroke-width="1.6"/>'
for x in range(LX+12,RX-8,23):
    svg+=f'<line x1="{x}" y1="316" x2="{x+3}" y2="328" stroke="{INK}" stroke-width="1" opacity="0.35"/>'

# HEARTWOOD: straight, even grain lines (the 254 line is gapped for the label)
for y in (210,221,232,243,265,276,287):
    svg+=f'<line x1="{LX+6}" y1="{y}" x2="{RX-12}" y2="{y}" stroke="{INK2}" stroke-width="0.9" opacity="0.3"/>'
svg+=f'<line x1="{LX+6}" y1="254" x2="455" y2="254" stroke="{INK2}" stroke-width="0.9" opacity="0.3"/>'
svg+=f'<line x1="745" y1="254" x2="{RX-12}" y2="254" stroke="{INK2}" stroke-width="0.9" opacity="0.3"/>'
svg+=f'<text x="600" y="258" text-anchor="middle" font-size="13" fill="{INK}">heartwood — straight, even grain</text>'

# JUVENILE WOOD: top ~15% — slightly wavy grain, inconsistent ring widths
for (y,amp,wl,ph) in [(186.5,1.4,150,0.3),(192,2.4,105,1.7),(203,1.3,130,5.1)]:
    svg+=poly(wavepts(LX+5,RX-8,y,amp,wl,ph),RAY,1.0,0.6)
ring=wavepts(LX+5,RX-8,196.5,1.9,180,3.9)        # the ring the wedge is driven into
svg+=poly(ring,RAY,1.0,0.6)

# end caps (end grain)
for ex in (LX+1,RX-13):
    svg+=f'<rect x="{ex}" y="186" width="12" height="{BY-186-3}" fill="{WOOD_D}" stroke="{INK2}" stroke-width="0.8" opacity="0.9"/>'
    for yy in range(198,BY-8,17):
        svg+=f'<line x1="{ex+2}" y1="{yy}" x2="{ex+10}" y2="{yy}" stroke="{INK2}" stroke-width="0.7"/>'

# PITH: slightly-wiggly black line along the top edge (rides the wiggly edge exactly)
svg+=poly(toppts,INK,3.0)

# the SPLIT: pops the juvenile slab off along that ring (solid near the wedge, then dashed)
svg+=poly([p for p in ring if 189<=p[0]<=470],RED,2.4)
svg+=poly([p for p in ring if p[0]>=470],RED,2.0,dash="4,5")

# steel WEDGE into the END of the log, ~10% down from the top, on the ring
ey=196
svg+=f'<polygon points="128,{ey-12} 189,{ey-4} 189,{ey+4} 128,{ey+12}" fill="#9aa0a6" stroke="{INK}" stroke-width="2"/>'
svg+=f'<rect x="119" y="{ey-15}" width="9" height="30" rx="2" fill="#7d7f84" stroke="{INK}" stroke-width="1.6"/>'
# impact marks between hammer face and wedge head
for (x1,y1,x2,y2) in [(100,190,108,183),(98,196,90,196),(100,202,108,209),(104,187,100,180)]:
    svg+=f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{INK}" stroke-width="1.4"/>'

# SLEDGEHAMMER driving the wedge
svg+=f'<rect x="64" y="173" width="30" height="46" rx="4" fill="#7d7f84" stroke="{INK}" stroke-width="2"/>'
svg+=f'<line x1="78" y1="176" x2="30" y2="98" stroke="#8a6b4a" stroke-width="8" stroke-linecap="round"/>'
svg+=f'<line x1="26" y1="{ey}" x2="54" y2="{ey}" stroke="{INK}" stroke-width="3.5" marker-end="url(#ah)"/>'
svg+=f'<text x="79" y="246" text-anchor="middle" font-size="12" fill="{INK}">sledgehammer</text>'

# labels
svg+=f'<text x="95" y="120" font-size="13" fill="{INK}">steel wedge, driven into a growth ring</text>'
svg+=f'<text x="95" y="138" font-size="11" fill="{INK2}">(~10% down — pops the juvenile slab off)</text>'
svg+=f'<line x1="150" y1="144" x2="124" y2="178" stroke="{INK2}" stroke-width="1"/>'
svg+=f'<text x="480" y="152" text-anchor="middle" font-size="13" fill="{INK}">juvenile wood — wavy, unpredictable grain</text>'
svg+=f'<line x1="480" y1="158" x2="480" y2="188" stroke="{INK2}" stroke-width="1"/>'
svg+=f'<text x="790" y="152" text-anchor="middle" font-size="13" fill="{INK}">pith</text>'
svg+=f'<line x1="790" y1="158" x2="790" y2="177" stroke="{INK2}" stroke-width="1"/>'
svg+=f'<text x="700" y="356" text-anchor="middle" font-size="12" fill="{INK}">sapwood</text>'
svg+=f'<line x1="700" y1="345" x2="700" y2="305" stroke="{INK2}" stroke-width="1"/>'
svg+=f'<text x="850" y="356" text-anchor="middle" font-size="12" fill="{INK}">bark</text>'
svg+=f'<line x1="850" y1="345" x2="850" y2="322" stroke="{INK2}" stroke-width="1"/>'

svg+=f'<text x="{w/2}" y="{h-16}" text-anchor="middle" font-size="12.5" fill="{INK2}" font-style="italic">The wood near the pith is weak and wild — split it off along a ring, or bash it away with an axe.</text>'
svg+='</svg>'
open('17_quarter_juvenile.svg','w').write(svg)
print("17 ok")
