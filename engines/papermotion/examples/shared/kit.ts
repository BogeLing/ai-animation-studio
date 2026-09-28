import { type Paper, type SheetOpts, type V, clamp, overshoot } from '../../src';
export { rrect } from './Clawd';

/**
 * Pop-up-book helpers shared by the films: shapes, a local frame to draw in, entrances, one-sheet props,
 * cartoon faces and a fire-once clock for sound cues.
 */

/** Default ink for faces and outlines. */
export const INK = '#2a1d17';

/** An ellipse as a polygon of `n` points. */
export const ellipse = (c: V, rx: number, ry: number, n = 22): V[] =>
  Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return { x: c.x + Math.cos(a) * rx, y: c.y + Math.sin(a) * ry }; });

/** An axis-aligned rectangle from (x0, y0) to (x1, y1). */
export const box = (x0: number, y0: number, x1: number, y1: number): V[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

/** Draw in a local frame: moved to (x, y), turned by `a`, scaled by `k` (and `ky`). */
export function place(paper: Paper, x: number, y: number, k: number, a: number, draw: () => void, ky = k): void {
  const g = paper.context;
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.scale(k, ky);
  draw();
  g.restore();
}

/** Pop-up-book entrance: 0 before `t0`, then springs up to 1 with an overshoot over `d` seconds. */
export const pop = (t: number, t0: number, d = 0.34): number => (t <= t0 ? 0 : overshoot(clamp((t - t0) / d), 2.1));

/** 0 → 1 over `d` seconds from `t0`, eased. */
export const ease = (t: number, t0: number, d: number): number => { const u = clamp((t - t0) / d); return u * u * (3 - 2 * u); };

/** One piece of paper for a prop: its parts merge into one silhouette with one shadow, rim and core shadow. */
export function card(paper: Paper, draw: () => void, o: SheetOpts = {}): void {
  paper.sheet({ shadow: 8, rim: { color: '#fff7e8', width: 3 }, shade: { color: 'rgba(50, 26, 10, 0.2)', width: 8 }, ...o }, draw);
}

/** Two cartoon eyes with catchlights, `gap` × r apart. `open` 0…1 closes them; `x` draws them shut as crosses. */
export function eyes(paper: Paper, c: V, r: number, look: V = { x: 0, y: 0 }, open = 1, seed = 0, gap = 2.7, x = false, ink = INK): void {
  for (const side of [-1, 1]) {
    const e = { x: c.x + side * r * gap / 2 + look.x * r * 0.35, y: c.y + look.y * r * 0.35 };
    if (x) {
      paper.line([{ x: e.x - r, y: e.y - r }, { x: e.x + r, y: e.y + r }], ink, r * 0.5);
      paper.line([{ x: e.x - r, y: e.y + r }, { x: e.x + r, y: e.y - r }], ink, r * 0.5);
      continue;
    }
    paper.piece(ellipse(e, r * 0.85, r * Math.max(0.12, open), 14), ink, { seed: seed + 3 + side, tear: 0.3 });
    if (open > 0.5) paper.piece(ellipse({ x: e.x + r * 0.3, y: e.y - r * 0.35 }, r * 0.3, r * 0.3, 8), '#fff8ec', { seed: seed + 5 + side, tear: 0.1 });
  }
}

export type MouthKind = 'smile' | 'open' | 'o' | 'frown' | 'flat';

/** A cartoon mouth `w` wide at `c`. */
export function mouth(paper: Paper, c: V, w: number, kind: MouthKind, seed = 0, ink = INK): void {
  if (kind === 'smile') paper.tube([{ x: c.x - w, y: c.y - w * 0.25 }, { x: c.x, y: c.y + w * 0.35 }, { x: c.x + w, y: c.y - w * 0.25 }], w * 0.32, w * 0.32, ink, { seed, tear: 0.3 });
  else if (kind === 'frown') paper.tube([{ x: c.x - w, y: c.y + w * 0.3 }, { x: c.x, y: c.y - w * 0.25 }, { x: c.x + w, y: c.y + w * 0.3 }], w * 0.32, w * 0.32, ink, { seed, tear: 0.3 });
  else if (kind === 'flat') paper.tube([{ x: c.x - w * 0.8, y: c.y }, { x: c.x + w * 0.8, y: c.y }], w * 0.3, w * 0.3, ink, { seed, tear: 0.3 });
  else if (kind === 'o') paper.piece(ellipse(c, w * 0.45, w * 0.55, 14), ink, { seed, tear: 0.3 });
  else {
    const arc = Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * Math.PI; return { x: c.x + Math.cos(a) * w, y: c.y - w * 0.2 + Math.sin(a) * w * 0.9 }; });
    paper.piece(arc, ink, { seed, tear: 0.3 });
    paper.piece(ellipse({ x: c.x, y: c.y + w * 0.4 }, w * 0.5, w * 0.28, 12), '#ec6f5f', { seed: seed + 1, tear: 0.2 });
  }
}

/** A four-pointed sparkle. */
export function sparkle(paper: Paper, c: V, r: number, color: string, seed: number): void {
  const pts: V[] = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 2, k = i % 2 ? 0.3 : 1; pts.push({ x: c.x + Math.cos(a) * r * k, y: c.y + Math.sin(a) * r * k }); }
  paper.piece(pts, color, { seed, tear: 0.3, shadow: 3 });
}

/** A soft puff of smoke or steam, rising and fading over its life `u` (0…1). */
export function puff(paper: Paper, c: V, r: number, u: number, color: string, seed: number): void {
  if (u <= 0 || u >= 1) return;
  paper.layer(0.85 * (1 - u), () => {
    for (let i = 0; i < 3; i++) paper.piece(ellipse({ x: c.x + (i - 1) * r * 0.55, y: c.y - Math.abs(i - 1) * r * 0.25 }, r * (0.55 + 0.5 * u), r * (0.5 + 0.45 * u), 16), color, { seed: seed + i, tear: r * 0.06, shadow: 0 });
  });
}

/**
 * Fires each moment exactly once. Testing `t - dt < at` looks right but drifts in floating point, so a cue can
 * fire on two consecutive steps; this compares against the previous step's time instead.
 *
 * @example
 * // Not `clock`: Stage already has a private member by that name.
 * private readonly moments = new CueClock();
 * update(t) { this.moments.step(t); if (this.moments.passed(3.2)) this.cue('pop'); }
 */
export class CueClock {
  private last = -Infinity;
  private now = -Infinity;

  /** Call once at the start of every update with the scene time. */
  step(t: number): void { this.last = this.now; this.now = t; }

  /** True on the one step the clock first reaches `at`. A moment at 0 falls in the pre-roll, where cues are dropped. */
  passed(at: number): boolean { return this.now >= at && this.last < at; }
}
