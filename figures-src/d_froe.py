from style import *
import math
w,h=900,600
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker>'
svg+=f'<marker id="ahr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto-start-reverse"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="40" text-anchor="middle" font-size="24" fill="{INK}" font-weight="bold">Riving Chair Parts with a Froe</text>'
svg+=f'<text x="{w/2}" y="64" text-anchor="middle" font-size="13" fill="{INK2}" font-style="italic">Side view: the billet lies horizontal in the riving brake — the club seats the froe into the end grain, then the handle levers up and down</text>'

# ---- riving brake: two crossed stakes, the billet threaded THROUGH the X ----
# far stake first (the billet passes in front of it)
svg+=f'<line x1="838" y1="448" x2="723" y2="180" stroke="#6b4f33" stroke-width="14" stroke-linecap="round"/>'

# ---- the BILLET, parallel to the ground, end grain at the LEFT ----
bx,by,bw,bh = 370,258,442,104
midy=by+bh/2                         # 310
svg+=f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="4" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
# end-grain face at the LEFT end
svg+=f'<rect x="{bx}" y="{by}" width="16" height="{bh}" fill="{WOOD_D}" stroke="{INK2}" stroke-width="1"/>'
for yy in range(by+10,by+bh,12):
    svg+=f'<line x1="{bx+3}" y1="{yy}" x2="{bx+13}" y2="{yy}" stroke="{INK2}" stroke-width="0.7"/>'
# faint grain hints along the billet (gapped around the split label)
svg+=f'<line x1="395" y1="278" x2="445" y2="278" stroke="{INK2}" stroke-width="0.9" opacity="0.28"/>'
svg+=f'<line x1="680" y1="278" x2="795" y2="278" stroke="{INK2}" stroke-width="0.9" opacity="0.28"/>'
svg+=f'<line x1="395" y1="344" x2="795" y2="344" stroke="{INK2}" stroke-width="0.9" opacity="0.28"/>'
svg+=f'<text x="560" y="390" text-anchor="middle" font-size="12" fill="{INK2}">billet (chair-part length), end grain at left</text>'

# ---- split: starts at the froe edge, runs right along the grain ----
svg+=f'<path d="M378,{midy} C 470,{midy-4} 520,{midy+4} 600,{midy-1} S 690,{midy+2} 722,{midy}" fill="none" stroke="{RED}" stroke-width="2.5"/>'
svg+=f'<text x="560" y="292" text-anchor="middle" font-size="11.5" fill="{RED}">split runs along the grain →</text>'

# ---- the FROE: blade VERTICAL across the left end grain, edge biting in;
#      eye at the top of the blade, handle running horizontally LEFT (parallel to the billet) ----
svg+=f'<rect x="356" y="182" width="20" height="226" fill="#9aa0a6" stroke="{INK}" stroke-width="1.8"/>'   # blade, edge 6px into the face
svg+=f'<line x1="352" y1="198" x2="150" y2="198" stroke="#8a6b4a" stroke-width="12" stroke-linecap="round"/>'  # handle, horizontal
svg+=f'<rect x="348" y="186" width="36" height="24" rx="5" fill="#7d7f84" stroke="{INK}" stroke-width="1.8"/>' # eye
svg+=f'<text x="470" y="144" text-anchor="middle" font-size="13.5" fill="{INK}">froe — blade across the end grain</text>'
svg+=f'<line x1="400" y1="150" x2="368" y2="180" stroke="{INK2}" stroke-width="1"/>'
svg+=f'<text x="250" y="176" text-anchor="middle" font-size="11" fill="{INK2}">handle parallel to the billet</text>'

# ---- lever motion: arced, double-headed, DOTTED arrow centred on the handle ----
svg+=f'<path d="M168,120 Q 118,198 168,276" fill="none" stroke="{RED}" stroke-width="2.2" stroke-dasharray="1,7" stroke-linecap="round" marker-start="url(#ahr)" marker-end="url(#ahr)"/>'
svg+=f'<text x="140" y="306" text-anchor="middle" font-size="13" fill="{RED}">lever up / down</text>'
svg+=f'<text x="140" y="324" text-anchor="middle" font-size="11" fill="{INK2}">to open &amp; steer the split</text>'

# ---- the CLUB: LEFT of the billet, face striking the blade&#39;s spine ----
svg+=f'<rect x="302" y="276" width="34" height="68" rx="10" fill="{WOOD_D}" stroke="{INK}" stroke-width="2"/>'   # head
svg+=f'<line x1="309" y1="338" x2="202" y2="414" stroke="#8a6b4a" stroke-width="9" stroke-linecap="round"/>'     # handle
# impact marks between club face and the froe&#39;s spine
for (x1,y1,x2,y2) in [(352,298,343,291),(350,310,340,310),(352,322,343,329),(353,287,348,278)]:
    svg+=f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{INK}" stroke-width="1.5"/>'
svg+=f'<text x="210" y="452" text-anchor="middle" font-size="13" fill="{INK}">club seats the blade</text>'
svg+=f'<text x="210" y="470" text-anchor="middle" font-size="11" fill="{INK2}">(smack the spine — drive the edge into the end grain)</text>'

# near stake of the brake, crossing IN FRONT of the billet
svg+=f'<line x1="708" y1="448" x2="823" y2="180" stroke="#8a6b4a" stroke-width="14" stroke-linecap="round"/>'
svg+=f'<text x="765" y="470" text-anchor="middle" font-size="13" fill="{INK}">riving brake</text>'
svg+=f'<text x="765" y="487" text-anchor="middle" font-size="11" fill="{INK2}">(holds the billet; self-binds as you lever)</text>'
svg+=f'<line x1="765" y1="458" x2="765" y2="368" stroke="{INK2}" stroke-width="1"/>'

# ---- principle band ----
svg+=f'<text x="{w/2}" y="{h-92}" text-anchor="middle" font-size="15" fill="{INK}" font-weight="bold">Riving = controlled splitting</text>'
svg+=f'<text x="{w/2}" y="{h-70}" text-anchor="middle" font-size="13" fill="{INK2}">Keep equal mass on both sides and the split runs straight. If it wanders toward the thin side,</text>'
svg+=f'<text x="{w/2}" y="{h-52}" text-anchor="middle" font-size="13" fill="{INK2}">lever the froe toward the thick side to pull it back. “Tic-tic-tic… and you’re back on track.”</text>'
svg+=f'<text x="{w/2}" y="{h-22}" text-anchor="middle" font-size="11.5" fill="{INK2}" font-style="italic">An errant blow leaves an irreparable plane of weakness. Good, straight, long-fibered stock is a precious gift. (Alexander, MACFAT)</text>'
svg+='</svg>'
open('02_froe_riving.svg','w').write(svg)
print("02 redrawn")
