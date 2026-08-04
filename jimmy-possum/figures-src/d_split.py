from style import *
import math

# ---- DIAGRAM 1: Splitting the log with sledge and wedge ----
w,h=900,560
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker><marker id="ahr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="40" text-anchor="middle" font-size="26" fill="{INK}" font-weight="bold">Section 1 · Splitting the Log: Sledge &amp; Wedge</text>'

# --- LEFT: log seen slightly from the side, end grain toward the viewer ---
# The end face is an upright ellipse; the log body recedes to the right.
cx,cy = 215,300          # centre of the end-grain face
rx,ry = 95,138           # face ellipse radii (oblique view)

# log body receding right (drawn first, behind the face)
bodyR=432
svg+=f'<path d="M{cx},{cy-ry} L{bodyR},185 A18 112 0 0 1 {bodyR},412 L{cx},{cy+ry} Z" fill="{WOOD_D}" stroke="none"/>'
svg+=f'<path d="M{cx},{cy-ry} L{bodyR},185 A18 112 0 0 1 {bodyR},412 L{cx},{cy+ry}" fill="none" stroke="{INK}" stroke-width="3"/>'
# faint bark texture along the body
for (x1,y1,x2,y2) in [(250,205,410,225),(260,300,420,300),(250,395,410,378)]:
    svg+=f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{INK2}" stroke-width="1" opacity="0.35"/>'
# crack travelling down the length (red dashes just under the top edge of the body)
svg+=f'<line x1="232" y1="168" x2="370" y2="184" stroke="{RED}" stroke-width="2" stroke-dasharray="3,5" opacity="0.9"/>'

# end-grain face: bark ring + wood + growth rings + rays
svg+=f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{WOOD_D}" stroke="{INK}" stroke-width="3"/>'
irx,iry = rx-11, ry-13
svg+=f'<ellipse cx="{cx}" cy="{cy}" rx="{irx}" ry="{iry}" fill="{WOOD}" stroke="{INK2}" stroke-width="1.5"/>'
for k in (0.24,0.44,0.63,0.82):
    svg+=f'<ellipse cx="{cx}" cy="{cy}" rx="{irx*k:.0f}" ry="{iry*k:.0f}" fill="none" stroke="{WOOD_D}" stroke-width="1" opacity="0.6"/>'
# medullary rays (faint radial spokes)
for a in range(0,360,30):
    rad=math.radians(a)
    x2=cx+(irx-5)*math.cos(rad); y2=cy+(iry-5)*math.sin(rad)
    svg+=f'<line x1="{cx}" y1="{cy}" x2="{x2:.0f}" y2="{y2:.0f}" stroke="{RAY}" stroke-width="0.7" opacity="0.35"/>'
# pith
svg+=f'<circle cx="{cx}" cy="{cy}" r="4.5" fill="{INK}"/>'
svg+=f'<text x="{cx+13}" y="{cy-7}" font-size="10.5" fill="{INK2}">pith</text>'

# score line: a thin BLACK knife line from the pith out to the bark (upper radius)
svg+=f'<line x1="{cx}" y1="{cy}" x2="{cx}" y2="{cy-ry+2}" stroke="{INK}" stroke-width="1.6"/>'
# the split path continuing pith -> bark on the far side (red dashes, distinct from the score)
svg+=f'<line x1="{cx}" y1="{cy+5}" x2="{cx}" y2="{cy+ry-3}" stroke="{RED}" stroke-width="3" stroke-dasharray="2,6"/>'

# wedge ON the end-grain face, ~1/3 of the radius in from the bark, sitting on the scored line.
# It points into the end grain (to the right, along the log's axis), head toward the viewer.
ey = cy - ry + ry/3          # entry point on the score line, 1/3 of the radius in from the bark
svg+=f'<polygon points="138,{ey-14:.0f} {cx+3},{ey-5:.0f} {cx+3},{ey+5:.0f} 138,{ey+14:.0f}" fill="#9aa0a6" stroke="{INK}" stroke-width="2"/>'
svg+=f'<rect x="129" y="{ey-16:.0f}" width="9" height="32" rx="2" fill="#7d7f84" stroke="{INK}" stroke-width="1.6"/>'   # struck face
# the crack starting under the wedge, following the score toward the pith
svg+=f'<line x1="{cx}" y1="{ey+4:.0f}" x2="{cx}" y2="{ey+46:.0f}" stroke="{RED}" stroke-width="2.5"/>'

# sledge blow: drives the wedge into the end grain (arrow along the wedge's axis)
svg+=f'<line x1="58" y1="{ey:.0f}" x2="116" y2="{ey:.0f}" stroke="{INK}" stroke-width="4" marker-end="url(#ah)"/>'
svg+=f'<text x="36" y="{ey-18:.0f}" font-size="13" fill="{INK}">sledge blow</text>'

# labels, fully clear of the log
svg+=f'<text x="48" y="108" font-size="14" fill="{INK}">steel wedge, on the scored line</text>'
svg+=f'<text x="48" y="126" font-size="11" fill="{INK2}">(start ~⅓ of the radius in — not at the edge)</text>'
svg+=f'<line x1="152" y1="132" x2="150" y2="{ey-14:.0f}" stroke="{INK2}" stroke-width="1"/>'
svg+=f'<text x="300" y="150" font-size="11.5" fill="{INK}">score pith → bark (thin knife line)</text>'
svg+=f'<line x1="302" y1="155" x2="{cx+3}" y2="184" stroke="{INK2}" stroke-width="1"/>'

svg+=f'<text x="{cx}" y="478" text-anchor="middle" font-size="14" fill="{RED}">split runs pith → bark, following the rays</text>'
svg+=f'<text x="{cx}" y="500" text-anchor="middle" font-size="13" fill="{INK2}" font-style="italic">halve, then quarter — keep equal mass either side</text>'

# --- RIGHT: log from above-left, leap-frogging wedges along the opening crack ---
lx,ly = 470,248            # top edge of the log body
lb = 362                   # bottom of the side face
lr = 838                   # right end
svg+=f'<text x="660" y="148" text-anchor="middle" font-size="15" fill="{INK}" font-weight="bold">Leap-frog the wedges along the crack</text>'

# log body (side face) with a rounded right end
svg+=f'<path d="M487,{ly} L{lr},{ly} A17 57 0 0 1 {lr},{lb} L487,{lb} Z" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
# faint grain lines along the side face
svg+=f'<line x1="500" y1="286" x2="{lr}" y2="286" stroke="{INK2}" stroke-width="0.9" opacity="0.3"/>'
svg+=f'<line x1="500" y1="324" x2="{lr}" y2="324" stroke="{INK2}" stroke-width="0.9" opacity="0.3"/>'
# LEFT end: end grain with radial spokes (so it reads as end grain, not a butt board)
ecx,ecy=487,(ly+lb)/2
svg+=f'<ellipse cx="{ecx}" cy="{ecy}" rx="17" ry="57" fill="{WOOD_D}" stroke="{INK}" stroke-width="2.5"/>'
for a in range(0,360,45):
    rad=math.radians(a)
    x2=ecx+12*math.cos(rad); y2=ecy+50*math.sin(rad)
    svg+=f'<line x1="{ecx}" y1="{ecy}" x2="{x2:.0f}" y2="{y2:.0f}" stroke="{INK2}" stroke-width="0.8" opacity="0.6"/>'
# the split showing on the end face (widest here, where splitting began)
svg+=f'<polygon points="{ecx-4},{ly} {ecx+4},{ly} {ecx},{ecy}" fill="#3a2d20"/>'
svg+=f'<line x1="{ecx}" y1="{ecy}" x2="{ecx}" y2="{lb-4}" stroke="{RED}" stroke-width="2"/>'

# the crack along the top edge: open at the left, tapering closed ahead of the lead wedge
crack_end=745
svg+=f'<path d="M504,{ly-4.5} Q630,{ly-2} {crack_end},{ly} Q630,{ly+3} 504,{ly+4.5} Z" fill="#3a2d20"/>'
# split path ahead of the crack (dashed red along the top edge)
svg+=f'<line x1="{crack_end}" y1="{ly}" x2="828" y2="{ly}" stroke="{RED}" stroke-width="2" stroke-dasharray="3,5"/>'

def wedge(x,top,bot,head_w,bot_w,fill="#9aa0a6",dash=None,op=1.0,tilt=0):
    d=f' stroke-dasharray="{dash}"' if dash else ''
    f=f'fill="{fill}"' if fill else 'fill="none"'
    tr=f' transform="rotate({tilt} {x} {bot})"' if tilt else ''
    return f'<polygon points="{x-head_w/2},{top} {x+head_w/2},{top} {x+bot_w/2},{bot} {x-bot_w/2},{bot}" {f} stroke="{INK}" stroke-width="1.8"{d} opacity="{op}"{tr}/>'

# each wedge is clipped at the surface: the buried part is inside the crack.
# wedge 1: freed — the gap has opened past it; it sits loose and canted
svg+=wedge(530,192,251,24,8,tilt=-7)
svg+=f'<text x="508" y="206" text-anchor="end" font-size="12" fill="{INK}">1</text>'
# glut (big wooden wedge) holding the gap open behind the steel
svg+=wedge(592,206,252,34,14,fill=WOOD_D)
svg+=f'<text x="592" y="198" text-anchor="middle" font-size="11" fill="{INK2}">glut</text>'
# wedge 2: half driven
svg+=wedge(655,213,250,22,10)
svg+=f'<text x="639" y="226" text-anchor="end" font-size="12" fill="{INK}">2</text>'
# wedge 3: the lead wedge, driven deep where the crack is still closed
svg+=wedge(720,224,249,20,13)
svg+=f'<text x="705" y="236" text-anchor="end" font-size="12" fill="{INK}">3</text>'
# small crack wisps where the lead wedge bites
svg+=f'<path d="M712,{ly+1} l-10,4 M728,{ly+1} l10,4" stroke="{INK}" stroke-width="1" fill="none" opacity="0.6"/>'
# ghosted wedge: where the freed wedge 1 goes next, ahead of the lead
svg+=wedge(790,206,248,24,8,fill="none",dash="4,3",op=0.85)
svg+=f'<text x="790" y="230" text-anchor="middle" font-size="12" font-style="italic" fill="{INK2}">1</text>'
# the leap-frog itself: freed wedge 1 arcs over 2 and 3 to lead the crack
svg+=f'<path d="M528,186 Q660,152 786,200" fill="none" stroke="{RED}" stroke-width="2.2" marker-end="url(#ahr)"/>'
svg+=f'<text x="660" y="166" text-anchor="middle" font-size="11.5" fill="{RED}">wedge 1 leaps ahead</text>'

svg+=f'<text x="660" y="400" text-anchor="middle" font-size="13" fill="{INK2}">As the crack opens, move the freed wedge ahead of the others.</text>'
svg+=f'<text x="660" y="420" text-anchor="middle" font-size="13" fill="{INK2}">Gluts (big wooden wedges) widen the gap — keep them off cross-fibers.</text>'

# caption strip
svg+=f'<text x="{w/2}" y="{h-16}" text-anchor="middle" font-size="12" fill="{INK2}" font-style="italic">Riven (split) parts follow the wood&#39;s long fibers — far stronger than sawn parts, and easier to shave true. (Langsner; Alexander)</text>'
svg+='</svg>'
open('01_split_log.svg','w').write(svg)
print("01 ok")
