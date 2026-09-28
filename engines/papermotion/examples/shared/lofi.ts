import { type Mixer, hz, instrument, note, voice } from '../../src';

/** A chord: a bass note and a keys voicing, as note names. */
export interface LofiChord { bass: string; keys: string[] }

/** A warm D-major palette: rootless electric-piano voicings around middle C. */
export const LOFI_CHORDS: Record<string, LofiChord> = {
  Gmaj7: { bass: 'G2', keys: ['F#3', 'B3', 'D4', 'A4'] },
  'F#m7': { bass: 'F#2', keys: ['E3', 'A3', 'C#4', 'F#4'] },
  Em9: { bass: 'E2', keys: ['D3', 'G3', 'B3', 'F#4'] },
  A13: { bass: 'A1', keys: ['G3', 'C#4', 'F#4', 'B4'] },
  Dmaj9: { bass: 'D2', keys: ['F#3', 'A3', 'C#4', 'E4'] },
};

/** IVmaj7 – iii7 – ii9 – V13 in D: it never quite resolves, so it can loop under anything. */
export const LOFI_LOOP = ['Gmaj7', 'F#m7', 'Em9', 'A13'];

/** A lazy D-major pentatonic tune on the eighths (null = rest): 64 eighths, 8 bars of 2 s. */
export const LOFI_TUNE: (string | null)[] = [
  'B4', null, 'A4', 'F#4', null, null, 'E4', null, 'A4', null, 'E4', null, null, null, 'D4', null,
  'F#4', 'E4', 'D4', null, 'B3', null, null, null, 'E4', null, null, null, null, null, null, null,
  'D5', null, 'B4', 'A4', null, 'F#4', null, null, 'E4', 'F#4', 'A4', null, null, null, null, null,
  'B4', 'A4', 'F#4', 'E4', null, 'D4', null, null, 'E4', null, 'F#4', null, 'A4', null, null, null,
];

export interface LofiSection {
  /** Video seconds. The section plays whole bars from `from`; its last chord rings on past `to`. */
  from: number;
  to: number;
  /** Beat level, 0…1 (0 = keys and bass only). */
  drums?: number;
  /** Bars to wait before the beat comes in. */
  drumsFrom?: number;
  /** Play the tune, starting this many bars in; omit for no tune. */
  tune?: number;
  /** Windows (video seconds) where the beat and the tune drop out: tension before a big moment. */
  hush?: [number, number][];
}

export interface LofiOpts {
  sections: LofiSection[];
  chords?: Record<string, LofiChord>;
  loop?: string[];
  tune?: (string | null)[];
  /** One bar in seconds: 2 s is 120 BPM counted in half time. */
  bar?: number;
  bus?: string;
  gain?: number;
  /** Level of the vinyl crackle bed; 0 turns it off. */
  crackle?: number;
  /** Strums before the first section (a title), as [time, chord]. */
  intro?: [number, string][];
  /** Land home: the chord that rings out to the end, from `at`. */
  outro?: { at: number; chord: string };
  /** A brushed swell into each section's first downbeat. */
  swells?: boolean;
}

/** An electric-piano note: a two-operator FM tine with a slightly detuned twin. */
export function ePiano(midi: number, decay: number, sr: number): Float32Array {
  const a = voice.bell({ freq: hz(midi), duration: decay * 3, ratio: 1, index: 1.6, decay, indexDecay: 0.08, attack: 0.004 }, sr);
  const b = voice.bell({ freq: hz(midi) * 1.004, duration: decay * 3, ratio: 1, index: 0.9, decay: decay * 0.8, indexDecay: 0.06, attack: 0.006 }, sr);
  for (let i = 0; i < a.length; i++) a[i] = 0.7 * a[i] + 0.3 * (b[i] ?? 0);
  return a;
}

/** A brushed-noise swell `length` s long, rising into its end. */
export function swell(length: number, seed: number, sr: number): Float32Array {
  return voice.noise({ duration: length, seed, filter: 'bandpass', q: 0.7, freq: t => 500 + 2600 * (t / length) ** 2, level: t => 0.1 * (t / length) ** 2.2 }, sr);
}

/** A soft half-time kit. */
export const drums = {
  kick: (seed: number, sr: number): Float32Array => voice.thump({ duration: 0.5, seed, from: 120, to: 46, sweep: 0.04, decay: 0.16, click: 0.15 }, sr),
  snare: (seed: number, sr: number): Float32Array => voice.noise({ duration: 0.3, seed, filter: 'bandpass', freq: 1700, q: 0.7, decay: 0.09 }, sr),
  hat: (seed: number, sr: number): Float32Array => voice.noise({ duration: 0.08, seed, filter: 'highpass', freq: 7500, q: 0.7, decay: 0.022 }, sr),
};

/**
 * A warm lo-fi score from a few parameters: soft electric-piano chords on a looping progression, a round bass,
 * a laid-back half-time beat with swung hats, a muted-pluck tune and a quiet vinyl crackle. One style for the
 * whole film; sections only add or take away layers. The beat stops before each section ends, so the moves
 * between sections (which may run in slow motion) ride on a ringing chord instead of an uneven groove.
 *
 * All times are video seconds: map scene times with `stage.videoTime(t)` first.
 *
 * @example
 * lofi(mix, s.videoLength, sr, { intro: [[0.2, 'Dmaj9']], sections: [{ from: 4, to: 24, drums: 0.6, tune: 2 }], outro: { at: 42, chord: 'Dmaj9' } });
 */
export function lofi(mix: Mixer, length: number, sr: number, o: LofiOpts): void {
  const chords = o.chords ?? LOFI_CHORDS, loop = o.loop ?? LOFI_LOOP, tune = o.tune ?? LOFI_TUNE, bar = o.bar ?? 2, bus = o.bus ?? 'music';
  const gain = o.gain ?? 1, m = (n: string) => note(n), step = bar / 16;
  const chord = (name: string) => { const c = chords[name]; if (!c) throw new Error(`lofi: no chord named ${name}`); return c; };
  const put = (at: number, buf: Float32Array, g: number, pan = 0) => { if (at >= 0 && at < length) mix.add(bus, at, buf, { gain: g * gain, pan }); };
  const strum = (at: number, name: string, g: number, decay: number) =>
    chord(name).keys.forEach((n, i) => put(at + i * 0.018, ePiano(m(n), decay, sr), g * (i === 3 ? 0.8 : 1), -0.25 + i * 0.15));
  const hushed = (s: LofiSection, at: number) => (s.hush ?? []).some(([a, b]) => at >= a && at < b);

  if ((o.crackle ?? 0.05) > 0) put(0, voice.noise({ duration: length, seed: 901, filter: 'lowpass', freq: 5200, q: 0.5, crackle: 0.96, level: () => o.crackle ?? 0.05 }, sr), 0.5);
  for (const [at, name] of o.intro ?? []) strum(at, name, 0.12, 2);

  for (const s of o.sections) {
    const bars = Math.max(1, Math.round((s.to - s.from) / bar)), d = s.drums ?? 1;
    if (o.swells !== false) put(s.from - 1, swell(1, Math.round(s.from * 100), sr), 0.45, 0.1);
    for (let b = 0; b < bars; b++) {
      const t = s.from + b * bar, name = loop[b % loop.length], last = b === bars - 1, c = chord(name);
      strum(t, name, 0.1, last ? 2.6 : 1.4);
      if (!last) strum(t + bar * 0.625, name, 0.05, 0.6);
      put(t, instrument.bass(m(c.bass), sr, { decay: last ? 2 : 1.1 }), 0.3);
      if (!last) put(t + bar * 0.625, instrument.bass(m(c.bass) + 7, sr, { decay: 0.6 }), 0.16);
      if (d <= 0 || b < (s.drumsFrom ?? 0)) continue;
      for (let k = 0; k < 16; k++) {
        const at = t + k * step, seed = Math.round(at * 100);
        if (at >= s.to - 0.05 || hushed(s, at)) continue;
        if (k === 0 || k === 10) put(at, drums.kick(1000 + seed, sr), 0.45 * d);
        if (k === 8) put(at + 0.01, drums.snare(2000 + seed, sr), 0.2 * d, 0.05);
        if (k % 2 === 0) put(at + (k % 4 === 2 ? 0.06 : 0), drums.hat(3000 + seed, sr), (k % 4 === 0 ? 0.045 : 0.03) * d, 0.2);
      }
    }
    if (s.tune === undefined) continue;
    const start = s.from + s.tune * bar;
    for (let k = 0; start + k * step * 2 < s.to - 0.4; k++) {
      const at = start + k * step * 2, n = tune[k % tune.length];
      if (!n || hushed(s, at)) continue;
      put(at + (k % 2 ? 0.04 : 0), instrument.harp(m(n), sr, { decay: 0.5, brightness: 0.25, seed: 4000 + k }), 0.15, 0.15);
    }
  }

  if (o.outro) {
    const { at, chord: name } = o.outro, c = chord(name);
    strum(at, name, 0.14, 3.2);
    c.keys.forEach((n, i) => put(at, instrument.pad(m(n), Math.max(0.5, length - at - 0.6), sr, { attack: 0.6, release: 0.9, cutoff: 950, seed: 50 + i }), 0.035));
    put(at, instrument.bass(m(c.bass), sr, { decay: 2.4 }), 0.3);
    put(at, drums.kick(1500, sr), 0.3);
  }
}
