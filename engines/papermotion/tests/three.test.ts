import { describe, expect, it } from 'vitest';
import { dot3, normal3, panel, sub3 } from '../src';
import { faceGeometry, facePlane, tornOutline } from '../src/three';

const wall = panel([{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }, { x: -1, y: 2 }], { x: 3, y: 0, z: -2 }, 0.6);

describe('three.js faces', () => {
  it('lays a face out in its own plane, u level where it can be, n its normal', () => {
    const { u, v, n } = facePlane(wall);
    expect(u.y).toBeCloseTo(0, 9);
    expect(dot3(n, normal3(wall))).toBeCloseTo(1, 9);
    expect(dot3(u, v)).toBeCloseTo(0, 9);
    const floor = facePlane([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }]);
    expect(floor.n.y).toBeCloseTo(1, 9);
  });

  it('tears an outline within `tear` of the cut, the same way each time and differently each boil', () => {
    const square = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
    const a = tornOutline(square, 7, 0.05), b = tornOutline(square, 7, 0.05), c = tornOutline(square, 7, 0.05, 1);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.length).toBeGreaterThan(100);
    for (const p of a) {
      const off = Math.min(Math.abs(p.x), Math.abs(p.x - 2), Math.abs(p.y), Math.abs(p.y - 2));
      expect(off).toBeLessThanOrEqual(0.05 + 1e-9);
    }
  });

  it('fills a face in its plane, facing the way the face faces, with a torn edge around it', () => {
    const { fill, edge, plane } = faceGeometry(wall, 3, 0.02);
    const pos = fill.getAttribute('position'), nor = fill.getAttribute('normal');
    for (let i = 0; i < pos.count; i += 17) {
      const p = { x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) };
      expect(Math.abs(dot3(sub3(p, plane.o), plane.n))).toBeLessThan(1e-6);
      expect(dot3({ x: nor.getX(i), y: nor.getY(i), z: nor.getZ(i) }, plane.n)).toBeCloseTo(1, 6);
    }
    expect(edge.length).toBeGreaterThan(100);
    expect(fill.index!.count / 3).toBeGreaterThan(edge.length - 3);
  });
});
