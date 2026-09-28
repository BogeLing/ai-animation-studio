import type { V } from '../core/math';
import { type V3, add3, cross3, norm3, normal3, scale3, sub3, yaw3 } from '../core/math3';
import type { Face } from './Diorama';

/**
 * A flat card standing in the world. `outline` is drawn in the card's own plane (x across, y up, in world units,
 * base on y = 0); the card stands at `at`, turned `yaw` rad about the vertical (0 faces +z) and tipped back `tilt`
 * rad about its base: 0 stands up, −π/2 lies flat face up, like a pop-up page folded down.
 */
export function panel(outline: readonly V[], at: V3, yaw = 0, tilt = 0): V3[] {
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  return outline.map(p => add3(yaw3({ x: p.x, y: p.y * ct, z: p.y * st }, yaw), at));
}

/** A polygon lying on the level plane at height `y`, from an outline in (x, z), wound to face up. */
export function groundPoly(outline: readonly V[], y = 0): V3[] {
  const pts = outline.map(p => ({ x: p.x, y, z: p.y }));
  return normal3(pts).y < 0 ? pts.reverse() : pts;
}

/**
 * A closed solid made by pushing `outline` (drawn like a `panel`: x across, y up, base on y = 0) `depth` deep, then
 * standing it at `at` turned `yaw` rad: its front and back and one face per edge, all wound to face outward and
 * marked `solid`. `sides(i)` colours the face along edge i (from outline[i] to the next point), e.g. a roof.
 *
 * @example
 * // A house: a pentagon pushed 2.4 deep, the two roof slopes (edges 2 and 3) in red.
 * const house = prism([{ x: -1.4, y: 0 }, { x: 1.4, y: 0 }, { x: 1.4, y: 2 }, { x: 0, y: 3.2 }, { x: -1.4, y: 2 }], 2.4,
 *   { x: 3, y: 0, z: -4 }, -0.3, { color: '#ecd6b3', seed: 20, sides: i => (i === 2 || i === 3 ? '#b8553f' : '#ecd6b3') });
 */
export function prism(outline: readonly V[], depth: number, at: V3, yaw: number, style: { color: string; seed: number; sides?: (i: number) => string }): Face[] {
  const ccw = outline.reduce((s, p, i) => { const q = outline[(i + 1) % outline.length]; return s + (p.x * q.y - q.x * p.y); }, 0) > 0;
  const ring = ccw ? [...outline] : [...outline].reverse();
  const place = (p: V, z: number) => add3(yaw3({ x: p.x, y: p.y, z }, yaw), at);
  const front = ring.map(p => place(p, depth / 2)), back = ring.map(p => place(p, -depth / 2)).reverse();
  const faces: Face[] = [
    { pts: front, color: style.color, seed: style.seed, solid: true },
    { pts: back, color: style.color, seed: style.seed + 1, solid: true },
  ];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], k = ccw ? i : ring.length - 2 - i;
    faces.push({ pts: [place(a, depth / 2), place(a, -depth / 2), place(b, -depth / 2), place(b, depth / 2)], color: style.sides?.((k + ring.length) % ring.length) ?? style.color, seed: style.seed + 2 + i, solid: true });
  });
  return faces;
}

/**
 * Points spread over a standing rectangle `width` × `height` at `at`, turned to face `from` (a camera): the samples
 * `Diorama.judge` checks to tell how much of an actor a view sees and where it lands on screen.
 */
export function billboard(at: V3, width: number, height: number, from: V3, n = 4): V3[] {
  const toward = sub3(from, at), across = norm3(cross3({ x: 0, y: 1, z: 0 }, { x: toward.x, y: 0, z: toward.z }));
  const out: V3[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const u = (i / (n - 1) - 0.5) * width, v = (j / (n - 1)) * height;
    out.push(add3(at, add3(scale3(across, u), { x: 0, y: v, z: 0 })));
  }
  return out;
}
