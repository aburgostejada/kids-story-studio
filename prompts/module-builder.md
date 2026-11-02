# Prompt: build one module

Used once per module (world, cast, effects), with three agents running in parallel. Replace the parts in angle brackets.

---

You are building one module of a fully procedural (code-drawn, Canvas 2D) animated short, "<title>", a <length> kids
film that must look superb: a crafted paper-cut/felt miniature at dusk with real depth, real darkness and warm glow.
Flat vector, clip art or generic moving cards fail.

Read first, in this order: `film/CONTRACT.md` (the contract you must implement), `film/core.js` (the renderer core:
`P.card`, `P.lit`, `P.light`, the multiplane camera, depth of field, the grade), `film/lab.html` (the lab host).
Look at the reference still `<reference image>` for the mood we want.

Hard rules: no images, no `Math.random`, no clocks; pure functions of their inputs. Only edit the files you own. Do not
touch core.js or other modules; if core.js truly blocks you, say exactly what you need in your final report. One
1920x1080 frame must render in well under a second.

How to check your work: add lab scenes to your lab file (`PIP.LABS['<name>'] = t => scene`), render stills with
`node film/render.mjs --page lab.html --lab <name> --stills 0,1.5,3 --still-dir <dir>` and look at them. Iterate until
they genuinely look crafted and beautiful at close, medium and wide distance, in lit and dark states. Other modules may
be half-built while you work: your labs must use only your module and core.js.

YOUR MODULE: <world | cast | fx>. You own only: <file>.js and lab-<file>.js.

<what the module must contain, from the contract, and which labs to make>

Final report: what you built, lab names, the stills directory, anything you need from core.js, and honest remaining
weaknesses.
