# A paper-cut renderer in 150 lines of Canvas

Everything in the film is drawn by [`film/core.js`](../film/core.js), a renderer small enough to read in one sitting.
It fakes a miniature set built from layers of cut paper and photographed with a macro lens. There is no 3D engine and
no WebGL: just the 2D canvas API, a pinhole camera and some careful layering.

## Every drawable is a card at one depth

A stone, a petal, Pip's arm: each is a flat piece of paper standing at a depth `z`. An item in a scene is

```js
{ z: 400, draw(ctx, s, t) { /* draw in world units, at depth z */ } }
```

Before calling `draw`, the renderer moves and scales the canvas so the item can draw in **world units** (1 unit is
about 1 mm of miniature, the ground is `y = 0`, up is negative `y`). The scale comes from a pinhole lens:

```js
P.scaleAt = (cam, z) => cam.f / Math.max(z - cam.z, 1e-3);   // screen pixels per world unit at depth z
```

so a card twice as far away is drawn half as big, and moving the camera sideways slides near cards more than far ones.
That parallax is most of what makes flat paper feel deep. Items are sorted far to near and painted in that order
(the painter's algorithm), which is all the hidden-surface removal a paper set needs.

Skies and washes that should not move with the camera are **screen items**: `{ z, screen: true, draw(ctx, t) }`.

## Paper needs thickness

`P.card(ctx, path, fill, options)` draws one paper piece: a dark copy of the outline offset down and right (the gap
between this layer and the one behind), the fill, a light fibre texture overlaid so every surface reads as paper or
felt, and an optional bright top edge where the cut catches the light. One function, used for almost every shape in
the film, is what makes the whole world look like one material.

## Light is a function you call, not a pass

A scene has an ambient colour (cool blue dusk) and a list of point lights (the warm glow of flowers and water):

```js
light = { x, y, z, col: [r, g, b], i: intensity, rad: falloff radius, halo: glow size }
```

Every fill colour goes through `P.lit(colour, x, y, z, emit)`, which multiplies the base colour by the ambient plus
each light's contribution at that world point. Drawing code never picks "dark green" or "lit green": it picks green
and says where it is, and the story's lighting does the rest. When the water stops and the flower lights go out, the
whole garden cools without a single drawing function changing.

Strong light would push each colour channel into the 255 ceiling at a different moment and bleach everything to cream,
so `P.softClip` eases luminance and the brightest channel into the top of the range together, keeping hue.

## Depth of field by runs

A macro lens has a thin focus plane, and that blur is what sells "tiny". For each item the renderer computes how far
its depth is from the focus plane, in the lens's terms:

```js
blur = cam.ap * |1/(focus - cam.z) - 1/(z - cam.z)| * cam.f * 0.01
```

and rounds it to one of eight levels. Consecutive items with the same level are drawn into one offscreen canvas, which
is then composited with a single `ctx.filter = 'blur(...)'`. Blurring runs instead of items keeps a frame with
thousands of cards to well under a second.

After the cards, each light with a `halo` adds a soft additive pool around its projection: the glow that spills
into the air around a lit flower.

## The grade

`P.grade` finishes the frame like a camera would: a soft bloom (a blurred, shrunk copy screened back on top), a
vignette, and film grain from pre-made noise tiles chosen by film time. Grain changes twelve times a second, like real
film, and is the same every time you render that frame.

## Why no randomness and no clock

Every "random" choice (where a pebble sits, how a petal is cut) comes from `P.hash(i, j)`, a fixed integer hash. Time
comes in only as the argument `t`. So frame 2,000 is identical whether you render it first, last or alone. That one
rule is what makes it possible to check a single frame, change one line, and check it again in seconds, for a person
or an AI agent.

The browser has to cooperate too. Chromium's GPU-accelerated canvas can round a blur a level differently from one run to
the next, so `render.mjs` starts it with `--disable-accelerated-2d-canvas`. In software the same frame comes out
byte-identical every time. It is several times slower than the GPU canvas (about half a second a frame), and
`RENDER_TEST=1 npm test` checks that two renders match.
