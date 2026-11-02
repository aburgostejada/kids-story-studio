# Pip and the Missing Glow: module contract

Everything is drawn by code on a 1920×1080 canvas. No images, no AI assets, no `Math.random`, no `Date`.
Every function is a pure function of its inputs (film time comes in through `st.t`). Read `core.js` first.

## The look target

A dusk miniature garden photographed with a macro lens: deep cool blue night, layered paper-cut hills, a large
pale moon, a winding cobble channel of individually cut stones receding into depth, rows of small closed buds,
a giant clover and grass blades in the blurred foreground, and **warm amber glow as the only warm light**, pooling
on stones and faces. Rich, saturated, crafted; never flat vector, never washed-out fog, never empty backgrounds.
Paper-cut/felt: visible card thickness (drop shadow via `P.card(..., {lift})`), fibre texture, soft top-edge
highlights, clean silhouettes, many layers.

## World units and geography

- 1 unit ≈ 1 mm of miniature. Ground plane is `y = 0`; **up is negative y**. `x` right, `z` away from camera.
- Sizes: Pip 40 tall (feet to sprout tip ~48). Bram 30 tall, 58 long. Luma body 16, wingspan 56.
  Hero flower 150 tall, petals 46 across. Garden flowers 50–110 tall. Channel stones 10–26 across.
  Clover leaf 60–90 across. Foreground grass blades 80–300 tall.
- Home (Pip's flower): hero root at `(0, 0, 400)`. Flat resting stone at `(-55, 0, 395)`.
- Channel: `P.world.CHANNEL` (defined in world.js) is a polyline of ground points `[x, z]` from the **spout**
  `(-900, 2600)` winding toward the camera to the **channel end** `(30, 430)` beside the hero root.
  Use `P.world.chan(u)` → `[x, y, z]` and `P.world.chanDir(u)` → unit `[dx, dz]` for `u` in 0 (spout) .. 1 (end).
  The bed is 22 wide, rimmed by stones on both sides.
- Spout: a pond behind a dam of large stones at `z ≈ 2700`, ground raised to `y = -40` there, a cleft mouth at
  the channel start. The upstream pond is visible in wide shots top-left.
- Far: hills as layered paper cards at `z = 6000 .. 30000`, moon card at `z = 40000`. Sky is a screen item.

## Shared state `st` (built by shots.js, read by every module)

```
st.t                 film time (s)
st.water             0..1.14 : water front along the channel (u); -1 = channel dry
st.waterTail         0..1.14 : upstream end of the water (u). Water exists only between waterTail and water;
                     when the stream is blocked the tail runs downstream and the channel drains behind it
st.waterGlow         0..1  : how much light the water carries
st.pond              0..1  : how full / bulging the pond is behind the leaf
st.hero              { climb: 0..1 (glow up the stem), petal: 0..1, flicker: 0..1 multiplier, open: 0..1 petals open,
                       droop: 0..1 (the head bows) }
st.flower(i)         same shape for garden flower i (i over P.world.FLOWERS)
st.leaf              { curl: 0..1 (1 = rolled tight), x, y, z, rot, free: 0..1 (floated away), lift: 0..1 }
st.pinStone          { x, z, rot }  the small stone pinning the leaf stem
st.dipper            { x, y, z, rot, held: bool, water: 0..1, fall: 0..1 (tipped over on its side) }   (when not held)
```

## Modules (each file registers onto `window.PIP`)

All builders return **arrays of items**. An item is `{ z, draw(ctx, s, t) }` (world units at depth `z`; `s` = px per
unit) or `{ z, screen: true, draw(ctx, t) }`. Use `P.lit(rgb, x, y, z, emit)` for every fill colour so the dusk
ambient and the glow lights shade everything. Group a shape into one item per depth (a stone is one card; a
flower can be one item at its root depth).

### world.js  → `P.world`
`CHANNEL, chan(u), chanDir(u), FLOWERS` (array of `{u, side, x, z, h, col, kind}`), and builders
`sky(st)`, `hills(st)`, `ground(st, cam)` (turf strips/cards from z 120 to 6000 so no gaps ever show, pebbles, moss),
`channel(st)` (bed + rim stones), `flowers(st)` (garden flowers + buds, each lit by `st.flower(i)`),
`hero(st)` (Pip's flower: translucent stem that glows from root upward by `climb`, petals warm by `petal`),
`spout(st)` (pond, dam, mouth, the curled leaf `st.leaf`, the pin stone `st.pinStone`),
`foreground(st, cam)` (giant clover and blades placed relative to the camera so a close shot always has a framing
layer; they sit at `cam.z + 40 .. cam.z + 160`), `props(st)` (resting log, flat stone, dipper when not held).

### cast.js  → `P.cast`
`pip(pose)`, `bram(pose)`, `luma(pose)` each return items. Rigged cut-out puppets drawn from parts (no sprites).
Common pose fields: `x, y (feet, usually 0), z, face (1 right, -1 left), lean, squash (1 = rest), headTilt,
eyes (0 closed..1 open), look [dx, dy] (-1..1), brow (-1 worried..1 happy), mouth ('smile'|'flat'|'o'|'yawn'|'grit'|'laugh'|'frown'),
mouthOpen (0..1), breath (0..1 phase), blink (0..1)`.
- Pip: amber-and-leaf-green seed body, curled sprout on head, big glossy eyes with catch-lights, green leaf collar,
  stitched felt boots, mitts. Extra: `armL, armR` as `{ sh, el }` angles (radians, 0 = hanging) or
  `{ reach: [x, y] }` world target (2-bone IK), `walk` (phase, stride feet planted), `stride`, `sit` (0..1),
  `onBack` (0..1 fallen), `dipper: { tilt, water }` when held in the right mitt, `tiptoe`.
- Bram: deep teal beetle, three overlapping glossy shell plates with highlights, six jointed legs that plant,
  brow plate, gentle big eyes, mouth line. Extra: `walk` (tripod gait phase), `brace` (0..1 lowered pushing),
  `push` (0..1 strain), `dome` (0..1 lowered flat to rest), `head` (lowered look).
- Luma: lilac and cream moth, veined wings (fore and hind), fuzzy body, feathery antennae, readable face. Extra:
  `wings` (0 folded..1 open), `flap` (phase, rad), `fold` (two-stage landing 0..1), `antL, antR` (angles),
  `hover` (bool, legs tucked), `hold` ({ x, y } world point she grips with front legs).

### fx.js  → `P.fx`
`lights(st)` → light array for `scene.lights` (hero flower by climb/petal, garden flowers, water glow along the
lit stretch of channel, trapped pond glow; each light `{x,y,z,col,i,rad,halo}`),
`water(st)` → items: the flowing ribbon along the channel bed up to `st.water` with moving highlights and a soft
glowing leading edge; the trickle at the channel end into the hero root; ripples,
`pour(from, to, k, st)` → falling stream from the dipper lip to a ground point with droplets,
`motes(st, cam, n, warm)` → drifting glow motes (items at varied z), `fireflies`, `moth(x,y,z,t)` far silhouette,
`puff(x,y,z,k)` breath/dust puff, `splash(x,y,z,k)`, `sparkle(x,y,z,k)` (light arriving at a root),
`pebble(...)` rolling pebble.

## Scene object (shots.js builds one per frame)

```
{ cam: { x, y, z, f, focus, ap, roll }, ambient: [r,g,b], lights: [...], items: [...], grade: { bloom, vignette, grain, fade } }
```
Dusk ambient is around `[0.30, 0.38, 0.65]` (`AMB` in shots.js); "dark garden" around `[0.18, 0.23, 0.46]` (`AMB_DARK`;
the lab scenes use `[0.20, 0.26, 0.50]`).

Shots build it with `scene(T, cam, items, o)`. Options: `o.calm` (0..1, default 0) thins the small garden detail (grass
blades, small buds, minor flowers) and softens the far field so an explanatory shot has one place to look; establishing
shots keep 0. It reaches the world module as `st.calm`. `o.noFg` drops the foreground layers, `o.motes` sets the mote
count, `o.fireflies`, `o.lights`, `o.ambient` and `o.grade` override the defaults.

## Lab pages for checking your module

`lab.html?lab=<name>&t=<s>` renders scene `<name>` from `PIP.LABS`. Each module registers its own lab scenes in a
matching `lab-<module>.js`, which `lab.html` loads. In a browser, serve `film/` with `python3 -m http.server 8000 -d film`
(with `npx serve film` use `/lab?lab=<name>&t=<s>`: `serve` redirects `lab.html?...` to `/lab` and drops the query).
Render stills with:

```
node film/render.mjs --page lab.html --lab world-wide --stills 0,2 --still-dir <scratch dir>
```
Then look at the PNGs. A module is done only when its stills look like the look target at close, medium and
wide distances, in lit and dark states, with no gaps, seams or console errors.

## Staging bible (shots: shots.js + act1.js, act2.js, act3.js)

**Story.** Pip, a small seed sprite, lives under a tall glowing flower at the end of a winding stone channel. Every
evening water runs down the channel from a pond behind a stone spout far away, and **water carries light**: a flower
glows while water runs past its roots. One night a big dry leaf curls into the spout mouth, its stem pinned by a small
stone. The channel drains from the far end toward home and the flowers go dark one by one; Pip sees the first flicker
and watches the dark come. His own flower goes out last. He tries silly fixes (polish a petal, puff on it, prop the
drooping stem) and finds the channel dry. Bram (a strong, gentle teal beetle) arrives and finds the bed still damp
upstream; Luma (a light, quick moth) flies up and sees a trapped glow far away at the spout. They follow the dry
channel upstream and find the leaf. Pip tries alone and fails, because the stone holds the stem: the low point. Then
the plan: Bram pushes the pin stone, Luma lifts the leaf tip, Pip unrolls the curl. The leaf pops free, the water
bursts out, and the light races down the channel relighting every flower. Pip runs home just ahead of it, his
flower relights brighter than before, Pip shares his cup with Bram, and the three settle together. Theme: some things
are easier together. Audience: ages 6-8, but it must also stop an adult scrolling a phone feed.

**Pace.** Brisk and purposeful: trouble starts within the first seconds (the bell beside his flower flickers a
warning at about 3 s, then the far star flower at the spout goes out in front of him), and "But tonight…" lands at 14 s. Every shot has motion (camera
drift, push, crane, or action) and one clear idea, and every stop on the journey changes what the friends know.
Weight lands in four places: s05 (the stem dies), s15 (alone), s18 (the burst), s20 (the relight). Hold those a beat
longer; cut everything else tight.

**Water reads as water.** Wherever it runs it is a blue-green body in a dark bed, with a visible leading edge,
ripples and one flow direction; the warm light rides inside it as small golden particles. Water reaches a root
before that stem lights, so cause and effect stay separate. Glow never flattens a face: the brightest light sits
on water, stem cores and petal edges, and faces keep their felt texture.

**Shot table** (film time in seconds; `P.FILM.start[name]` gives the same). 135 s.

| shot | start | dur | what the picture must show | narration starting in it |
|---|---|---|---|---|
| s01-garden | 0 | 6 | Close on Pip as his flower lights root to petals; at 2.6-3.6 s the bell beside his stem sputters nearly dark and droops (only a warning: it comes back weak) while Pip gasps, held and large in frame; his eyeline leads upstream to an over-the-shoulder shot (from about 4 s) where the far star flower at the spout stutters and goes out for good at about 5.6 s: the first real failure | 1.0 "Every evening, the garden began to glow." |
| s02-pour | 6 | 6 | Close on one flower (the rule flower): a thread of water reaches its root, then the light climbs stem to petals | 7.2 "Water carried the light." |
| s04-dark-comes | 12 | 7 | Wide: the dark travels from the spout (about 13.2 s) toward home (about 16.3 s) as a chain of last-light pulses, flower after flower; at +4.4 cut to the rule flower framing, which drains petals to root (17-19 s) | 14.0 "But tonight…" |
| s05-stem-dies | 19 | 7 | Pip's flower dies; his face goes cold | |
| s06-fixes | 26 | 7 | Polish, puff, prop (the stem flops back), quick and gently funny | |
| s07-dry-dipper | 33 | 6 | Pip dips his cup in the channel: it comes up dry, a pebble rolls out | 33.8 "The channel was dry." |
| s08-bram | 39 | 6 | Bram arrives, sniffs, touches his snout to a damp patch upstream (rings and drops at about 42 s), hops in surprise and looks upstream: the clue pointing the way | |
| s09-luma | 45 | 5 | Luma lands, then flies up to look | |
| s11-crane | 50 | 6 | Luma's view: the whole garden dark blue (never black), the channel a dry sunken trench snaking to one warm trapped glow at the spout, the brightest thing in frame | 51.8 "Where had the water stopped?" |
| s12-journey | 56 | 8 | The three travel upstream (screen-left, away); Luma flaps above the walkers | |
| s13-spout | 64 | 9 | The mechanism in a three-quarter view, read before anyone moves: the pond swollen behind the dam, its water bulging into the notch and pressing on the rolled leaf tip wedged in the cleft, a little seep squeezing out to the dry outlet, the stem running to the lilac stone; an insert of the stem pinched under the stone (68.4-70.7); Pip close (70.7-73) | 66.2 "One curled leaf was holding back the stream." |
| s14-pull | 73 | 5 | Pip walks up and pulls the roll's free edge alone; in an insert the stem snaps taut and the stone rocks but holds; his grip slips at 75.9 s, the roll springs back to its seat and he is thrown onto his back with empty mitts, then rolls up to sit | |
| s15-alone | 78 | 4 | The low point: Pip alone, hugging his knees | |
| s16-plan | 82 | 7 | Each friend touches their part of the plan: Bram's head meets the stone and rocks it (85.1-86 s), Luma grips the leaf's edge, Pip lays his mitts on the curl | 83.6 "Three friends. Three different strengths." |
| s17-together | 89 | 11 | One stable three-quarter wide with a close per action on its line. Bram (90.2): two shoves, the stone tips off the stem at about 91.1 s and rolls back into the grass, the freed stem flicks and lies slack with clear ground between stem and stone. Luma (92.4): she hovers with wings beating, grips the edge by the rolled tip and lifts it out of the cleft; water starts to spill under it. Pip (94.8): both mitts on the leaf strip running into the roll; on each heave he steps back and the roll shrinks. From 96.1 all three strain in the wide (Bram tugging the stem's end, Luma lifting, Pip unrolling) while the spill widens in steps | 90.2 "Bram pushed." 92.4 "Luma lifted." 94.8 "Pip unrolled." |
| s18-burst | 100 | 4 | The camera continues the s17 wide; at 100.5 s the leaf springs free with its stem trailing and Luma carried up, the jamb stone tumbles, a foamy sheet of water bursts out of the gap and a wave runs down the channel; Pip stumbles back and hops with his arms up, the friends laughing | |
| s19-chase | 104 | 7 | Wide: the water front races home relighting the flowers, the three running ahead of it; insert on the rule flower relighting root to petals (106.2-108.2); then the close run with Pip just ahead of the light | 105.2 "The water ran, and the light followed." |
| s20-relight | 111 | 5 | Pip's flower relights, root to petals, with Pip's whole face in frame reacting | |
| s21-together | 116 | 7 | The three settle under the flower; Pip offers his cup to Bram, Luma settles beside them | 117.6 "Some things are easier together." |
| s22-garden | 123 | 6 | Pull back over the whole relit garden | 124.4 "And the garden was bright enough for everyone." |
| s23-trio | 129 | 6 | Back close on the three, together under the flower: the final hold, with slow blinks | |

The picture must show what each line says while it plays.

**Places.** Home: hero root `(0, 0, 400)`, flat resting stone `(-55, 0, 395)` (Pip sits **on** it: his feet on
its top, his `z` just in front of the stone's), dipper rest spot `(-98, 0, 414)` when not held. The channel
ends at `(30, 430)` just right of the root. Spout: `P.world.chan(0)`; the leaf sits in the mouth, the pin stone on
its stem, the pond above and behind.

**Screen direction.** At home the camera looks +z, into the garden. The channel comes from the far upper left (the
spout) and ends at the right of the root. Upstream = away from camera and screen-left; the journey moves that
way. The returning water and light come toward camera and screen-right. Keep each character on a consistent side
within a scene (at the spout: Pip left, Luma centre and above, Bram right).

**Framing rules.** Faces are never blocked by props or foliage; foreground framing layers stay at the frame edges
and are defocused and dark. Characters in medium shots stand at least a quarter of the frame height and sit near
the thirds. Every frame reads as a thumbnail on a phone: one clear subject, a clean silhouette, value contrast
between subject and background. Warm light comes only from glowing flowers and water; when the garden is dark the
characters still catch a cool moon rim so they read (add per-shot lights through `scene(..., { lights })`).
