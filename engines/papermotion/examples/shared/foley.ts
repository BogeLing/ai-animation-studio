import { hz, instrument, layer, note, voice } from '../../src';

/** Scale a buffer in place so its loudest sample is `peak`, and return it. */
export function normalize(buffer: Float32Array, peak = 0.9): Float32Array {
  let m = 0;
  for (const x of buffer) m = Math.max(m, Math.abs(x));
  if (m > 0) for (let i = 0; i < buffer.length; i++) buffer[i] *= peak / m;
  return buffer;
}

const fx = <A extends unknown[]>(make: (...args: A) => Float32Array) => (...args: A): Float32Array => normalize(make(...args));

/**
 * Sound effects for a paper world, each a short mono buffer for `mix.add(bus, at, buffer, { gain, pan })`.
 * Pass the cue's `seed` so repeats never sound identical. Every effect except `surf` is normalised to a peak of
 * 0.9, so `gain` is about its peak level: start near 0.2–0.5 under a score and adjust by ear. Keep them to the
 * story's beats: more than ~40 small effects in a film reads as clutter.
 *
 * @example
 * for (const c of stage.sound.cues) if (c.name === 'pop') mix.add('sfx', stage.videoTime(c.at), foley.pop(c.seed, sr), { gain: 0.3, pan: c.pan });
 */
export const foley = {
  /** A prop popping up out of the page: a soft thump and a crackle of paper. */
  pop: fx((seed: number, sr: number) => layer(sr,
    { buffer: voice.thump({ duration: 0.16, seed, from: 520, to: 200, sweep: 0.015, decay: 0.05, click: 0.8 }, sr), gain: 0.9 },
    { buffer: voice.noise({ duration: 0.1, seed: seed + 1, filter: 'bandpass', freq: 2200, q: 0.9, crackle: 0.6, decay: 0.03 }, sr), gain: 0.5 },
  )),

  /** A card knocked into place: a short woody knock. */
  knock: fx((seed: number, sr: number) => layer(sr,
    { buffer: voice.thump({ duration: 0.22, seed, from: 280, to: 140, sweep: 0.012, decay: 0.07, click: 0.7, tone: 0.3 }, sr), gain: 1 },
    { buffer: voice.noise({ duration: 0.07, seed: seed + 1, filter: 'bandpass', freq: 1800, q: 0.9, crackle: 0.5, decay: 0.02 }, sr), gain: 0.4 },
  )),

  /** A title letter landing; `index` raises the pitch letter by letter. */
  letter: fx((seed: number, sr: number, index: number = 0) => layer(sr,
    { buffer: voice.thump({ duration: 0.2, seed, from: 320 + index * 40, to: 130, sweep: 0.02, decay: 0.06, click: 0.5 }, sr), gain: 1 },
    { buffer: voice.noise({ duration: 0.08, seed: seed + 1, filter: 'bandpass', freq: 2600, q: 0.9, crackle: 0.6, decay: 0.025 }, sr), gain: 0.4 },
  )),

  /** Paper sliding over wood. */
  slide: fx((seed: number, sr: number, duration: number = 0.55) =>
    voice.noise({ duration, seed, filter: 'bandpass', freq: 1100, q: 0.6, crackle: 0.35, attack: 0.05, hold: duration * 0.4, decay: 0.12 }, sr)),

  /** Air rushing past: a throw, a camera move, a title lifting away. */
  whoosh: fx((seed: number, sr: number, duration: number = 0.6) =>
    voice.noise({ duration, seed, filter: 'bandpass', freq: t => 500 + 2400 * Math.sin((Math.PI * t) / duration), q: 0.8, attack: duration * 0.35, decay: duration * 0.3 }, sr)),

  /** A quick rising swish: something lifted or tossed. */
  swish: fx((seed: number, sr: number) =>
    voice.noise({ duration: 0.4, seed, filter: 'bandpass', freq: t => 900 + 3200 * t, q: 1, attack: 0.07, decay: 0.12 }, sr)),

  /** Tape torn off a roll. */
  tape: fx((seed: number, sr: number) =>
    voice.noise({ duration: 0.3, seed, filter: 'bandpass', freq: t => 1800 + 4000 * t, q: 1.2, crackle: 0.9, attack: 0.01, hold: 0.08, decay: 0.08 }, sr)),

  /** A hop landing: a soft tap. */
  tap: fx((seed: number, sr: number) => layer(sr,
    { buffer: voice.thump({ duration: 0.12, seed, from: 230, to: 110, sweep: 0.015, decay: 0.035, click: 0.3 }, sr), gain: 1 },
    { buffer: voice.noise({ duration: 0.08, seed: seed + 1, filter: 'bandpass', freq: 1800, q: 0.8, crackle: 0.6, decay: 0.02 }, sr), gain: 0.27 },
  )),

  /** A double click: a pointer linking, a latch. */
  click: fx((seed: number, sr: number) => layer(sr,
    { buffer: voice.noise({ duration: 0.03, seed, filter: 'bandpass', freq: 3600, q: 0.9, decay: 0.006 }, sr), gain: 1 },
    { buffer: voice.noise({ duration: 0.03, seed: seed + 1, filter: 'bandpass', freq: 3000, q: 0.9, decay: 0.006 }, sr), gain: 0.8, delay: 0.06 },
  )),

  /** Paper crumpling. */
  crumple: fx((seed: number, sr: number) =>
    voice.noise({ duration: 0.5, seed, filter: 'bandpass', freq: 2100, q: 0.8, crackle: 0.95, attack: 0.03, hold: 0.18, decay: 0.12 }, sr)),

  /** A rubber stamp coming down. */
  stamp: fx((seed: number, sr: number) => layer(sr,
    { buffer: voice.thump({ duration: 0.3, seed, from: 190, to: 70, sweep: 0.02, decay: 0.1, click: 0.9 }, sr), gain: 1 },
    { buffer: voice.noise({ duration: 0.06, seed: seed + 1, filter: 'lowpass', freq: 3200, q: 0.7, decay: 0.02 }, sr), gain: 0.6 },
  )),

  /** Something landing in a metal bin: a thump and an inharmonic ring. */
  clank: fx((seed: number, sr: number) => layer(sr,
    { buffer: voice.thump({ duration: 0.3, seed, from: 420, to: 170, sweep: 0.01, decay: 0.08, click: 1 }, sr), gain: 1 },
    { buffer: voice.bell({ freq: 620, duration: 0.8, ratio: 2.76, index: 3, decay: 0.35 }, sr), gain: 0.22 },
    { buffer: voice.bell({ freq: 910, duration: 0.6, ratio: 1.41, index: 2, decay: 0.25 }, sr), gain: 0.14 },
  )),

  /** A camera shutter: two clicks around a small mechanical thunk. */
  shutter: fx((seed: number, sr: number) => layer(sr,
    { buffer: voice.noise({ duration: 0.03, seed, filter: 'bandpass', freq: 3200, q: 1.5, decay: 0.006 }, sr), gain: 1 },
    { buffer: voice.thump({ duration: 0.06, seed: seed + 1, from: 900, to: 400, sweep: 0.01, decay: 0.015, click: 0.8 }, sr), gain: 0.6, delay: 0.004 },
    { buffer: voice.noise({ duration: 0.03, seed: seed + 2, filter: 'bandpass', freq: 2600, q: 1.5, decay: 0.008 }, sr), gain: 0.7, delay: 0.07 },
  )),

  /** An instant photo whirring out of the camera. */
  whirr: fx((seed: number, sr: number) => layer(sr,
    { buffer: voice.tone({ freq: t => 520 + 60 * Math.sin(t * 90), length: 0.35, attack: 0.02, release: 0.05, wave: 'saw', cutoff: 1400 }, sr), gain: 0.5 },
    { buffer: voice.noise({ duration: 0.4, seed, filter: 'bandpass', freq: 1800, q: 1.5, crackle: 0.5, attack: 0.03, hold: 0.25, decay: 0.05 }, sr), gain: 1 },
  )),

  /** A bright chime on a few notes (a rule stated, a reveal). */
  chime: fx((sr: number, notes: string[] = ['D6', 'A6']) =>
    layer(sr, ...notes.map((n, i) => ({ buffer: instrument.chime(note(n), sr, { decay: 0.9 - i * 0.1 }), gain: 1 - i * 0.3, delay: i * 0.08 })))),

  /** "Uh-oh": two falling mallet notes. */
  uhOh: fx((sr: number) => layer(sr,
    { buffer: instrument.mallet(note('E5'), sr, { decay: 0.3 }), gain: 1 },
    { buffer: instrument.mallet(note('C5'), sr, { decay: 0.45 }), gain: 1, delay: 0.17 },
  )),

  /** A short phrase of birdsong: `count` chirps near `pitch` Hz. */
  birds: fx((seed: number, sr: number, count: number = 3, pitch: number = 2800) =>
    layer(sr, ...Array.from({ length: count }, (_, k) => {
      const f = pitch * (1 + (((seed * 7 + k * 13) % 10) - 5) / 40);
      return { buffer: instrument.chirp(f, f * 1.3, 0.06, sr, { cutoff: 9000 }), gain: 1, delay: k * 0.09 };
    }))),

  /** A seagull's two-part call. */
  gull: fx((sr: number, pitch: number = 1500) => layer(sr,
    { buffer: instrument.chirp(pitch, pitch * 0.63, 0.26, sr, { vibrato: 60, cutoff: 5000 }), gain: 1 },
    { buffer: instrument.chirp(pitch, pitch * 0.63, 0.26, sr, { vibrato: 60, cutoff: 5000 }), gain: 1, delay: 0.34 },
  )),

  /** A plucked note, for tiny pitched accents (a card in hand, a link). */
  pluck: fx((seed: number, sr: number, name: string = 'A5') =>
    voice.pluck({ freq: hz(note(name)), duration: 0.5, seed, decay: 0.35, brightness: 0.55 }, sr)),

  /**
   * Surf, a bed rather than a hit: waves washing in about every 4 s, `duration` long, fading in and out over
   * 1.2 s. Not normalised; `level` sets how loud it is (0.1 a hush of water, 0.2 a beach).
   */
  surf: (seed: number, sr: number, duration: number, level = 0.15): Float32Array => voice.noise({
    duration, seed, filter: 'lowpass', freq: t => 500 + 350 * Math.sin(t * 1.4), q: 0.5,
    level: t => level * Math.min(1, t / 1.2, (duration - t) / 1.2) * (0.55 + 0.45 * Math.sin((t * Math.PI * 2) / 4.2) ** 2),
  }, sr),
};
