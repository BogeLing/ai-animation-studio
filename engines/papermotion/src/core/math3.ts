/** A point or direction in 3D: x right, y up, z toward the viewer of a camera that looks down −z. */
export interface V3 { x: number; y: number; z: number }

export const add3 = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale3 = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot3 = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const len3 = (a: V3): number => Math.hypot(a.x, a.y, a.z);
export const dist3 = (a: V3, b: V3): number => len3(sub3(a, b));
export const norm3 = (a: V3): V3 => scale3(a, 1 / (len3(a) || 1));
export const lerp3 = (a: V3, b: V3, t: number): V3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

/** Turn `p` about the vertical axis through `about` by `angle` rad; positive angles swing +z toward +x. */
export const yaw3 = (p: V3, angle: number, about: V3 = { x: 0, y: 0, z: 0 }): V3 => {
  const c = Math.cos(angle), s = Math.sin(angle), x = p.x - about.x, z = p.z - about.z;
  return { x: about.x + c * x + s * z, y: p.y, z: about.z - s * x + c * z };
};

/** The mean of some points. */
export const centroid3 = (ps: readonly V3[]): V3 => scale3(ps.reduce(add3, { x: 0, y: 0, z: 0 }), 1 / Math.max(1, ps.length));

/** Unit normal of a planar polygon (Newell's method): it points toward the side from which the polygon winds counterclockwise. */
export function normal3(ps: readonly V3[]): V3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i], b = ps[(i + 1) % ps.length];
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  }
  return norm3({ x, y, z });
}

/**
 * Where the segment from `from` to `to` first passes through a planar polygon, as a fraction of the way (0…1),
 * or null if it misses. The ends themselves don't count, so a point on a face doesn't hide itself.
 */
export function crossing(from: V3, to: V3, poly: readonly V3[]): number | null {
  const n = normal3(poly), dir = sub3(to, from), denom = dot3(n, dir);
  if (Math.abs(denom) < 1e-12) return null;
  const t = dot3(n, sub3(poly[0], from)) / denom;
  if (t <= 1e-6 || t >= 1 - 1e-6) return null;
  const hit = add3(from, scale3(dir, t));
  // Test inside the polygon in the plane it faces most: drop the normal's largest axis.
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  const [u, v]: [keyof V3, keyof V3] = ax >= ay && ax >= az ? ['y', 'z'] : ay >= az ? ['z', 'x'] : ['x', 'y'];
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[v] > hit[v]) !== (b[v] > hit[v]) && hit[u] < ((b[u] - a[u]) * (hit[v] - a[v])) / (b[v] - a[v]) + a[u]) inside = !inside;
  }
  return inside ? t : null;
}
