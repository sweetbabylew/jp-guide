from style import *
import math
w,h=920,620
svg=header(w,h)
svg+=f'<text x="{w/2}" y="38" text-anchor="middle" font-size="24" fill="{INK}" font-weight="bold">Leveling the Legs After Assembly</text>'
svg+=f'<text x="{w/2}" y="64" text-anchor="middle" font-size="13.5" fill="{INK2}" font-style="italic">Stand the chair on a flat surface, shim it level, then scribe every leg at one height and saw to the line</text>'

# ---- the chair: same profile as fig. 07 (the Jimmy Possum joint), scaled 0.75 ----
# 07-space geometry, mapped through M().  Front at LEFT, back at RIGHT.
K=0.75; TX,TY=70,5
def M(x,y): return (TX+K*x, TY+K*y)
benchY=470                      # 07 floor y=620 maps exactly here

fx,fy=330,416; bx,by=522,430; seatTh=18
def topY(x): return fy+(x-fx)*(by-fy)/(bx-fx)
flSeatX=348; flSlope=0.074
def flx(y): return flSeatX+flSlope*(topY(flSeatX)-y)
bsSeatX=504; bsRake=math.radians(13)
def bsx(y): return bsSeatX+math.tan(bsRake)*(topY(bsSeatX)-y)
blSeatX=462; blRake=math.radians(26)
def blx(y): return blSeatX-math.tan(blRake)*(topY(blSeatX)-y)
armFront=(340,307); armRear=(542,318.8); armTh=18
def army(x): return armFront[1]+(x-armFront[0])*(armRear[1]-armFront[1])/(armRear[0]-armFront[0])
def cross(memx):
    y=312.0
    for _ in range(6): y=army(memx(y))
    return memx(y),y

def tapered(x0,y0,x1,y1,w0,w1,fill=WOOD,flat=None):   # mapped coords in, level-cut foot
    dx=x1-x0;dy=y1-y0;L=math.hypot(dx,dy) or 1;ox,oy=-dy/L,dx/L
    b1=(x0+ox*w0/2,y0+oy*w0/2); b2=(x0-ox*w0/2,y0-oy*w0/2)
    t1=(x1+ox*w1/2,y1+oy*w1/2); t2=(x1-ox*w1/2,y1-oy*w1/2)
    if flat is not None:
        def hit(p,q): return (p[0]+(flat-p[1])*(q[0]-p[0])/(q[1]-p[1]),flat)
        b1=hit(b1,t1); b2=hit(b2,t2)
    p=[b1,b2,t2,t1]
    return f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a,b in p)}" fill="{fill}" stroke="{INK}" stroke-width="1.9"/>'
def bar(x0,y0,x1,y1,th,fill=WOOD_L):
    return tapered(x0,y0,x1,y1,th,th,fill)
def wedge(tx,ty):
    return (f'<polygon points="{tx-4.5:.1f},{ty-1:.1f} {tx+4.5:.1f},{ty-1:.1f} {tx+2:.1f},{ty+10:.1f} {tx-2:.1f},{ty+10:.1f}"'
            f' fill="{RED}" stroke="{INK}" stroke-width="1"/>')

# flat reference surface
svg+=f'<rect x="90" y="{benchY}" width="740" height="24" fill="{WOOD_D}" stroke="{INK}" stroke-width="2.5"/>'
svg+=f'<text x="460" y="{benchY+42}" text-anchor="middle" font-size="12" fill="{INK2}">flat reference surface (benchtop / floor)</text>'

# seat and arm
seat=[M(fx,fy),M(bx,by),M(bx,by+seatTh),M(fx,fy+seatTh)]
svg+=f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a,b in seat)}" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.1"/>'
svg+=bar(*M(*armFront),*M(*armRear),armTh*K)

flArm=cross(flx); blArm=cross(blx)
flTip=(flx(flArm[1]-armTh/2-16),flArm[1]-armTh/2-16)
blTip=(blx(blArm[1]-armTh/2-16),blArm[1]-armTh/2-16)
shimTop=benchY-12               # back foot rides on a shim; foot cut level
# front leg: foot flat on the surface
svg+=tapered(*M(flx(620),620),*M(*flTip),26*K,13*K,flat=benchY)
# back leg: raked, foot well back, cut level, sitting on the shim
svg+=tapered(*M(blx(604),604),*M(*blTip),26*K,14*K,flat=shimTop)
# outer back stick: through seat and arm, up to a small crest
bsBotY=topY(bsSeatX)+seatTh+13; bsTopY=141
svg+=bar(*M(bsx(bsBotY),bsBotY),*M(bsx(bsTopY),bsTopY),12*K,fill=WOOD)
svg+=bar(*M(554,146.5),*M(588,140.8),13*K,fill=WOOD_D)   # modest comb
svg+=wedge(*M(*flTip))
svg+=wedge(*M(*blTip))
sw=M(bsx(297),296)
svg+=f'<polygon points="{sw[0]-4.5:.1f},{sw[1]:.1f} {sw[0]+4.5:.1f},{sw[1]:.1f} {sw[0]+2:.1f},{sw[1]+10:.1f} {sw[0]-2:.1f},{sw[1]+10:.1f}" fill="{RED}" stroke="{INK}" stroke-width="1"/>'
svg+=f'<text x="250" y="168" text-anchor="middle" font-size="11.5" fill="{INK2}">assembled chair &#8212; side view (front at left)</text>'

# shim under the back foot brings the seat level
bfootX=M(blx(604),0)[0]
svg+=f'<polygon points="{bfootX-24:.1f},{benchY} {bfootX+24:.1f},{benchY} {bfootX+18:.1f},{shimTop} {bfootX-18:.1f},{shimTop}" fill="{SAGE}" fill-opacity="0.55" stroke="{SAGE}" stroke-width="1.4"/>'
svg+=f'<text x="{bfootX+34:.0f}" y="{benchY-3}" font-size="10.5" fill="{SAGE}">shim to level</text>'

# scribe line: one fixed height above the surface, marked around every leg
scribeY=440
svg+=f'<line x1="250" y1="{scribeY}" x2="616" y2="{scribeY}" stroke="{RED}" stroke-width="1" stroke-dasharray="4,5" opacity="0.8"/>'
svg+=f'<text x="242" y="{scribeY+4}" text-anchor="end" font-size="12" fill="{RED}" font-weight="bold">scribe line</text>'
def mlegx(f):
    return lambda ym: TX+K*f((ym-TY)/K)
for legx,foot in ((mlegx(flx),benchY),(mlegx(blx),shimTop)):
    lx=legx(scribeY)
    svg+=f'<line x1="{lx-12:.0f}" y1="{scribeY}" x2="{lx+12:.0f}" y2="{scribeY}" stroke="{RED}" stroke-width="2.5"/>'
    for yy in range(scribeY+5,int(foot)-1,6):     # hatch the waste below the line
        cxx=legx(yy)
        svg+=f'<line x1="{cxx-7:.0f}" y1="{yy}" x2="{cxx+7:.0f}" y2="{yy-4}" stroke="{INK2}" stroke-width="0.7" opacity="0.65"/>'
svg+=f'<text x="398" y="464" text-anchor="middle" font-size="10.5" fill="{INK2}">saw off below the line</text>'

# pencil resting on a block: its point sits exactly at scribe height
svg+=f'<rect x="640" y="444" width="80" height="26" rx="4" fill="{WOOD_L}" stroke="{INK}" stroke-width="2"/>'
svg+=f'<text x="680" y="462" text-anchor="middle" font-size="10" fill="{INK}">block</text>'
svg+=f'<rect x="640" y="433" width="58" height="11" fill="#caa24a" stroke="{INK}" stroke-width="1.1"/>'
svg+=f'<line x1="642" y1="436.6" x2="696" y2="436.6" stroke="{INK}" stroke-width="0.5" opacity="0.5"/>'
svg+=f'<line x1="642" y1="440.4" x2="696" y2="440.4" stroke="{INK}" stroke-width="0.5" opacity="0.5"/>'
svg+=f'<rect x="698" y="433" width="7" height="11" fill="{WOOD_D}" stroke="{INK}" stroke-width="1"/>'
svg+=f'<polygon points="640,433 640,444 622,438.5" fill="{WOOD_L}" stroke="{INK}" stroke-width="1"/>'
svg+=f'<polygon points="627,436.9 627,440.1 620,438.5" fill="{INK}"/>'
svg+=f'<text x="734" y="430" font-size="11" fill="{INK}">pencil on a block</text>'
svg+=f'<text x="734" y="446" font-size="11" fill="{INK}">= fixed height</text>'

# explainer
svg+=f'<text x="{w/2}" y="{h-56}" text-anchor="middle" font-size="14" fill="{INK}" font-weight="bold">Level first, then scribe</text>'
svg+=f'<text x="{w/2}" y="{h-36}" text-anchor="middle" font-size="12.5" fill="{INK2}">Shim the feet until the seat sits level (side to side) at the recline you want. Then rest a pencil on a block on the</text>'
svg+=f'<text x="{w/2}" y="{h-18}" text-anchor="middle" font-size="12.5" fill="{INK2}">surface and run it around each leg; saw to the line, and all four feet meet the floor together.</text>'
svg+='</svg>'
open('09_scribe.svg','w').write(svg)
print("09 rebuilt on the 07 profile")
