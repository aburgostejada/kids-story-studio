#!/usr/bin/env python3
"""The trailer's soundtrack: a short score made with code, cut to the trailer's own cues, then muxed and mastered.

    node film/render.mjs --page trailer.html --out out/trailer-picture.mp4 --cues out/trailer-cues.json
    python3 film/sound/trailer.py out/trailer-cues.json out/trailer-score.wav --picture out/trailer-picture.mp4 --out out/trailer.mp4

(run from the repository root). The score itself uses only the standard library (math, random, struct, wave), and
the same cues always give the same sound: the noise comes from a seeded generator. With --picture it also needs
FFmpeg: the score is loudness-normalized (two-pass loudnorm, linear) to about -14 LUFS with a -1.5 dBTP ceiling,
muxed as AAC under the picture, and the finished MP4 is measured again, so the numbers printed are the file's own.

Kinds of cue (trailer.js, KCUES): "hit" (a cut: a soft kick and a snap), "press" (the click and a drop), "whoosh"
(noise that rises until "until"), "chime" (a rising music-box run as the light climbs, until "until"), "tick" (a
soft blip, for typing), "mute" (the music stops until "until": the dark beat is silent), "end" (the last hit, then
the chord and a music-box twinkle ring out over the end card).
"""
import argparse
import json
import math
import random
import re
import struct
import subprocess
import wave
from pathlib import Path

RATE = 48000
# a bedtime D major: D2, A2, D3, F#3, A3, and the music box two octaves up
PAD = [73.42, 110.0, 146.83, 185.0, 220.0]
BOX = [587.33, 659.26, 739.99, 880.0, 987.77, 1174.66, 1318.51, 1479.98]


def score(cues, duration, path, rate=RATE):
    n = int(duration * rate)
    mix = [0.0] * n
    rnd = random.Random(7)
    ends = [c["t"] for c in cues if c["k"] == "end"]
    end = ends[0] if ends else duration
    mutes = [(c["t"], c["until"]) for c in cues if c["k"] == "mute"]

    def add(t0, samples, gain=1.0):
        i0 = int(t0 * rate)
        for j, v in enumerate(samples):
            i = i0 + j
            if 0 <= i < n:
                mix[i] += v * gain

    def kick(gain=1.0, length=0.45):
        out, ph = [], 0.0
        for j in range(int(length * rate)):
            t = j / rate
            ph += 2 * math.pi * (50 + 90 * math.exp(-t / 0.03)) / rate
            out.append(math.sin(ph) * math.exp(-t / 0.14) * gain + (0.35 * math.exp(-t / 0.002) if j < 100 else 0))
        return out

    def snap(gain=1.0, decay=0.09, length=0.3):
        out, prev = [], 0.0
        for j in range(int(length * rate)):
            w = rnd.uniform(-1, 1)
            out.append((w - prev) * 0.5 * math.exp(-(j / rate) / decay) * gain)
            prev = w
        return out

    def blip(freq=1600, gain=0.25, length=0.018):
        return [math.sin(2 * math.pi * freq * j / rate) * (1 - j / (length * rate)) * gain for j in range(int(length * rate))]

    def bell(freq, gain=0.3, length=1.2):
        # a music-box tine: a pure tone, a quiet inharmonic partial, a fast attack and a long decay
        out = []
        for j in range(int(length * rate)):
            t = j / rate
            env = (1 - math.exp(-t / 0.002)) * math.exp(-t / 0.45)
            out.append(env * gain * (math.sin(2 * math.pi * freq * t) + 0.25 * math.sin(2 * math.pi * freq * 2.76 * t) * math.exp(-t / 0.08)))
        return out

    def whoosh(length, gain=0.5):
        out, lp = [], 0.0
        m = int(length * rate)
        for j in range(m):
            k = j / m
            a = 0.02 + 0.5 * k * k  # the filter opens as it rises
            lp += a * (rnd.uniform(-1, 1) - lp)
            out.append(lp * (k ** 1.6) * gain * 2.2)
        return out

    def muted(t):
        return any(a <= t < b for a, b in mutes)

    # the bed: a warm pad that breathes on the beat and a soft shaker, under everything but the dark beat and the end
    beat = 60 / 120 / 2
    lp = 0.0
    for i in range(n):
        t = i / rate
        if muted(t) or t >= end:
            continue
        s = sum(math.sin(2 * math.pi * f * t) + 0.25 * math.sin(4 * math.pi * f * t + 0.5) for f in PAD) / len(PAD)
        lp += 0.04 * (s - lp)
        pulse = 0.6 + 0.4 * math.exp(-((t % beat) / 0.14))
        mix[i] += lp * 0.18 * pulse * min(1.0, t / 0.05)
    for k in range(int(end / beat)):
        t0 = k * beat
        if not muted(t0):
            add(t0, snap(0.08 if k % 2 else 0.045, decay=0.02, length=0.05))

    for c in cues:
        t, k = c["t"], c["k"]
        if k == "hit":
            add(t, kick(0.85))
            add(t, snap(0.28))
        elif k == "press":
            add(t, [0.9 if (j // 24) % 2 else -0.9 for j in range(144)], 0.4)
            add(t + 0.03, kick(1.0, 0.8))
            add(t + 0.03, snap(0.32, 0.2, 0.5))
        elif k == "whoosh":
            add(t, whoosh(c["until"] - t, c.get("gain", 0.5)))
        elif k == "chime":
            # one tine for each step of the light up the stem
            steps = len(BOX)
            for i, f in enumerate(BOX):
                add(t + (c["until"] - t) * i / steps, bell(f, 0.16 + 0.02 * i, 0.9))
        elif k == "tick":
            add(t, blip(c.get("freq", 1600), c.get("gain", 0.18)))
        elif k == "end":
            add(t, kick(1.0, 1.2))
            add(t, snap(0.4, 0.35, 1.2))
            # the chord rings out over the end card, an octave up, with a few soft echoes, and a twinkle on top
            m = int((duration - t) * rate)
            ring = []
            for j in range(m):
                tt = j / rate
                env = (1 - math.exp(-tt / 0.02)) * math.exp(-tt / 1.8) * min(1.0, (m - j) / (0.4 * rate))
                ring.append(env * sum(math.sin(2 * math.pi * 2 * f * tt) for f in PAD[1:]) / 4)
            for d, g in ((0, 0.3), (0.25, 0.11), (0.5, 0.05)):
                add(t + d, ring, g)
            for i, f in enumerate((BOX[7], BOX[5], BOX[3], BOX[5], BOX[2], BOX[0])):
                add(t + 0.5 + i * 0.32, bell(f, 0.14, 1.6))

    # a gentle limiter and a peak of -4.5 dBFS; --picture then normalizes the loudness properly
    for i in range(n):
        mix[i] = math.tanh(mix[i] * 1.2) / math.tanh(1.2)
    peak = max(1e-9, max(abs(v) for v in mix))
    g = (10 ** (-4.5 / 20)) / peak
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<hh", int(v * g * 32767), int(v * g * 32767)) for v in mix))


def measure(path, extra=()):
    """FFmpeg's loudnorm analysis of a file (integrated LUFS, true peak, ...), as a dict."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), *extra, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json",
                        "-f", "null", "-"], capture_output=True, text=True, check=True)
    return json.loads(re.search(r"\{[^{}]*\}\s*$", r.stderr).group(0))


def master(wav, picture, out, lufs=-14.0, tp=-1.5):
    m = measure(wav)
    f = (f"loudnorm=I={lufs}:TP={tp}:LRA=11:linear=true:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
         f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']},aresample=48000")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(picture), "-i", str(wav), "-map", "0:v:0", "-map", "1:a:0",
                    "-c:v", "copy", "-af", f, "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", str(out)], check=True)
    return measure(out)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("cues", help="the cues JSON that render.mjs --cues wrote: {duration, cues}")
    ap.add_argument("wav", help="where to write the score (48 kHz stereo WAV)")
    ap.add_argument("--picture", help="the silent trailer MP4 to mux the mastered score under")
    ap.add_argument("--out", help="the finished MP4 (with --picture)")
    a = ap.parse_args(argv)
    data = json.loads(Path(a.cues).read_text(encoding="utf-8"))
    score(data["cues"], data["duration"], a.wav)
    print("Wrote " + a.wav)
    if a.picture:
        if not a.out:
            ap.error("--picture needs --out")
        m = master(a.wav, a.picture, a.out)
        print(f"Wrote {a.out}: {m['input_i']} LUFS integrated, {m['input_tp']} dBTP true peak")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
