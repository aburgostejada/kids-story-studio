# Building a film with AI coding agents

This film has about 7,400 lines of drawing code, and almost none of it was typed by hand. It was written by AI coding
agents working in parallel, directed the way a small animation studio directs its departments: one shared contract,
one owner per file, a lab page for every department, and reviews done by looking at rendered frames, not by reading
code. This guide is the method, so you can use it on your own film or on any visual project that is too big for one
agent in one sitting.

The tools: an agent that can edit files and run commands (we used Claude Code with parallel sub-agents), Node.js,
Chromium through Playwright, and FFmpeg. The prompts we used are in [`prompts/`](../prompts/).

## 1. Agree on the look before anyone writes code

Agents converge on what they can see. "A beautiful garden at dusk" produces a different garden every time;
a picture does not. We made one reference still: a bug's-eye view of a miniature paper-cut garden at dusk, layered
hills, a big moon, a winding cobble channel, buds, a giant clover, warm flower glow as the only warm light. Every
builder and every reviewer was told to look at it first and match it in code.

The reference image is a target, not an asset. It is not in the film and not in this repository: every pixel of the
film is drawn by the code here.

## 2. Write the contract

[`film/CONTRACT.md`](../film/CONTRACT.md) is the most important file in the project. It fixes, before any module
exists:

- **Units and geography.** 1 unit = 1 mm of miniature, ground at `y = 0`, up is negative `y`. Where Pip's flower
  stands, where the channel runs, how tall each character is. Without this, three agents build three scales.
- **The shared state.** One object, `st`, built from film time: how far the water has run, which flowers are lit,
  how curled the leaf is. Every module reads it; only the shot code writes it.
- **Each module's API.** `P.world.channel(st)`, `P.cast.pip(pose)` with every pose field listed, `P.fx.water(st)`.
  Builders implement exactly this, so the pieces fit on the first try.
- **The rules.** No images, no `Math.random`, no clocks. Every frame is a pure function of time, so any frame can be
  rendered alone, checked and rendered again identically.

Write the renderer core yourself, or with one agent, before the contract: `core.js` (the camera, the paper card, the
lighting, depth of field and the grade) is small, and every module depends on it.

## 3. One builder per file, each with a lab

We ran three builders at once: the world (`world.js`), the cast (`cast.js`) and the effects (`fx.js`). Each one
owned its file and a matching lab file and was told not to touch anything else. A lab is a scene that uses only the
core and that one module (a lineup of the three puppets on a plain stage, water running down a test curve, the
garden from five camera positions), registered in the module's own lab file (`lab-cast.js`), which `lab.html`
loads:

```js
PIP.LABS['cast-lineup'] = t => ({ cam, ambient, lights, items: [...stage, ...P.cast.pip(pose), ...] });
```

and rendered to stills with one command:

```bash
node film/render.mjs --page lab.html --lab cast-lineup --stills 0,1.5,3 --still-dir out/cast-lineup
```

The builder looks at its own stills (agents can read images) and iterates until they look right. Labs let three
agents work in parallel without waiting for each other, because a lab never depends on another unfinished module.

## 4. Review by looking, with a different agent

When a builder finishes, a second agent reviews it as an art director: it renders the labs itself, compares them with
the reference still and returns a verdict and at most twelve concrete fixes ("the channel stones read as grey boxes;
make the tops pale warm grey with darker sides so the S-curve reads as a ribbon"). It never edits. The builder then
applies the fixes. One build, one critique, one polish per module took the garden from flat strips to layered paper
hills, cut stones and glowing flowers.

Two things make this work:

- **The reviewer judges pictures, not code.** It renders stills at times it chooses, so it sees what a viewer sees.
- **The reviewer is told what good means.** "Judge against a top-tier animated short, not against acceptable."
  Without that, reviews come back as "looks good".

## 5. Assemble, then direct each act

The director (you, or a lead agent) writes the story state and the scene assembly in `shots.js` and wires the
modules together. The first full render always shows integration problems the labs could not: a prop parked in front
of a face, a camera that cannot see the channel, feet that skate because the walk speed and the stride disagree.
Fix the shared ones yourself.

Then split the film by act, one agent per act file (`act1.js`, `act2.js`, `act3.js`), plus one agent for the shared
fixes in the world and effects. Each act agent gets a **staging bible** (the end of `CONTRACT.md`): the story, the
pace, a shot table with the narration timings, where each place is, which way is upstream on screen, and framing
rules ("faces are never blocked; every frame must read as a phone thumbnail"). The same critique and polish loop
follows, and then one last agent watches the whole film as stills every half second, looking only for continuity:
props that jump, light that changes state between shots, eyelines that do not match across a cut. Contact sheets make
that practical: `node film/render.mjs --stills 0:135:0.5 --still-dir out/sheet --sheet 6x5` tiles 30 labelled frames
per image.

## 6. Get an outside opinion

Before calling it done, show the film to reviewers that did not build it, ideally a different model. Fresh eyes
catch what the team has stopped seeing. When their notes come back, fix them in rounds, and judge each round twice:
once by the art director above, and once by a judge that checks only the outside reviewer's notes, point by point, at
phone size ([`prompts/notes-judge.md`](../prompts/notes-judge.md)).

## What we learned

- **Contracts beat conversations.** Every hour spent on `CONTRACT.md` saved several hours of mismatched pieces.
- **Small owned files parallelize; shared files serialize.** Split code so each agent owns its file.
- **Stills are the unit of review.** A frame you can render alone in about half a second is a frame an agent can
  check, fix and check again in a loop. That is why every frame is a pure function of time.
- **Name the weak spots.** Ask every builder for its honest remaining weaknesses in the final report; they become the
  next reviewer's checklist.
- **When rounds stop converging, the director decides.** Our climax went through two rounds in which each builder made
  its own guess at how the leaf should unroll, and each judge failed it for a different reason. Writing the staging
  down as binding decisions (where the stone rolls, what each mitt holds, what the water does and never does) fixed
  it in one round.
- **Judge at phone size.** A drip that reads at 1920 px wide is 2 px on a phone. Our judges measured the key shapes
  in frames scaled to 480 px wide, with the sound off, because that is how most people meet the film.
- **Give each judge a different brief.** An art director looking for anything broken and a judge applying one
  outside reviewer's notes, point by point, catch different problems. A shot passes only when both say yes.
