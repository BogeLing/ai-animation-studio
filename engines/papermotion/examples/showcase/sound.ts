import { Mixer, type SoundLog, type Stereo, instrument, note } from '../../src';
import { foley } from '../shared/foley';
import { lofi } from '../shared/lofi';

/** What the soundtrack needs from the stage. */
export interface Scored {
  readonly sound: SoundLog;
  readonly videoLength: number;
  videoTime(t: number): number;
}

/**
 * The showcase's sound, built only from the shared modules: a `lofi` score (two strums under the title, a groove
 * across the walk, home on Dmaj9 for the album) and `foley` for every cue, over birdsong in the morning and
 * surf by the lighthouse.
 */
export function soundtrack(s: Scored, sr: number): Stereo {
  const len = s.videoLength, V = (t: number) => s.videoTime(t);
  const mix = new Mixer(len, sr)
    .bus('air', { gain: 0.5, reverb: 0.1 })
    .bus('sfx', { gain: 0.8, reverb: 0.08 })
    .bus('music', { gain: 0.8, reverb: 0.28 });

  lofi(mix, len, sr, {
    intro: [[V(0.2), 'Dmaj9'], [V(1.2), 'Gmaj7']],
    sections: [{ from: V(2.4), to: V(9.6), drums: 0.8, tune: 1 }],
    outro: { at: V(9.7), chord: 'Dmaj9' },
  });

  for (let i = 0; i < 6; i++) mix.add('air', V(0.6 + i * 0.7), foley.birds(40 + i, sr, 2 + (i % 3), 2600 + ((i * 431) % 1200)), { gain: 0.05, pan: ((i * 0.53) % 1.6) - 0.8 });
  mix.add('air', V(7), foley.surf(52, sr, len - V(7), 0.18), { gain: 1 });
  mix.add('air', V(8.4), foley.gull(sr), { gain: 0.05, pan: 0.6 });

  const place = (at: number, buffer: Float32Array, gain: number, pan: number) => mix.add('sfx', at, buffer, { gain, pan });
  for (const c of s.sound.cues) {
    const at = V(c.at), g = c.gain, pan = c.pan, seed = c.seed;
    switch (c.name) {
      case 'letter': place(at, foley.letter(seed, sr, c.data.i ?? 0), 0.3 * g, pan); break;
      case 'whoosh': place(at, foley.whoosh(seed, sr), 0.25 * g, pan); break;
      case 'glide': place(at, foley.whoosh(seed, sr, 1.4), 0.12 * g, pan); break;
      case 'tap': place(at, foley.tap(seed, sr), 0.22 * g, pan); break;
      case 'pop': place(at, foley.pop(seed, sr), 0.4 * g, pan); place(at + 0.12, foley.pluck(seed, sr, 'D6'), 0.08 * g, pan); break;
      case 'shutter': place(at, foley.shutter(seed, sr), 0.4 * g, pan); break;
      case 'whirr': place(at, foley.whirr(seed, sr), 0.12 * g, pan); break;
      case 'swish': place(at, foley.swish(seed, sr), 0.2 * g, pan); break;
      case 'deal':
        place(at, foley.swish(seed, sr), 0.15 * g, pan);
        place(at + 0.25, instrument.musicBox(note(['D6', 'F#6', 'A6'][c.data.i ?? 0] ?? 'A6'), sr, { decay: 0.5 }), 0.07 * g, pan);
        break;
      case 'chime': place(at, foley.chime(sr, ['D6', 'F#6', 'A6', 'E7']), 0.2 * g, pan); break;
    }
  }
  return mix.render({ reverb: { room: 0.55, damp: 0.5, width: 1 }, ceiling: -2, master: 5.4, fadeIn: 0.3, fadeOut: 0.5 });
}
