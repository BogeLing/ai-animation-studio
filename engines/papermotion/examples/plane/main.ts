import {
  Beats, Camera, type Framing, type PropSet, type RidgeSpec, Spring, Stage, type Stereo, type SwardSpec, type V, type View,
  circlePoly, clamp, drawProps, drawRidge, drawSward, fillGradient, flora, grain, noise1, ridgeHeight, rng, scatter,
  smoothstep, vignette, wash,
} from '../../src';
import { Clawd } from '../shared/Clawd';
import { PaperPlane, Track } from '../shared/Plane';
import { soundtrack as score } from './sound';

const W = 1920, H = 1080;
/** Clawd's feet, on the crest of the hill. */
const HOME: V = { x: 700, y: 881 };
const U = 18;
/** The loop the dart flies, in the sky to the right. */
const LOOP = { x: 1215, y: 400, r: 110 };
const ground = (x: number): number => HOME.y + 0.00016 * (x - HOME.x) ** 2;

const FAR: RidgeSpec = { seed: 11, base: 612, amp: 46, freq: 0.0016, color: '#aac4c3', tear: 3, shadow: 4 };
const MID: RidgeSpec = { seed: 12, base: 690, amp: 55, freq: 0.0021, color: '#a0bd98', tear: 3, shadow: 7, bands: [{ offset: 60, color: '#96b58e' }] };
const NEAR: RidgeSpec = {
  seed: 13, base: 772, amp: 50, freq: 0.0026, color: '#8db172', tear: 3, shadow: 10,
  bands: [{ offset: 55, color: '#84a969' }], patches: { color: '#97bb79', size: [80, 200], every: 260 },
};
const CREST: SwardSpec = {
  seed: 21, ground: x => ground(x) + 4, density: 15, height: [12, 28], width: [3, 6], rows: 4, depth: 10, grow: 0.3,
  patchy: 0.35, lean: 0.25, tones: [['#5b863c', '#98c064'], ['#679245', '#a6cc70'], ['#547d37', '#8cb75b']], accent: { color: '#3d5f2d', share: 0.05 },
};
/** One short row drawn after Clawd, so the feet stand in the grass rather than on it. */
const FRONT: SwardSpec = { ...CREST, seed: 22, ground: x => ground(x) + 11, height: [7, 16], rows: 1, depth: 5, patchy: 0.55 };
/** Soft patches of light and shade lying on the ground, fixed in the world. */
const PATCHES = [
  { x: 260, dy: 70, rx: 260, ry: 38, c: '#a4c86f' }, { x: 560, dy: 120, rx: 300, ry: 46, c: '#779f4c' },
  { x: 980, dy: 60, rx: 240, ry: 34, c: '#a4c86f' }, { x: 1250, dy: 130, rx: 320, ry: 50, c: '#779f4c' },
  { x: 760, dy: 40, rx: 160, ry: 16, c: '#a9cd76' },
];

/** Speed along each track, by fraction of its length: a fast throw, slower over the top of the loop, a stall. */
const OUT: [number, number][] = [[0, 1350], [0.364, 1000], [0.613, 680], [0.863, 1020], [0.95, 600], [1, 140]];
const BACK: [number, number][] = [[0, 200], [0.15, 950], [0.75, 1100], [1, 450]];

type Act = 'hold' | 'windup' | 'throw' | 'watch' | 'take' | 'brace' | 'bonk' | 'joy';
type Flight = 'held' | 'out' | 'stall' | 'back' | 'perched';

/**
 * "Boomerang": on a breezy hilltop Clawd throws a paper dart. It loops the loop, stalls, turns back
 * and lands on Clawd's head. Clawd is delighted.
 */
export class PlaneScene extends Stage {
  private readonly cam = new Camera(870, { width: W, height: H, stiffness: 9, damping: 6, handheld: 3, ease: 2.4 });
  private readonly clawd = new Clawd({ ...HOME }, U, 400, [0.3, 1.8]);
  private readonly plane = new PaperPlane(HOME, -0.7, 800);
  private readonly act: Beats<Act>;
  private readonly flight: Beats<Flight>;
  private readonly bounce = new Spring({ x: 0, y: 0 }, 520, 14);
  private readonly clouds: PropSet;
  private readonly midTrees: PropSet;
  private readonly nearTrees: PropSet;
  private readonly flowers: PropSet;
  private readonly fore: PropSet;
  private stallFrom: V = { x: 0, y: 0 };
  private notes = 0;
  private hopped = false;
  /** Where the dart has just been, drawn as a fading vellum streak so the loop reads. */
  private readonly trail: V[] = [];

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { duration: 5, preroll: 0.6 });
    this.paper.light = { x: -0.62, y: 0.78 };
    const c = this.clawd, p = this.plane;
    const lookAt = (q: V): V => {
      const e = c.eyes, dx = q.x - e.x, dy = q.y - e.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 160);
      return { x: (dx / d) * k, y: (dy / d) * k };
    };

    this.act = new Beats<Act>('hold', {
      hold: {
        during: ({ since }) => Object.assign(c.intent, { armR: -0.75, armL: 0.55, lean: -0.03, look: lookAt(p.pos), crouch: 0.1 * Math.max(0, Math.sin(since * 15)) }),
        after: 0.3, then: 'windup',
      },
      windup: {
        during: () => Object.assign(c.intent, { armR: -1.25, armL: -0.1, lean: -0.22, crouch: 0.38, look: { x: 1, y: -0.7 }, squint: 0.5 }),
        after: 0.4, then: 'throw',
      },
      throw: {
        enter: () => this.cue('throw', { pan: -0.3 }),
        during: () => Object.assign(c.intent, { armR: -0.2, armL: 0.85, lean: 0.22, crouch: -0.5, look: { x: 1, y: -0.8 }, squint: 0.25 }),
        after: 0.22, then: 'watch',
      },
      watch: {
        during: ({ since }) => Object.assign(c.intent, { armR: 0.15, armL: 0.5, lean: 0.05 + 0.02 * Math.sin(since * 6), look: lookAt(p.pos), crouch: 0.06 * Math.sin(since * 9) }),
        next: () => p.face < -0.95 && 'take',
      },
      take: {
        enter: () => { c.kick(-10); this.cue('take', { pan: -0.2 }); },
        during: () => Object.assign(c.intent, { wide: 1, crouch: -0.28, armR: -0.55, armL: -0.45, lean: 0.02, look: lookAt(p.pos) }),
        next: () => this.flight.current === 'perched' && 'bonk',
        after: 0.34, then: 'brace',
      },
      brace: {
        during: () => Object.assign(c.intent, { wide: 0.7, crouch: 0.18, squint: 0.3, armR: 0.1, armL: 0.2, look: lookAt(p.pos) }),
        next: () => this.flight.current === 'perched' && 'bonk',
      },
      bonk: {
        enter: () => c.kick(12),
        during: ({ since }) => Object.assign(c.intent, { wide: since < 0.12 ? 1.1 : 0.5, look: { x: 0.1, y: -1.2 }, cross: since > 0.1 ? 1 : 0, armR: 0.05, armL: 0.1 }),
        after: 0.32, then: 'joy',
      },
      joy: {
        during: ({ since }) => {
          const i = c.intent, wave = (ph: number) => -0.3 + 0.16 * Math.sin(since * 10 + ph);
          i.happy = 1;
          i.look = { x: 0.2, y: -0.4 };
          if (since < 0.1) i.crouch = 0.45;
          else if (!this.hopped) { this.hopped = true; c.hop(46); this.cue('hop', { pan: -0.2 }); }
          i.armR = since < 0.1 ? 0.3 : since < 0.55 ? -0.95 : wave(0);
          i.armL = since < 0.17 ? 0.35 : since < 0.62 ? -0.85 : wave(1.3);
          i.lean = since > 0.6 ? 0.07 * Math.sin((since - 0.6) * 9) : 0;
        },
      },
    });

    this.flight = new Beats<Flight>('held', {
      held: {
        during: ({ dt }) => { const h = c.hand(); p.hold(h.at, -0.32 + 0.36 * h.angle, dt); },
        next: () => this.act.current === 'throw' && c.armAngle > -0.62 && 'out',
      },
      out: {
        enter: () => {
          const ring = Array.from({ length: 19 }, (_, k) => {
            const a = Math.PI / 2 - (k * Math.PI) / 9;
            return { x: LOOP.x + Math.cos(a) * LOOP.r, y: LOOP.y + Math.sin(a) * LOOP.r };
          });
          p.fly(new Track([{ ...p.pos }, { x: 965, y: 648 }, { x: 1110, y: 522 }, ...ring, { x: 1320, y: 506 }, { x: 1392, y: 462 }]), OUT);
          this.notes = 0;
        },
        during: () => {
          this.level('fly', p.speed);
          if (this.notes < 4 && p.heading < -(this.notes + 1) * Math.PI / 2) {
            this.cue('note', { data: { i: this.notes }, pan: 0.35 });
            this.notes++;
          }
        },
        next: () => p.arrived && 'stall',
      },
      stall: {
        enter: () => { p.mode = 'free'; p.speed = 0; this.stallFrom = { ...p.pos }; this.cue('flip', { pan: 0.45 }); },
        during: ({ since, dt }) => {
          const u = clamp(since / 0.2);
          p.face = 1 - 2 * smoothstep(0.12, 0.8, u);
          p.pos = { x: this.stallFrom.x + 6 * Math.sin(Math.PI * u), y: this.stallFrom.y - 12 * Math.sin(Math.PI * u) };
          p.aim(p.face > 0 ? -1.2 : p.pitchFor({ x: -0.85, y: 0.5 }), dt);
          this.level('fly', 140 * (1 - u));
        },
        after: 0.2, then: 'back',
      },
      back: {
        enter: () => {
          const q = p.pos, land = { x: HOME.x + 0.35 * U, y: HOME.y - 8 * U - 8 };
          p.fly(new Track([{ ...q }, { x: q.x - 34, y: q.y + 17 }, { x: 1200, y: 556 }, { x: 1010, y: 641 }, { x: 862, y: 711 }, land]), BACK);
        },
        during: () => this.level('fly', p.speed),
        next: () => p.arrived && 'perched',
      },
      perched: {
        enter: () => {
          const seat = this.seat();
          this.bounce.pos = { x: p.pos.x - seat.x, y: p.pos.y - seat.y };   // start where the flight ended: no pop
          this.bounce.vel = { x: -70, y: -220 };
          p.mode = 'free';
          p.speed = 0;
          this.cue('land', { pan: -0.25 });
        },
        during: ({ dt }) => {
          const seat = this.seat();
          this.bounce.step({ x: 0, y: 0 }, dt);
          p.pos = { x: seat.x + this.bounce.pos.x, y: seat.y + this.bounce.pos.y };
          p.aim(c.top(0).angle - 0.155, dt);
        },
      },
    });

    const cloud = flora.cloud({ width: [170, 300], color: '#fbf5ea', shade: '#e9dbc8' });
    const sized = (w: number, seed: number) => { const r = rng(seed); let first = true; return () => (first ? ((first = false), (w - 170) / 130) : r()); };
    this.clouds = { flex: 0, props: [[330, 190, 290], [735, 112, 180], [1745, 472, 240]].map(([x, y, w], i) => cloud(sized(w, 90 + i), x, y, 300 + i * 11)) };
    this.midTrees = scatter({
      seed: 31, from: -300, to: 2300, spacing: [120, 260], ground: x => ridgeHeight(MID, x) + 3, flex: 0.4,
      makers: [{ make: flora.pine({ height: [36, 58], width: [20, 30], trunk: '#7a6a58', leaves: ['#84a67e', '#8aab83'] }), weight: 1 },
        { make: flora.tree({ height: [44, 64], canopy: [16, 24], trunk: '#7a6a58', leaves: ['#7f9f78', '#8aab82', '#96b68c'], light: '#c0d6a8', loose: false }), weight: 0.8 }],
    });
    const behind = 960 + (HOME.x - 960) * 0.55;
    this.nearTrees = scatter({
      seed: 41, from: -300, to: 2300, spacing: [170, 330], ground: x => ridgeHeight(NEAR, x) + 4, flex: 0.7, avoid: [[behind - 140, behind + 150]],
      makers: [{ make: flora.tree({ height: [88, 132], canopy: [32, 48], trunk: '#76563f', leaves: ['#5f8750', '#6f9a5c', '#80ab69'], light: '#bcd98f', loose: false }), weight: 1 },
        { make: flora.bush({ size: [16, 28], colors: ['#6a9557', '#78a562'] }), weight: 1.2 }],
    });
    this.flowers = scatter({
      seed: 51, from: 120, to: 1700, spacing: [45, 110], ground, flex: 1, avoid: [[600, 810]],
      makers: [{ make: flora.flower({ height: [12, 24], petals: ['#fff4de', '#f6c4be', '#f5d479'], stem: '#5b863c', size: [4.5, 7] }), weight: 1 },
        { make: flora.tuft({ blades: [3, 5], height: [10, 20], width: 3, colors: ['#6a9646', '#77a451'] }), weight: 1.1 }],
    });
    const tuft = flora.tuft({ blades: [6, 9], height: [70, 120], width: 10, colors: ['#4a7437', '#557f3f'] });
    this.fore = { flex: 1.2, props: [[330, 1085], [420, 1100], [2080, 1090]].map(([x, y], i) => tuft(rng(70 + i), x, y, 700 + i * 13)) };
  }

  /** Where the dart sits on Clawd's head, level on the flat top. */
  private seat(): V {
    const top = this.clawd.top(0.35 * U), a = top.angle;
    return { x: top.at.x + 8 * Math.sin(a), y: top.at.y - 8 * Math.cos(a) };
  }

  protected start(): void { this.cam.cut({ x: 840, y: 700, zoom: 1.75 }); }

  protected update(t: number, dt: number): void {
    const c = this.clawd;
    c.rest();
    this.act.update(t, dt);
    c.update(dt, t);
    this.flight.update(t, dt);
    this.plane.update(dt, t);
    if (this.plane.mode === 'fly') { this.trail.push({ ...this.plane.pos }); if (this.trail.length > 34) this.trail.shift(); }
    else this.trail.splice(0, 2);
    if (c.consumeLanding()) { this.cue('hopLand', { pan: -0.2 }); this.bounce.vel.y -= 170; }
  }

  protected lateUpdate(t: number, dt: number): void {
    const joy = this.act.current === 'joy';
    const f: Framing = this.flight.reached('back')
      ? (joy ? { x: 730, y: 735, zoom: 1.92 + 0.05 * this.act.since(t) } : { x: 800, y: 690, zoom: 1.5 })
      : this.act.reached('throw') ? { x: 1030, y: 575, zoom: 1.1 } : { x: 840, y: 700, zoom: 1.75 };
    this.cam.frame(f, dt, t);
    this.clawd.lens = this.plane.lens = this.cam.zoom ** -0.55;
  }

  probe(): Record<string, unknown> {
    const p = this.plane, beats = <B extends string>(b: Beats<B>) => b.history.map(h => `${h.beat}@${h.at.toFixed(2)}`).join(' ');
    return {
      ...super.probe(), act: this.act.current, flight: this.flight.current, zoom: +this.cam.zoom.toFixed(2),
      plane: { x: Math.round(p.pos.x), y: Math.round(p.pos.y), face: +p.face.toFixed(2), speed: Math.round(p.speed), pitch: +p.angle.toFixed(2) },
      hand: (({ at }) => ({ x: Math.round(at.x), y: Math.round(at.y) }))(this.clawd.hand()),
      acts: beats(this.act), flights: beats(this.flight), notes: this.notes,
    };
  }

  soundtrack(sampleRate: number): Stereo { return score(this, sampleRate); }

  protected draw(t: number, frame: number): void {
    const { ctx, paper, cam } = this;
    const wind = (x: number) => 60 + 30 * noise1(t * 0.45 + x * 0.0012, 5);
    const pushers = [{ x: this.clawd.root.x, y: this.clawd.root.y - this.clawd.height }];
    fillGradient(ctx, [[0, '#8db8d6'], [0.4, '#c1d8de'], [0.64, '#f3ddb9'], [1, '#efc891']]);
    cam.layer(paper, 0.03, () => this.sun());
    cam.layer(paper, 0.06, v => drawProps(paper, this.clouds, v.from, v.to, () => 0, t));
    cam.layer(paper, 0.15, v => { drawRidge(paper, FAR, v.from, v.to, v.bottom + 400); this.mist(v, FAR.base + 40, 0.32); });
    cam.layer(paper, 0.3, v => { drawRidge(paper, MID, v.from, v.to, v.bottom + 400); drawProps(paper, this.midTrees, v.from, v.to, wind, t); this.mist(v, MID.base + 50, 0.24); });
    cam.layer(paper, 0.55, v => { drawRidge(paper, NEAR, v.from, v.to, v.bottom + 400); drawProps(paper, this.nearTrees, v.from, v.to, wind, t); this.mist(v, NEAR.base + 60, 0.12); });
    cam.layer(paper, 1, v => {
      this.ground(v);
      drawSward(paper, CREST, v.from, v.to, wind, t, pushers);
      drawProps(paper, this.flowers, v.from, v.to, wind, t, pushers);
      this.clawd.draw(paper);
      drawSward(paper, FRONT, v.from, v.to, wind, t, pushers);
      if (this.trail.length > 3) paper.layer(0.45, () => paper.ribbon(this.trail, u => 7 * u, '#fffdf6', { seed: 950, tear: 0.5, shadow: 0, edge: false, texture: 0 }));
      this.plane.draw(paper);
    });
    paper.layer(1, () => cam.layer(paper, 1.35, v => drawProps(paper, this.fore, v.from, v.to, wind, t)), 'source-over', 'blur(6px)');
    vignette(ctx, [70, 40, 22], 0.34);
    grain(ctx, frame, 0.07);
    wash(ctx, '#1c130d', 1 - smoothstep(0, 0.35, t));
    wash(ctx, '#1c130d', smoothstep(4.62, 5, t));
  }

  private sun(): void {
    const { paper } = this, at = { x: 1565, y: 225 };
    paper.layer(0.6, () => {
      const g = paper.context, grad = g.createRadialGradient(at.x, at.y, 40, at.x, at.y, 270);
      grad.addColorStop(0, 'rgba(255, 238, 196, 0.85)');
      grad.addColorStop(1, 'rgba(255, 238, 196, 0)');
      g.fillStyle = grad;
      g.fillRect(at.x - 340, at.y - 340, 680, 680);
    }, 'screen');
    paper.piece(circlePoly(at, 58, 40), '#fff4d4', { seed: 5, tear: 1.6, shadow: 0, edge: false });
  }

  /** A band of haze at the foot of a layer, so the next one separates by value. */
  private mist(v: View, y: number, alpha: number): void {
    const g = this.paper.context, grad = g.createLinearGradient(0, y - 90, 0, y + 150);
    grad.addColorStop(0, 'rgba(247, 226, 194, 0)');
    grad.addColorStop(0.55, `rgba(247, 226, 194, ${alpha})`);
    grad.addColorStop(1, 'rgba(247, 226, 194, 0)');
    g.fillStyle = grad;
    g.fillRect(v.from, y - 90, v.to - v.from, 240);
  }

  private ground(v: View): void {
    const { paper } = this, pts: V[] = [];
    for (let x = Math.floor(v.from / 20) * 20; x <= v.to + 20; x += 20) pts.push({ x, y: ground(x) });
    pts.push({ x: v.to + 20, y: v.bottom + 300 }, { x: Math.floor(v.from / 20) * 20, y: v.bottom + 300 });
    paper.piece(pts, '#88b05a', { seed: 900, tear: 2.5, shadow: 12, rim: { color: '#b8d880', width: 5 } });
    paper.clip(pts, () => paper.layer(0.6, () => {
      const g = paper.context;
      for (const p of PATCHES) {
        g.fillStyle = p.c;
        g.beginPath();
        g.ellipse(p.x, ground(p.x) + p.dy, p.rx, p.ry, 0, 0, Math.PI * 2);
        g.fill();
      }
    }, 'source-over', 'blur(18px)'));
  }
}
