import {
  Camera3D, CameraPath, type Diorama, type SetRenderer, Stage, type Stereo, type Subject, type V3, type View3, add3, billboard, circlePoly, grain, shot, smoothstep,
  vignette, wash,
} from '../../src';
import { Captions } from '../shared/captions';
import { Clawd } from '../shared/Clawd';
import { CueClock } from '../shared/kit';
import { HopPath } from '../shared/walk';
import { soundtrack as score } from './sound';
import { DOOR, POPS, SKY_LOW, SKY_TOP, village } from './village';

const W = 1920, H = 1080, FRAME = { width: W, height: H };
export const LENGTH = 8;
/** Clawd's size in the world, and the height of the drawing that stands for it (Clawd at u = 16 is 8.5 u tall). */
const CLAWD_H = 1.15, CLAWD_ART = 136;
/** One hop every 0.42 s; Clawd's own leap is that long when it rises 2800 × 0.42² / 8 px. */
const HOP = 0.42, HOP_PX = (2800 * HOP * HOP) / 8;
/** Clawd hops down the road from its front door, out of the village and toward us, in two runs. */
export const WALK = new HopPath([
  { a: DOOR.z + 0.8, b: DOOR.z + 3.9, start: 1.3, duration: 5 * HOP, hops: 5, height: 0 },
  { a: DOOR.z + 3.9, b: DOOR.z + 6.4, start: 4.2, duration: 3 * HOP, hops: 3, height: 0 },
]);
const HOPS = WALK.moves.flatMap(m => Array.from({ length: m.hops }, (_, i) => m.start + i * HOP));
const HAPPY = 6.1;

/** Where Clawd stands at scene time `t`, as a subject for shots. */
export const clawdAt = (t: number): Subject => ({ at: { x: 0.1, y: 0, z: WALK.at(t).x }, height: CLAWD_H, facing: 0 });

/**
 * The camera move, found with `pnpm scout diorama`: a high wide shot over the village as the trees pop up, craning
 * down to a medium as Clawd sets off, and settling on a full shot when it stops and smiles.
 */
export const MOVE = [
  { at: 0, setup: { size: 'wide', bearing: -38, elevation: 28 } },
  { at: 3.4, setup: { size: 'medium', bearing: -28, elevation: 12, place: { x: 0.5, y: 0.55 } } },
  { at: 6.6, setup: { size: 'full', bearing: -14, elevation: 6, place: { x: 0.5, y: 0.58 } } },
] as const;

const CAPTIONS = new Captions([
  { from: 0.8, to: 3.4, text: 'Paper pieces placed in 3D' },
  { from: 3.6, to: 7.6, text: 'A camera move scouted shot by shot', highlight: true },
]);

/**
 * "Diorama": a paper village built in 3D with `Diorama`, filmed through a `Camera3D` on a `CameraPath` that was
 * chosen by scouting shots. Pop-up trees fold up as the film opens, Clawd hops out of its front door and down the
 * road toward the camera, and the camera cranes down from a wide shot to a full shot as Clawd stops and smiles.
 * `renderer` makes something else to draw the set with, e.g. `DioramaGL` on three.js (`diorama_three`); the Canvas 2D
 * painter draws it otherwise.
 */
export class DioramaScene extends Stage {
  private readonly set: Diorama;
  private readonly popups: (t: number) => void;
  private readonly clawd = new Clawd({ x: 0, y: 0 }, 16, 2600, [0.9, 3.1, 5.2, 7.2]);
  private readonly cam = new Camera3D(W, H);
  private readonly path = new CameraPath(MOVE.map(k => ({ at: k.at, view: shot(clawdAt(k.at), k.setup, FRAME) })));
  private readonly moments = new CueClock();
  private readonly spot: V3 = { x: 0, y: 0, z: 0 };

  private readonly renderer: SetRenderer | null;

  constructor(canvas: HTMLCanvasElement, renderer?: (width: number, height: number) => SetRenderer) {
    super(canvas, { duration: LENGTH, preroll: 0.4 });
    this.renderer = renderer?.(this.width, this.height) ?? null;
    ({ set: this.set, popups: this.popups } = village());
    this.set.actors.push({ at: this.spot, height: CLAWD_H, art: CLAWD_ART, draw: (paper, scale) => { this.clawd.lens = Math.min(2.4, 1 / Math.max(0.2, scale) ** 0.55); this.clawd.draw(paper); } });
  }

  soundtrack(sampleRate: number): Stereo { return score(this, sampleRate); }

  cameraView(t: number): View3 { return this.path.at(t); }

  subjects(): Record<string, Subject> { return { clawd: clawdAt(this.time) }; }

  protected update(t: number, dt: number): void {
    this.moments.step(t);
    const c = this.clawd, { moving } = WALK.at(t), happy = smoothstep(HAPPY, HAPPY + 0.4, t), swing = Math.sin(t * 13);
    Object.assign(this.spot, clawdAt(t).at);
    c.rest();
    Object.assign(c.intent, {
      look: moving ? { x: 0.15, y: 0.1 } : t < 1.3 ? { x: Math.sin(t * 3) * 0.6, y: -0.2 } : { x: 0.35 * Math.sin(t * 1.6), y: 0 },
      armR: moving ? 0.3 + 0.35 * swing : 0.45 - 1.2 * happy,
      armL: moving ? 0.3 - 0.35 * swing : 0.5 - 0.3 * happy + 0.25 * happy * Math.sin(t * 9),
      wide: t > 3.4 && t < 4.0 ? 0.6 : 0,
      smile: 0.5,
      happy,
    });
    for (const at of HOPS) if (this.moments.passed(at)) c.hop(HOP_PX);
    c.update(dt, t);
    this.popups(t);
    const hit = (at: number, name: string, pan: number, gain = 1) => { if (this.moments.passed(at)) this.cue(name, { pan, gain }); };
    POPS.forEach(p => hit(p.time + 0.12, 'pop', p.at.x > 0 ? 0.35 : -0.35, 0.8));
    WALK.landings().forEach(at => hit(at, 'tap', 0, 0.8));
    hit(HAPPY, 'chime', 0);
  }

  probe(): Record<string, unknown> {
    const v = this.cameraView(this.time);
    return { ...super.probe(), clawdZ: +this.spot.z.toFixed(2), cam: [v.pos.x, v.pos.y, v.pos.z].map(n => +n.toFixed(2)) };
  }

  protected scout(view: View3): Record<string, unknown> {
    const cam = this.cam.set(view), lift = (this.clawd.height / CLAWD_ART) * CLAWD_H;
    return { ...this.set.judge(cam, billboard(add3(this.spot, { x: 0, y: lift, z: 0 }), 0.9, CLAWD_H, cam.pos)) };
  }

  protected draw(t: number, frame: number): void {
    const { ctx, paper } = this, cam = this.cam.set(this.scouting ?? this.cameraView(t));
    const horizon = cam.horizon(), sky = ctx.createLinearGradient(0, 0, 0, Number.isFinite(horizon) ? Math.max(1, horizon) : H);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(1, SKY_LOW);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const sun = cam.direction(this.set.light);
    if (sun) paper.piece(circlePoly(sun, 64, 24), '#fff1c9', { seed: 3, tear: 1.5, shadow: 0, texture: 0.2 });
    if (this.renderer) this.renderer.draw(this.set, cam, paper);
    else this.set.draw(paper, cam);
    if (!this.scouting) CAPTIONS.draw(paper, t);
    vignette(ctx, [40, 28, 20], 0.2);
    grain(ctx, frame, 0.04);
    wash(ctx, '#120d0a', 1 - smoothstep(0, 0.3, t));
    wash(ctx, '#120d0a', smoothstep(LENGTH - 0.45, LENGTH, t));
  }
}
