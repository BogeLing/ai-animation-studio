import type { Camera3D } from '../camera/Camera3D';
import { clamp, smoothstep } from '../core/math';
import { type V3, add3, centroid3, crossing, dot3, norm3, normal3, scale3, sub3 } from '../core/math3';
import type { Paper } from '../paper/Paper';

/**
 * A flat piece of paper placed in 3D. `pts` is planar and winds counterclockwise seen from its front. A `solid`
 * face belongs to a closed shape and is skipped when it faces away; any other face is a two-sided card that shows
 * `back` from behind. A `flat` face lies on the ground: no drop shadow, casts nothing, never hides anything.
 * `decals` (doors, windows) are drawn on it whenever it is seen from the front.
 */
export interface Face {
  pts: V3[];
  color: string;
  back?: string;
  seed: number;
  solid?: boolean;
  flat?: boolean;
  tear?: number;
  texture?: number;
  decals?: Face[];
}

/** Faces sorted together as one thing (a house, a tree): back to front by `at`, or by the middle of their points. */
export interface Piece { faces: Face[]; at?: V3; casts?: boolean }

/**
 * Flat 2D art standing in the world, facing the camera (a paper character on a stick). `draw` paints it with its
 * feet at (0, 0) and up toward −y, `art` px tall; the diorama scales it to `height` world units where it stands.
 */
export interface Actor { at: V3; height: number; art: number; draw: (paper: Paper, scale: number) => void }

export interface DioramaOpts {
  /** Direction toward the sun; lights the faces and throws the shadows. */
  light?: V3;
  /** Height of the ground plane the shadows fall on. */
  ground?: number;
  shadow?: { color: string; alpha: number; blur: number };
  /** Aerial perspective: faces fade toward `color` between `near` and `far` (world units), by at most `max`. */
  fog?: { color: string; near: number; far: number; max: number };
  /** Face brightness facing away from the light, and how much the light adds on top. */
  shade?: [number, number];
}

/** Draws a set instead of its own Canvas 2D painter, e.g. `DioramaGL` (three.js, from `src/three`). */
export interface SetRenderer { draw(set: Diorama, cam: Camera3D, paper: Paper): void }

/** What a scouted view shows of a subject (see `Diorama.judge`). */
export interface ShotNumbers {
  /** Share of the subject's sample points no piece hides. */
  visible: number;
  /** The subject's height on screen, as a fraction of the frame's height. */
  height: number;
  /** Middle of the subject on screen, as fractions of the frame. */
  x: number;
  y: number;
  inFrame: boolean;
  /** Distance to the nearest piece along a grid of rays through the frame. */
  nearest: number;
  /** Share of those rays that hit a piece closer than the `near` distance: clutter in front of the lens. */
  close: number;
}

type RGB = [number, number, number];

function rgb(color: string): RGB {
  const h = color.replace('#', ''), full = h.length === 3 ? [...h].map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Diorama colours are #rgb or #rrggbb, got "${color}".`);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Paper pieces placed in 3D and drawn through a `Camera3D` with `Paper`: a paper theatre or pop-up book that the
 * camera can move through. Each face is projected (straight edges stay straight, so paper is exact) and drawn as a
 * torn piece; faces are lit by the sun, fade into the air with distance, and throw shadows on the ground. Pieces
 * and actors are drawn back to front as wholes, so keep them apart: pieces that pass through each other can sort
 * wrongly. Solids are convex closed shapes; their back faces are skipped.
 *
 * @example
 * const set = new Diorama({ light: { x: -0.5, y: 0.75, z: 0.4 }, fog: { color: '#f4e0c2', near: 16, far: 75, max: 0.6 } });
 * set.floor.push({ pts: groundPoly(circlePoly({ x: 0, y: 0 }, 30, 72)), color: '#a3bb6b', seed: 1 });
 * set.pieces.push({ faces: prism(houseOutline, 2.6, { x: -3, y: 0, z: -2 }, 0.3, { color: '#ecd6b3', seed: 10 }) });
 * set.actors.push({ at: hero, height: 1.2, art: 136, draw: paper => clawd.draw(paper) });
 * draw() { set.draw(this.paper, this.cam.set(view)); }
 */
export class Diorama {
  light: V3;
  ground: number;
  shadow: { color: string; alpha: number; blur: number };
  fog: { color: string; near: number; far: number; max: number } | null;
  shade: [number, number];
  /** Flat faces on the ground (the ground itself, roads, ponds), drawn first and in order. */
  readonly floor: Face[] = [];
  readonly pieces: Piece[] = [];
  readonly actors: Actor[] = [];

  constructor(o: DioramaOpts = {}) {
    this.light = norm3(o.light ?? { x: -0.5, y: 0.75, z: 0.4 });
    this.ground = o.ground ?? 0;
    this.shadow = o.shadow ?? { color: '#2d2438', alpha: 0.22, blur: 2 };
    this.fog = o.fog ?? null;
    this.shade = o.shade ?? [0.62, 0.42];
  }

  /** Draw the floor, the shadows cast on it, then every piece and actor from back to front. */
  draw(paper: Paper, cam: Camera3D): void {
    for (const f of this.floor) this.face(paper, cam, { ...f, flat: true });
    this.shadows(paper, cam);
    const items: { depth: number; draw: () => void }[] = [
      ...this.pieces.map(p => ({ depth: cam.toCamera(p.at ?? centroid3(p.faces.flatMap(f => f.pts))).z, draw: () => p.faces.forEach(f => this.face(paper, cam, f)) })),
      ...this.actors.map(a => ({ depth: cam.toCamera(a.at).z, draw: () => this.actor(paper, cam, a) })),
    ];
    items.sort((a, b) => b.depth - a.depth).forEach(it => it.draw());
  }

  /** The colour a face shows: lit by the sun on the side the camera sees, faded into the air with distance. */
  tint(face: Face, n: V3, front: boolean, depth: number): string {
    const base = rgb(front || !face.back ? face.color : face.back), d = dot3(front ? n : scale3(n, -1), this.light);
    const lit = this.shade[0] + this.shade[1] * clamp(d, 0, 1), air = this.fog ? smoothstep(this.fog.near, this.fog.far, depth) * this.fog.max : 0;
    const fog = this.fog ? rgb(this.fog.color) : base;
    return `rgb(${base.map((c, i) => Math.round(clamp(c * lit + (fog[i] - c * lit) * air, 0, 255))).join(', ')})`;
  }

  /** Where a point's shadow falls on the ground, along the sunlight. */
  onGround(p: V3): V3 {
    const k = (p.y - this.ground) / Math.max(1e-6, this.light.y);
    return { x: p.x - this.light.x * k, y: this.ground + 0.01, z: p.z - this.light.z * k };
  }

  /** The share of `points` that `cam` sees: those no piece's face stands in front of. Actors and the floor hide nothing. */
  visible(points: readonly V3[], cam: Camera3D): number {
    const faces = this.blockers();
    const seen = points.filter(p => !faces.some(f => crossing(cam.pos, p, f) !== null)).length;
    return points.length ? seen / points.length : 1;
  }

  /** Distance to the nearest piece along a grid of rays through the frame, and the share of rays that hit one closer than `near`. */
  clutter(cam: Camera3D, near = 4, far = 400): { nearest: number; close: number } {
    const faces = this.blockers();
    let nearest = Infinity, close = 0, rays = 0;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) {
      const to = add3(cam.pos, scale3(cam.ray(((i + 0.5) / 9) * cam.width, ((j + 0.5) / 5) * cam.height), far));
      let hit = Infinity;
      for (const f of faces) { const t = crossing(cam.pos, to, f); if (t !== null) hit = Math.min(hit, t * far); }
      nearest = Math.min(nearest, hit);
      if (hit < near) close++;
      rays++;
    }
    return { nearest, close: close / rays };
  }

  /** The numbers a scouting sheet shows for a view of a subject sampled at `points` (see `billboard`). */
  judge(cam: Camera3D, points: readonly V3[], near = 4): ShotNumbers {
    const box = cam.box(points), { nearest, close } = this.clutter(cam, near);
    return { visible: this.visible(points, cam), height: box.y1 - box.y0, x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2, inFrame: box.inFrame, nearest, close };
  }

  private blockers(): V3[][] {
    return this.pieces.flatMap(p => p.faces.filter(f => !f.flat).map(f => f.pts));
  }

  private face(paper: Paper, cam: Camera3D, f: Face): void {
    const n = normal3(f.pts), c = centroid3(f.pts), front = dot3(n, norm3(sub3(cam.pos, c))) > 0;
    if (f.solid && !front) return;
    const poly = cam.polygon(f.pts);
    if (!poly) return;
    const depth = Math.max(cam.near, cam.toCamera(c).z), k = cam.focal / depth;
    paper.piece(poly, this.tint(f, n, front, depth), { seed: f.seed, tear: f.tear ?? clamp(k * 0.018, 0.5, 2.4), shadow: f.flat ? 0 : clamp(k * 0.05, 2, 9), texture: f.texture ?? 0.3 });
    if (front) for (const d of f.decals ?? []) this.face(paper, cam, { ...d, flat: true });
  }

  /** Every standing face projected onto the ground along the light, filled as one translucent layer so overlaps don't darken twice. */
  private shadows(paper: Paper, cam: Camera3D): void {
    if (this.light.y <= 0.05) return;
    const casting = this.pieces.filter(p => p.casts !== false).flatMap(p => p.faces.filter(f => !f.flat));
    paper.layer(this.shadow.alpha, () => {
      const g = paper.context;
      g.fillStyle = this.shadow.color;
      for (const f of casting) {
        const poly = cam.polygon(f.pts.map(p => this.onGround(p)));
        if (!poly) continue;
        g.beginPath();
        poly.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
        g.closePath();
        g.fill();
      }
    }, 'source-over', `blur(${this.shadow.blur}px)`);
  }

  /** An actor at its place and size, turned so its up follows the world's up on screen (roll, converging verticals). */
  private actor(paper: Paper, cam: Camera3D, a: Actor): void {
    const p = cam.project(a.at);
    if (p.depth <= cam.near) return;
    const q = cam.project(add3(a.at, { x: 0, y: a.height * 0.5, z: 0 })), s = (p.scale * a.height) / a.art;
    const ctx = paper.context;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.atan2(q.x - p.x, p.y - q.y));
    ctx.scale(s, s);
    a.draw(paper, s);
    ctx.restore();
  }
}
