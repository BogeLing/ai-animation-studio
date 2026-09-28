import {
  Camera, type MakeCamera, type Paper, type PropSet, type RidgeSpec, Stage, type Stereo, type View, building, clamp, drawProps, drawRidge, flora, grain, rng,
  scatter, smoothstep, textWidth, vignette, wash,
} from '../../src';
import { Captions } from '../shared/captions';
import { Clawd } from '../shared/Clawd';
import { type DayKey, dayAt, paintSky, paintSun, tinted } from '../shared/daySky';
import { CueClock, box, card, place, pop, rrect } from '../shared/kit';
import { type PhotoPose, Polaroid, albumPose, between, flash, handCamera, stackPose } from '../shared/polaroid';
import { TitleCard } from '../shared/title';
import { HopPath, follow } from '../shared/walk';
import { G, beachStairs, clockTower, driftwood, ikb, moa } from './places';
import { soundtrack as score } from './sound';

const W = 1920, H = 1080;
export const LENGTH = 12;
/** The stops (world x of each framing). Clawd stands STAND to the left; each landmark stands AT from X. */
const X = [1000, 2500, 4000, 5500];
const STAND = 400, AT = [700, 260, 240, -60], FRAME_DX = 130, ZOOM = 1.25, HORIZON = 668;
type Stop = { sign: string; arrive: number; photo: number; leave: number; label: string; wood?: boolean };
export const STOPS: Stop[] = [
  { sign: 'MAIN MALL', arrive: 2.0, photo: 2.7, leave: 3.2, label: 'Main Mall' },
  { sign: 'IRVING K. BARBER', arrive: 4.2, photo: 4.9, leave: 5.4, label: 'IKB Library' },
  { sign: 'MUSEUM OF ANTHROPOLOGY', arrive: 6.4, photo: 7.1, leave: 7.6, label: 'MOA' },
  { sign: 'WRECK BEACH', arrive: 8.6, photo: 9.3, leave: LENGTH, label: 'Wreck Beach', wood: true },
];
/** The last hop sets Clawd on a driftwood log to watch the sunset. */
const PERCH = { from: 9.6, to: 10.0, height: 40 };
export const WALK = new HopPath([
  { a: X[0] - STAND - 1100, b: X[0] - STAND, start: 1.0, duration: 1.0, hops: 3, height: 60 },
  ...[1, 2, 3].map(i => ({ a: X[i - 1] - STAND, b: X[i] - STAND, start: STOPS[i - 1].leave, duration: STOPS[i].arrive - STOPS[i - 1].leave, hops: 3, height: 64 })),
  { a: X[3] - STAND, b: X[3] - STAND + 20, start: PERCH.from, duration: PERCH.to - PERCH.from, hops: 1, height: 50 },
]);
export const ALBUM = 10.0, END_CARD = 10.6;
const LOG = { x0: X[3] - STAND - 110, x1: X[3] - STAND + 150, r: 22 };
const SIGN_FONT = '800 34px Montserrat', END_LINE = 'Made with code by an AI agent', END_URL = 'github.com/BogeLing/ai-animation-studio';

const CAPTIONS = new Captions([
  { from: 2.0, to: 4.2, text: 'Main Mall and its clock tower' },
  { from: 4.2, to: 6.4, text: 'A Gothic library from 1925' },
  { from: 6.4, to: 8.6, text: 'The glass Great Hall of the MOA' },
  { from: 8.6, to: 10.0, text: 'Sunset over the Salish Sea' },
  { from: 10.0, to: 11.8, text: 'One day, four stops, every frame written as code', highlight: true },
]);

const FAR: RidgeSpec = { seed: 41, base: 596, amp: 105, freq: 0.0019, octaves: 4, color: '#a9bfd0', tear: 3, shadow: 3 };
const NEAR_HILLS: RidgeSpec = { seed: 42, base: 646, amp: 50, freq: 0.0026, color: '#8fa9bf', tear: 3, shadow: 4 };

/**
 * "UBC": a twelve-second tour of UBC's Point Grey campus, built from the shared scene modules. A title card drops
 * in; Clawd hop-walks from the clock tower on Main Mall past the Irving K. Barber Learning Centre and the Museum
 * of Anthropology to sunset at Wreck Beach while the sky runs from morning to evening, snapping an instant photo
 * at each stop; the photos fan out into an album. Captions, a lo-fi score and paper foley throughout.
 */
export class UbcScene extends Stage {
  private readonly cam: Camera;
  private readonly clawd = new Clawd({ x: X[0] - STAND - 1100, y: G }, 16, 2300, [1.5, 3.9, 6.1, 8.2, 11.1]);
  private readonly moments = new CueClock();
  private readonly title: TitleCard;
  private readonly photos: Polaroid[];
  private readonly clouds: PropSet;
  private readonly forest: PropSet;
  private readonly halls: PropSet;
  private readonly cherries: PropSet;
  private readonly firs: PropSet;
  private readonly tufts: PropSet;
  private readonly front: PropSet;
  /** Where the far campus lawn opens onto the water (layer x ranges at depth 0.5). */
  private readonly gaps: [number, number][];

  /** `camera` films it with another camera, e.g. a `DepthCamera` for the 2.5D cut. */
  constructor(canvas: HTMLCanvasElement, o: { camera?: MakeCamera } = {}) {
    super(canvas, { duration: LENGTH, preroll: 0.4 });
    this.cam = (o.camera ?? ((x, opts) => new Camera(x, opts)))(X[0] + FRAME_DX, { width: W, height: H, stiffness: 20, damping: 9, handheld: 1.6, ease: 4 });
    this.paper.light = { x: -0.5, y: 0.8 };
    this.clawd.width = 0.8;
    this.title = new TitleCard(this.ctx, {
      words: [{ text: 'A Quick Tour of', font: '800 96px Montserrat', color: '#0f2d52', letters: true }, { text: 'UBC', font: '800 128px Montserrat', color: '#d9644f' }],
      subtitle: { text: 'University of British Columbia · Vancouver', font: '700 34px Montserrat', color: '#3d4654' },
      y: 290, at: 0.2, stagger: 0.05, out: 2.0, gap: 34, subtitleGap: 92,
    });
    this.photos = STOPS.map((s, i) => new Polaroid((paper, w, h) => this.snapshot(paper, w, h, i), { label: s.label, seed: i, wash: i === 3 ? 'rgba(255, 170, 110, 0.25)' : 'rgba(255, 236, 205, 0.18)' }));
    const L = (x: number, d: number) => W / 2 + (x - W / 2) * d;
    const cloud = flora.cloud({ width: [180, 320], color: '#fdf8ef', shade: '#e6dccd' });
    this.clouds = scatter({ seed: 401, from: -600, to: 2600, spacing: [300, 560], ground: () => 0, flex: 0, makers: [{ make: (r, x, _y, seed) => cloud(r, x, 90 + r() * 200, seed), weight: 1 }] });
    this.gaps = [[L(X[3] - 1250, 0.5), L(X[3] + 3000, 0.5)]];
    this.forest = scatter({
      seed: 402, from: -400, to: L(X[3] + 2000, 0.5), spacing: [34, 70], ground: () => 792, flex: 0.3, avoid: this.gaps,
      makers: [
        { make: flora.pine({ height: [150, 250], width: [60, 90], trunk: '#5e4a3a', leaves: ['#4f7453', '#587d5a', '#46694b'], tiers: [4, 6] }), weight: 1.4 },
        { make: flora.tree({ height: [110, 170], canopy: [44, 64], trunk: '#6b5040', leaves: ['#628a55', '#6f9860', '#7aa36a'], light: '#a8cd88', loose: false }), weight: 1 },
      ],
    });
    this.halls = scatter({
      seed: 403, from: L(X[0] - 1200, 0.5), to: L(X[2] + 700, 0.5), spacing: [260, 460], ground: () => 796, flex: 0, avoid: [[this.gaps[0][0] - 260, Infinity]],
      makers: [{ make: building({ width: [150, 260], height: [110, 190], colors: ['#d8cdbd', '#cbbfae', '#c7c2b8', '#d4c6b0'], window: '#8ea7ba', lit: 0.75, base: 60 }), weight: 1 }],
    });
    this.cherries = scatter({
      seed: 404, from: L(X[0] - 1300, 0.85), to: L(X[0] + 1100, 0.85), spacing: [210, 290], ground: () => G - 30, flex: 0.4, avoid: [[L(X[0] + AT[0] - 150, 0.85), L(X[0] + AT[0] + 150, 0.85)]],
      makers: [{ make: flora.tree({ height: [190, 250], canopy: [70, 95], trunk: '#6d4c3d', leaves: ['#f3b6c6', '#f7c8d4', '#eea5b8'], light: '#fde3ea', loose: false }), weight: 1 }],
    });
    this.firs = scatter({
      seed: 405, from: L(X[3] - 1800, 0.8), to: L(X[3] - 820, 0.8), spacing: [70, 120], ground: () => 760, flex: 0.2,
      makers: [{ make: flora.pine({ height: [260, 380], width: [80, 120], trunk: '#4c3a2e', leaves: ['#3e5f43', '#46694a'], tiers: [5, 7] }), weight: 1 }],
    });
    this.tufts = scatter({
      seed: 406, from: -400, to: X[3] - 950, spacing: [60, 150], ground: () => G + 2, flex: 1,
      makers: [{ make: flora.tuft({ blades: [3, 5], height: [12, 22], width: 3, colors: ['#5f8f45', '#6d9d50'] }), weight: 1 },
        { make: flora.flower({ height: [12, 20], petals: ['#fff4de', '#f6c4be', '#f5d479'], stem: '#5b863c', size: [4, 6] }), weight: 0.3 }],
    });
    this.front = scatter({
      seed: 407, from: L(X[0] + 600, 1.3), to: L(X[2] + 900, 1.3), spacing: [700, 1000], ground: () => 1130, flex: 0.2,
      avoid: X.map(x => [L(x - 650, 1.3), L(x + 650, 1.3)] as [number, number]),
      makers: [{ make: flora.bush({ size: [70, 110], colors: ['#3f6537', '#486f3e'] }), weight: 1 }],
    });
  }

  soundtrack(sampleRate: number): Stereo { return score(this, sampleRate); }

  protected start(): void { this.cam.cut({ x: X[0] + FRAME_DX, y: 610, zoom: ZOOM }); }

  private stopAt(t: number): number {
    let i = 0;
    STOPS.forEach((s, j) => { if (t >= s.arrive - 0.3) i = j; });
    return i;
  }

  protected update(t: number, dt: number): void {
    this.moments.step(t);
    const c = this.clawd, { x, lift, moving } = WALK.at(t), i = this.stopAt(t), s = STOPS[i];
    const perch = PERCH.height * smoothstep(PERCH.from, PERCH.to, t), sitting = t > PERCH.to;
    const shooting = t > s.photo - 0.55 && t < s.photo + 0.3, swing = Math.sin(t * 14), walking = moving && t < PERCH.from;
    c.rest();
    c.root = { x, y: G - lift - perch };
    Object.assign(c.intent, {
      look: walking ? { x: 0.7, y: 0 } : sitting ? { x: 0.8, y: 0.05 } : shooting ? { x: 0.8, y: -0.3 } : { x: 0.6, y: -0.45 },
      armR: shooting ? -0.35 : walking ? 0.3 + 0.35 * swing : 0.45,
      armL: t > END_CARD ? -0.9 + 0.3 * Math.sin(t * 9) : walking ? 0.3 - 0.35 * swing : 0.5,
      lean: walking ? 0.08 : 0,
      crouch: sitting ? 0.3 : 0,
      wide: t > s.arrive && t < s.arrive + 0.5 && i < 3 ? 0.6 : 0,
      squint: shooting && t > s.photo - 0.25 ? 0.5 : 0,
      smile: 0.5,
      happy: t > END_CARD ? 1 : 0,
    });
    c.update(dt, t);
    this.cues();
  }

  private cues(): void {
    const hit = (at: number, name: string, pan: number, gain = 1, data: Record<string, number> = {}) => { if (this.moments.passed(at)) this.cue(name, { pan, gain, data }); };
    this.title.landings.forEach((at, i) => hit(at, 'letter', -0.5 + i * 0.07, 1, { i }));
    hit(2.0, 'whoosh', 0, 0.7);
    WALK.landings().forEach(at => hit(at, 'tap', -0.4, 0.8));
    hit(2.3, 'carillon', 0.4);
    hit(8.9, 'gull', 0.6);
    STOPS.forEach((s, i) => {
      hit(s.arrive - 0.1, 'sign', 0.1);
      hit(s.photo, 'shutter', -0.3);
      hit(s.photo + 0.05, 'whirr', -0.2);
      hit(s.photo + 0.8, 'swish', 0.6, 0.7);
      hit(ALBUM + i * 0.08, 'deal', -0.6 + i * 0.4, 0.8, { i });
    });
    hit(END_CARD, 'chime', 0);
  }

  protected lateUpdate(t: number, dt: number): void {
    this.cam.frame({ x: follow(this.clawd.root.x, STAND + FRAME_DX, X[0] + FRAME_DX, X[3] + FRAME_DX + 20), y: 610, zoom: ZOOM }, dt, t);
  }

  probe(): Record<string, unknown> { return { ...super.probe(), camX: Math.round(this.cam.x), clawd: Math.round(this.clawd.root.x), day: +this.day.toFixed(2) }; }

  /** 0 at the first stop … 4 at the beach: morning to sunset, following the camera. */
  private get day(): number { return 4 * clamp((this.cam.x - X[0] - FRAME_DX) / (X[3] - X[0])); }

  protected draw(t: number, frame: number): void {
    const { ctx, paper, cam } = this, d = this.day, day = dayAt(d);
    paintSky(ctx, day, HORIZON);
    cam.layer(paper, 0, () => paintSun(paper, day));   // the sun hangs at infinity: still for `Camera`, turning with a `DepthCamera`
    cam.layer(paper, 0.1, v => tinted(paper, day.sky[2], 0.15 + 0.35 * smoothstep(2.5, 4, d), () => drawProps(paper, this.clouds, v.from - 300, v.to + 300, () => 8, t)));
    cam.layer(paper, 0.12, v => drawRidge(paper, { ...FAR, color: day.hills[0] }, v.from, v.to, v.bottom + 400));
    cam.layer(paper, 0.18, v => drawRidge(paper, { ...NEAR_HILLS, color: day.hills[1] }, v.from, v.to, v.bottom + 400));
    cam.layer(paper, 0.22, v => this.sea(v, day, d, t));
    cam.layer(paper, 0.5, v => {
      drawProps(paper, this.halls, v.from - 300, v.to + 300, () => 0, t);
      this.campusLawn(v);
      drawProps(paper, this.forest, v.from - 200, v.to + 200, () => 18, t);
    });
    cam.layer(paper, 0.8, v => { this.cliff(v); drawProps(paper, this.firs, v.from - 200, v.to + 200, () => 14, t); });
    cam.layer(paper, 0.85, v => drawProps(paper, this.cherries, v.from - 200, v.to + 200, () => 22, t));
    cam.layer(paper, 1, v => {
      this.ground(v);
      this.landmarks(v, t);
      drawProps(paper, this.tufts, v.from - 100, v.to + 100, () => 20, t, [this.clawd.root]);
      this.signs(v, t);
      this.clawd.draw(paper);
      this.camera(t);
    });
    cam.layer(paper, 1.3, v => drawProps(paper, this.front, v.from - 200, v.to + 200, () => 12, t));
    this.petals(t);
    wash(ctx, '#ff9c5a', 0.1 * smoothstep(2.4, 4, d), 'multiply');
    this.album(t);
    CAPTIONS.draw(paper, t);
    this.title.draw(paper, t);
    this.endCard(t);
    for (const s of STOPS) flash(ctx, t, s.photo);
    vignette(ctx, [40, 28, 20], 0.22 + 0.1 * smoothstep(3, 4, d));
    grain(ctx, frame, 0.045);
    // No fade in from black: the first frame is the poster a web video player shows before it plays.
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

  /** The far campus lawn the trees and halls stand on, sloping away where the view opens onto the water. */
  private campusLawn(v: View): void {
    const { paper } = this, top = 790, runs: [number, number][] = [];
    let x = -2000;
    for (const [a, b] of this.gaps) { runs.push([x, a + 120]); x = b - 120; }
    runs.push([x, 1e5]);
    for (const [a, b] of runs) {
      if (b < v.from - 200 || a > v.to + 200) continue;
      const x0 = Math.max(a, v.from - 300), x1 = Math.min(b, v.to + 300);
      card(paper, () => paper.piece([
        { x: x0, y: 1400 }, { x: x0, y: x0 === a ? top + 70 : top }, ...(x0 === a ? [{ x: a + 160, y: top }] : []),
        ...(x1 === b ? [{ x: b - 160, y: top }] : []), { x: x1, y: x1 === b ? top + 70 : top }, { x: x1, y: 1400 },
      ], '#8db36f', { seed: 870 + Math.round(a), tear: 2.5 }), { shadow: 6, edge: false });
    }
  }

  /** The forested bluff above Wreck Beach, with the wooden stairs down it (depth 0.8). */
  private cliff(v: View): void {
    const x = W / 2 + (X[3] - 820 - W / 2) * 0.8;
    if (x < v.from - 900) return;
    const { paper } = this;
    card(paper, () => {
      paper.piece([{ x: x - 1800, y: 1200 }, { x: x - 1800, y: 740 }, { x: x - 200, y: 745 }, { x: x - 40, y: 800 }, { x: x + 90, y: 880 }, { x: x + 170, y: 1200 }], '#566b45', { seed: 850, tear: 3 });
      paper.inside(() => paper.piece([{ x: x - 1800, y: 800 }, { x: x - 120, y: 800 }, { x: x + 40, y: 880 }, { x: x + 120, y: 1200 }, { x: x - 1800, y: 1200 }], '#4c603d', { seed: 851, tear: 2 }));
    }, { shadow: 10 });
    beachStairs(paper, x - 330, 734);
  }

  /** Paths and lawns across the campus, sand at the beach. */
  private ground(v: View): void {
    const { paper } = this, sand = X[3] - 800;
    if (v.from < sand + 200) {
      card(paper, () => {
        paper.piece(box(v.from - 50, G - 6, Math.min(v.to + 50, sand + 150), H + 300), '#86b163', { seed: 900, tear: 2 });
        paper.inside(() => paper.piece(box(v.from - 50, G + 70, Math.min(v.to + 50, sand + 150), H + 300), '#7aa659', { seed: 901, tear: 2.5 }));
      }, { shadow: 8 });
      card(paper, () => paper.piece(box(v.from - 50, G - 12, Math.min(v.to + 50, sand + 100), G + 34), '#e3d8c4', { seed: 902, tear: 1.2 }), { shadow: 5 });
    }
    if (v.to > sand) {
      card(paper, () => {
        paper.piece([{ x: sand, y: G + 40 }, { x: sand + 180, y: G - 12 }, { x: v.to + 50, y: G - 12 }, { x: v.to + 50, y: H + 300 }, { x: sand, y: H + 300 }], '#e6cc9c', { seed: 903, tear: 2 });
        paper.inside(() => { for (let k = 0; k < 6; k++) paper.piece(box(sand + 200 + k * 330, G + 40 + (k % 3) * 40, sand + 330 + k * 330, G + 46 + (k % 3) * 40), 'rgba(160, 120, 70, 0.25)', { seed: 904 + k, tear: 0.8, shadow: 0, edge: false }); });
      }, { shadow: 8 });
    }
  }

  private landmarks(v: View, t: number): void {
    const { paper } = this, near = (x: number) => x > v.from - 1300 && x < v.to + 1300;
    if (near(X[0])) clockTower(paper, X[0] + AT[0], 0.55 + t * 0.02);
    if (near(X[1])) ikb(paper, X[1] + AT[1]);
    if (near(X[2])) moa(paper, X[2] + AT[2]);
    if (near(X[3])) {
      driftwood(paper, LOG.x0, LOG.x1, G + 4, LOG.r, 960);
      driftwood(paper, X[3] + 260, X[3] + 520, G + 10, 16, 970);
    }
  }

  /** Wayfinding signs: UBC navy with white letters on campus, weathered wood at the beach. */
  private signs(v: View, t: number): void {
    const { paper, ctx } = this;
    STOPS.forEach((s, i) => {
      const x = X[i] - 90, k = pop(t, s.arrive - 0.1, 0.4) * (i === 3 ? 1 - smoothstep(ALBUM - 0.3, ALBUM + 0.2, t) : 1);
      if (k <= 0 || x < v.from - 400 || x > v.to + 400) return;
      const w = textWidth(ctx, s.sign, SIGN_FONT) + 56, board = s.wood ? '#9c7a55' : '#0f2d52', ink = s.wood ? '#fbf1df' : '#ffffff';
      place(paper, x, G - 4, 1, 0, () => {
        card(paper, () => paper.piece(box(-7, -150 * k, 7, 0), s.wood ? '#7d5e40' : '#48566a', { seed: 1000 + i, tear: 0.4 }), { shadow: 5 });
        place(paper, 0, -176 * k, k, s.wood ? -0.04 : 0, () => {
          card(paper, () => paper.piece(rrect(-w / 2, -34, w / 2, 34, 6), board, { seed: 1010 + i, tear: s.wood ? 1.4 : 0.6 }), { shadow: 8, rim: { color: s.wood ? '#c9a57a' : '#3c5f8f', width: 2 } });
          paper.text(s.sign, { x: 0, y: 12 }, { font: SIGN_FONT, color: ink, align: 'center', sheet: { shadow: 0 } });
        });
      });
    });
  }

  /** The camera in Clawd's hand while a photo is taken. */
  private camera(t: number): void {
    const s = STOPS[this.stopAt(t)], u = t - s.photo, h = this.clawd.hand();
    if (u < -0.55 || u > 0.3) return;
    handCamera(this.paper, { x: h.at.x + 10, y: h.at.y - 12 }, -0.25, clamp((u + 0.55) / 0.15) * (1 - clamp((u - 0.15) / 0.15)));
  }

  /** Cherry petals drifting across Main Mall. */
  private petals(t: number): void {
    const near = clamp(1 - Math.abs(this.cam.x - X[0] - FRAME_DX) / 1300);
    if (near <= 0) return;
    const g = this.ctx;
    g.save();
    for (let i = 0; i < 26; i++) {
      const seed = i * 97.13, speed = 60 + ((i * 37) % 50), y0 = (i * 173) % 700;
      const x = (((((i * 331) % 2400) - t * speed * 1.4 - (this.cam.x - X[0]) * 0.9) % 2400) + 2400) % 2400 - 240;
      const y = ((y0 + t * speed) % 900) + Math.sin(t * 1.7 + seed) * 20;
      g.globalAlpha = 0.85 * near;
      g.fillStyle = i % 3 ? '#f7c3cf' : '#fbe0e6';
      g.beginPath();
      g.ellipse(x, y, 7, 4, t * 2 + seed, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  /** The picture on stop i's photo: its sky, hills or sea, and landmark, drawn once from the same props as the set. */
  private snapshot(paper: Paper, w: number, h: number, i: number): void {
    const g = paper.context, day = dayAt([0, 1.33, 2.67, 4][i]), x = X[i] + AT[i], s = 0.52;
    paintSky(g, day, h * 0.7);
    g.setTransform(s, 0, 0, s, w / 2 - x * s, h * 0.86 - G * s);
    if (i === 3) paper.piece(rrect(x + 290, G - 250, x + 470, G - 70, 90), day.sunColor, { seed: 801, tear: 1, shadow: 0, edge: false });
    drawRidge(paper, { ...FAR, base: G - 250, color: day.hills[0] }, x - 700, x + 700, G + 200);
    if (i === 3) paper.piece(box(x - 700, G - 180, x + 700, G + 200), day.sea, { seed: 811, tear: 1, shadow: 0, edge: false });
    else for (let k = -3; k <= 3; k++) flora.pine({ height: [200, 260], width: [80, 100], trunk: '#5e4a3a', leaves: ['#4f7453', '#587d5a'], tiers: [4, 5] })(rng(30 + k + i * 10), x + k * 190 + 40, G - 60, 900 + k).draw(paper, 0, 0);
    paper.piece(box(x - 700, G - 10, x + 700, G + 200), i === 3 ? '#e6cc9c' : '#86b163', { seed: 905, tear: 1.5, shadow: 0 });
    if (i === 0) clockTower(paper, x);
    if (i === 1) ikb(paper, x - 80);
    if (i === 2) moa(paper, x - 40);
    if (i === 3) driftwood(paper, x - 200, x + 100, G + 4, 22, 960);
  }

  /** Each photo flies out of the camera, is held up, goes to the corner stack, and at the end fans out into the album. */
  private photoPose(i: number, t: number): PhotoPose | null {
    const u = t - STOPS[i].photo;
    if (u < 0) return null;
    const stack = stackPose(i), album = clamp((t - ALBUM - i * 0.08) / 0.6), shown: PhotoPose = { at: { x: 1250, y: 330 }, scale: 1, angle: -0.05 };
    if (album > 0) return between(stack, albumPose(i, STOPS.length, 300, 300), album * album * (3 - 2 * album));
    const h = this.cam.toScreen(this.clawd.hand().at);
    if (u < 0.2) return { at: { x: h.x + 20, y: h.y - 30 - u * 250 }, scale: 0.2 + u * 1.5, angle: -0.2 };
    if (u < 0.75) return between({ at: { x: h.x + 20, y: h.y - 80 }, scale: 0.5, angle: -0.2 }, shown, Math.min(1, (u - 0.2) / 0.35));
    const k = clamp((u - 0.75) / 0.45);
    return between(shown, stack, k * k * (3 - 2 * k));
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
