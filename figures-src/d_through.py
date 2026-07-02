from style import *
import math
w,h=920,760
svg=header(w,h)
svg+=f'<text x="{w/2}" y="36" text-anchor="middle" font-size="23" fill="{INK}" font-weight="bold">The Jimmy Possum Joint (side view)</text>'
svg+=f'<text x="{w/2}" y="60" text-anchor="middle" font-size="13" fill="{INK2}" font-style="italic">Front leg through the arm&#39;s front; the outer back stick through the arm&#39;s rear and up to the crest. Legs rake, no splay.</text>'

# FRONT at LEFT.  Scale ~12 px per inch.  Every member is ONE continuous stick.
floorY=620

# ---- seat slab (side view), slight recline (back a bit lower) ----
fx,fy = 330,416             # seat front-top (left)
bx,by = 522,430             # seat back-top (right)
seatTh=18
def topY(x): return fy+(x-fx)*(by-fy)/(bx-fx)

# ---- member helpers ----
def tapered(xb,yb,xt,yt,wb,wt,fill=WOOD):
    dx=xt-xb;dy=yt-yb;L=math.hypot(dx,dy) or 1;ox,oy=-dy/L,dx/L
    p=[(xb+ox*wb/2,yb+oy*wb/2),(xb-ox*wb/2,yb-oy*wb/2),(xt-ox*wt/2,yt-oy*wt/2),(xt+ox*wt/2,yt+oy*wt/2)]
    return f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a,b in p)}" fill="{fill}" stroke="{INK}" stroke-width="2.2"/>'
def bar(x1,y1,x2,y2,th,fill=WOOD_L):
    dx=x2-x1;dy=y2-y1;L=math.hypot(dx,dy) or 1;ox,oy=-dy/L,dx/L
    p=[(x1+ox*th/2,y1+oy*th/2),(x2+ox*th/2,y2+oy*th/2),(x2-ox*th/2,y2-oy*th/2),(x1-ox*th/2,y1-oy*th/2)]
    return f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a,b in p)}" fill="{fill}" stroke="{INK}" stroke-width="2.2"/>'
def wedge(tx,ty):   # little red wedge at a proud tenon tip
    return (f'<polygon points="{tx-6:.1f},{ty-1:.1f} {tx+6:.1f},{ty-1:.1f} {tx+2.5:.1f},{ty+13:.1f} {tx-2.5:.1f},{ty+13:.1f}"'
            f' fill="{RED}" stroke="{INK}" stroke-width="1"/>')

# ---- geometry of the three through-members ----
# FRONT LEG: bored 90° to the reclined seat, so a slight rake; one stick from
# foot, through the slab, through the ARM FRONT, wedged proud.
flSeatX=348                       # seat hole ~1.5" from front edge
flSlope=0.074                     # dx per unit up (slight rake from the recline)
def flx(y): return flSeatX+flSlope*(topY(flSeatX)-y)
# OUTER BACK STICK: rear-corner hole ~1.5" from back edge; rakes BACK 9-17°;
# starts proud BELOW the seat, up through slab and ARM REAR, on to the crest.
bsSeatX=504; bsRake=math.radians(13)
def bsx(y): return bsSeatX+math.tan(bsRake)*(topY(bsSeatX)-y)
# BACK LEG: hole ~3.5" forward of the back-stick hole; rakes back 26°;
# one stick from foot well behind the seat, through slab and ARM, wedged proud.
blSeatX=462; blRake=math.radians(26)
def blx(y): return blSeatX-math.tan(blRake)*(topY(blSeatX)-y)

# ---- arm: carried at its front by the front leg, at its rear by the outer back stick ----
armFront=(340,307); armRear=(542,318.8); armTh=18
def army(x): return armFront[1]+(x-armFront[0])*(armRear[1]-armFront[1])/(armRear[0]-armFront[0])
def cross(memx):    # where a member's centerline crosses the arm centerline
    y=312.0
    for _ in range(6): y=army(memx(y))
    return memx(y),y

# ---- draw: floor, seat, arm, then the members OVER both so "through" is visible ----
svg+=f'<line x1="250" y1="{floorY}" x2="790" y2="{floorY}" stroke="{INK}" stroke-width="2"/>'
for gx in range(262,790,40):
    svg+=f'<line x1="{gx}" y1="{floorY}" x2="{gx-9}" y2="{floorY+9}" stroke="{INK2}" stroke-width="0.8" opacity="0.6"/>'
svg+=f'<polygon points="{fx},{fy} {bx},{by} {bx},{by+seatTh} {fx},{fy+seatTh}" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.5"/>'
svg+=bar(*armFront,*armRear,armTh)

flArm=cross(flx); blArm=cross(blx); bsArm=cross(bsx)

# front leg (foot to proud tip above the arm front)
flTip=(flx(flArm[1]-armTh/2-16),flArm[1]-armTh/2-16)
svg+=tapered(flx(floorY),floorY,*flTip,26,13)
# back leg (foot well behind the seat to proud tip above the arm)
blTip=(blx(blArm[1]-armTh/2-16),blArm[1]-armTh/2-16)
svg+=tapered(blx(floorY),floorY,*blTip,26,14)
# outer back stick (proud below the seat, up to the crest), constant 1" stock
bsBotY=topY(bsSeatX)+seatTh+13; bsTopY=141
svg+=bar(bsx(bsBotY),bsBotY,bsx(bsTopY),bsTopY,12,fill=WOOD)
# crest across the stick top (stick tenons up into it)
svg+=bar(528,151,612,137,16,fill=WOOD_D)
# wedges: proud leg tenons on top of the arm; stick wedged where it passes the arm rear
svg+=wedge(*flTip)
svg+=wedge(*blTip)
svg+=f'<polygon points="{bsx(295)-6:.1f},295 {bsx(295)+6:.1f},295 {bsx(309)+2.5:.1f},309 {bsx(309)-2.5:.1f},309" fill="{RED}" stroke="{INK}" stroke-width="1"/>'

# ---- rake references ----
# back sticks rake 9-17 degrees (dashed plumb line above the seat)
svg+=f'<line x1="{bsSeatX}" y1="{topY(bsSeatX):.1f}" x2="{bsSeatX}" y2="345" stroke="{INK2}" stroke-width="1" stroke-dasharray="2,3"/>'
svg+=f'<path d="M {bsSeatX} 358.7 A 70 70 0 0 1 {bsSeatX+70*math.sin(bsRake):.1f} {topY(bsSeatX)-70*math.cos(bsRake):.1f}" fill="none" stroke="{RED}" stroke-width="1.3"/>'
svg+=f'<text x="540" y="356" font-size="12" fill="{RED}" font-weight="bold">sticks rake 9–17°</text>'
# back leg rakes 20-30 degrees (dashed plumb line below the seat, arc onto the LEG)
svg+=f'<line x1="{blSeatX}" y1="{topY(blSeatX)+seatTh:.1f}" x2="{blSeatX}" y2="{floorY}" stroke="{INK2}" stroke-width="1" stroke-dasharray="2,3"/>'
svg+=f'<path d="M {blSeatX} {topY(blSeatX)+85:.1f} A 85 85 0 0 0 {blSeatX+85*math.sin(blRake):.1f} {topY(blSeatX)+85*math.cos(blRake):.1f}" fill="none" stroke="{RED}" stroke-width="1.3"/>'
svg+=f'<text x="548" y="505" font-size="12" fill="{RED}" font-weight="bold">back leg rakes 20–30°</text>'

# ---- labels ----
svg+=f'<text x="462" y="118" text-anchor="end" font-size="11.5" fill="{INK}">crest (comb)</text>'
svg+=f'<line x1="467" y1="121" x2="509" y2="145" stroke="{INK2}" stroke-width="0.9"/>'
svg+=f'<text x="618" y="182" font-size="11.5" fill="{INK}">outer back stick — one piece:</text>'
svg+=f'<text x="618" y="198" font-size="11.5" fill="{INK}">through seat and arm, up to the crest</text>'
svg+=f'<text x="618" y="216" font-size="10" fill="{INK2}" font-style="italic">(the other back sticks are omitted here)</text>'
svg+=f'<line x1="612" y1="190" x2="{bsx(196)+7:.1f}" y2="196" stroke="{INK2}" stroke-width="0.9"/>'
svg+=f'<text x="330" y="268" text-anchor="end" font-size="11" fill="{INK}">front leg — slight rake,</text>'
svg+=f'<text x="330" y="283" text-anchor="end" font-size="11" fill="{INK}">wedged proud</text>'
svg+=f'<line x1="334" y1="273" x2="{flTip[0]-7:.1f}" y2="284" stroke="{INK2}" stroke-width="0.9"/>'
svg+=f'<text x="{blTip[0]:.0f}" y="262" text-anchor="middle" font-size="11" fill="{INK}">back leg</text>'
svg+=f'<line x1="{blTip[0]:.0f}" y1="266" x2="{blTip[0]:.0f}" y2="277" stroke="{INK2}" stroke-width="0.9"/>'
svg+=f'<text x="472" y="318.5" text-anchor="middle" font-size="11.5" fill="{INK}">arm</text>'
svg+=f'<text x="408" y="505" text-anchor="middle" font-size="11" fill="{INK2}">seat (slab)</text>'
svg+=f'<text x="408" y="521" text-anchor="middle" font-size="11" fill="{INK2}">slight recline</text>'
svg+=f'<line x1="410" y1="492" x2="428" y2="450" stroke="{INK2}" stroke-width="0.9"/>'
svg+=f'<text x="585" y="598" font-size="11" fill="{INK}">foot set well back</text>'
svg+=f'<text x="310" y="648" text-anchor="end" font-size="12" fill="{INK}" font-weight="bold">← FRONT</text>'
svg+=f'<text x="700" y="648" font-size="12" fill="{INK}" font-weight="bold">BACK →</text>'

# ---- explainer band ----
svg+=f'<text x="{w/2}" y="{h-58}" text-anchor="middle" font-size="13.5" fill="{INK}" font-weight="bold">The arm is carried by through-tenons</text>'
svg+=f'<text x="{w/2}" y="{h-38}" text-anchor="middle" font-size="12.5" fill="{INK2}">Its front rides on the front leg, its rear on the outer back stick, and the back leg passes through between them — all wedged.</text>'
svg+=f'<text x="{w/2}" y="{h-16}" text-anchor="middle" font-size="11.5" fill="{INK2}" font-style="italic">“The legs protrude through the slab seat to support the arms and are secured with wooden wedges.” — Tasmanian catalogue, 1978</text>'
svg+='</svg>'
open('07_through_joint.svg','w').write(svg)
print("07 rebuilt")
