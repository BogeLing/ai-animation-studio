import { Mixer, type SoundLog, type Stereo, voice as synth } from '../../src';
import type { Screen } from '../shared/screen';
import { foley } from '../shared/foley';
import { lofi } from '../shared/lofi';
import type { Voice } from '../shared/narration';

/** What the soundtrack needs from the stage. */
export interface Scored {
  readonly sound: SoundLog;
  readonly videoLength: number;
  videoTime(t: number): number;
  readonly voice: Voice;
  readonly voiceAt: number;
  /** Seconds the film runs on after the narration (the last chord rings through them). */
  readonly tail: number;
  /** A film-first opening: the film on the paper TV, and when the score comes in (the camera's pull-back). */
  readonly screen?: Screen;
  readonly musicAt: number;
}

/** Linear resampling, for a mix at another rate than the voice was decoded at. */
function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return x;
  const out = new Float32Array(Math.floor((x.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    const p = (i * from) / to, k = Math.floor(p), f = p - k;
    out[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? 0) * f;
  }
  return out;
}

/**
 * The tutorial's sound: the narration on its own bus, a quiet lo-fi bed under it (chords, bass and a soft beat;
 * no tune to compete with the voice), and a few paper sounds on the board's beats.
 */
export function soundtrack(s: Scored, sr: number): Stereo {
  const len = s.videoLength, V = (t: number) => s.videoTime(t);
  const mix = new Mixer(len, sr)
    .bus('voice', { gain: 1, reverb: 0.03 })
    .bus('sfx', { gain: 0.6, reverb: 0.08 })
    .bus('music', { gain: 0.14, reverb: 0.25 });

  mix.add('voice', V(s.voiceAt), resample(s.voice.samples, s.voice.rate, sr), { gain: 1 });
  const m = s.musicAt;
  lofi(mix, len, sr, { intro: [[m, 'Dmaj9']], sections: [{ from: m + 0.9, to: len - s.tail - 0.2, drums: 0.35 }], outro: { at: len - s.tail, chord: 'Dmaj9' }, crackle: 0.035 });
  // A film-first opening plays the film's own sound, down under the narrator, gone soon after the pull-back.
  const film = s.screen?.sound(sr, V(m) + 1.4, 0.6);
  if (film) {
    const talk = V(s.voiceAt) - 0.15;
    for (const ch of [film.left, film.right]) for (let i = 0; i < ch.length; i++) ch[i] *= i / sr < talk ? 1 : 0.2 + 0.8 * Math.max(0, 1 - (i / sr - talk) / 0.4);
    mix.bus('film', { gain: 0.45, reverb: 0 });
    mix.add('film', 0, film.left, { pan: -1 });
    mix.add('film', 0, film.right, { pan: 1 });
  }

  const put = (at: number, buffer: Float32Array, gain: number, pan: number) => mix.add('sfx', at, buffer, { gain, pan });
  for (const c of s.sound.cues) {
    const at = V(c.at), g = c.gain, pan = c.pan, seed = c.seed;
    switch (c.name) {
      case 'letter': put(at, foley.letter(seed, sr, c.data.i ?? 0), 0.18 * g, pan); break;
      case 'whoosh': put(at, foley.whoosh(seed, sr, 0.9), 0.14 * g, pan); break;
      case 'tap': put(at, foley.tap(seed, sr), 0.1 * g, pan); break;
      case 'pop': put(at, foley.pop(seed, sr), 0.2 * g, pan); break;
      case 'pip': put(at, foley.pop(seed, sr), 0.09 * g, pan); break;
      case 'typing': {
        // Keys: short, bright ticks at an uneven typing pace.
        const n = Math.round((c.data.length ?? 1) * 13);
        for (let k = 0, t = at; k < n; k++, t += 0.055 + ((seed * 7 + k * 13) % 5) * 0.012) {
          put(t, synth.noise({ duration: 0.025, seed: seed + k, filter: 'bandpass', freq: 3200 + ((k * 431) % 1400), q: 1.4, decay: 0.006 }, sr), 0.05 * g, pan);
        }
        break;
      }
      case 'stamp': put(at, foley.stamp(seed, sr), 0.3 * g, pan); break;
      case 'ding': put(at, foley.chime(sr, ['A5', 'E6']), 0.1 * g, pan); break;
      case 'shutter': put(at, foley.shutter(seed, sr), 0.16 * g, pan); break;
    }
  }
  return mix.render({ reverb: { room: 0.5, damp: 0.5, width: 1 }, ceiling: -1.5, master: 7.3, fadeIn: 0.2, fadeOut: 0.6 });
}
