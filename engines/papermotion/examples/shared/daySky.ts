import { type Paper, circlePoly, clamp, lerp, smoothstep } from '../../src';
import { card } from './kit';

/** The look of one time of day: sky (top, middle, horizon), the sun on screen and its colour, the sea and two hill ranges. */
export interface DayKey {
  sky: [string, string, string];
  sun: { x: number; y: number; r: number };
  sunColor: string;
  sea: string;
  hills: [string, string];
}

/** Morning, noon, afternoon, golden hour and sunset, for a 1920 × 1080 frame with the horizon near y = 668. */
export const DAY: DayKey[] = [
  { sky: ['#8ec3ea', '#bfe0f2', '#fbeed6'], sun: { x: 360, y: 250, r: 58 }, sunColor: '#fff3cf', sea: '#8db8cf', hills: ['#a9bfd0', '#8fa9bf'] },
  { sky: ['#6aaee8', '#a7d5f2', '#e4f2f4'], sun: { x: 900, y: 130, r: 54 }, sunColor: '#fffbe8', sea: '#7eb1cf', hills: ['#a3bccf', '#87a3bb'] },
  { sky: ['#78acdd', '#b3d2ea', '#f5e6c6'], sun: { x: 1420, y: 200, r: 58 }, sunColor: '#fff0c2', sea: '#86afc7', hills: ['#a6b8c9', '#8a9fb4'] },
  { sky: ['#7c95c4', '#d6b4a2', '#f8cd91'], sun: { x: 1640, y: 380, r: 70 }, sunColor: '#ffd98f', sea: '#9aa9b8', hills: ['#a69fb3', '#8b86a0'] },
  { sky: ['#2e3d71', '#b5647c', '#f5a152'], sun: { x: 1260, y: 616, r: 100 }, sunColor: '#ff9a52', sea: '#8c6c86', hills: ['#6d5f88', '#57507a'] },
];

const channels = (hex: string): number[] => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`mixHex needs #rrggbb colours, got ${hex}`);
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
};

/** Blend two `#rrggbb` colours; `u` 0 gives `a`, 1 gives `b`. */
export function mixHex(a: string, b: string, u: number): string {
  const p = channels(a), q = channels(b), k = clamp(u);
  return '#' + p.map((v, i) => Math.round(lerp(v, q[i], k)).toString(16).padStart(2, '0')).join('');
}

/**
 * The day at `d`: 0 is the first key, 1 the second and so on; between keys every colour and the sun's place and
 * size blend smoothly. Drive `d` from how far the story has come (the camera's x, or time) so the sky changes
 * as the character travels.
 */
export function dayAt(d: number, keys: readonly DayKey[] = DAY): DayKey {
  const i = Math.min(keys.length - 2, Math.max(0, Math.floor(d))), u = smoothstep(0, 1, clamp(d - i)), a = keys[i], b = keys[i + 1];
  return {
    sky: a.sky.map((c, k) => mixHex(c, b.sky[k], u)) as DayKey['sky'],
    sun: { x: lerp(a.sun.x, b.sun.x, u), y: lerp(a.sun.y, b.sun.y, u), r: lerp(a.sun.r, b.sun.r, u) },
    sunColor: mixHex(a.sunColor, b.sunColor, u),
    sea: mixHex(a.sea, b.sea, u),
    hills: a.hills.map((c, k) => mixHex(c, b.hills[k], u)) as DayKey['hills'],
  };
}

/** Fill the frame with the day's sky: top to horizon. */
export function paintSky(ctx: CanvasRenderingContext2D, day: DayKey, horizon = 668): void {
  const g = ctx.createLinearGradient(0, 0, 0, horizon + 40);
  g.addColorStop(0, day.sky[0]);
  g.addColorStop(0.55, day.sky[1]);
  g.addColorStop(1, day.sky[2]);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/** The sun as a paper disc with a soft glow, in screen space. Draw it after the sky and before the far hills. */
export function paintSun(paper: Paper, day: DayKey): void {
  const g = paper.context, s = day.sun, glow = g.createRadialGradient(s.x, s.y, s.r * 0.6, s.x, s.y, s.r * 4.5);
  glow.addColorStop(0, day.sunColor + 'aa');
  glow.addColorStop(1, day.sunColor + '00');
  g.save();
  g.fillStyle = glow;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  g.restore();
  card(paper, () => paper.piece(circlePoly(s, s.r, 40), day.sunColor, { seed: 800, tear: 1.2 }), { shadow: 0, edge: false, texture: 0.12 });
}

/**
 * Draw something and wash it in a colour, on it only (clouds blush at sunset, a set goes blue at night).
 * `alpha` is how strongly.
 */
export function tinted(paper: Paper, color: string, alpha: number, draw: () => void): void {
  paper.layer(1, () => {
    draw();
    if (alpha <= 0) return;
    const g = paper.context;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(0, 0, g.canvas.width, g.canvas.height);
    g.restore();
  });
}
