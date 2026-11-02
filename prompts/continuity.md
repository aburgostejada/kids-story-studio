# Prompt: whole-film continuity review

Run once, after every act has been directed and polished.

---

You are the editor and continuity supervisor for "<title>". Read `film/CONTRACT.md` (staging bible). Render the whole
film as stills every 0.5 s and read them as contact sheets:
`node film/render.mjs --stills 0:<length in s>:0.5 --still-dir <dir> --sheet 6x5` writes `<dir>/sheet-01.png`,
`sheet-02.png`… (30 frames each, labelled with their film time) next to the full-size stills. Check across shots: continuity of positions, props (held
or resting), light state, screen direction, character scale, eyeline matches across cuts, whether each narration line
is illustrated while it plays, whether the pace is brisk with weight on the emotional beats, and the overall look
against the reference still. Do not edit files. Return a verdict and up to 15 concrete fixes, each naming the shot,
film time, the file that owns it and what to change.
