import { describe, expect, it } from 'vitest';
import { Camera3D, Diorama, type Face, billboard, centroid3, crossing, dot3, groundPoly, normal3, panel, prism, sub3 } from '../src';

const HOUSE = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }, { x: 0, y: 3 }, { x: -1, y: 2 }];
const brightness = (css: string) => css.match(/\d+/g)!.map(Number).reduce((a, b) => a + b, 0);

describe('diorama solids', () => {
  it('winds every face of a prism outward, whichever way the outline was drawn', () => {
    for (const outline of [HOUSE, [...HOUSE].reverse()]) {
      const faces = prism(outline, 2, { x: 3, y: 0, z: -2 }, 0.7, { color: '#ffffff', seed: 1 }), middle = centroid3(faces.flatMap(f => f.pts));
      expect(faces).toHaveLength(7);
      for (const f of faces) expect(dot3(normal3(f.pts), sub3(centroid3(f.pts), middle))).toBeGreaterThan(0);
    }
  });

  it('colours each side by the outline edge it runs along', () => {
    const roofs = (outline: typeof HOUSE, edges: number[]) => prism(outline, 2, { x: 0, y: 0, z: 0 }, 0, { color: '#ffffff', seed: 1, sides: i => (edges.includes(i) ? '#aa0000' : '#ffffff') })
      .filter(f => f.color === '#aa0000').map(f => normal3(f.pts).y);
    for (const up of roofs(HOUSE, [2, 3])) expect(up).toBeGreaterThan(0.5);
    for (const up of roofs([...HOUSE].reverse(), [0, 1])) expect(up).toBeGreaterThan(0.5);
  });

  it('stands a panel up at tilt 0, lays it flat face up at −π/2, and turns it with yaw', () => {
    const square = [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }, { x: -1, y: 2 }], at = { x: 0, y: 0, z: 0 };
    expect(normal3(panel(square, at)).z).toBeCloseTo(1, 9);
    expect(normal3(panel(square, at, 0, -Math.PI / 2)).y).toBeCloseTo(1, 9);
    expect(normal3(panel(square, at, Math.PI / 2)).x).toBeCloseTo(1, 9);
  });

  it('lays ground polygons face up whichever way they were drawn', () => {
    const tri = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(normal3(groundPoly(tri)).y).toBeCloseTo(1, 9);
    expect(normal3(groundPoly([...tri].reverse())).y).toBeCloseTo(1, 9);
  });

  it('finds where a segment crosses a polygon, but not a point lying on it', () => {
    const wall = panel([{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }, { x: -1, y: 2 }], { x: 0, y: 0, z: 0 });
    expect(crossing({ x: 0, y: 1, z: 5 }, { x: 0, y: 1, z: -5 }, wall)).toBeCloseTo(0.5, 9);
    expect(crossing({ x: 3, y: 1, z: 5 }, { x: 3, y: 1, z: -5 }, wall)).toBeNull();
    expect(crossing({ x: 0, y: 1, z: 5 }, { x: 0, y: 1, z: 0 }, wall)).toBeNull();
  });
});

describe('Diorama', () => {
  const cam = new Camera3D(1920, 1080, { pos: { x: 0, y: 1, z: 10 }, target: { x: 0, y: 1, z: 0 }, focal: 1900 });
  const wall: Face = { pts: panel([{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 3 }, { x: -1, y: 3 }], { x: 0, y: 0, z: 4 }), color: '#888888', seed: 1 };

  it('counts the subject points a piece hides; the floor and flat faces hide nothing', () => {
    const set = new Diorama();
    set.pieces.push({ faces: [wall] });
    set.floor.push({ pts: groundPoly([{ x: -9, y: -9 }, { x: 9, y: -9 }, { x: 9, y: 9 }, { x: -9, y: 9 }]), color: '#669944', seed: 2 });
    expect(set.visible(billboard({ x: 0, y: 0, z: 0 }, 1, 1.2, cam.pos), cam)).toBe(0);
    expect(set.visible(billboard({ x: 5, y: 0, z: 0 }, 1, 1.2, cam.pos), cam)).toBe(1);
    set.pieces[0].faces[0] = { ...wall, flat: true };
    expect(set.visible(billboard({ x: 0, y: 0, z: 0 }, 1, 1.2, cam.pos), cam)).toBe(1);
  });

  it('reads a piece hugging the lens as clutter', () => {
    const set = new Diorama();
    set.pieces.push({ faces: [{ pts: panel([{ x: -3, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 6 }, { x: -3, y: 6 }], { x: 0, y: -2, z: 8 }), color: '#888888', seed: 3 }] });
    const c = set.clutter(cam);
    expect(c.nearest).toBeCloseTo(2, 6);
    expect(c.close).toBe(1);
    expect(new Diorama().clutter(cam)).toEqual({ nearest: Infinity, close: 0 });
  });

  it('judges a view: how much of the subject shows, how big, where, and whether it stays in frame', () => {
    const set = new Diorama(), subject = billboard({ x: 0, y: 0, z: 0 }, 1, 1.2, cam.pos), n = set.judge(cam, subject);
    expect(n).toMatchObject({ visible: 1, inFrame: true, nearest: Infinity, close: 0 });
    expect(n.x).toBeCloseTo(0.5, 6);
    // The samples reach the subject's feet and the top of its head, so the size is the whole subject: 1900 × 1.2 / 10 px.
    expect(n.height).toBeCloseTo((1900 * 1.2) / 10 / 1080, 6);
    const near = new Camera3D(1920, 1080, { pos: { x: 0, y: 0.6, z: 1 }, target: { x: 0, y: 0.6, z: 0 }, focal: 1900 });
    expect(set.judge(near, billboard({ x: 0, y: 0, z: 0 }, 1, 1.2, near.pos)).inFrame).toBe(false);
  });

  it('throws shadows away from the light onto the ground', () => {
    const set = new Diorama({ light: { x: -1, y: 1, z: 0 }, ground: 0.5 }), s = set.onGround({ x: 0, y: 2.5, z: 3 });
    expect(s.x).toBeCloseTo(2, 9);
    expect(s.y).toBeCloseTo(0.51, 9);
    expect(s.z).toBeCloseTo(3, 9);
  });

  it('lights faces turned to the sun, shows a card its back colour from behind, and fades far faces into the air', () => {
    const set = new Diorama({ light: { x: 0, y: 0, z: 1 }, fog: { color: '#ffffff', near: 10, far: 50, max: 1 } });
    const face: Face = { pts: [], color: '#808080', back: '#000000', seed: 1 };
    const lit = brightness(set.tint(face, { x: 0, y: 0, z: 1 }, true, 5)), unlit = brightness(set.tint(face, { x: 0, y: 0, z: -1 }, true, 5));
    expect(lit).toBeGreaterThan(unlit);
    expect(brightness(set.tint(face, { x: 0, y: 0, z: 1 }, false, 5))).toBe(0);
    expect(set.tint(face, { x: 0, y: 0, z: 1 }, true, 60)).toBe('rgb(255, 255, 255)');
  });
});
