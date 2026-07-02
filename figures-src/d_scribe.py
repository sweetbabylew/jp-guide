from style import *
import math
w,h=920,580
svg=header(w,h)
svg+=f'<text x="{w/2}" y="38" text-anchor="middle" font-size="24" fill="{INK}" font-weight="bold">Leveling the Legs After Assembly</text>'
svg+=f'<text x="{w/2}" y="64" text-anchor="middle" font-size="13.5" fill="{INK2}" font-style="italic">Stand the chair on a flat surface, shim it level, then scribe every leg at one height and saw to the line</text>'

# ---- SIDE VIEW: front at RIGHT, back at LEFT. Rake, not splay: the front leg is
# ---- perpendicular to the seat; only the back leg rakes, its foot well behind.

# flat reference surface
benchY=430
svg+=f'<rect x="90" y="{benchY}" width="740" height="26" fill="{WOOD_D}" stroke="{INK}" stroke-width="2.5"/>'
svg+=f'<text x="460" y="{benchY+46}" text-anchor="middle" font-size="12" fill="{INK2}">flat reference surface (benchtop / floor)</text>'

# seat slab (side view), slight recline: back (left) a touch lower
sbx,sby = 390,254          # seat back-top (left)
sfx,sfy = 566,248          # seat front-top (right)
seatTh=16
def topY(x): return sby+(x-sbx)*(sfy-sby)/(sfx-sbx)

# ghosted back stick (rakes back — sells the recline; in true side view the sticks superimpose)
x0,ln=406,132
y0=topY(x0)-2
x1=x0-ln*math.tan(math.radians(13)); y1=y0-ln
svg+=f'<line x1="{x0}" y1="{y0:.0f}" x2="{x1:.0f}" y2="{y1:.0f}" stroke="{WOOD}" stroke-width="9" stroke-linecap="round" opacity="0.35"/>'
svg+=f'<text x="352" y="136" text-anchor="end" font-size="10.5" fill="{INK2}" opacity="0.7">back sticks</text>'

svg+=f'<polygon points="{sbx},{sby} {sfx},{sfy} {sfx},{sfy+seatTh} {sbx},{sby+seatTh}" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.2"/>'
svg+=f'<text x="478" y="106" text-anchor="middle" font-size="11.5" fill="{INK2}">assembled chair — side view (front at right)</text>'

def leg(xt,yt,xb,yb,wt=13,wb=17):
    dx=xb-xt; dy=yb-yt; L=math.hypot(dx,dy) or 1; ox,oy=-dy/L,dx/L
    p=[(xt+ox*wt/2,yt+oy*wt/2),(xt-ox*wt/2,yt-oy*wt/2),(xb-ox*wb/2,yb-oy*wb/2),(xb+ox*wb/2,yb+oy*wb/2)]
    return f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a,b in p)}" fill="{WOOD}" stroke="{INK}" stroke-width="2"/>'

# FRONT leg: perpendicular to the seat (bored at 90°), so near-vertical — foot on the surface
flTop=(549.5,264); flBot=(554.5,benchY)
svg+=leg(*flTop,*flBot)
# BACK leg: rakes back ~25°, foot well behind the seat — this one lands on the shim
rake=math.radians(26)
blTop=(441,269); blBot=(441-147*math.tan(rake),416)
svg+=leg(*blTop,*blBot)

# shim under the BACK foot brings the seat level (flat top under the foot, tapered tail)
svg+=f'<polygon points="346,{benchY} 402,{benchY} 402,416 358,416" fill="{SAGE}" fill-opacity="0.55" stroke="{SAGE}" stroke-width="1.4"/>'
svg+=f'<text x="336" y="424" text-anchor="end" font-size="10.5" fill="{SAGE}">shim to level</text>'

# scribe line: one fixed height above the surface, marked around every leg
scribeY=393
svg+=f'<line x1="330" y1="{scribeY}" x2="690" y2="{scribeY}" stroke="{RED}" stroke-width="1" stroke-dasharray="4,5" opacity="0.75"/>'
svg+=f'<text x="322" y="{scribeY-5}" text-anchor="end" font-size="12" fill="{RED}" font-weight="bold">scribe line</text>'

def legx_back(y):  return 441-math.tan(rake)*(y-269)
def legx_front(y): return 549.5+(554.5-549.5)*(y-264)/(benchY-264)
for legx,foot in ((legx_back,416),(legx_front,benchY)):
    lx=legx(scribeY)
    svg+=f'<line x1="{lx-14:.0f}" y1="{scribeY}" x2="{lx+14:.0f}" y2="{scribeY}" stroke="{RED}" stroke-width="2.5"/>'
    # hatch the waste below the line
    for yy in range(scribeY+5,foot,6):
        cx=legx(yy)
        svg+=f'<line x1="{cx-8:.0f}" y1="{yy}" x2="{cx+8:.0f}" y2="{yy-4}" stroke="{INK2}" stroke-width="0.7" opacity="0.65"/>'
svg+=f'<text x="468" y="414" text-anchor="middle" font-size="10.5" fill="{INK2}">saw off below the line</text>'

# the block, with a proper pencil lying on it — tip at scribe height, aimed at the leg
svg+=f'<rect x="600" y="398" width="80" height="32" rx="4" fill="{WOOD_L}" stroke="{INK}" stroke-width="2"/>'
svg+=f'<text x="640" y="419" text-anchor="middle" font-size="10" fill="{INK}">block</text>'
svg+=f'<rect x="600" y="387" width="58" height="11" fill="#caa24a" stroke="{INK}" stroke-width="1.1"/>'   # pencil body
svg+=f'<line x1="602" y1="390.6" x2="656" y2="390.6" stroke="{INK}" stroke-width="0.5" opacity="0.5"/>'   # facet lines
svg+=f'<line x1="602" y1="394.4" x2="656" y2="394.4" stroke="{INK}" stroke-width="0.5" opacity="0.5"/>'
svg+=f'<rect x="658" y="387" width="7" height="11" fill="{WOOD_D}" stroke="{INK}" stroke-width="1"/>'      # ferrule
svg+=f'<polygon points="600,387 600,398 582,392.5" fill="{WOOD_L}" stroke="{INK}" stroke-width="1"/>'      # sharpened point
svg+=f'<polygon points="587,390.9 587,394.1 580,392.5" fill="{INK}"/>'                                     # lead
svg+=f'<text x="694" y="388" font-size="11" fill="{INK}">pencil on a block</text>'
svg+=f'<text x="694" y="404" font-size="11" fill="{INK}">= fixed height</text>'

# explainer
svg+=f'<text x="{w/2}" y="{h-58}" text-anchor="middle" font-size="14" fill="{INK}" font-weight="bold">Level first, then scribe</text>'
svg+=f'<text x="{w/2}" y="{h-38}" text-anchor="middle" font-size="12.5" fill="{INK2}">Shim the feet until the seat sits level (side to side) at the recline you want. Then rest a pencil on a block on the</text>'
svg+=f'<text x="{w/2}" y="{h-20}" text-anchor="middle" font-size="12.5" fill="{INK2}">surface and run it around each leg; saw to the line, and all four feet meet the floor together.</text>'
svg+='</svg>'
open('09_scribe.svg','w').write(svg)
print("09 side view")
