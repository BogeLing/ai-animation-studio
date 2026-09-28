import { describe, expect, it } from 'vitest';
import { Camera, DepthCamera } from '../src';

const opts = { width: 1920, height: 1080, handheld: 0 };
const apply = (m: number[], p: { x: number; y: number }) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });

describe('DepthCamera', () => {
  it('frames every layer as Camera does when it neither orbits nor cranes (zoom 1), and the action plane at any zoom', () => {
    const flat = new Camera(1300, opts), deep = new DepthCamera(1300, opts);
    for (const c of [flat, deep]) c.cut({ x: 1300, y: 640, zoom: 1 });
    for (const depth of [0.15, 0.55, 1, 1.35]) for (const p of [{ x: 200, y: 300 }, { x: 1700, y: 900 }]) {
      const a = flat.toScreen(p, depth), b = deep.toScreen(p, depth);
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.y).toBeCloseTo(a.y, 6);
    }
    for (const c of [flat, deep]) c.cut({ x: 1300, y: 640, zoom: 1.8 });
    const a = flat.toScreen({ x: 900, y: 500 }), b = deep.toScreen({ x: 900, y: 500 });
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
  });

  it('draws a squarely faced layer through its exact map, and says which part of it is in view', () => {
    const deep = new DepthCamera(900, opts);
    deep.cut({ x: 900, y: 600, zoom: 1.4 });
    const { m, view } = deep.fit(0.3)!, p = { x: 1000, y: 700 }, q = deep.toScreen(p, 0.3), r = apply(m, p);
    expect(r.x).toBeCloseTo(q.x, 6);
    expect(r.y).toBeCloseTo(q.y, 6);
    const corner = apply(m, { x: view.from + 50, y: view.top + 50 });
    expect(corner.x).toBeCloseTo(0, 3);
    expect(corner.y).toBeCloseTo(0, 3);
  });

  it('keeps the framed point in the middle as it orbits, sliding far sheets one way and near ones the other', () => {
    const deep = new DepthCamera(960, opts, { orbit: () => 6, crane: () => 3 });
    deep.cut({ x: 960, y: 540, zoom: 1 });
    const mid = deep.toScreen({ x: 960, y: 540 });
    expect(mid.x).toBeCloseTo(960, 6);
    expect(mid.y).toBeCloseTo(540, 6);
    expect(deep.toScreen({ x: 960, y: 540 }, 0.2).x).toBeGreaterThan(1000);
    expect(deep.toScreen({ x: 960, y: 540 }, 1.35).x).toBeLessThan(940);
    // The map a layer is drawn with is the true perspective at the middle of the frame, and close to it around.
    const lens = deep.perspective, truth = (p: { x: number; y: number }) => lens.project({ x: (p.x - 960) * 10 / lens.focal, y: (540 - p.y) * 10 / lens.focal, z: 0 });
    const q = truth({ x: 1100, y: 600 }), r = apply(deep.fit(1)!.m, { x: 1100, y: 600 });
    expect(Math.hypot(r.x - q.x, r.y - q.y)).toBeLessThan(1);
  });

  it('turns the sky (depth 0) with the lens but never moves it with the camera', () => {
    const deep = new DepthCamera(960, opts, { orbit: t => t });
    deep.cut({ x: 960, y: 540, zoom: 1 });
    expect(deep.toScreen({ x: 1500, y: 200 }, 0).x).toBeCloseTo(1500, 6);
    deep.frame({ x: 2400, y: 540, zoom: 1.6 }, 1 / 60, 0);
    expect(deep.toScreen({ x: 1500, y: 200 }, 0).x).toBeCloseTo(1500, 6);
    deep.frame({ x: 2400, y: 540, zoom: 1.6 }, 1 / 60, 5);
    const sun = deep.toScreen({ x: 1500, y: 200 }, 0), hills = deep.toScreen({ x: 1500, y: 200 }, 0.1);
    expect(sun.x).toBeGreaterThan(1500 + 4320 * Math.tan((4.5 * Math.PI) / 180));
    expect(sun.x).toBeGreaterThan(hills.x);
  });

  it('skips a sheet the lens has passed', () => {
    const deep = new DepthCamera(960, opts);
    deep.cut({ x: 960, y: 540, zoom: 5 });
    expect(deep.fit(1.35)).toBeNull();
    expect(deep.fit(1)).not.toBeNull();
  });
});
