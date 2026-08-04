from style import *
import math

w,h = 1040, 644
svg = header(w,h)
svg += f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker>'
svg += f'<marker id="ahr" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker>'
svg += f'<marker id="ahg" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{SAGE}"/></marker></defs>'

svg += f'<text x="{w/2}" y="40" text-anchor="middle" font-size="25" fill="{INK}" font-weight="bold">Three Cuts, One Knife</text>'
svg += f'<text x="{w/2}" y="66" text-anchor="middle" font-size="14" fill="{INK2}" font-style="italic">Same drawknife, always bevel-down — you change the angle of attack, the grip, and which part of the body drives the pull</text>'

STEEL   = "#9aa0a6"
STEEL_D = "#7c8288"
H_NEAR  = "#6b4f33"
H_FAR   = "#8a6b4a"
BODY    = "#3d3128"
BODY_F  = "#5a4a3a"

PANEL_W = 320
X0 = 40
GAP = 12
panel_x = [X0 + i*(PANEL_W+GAP) for i in range(3)]
PY = 96          # panel top
PH = 400         # panel body height

# ---------- a compact drawknife, side view, BEVEL-DOWN ----------
# (ex,ey) cutting edge; angle deg (tool axis, +x edge->heel); handles turn up toward rider.
# skew: 0 = square blade; >0 draws a light skew hatch on the blade to signal a skewed cut.
def drawknife(ex, ey, angle, scale=1.0, skew=0):
    a=math.radians(angle); ca,sa=math.cos(a),math.sin(a)
    def P(dx,dy): return (ex+dx*ca-dy*sa, ey+dx*sa+dy*ca)
    bl=78*scale; bt=7*scale; s=''
    p1=P(2,-bt); p2=P(bl,-bt); p3=P(bl,bt); p4=P(2,bt)
    s+=f'<polygon points="{p1[0]:.1f},{p1[1]:.1f} {p2[0]:.1f},{p2[1]:.1f} {p3[0]:.1f},{p3[1]:.1f} {p4[0]:.1f},{p4[1]:.1f}" fill="{STEEL}" stroke="{INK}" stroke-width="1.5"/>'
    # bevel-down wedge under the edge
    bev=18*scale; tip=P(0,0); et=P(bev,-bt+1); eb=P(bev,bt)
    s+=f'<polygon points="{tip[0]:.1f},{tip[1]:.1f} {et[0]:.1f},{et[1]:.1f} {eb[0]:.1f},{eb[1]:.1f}" fill="{STEEL_D}" stroke="{INK}" stroke-width="1.1"/>'
    # skew hatch marks on the blade face (diagonal = held skewed)
    if skew:
        for t in (0.35,0.55,0.75):
            h1=P(bl*t,-bt+1); h2=P(bl*t+7,bt-1)
            s+=f'<line x1="{h1[0]:.1f}" y1="{h1[1]:.1f}" x2="{h2[0]:.1f}" y2="{h2[1]:.1f}" stroke="{INK2}" stroke-width="0.9" opacity="0.7"/>'
    # handles off the heel, up toward the rider
    hk=P(bl,0); gf=P(bl+28,-24); gn=P(bl+33,-4)
    s+=f'<line x1="{hk[0]:.1f}" y1="{hk[1]:.1f}" x2="{gf[0]:.1f}" y2="{gf[1]:.1f}" stroke="{H_FAR}" stroke-width="{8*scale:.1f}" stroke-linecap="round"/>'
    s+=f'<line x1="{hk[0]:.1f}" y1="{hk[1]:.1f}" x2="{gn[0]:.1f}" y2="{gn[1]:.1f}" stroke="{H_NEAR}" stroke-width="{10*scale:.1f}" stroke-linecap="round"/>'
    s+=f'<circle cx="{gn[0]:.1f}" cy="{gn[1]:.1f}" r="{5.5*scale:.1f}" fill="{H_NEAR}" stroke="{INK}" stroke-width="1"/>'
    s+=f'<circle cx="{gf[0]:.1f}" cy="{gf[1]:.1f}" r="{4.5*scale:.1f}" fill="{H_FAR}" stroke="{INK}" stroke-width="1"/>'
    return s, gn   # return the NEAR grip point (where the rider's hand goes)

# ---------- seated rider silhouette on a shavehorse, facing LEFT toward the work ----------
# Anchored so the forward HAND lands on (hand_x,hand_y) = the drawknife's near grip.
# 'drive' in {'shoulders','forearms','wrists'} highlights the driving segment in sage.
# Returns (svg, dict of segment-midpoints for leaders).
def rider(hand_x, hand_y, drive):
    s=''
    # build the body back-and-right from the gripping hand
    wrist=(hand_x, hand_y)
    elbow=(hand_x+40, hand_y+16)
    sh   =(hand_x+92, hand_y-6)        # shoulder
    hip  =(hand_x+104, hand_y+84)
    head =(hand_x+86, hand_y-34)
    knee =(hand_x+150, hand_y+96)
    foot =(hand_x+150, hand_y+150)
    # far thigh/shin (seated astride the bench), faint, drawn first
    s+=f'<line x1="{hip[0]}" y1="{hip[1]}" x2="{knee[0]-8}" y2="{knee[1]+4}" stroke="{BODY_F}" stroke-width="12" stroke-linecap="round"/>'
    s+=f'<line x1="{knee[0]-8}" y1="{knee[1]+4}" x2="{foot[0]-14}" y2="{foot[1]}" stroke="{BODY_F}" stroke-width="10" stroke-linecap="round"/>'
    # near thigh + shin
    s+=f'<line x1="{hip[0]}" y1="{hip[1]}" x2="{knee[0]}" y2="{knee[1]}" stroke="{BODY}" stroke-width="13" stroke-linecap="round"/>'
    s+=f'<line x1="{knee[0]}" y1="{knee[1]}" x2="{foot[0]}" y2="{foot[1]}" stroke="{BODY}" stroke-width="11" stroke-linecap="round"/>'
    # torso (hip -> shoulder) + head
    s+=f'<line x1="{hip[0]}" y1="{hip[1]}" x2="{sh[0]}" y2="{sh[1]}" stroke="{BODY}" stroke-width="22" stroke-linecap="round"/>'
    s+=f'<circle cx="{head[0]}" cy="{head[1]}" r="13" fill="{BODY}"/>'
    # arm: upper arm (shoulder->elbow), forearm (elbow->wrist/hand)
    ua_col = SAGE if drive=='shoulders' else BODY
    fa_col = SAGE if drive=='forearms' else BODY
    wr_col = SAGE if drive=='wrists' else BODY
    s+=f'<line x1="{sh[0]}" y1="{sh[1]}" x2="{elbow[0]}" y2="{elbow[1]}" stroke="{ua_col}" stroke-width="9" stroke-linecap="round"/>'
    s+=f'<line x1="{elbow[0]}" y1="{elbow[1]}" x2="{wrist[0]}" y2="{wrist[1]}" stroke="{fa_col}" stroke-width="8" stroke-linecap="round"/>'
    s+=f'<circle cx="{wrist[0]}" cy="{wrist[1]}" r="6.5" fill="{wr_col}"/>'
    segs={'shoulders':((sh[0]+elbow[0])/2,(sh[1]+elbow[1])/2),
          'forearms':((elbow[0]+wrist[0])/2,(elbow[1]+wrist[1])/2),
          'wrists':wrist}
    return s, segs

# ---------- angle-of-attack marker: a small protractor wedge at the edge ----------
# opens to the RIGHT: baseline along the work surface, ray up along the blade axis.
def attack_marker(ex, ey, angle, span, col):
    a=math.radians(angle)
    r=34
    x2=ex + r*math.cos(a); y2=ey - r*math.sin(a)      # up-right ray (the blade axis)
    xb=ex + r;             yb=ey                        # surface ray (right)
    s=f'<line x1="{ex}" y1="{ey}" x2="{xb}" y2="{yb}" stroke="{col}" stroke-width="1" stroke-dasharray="3,3" opacity="0.8"/>'
    s+=f'<path d="M{xb} {yb} A {r} {r} 0 0 0 {x2:.1f} {y2:.1f}" fill="none" stroke="{col}" stroke-width="1.4"/>'
    return s

panels = [
    dict(head="1 · Roughing", sub="heavy shaping",
         angle=30, skew=0, drive='shoulders', bite='deep',
         lines=["handles down, bite deep,","drive from the shoulders","— into the hillside"]),
    dict(head="2 · Refining", sub="finishing",
         angle=14, skew=1, drive='forearms', bite='light',
         lines=["handles up, skewed &amp; light,","from the forearms","— with the grain"]),
    dict(head="3 · Fitting", sub="dialing a tenon",
         angle=8, skew=2, drive='wrists', bite='feather',
         lines=["feather-light, heavy skew,","from the wrists","— shaving tenths, not shapes"]),
]

for i,p in enumerate(panels):
    px=panel_x[i]
    cx=px+PANEL_W/2
    # panel frame
    svg+=f'<rect x="{px}" y="{PY}" width="{PANEL_W}" height="{PH}" rx="10" fill="none" stroke="{RULE}" stroke-width="1.4" opacity="0.8"/>'
    # heading
    svg+=f'<text x="{cx}" y="{PY+30}" text-anchor="middle" font-size="18" fill="{INK}" font-weight="bold">{p["head"]}</text>'
    svg+=f'<text x="{cx}" y="{PY+50}" text-anchor="middle" font-size="12.5" fill="{INK2}" font-style="italic">{p["sub"]}</text>'

    # workpiece (a short stick clamped in the shavehorse), side view, LEFT of center
    wk_x = px+24; wk_y = PY+238; wk_w=150; wk_h=24
    svg+=f'<rect x="{wk_x}" y="{wk_y}" width="{wk_w}" height="{wk_h}" rx="3" fill="{WOOD_L}" stroke="{INK}" stroke-width="2"/>'
    # end grain nib at left (the free end being worked)
    svg+=f'<polygon points="{wk_x},{wk_y} {wk_x-12},{wk_y-7} {wk_x-12},{wk_y+wk_h-7} {wk_x},{wk_y+wk_h}" fill="{WOOD_D}" stroke="{INK}" stroke-width="1.6"/>'
    svg+=f'<polygon points="{wk_x},{wk_y} {wk_x-12},{wk_y-7} {wk_x+wk_w-12},{wk_y-7} {wk_x+wk_w},{wk_y}" fill="{WOOD}" stroke="{INK}" stroke-width="1.2"/>'
    # fibers along the stick
    for k in range(3):
        fy=wk_y+6+k*6
        svg+=f'<line x1="{wk_x+5}" y1="{fy}" x2="{wk_x+wk_w-5}" y2="{fy}" stroke="{WOOD_D}" stroke-width="0.8" opacity="0.6"/>'
    # a small bench bridge under the stick
    svg+=f'<rect x="{wk_x+20}" y="{wk_y+wk_h}" width="46" height="13" rx="3" fill="{WOOD}" stroke="{INK}" stroke-width="1.4"/>'

    # edge sits on the stick top toward the LEFT (free) end; handles reach up-RIGHT toward the rider
    ex=wk_x+46; ey=wk_y+1
    ang = -p["angle"]        # handles up-and-RIGHT (heel at +x, tilted up)
    # shaving peeling up-and-left off the edge — thickness keyed to the cut
    if p["bite"]=='deep':
        svg+=f'<path d="M{ex} {ey} q -24 -20 -46 -12 q 17 -16 35 -6 q -4 6 11 18 Z" fill="{WOOD_L}" stroke="{INK}" stroke-width="1.4"/>'
    elif p["bite"]=='light':
        svg+=f'<path d="M{ex} {ey} q -22 -12 -42 -16 q 16 -3 31 5 q -3 5 11 11 Z" fill="{PAPER}" stroke="{INK2}" stroke-width="1.1"/>'
    else:  # feather
        svg+=f'<path d="M{ex} {ey} q -20 -6 -38 -8" fill="none" stroke="{INK2}" stroke-width="1.1"/>'

    dk, grip = drawknife(ex, ey, ang, scale=1.0, skew=p["skew"])
    svg+=dk

    # rider seated to the RIGHT, its forward HAND on the drawknife's near grip
    rd, segs = rider(grip[0], grip[1], p["drive"])
    svg+=rd

    # angle-of-attack marker at the edge (opens up-right toward the handles)
    svg+=attack_marker(ex, ey, p["angle"], 34, RED)
    svg+=f'<text x="{ex+8}" y="{ey-26}" font-size="10.5" fill="{RED}" font-weight="bold">angle</text>'

    # "drive from the ___" callout, high in the panel, short leader DOWN to the sage segment
    seg = segs[p["drive"]]
    lbl_x=px+PANEL_W-118; lbl_y=PY+84
    svg+=f'<text x="{lbl_x}" y="{lbl_y}" font-size="11.5" fill="{SAGE}" font-weight="bold">drive from the</text>'
    svg+=f'<text x="{lbl_x}" y="{lbl_y+15}" font-size="11.5" fill="{SAGE}" font-weight="bold">{p["drive"]}</text>'
    svg+=f'<line x1="{lbl_x+40}" y1="{lbl_y+22}" x2="{seg[0]:.0f}" y2="{seg[1]-6:.0f}" stroke="{SAGE}" stroke-width="1" marker-end="url(#ahg)"/>'

    # descriptive lines under the artwork
    ly=PY+318
    for j,ln in enumerate(p["lines"]):
        wt = "bold" if j==0 else "normal"
        col = INK if j<2 else RED
        svg+=f'<text x="{cx}" y="{ly+j*20}" text-anchor="middle" font-size="12.5" fill="{col}" font-weight="{wt}">{ln}</text>'

# bottom takeaway
svg+=f'<text x="{w/2}" y="{h-62}" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">Lower the handles to bite; raise them and skew to ride the fibers; feather the pressure to fit.</text>'
svg+=f'<text x="{w/2}" y="{h-40}" text-anchor="middle" font-size="12" fill="{INK2}" font-style="italic">As the cut gets finer, the angle of attack flattens, the skew steepens, and the motion moves out toward the fingertips — bevel-down the whole way.</text>'

svg+=f'<text x="{w/2}" y="{h-2}" text-anchor="middle" font-size="11" fill="{INK2}" font-style="italic">After Peter Galbert, \u201cChairmaker\u2019s Notebook,\u201d Ch. 9\u201310.</text>'
svg+='</svg>'
open('19_cuttypes.svg','w').write(svg)
print("19 ok")
