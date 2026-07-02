from style import *
import math
w,h=760,820
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK2}"/></marker><marker id="ahr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="40" text-anchor="middle" font-size="23" fill="{INK}" font-weight="bold">Anatomy of a Jimmy Possum Chair</text>'

def lab(x,y,tx,ty,text,anchor='start'):
    s=f'<line x1="{tx}" y1="{ty}" x2="{x}" y2="{y}" stroke="{INK2}" stroke-width="1" marker-end="url(#ah)"/>'
    s+=f'<text x="{tx}" y="{ty-4 if ty<y else ty+12}" font-size="13" fill="{INK}" text-anchor="{anchor}">{text}</text>'
    return s

cxc=330  # chair center x
# --- seat ---
seatY=470
svg+=f'<ellipse cx="{cxc}" cy="{seatY}" rx="135" ry="30" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
svg+=f'<rect x="{cxc-135}" y="{seatY}" width="270" height="34" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
svg+=f'<ellipse cx="{cxc}" cy="{seatY+34}" rx="135" ry="30" fill="{WOOD_D}" stroke="{INK}" stroke-width="2.5"/>'
svg+=lab(cxc+120,seatY+34,cxc+220,seatY+70,"slab seat")

# --- front legs (splayed), passing up through seat into arms ---
armY=300
armLen=150
for sgn in (-1,1):
    footx=cxc+sgn*150; footy=seatY+250
    topx=cxc+sgn*95; topy=armY+6
    # leg below seat
    svg+=f'<line x1="{footx}" y1="{footy}" x2="{cxc+sgn*100}" y2="{seatY+30}" stroke="{WOOD_D}" stroke-width="13" stroke-linecap="round"/>'
    # leg above seat to arm (tapered look via two strokes)
    svg+=f'<line x1="{cxc+sgn*100}" y1="{seatY+10}" x2="{topx}" y2="{topy}" stroke="{WOOD}" stroke-width="11" stroke-linecap="round"/>'
    svg+=f'<line x1="{cxc+sgn*100}" y1="{seatY+10}" x2="{topx}" y2="{topy}" stroke="{INK}" stroke-width="1.2" fill="none" opacity="0.4"/>'
    # wedge proud at arm
    svg+=f'<polygon points="{topx-6},{topy-22} {topx+6},{topy-22} {topx+2},{topy} {topx-2},{topy}" fill="{RED}" stroke="{INK}" stroke-width="1"/>'
# arms (two, left/right) as angled bars
for sgn in (-1,1):
    x0=cxc+sgn*40; x1=cxc+sgn*150
    svg+=f'<rect x="{min(x0,x1)}" y="{armY-12}" width="{abs(x1-x0)}" height="22" rx="8" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.5"/>'
svg+=lab(cxc+150,armY,cxc+232,armY-30,"arm")
svg+=lab(cxc+95,armY-14,cxc+232,armY+6,"leg wedged proud")

# --- back sticks rising from seat back through arm to crest ---
crestY=120
backXs=[cxc-70,cxc-30,cxc+10,cxc+50]
for bxp in backXs:
    svg+=f'<line x1="{bxp}" y1="{seatY+6}" x2="{bxp+ (cxc-bxp)*0.18:.0f}" y2="{crestY+18}" stroke="{WOOD}" stroke-width="8" stroke-linecap="round"/>'
svg+=lab(cxc+50,crestY+90,cxc+232,crestY+120,"back sticks")
# --- crest / comb across the tops ---
svg+=f'<path d="M{cxc-95} {crestY+22} Q {cxc} {crestY-6} {cxc+95} {crestY+18} L {cxc+95} {crestY+34} Q {cxc} {crestY+10} {cxc-95} {crestY+38} Z" fill="{WOOD_D}" stroke="{INK}" stroke-width="2.5"/>'
svg+=lab(cxc,crestY+6,cxc-150,crestY-6,"crest (comb)","end")

# --- arms through-joint callout (the signature) ---
# sits below the chair, between the splayed legs, with a leader to the leg/seat joint
bx,byy=212,648
svg+=f'<rect x="{bx}" y="{byy}" width="240" height="120" rx="10" fill="none" stroke="{RED}" stroke-width="1.5" stroke-dasharray="4,4"/>'
svg+=f'<line x1="{bx+84}" y1="{byy}" x2="233" y2="510" stroke="{RED}" stroke-width="1.2" marker-end="url(#ahr)"/>'
svg+=f'<text x="{bx+12}" y="{byy+22}" font-size="13" fill="{RED}" font-weight="bold">The signature joint:</text>'
svg+=f'<text x="{bx+12}" y="{byy+42}" font-size="12" fill="{INK2}">legs pass through the seat and</text>'
svg+=f'<text x="{bx+12}" y="{byy+60}" font-size="12" fill="{INK2}">continue up into the arms,</text>'
svg+=f'<text x="{bx+12}" y="{byy+78}" font-size="12" fill="{INK2}">locked with wooden wedges.</text>'
svg+=f'<text x="{bx+12}" y="{byy+100}" font-size="11" fill="{INK2}" font-style="italic">No screws, no glue required.</text>'

svg+=f'<text x="{w/2}" y="{h-14}" text-anchor="middle" font-size="11.5" fill="{INK2}" font-style="italic">A folk chair: every part split green from one log, shaved by hand, and joined with tapered, wedged round tenons.</text>'
svg+='</svg>'
open('00_anatomy.svg','w').write(svg)
print("00 ok")
