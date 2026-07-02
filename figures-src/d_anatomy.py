from style import *
import math
w,h=760,780
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK2}"/></marker><marker id="ahr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="40" text-anchor="middle" font-size="23" fill="{INK}" font-weight="bold">Anatomy of a Jimmy Possum Chair</text>'
svg+=f'<text x="{w/2}" y="64" text-anchor="middle" font-size="12.5" fill="{INK2}" font-style="italic">A slight three-quarter view. The legs rake front-to-back only &#8212; from the front they stand plumb; nothing splays sideways.</text>'

# ---------- oblique projection: front face true, depth (front->back) up-right ----------
S=9.0              # px per inch (width & height)
DZX,DZY=2.4,-1.35  # px per inch of depth
cx,floorY=310,530
def P(X,Y,Z): return (cx+X*S+Z*DZX, floorY-Y*S+Z*DZY)

# ---------- chair in inches: X across (+right), Y up, Z front(0)->back ----------
# seat: 24 wide x 16 deep x 1.5 slab, top at 17.  side layout lines at X=+/-10.5.
# front legs through seat at Z=1.5 (slight rake); back legs at Z=11 (rake 22 deg);
# outer back sticks at Z=14.5 (rake 10 deg) -- on the SAME side lines as the legs.
def zFront(Y): return 1.5+0.074*(Y-17)
def zBack(Y):  return 11-math.tan(math.radians(22))*(Y-17)
def zStick(Y): return 14.5+math.tan(math.radians(10))*(Y-17)
ARM_Y0,ARM_Y1=25.5,26.5          # arm board, 1 in thick, 9 in above the seat
TIP_Y=28.2                        # leg tenons wedged proud above the arm
CREST_Y0,CREST_Y1=36.0,38.1       # modest comb
CREST_Z=17.9                      # depth of the comb (where the raked sticks arrive)

def member(p0,p1,w0,w1,fill=WOOD,sw=2.2,flat=None):
    x0,y0=p0; x1,y1=p1
    dx=x1-x0; dy=y1-y0; L=math.hypot(dx,dy) or 1; ox,oy=-dy/L,dx/L
    b1=(x0+ox*w0/2,y0+oy*w0/2); b2=(x0-ox*w0/2,y0-oy*w0/2)
    t1=(x1+ox*w1/2,y1+oy*w1/2); t2=(x1-ox*w1/2,y1-oy*w1/2)
    if flat is not None:   # level foot: cut horizontally at y=flat
        def hit(p,q): return (p[0]+(flat-p[1])*(q[0]-p[0])/(q[1]-p[1]),flat)
        b1=hit(b1,t1); b2=hit(b2,t2)
    pts=[b1,b2,t2,t1]
    return f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a,b in pts)}" fill="{fill}" stroke="{INK}" stroke-width="{sw}"/>'
def quad(pts,fill,sw=2.5):
    return f'<polygon points="{" ".join(f"{a:.1f},{b:.1f}" for a,b in pts)}" fill="{fill}" stroke="{INK}" stroke-width="{sw}"/>'
def wedge(tx,ty):
    return (f'<polygon points="{tx-4:.1f},{ty:.1f} {tx+4:.1f},{ty:.1f} {tx+1.6:.1f},{ty+10:.1f} {tx-1.6:.1f},{ty+10:.1f}"'
            f' fill="{RED}" stroke="{INK}" stroke-width="1"/>')

# ---------- painter's order, back to front ----------
# 1) legs BELOW the seat (slab drawn over their tops)
for sgn in (-1,1):
    X=sgn*10.5
    svg+=member(P(X,0,zBack(0)),P(X,15.8,zBack(15.8)),17,14,flat=P(0,0,zBack(0))[1])
    svg+=member(P(X,0,zFront(0)),P(X,16.2,zFront(16.2)),17,14,flat=P(0,0,zFront(0))[1])
# 2) crest (modest comb across the stick tops)
lb=P(-12,CREST_Y0,CREST_Z); rb=P(12,CREST_Y0,CREST_Z)
lt=P(-12,CREST_Y1,CREST_Z); rt=P(12,CREST_Y1,CREST_Z); mt=P(0,CREST_Y1+1.5,CREST_Z)
svg+=f'<path d="M{lb[0]:.1f} {lb[1]:.1f} L{rb[0]:.1f} {rb[1]:.1f} L{rt[0]:.1f} {rt[1]:.1f} Q {mt[0]:.1f} {mt[1]:.1f} {lt[0]:.1f} {lt[1]:.1f} Z" fill="{WOOD_D}" stroke="{INK}" stroke-width="2.5"/>'
# 3) seat: rectangular slab, 24 x 16 x 1.5
svg+=quad([P(-12,17,0),P(12,17,0),P(12,17,16),P(-12,17,16)],WOOD_L)      # top
svg+=quad([P(12,17,0),P(12,17,16),P(12,15.5,16),P(12,15.5,0)],WOOD_D)    # right end
svg+=quad([P(-12,17,0),P(12,17,0),P(12,15.5,0),P(-12,15.5,0)],WOOD)      # front edge
# 4) inner back sticks (seat top to crest)
for X in (-5.25,0,5.25):
    svg+=member(P(X,16.8,zStick(16.8)),P(X,36.3,zStick(36.3)),9,7.5)
# 5) arms: slim boards, 2.5 in wide, running front-to-back
for sgn in (-1,1):
    xi,xo=sgn*9.25,sgn*11.75
    svg+=quad([P(xi,ARM_Y1,0.5),P(xo,ARM_Y1,0.5),P(xo,ARM_Y1,17.3),P(xi,ARM_Y1,17.3)],WOOD_L)  # top
    if sgn>0:  # right-hand side face (matches the seat's visible end face)
        svg+=quad([P(xo,ARM_Y1,0.5),P(xo,ARM_Y1,17.3),P(xo,ARM_Y0,17.3),P(xo,ARM_Y0,0.5)],WOOD_D)
    svg+=quad([P(xi,ARM_Y1,0.5),P(xo,ARM_Y1,0.5),P(xo,ARM_Y0,0.5),P(xi,ARM_Y0,0.5)],WOOD)      # front end
# 6) outer back sticks: one piece through seat AND arm, up to the crest
for sgn in (-1,1):
    X=sgn*10.5
    svg+=member(P(X,16.8,zStick(16.8)),P(X,36.3,zStick(36.3)),9.5,8)
# 7) legs ABOVE the seat: through the slab, up THROUGH the arm, wedged proud
for sgn in (-1,1):
    X=sgn*10.5
    svg+=member(P(X,16.8,zBack(16.8)),P(X,TIP_Y,zBack(TIP_Y)),13,11)
    svg+=member(P(X,16.8,zFront(16.8)),P(X,TIP_Y,zFront(TIP_Y)),13,11)
# 8) side layout lines, drawn over the seat and member bases as an annotation:
#    front leg, back leg and outer stick are all bored on this one line
for sgn in (-1,1):
    a=P(sgn*10.5,17,0.5); b=P(sgn*10.5,17,15.3)
    svg+=f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{RED}" stroke-width="1.7" stroke-dasharray="4,3.5"/>'
# 9) wedges: leg tenons proud of the arms; sticks wedged where they pass the arm
for sgn in (-1,1):
    svg+=wedge(*P(sgn*10.5,TIP_Y,zFront(TIP_Y)))
    svg+=wedge(*P(sgn*10.5,TIP_Y,zBack(TIP_Y)))
    sx,sy=P(sgn*10.5,27.6,zStick(27.6))
    svg+=wedge(sx,sy-6)

# ---------- labels ----------
def lab(x,y,tx,ty,text,anchor='start'):
    s=f'<line x1="{tx}" y1="{ty}" x2="{x}" y2="{y}" stroke="{INK2}" stroke-width="1" marker-end="url(#ah)"/>'
    s+=f'<text x="{tx}" y="{ty-4 if ty<y else ty+13}" font-size="13" fill="{INK}" text-anchor="{anchor}">{text}</text>'
    return s
svg+=lab(242,166,209,161,"crest (comb)","end")
svg+=lab(450,235,502,226,"back sticks &#8212; about 1 in")
svg+=lab(461,271,502,266,"arm &#8212; a board about 2&#189; in wide")
svg+=lab(216,270,172,259,"legs wedged proud","end")
svg+=lab(460,356,502,352,"slab seat &#8212; 24 &#215; 16 &#215; 1&#189; in")
svg+=f'<text x="{w/2}" y="556" text-anchor="middle" font-size="12" fill="{RED}" font-style="italic">front leg, back leg and outer back stick all rise from one side layout line (dashed) &#8212; 1&#189; in inside each seat edge</text>'

# ---------- the signature joint callout ----------
bx,byy=130,584
svg+=f'<rect x="{bx}" y="{byy}" width="250" height="118" rx="10" fill="none" stroke="{RED}" stroke-width="1.5" stroke-dasharray="4,4"/>'
svg+=f'<line x1="{bx+32}" y1="{byy}" x2="211" y2="391" stroke="{RED}" stroke-width="1.2" marker-end="url(#ahr)"/>'
svg+=f'<text x="{bx+12}" y="{byy+22}" font-size="13" fill="{RED}" font-weight="bold">The signature joint:</text>'
svg+=f'<text x="{bx+12}" y="{byy+42}" font-size="12" fill="{INK2}">legs pass through the seat and</text>'
svg+=f'<text x="{bx+12}" y="{byy+60}" font-size="12" fill="{INK2}">continue up into the arms,</text>'
svg+=f'<text x="{bx+12}" y="{byy+78}" font-size="12" fill="{INK2}">locked with wooden wedges.</text>'
svg+=f'<text x="{bx+12}" y="{byy+100}" font-size="11" fill="{INK2}" font-style="italic">No screws &#8212; wood locking wood.</text>'

svg+=f'<text x="{w/2}" y="{h-14}" text-anchor="middle" font-size="11.5" fill="{INK2}" font-style="italic">A folk chair: parts riven from green wood, shaved by hand, and locked with wedged through-tenons.</text>'
svg+='</svg>'
open('00_anatomy.svg','w').write(svg)
print("00 ok")
