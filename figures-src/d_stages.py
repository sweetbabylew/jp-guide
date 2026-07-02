from style import *
import math
w,h=980,440
svg=header(w,h)
svg+=f'<text x="{w/2}" y="40" text-anchor="middle" font-size="25" fill="{INK}" font-weight="bold">Section 2b · From Billet to Octagon</text>'
svg+=f'<text x="{w/2}" y="66" text-anchor="middle" font-size="14" fill="{INK2}" font-style="italic">Shave two radial faces flat &amp; parallel · then two tangential faces square · then knock off the four corners</text>'

cx0=130; cy=230; r=72
def rings_tangential(cx,cy,r):
    # cathedral-ish arcs across (rings parallel to one pair of faces)
    s=''
    for i in range(-2,3):
        yy=cy+i*r*0.5
        s+=f'<path d="M{cx-r} {yy} Q {cx} {yy-14} {cx+r} {yy}" fill="none" stroke="{WOOD_D}" stroke-width="1.2" opacity="0.8"/>'
    return s

import random
def jagged(x1,y1,x2,y2,segs=6,amp=7,seed=0):
    # returns a list of points along the line x1,y1->x2,y2 with random perpendicular jitter
    rnd=random.Random(seed)
    pts=[]
    for i in range(segs+1):
        t=i/segs
        x=x1+(x2-x1)*t; y=y1+(y2-y1)*t
        dx=x2-x1; dy=y2-y1; L=math.hypot(dx,dy) or 1
        px,py=-dy/L,dx/L
        j = 0 if i in (0,segs) else rnd.uniform(-amp,amp)
        pts.append((x+px*j, y+py*j))
    return pts

# Stage 1: rough riven billet — jagged on ALL sides (freshly split, nothing worked)
def stage1(cx):
    tl=(cx-r,cy-r); tr=(cx+r,cy-r); br=(cx+r,cy+r); bl=(cx-r,cy+r)
    top=jagged(*tl,*tr,seed=1); right=jagged(*tr,*br,seed=2)
    bot=jagged(*br,*bl,seed=3); left=jagged(*bl,*tl,seed=4)
    ring=top+right[1:]+bot[1:]+left[1:]
    ps=' '.join(f'{x:.0f},{y:.0f}' for x,y in ring)
    s=f'<polygon points="{ps}" fill="{WOOD}" stroke="{INK}" stroke-width="2.2"/>'
    # bark edge hint on the left (curved, darker)
    s+=f'<path d="M{cx-r} {cy-r} Q {cx-r-10} {cy} {cx-r} {cy+r}" fill="none" stroke="{WOOD_D}" stroke-width="6" opacity="0.7"/>'
    for rr in (24,46):
        s+=f'<path d="M{cx-rr} {cy-rr*0.6} Q {cx} {cy-rr} {cx+rr} {cy-rr*0.6}" fill="none" stroke="{WOOD_D}" stroke-width="1" opacity="0.55"/>'
    return s

# Stage 2: the two RADIAL faces shaved flat & parallel (left + right straight, opposite each other);
# top & bottom (tangential) still JAGGED like stage 1. Rings run side-to-side, so the
# straight left/right faces are the radial ones — perpendicular to the rings.
def stage2(cx):
    tl=(cx-r,cy-r); tr=(cx+r,cy-r); br=(cx+r,cy+r); bl=(cx-r,cy+r)
    top=jagged(*tl,*tr,seed=11); bot=jagged(*br,*bl,seed=13)
    # left and right are now STRAIGHT (worked): straight left, jagged top, straight right, jagged bottom
    ring=[bl,tl]+top[1:]+bot   # bl->tl straight left, tl->tr jagged top, tr->br straight right, br->bl jagged bottom
    ps=' '.join(f'{x:.0f},{y:.0f}' for x,y in ring)
    s=f'<polygon points="{ps}" fill="{WOOD}" stroke="{INK}" stroke-width="2.2"/>'
    s+=f'<g clip-path="url(#clip2)">{rings_tangential(cx,cy,r)}</g>'
    s+=f'<clipPath id="clip2"><polygon points="{ps}"/></clipPath>'
    # mark the two WORKED faces (red): left + right — opposite and parallel
    s+=f'<line x1="{cx-r}" y1="{cy+r}" x2="{cx-r}" y2="{cy-r}" stroke="{RED}" stroke-width="3"/>'
    s+=f'<line x1="{cx+r}" y1="{cy+r}" x2="{cx+r}" y2="{cy-r}" stroke="{RED}" stroke-width="3"/>'
    return s

# Stage 3: full square — this is where SQUARENESS is established (corner symbol lives here),
# with a go/no-go notch gauge about to slide on from above.
def stage3(cx):
    s=f'<rect x="{cx-r}" y="{cy-r}" width="{2*r}" height="{2*r}" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
    s+=f'<g clip-path="url(#clip3)">{rings_tangential(cx,cy,r)}</g>'
    s+=f'<clipPath id="clip3"><rect x="{cx-r}" y="{cy-r}" width="{2*r}" height="{2*r}"/></clipPath>'
    # square-corner symbol: faces square to each other
    s+=f'<path d="M{cx-r+16} {cy+r} L {cx-r+16} {cy+r-16} L {cx-r} {cy+r-16}" fill="none" stroke="{RED}" stroke-width="2"/>'
    # go/no-go notch gauge hovering above, its notch just the width of the stick
    gy=cy-r-40
    gpts=[(cx-r-16,gy+26),(cx-r-16,gy),(cx+r+16,gy),(cx+r+16,gy+26),(cx+r+2,gy+26),(cx+r+2,gy+12),(cx-r-2,gy+12),(cx-r-2,gy+26)]
    gps=' '.join(f'{x:.0f},{y:.0f}' for x,y in gpts)
    s+=f'<polygon points="{gps}" fill="{WOOD_L}" stroke="{INK}" stroke-width="1.6"/>'
    s+=f'<text x="{cx}" y="{gy+9.5}" text-anchor="middle" font-size="9.5" fill="{INK2}">go/no-go</text>'
    s+=f'<line x1="{cx}" y1="{gy+30}" x2="{cx}" y2="{cy-r-6}" stroke="{INK2}" stroke-width="1" marker-end="url(#ah)"/>'
    return s

# Stage 4: octagon
def stage4(cx):
    c=r*(2-2**0.5)  # corner cut for a REGULAR octagon (all 8 sides equal)
    pts=[(cx-r+c,cy-r),(cx+r-c,cy-r),(cx+r,cy-r+c),(cx+r,cy+r-c),(cx+r-c,cy+r),(cx-r+c,cy+r),(cx-r,cy+r-c),(cx-r,cy-r+c)]
    ps=' '.join(f'{x:.0f},{y:.0f}' for x,y in pts)
    s=f'<polygon points="{ps}" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
    s+=f'<g clip-path="url(#clip4)">{rings_tangential(cx,cy,r)}</g>'
    s+=f'<clipPath id="clip4"><polygon points="{ps}"/></clipPath>'
    # show the four removed corners as faint triangles
    corners=[((cx-r,cy-r),(cx-r+c,cy-r),(cx-r,cy-r+c)),
             ((cx+r,cy-r),(cx+r-c,cy-r),(cx+r,cy-r+c)),
             ((cx+r,cy+r),(cx+r-c,cy+r),(cx+r,cy+r-c)),
             ((cx-r,cy+r),(cx-r+c,cy+r),(cx-r,cy+r-c))]
    for tri in corners:
        ps2=' '.join(f'{x:.0f},{y:.0f}' for x,y in tri)
        s+=f'<polygon points="{ps2}" fill="none" stroke="{RED}" stroke-width="1.4" stroke-dasharray="3,3"/>'
    return s

xs=[140,370,600,830]
labels=["1 · Rough riven billet","2 · Two parallel faces","3 · Four-square","4 · Octagonal"]
subs=["bark &amp; round, oversize","radial faces: flat, straight, parallel","all faces square · go/no-go to size","equal facets — never bell-bottomed"]
fns=[stage1,stage2,stage3,stage4]
for x,lab,sub,fn in zip(xs,labels,subs,fns):
    svg+=fn(x)
    svg+=f'<text x="{x}" y="{cy+r+38}" text-anchor="middle" font-size="15" fill="{INK}" font-weight="bold">{lab}</text>'
    svg+=f'<text x="{x}" y="{cy+r+58}" text-anchor="middle" font-size="11.5" fill="{INK2}">{sub}</text>'
# arrows between
for i in range(3):
    x1=xs[i]+r+8; x2=xs[i+1]-r-8
    svg+=f'<line x1="{x1}" y1="{cy}" x2="{x2}" y2="{cy}" stroke="{INK}" stroke-width="2.5" marker-end="url(#ah)"/>'
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="{h-16}" text-anchor="middle" font-size="12" fill="{INK2}" font-style="italic">Taper the legs/back-sticks while still square (it&#39;s faster), then octagonalize. Eight facets read as “round” to the eye and hand. (Buchanan; Alexander)</text>'
svg+='</svg>'
open('05_stages.svg','w').write(svg)
print("05 ok")
