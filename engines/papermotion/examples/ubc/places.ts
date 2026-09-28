import { type Paper, type V, circlePoly } from '../../src';
import { box, card, ellipse } from '../shared/kit';

/** The ground line of the action plane (Clawd's feet). */
export const G = 860;
const INK = '#2b2521';

/** A lancet window: a tall slot with a pointed top. */
function lancet(x: number, y0: number, y1: number, w: number): V[] {
  const pts: V[] = [{ x: x - w / 2, y: y1 }, { x: x - w / 2, y: y0 + w * 0.6 }];
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI + (i / 6) * (Math.PI / 2), r = w * 0.95;
    pts.push({ x: x + w / 2 + Math.cos(a) * r, y: y0 + w * 0.6 + Math.sin(a) * r * 1.05 });
  }
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2), r = w * 0.95;
    pts.push({ x: x - w / 2 + Math.cos(a) * r, y: y0 + w * 0.6 + Math.sin(a) * r * 1.05 });
  }
  pts.push({ x: x + w / 2, y: y1 });
  return pts;
}

/** A row of battlements along the top of a wall from x0 to x1 at height `top`. */
function crenels(x0: number, x1: number, top: number, merlon = 22, gap = 16, h = 20): V[] {
  const pts: V[] = [{ x: x0, y: top + 30 }, { x: x0, y: top }];
  for (let x = x0; x < x1 - 1; x += merlon + gap) {
    const e = Math.min(x1, x + merlon);
    pts.push({ x, y: top - h }, { x: e, y: top - h }, { x: e, y: top });
    if (e + gap < x1) pts.push({ x: e + gap, y: top });
  }
  pts.push({ x: x1, y: top }, { x: x1, y: top + 30 });
  return pts;
}

/**
 * The Ladner Clock Tower on Main Mall: a slender concrete shaft with ribbed faces, a clock near the top and an
 * open belfry for the carillon. `hands` turns the clock (rad of the minute hand).
 */
export function clockTower(paper: Paper, x: number, hands = 0.55): void {
  const stone = '#d4ccbf', shade = '#bdb4a6', top = G - 600;
  card(paper, () => {
    paper.piece(box(x - 70, G - 26, x + 70, G), '#c6bdb0', { seed: 7000, tear: 0.8 });
    paper.piece(box(x - 38, G - 470, x + 38, G - 20), stone, { seed: 7001, tear: 0.8 });
    paper.piece(box(x - 48, G - 560, x + 48, G - 462), stone, { seed: 7002, tear: 0.8 });
    // The open belfry: four slender posts under a flat cap.
    for (const px of [-44, -16, 16, 44]) paper.piece(box(x + px - 5, top + 20, x + px + 5, G - 556), stone, { seed: 7003 + px, tear: 0.4 });
    paper.piece(box(x - 56, top, x + 56, top + 22), stone, { seed: 7010, tear: 0.6 });
    paper.inside(() => {
      for (const rx of [-22, -8, 8, 22]) paper.piece(box(x + rx - 2, G - 460, x + rx + 2, G - 30), shade, { seed: 7011 + rx, tear: 0.3 });
      paper.piece(box(x - 50, G - 470, x + 50, G - 462), shade, { seed: 7020, tear: 0.4 });
      paper.piece(box(x - 36, G - 548, x + 36, G - 540), shade, { seed: 7021, tear: 0.3 });
    });
  }, { shadow: 12, rim: { color: '#fff7ea', width: 3 } });
  card(paper, () => {
    paper.piece(circlePoly({ x, y: G - 505 }, 32, 30), '#fbf7ee', { seed: 7030, tear: 0.5 });
    paper.inside(() => {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        paper.piece(circlePoly({ x: x + Math.cos(a) * 25, y: G - 505 + Math.sin(a) * 25 }, 2.4, 8), INK, { seed: 7031 + i, tear: 0.1, shadow: 0, edge: false });
      }
    });
  }, { shadow: 5 });
  const c = { x, y: G - 505 };
  paper.line([c, { x: c.x + Math.sin(hands) * 22, y: c.y - Math.cos(hands) * 22 }], INK, 3.5);
  paper.line([c, { x: c.x + Math.sin(hands / 12 + 5.2) * 14, y: c.y - Math.cos(hands / 12 + 5.2) * 14 }], INK, 4.5);
}

/**
 * The Irving K. Barber Learning Centre: the 1925 Collegiate Gothic library (granite, battlements, a tall
 * pointed window over the arched door) with the glass wing added beside it.
 */
export function ikb(paper: Paper, x: number): void {
  const stone = '#cdc5b6', light = '#d9d2c4', win = '#56657a';
  // The modern glass wing on the right, behind the old facade's end.
  card(paper, () => {
    paper.piece(box(x + 330, G - 262, x + 540, G), '#a9c6d6', { seed: 7100, tear: 0.8 });
    paper.piece(box(x + 320, G - 282, x + 550, G - 258), '#e8e6e0', { seed: 7101, tear: 0.6 });
    paper.inside(() => {
      for (let gx = x + 368; gx < x + 540; gx += 46) paper.piece(box(gx - 2, G - 258, gx + 2, G), '#e8e6e0', { seed: 7102 + gx, tear: 0.2 });
      paper.piece(box(x + 330, G - 140, x + 540, G - 134), '#e8e6e0', { seed: 7103, tear: 0.2 });
      for (let i = 0; i < 3; i++) paper.piece([{ x: x + 350 + i * 80, y: G - 258 }, { x: x + 380 + i * 80, y: G - 258 }, { x: x + 330 + i * 80, y: G }, { x: x + 300 + i * 80, y: G }], 'rgba(255, 255, 255, 0.25)', { seed: 7104 + i, tear: 0.2, shadow: 0, edge: false });
    });
  }, { shadow: 10 });
  // The wings, with their battlements and rows of lancet windows.
  card(paper, () => {
    paper.piece(crenels(x - 380, x + 380, G - 300), stone, { seed: 7110, tear: 0.6 });
    paper.piece(box(x - 380, G - 290, x + 380, G), stone, { seed: 7111, tear: 0.8 });
    paper.inside(() => {
      for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
        const wx = x + side * (160 + i * 55);
        paper.piece(lancet(wx, G - 250, G - 170, 22), win, { seed: 7120 + side * 10 + i, tear: 0.3 });
        paper.piece(lancet(wx, G - 130, G - 50, 22), win, { seed: 7140 + side * 10 + i, tear: 0.3 });
      }
      paper.piece(box(x - 380, G - 150, x + 380, G - 142), '#bdb5a6', { seed: 7160, tear: 0.3 });
      paper.piece(box(x - 380, G - 22, x + 380, G), '#bdb5a6', { seed: 7161, tear: 0.4 });
    });
  }, { shadow: 12, rim: { color: '#fff7ea', width: 3 } });
  // The central bay rises higher, with corner pinnacles, the great window and the door.
  card(paper, () => {
    paper.piece(crenels(x - 118, x + 118, G - 432, 20, 14, 18), light, { seed: 7170, tear: 0.5 });
    paper.piece(box(x - 118, G - 424, x + 118, G), light, { seed: 7171, tear: 0.8 });
    for (const px of [-118, 118]) paper.piece([{ x: x + px - 16, y: G - 400 }, { x: x + px - 16, y: G - 470 }, { x: x + px, y: G - 500 }, { x: x + px + 16, y: G - 470 }, { x: x + px + 16, y: G - 400 }], light, { seed: 7172 + px, tear: 0.4 });
    paper.inside(() => {
      paper.piece(lancet(x, G - 390, G - 170, 110), win, { seed: 7180, tear: 0.4 });
      for (const mx of [-27, 0, 27]) paper.piece(box(x + mx - 3, G - 330, x + mx + 3, G - 170), light, { seed: 7181 + mx, tear: 0.2 });
      paper.piece(box(x - 55, G - 250, x + 55, G - 244), light, { seed: 7185, tear: 0.2 });
      paper.piece(lancet(x, G - 130, G, 84), '#6e4a33', { seed: 7186, tear: 0.4 });
      paper.piece(box(x - 2, G - 110, x + 2, G), '#4f3322', { seed: 7187, tear: 0.2 });
    });
  }, { shadow: 12, rim: { color: '#fff7ea', width: 3 } });
  card(paper, () => {
    paper.piece(box(x - 130, G - 14, x + 130, G + 4), '#bdb5a6', { seed: 7190, tear: 0.5 });
    paper.piece(box(x - 150, G - 4, x + 150, G + 14), '#b2aa9b', { seed: 7191, tear: 0.5 });
  }, { shadow: 4 });
}

/**
 * The Museum of Anthropology's Great Hall: concrete posts and deep beams stepping up toward the view, with
 * tall glass between them. Tall poles stand inside, seen only as soft silhouettes through the glass.
 */
export function moa(paper: Paper, x: number): void {
  const concrete = '#cbc4b8', dark = '#b4ad9f', glass = '#9fc0cf';
  const frames = [{ dx: -300, h: 300 }, { dx: -150, h: 340 }, { dx: 0, h: 380 }, { dx: 150, h: 420 }, { dx: 300, h: 460 }];
  // The entry block on the left.
  card(paper, () => {
    paper.piece(box(x - 560, G - 170, x - 330, G), concrete, { seed: 7400, tear: 0.8 });
    paper.inside(() => { paper.piece(box(x - 560, G - 178, x - 330, G - 150), dark, { seed: 7401, tear: 0.4 }); paper.piece(box(x - 470, G - 120, x - 400, G), '#6e7f8c', { seed: 7402, tear: 0.4 }); });
  }, { shadow: 10 });
  // Glass, stepping up with the frames, and the poles behind it.
  card(paper, () => {
    const pts: V[] = [{ x: x - 330, y: G }];
    frames.forEach(f => { pts.push({ x: x + f.dx - 75, y: G - f.h + 36 }, { x: x + f.dx + 75, y: G - f.h + 36 }); });
    pts.push({ x: x + 375, y: G });
    paper.piece(pts, glass, { seed: 7410, tear: 0.6 });
    paper.inside(() => {
      const poles = [{ dx: -210, h: 250 }, { dx: -60, h: 300 }, { dx: 90, h: 330 }, { dx: 230, h: 380 }];
      for (const [i, p] of poles.entries()) {
        paper.piece(box(x + p.dx - 17, G - p.h, x + p.dx + 17, G), 'rgba(70, 80, 88, 0.35)', { seed: 7420 + i, tear: 1.2 });
        paper.piece(box(x + p.dx - 34, G - p.h + 40, x + p.dx + 34, G - p.h + 56), 'rgba(70, 80, 88, 0.3)', { seed: 7430 + i, tear: 1 });
      }
      for (let i = 0; i < 6; i++) paper.piece([{ x: x - 300 + i * 120, y: G - 470 }, { x: x - 262 + i * 120, y: G - 470 }, { x: x - 330 + i * 120, y: G }, { x: x - 368 + i * 120, y: G }], 'rgba(255, 255, 255, 0.22)', { seed: 7440 + i, tear: 0.3, shadow: 0, edge: false });
      for (let gy = G - 120; gy > G - 470; gy -= 120) paper.piece(box(x - 340, gy - 2, x + 380, gy + 2), 'rgba(80, 90, 100, 0.35)', { seed: 7450 + gy, tear: 0.1, shadow: 0, edge: false });
    });
  }, { shadow: 6 });
  // The post-and-beam frames.
  card(paper, () => {
    frames.forEach((f, i) => {
      for (const side of [-1, 1]) paper.piece(box(x + f.dx + side * 75 - 16, G - f.h, x + f.dx + side * 75 + 16, G), concrete, { seed: 7460 + i * 2 + (side > 0 ? 1 : 0), tear: 0.5 });
      paper.piece(box(x + f.dx - 96, G - f.h - 10, x + f.dx + 96, G - f.h + 38), concrete, { seed: 7480 + i, tear: 0.5 });
    });
    paper.inside(() => frames.forEach((f, i) => paper.piece(box(x + f.dx - 96, G - f.h + 26, x + f.dx + 96, G - f.h + 38), dark, { seed: 7490 + i, tear: 0.3 })));
  }, { shadow: 12, rim: { color: '#fff4e2', width: 3 } });
}

/** A driftwood log lying on the sand, bark-grey with pale ends. `r` is its radius. */
export function driftwood(paper: Paper, x0: number, x1: number, y: number, r: number, seed: number): void {
  card(paper, () => {
    paper.piece([{ x: x0, y: y - r * 2 }, { x: x1, y: y - r * 1.8 }, { x: x1 + 4, y }, { x: x0 - 4, y }], '#9a8570', { seed, tear: 1.6 });
    paper.inside(() => {
      for (let i = 0; i < 3; i++) paper.piece(box(x0, y - r * (1.6 - i * 0.5), x1, y - r * (1.55 - i * 0.5)), 'rgba(70, 55, 40, 0.3)', { seed: seed + 1 + i, tear: 0.8 });
    });
    paper.piece(ellipse({ x: x1, y: y - r * 0.95 }, r * 0.45, r * 0.95, 14), '#d9c7a8', { seed: seed + 5, tear: 0.6 });
  }, { shadow: 8 });
}

/** Wooden steps down the forested cliff to the beach (a background piece, drawn in its own layer). */
export function beachStairs(paper: Paper, x: number, y: number): void {
  card(paper, () => {
    for (let i = 0; i < 9; i++) paper.piece(box(x + i * 34, y + i * 24, x + i * 34 + 44, y + i * 24 + 10), '#a07b55', { seed: 7600 + i, tear: 0.5 });
    for (let i = 0; i <= 9; i += 3) paper.piece(box(x + i * 34 + 2, y + i * 24 - 50, x + i * 34 + 8, y + i * 24 + 6), '#8a6746', { seed: 7620 + i, tear: 0.3 });
    paper.line([{ x: x + 5, y: y - 48 }, { x: x + 311, y: y + 168 }], '#8a6746', 5);
  }, { shadow: 6 });
}
