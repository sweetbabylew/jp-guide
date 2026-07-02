from style import *
import math
w,h=980,580
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="34" text-anchor="middle" font-size="22" fill="{INK}" font-weight="bold">Fitting a Leg to the Seat Mortise — the Scribed Shoulder</text>'
svg+=f'<text x="{w/2}" y="57" text-anchor="middle" font-size="12.5" fill="{INK2}" font-style="italic">A conical leg in a cylindrical hole: jam it, read where it meets the seat bottom, then shape to fit</text>'

xs=[40,280,520,760]
def panel(x,title):
    return f'<text x="{x+90}" y="100" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">{title}</text>'

# Seat block geometry (rectangular, in section): top at SY_T, bottom at SY_B; hole is a vertical cylinder (two vertical walls)
SY_T=210; SY_B=262          # seat top / bottom faces (rectangular slab)
HOLE_HW=12                  # cylindrical hole half-width (constant)
def seat_block(x):
    cx=x+90
    s=f'<rect x="{x+24}" y="{SY_T}" width="132" height="{SY_B-SY_T}" fill="{WOOD}" stroke="{INK}" stroke-width="2"/>'
    # hole walls (cylindrical) shown as two vertical dashed lines
    s+=f'<line x1="{cx-HOLE_HW}" y1="{SY_T}" x2="{cx-HOLE_HW}" y2="{SY_B}" stroke="{INK2}" stroke-width="1" stroke-dasharray="3,2"/>'
    s+=f'<line x1="{cx+HOLE_HW}" y1="{SY_T}" x2="{cx+HOLE_HW}" y2="{SY_B}" stroke="{INK2}" stroke-width="1" stroke-dasharray="3,2"/>'
    s+=f'<text x="{x+30}" y="{SY_T-6}" font-size="9.5" fill="{INK2}">seat</text>'
    return cx,s

# conical leg: define by top y, bottom y, half-width at the seat-bottom plane (where contact is), and taper.
# We'll draw the leg as a trapezoid (cone in section): narrow at top, wide at bottom.
def cone_leg(cx, top_y, bot_y, hw_at_botface, taper_per_px, slim=0.0):
    # hw at a given y = hw_at_botface + (y - SY_B)*taper_per_px ; slim reduces the upper (tenon) portion
    # We'll just draw a trapezoid with explicit top/bottom half widths.
    hw_top = hw_at_botface + (top_y-SY_B)*taper_per_px - slim
    hw_bot = hw_at_botface + (bot_y-SY_B)*taper_per_px
    pts=f"{cx-hw_top:.0f},{top_y} {cx+hw_top:.0f},{top_y} {cx+hw_bot:.0f},{bot_y} {cx-hw_bot:.0f},{bot_y}"
    return f'<polygon points="{pts}" fill="{WOOD_L}" stroke="{INK}" stroke-width="2"/>', hw_top, hw_bot

taper=0.07   # half-width grows by this per px going down (cone)
legTop=150; legBot=400

# leg that is CONICAL from the foot up to the seat TOP face, then STRAIGHT (cylindrical) above the seat top.
# hw at the seat-bottom plane (contact) == HOLE_HW; cone widens downward; above SY_T it holds the SY_T width.
def cone_then_straight(cx):
    hw_top_seat = HOLE_HW + (SY_T-SY_B)*taper   # half-width at seat TOP (where it goes straight)
    hw_bot      = HOLE_HW + (legBot-SY_B)*taper # half-width at the foot
    # polygon: straight section (legTop..SY_T) at constant hw_top_seat, then cone (SY_T..legBot)
    pts=(f"{cx-hw_top_seat:.0f},{legTop} {cx+hw_top_seat:.0f},{legTop} "      # top of straight section
         f"{cx+hw_top_seat:.0f},{SY_T:.0f} "                                    # down the straight right side to seat top
         f"{cx+hw_bot:.0f},{legBot} {cx-hw_bot:.0f},{legBot} "                  # cone out to the foot
         f"{cx-hw_top_seat:.0f},{SY_T:.0f}")                                    # back up to seat top (left)
    return f'<polygon points="{pts}" fill="{WOOD_L}" stroke="{INK}" stroke-width="2"/>', hw_bot

# ---------- Panel 1: jam it ----------
cx,sb=seat_block(xs[0]); svg+=panel(xs[0],"1 · Jam it in")+sb
# leg: conical foot->seat top, straight above. Contact (cone) at the seat bottom.
leg,hwb=cone_then_straight(cx)
svg+=leg
svg+=f'<text x="{xs[0]+118}" y="{160}" font-size="10" fill="{INK}">round the top,</text>'
svg+=f'<text x="{xs[0]+118}" y="{173}" font-size="10" fill="{INK}">tap it up to jam</text>'
svg+=f'<text x="{xs[0]+90}" y="{425}" text-anchor="middle" font-size="9.5" fill="{INK2}">cone wedges at the seat bottom</text>'

# ---------- Panel 2: mark two lines (red = current contact at seat bottom; green = one seat-thickness toward foot) ----------
cx,sb=seat_block(xs[1]); svg+=panel(xs[1],"2 · Mark two lines")+sb
leg,hwb=cone_then_straight(cx)
svg+=leg
# triangular gaps: between the cone and the vertical hole walls, ABOVE the contact (cone narrows up => gap widens up)
# left gap triangle: from (cx-HOLE_HW, SY_B) up the wall to (cx-HOLE_HW, SY_T), across to cone at top
hw_top_at_ST = HOLE_HW + (SY_T-SY_B)*taper   # cone half-width at seat top plane
svg+=f'<polygon points="{cx-HOLE_HW:.0f},{SY_B} {cx-HOLE_HW:.0f},{SY_T} {cx-hw_top_at_ST:.0f},{SY_T}" fill="{RED}" fill-opacity="0.22" stroke="{RED}" stroke-width="1.2"/>'
svg+=f'<polygon points="{cx+HOLE_HW:.0f},{SY_B} {cx+HOLE_HW:.0f},{SY_T} {cx+hw_top_at_ST:.0f},{SY_T}" fill="{RED}" fill-opacity="0.22" stroke="{RED}" stroke-width="1.2"/>'
svg+=f'<text x="{xs[1]+162}" y="{SY_T-16}" font-size="9" fill="{INK2}">gaps: round hole,</text>'
svg+=f'<text x="{xs[1]+162}" y="{SY_T-5}" font-size="9" fill="{INK2}">cone leg</text>'
svg+=f'<line x1="{xs[1]+166}" y1="{SY_T-2}" x2="{cx+HOLE_HW+4:.0f}" y2="{SY_T+8}" stroke="{INK2}" stroke-width="0.9" marker-end="url(#ah)"/>'
# RED line at the seat-BOTTOM contact (leg width there == HOLE_HW) — DON'T TOUCH
svg+=f'<line x1="{cx-HOLE_HW-3:.0f}" y1="{SY_B}" x2="{cx+HOLE_HW+3:.0f}" y2="{SY_B}" stroke="{RED}" stroke-width="2.5"/>'
svg+=f'<text x="{cx+HOLE_HW+8:.0f}" y="{SY_B-2}" font-size="10" fill="{RED}" font-weight="bold">don&#39;t touch</text>'
svg+=f'<text x="{cx+HOLE_HW+8:.0f}" y="{SY_B+11}" font-size="9" fill="{RED}">(meets seat bottom)</text>'
# GREEN line one seat-thickness DOWN the leg (toward foot) = future shoulder
gthk=(SY_B-SY_T)
gy=SY_B+gthk
hw_g = HOLE_HW + (gy-SY_B)*taper
svg+=f'<line x1="{cx-hw_g-3:.0f}" y1="{gy}" x2="{cx+hw_g+3:.0f}" y2="{gy}" stroke="{GREEN}" stroke-width="2.5"/>'
svg+=f'<text x="{cx+hw_g+8:.0f}" y="{gy+4}" font-size="10" fill="{GREEN}" font-weight="bold">shoulder line</text>'
# arrow showing 1 seat-thickness from red(SY_B) to green(gy)
svg+=f'<line x1="{cx-hwb-12:.0f}" y1="{SY_B}" x2="{cx-hw_g-12:.0f}" y2="{gy}" stroke="{INK2}" stroke-width="1" marker-start="url(#ah)" marker-end="url(#ah)"/>'
svg+=f'<text x="{cx-hw_g-16:.0f}" y="{(SY_B+gy)/2+3:.0f}" text-anchor="end" font-size="8.5" fill="{INK2}">1 seat-</text>'
svg+=f'<text x="{cx-hw_g-16:.0f}" y="{(SY_B+gy)/2+13:.0f}" text-anchor="end" font-size="8.5" fill="{INK2}">thickness</text>'

# ---------- Panel 3: shape the tenon down to the green line ----------
cx,sb=seat_block(xs[2]); svg+=panel(xs[2],"3 · Shape the tenon")
# Slimmed tenon above the green line so it can pass through; full cone below the green line.
# full leg below green:
hw_g = HOLE_HW + (gy-SY_B)*taper
svg+=f'<polygon points="{cx-hw_g:.0f},{gy} {cx+hw_g:.0f},{gy} {cx+ (HOLE_HW+(legBot-SY_B)*taper):.0f},{legBot} {cx- (HOLE_HW+(legBot-SY_B)*taper):.0f},{legBot}" fill="{WOOD_L}" stroke="{INK}" stroke-width="2"/>'
# tenon above green, slimmed to ~ hole width (so it will pass)
svg+=f'<rect x="{cx-HOLE_HW+1:.0f}" y="{legTop}" width="{2*HOLE_HW-2:.0f}" height="{gy-legTop:.0f}" fill="{WOOD_D}" stroke="{INK}" stroke-width="2"/>'
svg+=f'<line x1="{cx-hw_g-3:.0f}" y1="{gy}" x2="{cx+hw_g+3:.0f}" y2="{gy}" stroke="{GREEN}" stroke-width="2.5"/>'
# the RED contact mark carried over from panel 2 — one seat-thickness above the green shoulder
svg+=f'<line x1="{cx-HOLE_HW-3:.0f}" y1="{SY_B}" x2="{cx+HOLE_HW+3:.0f}" y2="{SY_B}" stroke="{RED}" stroke-width="2.5"/>'
svg+=f'<text x="{cx+HOLE_HW+8:.0f}" y="{SY_B+4}" font-size="10" fill="{RED}" font-weight="bold">the red line</text>'
svg+=f'<text x="{xs[2]+150}" y="{(legTop+gy)/2-18:.0f}" font-size="10" fill="{INK}">slim the tenon</text>'
svg+=f'<text x="{xs[2]+150}" y="{(legTop+gy)/2-5:.0f}" font-size="10" fill="{INK}">down to the green</text>'
svg+=f'<text x="{cx+hw_g+8:.0f}" y="{gy+4}" font-size="10" fill="{GREEN}" font-weight="bold">saw the shoulder</text>'
svg+=f'<text x="{xs[2]+90}" y="{425}" text-anchor="middle" font-size="9.5" fill="{INK2}">don&#39;t cut past the red line</text>'

# ---------- Panel 4: seated, shoulder on seat bottom, tenon proud above ----------
cx,sb=seat_block(xs[3]); svg+=panel(xs[3],"4 · Seated tight")+sb
# tenon passes through hole and stands proud above the seat top; shoulder (green) rests at seat BOTTOM
svg+=f'<rect x="{cx-HOLE_HW+1:.0f}" y="{legTop}" width="{2*HOLE_HW-2:.0f}" height="{SY_B-legTop:.0f}" fill="{WOOD_D}" stroke="{INK}" stroke-width="2"/>'
# full cone below seat bottom, starting at shoulder (green) which now sits at SY_B
svg+=f'<polygon points="{cx-HOLE_HW:.0f},{SY_B} {cx+HOLE_HW:.0f},{SY_B} {cx+ (HOLE_HW+(legBot-SY_B)*taper):.0f},{legBot} {cx- (HOLE_HW+(legBot-SY_B)*taper):.0f},{legBot}" fill="{WOOD_L}" stroke="{INK}" stroke-width="2"/>'
svg+=f'<line x1="{cx-HOLE_HW-3:.0f}" y1="{SY_B}" x2="{cx+HOLE_HW+3:.0f}" y2="{SY_B}" stroke="{GREEN}" stroke-width="2.5"/>'
svg+=f'<text x="{cx+HOLE_HW+22:.0f}" y="{SY_B+26}" font-size="10" fill="{GREEN}" font-weight="bold">shoulder seats</text>'
svg+=f'<line x1="{cx+HOLE_HW+26:.0f}" y1="{SY_B+16}" x2="{cx+HOLE_HW+6:.0f}" y2="{SY_B+2}" stroke="{GREEN}" stroke-width="1"/>'
svg+=f'<text x="{cx}" y="{legTop-8}" text-anchor="middle" font-size="9.5" fill="{INK2}">proud, ready to wedge</text>'

# bottom explainer
svg+=f'<text x="{w/2}" y="{h-72}" text-anchor="middle" font-size="13.5" fill="{INK}" font-weight="bold">Let the wood tell you where to cut</text>'
svg+=f'<text x="{w/2}" y="{h-52}" text-anchor="middle" font-size="12" fill="{INK2}">The cone jams at the seat&#39;s bottom face — mark that contact in RED and never cut it. Scribe the GREEN shoulder one seat-thickness toward the foot.</text>'
svg+=f'<text x="{w/2}" y="{h-34}" text-anchor="middle" font-size="12" fill="{INK2}">Slim the tenon down to the green line and saw the shoulder there; drive the leg up until the shoulder seats against the bottom of the seat.</text>'
svg+=f'<text x="{w/2}" y="{h-14}" text-anchor="middle" font-size="11" fill="{RED}" font-style="italic">Photographs of these steps appear in this section.</text>'
svg+='</svg>'
open('13_legfit.svg','w').write(svg)
print("legfit v2 ok")
