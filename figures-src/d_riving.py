from style import *
import math
w,h=1040,600
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="11" markerHeight="11" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker><marker id="ahr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="40" text-anchor="middle" font-size="24" fill="{INK}" font-weight="bold">Riving: Splitting Radially, Pith to Bark</text>'
svg+=f'<text x="{w/2}" y="65" text-anchor="middle" font-size="13.5" fill="{INK2}" font-style="italic">Split radially, pith to bark, for a true radial face — on a big log, keep going past quarters to eighths and finer</text>'

def log_disc(cx,cy,R, rings=True):
    s=f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="{WOOD_D}" stroke="{INK}" stroke-width="2.5"/>'
    s+=f'<circle cx="{cx}" cy="{cy}" r="{R-7}" fill="{WOOD}" stroke="{INK2}" stroke-width="1"/>'
    if rings:
        for rr in range(int(R*0.3),R-7,int(R*0.22)):
            s+=f'<circle cx="{cx}" cy="{cy}" r="{rr}" fill="none" stroke="{WOOD_D}" stroke-width="0.9" opacity="0.55"/>'
    s+=f'<circle cx="{cx}" cy="{cy}" r="3.5" fill="{INK}"/>'
    return s

def ray(cx,cy,ang,R,color=RED,wdt=2.4,dash=False):
    rad=math.radians(ang); x2=cx+R*math.cos(rad); y2=cy+R*math.sin(rad)
    da=' stroke-dasharray="2,5"' if dash else ''
    return f'<line x1="{cx}" y1="{cy}" x2="{x2:.0f}" y2="{y2:.0f}" stroke="{color}" stroke-width="{wdt}"{da}/>'

y=200; R=78
# Stage 1: whole log
cx=120
svg+=log_disc(cx,y,R)
svg+=f'<text x="{cx}" y="{y+R+28}" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">1 · the log</text>'
svg+=f'<text x="{cx}" y="{y+R+46}" text-anchor="middle" font-size="11" fill="{INK2}">end grain, pith centered</text>'

# Stage 2: split in half (vertical split through pith)
cx=350
svg+=log_disc(cx,y,R)
svg+=ray(cx,y,90,R) ; svg+=ray(cx,y,270,R)  # vertical line through pith = half
svg+=f'<text x="{cx}" y="{y+R+28}" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">2 · halve</text>'
svg+=f'<text x="{cx}" y="{y+R+46}" text-anchor="middle" font-size="11" fill="{INK2}">split through the pith</text>'

# Stage 3: quarter
cx=580
svg+=log_disc(cx,y,R)
svg+=ray(cx,y,90,R); svg+=ray(cx,y,270,R); svg+=ray(cx,y,0,R); svg+=ray(cx,y,180,R)
svg+=f'<text x="{cx}" y="{y+R+28}" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">3 · quarter</text>'
svg+=f'<text x="{cx}" y="{y+R+46}" text-anchor="middle" font-size="11" fill="{INK2}">split each half again</text>'

# Stage 4: rive a quarter into radial billets (zoom on one wedge)
cx=820
# draw a single quarter (pie slice) bigger, with radial split lines
qx,qy=cx,y
# pie slice from pith spanning -45..45 deg, radius Rq
Rq=95
a0=-45; a1=45
import math
p0=(qx+Rq*math.cos(math.radians(a0)), qy+Rq*math.sin(math.radians(a0)))
p1=(qx+Rq*math.cos(math.radians(a1)), qy+Rq*math.sin(math.radians(a1)))
svg+=f'<path d="M{qx} {qy} L {p0[0]:.0f} {p0[1]:.0f} A {Rq} {Rq} 0 0 1 {p1[0]:.0f} {p1[1]:.0f} Z" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
# bark arc thicker
svg+=f'<path d="M {p0[0]:.0f} {p0[1]:.0f} A {Rq} {Rq} 0 0 1 {p1[0]:.0f} {p1[1]:.0f}" fill="none" stroke="{WOOD_D}" stroke-width="6"/>'
# radial split lines dividing the quarter into billets (rays from pith) — split to eighths & finer
for a in (-30,-15,0,15,30):
    svg+=ray(qx,qy,a,Rq,color=RED,wdt=1.8)
# growth-ring arcs (faint, concentric)
for rr in (38,62,86):
    svg+=f'<path d="M {qx+rr*math.cos(math.radians(a0)):.0f} {qy+rr*math.sin(math.radians(a0)):.0f} A {rr} {rr} 0 0 1 {qx+rr*math.cos(math.radians(a1)):.0f} {qy+rr*math.sin(math.radians(a1)):.0f}" fill="none" stroke="{WOOD_D}" stroke-width="0.9" opacity="0.5"/>'
# one TANGENTIAL split (along a growth ring) on an outer wedge, to show the size-reduction move
svg+=f'<path d="M {qx+74*math.cos(math.radians(a1)):.0f} {qy+74*math.sin(math.radians(a1)):.0f} A 74 74 0 0 0 {qx+74*math.cos(math.radians(15)):.0f} {qy+74*math.sin(math.radians(15)):.0f}" fill="none" stroke="{GREEN}" stroke-width="2.2"/>'
svg+=f'<circle cx="{qx}" cy="{qy}" r="3.5" fill="{INK}"/>'
svg+=f'<text x="{qx}" y="{y+R+28}" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">4 · split to size</text>'
svg+=f'<text x="{qx}" y="{y+R+46}" text-anchor="middle" font-size="10.5" fill="{RED}">radial (rays)</text>'
svg+=f'<text x="{qx}" y="{y+R+60}" text-anchor="middle" font-size="10.5" fill="{GREEN}">+ tangential (rings)</text>'

# arrows between stages
for x1,x2 in [(120+R+6,350-R-6),(350+R+6,580-R-6),(580+R+6,820-95-6)]:
    svg+=f'<line x1="{x1}" y1="{y}" x2="{x2}" y2="{y}" stroke="{INK}" stroke-width="2.5" marker-end="url(#ah)"/>'

# ---- bottom band: radial face (left) + "pet the cat" grain rule (right) ----
by=370
svg+=f'<line x1="60" y1="{by-22}" x2="{w-60}" y2="{by-22}" stroke="{RULE}" stroke-width="1" stroke-dasharray="3,5"/>'
svg+=f'<defs><marker id="ahg" markerWidth="11" markerHeight="11" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{GREEN}"/></marker></defs>'
# LEFT: a billet with its radial face called out
bx=120; bw=140; bh=70
svg+=f'<rect x="{bx}" y="{by+24}" width="{bw}" height="{bh}" rx="5" fill="{WOOD_L}" stroke="{INK}" stroke-width="2.2"/>'
for i in range(1,6):
    yy=by+24+i*bh/6
    svg+=f'<line x1="{bx}" y1="{yy:.0f}" x2="{bx+bw}" y2="{yy:.0f}" stroke="{WOOD_D}" stroke-width="1.6"/>'
svg+=f'<text x="{bx+bw/2}" y="{by+16}" text-anchor="middle" font-size="12.5" fill="{RED}" font-weight="bold">the wide face is RADIAL</text>'
svg+=f'<text x="{bx+bw/2}" y="{by+bh+44}" text-anchor="middle" font-size="11" fill="{INK2}">straight rings → stable, clean</text>'

# RIGHT: "pet the cat" — fibers all lie one way (toward the right); two passes shown
def furred_stick(sx,sy,sw,sh):
    s=f'<rect x="{sx}" y="{sy}" width="{sw}" height="{sh}" rx="6" fill="{WOOD}" stroke="{INK}" stroke-width="2.2"/>'
    # fibers drawn as little angled strokes all leaning the SAME way (lying toward the right, like fur)
    rows=[sy+sh*0.30, sy+sh*0.55, sy+sh*0.80]
    for ry in rows:
        for i in range(0,14):
            x0=sx+10+i*(sw-20)/14
            # each hair: short stroke angled up-to-the-right (the lay points right)
            s+=f'<line x1="{x0}" y1="{ry+3}" x2="{x0+13}" y2="{ry-3}" stroke="{WOOD_D}" stroke-width="1.3"/>'
    return s

sx=540; sw=300
# header for the whole right block
svg+=f'<text x="{sx+sw/2}" y="{by-2}" text-anchor="middle" font-size="14" fill="{INK}" font-weight="bold">Shave the way the grain lies — like petting a cat</text>'

# --- GOOD pass (top): blade moves the way the fur lies (to the right) ---
gy=by+22; gh=44
svg+=furred_stick(sx,gy,sw,gh)
svg+=f'<line x1="{sx+sw*0.30}" y1="{gy+gh/2}" x2="{sx+sw-8}" y2="{gy+gh/2}" stroke="{GREEN}" stroke-width="3.5" marker-end="url(#ahg)"/>'
svg+=f'<text x="{sx+sw+10}" y="{gy+gh/2-3}" font-size="12.5" fill="{GREEN}" font-weight="bold">WITH the lay</text>'
svg+=f'<text x="{sx+sw+10}" y="{gy+gh/2+14}" font-size="10.5" fill="{INK2}">fur smooths down — clean</text>'

# --- BAD pass (bottom): blade moves against the lay (to the left); fibers lift ---
ry2=gy+gh+30; rh=44
svg+=f'<rect x="{sx}" y="{ry2}" width="{sw}" height="{rh}" rx="6" fill="{WOOD}" stroke="{INK}" stroke-width="2.2"/>'
rows=[ry2+rh*0.30, ry2+rh*0.55, ry2+rh*0.80]
for ridx,rry in enumerate(rows):
    for i in range(0,14):
        x0=sx+10+i*(sw-20)/14
        # most hairs lie toward the right; near the left a couple are LIFTED (tear-out)
        if i< 3:
            s_lift = 10 if ridx==1 else 7
            svg+=f'<line x1="{x0}" y1="{rry+3}" x2="{x0+6}" y2="{rry-s_lift}" stroke="{RED}" stroke-width="1.6"/>'
        else:
            svg+=f'<line x1="{x0}" y1="{rry+3}" x2="{x0+13}" y2="{rry-3}" stroke="{WOOD_D}" stroke-width="1.3"/>'
# torn chip at the left edge
svg+=f'<path d="M{sx} {ry2+rh*0.45} l -10 -6 l 6 10 z" fill="{RED}" opacity="0.55"/>'
svg+=f'<line x1="{sx+sw*0.70}" y1="{ry2+rh/2}" x2="{sx+8}" y2="{ry2+rh/2}" stroke="{RED}" stroke-width="3.5" marker-end="url(#ahr)"/>'
svg+=f'<text x="{sx+sw+10}" y="{ry2+rh/2-3}" font-size="12.5" fill="{RED}" font-weight="bold">AGAINST the lay</text>'
svg+=f'<text x="{sx+sw+10}" y="{ry2+rh/2+14}" font-size="10.5" fill="{INK2}">fur lifts — tears out</text>'

svg+=f'<text x="{sx+sw/2}" y="{ry2+rh+24}" text-anchor="middle" font-size="11" fill="{INK2}">If a cut starts to tear, you&#39;re going against the grain — flip the part end-for-end and cut the other way.</text>'

# tangential note
svg+=f'<text x="{w/2}" y="{h-14}" text-anchor="middle" font-size="11.5" fill="{INK2}" font-style="italic">When a wedge gets too small to split radially, split it tangentially — along a growth ring (green) — to reach billet size.</text>'

svg+='</svg>'
open('15_riving_radial.svg','w').write(svg)
print("riving diagram ok")
