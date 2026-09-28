import { BufferGeometry, Float32BufferAttribute, Matrix4, Shape, ShapeGeometry, Vector2, Vector3 } from 'three';
import type { V } from '../core/math';
import { type V3, add3, cross3, dot3, norm3, normal3, scale3, sub3 } from '../core/math3';
import { noise1 } from '../core/random';
import { resample } from '../paper/geometry';

/** A face's own plane: an origin on it, two axes along it (u, v) and its normal n = u × v. */
export interface FacePlane { o: V3; u: V3; v: V3; n: V3 }

/** The plane a planar polygon lies in; u runs level where it can, so grain and tears line up across a wall. */
export function facePlane(pts: readonly V3[]): FacePlane {
  const n = normal3(pts), level = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: -1 };
  const u = norm3(cross3(level, n));
  return { o: pts[0], u, v: cross3(n, u), n };
}

/**
 * A polygon's outline in its own plane, torn like `Paper` tears it: resampled along its edges and pushed about by
 * noise, `tear` world units at most. `boil` (0, 1, 2) picks one of the three shapes an edge boils between.
 */
export function tornOutline(outline: readonly V[], seed: number, tear: number, boil = 0): V[] {
  const perimeter = outline.reduce((s, p, i) => { const q = outline[(i + 1) % outline.length]; return s + Math.hypot(q.x - p.x, q.y - p.y); }, 0);
  const pts = resample([...outline], Math.max(0.02, perimeter / 700)), z = boil * 41.3;
  let s = 0;
  return pts.map((p, i) => {
    if (i) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    const u = s * 6 + z;
    return { x: p.x + (noise1(u, seed) + noise1(u * 4.1, seed + 3) * 0.35) * tear * 0.74, y: p.y + (noise1(u, seed + 7) + noise1(u * 4.1, seed + 9) * 0.35) * tear * 0.74 };
  });
}

/**
 * The mesh of a paper face: its outline torn in its own plane and filled, placed back in the world, with texture
 * coordinates in world units along the face (so grain has one size everywhere), and the torn outline for its cut edge.
 */
export function faceGeometry(pts: readonly V3[], seed: number, tear: number, boil = 0): { fill: BufferGeometry; edge: V3[]; plane: FacePlane } {
  const plane = facePlane(pts), { o, u, v, n } = plane;
  const outline = tornOutline(pts.map(p => { const d = sub3(p, o); return { x: dot3(d, u), y: dot3(d, v) }; }), seed, tear, boil);
  const fill = new ShapeGeometry(new Shape(outline.map(p => new Vector2(p.x, p.y))));
  fill.applyMatrix4(new Matrix4().makeBasis(new Vector3(u.x, u.y, u.z), new Vector3(v.x, v.y, v.z), new Vector3(n.x, n.y, n.z)).setPosition(o.x, o.y, o.z));
  return { fill, edge: outline.map(p => add3(o, add3(scale3(u, p.x), scale3(v, p.y)))), plane };
}

/** A closed line through points, lifted `lift` along a normal (so a cut edge sits just off its face). */
export function loopGeometry(pts: readonly V3[], normal: V3, lift: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts.flatMap(p => [p.x + normal.x * lift, p.y + normal.y * lift, p.z + normal.z * lift]), 3));
  return g;
}
