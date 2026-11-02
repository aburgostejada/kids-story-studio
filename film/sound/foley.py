"""Procedural foley for the film: every effect is synthesized from noise and sine partials, seeded so the same
cue list always gives the same sound. No recordings or sample packs.

Each effect is a dict: {"id", "kind", "start", "end", "pan" (-1..1), "gain" (dB), plus kind-specific fields}.
synth_event(event, seed) returns a float array (mono, or stereo for beds) at SR.
"""
import hashlib
import math

import numpy as np

SR = 48000


def _np():
    return np


def event_seed(seed, name):
    return int.from_bytes(hashlib.sha256(f"{seed}:{name}".encode()).digest()[:8], "little")


def band(x, lo=None, hi=None, sr=SR):
    """Zero-phase band-limit in the frequency domain (2nd-order Butterworth-shaped magnitudes)."""
    np = _np()
    n = x.shape[0]
    spectrum = np.fft.rfft(x, axis=0)
    f = np.maximum(np.fft.rfftfreq(n, 1 / sr), 1e-6)
    mask = np.ones_like(f)
    if lo:
        mask /= np.sqrt(1 + (lo / f) ** 4)
    if hi:
        mask /= np.sqrt(1 + (f / hi) ** 4)
    if x.ndim == 2:
        mask = mask[:, None]
    return np.fft.irfft(spectrum * mask, n=n, axis=0)


def envelope(n, points, t0=0.0, sr=SR):
    np = _np()
    t = t0 + np.arange(n) / sr
    xs, ys = zip(*points)
    return np.interp(t, xs, ys)


def fade(n, attack, release, sr=SR):
    np = _np()
    env = np.ones(n)
    a, r = min(n, int(attack * sr)), min(n, int(release * sr))
    if a:
        env[:a] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))
    if r:
        env[n - r:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, r))
    return env


def decaying(freqs, amps, decay, n, sr=SR):
    np = _np()
    t = np.arange(n) / sr
    out = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / (decay * (1 - 0.15 * i)))
              for i, (f, a) in enumerate(zip(freqs, amps)))
    attack = min(n, int(0.003 * sr))
    out[:attack] *= np.linspace(0, 1, attack)
    return out


def _add(buf, start, sig):
    end = min(len(buf), start + len(sig))
    if end > start >= 0:
        buf[start:end] += sig[:end - start]


def _pulses(n, times, make, sr=SR):
    np = _np()
    out = np.zeros(n)
    for t in times:
        _add(out, int(t * sr), make(t))
    return out




def synth_event(event, seed):
    """Return a mono or stereo float array for one effect cue."""
    np = _np()
    rng = np.random.default_rng(event_seed(seed, event["id"]))
    kind, dur = event["kind"], event["end"] - event["start"]
    n = int(round(dur * SR))
    t = np.arange(n) / SR
    noise = lambda k=1: rng.standard_normal((n, k)) if k > 1 else rng.standard_normal(n)

    if kind == "crickets":
        dens = envelope(n, event["env"], event["start"])
        out = np.zeros((n, 2))
        for carrier, pan, rate in [(4300, -0.5, 1.3), (4700, 0.4, 1.1), (3900, 0.05, 1.6)]:
            tt = rng.uniform(0, 0.6)
            while tt < dur - 0.2:
                if rng.random() < dens[int(tt * SR)]:
                    pulse_n = int(0.012 * SR)
                    pulse = np.sin(2 * np.pi * carrier * np.arange(pulse_n) / SR) * np.hanning(pulse_n)
                    for k in range(rng.integers(3, 5)):
                        start = int((tt + k * 0.03) * SR)
                        level = dens[min(n - 1, start)] * rng.uniform(0.6, 1.0)
                        left, right = math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)
                        _add(out[:, 0], start, pulse * level * left)
                        _add(out[:, 1], start, pulse * level * right)
                tt += 1 / rate + rng.uniform(-0.15, 0.25)
        return out
    if kind == "wind":
        x = band(noise(2), 80, 900)
        sway = 1 + 0.35 * np.sin(2 * np.pi * 0.07 * t + 1.3) + 0.2 * np.sin(2 * np.pi * 0.173 * t + 0.4)
        return x * (envelope(n, event["env"], event["start"]) * sway)[:, None]
    if kind in ("trickle", "stream", "rush"):
        bed = band(noise(2), 300, 3500)
        rate = {"trickle": 22, "stream": 9, "rush": 18}[kind]
        times = np.sort(rng.uniform(0, max(0.01, dur - 0.05), int(dur * rate)))
        def bubble(_):
            m = int(rng.uniform(0.012, 0.03) * SR)
            tb = np.arange(m) / SR
            f0 = rng.uniform(800, 1900)
            return np.sin(2 * np.pi * f0 * tb * (1 + 6 * tb)) * np.exp(-tb / 0.008) * rng.uniform(0.4, 1.0)
        bubbles = _pulses(n, times, bubble)
        x = 0.6 * bed + np.stack([bubbles, np.roll(bubbles, 211)], axis=1) * 2.5
        if kind == "trickle":
            env = fade(n, 0.4, 0.8) * (1 + 0.3 * np.sin(2 * np.pi * 1.7 * t))
        elif kind == "stream":
            env = envelope(n, event["env"], event["start"])
        else:
            env = envelope(n, [(0, 0), (0.8, 1.0), (1.6, 0.9), (dur, 0.25)]) * fade(n, 0.05, 1.0)
        return x * env[:, None]
    if kind == "glass":
        freq = event["f0"] * (event["f1"] / event["f0"]) ** np.clip(t / (dur * 0.75), 0, 1)
        phase = 2 * np.pi * np.cumsum(freq) / SR
        x = np.sin(phase) + 0.3 * np.sin(2 * phase) + 0.08 * np.sin(3 * phase)
        return x * fade(n, 0.6, 0.9) * (1 + 0.08 * np.sin(2 * np.pi * 4.5 * t))
    if kind == "chime":
        f = event["freq"]
        return decaying([f, f * 2.32, f * 4.25], [1.0, 0.32, 0.1], 0.9, n)
    if kind == "reverse_chime":
        freq = 1046.5 * 2 ** (-t / dur)
        phase = 2 * np.pi * np.cumsum(freq) / SR
        env = envelope(n, [(0, 0), (dur * 0.4, 1.0), (dur, 0)]) ** 2
        return (np.sin(phase) + 0.25 * np.sin(2.32 * phase)) * env
    if kind == "flutter":
        return band(noise(), 300, 2500) * (0.5 + 0.5 * np.sin(2 * np.pi * 18 * t)) * fade(n, 0.1, 0.3)
    if kind == "breath":
        return band(noise(), 400, 2500) * envelope(n, [(0, 0), (dur * 0.6, 1), (dur, 0)])
    if kind == "rub":
        strokes = sum(np.exp(-((t - c) / 0.11) ** 2) for c in np.linspace(0.2, dur - 0.2, 4))
        return band(noise(), 300, 3000) * strokes
    if kind == "puff":
        return band(noise(), 150, 1500) * envelope(n, [(0, 0), (0.03, 1), (dur, 0)])
    if kind in ("creak", "strain"):
        rate = envelope(n, [(0, 28), (dur, 60 if kind == "creak" else 85)])
        ticks = np.flatnonzero(np.diff(np.floor(np.cumsum(rate) / SR)) > 0) / SR
        x = _pulses(n, ticks, lambda _: decaying([rng.uniform(350, 600)], [1.0], 0.006, int(0.02 * SR)))
        if kind == "strain":
            x += 0.4 * band(noise(), 1200, 4000) * (rng.random(n) < 0.002)
            return x * envelope(n, [(0, 0), (0.3, 0.6), (dur - 0.5, 1.0), (dur, 0)])
        return x * fade(n, 0.1, 0.25)
    if kind == "scrape":
        x = band(noise(), 1500, 5000) + 0.4 * decaying([1800, 2700, 3900], [1, 0.6, 0.3], 0.15, n)
        return x * fade(n, 0.03, 0.3)
    if kind == "tap":
        return decaying([900, 1400, 2300], [1, 0.5, 0.25], 0.05, n)
    if kind == "pebble":
        times, tt, gap = [], 0.0, 0.05
        while tt < dur - 0.05:
            times.append(tt); tt += gap; gap *= 1.28
        clicks = [(tt, 0.85 ** i) for i, tt in enumerate(times)]
        return sum(_pulses(n, [tt], lambda _, a=a: a * decaying([rng.uniform(2000, 3000)], [1], 0.005,
                                                                   int(0.02 * SR))) for tt, a in clicks)
    if kind == "shuffle":
        times = [i / 3.2 + (i % 6) * 0.012 for i in range(int(dur * 3.2))]
        def step(_):
            m = int(0.07 * SR)
            return decaying([rng.uniform(80, 150)], [1], 0.03, m) + 0.15 * band(rng.standard_normal(m), 1000, 4000)
        return _pulses(n, times, step) * fade(n, 0.2, 0.4)
    if kind == "rumble":
        x = np.sin(2 * np.pi * 70 * t) + 0.5 * np.sin(2 * np.pi * 140 * t)
        return x * (0.7 + 0.3 * np.sin(2 * np.pi * 9 * t)) * fade(n, 0.25, 0.5)
    if kind == "wings":
        r0, r1 = event["rate"]
        phase = np.cumsum(np.linspace(r0, r1, n)) / SR
        beats = (0.5 - 0.5 * np.cos(2 * np.pi * phase)) ** 3
        return band(noise(), 200, 1800) * beats * fade(n, 0.2, 0.4)
    if kind == "hollow":
        return band(noise(), 150, 500) * fade(n, 1.0, 1.5)
    if kind == "steps":
        rate = event["rate"]
        times = [i / rate + rng.uniform(-0.03, 0.03) for i in range(max(1, int(dur * rate)))]
        times = [max(0.0, x) for x in times]
        def step(_):
            m = int(0.05 * SR)
            return decaying([180], [1], 0.012, m) + 0.35 * band(rng.standard_normal(m), 300, 2500) * fade(m, 0.002, 0.04)
        return _pulses(n, times, step) * fade(n, 0.05, 0.3)
    if kind == "roll":
        crackle = band(noise() * (rng.random(n) < 0.004), 800, 3500)
        return (band(noise(), 60, 400) * (0.6 + 0.4 * np.sin(2 * np.pi * 2.2 * t)) + 0.5 * crackle) * fade(n, 0.4, 0.5)
    if kind == "grass":
        return band(noise(), 1500, 5000) * (0.5 + 0.5 * np.sin(2 * np.pi * 1.5 * t)) ** 2 * fade(n, 0.5, 0.6)
    if kind == "pressure":
        x = band(noise(2), 40, 250)
        return x * (envelope(n, event["env"], event["start"]) * (1 + 0.15 * np.sin(2 * np.pi * 0.3 * t)))[:, None]
    if kind == "scuff":
        return band(noise(), 400, 3000) * envelope(n, [(0, 0), (0.05, 1), (dur, 0)])
    if kind == "thump":
        return decaying([90, 140], [1, 0.4], 0.07, n) + 0.1 * band(noise(), 60, 400) * fade(n, 0.002, 0.2)
    if kind == "grind":
        crackle = band(noise() * (rng.random(n) < 0.02), 800, 5000)
        return (0.7 * crackle + band(noise(), 60, 300)) * fade(n, 0.2, 0.3)
    if kind == "uncurl":
        density = envelope(n, [(0, 0.002), (dur, 0.03)])
        crackle = noise() * (rng.random(n) < density)
        low, high = band(crackle, 800, 1600), band(crackle, 1800, 3000)
        mix = envelope(n, [(0, 0), (dur, 1)])
        return ((1 - mix) * low + mix * high) * fade(n, 0.1, 0.15)
    if kind == "pop":
        freq = 150 + 250 * np.exp(-t / 0.015)
        x = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t / 0.04)
        return x + 0.1 * band(noise(), 200, 2000) * np.exp(-t / 0.01)
    if kind == "squeak":
        freq = event["freq"] * (1 + 0.6 * t / dur) * (1 + 0.02 * np.sin(2 * np.pi * 22 * t))
        return np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.hanning(n)
    raise ValueError("Unknown effect kind: " + kind)




def pan_mono(x, pan):
    np = _np()
    angle = (pan + 1) * math.pi / 4
    return np.stack([x * math.cos(angle), x * math.sin(angle)], axis=1)


def rms(x):
    np = _np()
    return float(np.sqrt(np.mean(np.square(x)))) if x.size else 0.0


def room_reverb(x, seed, wet_db):
    """A short, soft garden room: convolution with seeded decaying noise."""
    np = _np()
    rng = np.random.default_rng(event_seed(seed, "room"))
    m = int(0.9 * SR)
    tt = np.arange(m) / SR
    ir = band(rng.standard_normal((m, 2)), 200, 6000) * np.exp(-tt / 0.22)[:, None]
    ir /= np.sqrt(np.sum(ir ** 2, axis=0))
    size = 1 << int(math.ceil(math.log2(len(x) + m)))
    wet = np.fft.irfft(np.fft.rfft(x, size, axis=0) * np.fft.rfft(ir, size, axis=0), size, axis=0)[:len(x)]
    return x + wet * 10 ** (wet_db / 20)

