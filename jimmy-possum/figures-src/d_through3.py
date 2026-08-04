from style import *
import math
w,h=920,600
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="36" text-anchor="middle" font-size="23" fill="{INK}" font-weight="bold">The Jimmy Possum Joint (side view)</text>'
svg+=f'<text x="{w/2}" y="60" text-anchor="middle" font-size="13" fill="{INK2}" font-style="italic">Front leg and a back stick each pass up through the arm; legs rake but do not splay</text>'

# Side view. FRONT at left. 
# Seat: a thick slab, slightly tilted (recline) - draw as a parallelogram in side view
sx0,sy0 = 250, 300   # front-top of seat
seatLen=300; seatTh=26
# seat tilts down slightly to the back (recline): back is a touch lower
rise=18
# seat top edge front->back
fx,fy = sx0, sy0
bx,by = sx0+seatLen, sy0+rise
svg+=f'<polygon points="{fx},{fy} {bx},{by} {bx},{by+seatTh} {fx},{fy+seatTh}" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.5"/>'
svg+=f'<text x="{(fx+bx)/2}" y="{(fy+by)/2+seatTh+22}" text-anchor="middle" font-size="12" fill="{INK2}">seat (slab, side view — note slight recline)</text>'
svg+=f'<text x="{fx-8}" y="{fy+seatTh+44}" text-anchor="end" font-size="12" fill="{INK}" font-weight="bold">← FRONT</text>'
svg+=f'<text x="{bx+70}" y="{by+seatTh+18}" text-anchor="start" font-size="12" fill="{INK}" font-weight="bold">BACK →</text>'

def tapered(x_bot,y_bot,x_top,y_top,wb,wt,fill=WOOD):
    # perpendicular offset for width
    dx=x_top-x_bot; dy=y_top-y_bot; L=math.hypot(dx,dy)
    ox,oy=-dy/L,dx/L
    p=[(x_bot+ox*wb/2,y_bot+oy*wb/2),(x_bot-ox*wb/2,y_bot-oy*wb/2),
       (x_top-ox*wt/2,y_top-oy*wt/2),(x_top+ox*wt/2,y_top+oy*wt/2)]
    pts=' '.join(f'{a:.0f},{b:.0f}' for a,b in p)
    return f'<polygon points="{pts}" fill="{fill}" stroke="{INK}" stroke-width="2.2"/>'

# ARM: runs front-to-back, ~ horizontal, sitting ~ above seat. In side view it's a bar.
armFx, armFy = fx+30, fy-150       # arm front (above seat front)
armBx, armBy = fx+230, fy-150+24   # arm back (slightly lower, follows recline)
armTh=20
# draw arm as parallelogram
def bar(x1,y1,x2,y2,th,fill=WOOD_L):
    dx=x2-x1;dy=y2-y1;L=math.hypot(dx,dy);ox,oy=-dy/L,dx/L
    p=[(x1+ox*th/2,y1+oy*th/2),(x2+ox*th/2,y2+oy*th/2),(x2-ox*th/2,y2-oy*th/2),(x1-ox*th/2,y1-oy*th/2)]
    return f'<polygon points="{" ".join(f"{a:.0f},{b:.0f}" for a,b in p)}" fill="{fill}" stroke="{INK}" stroke-width="2.2"/>'
svg+=bar(armFx,armFy,armBx,armBy,armTh)
svg+=f'<text x="{armFx-10}" y="{armFy-6}" text-anchor="end" font-size="12.5" fill="{INK}">arm</text>'

# FRONT LEG: from floor up through seat-front, continuing up through ARM front, proud at top.
# foot:
flf_x, flf_y = fx-14, fy+175   # front foot (rakes a bit forward => foot ahead of seat front)
fltop_x, fltop_y = armFx, armFy-26   # proud above arm front
svg+=tapered(flf_x,flf_y, fltop_x,fltop_y, 22,13)
# wedge proud
svg+=f'<polygon points="{fltop_x-6:.0f},{fltop_y:.0f} {fltop_x+6:.0f},{fltop_y:.0f} {fltop_x+2:.0f},{fltop_y+16:.0f} {fltop_x-2:.0f},{fltop_y+16:.0f}" fill="{RED}" stroke="{INK}" stroke-width="1"/>'
svg+=f'<text x="{fltop_x-14:.0f}" y="{fltop_y-30:.0f}" text-anchor="end" font-size="11.5" fill="{INK}">front leg,</text>'
svg+=f'<text x="{fltop_x-14:.0f}" y="{fltop_y-16:.0f}" text-anchor="end" font-size="11.5" fill="{INK}">wedged proud</text>'

# BACK STICK: from seat back edge up through ARM back, continuing up to crest; wedged proud where it exits arm.
bs_bot_x, bs_bot_y = bx-30, by+seatTh-2
bs_arm_x, bs_arm_y = armBx, armBy   # passes through arm back
bs_top_x, bs_top_y = armBx+22, armBy-110  # continues up to crest
svg+=f'<line x1="{bs_bot_x}" y1="{bs_bot_y}" x2="{bs_top_x}" y2="{bs_top_y}" stroke="{WOOD}" stroke-width="9" stroke-linecap="round"/>'
svg+=f'<line x1="{bs_bot_x}" y1="{bs_bot_y}" x2="{bs_top_x}" y2="{bs_top_y}" stroke="{INK}" stroke-width="1" opacity="0.35"/>'
# wedge where it stands proud above the arm
svg+=f'<polygon points="{bs_arm_x-2:.0f},{bs_arm_y-26:.0f} {bs_arm_x+10:.0f},{bs_arm_y-26:.0f} {bs_arm_x+6:.0f},{bs_arm_y-12:.0f} {bs_arm_x+0:.0f},{bs_arm_y-12:.0f}" fill="{RED}" stroke="{INK}" stroke-width="1"/>'
svg+=f'<text x="{bs_top_x+10:.0f}" y="{bs_top_y+20:.0f}" font-size="11.5" fill="{INK}">back stick → up to crest</text>'

# BACK LEG: rakes back hard, foot well behind seat. Passes through seat back only (not the arm).
blf_x, blf_y = bx+82, by+seatTh+165
bltop_x, bltop_y = bx-6, by+2
svg+=tapered(blf_x,blf_y, bltop_x,bltop_y, 26,16)
svg+=f'<text x="{blf_x+14:.0f}" y="{blf_y+4:.0f}" text-anchor="start" font-size="11" fill="{INK}">back leg foot —</text>'+f'<text x="{blf_x+14:.0f}" y="{blf_y+18:.0f}" text-anchor="start" font-size="11" fill="{INK}">set well back</text>'
# rake arc on back leg
svg+=f'<line x1="{bltop_x}" y1="{bltop_y}" x2="{bltop_x}" y2="{bltop_y-70}" stroke="{INK2}" stroke-width="1" stroke-dasharray="2,3"/>'
ang=math.radians(26)
svg+=f'<path d="M{bltop_x} {bltop_y-52} A 52 52 0 0 1 {bltop_x+math.sin(ang)*52:.0f} {bltop_y-math.cos(ang)*52:.0f}" fill="none" stroke="{RED}" stroke-width="1.3"/>'
svg+=f'<text x="{bltop_x+16}" y="{bltop_y-54}" font-size="12" fill="{RED}" font-weight="bold">rake 20–30°</text>'

# front leg rake note
svg+=f'<text x="{flf_x-6:.0f}" y="{flf_y+18:.0f}" text-anchor="middle" font-size="11" fill="{INK}">front leg, slight rake</text>'

# explainer band
svg+=f'<text x="{w/2}" y="{h-58}" text-anchor="middle" font-size="13.5" fill="{INK}" font-weight="bold">The arm is carried by two through-tenons</text>'
svg+=f'<text x="{w/2}" y="{h-38}" text-anchor="middle" font-size="12.5" fill="{INK2}">Its front rides on the front leg; its back rides on a back stick. Both pass through the arm and are wedged proud on top.</text>'
svg+=f'<text x="{w/2}" y="{h-16}" text-anchor="middle" font-size="11.5" fill="{INK2}" font-style="italic">“The legs protrude through the slab seat to support the arms and are secured with wooden wedges.” — Tasmanian catalogue, 1978</text>'
svg+='</svg>'
open('07_through_joint.svg','w').write(svg)
print("through joint v3 ok")
