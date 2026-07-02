from style import *
import math
w,h=900,600
svg=header(w,h)
svg+=f'<defs><marker id="ah" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{INK}"/></marker><marker id="ahr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="40" text-anchor="middle" font-size="24" fill="{INK}" font-weight="bold">Riving Chair Parts with a Froe</text>'
svg+=f'<text x="{w/2}" y="64" text-anchor="middle" font-size="13" fill="{INK2}" font-style="italic">Side view: seat the froe across the end of the bolt with the club, then lever the handle to open the split</text>'

# ---- riving brake: two crossed stakes, the bolt threaded THROUGH the X ----
# far stake first (the bolt passes in front of it)
svg+=f'<line x1="830" y1="448" x2="715" y2="172" stroke="#6b4f33" stroke-width="14" stroke-linecap="round"/>'

# ---- the BOLT lying horizontally, end grain (where the froe enters) at the LEFT ----
bx,by,bw,bh = 250, 250, 540, 90      # bolt body; right end threads through the brake
midy=by+bh*0.42
svg+=f'<rect x="{bx}" y="{by}" width="{bw}" height="{bh}" rx="4" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
# end-grain face at the LEFT end
svg+=f'<rect x="{bx}" y="{by}" width="14" height="{bh}" fill="{WOOD_D}" stroke="{INK2}" stroke-width="1"/>'
for yy in range(by+10,by+bh,12):
    svg+=f'<line x1="{bx+2}" y1="{yy}" x2="{bx+12}" y2="{yy}" stroke="{INK2}" stroke-width="0.7"/>'
svg+=f'<text x="{bx+bw/2-40}" y="{by+bh+26}" text-anchor="middle" font-size="12" fill="{INK2}">bolt (chair-part length), end grain at left</text>'

# near stake of the brake, crossing IN FRONT of the bolt
svg+=f'<line x1="700" y1="448" x2="815" y2="172" stroke="#8a6b4a" stroke-width="14" stroke-linecap="round"/>'
svg+=f'<text x="765" y="467" text-anchor="middle" font-size="13" fill="{INK}">riving brake</text>'
svg+=f'<text x="765" y="484" text-anchor="middle" font-size="11" fill="{INK2}">(holds the bolt; self-binds as you lever)</text>'
svg+=f'<line x1="765" y1="455" x2="765" y2="348" stroke="{INK2}" stroke-width="1"/>'

# ---- ONE split, opening from the froe's edge and running right along the grain ----
svg+=f'<path d="M340,{midy} C 400,{midy-5} 460,{midy+3} 560,{midy-1} S 620,{midy+1} 640,{midy}" fill="none" stroke="{RED}" stroke-width="2.5"/>'
svg+=f'<text x="420" y="{midy-14}" font-size="11.5" fill="{RED}">split opens along the grain →</text>'

# ---- the FROE: blade across the end grain, spine exposed, handle rising as a lever ----
# blade: horizontal bar, bitten into the end of the bolt; the part left of the
# end-grain face is the exposed spine you strike
svg+=f'<rect x="140" y="{midy-6}" width="195" height="12" fill="#9aa0a6" stroke="{INK}" stroke-width="2"/>'
# eye/socket at the left end of the blade
svg+=f'<rect x="134" y="{midy-11}" width="22" height="22" rx="4" fill="#7d7f84" stroke="{INK}" stroke-width="1.8"/>'
# handle rising from the eye (near-vertical: it is the lever)
svg+=f'<line x1="149" y1="{midy}" x2="108" y2="110" stroke="#8a6b4a" stroke-width="13" stroke-linecap="round"/>'
svg+=f'<text x="126" y="94" font-size="14" fill="{INK}">froe handle (lever)</text>'
svg+=f'<text x="140" y="113" font-size="12" fill="{RED}">lever to pry &amp; steer</text>'
# lever motion arc
svg+=f'<path d="M132,152 Q186,168 176,220" fill="none" stroke="{RED}" stroke-width="2" marker-end="url(#ahr)"/>'
svg+=f'<text x="28" y="330" font-size="11" fill="{INK2}">froe blade in the kerf</text>'
svg+=f'<line x1="108" y1="325" x2="175" y2="{midy+8}" stroke="{INK2}" stroke-width="1"/>'

# ---- the CLUB: a proper mallet, striking the exposed spine near the end grain ----
club_x=218
svg+=f'<rect x="{club_x-16}" y="218" width="32" height="58" rx="8" fill="{WOOD_D}" stroke="{INK}" stroke-width="2"/>'          # head
svg+=f'<line x1="{club_x}" y1="224" x2="{club_x+40}" y2="150" stroke="#8a6b4a" stroke-width="9" stroke-linecap="round"/>'      # handle
# impact marks where the head meets the spine
for (dx1,dy1,dx2,dy2) in [(-14,-4,-26,-13),(14,-4,26,-13),(-12,-10,-20,-22),(12,-10,20,-22)]:
    svg+=f'<line x1="{club_x+dx1}" y1="{midy-6+dy1}" x2="{club_x+dx2}" y2="{midy-6+dy2}" stroke="{INK}" stroke-width="1.5"/>'
svg+=f'<text x="272" y="162" font-size="13" fill="{INK}">club seats the blade</text>'
svg+=f'<text x="272" y="180" font-size="11" fill="{INK2}">(strike the exposed spine)</text>'

# ---- principle band ----
svg+=f'<text x="{w/2}" y="{h-92}" text-anchor="middle" font-size="15" fill="{INK}" font-weight="bold">Riving = controlled splitting</text>'
svg+=f'<text x="{w/2}" y="{h-70}" text-anchor="middle" font-size="13" fill="{INK2}">Keep equal mass on both sides and the split runs straight. If it wanders toward the thin side,</text>'
svg+=f'<text x="{w/2}" y="{h-52}" text-anchor="middle" font-size="13" fill="{INK2}">lever the froe toward the thick side to pull it back. “Tic-tic-tic… and you’re back on track.”</text>'
svg+=f'<text x="{w/2}" y="{h-22}" text-anchor="middle" font-size="11.5" fill="{INK2}" font-style="italic">An errant blow leaves an irreparable plane of weakness. Good, straight, long-fibered stock is a precious gift. (Alexander, MACFAT)</text>'
svg+='</svg>'
open('02_froe_riving.svg','w').write(svg)
print("02 redrawn")
