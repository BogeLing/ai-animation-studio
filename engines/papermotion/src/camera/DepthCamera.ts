import type { V } from '../core/math';
import { type V3, add3, scale3, yaw3 } from '../core/math3';
import { Paper } from '../paper/Paper';
import { Camera, type CameraOpts, type View } from './Camera';
import { Camera3D, type View3 } from './Camera3D';

/** Makes the camera a scene films with, so a film can be shot with another one (a `DepthCamera` for its 2.5D cut). */
export type MakeCamera = (x: number, o: CameraOpts) => Camera;

export interface DepthOpts {
  /** Distance from the lens to the action plane (depth 1) at zoom 1, in world units; a layer at depth d stands at distance / d. Default 10. */
  distance?: number;
  /**
   * Focal length in px. Default: a long lens, 4 × the frame's height (a 14° vertical field of view). It keeps each
   * sheet's perspective close to the affine map its layer is drawn with, and makes a few degrees of swing enough to
   * slide the sheets well apart.
   */
  focal?: number;
  /** Degrees the lens has swung around the framed point at scene time t; positive swings it toward +x. */
  orbit?: (t: number) => number;
  /** Degrees the lens has risen above the framed point at scene time t, looking down on the set. */
  crane?: (t: number) => number;
}

/** A layer's placement on screen: the affine map from its own px to the screen, and the part of it in view. */
export interface LayerFit { m: [number, number, number, number, number, number]; view: View }

/**
 * A drop-in `Camera` that films a scene's parallax layers as flat sheets standing at real distances, through a
 * perspective lens: a multiplane camera, the classic 2.5D. A layer at depth d stands at `distance / d` from the lens
 * at zoom 1 (depth 0 is the sky, at infinity), so with no orbit or crane every layer is framed as `Camera` frames it. `orbit` and `crane` then swing the
 * lens around the framed point, which a flat camera can't do: near sheets slide across far ones and the set shows
 * its depth. Each layer is drawn through the affine map that matches its perspective at the middle of the frame, so
 * a scene's drawing code runs unchanged. With the default long lens, swings of 2–8° already read strongly; keep them
 * under about 10°.
 *
 * @example
 * // The same film, shot as 2.5D: the scene takes a camera maker.
 * new PlaneScene(canvas, { camera: (x, o) => new DepthCamera(x, o, { orbit: t => keys(t, [[0, -4], [3, 5]]) }) });
 */
export class DepthCamera extends Camera {
  /** The perspective lens behind the layers, set to this frame's view. */
  readonly perspective: Camera3D;
  private readonly width: number;
  private readonly height: number;
  private now = 0;

  constructor(x: number, o: CameraOpts, private readonly settings: DepthOpts = {}) {
    super(x, o);
    this.width = o.width;
    this.height = o.height;
    this.perspective = new Camera3D(o.width, o.height);
    this.perspective.focal = settings.focal ?? o.height * 4;
  }

  update(targetX: number, dt: number, t: number, targetY?: number): void {
    this.now = t;
    super.update(targetX, dt, t, targetY);
  }

  private get distance(): number { return this.settings.distance ?? 10; }

  /** The lens this frame: at the zoomed distance from the framed point on the action plane, swung by orbit and crane. */
  get view3(): View3 {
    const { width: W } = this, f = this.perspective.focal, s = this.distance / f;
    const target = { x: (this.x - W / 2) * s, y: -this.y * s, z: 0 };
    const orbit = ((this.settings.orbit?.(this.now) ?? 0) * Math.PI) / 180, crane = ((this.settings.crane?.(this.now) ?? 0) * Math.PI) / 180;
    const out = yaw3({ x: 0, y: Math.sin(crane), z: Math.cos(crane) }, orbit);
    return { pos: add3(target, scale3(out, this.distance / this.zoom)), target, focal: f, roll: this.roll };
  }

  /** A point of the layer at `depth` (above 0) in the world: its px, laid on the sheet standing at distance / depth. */
  private onSheet(p: V, depth: number): V3 {
    const { width: W, height: H } = this, s = this.distance / depth / this.perspective.focal;
    return { x: (p.x - W / 2) * s, y: (H / 2 - p.y) * s, z: this.distance - this.distance / depth };
  }

  /**
   * Where the layer at `depth` sits this frame: the affine map from its px to the screen that matches the perspective
   * exactly at the middle of the frame (and closely around it), and the part of the layer that map puts on screen;
   * null once the lens has passed its sheet (a foreground layer in a close-up).
   */
  fit(depth: number): LayerFit | null {
    const { width: W, height: H } = this, cam = this.perspective.set(this.view3), ray = cam.ray(W / 2, H / 2);
    let l0: V;
    if (depth > 0) {
      const D = this.distance, s = D / depth / cam.focal, z = D - D / depth, k = (z - cam.pos.z) / ray.z;
      if (!(k > cam.near)) return null;
      l0 = { x: (cam.pos.x + ray.x * k) / s + W / 2, y: H / 2 - (cam.pos.y + ray.y * k) / s };
    } else {
      if (ray.z >= 0) return null;
      l0 = { x: W / 2 - (cam.focal * ray.x) / ray.z, y: H / 2 + (cam.focal * ray.y) / ray.z };
    }
    const q0 = this.onScreen(cam, l0, depth), qx = this.onScreen(cam, { x: l0.x + 20, y: l0.y }, depth), qy = this.onScreen(cam, { x: l0.x, y: l0.y + 20 }, depth);
    if (!q0 || !qx || !qy) return null;
    const a = (qx.x - q0.x) / 20, b = (qx.y - q0.y) / 20, c = (qy.x - q0.x) / 20, d = (qy.y - q0.y) / 20;
    const e = q0.x - a * l0.x - c * l0.y, f = q0.y - b * l0.x - d * l0.y, det = a * d - b * c;
    const back = (q: V) => ({ x: (d * (q.x - e) - c * (q.y - f)) / det, y: (a * (q.y - f) - b * (q.x - e)) / det });
    const corners = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: 0, y: H }, { x: W, y: H }].map(back), xs = corners.map(p => p.x), ys = corners.map(p => p.y);
    return { m: [a, b, c, d, e, f], view: { from: Math.min(...xs) - 50, to: Math.max(...xs) + 50, top: Math.min(...ys) - 50, bottom: Math.max(...ys) + 50 } };
  }

  /**
   * Where a layer's point lands through the true perspective: on its sheet, or for depth 0 (the sky, a sun) as a
   * direction at infinity, which only turns with the lens. Null behind the lens.
   */
  private onScreen(cam: Camera3D, p: V, depth: number): V | null {
    if (depth > 0) { const q = cam.project(this.onSheet(p, depth)); return q.depth > cam.near ? q : null; }
    return cam.direction({ x: (p.x - this.width / 2) / cam.focal, y: (this.height / 2 - p.y) / cam.focal, z: -1 });
  }

  layer(target: CanvasRenderingContext2D | Paper, depth: number, draw: (view: View) => void): void {
    const ctx = target instanceof Paper ? target.context : target;
    if (!Number.isFinite(this.zoom) || !Number.isFinite(this.x) || !Number.isFinite(this.y)) {
      throw new Error(`Camera has a non-finite value (zoom=${this.zoom}, x=${this.x}, y=${this.y})`);
    }
    const fit = this.fit(depth);
    if (!fit) return;
    ctx.save();
    ctx.transform(...fit.m);
    draw(fit.view);
    ctx.restore();
  }

  /** Where a layer's point lands on screen, through the same map its layer is drawn with. */
  toScreen(p: { x: number; y: number }, depth = 1): { x: number; y: number } {
    const fit = this.fit(depth);
    if (!fit) return this.onScreen(this.perspective.set(this.view3), p, depth) ?? { x: NaN, y: NaN };
    const [a, b, c, d, e, f] = fit.m;
    return { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f };
  }
}
