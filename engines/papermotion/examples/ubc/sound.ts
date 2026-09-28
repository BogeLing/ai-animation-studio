import { Mixer, type SoundLog, type Stereo, hz, instrument, layer, note, voice } from '../../src';
import { foley } from '../shared/foley';
import { lofi } from '../shared/lofi';

/** What the soundtrack needs from the stage. */
export interface Scored {
  readonly sound: SoundLog;
  readonly videoLength: number;
  videoTime(t: number): number;
}

/** The clock tower's carillon: five bells, struck one after another. */
function carillon(sr: number): Float32Array {
  return layer(sr, ...['D5', 'B4', 'G4', 'D5', 'G5'].map((n, i) => ({
    buffer: layer(sr,
      { buffer: voice.bell({ freq: hz(note(n)), duration: 2.4, ratio: 2, index: 2.4, decay: 1.2, indexDecay: 0.25 }, sr), gain: 1 },
      { buffer: voice.bell({ freq: hz(note(n)) * 2.4, duration: 1, ratio: 1.41, index: 1, decay: 0.45 }, sr), gain: 0.25 },
    ),
    gain: 1,
    delay: i * 0.3 + (i === 4 ? 0.15 : 0),
  })));
}

/**
 * The tour's sound, built on the shared modules: a `lofi` score (strums under the title, a groove across the
 * walk, home on Dmaj9 for the album) and `foley` for every cue, plus the clock tower's bells, morning birds,
 * gulls and surf at the beach.
 */
export function soundtrack(s: Scored, sr: number): Stereo {
  const len = s.videoLength, V = (t: number) => s.videoTime(t);
  const mix = new Mixer(len, sr)
    .bus('air', { gain: 0.5, reverb: 0.12 })
    .bus('sfx', { gain: 0.8, reverb: 0.08 })
    .bus('music', { gain: 0.8, reverb: 0.28 });

  lofi(mix, len, sr, {
    intro: [[V(0.2), 'Dmaj9'], [V(1.1), 'Gmaj7']],
    sections: [{ from: V(2.0), to: V(10.0), drums: 0.8, tune: 1 }],
    outro: { at: V(10.0), chord: 'Dmaj9' },
  });

  for (let i = 0; i < 7; i++) mix.add('air', V(0.5 + i * 0.75), foley.birds(60 + i, sr, 2 + (i % 3), 2600 + ((i * 431) % 1200)), { gain: 0.045, pan: ((i * 0.53) % 1.6) - 0.8 });
  mix.add('air', V(7.8), foley.surf(62, sr, len - V(7.8), 0.18), { gain: 1 });

  const put = (at: number, buffer: Float32Array, gain: number, pan: number, bus = 'sfx') => mix.add(bus, at, buffer, { gain, pan });
  for (const c of s.sound.cues) {
    const at = V(c.at), g = c.gain, pan = c.pan, seed = c.seed;
    switch (c.name) {
      case 'letter': put(at, foley.letter(seed, sr, c.data.i ?? 0), 0.28 * g, pan); break;
      case 'whoosh': put(at, foley.whoosh(seed, sr), 0.25 * g, pan); break;
      case 'tap': put(at, foley.tap(seed, sr), 0.22 * g, pan); break;
      case 'sign': put(at, foley.pop(seed, sr), 0.34 * g, pan); break;
      case 'carillon': put(at, carillon(sr), 0.12 * g, pan, 'air'); break;
      case 'gull': put(at, foley.gull(sr), 0.06 * g, pan, 'air'); break;
      case 'shutter': put(at, foley.shutter(seed, sr), 0.4 * g, pan); break;
      case 'whirr': put(at, foley.whirr(seed, sr), 0.12 * g, pan); break;
      case 'swish': put(at, foley.swish(seed, sr), 0.2 * g, pan); break;
      case 'deal':
        put(at, foley.swish(seed, sr), 0.15 * g, pan);
        put(at + 0.25, instrument.musicBox(note(['D6', 'F#6', 'A6', 'D7'][c.data.i ?? 0] ?? 'A6'), sr, { decay: 0.5 }), 0.07 * g, pan);
        break;
      case 'chime': put(at, foley.chime(sr, ['D6', 'F#6', 'A6', 'E7']), 0.2 * g, pan); break;
    }
  }
  return mix.render({ reverb: { room: 0.55, damp: 0.5, width: 1 }, ceiling: -2, master: 5.4, fadeIn: 0.3, fadeOut: 0.5 });
}
