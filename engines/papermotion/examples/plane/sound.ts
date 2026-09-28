import { Mixer, type SoundLog, type Stereo, instrument, layer, note, voice } from '../../src';

/** What the soundtrack needs from the stage. */
export interface Scored {
  readonly sound: SoundLog;
  readonly videoLength: number;
  videoTime(t: number): number;
  sceneTime(v: number): number;
}

/**
 * A breezy hilltop: wind and grass underneath, the dart's flutter following its speed, a music-box
 * note at each quarter of the loop, and small foley and voice for the throw, the surprise, the landing
 * and the hop. A warm pad holds it together and resolves on the hop's landing.
 */
export function soundtrack(s: Scored, sr: number): Stereo {
  const len = s.videoLength;
  const mix = new Mixer(len, sr)
    .bus('air', { gain: 0.55, reverb: 0.05 })
    .bus('sfx', { gain: 1, reverb: 0.12 })
    .bus('voice', { gain: 0.8, reverb: 0.16 })
    .bus('music', { gain: 0.6, reverb: 0.45 });

  mix.add('air', 0, voice.noise({ duration: len, seed: 3, filter: 'lowpass', freq: t => 420 + 140 * Math.sin(t * 0.9), q: 0.5, level: t => 0.22 + 0.08 * Math.sin(t * 1.3 + 1) }, sr), { gain: 0.6 });
  mix.add('air', 0, voice.noise({ duration: len, seed: 4, filter: 'bandpass', freq: 3400, q: 0.9, crackle: 0.45, level: t => 0.05 + 0.03 * Math.sin(t * 2.3) }, sr), { gain: 0.35, pan: -0.25 });
  for (const [at, from, to, pan] of [[0.5, 3300, 4300, 0.55], [0.62, 3900, 3200, 0.55], [1.95, 3600, 4400, -0.5]] as const) {
    mix.add('air', at, instrument.chirp(from, to, 0.06, sr, { cutoff: 7000 }), { gain: 0.07, pan });
  }

  const fly = s.sound.track('fly');
  mix.add('sfx', 0, voice.noise({
    duration: len, seed: 9, filter: 'bandpass', q: 1.3, crackle: 0.5,
    freq: t => 650 + fly(s.sceneTime(t)) * 1.2, level: t => Math.min(1, fly(s.sceneTime(t)) / 1100) * 0.6,
  }, sr), { gain: 0.28 });

  const pad = (name: string, at: number, length: number, gain: number) => mix.add('music', at, instrument.pad(note(name), length, sr, { attack: 0.8, release: 1.4, cutoff: 900 }), { gain });
  pad('C4', 0.1, 3.4, 0.05); pad('G4', 0.1, 3.4, 0.04); pad('E4', 0.1, 3.4, 0.035);
  const loopNotes = ['E5', 'G5', 'C6', 'E6'];

  for (const c of s.sound.cues) {
    const at = s.videoTime(c.at), pan = c.pan;
    switch (c.name) {
      case 'throw':
        mix.add('sfx', at - 0.03, voice.noise({ duration: 0.45, seed: c.seed, filter: 'bandpass', freq: t => 260 + 2600 * Math.min(1, t / 0.28), q: 1.1, attack: 0.05, decay: 0.2 }, sr), { gain: 0.55, pan });
        mix.add('voice', at - 0.02, instrument.chirp(430, 660, 0.09, sr), { gain: 0.32, pan });
        break;
      case 'note': {
        const i = c.data.i ?? 0;
        mix.add('music', at, instrument.musicBox(note(loopNotes[i % loopNotes.length]), sr), { gain: 0.3, pan: -0.1 + 0.2 * (i % 2) });
        break;
      }
      case 'flip':
        mix.add('sfx', at + 0.06, voice.noise({ duration: 0.12, seed: c.seed, filter: 'bandpass', freq: 2800, q: 1.2, crackle: 0.95, decay: 0.05 }, sr), { gain: 0.2, pan });
        break;
      case 'take':
        mix.add('voice', at, instrument.chirp(520, 1000, 0.16, sr, { vibrato: 45 }), { gain: 0.4, pan });
        break;
      case 'land':
        mix.add('sfx', at, layer(sr,
          { buffer: voice.thump({ duration: 0.2, seed: c.seed, from: 330, to: 150, sweep: 0.025, decay: 0.07, click: 0.7 }, sr), gain: 0.7 },
          { buffer: voice.noise({ duration: 0.12, seed: c.seed + 1, filter: 'bandpass', freq: 3000, q: 1, crackle: 0.9, decay: 0.045 }, sr), gain: 0.5 },
        ), { gain: 0.6, pan });
        mix.add('music', at + 0.02, instrument.musicBox(note('G5'), sr), { gain: 0.26 });
        break;
      case 'hop':
        mix.add('sfx', at, voice.noise({ duration: 0.25, seed: c.seed, filter: 'bandpass', freq: t => 380 + 1400 * Math.min(1, t / 0.18), q: 1, attack: 0.03, decay: 0.12 }, sr), { gain: 0.22, pan });
        mix.add('voice', at + 0.02, instrument.chirp(620, 1150, 0.13, sr, { vibrato: 25 }), { gain: 0.36, pan });
        mix.add('voice', at + 0.17, instrument.chirp(900, 1350, 0.12, sr, { vibrato: 25 }), { gain: 0.3, pan });
        break;
      case 'hopLand':
        mix.add('sfx', at, voice.thump({ duration: 0.2, seed: c.seed, from: 190, to: 70, sweep: 0.03, decay: 0.09, click: 0.3 }, sr), { gain: 0.35, pan });
        ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => mix.add('music', at + 0.05 + i * 0.075, instrument.musicBox(note(n), sr), { gain: 0.24 - i * 0.02 }));
        pad('C4', at, 1.2, 0.05); pad('E4', at, 1.2, 0.04); pad('C5', at, 1.2, 0.03);
        break;
    }
  }

  return mix.render({ reverb: { room: 0.62, damp: 0.5, width: 1 }, ceiling: -1.6, master: 2.2, fadeIn: 0.25, fadeOut: 0.45 });
}
