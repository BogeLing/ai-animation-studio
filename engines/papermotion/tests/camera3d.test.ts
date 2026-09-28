import { describe, expect, it } from 'vitest';
import { Camera3D, CameraPath, type View3, add3, focalFor, scale3, shot } from '../src';

const W = 1920, H = 1080, frame = { width: W, height: H };

describe('Camera3D', () => {
  const cam = new Camera3D(W, H, { pos: { x: 0, y: 0, z: 10 }, target: { x: 0, y: 0, z: 0 }, focal: 1000 });

  it('projects the target to the centre and scales by focal length over depth', () => {
    expect(cam.project({ x: 0, y: 0, z: 0 })).toMatchObject({ x: 960, y: 540, depth: 10, scale: 100 });
    const p = cam.project({ x: 1, y: 1, z: 0 });
    expect(p.x).toBeCloseTo(1060, 9);
    expect(p.y).toBeCloseTo(440, 9);
  });

  it('clips polygons at the near plane and drops those wholly behind the lens', () => {
    expect(cam.polygon([{ x: -1, y: 0, z: 11 }, { x: 1, y: 0, z: 11 }, { x: 0, y: 1, z: 12 }])).toBeNull();
    const floor = cam.polygon([{ x: -1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: 1, y: -1, z: 30 }, { x: -1, y: -1, z: 30 }])!;
    expect(floor.length).toBe(4);
    expect(floor.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('trims projected polygons to the frame plus a margin, so a floor running behind the lens stays small', () => {
    const low = new Camera3D(W, H, { pos: { x: 0, y: 1.5, z: 0 }, target: { x: 0, y: 1, z: -10 }, focal: 1900 });
    const floor = low.polygon([{ x: -30, y: 0, z: -30 }, { x: 30, y: 0, z: -30 }, { x: 30, y: 0, z: 30 }, { x: -30, y: 0, z: 30 }])!;
    for (const p of floor) {
      expect(p.x).toBeGreaterThanOrEqual(-200 - 1e-6);
      expect(p.x).toBeLessThanOrEqual(W + 200 + 1e-6);
      expect(p.y).toBeLessThanOrEqual(H + 200 + 1e-6);
    }
    expect(low.polygon([{ x: 50, y: 0, z: -5 }, { x: 60, y: 0, z: -5 }, { x: 55, y: 1, z: -5 }])).toBeNull();
  });

  it('casts rays that land back on the pixel they came from', () => {
    const p = cam.project(add3(cam.pos, scale3(cam.ray(300, 200), 7)));
    expect(p.x).toBeCloseTo(300, 6);
    expect(p.y).toBeCloseTo(200, 6);
  });

  it('puts the horizon above the centre when looking down, and tips it down to the right with positive roll', () => {
    const down = new Camera3D(W, H, { pos: { x: 0, y: 5, z: 10 }, target: { x: 0, y: 0, z: 0 }, focal: 1000 });
    expect(down.horizon()).toBeCloseTo(540 - 1000 * 0.5, 6);
    const rolled = new Camera3D(W, H, { ...down.view, roll: 0.2 });
    expect(rolled.horizon(1800)).toBeGreaterThan(rolled.horizon(100));
    const far = rolled.project(add3(rolled.pos, { x: 3e5, y: 0, z: -1e6 }));
    expect(far.y).toBeCloseTo(rolled.horizon(far.x), 1);
  });

  it('projects a direction at infinity where very far points along it land', () => {
    const d = { x: -0.4, y: 0.6, z: -0.7 }, p = cam.direction(d)!, q = cam.project(add3(cam.pos, scale3(d, 1e7)));
    expect(p.x).toBeCloseTo(q.x, 3);
    expect(p.y).toBeCloseTo(q.y, 3);
    expect(cam.direction({ x: 0, y: 0, z: 1 })).toBeNull();
  });

  it('turns a field of view into a focal length and back', () => {
    expect((new Camera3D(W, H, { pos: { x: 0, y: 0, z: 1 }, target: { x: 0, y: 0, z: 0 }, focal: focalFor(40, H) }).fov * 180) / Math.PI).toBeCloseTo(40, 9);
  });
});

describe('shot', () => {
  const hero = { at: { x: 2, y: 0, z: -3 }, height: 1.2, facing: 0.4 };

  it('sizes the subject to the asked share of the frame', () => {
    for (const size of [0.14, 0.3, 0.55] as const) {
      const cam = new Camera3D(W, H, shot(hero, { size, bearing: -30, elevation: 0 }, frame));
      expect((cam.project(hero.at).y - cam.project({ ...hero.at, y: 1.2 }).y) / H).toBeCloseTo(size, 6);
    }
  });

  it('stands at the bearing around the subject, counted from the way it faces, and at the elevation above it', () => {
    const v = shot(hero, { size: 'medium', bearing: 90, elevation: 20 }, frame), d = { x: v.pos.x - v.target.x, y: v.pos.y - v.target.y, z: v.pos.z - v.target.z };
    expect(Math.atan2(d.x, d.z)).toBeCloseTo(hero.facing + Math.PI / 2, 9);
    expect(Math.atan2(d.y, Math.hypot(d.x, d.z))).toBeCloseTo((20 * Math.PI) / 180, 9);
  });

  it('puts the aim point where it is asked to on screen', () => {
    const v = shot(hero, { size: 'full', bearing: -20, elevation: 12, roll: 0.05, place: { x: 0.33, y: 0.62 } }, frame);
    const p = new Camera3D(W, H, v).project({ ...hero.at, y: 0.6 });
    expect(p.x).toBeCloseTo(0.33 * W, 1);
    expect(p.y).toBeCloseTo(0.62 * H, 1);
  });

  it('frames the upper part of the subject in a close shot', () => {
    const cam = new Camera3D(W, H, shot(hero, { size: 'close' }, frame));
    expect(cam.project({ ...hero.at, y: 0.72 * 1.2 }).y).toBeCloseTo(H / 2, 6);
  });
});

describe('CameraPath', () => {
  const view = (x: number, focal = 1900): View3 => ({ pos: { x, y: 2, z: 10 }, target: { x, y: 1, z: 0 }, focal });
  const path = new CameraPath([{ at: 0, view: view(0) }, { at: 2, view: view(4, 2400) }, { at: 5, view: view(6) }]);

  it('passes every key exactly at its time and holds outside them', () => {
    expect(path.at(2).pos.x).toBeCloseTo(4, 9);
    expect(path.at(2).focal).toBeCloseTo(2400, 6);
    expect(path.at(-1)).toEqual(path.at(0));
    expect(path.at(9).pos.x).toBeCloseTo(6, 9);
  });

  it('starts and ends at rest, and never jumps in speed through a key', () => {
    expect(path.motion(0, 1e-3).speed).toBeLessThan(0.01);
    expect(path.motion(5 - 1e-3, 1e-3).speed).toBeLessThan(0.01);
    const before = path.motion(2 - 1e-3, 1e-4).speed, after = path.motion(2 + 1e-3, 1e-4).speed;
    expect(before).toBeGreaterThan(0.5);
    expect(Math.abs(before - after) / before).toBeLessThan(0.02);
  });

  it('stops at a hold key', () => {
    const held = new CameraPath([{ at: 0, view: view(0) }, { at: 2, view: view(4), hold: true }, { at: 5, view: view(6) }]);
    expect(held.motion(2, 1e-4).speed).toBeLessThan(0.01);
    expect(held.motion(1, 1e-3).speed).toBeGreaterThan(0.5);
  });

  it('zooms evenly in log space and measures turns in degrees per second', () => {
    expect(new CameraPath([{ at: 0, view: view(0, 1000) }, { at: 1, view: view(0, 4000) }]).at(0.5).focal).toBeCloseTo(2000, 6);
    const pan = new CameraPath([
      { at: 0, view: { pos: { x: 0, y: 1, z: 0 }, target: { x: -1, y: 1, z: -1 }, focal: 1900 } },
      { at: 1, view: { pos: { x: 0, y: 1, z: 0 }, target: { x: 1, y: 1, z: -1 }, focal: 1900 } },
    ]);
    expect(pan.motion(0.5, 1e-4).turn).toBeGreaterThan(90);
    expect(pan.motion(0.5, 1e-4).speed).toBe(0);
  });

  it('rejects an empty path and two keys at one time', () => {
    expect(() => new CameraPath([])).toThrow();
    expect(() => new CameraPath([{ at: 1, view: view(0) }, { at: 1, view: view(1) }])).toThrow();
  });
});
