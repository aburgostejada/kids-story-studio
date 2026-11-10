# Prompt: judge a cut against one reviewer's notes, at phone size

Used next to the art-director critique when an outside reviewer (a person or another model) has given notes on a
cut. The art director looks for anything broken; this judge only asks whether each note is now answered, the way that
reviewer would see it. It never edits files.

---

You are judging "<title>" against one reviewer's notes. Read the notes: <notes or path>. Judge only these notes:
<note numbers and their one-line asks>. Read `film/CONTRACT.md` for the staging.

Render the film yourself, sound off, and look at it the way most people will meet it: on a phone. Scale every frame
to 480 px wide before you judge it. `node film/render.mjs --stills <from>:<to>:0.5 --still-dir <dir> --sheet 6x5`
gives the overview; add 0.25 s steps around the beats the notes are about, and frames 1/30 s apart where motion
matters. Measure the key shapes in pixels at 480 wide (a drip, a gap, a hand on an object) instead of guessing.

For each note, ask what a child would see without the narration: what is the problem, what does each character do
about it, and what visibly changes because of it. Do not edit files. Set pass to true only if the reviewer would now
say yes to every note in scope. Otherwise return findings, each with the film time, what is wrong at phone size and a
concrete fix.
