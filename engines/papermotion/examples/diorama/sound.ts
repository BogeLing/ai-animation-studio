import { Mixer, type SoundLog, type Stereo } from '../../src';
import { foley } from '../shared/foley';
import { lofi } from '../shared/lofi';

/** What the soundtrack needs from the stage. */
export interface Scored {
  readonly sound: SoundLog;
  readonly videoLength: number;
  videoTime(t: number): number;
}

/**
 * The diorama's sound from the shared modules: a `lofi` score (a strum as the trees pop up, a groove down the road,
 * home on Dmaj9 when Clawd smiles), a pop for each pop-up tree, a paper tap for each hop and birds in the village.
 */
export function soundtrack(s: Scored, sr: number): Stereo {
  const len = s.videoLength, V = (t: number) => s.videoTime(t);
  const mix = new Mixer(len, sr)
    .bus('air', { gain: 0.5, reverb: 0.1 })
    .bus('sfx', { gain: 0.8, reverb: 0.08 })
    .bus('music', { gain: 0.8, reverb: 0.28 });

  lofi(mix, len, sr, {
    intro: [[V(0.25), 'Dmaj9']],
    sections: [{ from: V(1.3), to: V(6.1), drums: 0.7, tune: 1 }],
    outro: { at: V(6.1), chord: 'Dmaj9' },
  });
  for (let i = 0; i < 5; i++) mix.add('air', V(0.4 + i * 1.4), foley.birds(60 + i, sr, 2 + (i % 3), 2500 + ((i * 431) % 1300)), { gain: 0.05, pan: ((i * 0.61) % 1.6) - 0.8 });

  const place = (at: number, buffer: Float32Array, gain: number, pan: number) => mix.add('sfx', at, buffer, { gain, pan });
  for (const c of s.sound.cues) {
    const at = V(c.at), g = c.gain, pan = c.pan, seed = c.seed;
    switch (c.name) {
      case 'pop': place(at, foley.pop(seed, sr), 0.4 * g, pan); break;
      case 'tap': place(at, foley.tap(seed, sr), 0.22 * g, pan); break;
      case 'chime': place(at, foley.chime(sr, ['D6', 'F#6', 'A6']), 0.2 * g, pan); break;
    }
  }
  return mix.render({ reverb: { room: 0.55, damp: 0.5, width: 1 }, ceiling: -2, master: 5.9, fadeIn: 0.3, fadeOut: 0.5 });
}
