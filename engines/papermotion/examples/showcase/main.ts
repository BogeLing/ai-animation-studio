import {
  Camera, type Paper, type PropSet, type RidgeSpec, Stage, type Stereo, type View, clamp, drawProps, drawRidge, flora, grain, lerp,
  rng, scatter, smoothstep, textWidth, vignette, wash,
} from '../../src';
import { Captions } from '../shared/captions';
import { Clawd } from '../shared/Clawd';
import { type DayKey, dayAt, paintSky, paintSun, tinted } from '../shared/daySky';
import { CueClock, box, card, place, pop, rrect } from '../shared/kit';
import { PaperPlane } from '../shared/Plane';
import { type PhotoPose, Polaroid, albumPose, between, flash, handCamera, stackPose } from '../shared/polaroid';
import { TitleCard } from '../shared/title';
import { HopPath, follow } from '../shared/walk';
import { G, lighthouse, town, windmill } from './props';
import { soundtrack as score } from './sound';

const W = 1920, H = 1080;
export const LENGTH = 12;
/** The three stations (world x); Clawd stands STAND to the left, each prop PROP_AT to the right. */
const X = [900, 2700, 4500];
const STAND = 380, PROP_AT = [260, 250, 240], FRAME_DX = 120, ZOOM = 1.2, HORIZON = 668;
export const STOPS = [
  { pop: 2.1, photo: 3.3, label: 'Windmill', day: 0 },
  { pop: 4.8, photo: 6.1, label: 'Balloon town', day: 2 },
  { pop: 7.6, photo: 8.9, label: 'Lighthouse', day: 4 },
];
export const WALK = new HopPath([
  { a: X[0] - STAND - 1300, b: X[0] - STAND, start: 1.3, duration: 1.1, hops: 3, height: 60 },
  { a: X[0] - STAND, b: X[1] - STAND, start: 4.0, duration: 1.5, hops: 5, height: 70 },
  { a: X[1] - STAND, b: X[2] - STAND, start: 6.8, duration: 1.5, hops: 5, height: 70 },
]);
export const ALBUM = 9.6, END_CARD = 10.3;
const PLANE = { from: 2.7, to: 6.6 };
const END_LINE = 'Made with code by an AI agent', END_URL = 'github.com/BogeLing/ai-animation-studio';

const CAPTIONS = new Captions([
  { from: 2.5, to: 4.0, text: 'Paper captions · a title card · a hop walk' },
  { from: 4.0, to: 6.8, text: 'The sky runs from morning to sunset' },
  { from: 6.8, to: 9.5, text: 'Instant photos stack up as you go' },
  { from: 9.5, to: 11.8, text: 'The score and every sound effect are code too', highlight: true },
]);

const FAR: RidgeSpec = { seed: 41, base: 596, amp: 105, freq: 0.0019, octaves: 4, color: '#a9bfd0', tear: 3, shadow: 3 };
const NEAR_HILLS: RidgeSpec = { seed: 42, base: 646, amp: 50, freq: 0.0026, color: '#8fa9bf', tear: 3, shadow: 4 };

/**
 * "Showcase": twelve seconds that put the shared scene modules on screen at once. A title card drops in, Clawd
 * hop-walks past three pop-up stations while the sky runs from morning to sunset, snaps an instant photo at
 * each, and the photos fan out into an album; captions name what is shown, over a lo-fi score and paper foley.
 */
export class ShowcaseScene extends Stage {
  private readonly cam = new Camera(X[0] + FRAME_DX, { width: W, height: H, stiffness: 20, damping: 9, handheld: 1.5, ease: 4 });
  private readonly clawd = new Clawd({ x: X[0] - STAND - 1300, y: G }, 16, 2100, [1.1, 3.9, 6.6, 9.3, 11.2]);
  private readonly plane = new PaperPlane({ x: 0, y: 0 }, 0, 2200);
  private readonly moments = new CueClock();
  private readonly title: TitleCard;
  private readonly photos: Polaroid[];
  private readonly clouds: PropSet;
  private readonly trees: PropSet;
  private readonly flowers: PropSet;
  private readonly front: PropSet;

  constructor(canvas: HTMLCanvasElement) {
    super(canvas, { duration: LENGTH, preroll: 0.4 });
    this.paper.light = { x: -0.5, y: 0.8 };
    this.clawd.width = 0.8;
    this.title = new TitleCard(this.ctx, {
      words: [{ text: 'AI Animation', font: '800 128px Montserrat', color: '#2d3a4a', letters: true }, { text: 'Studio', font: '800 128px Montserrat', color: '#d9644f' }],
      subtitle: { text: 'Every frame and every sound is code, written by an AI agent', font: '700 34px Montserrat', color: '#3d4654' },
      y: 300, at: 0.25, stagger: 0.07, out: 2.05, subtitleGap: 96,
    });
    this.photos = STOPS.map((s, i) => new Polaroid((paper, w, h) => this.snapshot(paper, w, h, i), { label: s.label, seed: i, wash: i === 2 ? 'rgba(255, 170, 110, 0.25)' : 'rgba(255, 236, 205, 0.18)' }));
    const L = (x: number, d: number) => W / 2 + (x - W / 2) * d;
    const cloud = flora.cloud({ width: [180, 320], color: '#fdf8ef', shade: '#e6dccd' });
    this.clouds = scatter({ seed: 301, from: -600, to: 2400, spacing: [300, 560], ground: () => 0, flex: 0, makers: [{ make: (r, x, _y, seed) => cloud(r, x, 90 + r() * 200, seed), weight: 1 }] });
    this.trees = scatter({
      seed: 302, from: -400, to: L(X[2] - 950, 0.5), spacing: [40, 80], ground: () => 792, flex: 0.3,
      makers: [
        { make: flora.pine({ height: [150, 240], width: [60, 90], trunk: '#5e4a3a', leaves: ['#4f7453', '#587d5a', '#46694b'], tiers: [4, 6] }), weight: 1.2 },
        { make: flora.tree({ height: [110, 170], canopy: [44, 64], trunk: '#6b5040', leaves: ['#628a55', '#6f9860', '#7aa36a'], light: '#a8cd88', loose: false }), weight: 1 },
      ],
    });
    this.flowers = scatter({
      seed: 303, from: -400, to: X[2] + 1200, spacing: [50, 130], ground: () => G + 2, flex: 1,
      makers: [{ make: flora.tuft({ blades: [3, 5], height: [12, 22], width: 3, colors: ['#5f8f45', '#6d9d50'] }), weight: 1 },
        { make: flora.flower({ height: [12, 22], petals: ['#fff4de', '#f6c4be', '#f5d479', '#c9b6f0'], stem: '#5b863c', size: [4, 7] }), weight: 0.6 }],
    });
    this.front = scatter({
      seed: 304, from: L(X[0] + 800, 1.3), to: L(X[2] - 700, 1.3), spacing: [700, 1000], ground: () => 1130, flex: 0.2,
      avoid: X.map(x => [L(x - 700, 1.3), L(x + 700, 1.3)] as [number, number]),
      makers: [{ make: flora.bush({ size: [70, 110], colors: ['#3f6537', '#486f3e'] }), weight: 1 }],
    });
  }

  soundtrack(sampleRate: number): Stereo { return score(this, sampleRate); }

  protected start(): void { this.cam.cut({ x: X[0] + FRAME_DX, y: 600, zoom: ZOOM }); }

  private stopAt(t: number): number {
    let i = 0;
    STOPS.forEach((s, j) => { if (t >= s.pop - 0.2) i = j; });
    return i;
  }

  protected update(t: number, dt: number): void {
    this.moments.step(t);
    const c = this.clawd, { x, lift, moving } = WALK.at(t), i = this.stopAt(t), s = STOPS[i], arrived = WALK.arrivals()[i];
    const shooting = t > s.photo - 0.7 && t < s.photo + 0.35, swing = Math.sin(t * 14);
    c.rest();
    c.root = { x, y: G - lift };
    Object.assign(c.intent, {
      look: moving ? { x: 0.7, y: 0 } : shooting ? { x: 0.8, y: -0.3 } : t > ALBUM ? { x: 0.1, y: -0.6 } : { x: 0.6, y: -0.45 },
      armR: shooting ? -0.35 : moving ? 0.3 + 0.35 * swing : 0.45,
      armL: t > END_CARD ? -0.9 + 0.3 * Math.sin(t * 9) : moving ? 0.3 - 0.35 * swing : 0.5,
      lean: moving ? 0.08 : 0,
      wide: t > arrived && t < arrived + 0.6 ? 0.6 : 0,
      squint: shooting && t > s.photo - 0.3 ? 0.5 : 0,
      smile: 0.5,
      happy: t > END_CARD ? 1 : 0,
    });
    c.update(dt, t);
    // The paper plane glides across the sky, right to left, with a lazy wave.
    const u = clamp((t - PLANE.from) / (PLANE.to - PLANE.from)), wave = (k: number) => 230 + 45 * Math.sin(k * Math.PI * 3);
    this.plane.pos = { x: lerp(2150, -250, u), y: wave(u) };
    this.plane.aim(Math.atan2(wave(u + 0.01) - wave(u), 24), dt);
    this.cues();
  }

  private cues(): void {
    const hit = (at: number, name: string, pan: number, gain = 1, data: Record<string, number> = {}) => { if (this.moments.passed(at)) this.cue(name, { pan, gain, data }); };
    this.title.landings.forEach((at, i) => hit(at, 'letter', -0.5 + i * 0.08, 1, { i }));
    hit(2.05, 'whoosh', 0, 0.7);
    WALK.landings().forEach(at => hit(at, 'tap', -0.4, 0.8));
    hit(PLANE.from + 0.4, 'glide', 0.7, 0.6);
    STOPS.forEach((s, i) => {
      hit(s.pop, 'pop', 0.3);
      hit(s.photo, 'shutter', -0.3);
      hit(s.photo + 0.05, 'whirr', -0.2);
      hit(s.photo + 0.9, 'swish', 0.6, 0.7);
      hit(ALBUM + i * 0.1, 'deal', -0.4 + i * 0.4, 0.8, { i });
    });
    hit(END_CARD, 'chime', 0);
  }

  protected lateUpdate(t: number, dt: number): void {
    this.cam.frame({ x: follow(this.clawd.root.x, STAND + FRAME_DX, X[0] + FRAME_DX, X[2] + FRAME_DX), y: 600, zoom: ZOOM }, dt, t);
  }

  probe(): Record<string, unknown> { return { ...super.probe(), camX: Math.round(this.cam.x), clawd: Math.round(this.clawd.root.x), day: +this.day.toFixed(2) }; }

  /** 0 at the first station … 4 at the last: morning to sunset, following the camera. */
  private get day(): number { return 4 * clamp((this.cam.x - X[0] - FRAME_DX) / (X[2] - X[0])); }

  protected draw(t: number, frame: number): void {
    const { ctx, paper, cam } = this, d = this.day, day = dayAt(d);
    paintSky(ctx, day, HORIZON);
    paintSun(paper, day);
    cam.layer(paper, 0.1, v => tinted(paper, day.sky[2], 0.15 + 0.35 * smoothstep(2.5, 4, d), () => drawProps(paper, this.clouds, v.from - 300, v.to + 300, () => 8, t)));
    cam.layer(paper, 0.12, v => drawRidge(paper, { ...FAR, color: day.hills[0] }, v.from, v.to, v.bottom + 400));
    cam.layer(paper, 0.18, v => drawRidge(paper, { ...NEAR_HILLS, color: day.hills[1] }, v.from, v.to, v.bottom + 400));
    cam.layer(paper, 0.22, v => this.sea(v, day, d, t));
    cam.layer(paper, 0.5, v => { this.meadow(v); drawProps(paper, this.trees, v.from - 200, v.to + 200, () => 18, t); });
    cam.layer(paper, 1, v => {
      this.ground(v);
      this.stations(t);
      drawProps(paper, this.flowers, v.from - 100, v.to + 100, () => 20, t, [this.clawd.root]);
      this.clawd.draw(paper);
      this.camera(t);
    });
    cam.layer(paper, 1.3, v => drawProps(paper, this.front, v.from - 200, v.to + 200, () => 12, t));
    if (t > PLANE.from && t < PLANE.to) place(paper, this.plane.pos.x, this.plane.pos.y, -2.2, 0, () => { const p = this.plane.pos; this.plane.pos = { x: 0, y: 0 }; this.plane.draw(paper); this.plane.pos = p; }, 2.2);
    wash(ctx, '#ff9c5a', 0.1 * smoothstep(2.4, 4, d), 'multiply');
    this.album(t);
    CAPTIONS.draw(paper, t);
    this.title.draw(paper, t);
    this.endCard(t);
    for (const s of STOPS) flash(ctx, t, s.photo);
    vignette(ctx, [40, 28, 20], 0.22 + 0.1 * smoothstep(3, 4, d));
    grain(ctx, frame, 0.045);
    wash(ctx, '#120d0a', 1 - smoothstep(0, 0.3, t));
    wash(ctx, '#120d0a', smoothstep(LENGTH - 0.45, LENGTH, t));
  }

  /** The sea under the far hills: long light streaks, and the sun's path on the water late in the day. */
  private sea(v: View, day: DayKey, d: number, t: number): void {
    const { paper } = this;
    card(paper, () => {
      paper.piece(box(v.from - 50, HORIZON - 10, v.to + 50, v.bottom + 400), day.sea, { seed: 810, tear: 1.5 });
      paper.inside(() => {
        for (let k = 0; k < 9; k++) {
          const y = HORIZON + 14 + k * k * 5, len = 80 + ((k * 53) % 120);
          for (let x = Math.floor(v.from / 260) * 260 + ((k * 97) % 260); x < v.to + 100; x += 260) paper.piece(box(x, y, x + len, y + 3 + k * 0.4), 'rgba(255, 255, 255, 0.22)', { seed: 820 + k * 31 + x, tear: 0.4, shadow: 0, edge: false });
        }
      });
    }, { shadow: 0, edge: false });
    const glow = smoothstep(3, 4, d);
    if (glow < 0.01) return;
    const m = paper.context.getTransform(), cx = (day.sun.x - m.e) / m.a;
    paper.layer(0.75 * glow, () => {
      for (let k = 0; k < 10; k++) {
        const y = HORIZON + 12 + k * 20, w = (60 - k * 3) * (1 + 0.25 * Math.sin(t * 2.4 + k * 1.7));
        paper.piece(rrect(cx - w, y, cx + w, y + 6, 3), '#ffc27a', { seed: 840 + k, tear: 0.5, shadow: 0, edge: false, texture: 0 });
      }
    }, 'screen');
  }

  /** The far meadow the trees stand on; it slopes away before the lighthouse so the sea shows behind it. */
  private meadow(v: View): void {
    const end = W / 2 + (X[2] - 950 - W / 2) * 0.5 + 120, top = 790;
    if (v.from > end) return;
    const x1 = Math.min(end, v.to + 300);
    card(this.paper, () => this.paper.piece([{ x: v.from - 300, y: 1400 }, { x: v.from - 300, y: top }, ...(x1 === end ? [{ x: end - 160, y: top }, { x: end, y: top + 70 }] : [{ x: x1, y: top }]), { x: x1, y: 1400 }], '#8db36f', { seed: 870, tear: 2.5 }), { shadow: 6, edge: false });
  }

  private ground(v: View): void {
    const { paper } = this;
    card(paper, () => {
      paper.piece(box(v.from - 50, G - 6, v.to + 50, H + 300), '#86b163', { seed: 900, tear: 2 });
      paper.inside(() => paper.piece(box(v.from - 50, G + 70, v.to + 50, H + 300), '#7aa659', { seed: 901, tear: 2.5 }));
    }, { shadow: 8 });
    card(paper, () => paper.piece(box(v.from - 50, G - 12, v.to + 50, G + 34), '#e3d8c4', { seed: 902, tear: 1.2 }), { shadow: 5 });
  }

  /** The stations fold up out of the page, pop-up-book style, as Clawd arrives. */
  private stations(t: number): void {
    const { paper } = this, dx = this.cam.x;
    STOPS.forEach((s, i) => {
      const x = X[i] + PROP_AT[i], k = pop(t, s.pop, 0.5);
      if (k <= 0 || Math.abs(x - dx) > 1900) return;
      place(paper, x, G, 1, 0, () => place(paper, -x, -G, 1, 0, () => {
        if (i === 0) windmill(paper, x, t * 1.3);
        if (i === 1) town(paper, x, t);
        if (i === 2) lighthouse(paper, x, t, smoothstep(8.2, 9.2, t));
      }), k);
    });
  }

  /** The camera in Clawd's hand while a photo is taken. */
  private camera(t: number): void {
    const s = STOPS[this.stopAt(t)], u = t - s.photo, h = this.clawd.hand();
    if (u < -0.7 || u > 0.35) return;
    handCamera(this.paper, { x: h.at.x + 10, y: h.at.y - 12 }, -0.25, clamp((u + 0.7) / 0.15) * (1 - clamp((u - 0.2) / 0.15)));
  }

  /** The picture on station i's photo: its sky, hills and prop, drawn once from the same props as the set. */
  private snapshot(paper: Paper, w: number, h: number, i: number): void {
    const g = paper.context, day = dayAt(STOPS[i].day), x = X[i] + PROP_AT[i], s = 0.5;
    paintSky(g, day, h * 0.7);
    g.setTransform(s, 0, 0, s, w / 2 - x * s, h * 0.88 - G * s);
    drawRidge(paper, { ...FAR, base: G - 250, color: day.hills[0] }, x - 700, x + 700, G + 200);
    if (i === 2) paper.piece(box(x - 700, G - 170, x + 700, G + 200), day.sea, { seed: 811, tear: 1, shadow: 0, edge: false });
    else for (let k = -3; k <= 3; k++) flora.pine({ height: [200, 260], width: [80, 100], trunk: '#5e4a3a', leaves: ['#4f7453', '#587d5a'], tiers: [4, 5] })(rng(30 + k + i * 10), x + k * 190 + 40, G - 60, 900 + k).draw(paper, 0, 0);
    paper.piece(box(x - 700, G - 10, x + 700, G + 200), '#86b163', { seed: 905, tear: 1.5, shadow: 0 });
    if (i === 0) windmill(paper, x, 0.4);
    if (i === 1) town(paper, x, 0);
    if (i === 2) lighthouse(paper, x, 0.3, 1);
  }

  /** Each photo flies out of the camera, is held up, goes to the corner stack, and finally fans out into the album. */
  private photoPose(i: number, t: number): PhotoPose | null {
    const u = t - STOPS[i].photo;
    if (u < 0) return null;
    const stack = stackPose(i), album = clamp((t - ALBUM - i * 0.1) / 0.6);
    if (album > 0) return between(stack, albumPose(i, STOPS.length, 300, 330), album * album * (3 - 2 * album));
    const h = this.cam.toScreen(this.clawd.hand().at), fromHand: PhotoPose = { at: { x: h.x + 20, y: h.y - 80 }, scale: 0.5, angle: -0.2 };
    if (u < 0.25) return { at: { x: h.x + 20, y: h.y - 30 - u * 200 }, scale: 0.2 + u * 1.2, angle: -0.2 };
    if (u < 0.9) return between(fromHand, { at: { x: 1250, y: 330 }, scale: 1, angle: -0.05 }, Math.min(1, (u - 0.25) / 0.4));
    const k = clamp((u - 0.9) / 0.5);
    return between({ at: { x: 1250, y: 330 }, scale: 1, angle: -0.05 }, stack, k * k * (3 - 2 * k));
  }

  private album(t: number): void {
    const poses = STOPS.map((_, i) => ({ i, pose: this.photoPose(i, t) })).filter(p => p.pose) as { i: number; pose: PhotoPose }[];
    poses.sort((a, b) => a.pose.scale - b.pose.scale || a.i - b.i);
    for (const { i, pose } of poses) this.photos[i].draw(this.paper, pose);
  }

  private endCard(t: number): void {
    const { paper, ctx } = this, k = pop(t, END_CARD, 0.45);
    if (k <= 0) return;
    const f = '800 54px Montserrat', small = '700 30px Montserrat', w = Math.max(textWidth(ctx, END_LINE, f), textWidth(ctx, END_URL, small)) + 90;
    place(paper, W / 2, 610, k, -0.01, () => {
      card(paper, () => paper.piece(rrect(-w / 2, -64, w / 2, 70, 12), '#fbf4e6', { seed: 1310, tear: 1.4 }), { shadow: 12 });
      paper.text(END_LINE, { x: 0, y: 4 }, { font: f, color: '#2d3a4a', align: 'center', sheet: { shadow: 0 } });
      paper.text(END_URL, { x: 0, y: 48 }, { font: small, color: '#d9644f', align: 'center', sheet: { shadow: 0 } });
    });
  }
}
