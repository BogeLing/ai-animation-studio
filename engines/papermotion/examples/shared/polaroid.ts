import { Paper, type V, circlePoly, lerp, wash } from '../../src';
import { box, card, place, rrect } from './kit';

/** Where a photo is on screen: centre, scale (1 = 240 × 280 px) and turn. */
export interface PhotoPose { at: V; scale: number; angle: number }

export interface PolaroidOpts {
  /** Handwritten-style line on the thick bottom edge. */
  label?: string;
  labelFont?: string;
  /** Size of the picture's own canvas; it is drawn into a 212 × 159 window. */
  resolution?: [number, number];
  seed?: number;
  /** A colour laid over the picture with `multiply` (warmth, age); omit for none. */
  wash?: string;
}

/**
 * An instant photo: a white paper frame with a thicker bottom edge and a picture drawn by `picture` into its
 * own canvas, once, the first time it is shown. A photo doesn't boil like the paper around it, and drawing
 * the picture once keeps it cheap however often the photo is drawn. `picture` gets a fresh `Paper` on that
 * canvas and its size, so it can reuse the same props as the set, scaled down.
 *
 * @example
 * const shot = new Polaroid((paper, w, h) => { sky(paper, w, h); place(paper, w / 2, h * 0.86, 0.5, 0, () => lighthouse(paper, 0)); }, { label: 'Lighthouse' });
 * shot.draw(this.paper, between(inHand, shown, k));
 */
export class Polaroid {
  private image: HTMLCanvasElement | null = null;

  constructor(readonly picture: (paper: Paper, width: number, height: number) => void, readonly o: PolaroidOpts = {}) {}

  private render(): HTMLCanvasElement {
    if (this.image) return this.image;
    const [w, h] = this.o.resolution ?? [640, 480], c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    this.picture(new Paper(g), w, h);
    if (this.o.wash) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = this.o.wash;
      g.fillRect(0, 0, w, h);
    }
    return (this.image = c);
  }

  draw(paper: Paper, pose: PhotoPose): void {
    if (pose.scale <= 0.01) return;
    place(paper, pose.at.x, pose.at.y, pose.scale, pose.angle, () => {
      card(paper, () => paper.piece(rrect(-120, -140, 120, 140, 4), '#fbf8f1', { seed: 1100 + (this.o.seed ?? 0), tear: 0.8 }), { shadow: 14, rim: { color: '#ffffff', width: 2.5 } });
      const g = paper.context;
      g.drawImage(this.render(), -106, -126, 212, 159);
      g.strokeStyle = 'rgba(60, 50, 40, 0.25)';
      g.lineWidth = 1.5;
      g.strokeRect(-106, -126, 212, 159);
      if (this.o.label) paper.text(this.o.label, { x: 0, y: 92 }, { font: this.o.labelFont ?? '700 26px Montserrat', color: '#4a4540', align: 'center', sheet: { shadow: 0, edge: false, texture: 0 } });
    });
  }
}

/** Blend two poses by `k` (0…1), lifting the photo by `arc` px at the middle of the way. */
export function between(a: PhotoPose, b: PhotoPose, k: number, arc = 40): PhotoPose {
  return { at: { x: lerp(a.at.x, b.at.x, k), y: lerp(a.at.y, b.at.y, k) - Math.sin(k * Math.PI) * arc }, scale: lerp(a.scale, b.scale, k), angle: lerp(a.angle, b.angle, k) };
}

/** The i-th photo in a small stack in a corner (top right by default), each a little offset and turned. */
export function stackPose(i: number, corner: V = { x: 1745, y: 128 }, scale = 0.42): PhotoPose {
  return { at: { x: corner.x + i * 10, y: corner.y + i * 12 }, scale, angle: i % 2 ? 0.1 : -0.08 };
}

/** The i-th of `n` photos fanned out in an album row across the frame. */
export function albumPose(i: number, n: number, y = 318, spacing = 300, width = 1920): PhotoPose {
  const turns = [-0.08, 0.05, -0.03, 0.07, -0.05, 0.04];
  return { at: { x: width / 2 + (i - (n - 1) / 2) * spacing, y: y + (i % 2 ? 16 : -8) }, scale: 1, angle: turns[i % turns.length] };
}

/** A small camera held up to take the photo, centred on `at` (60 × 40 px at scale 1). */
export function handCamera(paper: Paper, at: V, angle = -0.25, scale = 1): void {
  if (scale <= 0.01) return;
  place(paper, at.x, at.y, scale, angle, () => card(paper, () => {
    paper.piece(rrect(-30, -20, 30, 20, 6), '#3b3f45', { seed: 7700, tear: 0.4 });
    paper.piece(rrect(-24, -28, -6, -18, 3), '#3b3f45', { seed: 7701, tear: 0.3 });
    paper.inside(() => {
      paper.piece(circlePoly({ x: 6, y: 0 }, 13, 16), '#1f2328', { seed: 7702, tear: 0.2 });
      paper.piece(circlePoly({ x: 6, y: 0 }, 7, 12), '#5d7a93', { seed: 7703, tear: 0.2 });
      paper.piece(box(18, -16, 26, -11), '#f0e6d2', { seed: 7704, tear: 0.1 });
    });
  }, { shadow: 5, rim: { color: '#8a929c', width: 2 } }));
}

/** The flash: a quick white-out of the frame that fades over `length` s from `at`. Draw it last. */
export function flash(ctx: CanvasRenderingContext2D, t: number, at: number, strength = 0.45, length = 0.18): void {
  const u = t - at;
  if (u >= 0 && u <= length) wash(ctx, '#ffffff', strength * (1 - u / length));
}
