import { type V, lerpV } from '../core/math';
import { type V3, add3, cross3, dot3, lerp3, norm3, scale3, sub3 } from '../core/math3';

/**
 * Where a camera stands, what it looks at, and its lens. `focal` is the focal length in px: a frame `h` px tall
 * shows a vertical field of view of 2·atan(h / 2 / focal). `roll` (rad) turns the picture about the lens axis;
 * positive tips the horizon down to the right, like `Camera`'s roll.
 */
export interface View3 { pos: V3; target: V3; focal: number; roll?: number }

/** Where a point lands on screen (px), how far in front of the lens it is, and how many px one world unit spans there. */
export interface Projected { x: number; y: number; depth: number; scale: number }

/**
 * A pinhole camera for scenes placed in 3D. It looks from `pos` toward `target` with the world's y up, and
 * projects points and polygons onto a `width` × `height` frame in px. World axes: x right, y up, z toward the
 * viewer of an unturned camera. Set a whole view with `set`; after changing fields one by one, call `update`.
 *
 * @example
 * const cam = new Camera3D(1920, 1080).set({ pos: { x: 0, y: 5, z: 16 }, target: { x: 0, y: 1, z: 0 }, focal: 1900 });
 * const poly = cam.polygon(face);   // null when the face is behind the lens
 * if (poly) paper.piece(poly, '#e9d3b0', { seed: 7 });
 */
export class Camera3D {
  pos: V3 = { x: 0, y: 0, z: 10 };
  target: V3 = { x: 0, y: 0, z: 0 };
  /** Default: a 32° vertical field of view. */
  focal: number;
  roll = 0;
  /** Nothing nearer than this (world units) is drawn: polygons are clipped there. */
  near = 0.05;
  private right: V3 = { x: 1, y: 0, z: 0 };
  private up: V3 = { x: 0, y: 1, z: 0 };
  private fwd: V3 = { x: 0, y: 0, z: -1 };

  constructor(readonly width: number, readonly height: number, view?: View3) {
    this.focal = height * 1.76;
    if (view) this.set(view);
    else this.update();
  }

  /** Take a whole view: position, target, focal length and roll. */
  set(view: View3): this {
    this.pos = { ...view.pos };
    this.target = { ...view.target };
    this.focal = view.focal;
    this.roll = view.roll ?? 0;
    this.update();
    return this;
  }

  /** The current view, to store or interpolate. */
  get view(): View3 { return { pos: { ...this.pos }, target: { ...this.target }, focal: this.focal, roll: this.roll }; }

  /** Recompute the lens axes after changing `pos`, `target` or `roll` directly. */
  update(): void {
    this.fwd = norm3(sub3(this.target, this.pos));
    let right = cross3(this.fwd, { x: 0, y: 1, z: 0 });
    // Looking straight up or down: any horizontal right axis will do.
    right = dot3(right, right) < 1e-12 ? { x: 1, y: 0, z: 0 } : norm3(right);
    const up = cross3(right, this.fwd), c = Math.cos(this.roll), s = Math.sin(this.roll);
    this.right = add3(scale3(right, c), scale3(up, s));
    this.up = sub3(scale3(up, c), scale3(right, s));
  }

  /** Unit vector along the lens axis. */
  get forward(): V3 { return { ...this.fwd }; }

  /** The lens's own unit axes in the world: screen right, screen up (both turned by `roll`) and forward. */
  get axes(): { right: V3; up: V3; forward: V3 } { return { right: { ...this.right }, up: { ...this.up }, forward: { ...this.fwd } }; }

  /** Vertical field of view (rad). */
  get fov(): number { return 2 * Math.atan(this.height / 2 / this.focal); }

  /** World → camera space: x right, y up and z the depth in front of the lens. */
  toCamera(p: V3): V3 {
    const d = sub3(p, this.pos);
    return { x: dot3(d, this.right), y: dot3(d, this.up), z: dot3(d, this.fwd) };
  }

  /** Where a point lands on screen. A `depth` at or below zero means it is behind the lens. */
  project(p: V3): Projected {
    const c = this.toCamera(p), scale = this.focal / c.z;
    return { x: this.width / 2 + c.x * scale, y: this.height / 2 - c.y * scale, depth: c.z, scale };
  }

  /** Where a direction at infinity (the sun, a far star) lands on screen, or null if it points behind the lens. */
  direction(d: V3): V | null {
    const z = dot3(d, this.fwd);
    if (z <= 1e-9) return null;
    return { x: this.width / 2 + (this.focal * dot3(d, this.right)) / z, y: this.height / 2 - (this.focal * dot3(d, this.up)) / z };
  }

  /**
   * A polygon clipped at the near plane, projected to the screen and trimmed to the frame plus `margin` px, or null
   * when none of it shows. Straight edges stay straight under perspective, so a flat piece of paper is exact; the
   * trim keeps a floor that runs behind the lens from turning into edges millions of px long.
   */
  polygon(ps: readonly V3[], margin = 200): V[] | null {
    const near = clip(ps.map(p => this.toCamera(p)), p => p.z - this.near, lerp3);
    if (near.length < 3) return null;
    let out: V[] = near.map(c => ({ x: this.width / 2 + (c.x * this.focal) / c.z, y: this.height / 2 - (c.y * this.focal) / c.z }));
    const x0 = -margin, x1 = this.width + margin, y0 = -margin, y1 = this.height + margin;
    for (const side of [(p: V) => p.x - x0, (p: V) => x1 - p.x, (p: V) => p.y - y0, (p: V) => y1 - p.y]) out = clip(out, side, lerpV);
    return out.length < 3 ? null : out;
  }

  /** The unit direction in the world that passes through screen point (x, y) px. */
  ray(x: number, y: number): V3 {
    return norm3(add3(add3(scale3(this.fwd, this.focal), scale3(this.right, x - this.width / 2)), scale3(this.up, this.height / 2 - y)));
  }

  /**
   * Screen y (px) where the horizon, the vanishing line of every level direction, crosses column `x`; NaN when
   * the camera looks straight up or down.
   */
  horizon(x = this.width / 2): number {
    const a = this.right.y, b = this.up.y, c = this.fwd.y;
    return Math.abs(b) < 1e-9 ? NaN : this.height / 2 + (c * this.focal + a * (x - this.width / 2)) / b;
  }

  /** The screen box around some points, as fractions of the frame (0…1), and whether all of it is in front of the lens and inside the frame. */
  box(ps: readonly V3[]): { x0: number; x1: number; y0: number; y1: number; inFrame: boolean } {
    const p = ps.map(q => this.project(q)), xs = p.map(q => q.x / this.width), ys = p.map(q => q.y / this.height);
    const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    return { ...box, inFrame: p.every(q => q.depth > this.near) && box.x0 >= 0 && box.x1 <= 1 && box.y0 >= 0 && box.y1 <= 1 };
  }
}

/** Keep the part of a polygon where `inside(p) >= 0` (Sutherland–Hodgman against one straight edge or plane). */
function clip<P>(pts: P[], inside: (p: P) => number, mix: (a: P, b: P, t: number) => P): P[] {
  const out: P[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], da = inside(a), db = inside(b);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) out.push(mix(a, b, da / (da - db)));
  }
  return out;
}
