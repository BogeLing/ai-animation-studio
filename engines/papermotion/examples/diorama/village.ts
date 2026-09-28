import {
  Diorama, type Face, type Piece, type V, type V3, add3, circlePoly, clamp, groundPoly, overshoot, panel, prism, rng, yaw3,
} from '../../src';

export const SKY_TOP = '#8fbad8', SKY_LOW = '#f4e0c2';
/** Clawd's front door, at the top of the road; the road runs toward +z, out of the village. */
export const DOOR: V3 = { x: 0, y: 0, z: -4.6 };
/** Trees that fold up out of the ground as the film opens, and when. */
export const POPS = [
  { at: { x: 2.4, y: 0, z: 0.6 }, size: 1.5, yaw: -0.35, time: 0.35 },
  { at: { x: -3.3, y: 0, z: -2.2 }, size: 1.35, yaw: 0.3, time: 0.6 },
  { at: { x: 2.7, y: 0, z: -3.2 }, size: 1.2, yaw: -0.2, time: 0.85 },
];

const rect = (x0: number, y0: number, x1: number, y1: number): V[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

/** A paper house: walls pushed from a gable outline, roof slopes in their own colour, a door and two windows on the front. */
function house(at: V3, yaw: number, w: number, d: number, h: number, wall: string, roof: string, seed: number): Piece {
  const faces = prism([{ x: -w / 2, y: 0 }, { x: w / 2, y: 0 }, { x: w / 2, y: h }, { x: 0, y: h + w * 0.42 }, { x: -w / 2, y: h }], d, at, yaw,
    { color: wall, seed, sides: i => (i === 2 || i === 3 ? roof : wall) });
  const front = add3(at, yaw3({ x: 0, y: 0, z: d / 2 + 0.015 }, yaw));
  faces[0].decals = [
    { pts: panel(rect(-w * 0.12, 0, w * 0.12, h * 0.55), front, yaw), color: '#6d4a37', seed: seed + 20 },
    { pts: panel(rect(-w * 0.4, h * 0.45, -w * 0.2, h * 0.75), front, yaw), color: '#fbe3a0', seed: seed + 21 },
    { pts: panel(rect(w * 0.2, h * 0.45, w * 0.4, h * 0.75), front, yaw), color: '#fbe3a0', seed: seed + 22 },
  ];
  return { faces, at: add3(at, { x: 0, y: h / 2, z: 0 }) };
}

/** A paper tree: a trunk and a round crown, two cards standing together; `tilt` folds them down (−π/2 lies flat). */
export function tree(at: V3, s: number, yaw: number, color: string, seed: number, tilt = 0): Piece {
  return {
    at: add3(at, { x: 0, y: s, z: 0 }),
    faces: [
      { pts: panel([{ x: -0.13 * s, y: 0 }, { x: 0.13 * s, y: 0 }, { x: 0.09 * s, y: 1.1 * s }, { x: -0.09 * s, y: 1.1 * s }], at, yaw, tilt), color: '#7a5236', back: '#6a4630', seed },
      { pts: panel(circlePoly({ x: 0, y: 1.55 * s }, 0.72 * s, 11), at, yaw, tilt), color, back: '#dfe6c8', seed: seed + 1 },
    ],
  };
}

/** A long ridge of paper hills standing far off, facing the village. */
function hills(seed: number, z: number, height: number, color: string): Piece {
  const r = rng(seed), outline: V[] = [{ x: -95, y: -2 }];
  for (let x = -95; x <= 95; x += 6) outline.push({ x, y: height * (0.55 + 0.45 * Math.sin(x * 0.07 + r() * 6)) + r() * 1.5 });
  outline.push({ x: 95, y: -2 });
  return { faces: [{ pts: panel(outline, { x: 0, y: 0, z }), color, seed }], casts: false };
}

/** A flat paper cloud high up and far away. */
function cloud(at: V3, seed: number): Piece {
  const r = rng(seed), puffs = [[-2.2, 0.6, 1.3], [-0.6, 1.4, 1.8], [1.4, 1.0, 1.5], [2.8, 0.4, 1.0]].map(([x, y, s]) => ({ x: x + r() * 0.4, y, s }));
  const outline = Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2, dir = { x: Math.cos(a), y: Math.sin(a) };
    // Farthest reach of any puff along this direction: a lumpy outline around all of them.
    const reach = Math.max(...puffs.map(p => p.x * dir.x + p.y * dir.y + p.s));
    return { x: dir.x * reach, y: 0.7 + Math.max(-0.4, dir.y * reach) };
  });
  return { faces: [{ pts: panel(outline, at), color: '#fbf7ee', seed }], casts: false };
}

/** The village: the ground, the road and a pond, five houses, trees around them, hills and clouds beyond. */
export function village(): { set: Diorama; popups: (t: number) => void } {
  const set = new Diorama({ light: { x: -0.55, y: 0.72, z: 0.42 }, fog: { color: SKY_LOW, near: 16, far: 75, max: 0.6 } });
  set.floor.push(
    { pts: groundPoly(circlePoly({ x: 0, y: 0 }, 30, 72)), color: '#a3bb6b', seed: 5 },
    { pts: groundPoly([{ x: -1, y: 16 }, { x: 1, y: 16 }, { x: 0.8, y: DOOR.z }, { x: -0.8, y: DOOR.z }], 0.01), color: '#e7d4a6', seed: 6 },
    { pts: groundPoly(circlePoly({ x: 4.6, y: 6.2 }, 1.2, 22, 2.1), 0.01), color: '#7fb0c9', seed: 7 },
  );
  set.pieces.push(
    ...[-62, -52, -43].map((z, i) => hills(11 + i, z, [15, 11, 7][i], ['#9bb489', '#86a36e', '#76985e'][i])),
    ...[0, 1, 2, 3].map(i => cloud({ x: -32 + i * 21, y: 13 + (i % 2) * 3, z: -46 - (i % 3) * 6 }, 50 + i)),
    house({ x: DOOR.x, y: 0, z: DOOR.z - 1.3 }, 0, 3.2, 2.6, 2.2, '#ecd6b3', '#b8553f', 100),
    house({ x: -4.4, y: 0, z: -1.8 }, 0.6, 2.8, 2.4, 2.5, '#f1e4ca', '#5b7fa6', 200),
    house({ x: 4.6, y: 0, z: -2.6 }, -0.55, 2.6, 2.3, 2.0, '#e9cba4', '#8c6a9e', 300),
    house({ x: -6.2, y: 0, z: 3.6 }, 1.15, 2.5, 2.3, 1.9, '#efdabb', '#c7803a', 400),
    house({ x: 6.4, y: 0, z: 3.0 }, -1.1, 2.4, 2.2, 2.1, '#f0e0c4', '#6f8f5a', 500),
  );
  const r = rng(77), palette = ['#6f9a4f', '#5f8a45', '#88ab5a', '#4f7a43'], homes: V[] = [{ x: 0, y: -5.9 }, { x: -4.4, y: -1.8 }, { x: 4.6, y: -2.6 }, { x: -6.2, y: 3.6 }, { x: 6.4, y: 3.0 }];
  for (let n = 0; n < 20;) {
    const a = r() * Math.PI * 2, d = 7 + r() * 12, p = { x: Math.cos(a) * d, y: Math.sin(a) * d - 3 }, s = 1.2 + r() * 1.1, yaw = (r() - 0.5) * 0.9;
    // Keep the road, the houses and the open side where the camera works clear.
    if ((Math.abs(p.x) < 2.2 && p.y > -8) || (p.y > 1 && Math.abs(p.x) < 12) || homes.some(h => Math.hypot(h.x - p.x, h.y - p.y) < 3.4)) continue;
    set.pieces.push(tree({ x: p.x, y: 0, z: p.y }, s, yaw, palette[n % palette.length], 1000 + n * 10));
    n++;
  }
  const pops = POPS.map((p, i) => { const piece = tree(p.at, p.size, p.yaw, '#7da653', 9000 + i * 10, -Math.PI / 2); set.pieces.push(piece); return piece; });
  // Pop-up trees swing up off the page with a little overshoot, like a pop-up book opening.
  const popups = (t: number) => POPS.forEach((p, i) => {
    const fresh = tree(p.at, p.size, p.yaw, '#7da653', 9000 + i * 10, (-Math.PI / 2) * (1 - overshoot(clamp((t - p.time) / 0.55), 2.2)));
    pops[i].faces = fresh.faces;
  });
  return { set, popups };
}

export type { Face };
