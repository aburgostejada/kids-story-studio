# Sound: a directed narrator, a scored film and code-made foley

The soundtrack has three stems, mixed by [`film/sound/mix.py`](../film/sound/mix.py):

| Stem | Made with | Where it is placed |
| --- | --- | --- |
| Narration | Qwen3-TTS (open weights, runs locally) in VoiceDesign mode, one take per line, several seeds | `lines` in [`cues.json`](../film/sound/cues.json) |
| Score | ACE-Step 1.5 (open weights, runs locally), one cue per story section | `music` in `cues.json` |
| Foley | Synthesized from noise and sine partials in [`foley.py`](../film/sound/foley.py) | `effects` in `cues.json` |

Nothing here needs a paid API. The repository ships the cue sheet, the foley code and the mixer. It does not ship
the narration or the score, or scripts to generate them: you make those WAV files yourself (the sections below say how
we did it) and the mixer places them on the film's 135-second timeline.

## Narration: write lines for the picture, then direct each one

The narrator says eleven short lines, each timed to the shot it describes (the shot table in
[`CONTRACT.md`](../film/CONTRACT.md)). Short lines leave room for the picture and are easy to place. The teamwork
line, "Bram pushed. Luma lifted. Pip unrolled.", is recorded as three separate takes so each lands on its own action. That makes thirteen recordings in
`cues.json`.

A voice-design text-to-speech model takes an *instruction* as well as the text. We give every line the same base
("a warm, gentle storyteller reading a bedtime picture book to young children: clear, unhurried, soft wonder")
plus a direction for that line ("a soft hush of suspense, trailing off" for "But tonight…"). Generate three or four
seeds per line, transcribe each take with a speech recognizer (we used Whisper), throw away any whose words do not
match the script, and pick by ear among the rest. Trim each pick to about 50 ms of silence at both ends.

## Score: one cue per section, not one long track

Music models are good at a mood and bad at hitting a story beat 47 seconds in. So the score is seven cues, each
generated on its own with a prompt that puts the style first and the moment second:

```
animated family film score, orchestral, storybook, delicate and cinematic, felt piano, celesta, harp, warm strings,
woodwinds, instrumental, no vocals, tender unease turning to quiet sadness, 60 bpm, D minor. Sparse and hushed:
a music box melody that slows and loses its last note, low sustained cellos...
```

Generate each cue longer than it needs to be (48 s), three seeds each, reject takes where a recognizer hears words or
where the music goes quiet early, and keep the seed closest to the requested tempo. `cues.json` then places a slice of
each cue at its story section with short fades, so cues cross where the story turns: "But tonight…", the friends
arriving, the low point, the release.

## Foley: every effect is a few lines of DSP

Crickets are short bursts of 3.9 to 4.7 kHz sines in groups of three or four; water is band-limited noise with tiny pitch-swept bubbles;
the leaf uncurling is crackle whose pitch rises; light climbing a stem is a gliding glass tone. Each effect in
`cues.json` names its kind, start, end, pan and level, and `foley.py` renders it from a seed, so the effects are as
repeatable as the picture.

## The mix

`mix.py` levels every stem against the narration, ducks music by 9 dB and effects by 4 dB under each line (with a
gentle attack and release), adds a short room reverb to the foley, and normalizes the mix to -14 LUFS with a
-1.5 dBTP ceiling (two-pass FFmpeg `loudnorm`). It writes the three stems, `mix.wav`, captions (`captions.srt`, timed
from the real length of each line) and a report with the measured loudness and the speech-to-bed ratio. With
`--picture` it also muxes the final MP4, re-measuring the encoded audio because AAC can push peaks a little over the
ceiling.

### Running it

You need Python 3 with three packages, and FFmpeg:

```bash
python3 -m pip install numpy scipy soundfile
```

Put one WAV per recording in a folder, named by its `id` in `cues.json`: `l01.wav` to `l04.wav`, `l06.wav` to
`l08.wav`, `l09a.wav`, `l09b.wav`, `l09c.wav` (the teamwork line) and `l10.wav` to `l12.wav`. There is no `l05`; a line
was cut from the film and the ids were kept. Put one WAV per score cue in another folder: `m1-wonder.wav`,
`m2-dark.wav`, `m3-friends.wav`, `m4-upstream.wav`, `m5-alone.wav`, `m6-together.wav`, `m7-home.wav`. Any sample rate,
mono or stereo. Then, from the repository root, after rendering the picture to `out/picture.mp4`:

```bash
python3 film/sound/mix.py --cues film/sound/cues.json --voice my-voice --music my-music --out out --picture out/picture.mp4
```

The film with sound is `out/film.mp4`.
