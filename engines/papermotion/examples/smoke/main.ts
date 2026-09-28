import {
  Camera, Mixer, type Pt, type RidgeSpec, Stage, type Stereo, type V,
  circlePoly, clamp, drawRidge, fillGradient, grain, instrument, layer, layoutLetters, note, overshoot, ridgeHeight, smoothstep, vignette, voice, wash,
} from '../../src';

const W = 1920, H = 1080;
const FAR: RidgeSpec = { seed: 5, base: 700, amp: 50, freq: 0.0025, color: '#a9b2cf', tear: 3, shadow: 0 };
const NEAR: RidgeSpec = { seed: 6, base: 830, amp: 36, freq: 0.002, color: '#7d9a5a', tear: 3, bands: [{ offset: 60, color: '#6b8a4b' }] };
const HOUSE = 1060, GROUND = ridgeHeight(NEAR, HOUSE);
const CHIMNEY: V = { x: HOUSE + 78, y: GROUND - 262 };
/** When the chimney puffs (s). */
const PUFFS = [0.08, 0.42];
/** Lobes of a puff: offset and radius, in units of its size. */
const LOBES: [number, number, number][] = [[-0.55, 0.15, 0.62], [0, -0.22, 0.8], [0.6, 0.08, 0.58]];
const FONT = '800 150px Montserrat', WORD = 'OK', WORD_AT: V = { x: 300, y: 330 }, WORD_FROM = 0.46, LETTER_GAP = 0.08;
const at = (dx: number, dy: number): V => ({ x: HOUSE + dx, y: GROUND + dy });

interface Puff { p: Pt; born: number; seed: number; size: number }

/**
 * The smoke test: one second in which a paper cottage's chimney puffs twice and "OK" drops in. It is
 * short so `pnpm smoke` can prove the whole pipeline quickly (Vite, Chromium, the bundled font, paper,
 * physics, camera, sound, ffmpeg), not to tell a story.
 */
export class SmokeScene extends Stage {
  private readonly cam = new Camera(W / 2, { width: W, height: H, handheld: 2 });
  private readonly puffs: Puff[] = [];
  private readonly letters: ReturnType<typeof layoutLetters>;
  private cued = 0;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { duration: 1 });
    // A fallback font would pass unnoticed in the frames, so fail unless the bundled face really loaded.
    const loaded = [...document.fonts].some(f => f.family.replace(/["']/g, '') === 'Montserrat' && f.status === 'loaded');
    if (!loaded) throw new Error('Montserrat is not loaded: check its @font-face in index.html and public/fonts/');
    this.paper.light = { x: -0.55, y: 0.75 };
    this.world.wind = () => ({ x: 110, y: -25 });
    this.letters = layoutLetters(this.ctx, WORD, FONT);
  }

  protected start(): void { this.cam.cut({ x: W / 2, y: H / 2, zoom: 1.08 }); }

  protected update(t: number): void {
    while (this.puffs.length < PUFFS.length && t >= PUFFS[this.puffs.length]) {
      const i = this.puffs.length, p = this.world.point(CHIMNEY.x, CHIMNEY.y - 12, { mass: 0.2, drag: 0.04, gravity: -0.25 });
      p.px = p.x - 40 * this.dt; p.py = p.y + 320 * this.dt;   // leaves the chimney going up
      this.puffs.push({ p, born: t, seed: 40 + i * 10, size: i ? 38 : 50 });
      this.cue('puff', { gain: i ? 0.75 : 1, pan: this.pan(CHIMNEY), data: { i } });
    }
    while (this.cued < this.letters.length && t >= WORD_FROM + this.cued * LETTER_GAP) {
      this.cue('letter', { pan: this.pan({ x: WORD_AT.x + this.letters[this.cued].x, y: WORD_AT.y }, 0), data: { i: this.cued } });
      this.cued++;
    }
  }

  protected lateUpdate(t: number, dt: number): void {
    this.cam.frame({ x: W / 2 + t * 90, y: H / 2, zoom: 1.08 + t * 0.04 }, dt, t);
  }

  probe(): Record<string, unknown> {
    return { ...super.probe(), puffs: this.puffs.map(({ p }) => ({ x: Math.round(p.x), y: Math.round(p.y) })), letters: this.cued };
  }

  protected draw(t: number, frame: number): void {
    const { ctx, paper, cam } = this;
    fillGradient(ctx, [[0, '#9cbfd6'], [0.62, '#f0dcc2'], [1, '#f2cfa6']]);
    cam.layer(paper, 0.05, () => paper.piece(circlePoly({ x: 1500, y: 240 }, 64, 36), '#fff2d2', { seed: 3, tear: 2, shadow: 0 }));
    cam.layer(paper, 0.3, v => drawRidge(paper, FAR, v.from, v.to, v.bottom + 200));
    cam.layer(paper, 1, v => {
      this.cottage();
      drawRidge(paper, NEAR, v.from, v.to, v.bottom + 200);
      for (const puff of this.puffs) this.puff(puff, t);
    });
    this.word(t);
    vignette(ctx, [40, 30, 50], 0.3);
    grain(ctx, frame, 0.05);
    wash(ctx, '#f3e6cf', 0.85 * (1 - smoothstep(0, 0.15, t)));
  }

  /** One sheet of paper: chimney, walls and roof, with the window and door cut inside it. */
  private cottage(): void {
    const { paper } = this;
    paper.sheet({ shadow: 10, rim: { color: '#fff4dc', width: 3 }, shade: { color: 'rgba(70, 40, 60, 0.22)', width: 16 }, anchor: at(0, 0) }, () => {
      paper.piece([at(58, -250), at(98, -250), at(98, -180), at(58, -180)], '#9c4a3c', { seed: 11, tear: 1.2 });
      paper.piece([at(52, -264), at(104, -264), at(104, -248), at(52, -248)], '#6f3a33', { seed: 12, tear: 1 });
      paper.piece([at(-120, -150), at(120, -150), at(120, 30), at(-120, 30)], '#eadcc4', { seed: 13, tear: 1.5 });
      paper.piece([at(-160, -136), at(0, -268), at(160, -136)], '#c65a43', { seed: 14, tear: 1.5 });
      paper.inside(() => {
        paper.piece([at(-82, -106), at(-32, -106), at(-32, -56), at(-82, -56)], '#ffd98a', { seed: 15, tear: 1 });
        paper.piece([at(22, -96), at(70, -96), at(70, 20), at(22, 20)], '#7a5240', { seed: 16, tear: 1 });
      });
    });
  }

  /** A puff of paper smoke: pops out of the chimney, then swells as it rises on the wind. */
  private puff({ p, born, seed, size }: Puff, t: number): void {
    const age = t - born, r = size * (0.3 + 0.7 * overshoot(clamp(age / 0.3), 1.6)) * (1 + 0.35 * age);
    this.paper.sheet({ shadow: 5, rim: { color: '#ffffff', width: 2.5 }, shade: { color: 'rgba(110, 100, 130, 0.22)', width: 10 }, anchor: p }, () => {
      LOBES.forEach(([dx, dy, s], j) => this.paper.piece(circlePoly({ x: p.x + dx * r, y: p.y + dy * r }, s * r, 22), '#f5f1e8', { seed: seed + j, tear: 1.4 }));
    });
  }

  /** "OK", cut from paper: each letter drops in and settles. */
  private word(t: number): void {
    this.letters.forEach((l, i) => {
      const u = (t - WORD_FROM - i * LETTER_GAP) / 0.32;
      if (u <= 0) return;
      const k = Math.min(1, u);
      this.paper.text(l.ch, { x: WORD_AT.x + l.x, y: WORD_AT.y - 90 * (1 - overshoot(k, 1.9)) }, {
        font: FONT, color: '#2d3a4f', angle: (1 - k) * 0.3 * (i % 2 ? 1 : -1), sheet: { shadow: 10, rim: { color: '#ffffff', width: 2.5 }, alpha: clamp(u / 0.1) },
      });
    });
  }

  /** Stereo position of a point on screen. */
  private pan(p: V, depth = 1): number {
    return clamp(this.cam.toScreen(p, depth).x / W * 2 - 1, -1, 1) * 0.6;
  }

  /** A soft "poof" per puff over a quiet breeze, and a music-box note as each letter lands. */
  soundtrack(sampleRate: number): Stereo {
    const sr = sampleRate, len = this.videoLength;
    const mix = new Mixer(len, sr)
      .bus('air', { gain: 0.5, reverb: 0.05 })
      .bus('sfx', { gain: 1, reverb: 0.15 })
      .bus('music', { gain: 0.6, reverb: 0.4 });
    mix.add('air', 0, voice.noise({ duration: len, seed: 1, filter: 'lowpass', freq: 480, q: 0.5, level: 0.2 }, sr), { gain: 0.5 });
    for (const c of this.sound.cues) {
      const at = this.videoTime(c.at);
      if (c.name === 'puff') {
        mix.add('sfx', at, layer(sr,
          { buffer: voice.thump({ duration: 0.25, seed: c.seed, from: 140, to: 55, sweep: 0.05, decay: 0.09, click: 0.1 }, sr), gain: 0.8 },
          { buffer: voice.noise({ duration: 0.4, seed: c.seed + 1, filter: 'bandpass', freq: u => 300 + 1500 * Math.min(1, u / 0.25), q: 0.9, attack: 0.03, decay: 0.15 }, sr), gain: 0.6 },
        ), { gain: c.gain, pan: c.pan });
      } else if (c.name === 'letter') {
        mix.add('music', at + 0.2, instrument.musicBox(note(['G5', 'C6'][c.data.i ?? 0]), sr), { gain: 0.35, pan: c.pan });
      }
    }
    return mix.render({ reverb: { room: 0.5, damp: 0.5, width: 1 }, ceiling: -1.5, master: 1.5, fadeIn: 0.03, fadeOut: 0.15 });
  }
}
