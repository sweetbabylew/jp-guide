from style import *
import math
w,h=900,420
svg=header(w,h)
svg+=f'<defs><marker id="ahr" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="{RED}"/></marker></defs>'
svg+=f'<text x="{w/2}" y="40" text-anchor="middle" font-size="23" fill="{INK}" font-weight="bold">Tapering a Leg</text>'
svg+=f'<text x="{w/2}" y="64" text-anchor="middle" font-size="13" fill="{INK2}" font-style="italic">Taper to 1″ at the top, starting 20″ down — while the leg is still four-sided</text>'

# horizontal leg laid out left(bottom/foot)->right(top). Length scaled.
lx0=110; lx1=820; cy=210
LEGIN=30.0   # leg length inches (example)
PX=(lx1-lx0)/LEGIN
foot_w=1.75*22   # px widths (scale thickness separately for visibility)
top_w=1.0*22
taper_start_in=20.0   # 20" from the TOP => at distance (LEGIN-20) from foot... but instruction: start 20" from top
# So taper region is the top 20". Foot end (left) stays full 1-3/4" for the lower (LEGIN-20)=10", then tapers over top 20" to 1".
full_len_in = LEGIN - taper_start_in   # 10" full-thickness at bottom
x_taper = lx0 + full_len_in*PX
# body: full thickness from foot to x_taper, then taper to top
top_x=lx1
svg+=f'<polygon points="{lx0},{cy-foot_w/2} {x_taper:.0f},{cy-foot_w/2} {top_x},{cy-top_w/2} {top_x},{cy+top_w/2} {x_taper:.0f},{cy+foot_w/2} {lx0},{cy+foot_w/2}" fill="{WOOD}" stroke="{INK}" stroke-width="2.5"/>'
# octagon hint lines along length (faint)
for yy in (cy-foot_w/4,cy+foot_w/4):
    svg+=f'<line x1="{lx0}" y1="{yy:.0f}" x2="{x_taper:.0f}" y2="{yy:.0f}" stroke="{WOOD_D}" stroke-width="0.8" opacity="0.5"/>'

# labels: foot (bottom) and top
svg+=f'<text x="{lx0}" y="{cy+foot_w/2+30}" text-anchor="middle" font-size="12.5" fill="{INK}" font-weight="bold">foot (bottom)</text>'
svg+=f'<text x="{top_x}" y="{cy+top_w/2+30}" text-anchor="middle" font-size="12.5" fill="{INK}" font-weight="bold">top</text>'
# thickness dims
svg+=f'<line x1="{lx0-14}" y1="{cy-foot_w/2}" x2="{lx0-14}" y2="{cy+foot_w/2}" stroke="{INK2}" stroke-width="1" marker-start="url(#ahr)" marker-end="url(#ahr)"/>'
svg+=f'<text x="{lx0-20}" y="{cy+4}" text-anchor="end" font-size="12" fill="{INK}">1¾″</text>'
svg+=f'<line x1="{top_x+14}" y1="{cy-top_w/2}" x2="{top_x+14}" y2="{cy+top_w/2}" stroke="{INK2}" stroke-width="1" marker-start="url(#ahr)" marker-end="url(#ahr)"/>'
svg+=f'<text x="{top_x+20}" y="{cy+4}" text-anchor="start" font-size="12" fill="{INK}">1″</text>'

# mark the taper start (20" from top)
svg+=f'<line x1="{x_taper:.0f}" y1="{cy-foot_w/2-26}" x2="{x_taper:.0f}" y2="{cy+foot_w/2+10}" stroke="{RED}" stroke-width="1.4" stroke-dasharray="4,3"/>'
svg+=f'<text x="{x_taper:.0f}" y="{cy-foot_w/2-32}" text-anchor="middle" font-size="12" fill="{RED}" font-weight="bold">taper begins 20″ from the top</text>'
# span arrow showing the 20" taper region
svg+=f'<line x1="{x_taper:.0f}" y1="{cy-foot_w/2-14}" x2="{top_x}" y2="{cy-foot_w/2-14}" stroke="{RED}" stroke-width="1.2" marker-start="url(#ahr)" marker-end="url(#ahr)"/>'
svg+=f'<text x="{(x_taper+top_x)/2:.0f}" y="{cy-foot_w/2-18}" text-anchor="middle" font-size="11" fill="{RED}">20″ of taper</text>'
# lower full-thickness region note
svg+=f'<text x="{(lx0+x_taper)/2+40:.0f}" y="{cy+foot_w/2+50}" text-anchor="middle" font-size="11" fill="{INK2}">full thickness below the line</text>'

svg+=f'<text x="{w/2}" y="{h-46}" text-anchor="middle" font-size="13" fill="{INK}" font-weight="bold">Taper while four-square, then octagonalize</text>'
svg+=f'<text x="{w/2}" y="{h-26}" text-anchor="middle" font-size="12" fill="{INK2}">It is easier to judge a straight taper on flat faces. A hair of convexity along the taper looks “just right.”</text>'
svg+=f'<text x="{w/2}" y="{h-8}" text-anchor="middle" font-size="11" fill="{INK2}" font-style="italic">(Back sticks taper the same way — to ¾″ at the top.)</text>'
svg+='</svg>'
open('16_leg_taper.svg','w').write(svg)
print("leg taper ok")
