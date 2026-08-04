from style import *
import math
w,h=900,600
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="36" text-anchor="middle" font-size="23" fill="{INK}" font-weight="bold">The Jimmy Possum Joint — Legs Rake Through Seat &amp; Arm</text>'
svg+=f'<text x="{w/2}" y="60" text-anchor="middle" font-size="13" fill="{INK2}" font-style="italic">A side view: legs lean front-to-back (rake) but do not splay sideways</text>'

# Side view. Front of chair to the LEFT. Front leg rakes a little forward/down; back leg rakes back.
# seat (horizontal slab) mid-height
seatY=300; seatX=300; seatW=300; seatH=34
svg+=f'<rect x="{seatX}" y="{seatY}" width="{seatW}" height="{seatH}" rx="5" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.5"/>'
svg+=f'<text x="{seatX+seatW/2}" y="{seatY-10}" text-anchor="middle" font-size="12" fill="{INK}">seat (side view)</text>'

# FRONT leg: near left end, rakes slightly; passes through seat, up through arm
flx=seatX+60
# arm (front) - short horizontal bar above seat at left
armY=170
svg+=f'<rect x="{flx-70}" y="{armY}" width="150" height="22" rx="6" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.2"/>'
svg+=f'<text x="{flx-78}" y="{armY+15}" text-anchor="end" font-size="12" fill="{INK}">arm</text>'
# front leg as a tapered line from below seat up through arm, slight forward rake (top leans left a touch)
def leg(x_seat, topdx, botdx, top_y, bot_y, wtop, wbot, label, wedge=True):
    # build a tapered quad
    tx=x_seat+topdx; bx=x_seat+botdx
    s=f'<polygon points="{bx-wbot/2:.0f},{bot_y} {bx+wbot/2:.0f},{bot_y} {tx+wtop/2:.0f},{top_y} {tx-wtop/2:.0f},{top_y}" fill="{WOOD}" stroke="{INK}" stroke-width="2.2"/>'
    return s,tx,bx
# front leg rakes forward slightly: top a bit left of bottom
fl,ftx,fbx = leg(flx, -14, 4, armY-22, seatY+seatH+150, 22, 40, "front")
svg+=fl
# wedge proud at front leg top
svg+=f'<polygon points="{ftx-8:.0f},{armY-34} {ftx+8:.0f},{armY-34} {ftx+2:.0f},{armY-22} {ftx-2:.0f},{armY-22}" fill="{RED}" stroke="{INK}" stroke-width="1.2"/>'
svg+=f'<text x="{ftx-90:.0f}" y="{armY-26}" font-size="11.5" fill="{INK}">front leg through arm</text>'

# BACK leg: near right end, rakes BACK strongly (foot far right/back). NO arm at back in this simple view; goes through seat.
blx=seatX+seatW-60
bl,btx,bbx = leg(blx, 50, 150, seatY-2, seatY+seatH+150, 30, 42, "back")
svg+=bl
svg+=f'<text x="{bbx-4:.0f}" y="{seatY+seatH+168}" text-anchor="middle" font-size="11.5" fill="{INK}">back leg — foot set far back (anti-tip)</text>'
# rake arc on back leg
svg+=f'<line x1="{blx}" y1="{seatY}" x2="{blx}" y2="{seatY-70}" stroke="{INK2}" stroke-width="1" stroke-dasharray="2,3"/>'
ang=math.radians(25)
svg+=f'<path d="M{blx} {seatY-50} A 50 50 0 0 1 {blx+math.sin(ang)*50:.0f} {seatY-math.cos(ang)*50:.0f}" fill="none" stroke="{RED}" stroke-width="1.4"/>'
svg+=f'<text x="{blx+20}" y="{seatY-54}" font-size="12" fill="{RED}" font-weight="bold">rake 20–30°</text>'

# back stick rising from rear of seat (through seat) up past arm height
bstx=seatX+seatW-95
svg+=f'<line x1="{bstx}" y1="{seatY+seatH+10}" x2="{bstx+18}" y2="{armY-90}" stroke="{WOOD}" stroke-width="9" stroke-linecap="round"/>'
svg+=f'<text x="{bstx-6}" y="{armY-96}" text-anchor="middle" font-size="11.5" fill="{INK}">back stick</text>'
# note: back-stick through-tenon must clear the back leg
svg+=f'<text x="{seatX+seatW+10}" y="{seatY+seatH+30}" font-size="11" fill="{INK2}">the stick&#39;s through-tenon</text>'
svg+=f'<text x="{seatX+seatW+10}" y="{seatY+seatH+46}" font-size="11" fill="{INK2}">must clear the back leg</text>'
svg+=f'<text x="{seatX+seatW+10}" y="{seatY+seatH+62}" font-size="11" fill="{INK2}">where it exits the seat</text>'

# FRONT label and "no splay" note
svg+=f'<text x="{seatX-30}" y="{seatY+seatH+150}" text-anchor="middle" font-size="12" fill="{INK}" font-weight="bold">← FRONT</text>'
svg+=f'<text x="{seatX+seatW+40}" y="{seatY+seatH+150}" text-anchor="middle" font-size="12" fill="{INK}" font-weight="bold">BACK →</text>'

# explainer
svg+=f'<text x="{w/2}" y="{h-92}" text-anchor="middle" font-size="14" fill="{INK}" font-weight="bold">Rake only — no splay</text>'
svg+=f'<text x="{w/2}" y="{h-70}" text-anchor="middle" font-size="12.5" fill="{INK2}">Front legs pass through both seat and arm; the front leg is wedged where it stands proud of the arm.</text>'
svg+=f'<text x="{w/2}" y="{h-52}" text-anchor="middle" font-size="12.5" fill="{INK2}">Back legs rake hard so the foot lands well behind the seat — the chair can&#39;t tip back — while the through-tenon clears them.</text>'
svg+=f'<text x="{w/2}" y="{h-28}" text-anchor="middle" font-size="11.5" fill="{INK2}" font-style="italic">“The legs protrude through the slab seat to support the arms and are secured with wooden wedges.” — Tasmanian catalogue, 1978</text>'
svg+='</svg>'
open('07_through_joint.svg','w').write(svg)
print("07 rewritten")
