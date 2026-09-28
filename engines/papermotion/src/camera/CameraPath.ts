import { dist3, dot3, norm3, sub3 } from '../core/math3';
import type { View3 } from './Camera3D';

/** A view the camera passes at scene time `at` (s). A `hold` key stops there instead of gliding through. */
export interface PathKey { at: number; view: View3; hold?: boolean }

/** How the camera moves at a moment: travel (world units/s), turn (deg/s) and zoom (focal-length change, 1/s). */
export interface CameraMotion { speed: number; turn: number; zoom: number }

const channels = (v: View3): number[] => [v.pos.x, v.pos.y, v.pos.z, v.target.x, v.target.y, v.target.z, Math.log(v.focal), v.roll ?? 0];

/**
 * A camera move through views at given times. Every key is passed exactly at its time; between keys the move is
 * a smooth curve (Catmull–Rom tangents, so speed never jumps), it starts and ends at rest, and a `hold` key stops.
 * The focal length moves in log space, so a zoom feels even. Before the first key and after the last, it holds.
 *
 * @example
 * const path = new CameraPath([
 *   { at: 0, view: shot(hero(0), { size: 'wide', bearing: -35, elevation: 25 }, frame) },
 *   { at: 4, view: shot(hero(4), { size: 'medium', bearing: -20 }, frame) },
 * ]);
 * draw(t) { this.cam.set(this.scouting ?? path.at(t)); … }
 */
export class CameraPath {
  readonly keys: readonly PathKey[];
  private readonly values: number[][];
  private readonly slopes: number[][];

  constructor(keys: PathKey[]) {
    if (!keys.length) throw new Error('A camera path needs at least one key.');
    this.keys = [...keys].sort((a, b) => a.at - b.at);
    this.keys.forEach((k, i) => { if (i && k.at <= this.keys[i - 1].at) throw new Error(`Two camera keys at ${k.at}s.`); });
    this.values = this.keys.map(k => channels(k.view));
    const n = this.keys.length;
    this.slopes = this.values.map((v, i) => v.map((_, c) => {
      if (i === 0 || i === n - 1 || this.keys[i].hold) return 0;
      return (this.values[i + 1][c] - this.values[i - 1][c]) / (this.keys[i + 1].at - this.keys[i - 1].at);
    }));
  }

  get start(): number { return this.keys[0].at; }
  get end(): number { return this.keys[this.keys.length - 1].at; }

  /** The view at scene time `t`. */
  at(t: number): View3 {
    const k = this.keys, n = k.length;
    let v: number[];
    if (n === 1 || t <= k[0].at) v = this.values[0];
    else if (t >= k[n - 1].at) v = this.values[n - 1];
    else {
      let i = 0;
      while (t >= k[i + 1].at) i++;
      const h = k[i + 1].at - k[i].at, s = (t - k[i].at) / h, s2 = s * s, s3 = s2 * s;
      const a = 2 * s3 - 3 * s2 + 1, b = s3 - 2 * s2 + s, c = -2 * s3 + 3 * s2, d = s3 - s2;
      v = this.values[i].map((p, j) => a * p + b * h * this.slopes[i][j] + c * this.values[i + 1][j] + d * h * this.slopes[i + 1][j]);
    }
    return { pos: { x: v[0], y: v[1], z: v[2] }, target: { x: v[3], y: v[4], z: v[5] }, focal: Math.exp(v[6]), roll: v[7] };
  }

  /** How fast the camera travels, turns and zooms at `t`, measured over `dt`: numbers to check a move against before rendering it. */
  motion(t: number, dt = 1 / 30): CameraMotion { return motionBetween(this.at(t), this.at(t + dt), dt); }
}

/** How fast a camera that goes from view `a` to view `b` in `dt` seconds travels, turns and zooms. */
export function motionBetween(a: View3, b: View3, dt: number): CameraMotion {
  const turn = Math.acos(Math.min(1, dot3(norm3(sub3(a.target, a.pos)), norm3(sub3(b.target, b.pos)))));
  return { speed: dist3(a.pos, b.pos) / dt, turn: (turn * 180) / Math.PI / dt, zoom: Math.abs(Math.log(b.focal / a.focal)) / dt };
}
