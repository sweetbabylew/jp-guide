from style import *
import math, random

w,h = 980, 584
svg = header(w,h)
svg += f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker>'
svg += f'<marker id="ahr" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker></defs>'

svg += f'<text x="{w/2}" y="40" text-anchor="middle" font-size="25" fill="{INK}" font-weight="bold">Roughing &amp; Refining</text>'
svg += f'<text x="{w/2}" y="66" text-anchor="middle" font-size="14" fill="{INK2}" font-style="italic">One knife, held bevel-down throughout — the difference is how it meets the fibers</text>'

STEEL = "#9aa0a6"
STEEL_D = "#7c8288"
H_NEAR = "#6b4f33"
H_FAR  = "#8a6b4a"

def jag(x1,y1,x2,y2,segs,amp,seed):
    rnd=random.Random(seed); pts=[]
    for i in range(segs+1):
        t=i/segs; x=x1+(x2-x1)*t; y=y1+(y2-y1)*t
        dx=x2-x1; dy=y2-y1; L=math.hypot(dx,dy) or 1
        px,py=-dy/L,dx/L
        j=0 if i in (0,segs) else rnd.uniform(-amp,amp)
        pts.append((x+px*j,y+py*j))
    return pts

# ---- A drawknife drawn BEVEL-DOWN, side view. The blade is IN LINE with the handles
# (one straight axis); the handles turn UP toward the rider at the heel end.
# (ex,ey) = the cutting EDGE, placed exactly where the tool meets the work.
# angle: tool-axis rotation (deg); positive tips the HEEL up so the edge digs (handles down).
# The bevel facet is on the UNDERSIDE (bevel-down), sitting on the work.
def drawknife(ex, ey, angle, scale=1.0):
    a = math.radians(angle)
    ca, sa = math.cos(a), math.sin(a)
    # local axis: +x runs from the edge back toward the heel; y up(-)/down(+)
    def P(dx,dy):
        return (ex + dx*ca - dy*sa, ey + dx*sa + dy*ca)
    bl = 96*scale      # blade length (edge -> heel)
    bt = 8*scale       # blade body thickness
    s = ''
    # --- blade body (a straight bar back from the edge) ---
    p1=P(2,-bt); p2=P(bl,-bt); p3=P(bl, bt); p4=P(2, bt)
    s += f'<polygon points="{p1[0]:.1f},{p1[1]:.1f} {p2[0]:.1f},{p2[1]:.1f} {p3[0]:.1f},{p3[1]:.1f} {p4[0]:.1f},{p4[1]:.1f}" fill="{STEEL}" stroke="{INK}" stroke-width="1.6"/>'
    # --- bevel facet on the UNDERSIDE at the edge (bevel-down) — a wedge tapering to the edge tip ---
    bev = 22*scale
    tip=P(0, 0)
    e_top=P(bev, -bt+1); e_bot=P(bev, bt)
    s += f'<polygon points="{tip[0]:.1f},{tip[1]:.1f} {e_top[0]:.1f},{e_top[1]:.1f} {e_bot[0]:.1f},{e_bot[1]:.1f}" fill="{STEEL_D}" stroke="{INK}" stroke-width="1.2"/>'
    # --- two handles off the heel end, turning UP and back toward the rider ---
    hk = P(bl,0)
    g_far = P(bl+34, -30)
    g_near= P(bl+40, -6)
    s += f'<line x1="{hk[0]:.1f}" y1="{hk[1]:.1f}" x2="{g_far[0]:.1f}" y2="{g_far[1]:.1f}" stroke="{H_FAR}" stroke-width="{9*scale:.1f}" stroke-linecap="round"/>'
    s += f'<line x1="{hk[0]:.1f}" y1="{hk[1]:.1f}" x2="{g_near[0]:.1f}" y2="{g_near[1]:.1f}" stroke="{H_NEAR}" stroke-width="{11*scale:.1f}" stroke-linecap="round"/>'
    s += f'<circle cx="{g_near[0]:.1f}" cy="{g_near[1]:.1f}" r="{6*scale:.1f}" fill="{H_NEAR}" stroke="{INK}" stroke-width="1"/>'
    s += f'<circle cx="{g_far[0]:.1f}" cy="{g_far[1]:.1f}" r="{5*scale:.1f}" fill="{H_FAR}" stroke="{INK}" stroke-width="1"/>'
    return s, tip

# ======================= LEFT PANEL: ROUGHING =======================
LX = 250
# billet (a squared stick, side view) on the bench
b_x, b_y, b_w, b_h = LX-165, 300, 330, 48
svg += f'<rect x="{b_x}" y="{b_y}" width="{b_w}" height="{b_h}" rx="3" fill="{WOOD}" stroke="{INK}" stroke-width="2.2"/>'
# end-grain block at the right end
svg += f'<polygon points="{b_x+b_w},{b_y} {b_x+b_w+24},{b_y-13} {b_x+b_w+24},{b_y+b_h-13} {b_x+b_w},{b_y+b_h}" fill="{WOOD_D}" stroke="{INK}" stroke-width="2"/>'
svg += f'<polygon points="{b_x},{b_y} {b_x+24},{b_y-13} {b_x+b_w+24},{b_y-13} {b_x+b_w},{b_y}" fill="{WOOD_L}" stroke="{INK}" stroke-width="1.6"/>'

# rising fiber lines on the near face — they ASCEND toward the right (toward where the knife bites in)
# roughing = knife travels toward the rider (left) INTO these rising fibers ("into the hillside")
for i in range(6):
    fy = b_y + 9 + i*6.4
    svg += f'<path d="M{b_x+6} {fy+11} Q {b_x+b_w*0.5} {fy+2} {b_x+b_w-6} {fy-9}" fill="none" stroke="{WOOD_D}" stroke-width="1.1" opacity="0.75"/>'

# the CUT ZONE: a peeled step where the knife has already lifted a layer.
# right of the edge = even, freshly-peeled lower level; left of it = torn stubble ("landing strip")
cut_top = b_y + 6
knife_x = LX + 4         # x where the edge bites
# freshly peeled even level (right of the edge) — a shaded band a little below the surface
svg += f'<path d="M{knife_x} {cut_top} L {b_x+b_w-6} {cut_top} L {b_x+b_w-6} {cut_top+9} L {knife_x} {cut_top+9} Z" fill="{WOOD_L}" stroke="none" opacity="0.9"/>'
svg += f'<line x1="{knife_x}" y1="{cut_top+9}" x2="{b_x+b_w-6}" y2="{cut_top+9}" stroke="{INK2}" stroke-width="1" opacity="0.6"/>'
# torn fiber stubble left where the knife lifts out (left of the edge) — the landing-strip clue
stub = jag(b_x+14, cut_top+9, knife_x-4, cut_top+9, 14, 3.2, 7)
sp = ' '.join(f'{x:.1f},{y:.1f}' for x,y in stub)
svg += f'<polyline points="{sp}" fill="none" stroke="{RED}" stroke-width="1.4" opacity="0.85"/>'

# a THICK peel/shaving curling up off the edge (rides up-and-left, the pull direction)
svg += f'<path d="M{knife_x} {cut_top} q -30 -30 -60 -20 q 22 -22 48 -8 q -6 8 12 28 Z" fill="{WOOD_L}" stroke="{INK}" stroke-width="1.6"/>'
for k in range(2):
    svg += f'<path d="M{knife_x-6-k*9} {cut_top-4} q -20 -16 -40 -12" fill="none" stroke="{WOOD_D}" stroke-width="0.8" opacity="0.7"/>'

# the drawknife biting IN, handles DROPPED so the edge digs. Edge at the cut step;
# tool axis runs up-and-LEFT to the grips (rider is to the left). Bevel-down under the edge.
dk, tip = drawknife(knife_x, cut_top+3, 200, scale=1.0)
svg += dk

# motion arrow: pull toward the rider (to the LEFT), into the rising fibers
svg += f'<line x1="{LX+78}" y1="{b_y-40}" x2="{LX-80}" y2="{b_y-40}" stroke="{RED}" stroke-width="3" marker-end="url(#ahr)"/>'
svg += f'<text x="{LX}" y="{b_y-48}" text-anchor="middle" font-size="12.5" fill="{RED}" font-weight="bold">pull — into the hillside</text>'

# panel heading
svg += f'<text x="{LX}" y="118" text-anchor="middle" font-size="19" fill="{INK}" font-weight="bold">Roughing</text>'
svg += f'<text x="{LX}" y="140" text-anchor="middle" font-size="12.5" fill="{INK2}" font-style="italic">fast shaping — a little torn is fine</text>'

# labels for the left panel (kept clear of the artwork, with leaders)
# into the hillside
svg += f'<text x="{b_x-6}" y="{b_y+b_h+40}" font-size="12.5" fill="{INK}" font-weight="bold">into the hillside —</text>'
svg += f'<text x="{b_x-6}" y="{b_y+b_h+57}" font-size="12.5" fill="{INK}">peel to an even fiber level</text>'
# rising fibers note
svg += f'<text x="{b_x-6}" y="{b_y+b_h+80}" font-size="11" fill="{INK2}">the knife bites into the rising fibers</text>'
# torn-stubble / landing-strip clue callout
svg += f'<line x1="{(b_x+knife_x)/2}" y1="{cut_top+9}" x2="{(b_x+knife_x)/2}" y2="{b_y+b_h+18}" stroke="{RED}" stroke-width="1" stroke-dasharray="2,3"/>'
svg += f'<text x="{(b_x+knife_x)/2}" y="{b_y+b_h+100}" text-anchor="middle" font-size="10.5" fill="{RED}">the torn fibers left where the knife lifts out</text>'
svg += f'<text x="{(b_x+knife_x)/2}" y="{b_y+b_h+114}" text-anchor="middle" font-size="10.5" fill="{RED}">mark the level for the next pass</text>'

# ======================= divider =======================
svg += f'<line x1="{w/2}" y1="150" x2="{w/2}" y2="500" stroke="{RULE}" stroke-width="1.2" stroke-dasharray="4,5" opacity="0.7"/>'

# ======================= RIGHT PANEL: REFINING =======================
RX = 730
b2_x, b2_y, b2_w, b2_h = RX-165, 300, 330, 48
svg += f'<rect x="{b2_x}" y="{b2_y}" width="{b2_w}" height="{b2_h}" rx="3" fill="{WOOD}" stroke="{INK}" stroke-width="2.2"/>'
svg += f'<polygon points="{b2_x+b2_w},{b2_y} {b2_x+b2_w+24},{b2_y-13} {b2_x+b2_w+24},{b2_y+b2_h-13} {b2_x+b2_w},{b2_y+b2_h}" fill="{WOOD_D}" stroke="{INK}" stroke-width="2"/>'
svg += f'<polygon points="{b2_x},{b2_y} {b2_x+24},{b2_y-13} {b2_x+b2_w+24},{b2_y-13} {b2_x+b2_w},{b2_y}" fill="{WOOD_L}" stroke="{INK}" stroke-width="1.6"/>'

# fibers lie flat/with the surface — the knife RIDES OVER them (the way they lie, like petting a cat)
for i in range(6):
    fy = b2_y + 10 + i*6.2
    svg += f'<path d="M{b2_x+6} {fy} Q {b2_x+b2_w*0.5} {fy-2} {b2_x+b2_w-6} {fy}" fill="none" stroke="{WOOD_D}" stroke-width="1.0" opacity="0.7"/>'
# a smooth glassy top surface (a clean highlight band just below the top)
svg += f'<line x1="{b2_x+6}" y1="{b2_y+6}" x2="{b2_x+b2_w-6}" y2="{b2_y+6}" stroke="{PAPER}" stroke-width="2.5"/>'
svg += f'<line x1="{b2_x+6}" y1="{b2_y+7.5}" x2="{b2_x+b2_w-6}" y2="{b2_y+7.5}" stroke="{INK2}" stroke-width="0.7" opacity="0.5"/>'

# the drawknife riding along the surface, edge nearly flat on the top face, handles a touch UP.
# skewed & light — it slips over the fibers rather than digging.
knife2_x = RX + 4         # x where the edge rides
ride_y = b2_y + 5
# a THIN wispy shaving peeling up-and-left off the edge
svg += f'<path d="M{knife2_x} {ride_y} q -28 -14 -56 -22 q 20 -4 40 6 q -4 6 16 16 Z" fill="{PAPER}" stroke="{INK2}" stroke-width="1.1"/>'
svg += f'<path d="M{knife2_x-6} {ride_y-2} q -22 -10 -44 -16" fill="none" stroke="{INK2}" stroke-width="0.7" opacity="0.7"/>'
# edge at the surface; tool axis up-and-LEFT to the grips, but nearly FLAT (handles just a touch high)
dk2, tip2 = drawknife(knife2_x, ride_y, 188, scale=1.0)
svg += dk2

# motion arrow: pull toward the rider (left), riding over the fibers
svg += f'<line x1="{RX+78}" y1="{b2_y-40}" x2="{RX-80}" y2="{b2_y-40}" stroke="{RED}" stroke-width="3" marker-end="url(#ahr)"/>'
svg += f'<text x="{RX}" y="{b2_y-48}" text-anchor="middle" font-size="12.5" fill="{RED}" font-weight="bold">pull — with the grain</text>'

svg += f'<text x="{RX}" y="118" text-anchor="middle" font-size="19" fill="{INK}" font-weight="bold">Refining</text>'
svg += f'<text x="{RX}" y="140" text-anchor="middle" font-size="12.5" fill="{INK2}" font-style="italic">light finishing &amp; fitting — leaves it smooth</text>'

svg += f'<text x="{b2_x-6}" y="{b2_y+b2_h+40}" font-size="12.5" fill="{INK}" font-weight="bold">with the grain —</text>'
svg += f'<text x="{b2_x-6}" y="{b2_y+b2_h+57}" font-size="12.5" fill="{INK}">refine the shape, smooth</text>'
svg += f'<text x="{b2_x-6}" y="{b2_y+b2_h+80}" font-size="11" fill="{INK2}">the knife rides over the fibers the way they lie —</text>'
svg += f'<text x="{b2_x-6}" y="{b2_y+b2_h+95}" font-size="11" fill="{INK2}">a thin, wispy shaving, a glassy surface</text>'

# ======================= bottom caption =======================
svg += f'<text x="{w/2}" y="{h-24}" text-anchor="middle" font-size="12.5" fill="{INK2}" font-style="italic">Rough into the hillside to an even level; refine with the grain to a finish. The knife stays bevel-down — blade in line with the handles — throughout.</text>'

svg += f'<text x="{w/2}" y="{h-2}" text-anchor="middle" font-size="11" fill="{INK2}" font-style="italic">After Peter Galbert, \u201cChairmaker\u2019s Notebook,\u201d Ch. 10.</text>'
svg += '</svg>'
open('18_roughrefine.svg','w').write(svg)
print("18 ok")
