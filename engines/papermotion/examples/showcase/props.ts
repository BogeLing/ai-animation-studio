import { type Paper, type V, circlePoly } from '../../src';
import { box, card, ellipse, rrect } from '../shared/kit';

/** The ground line of the action plane. */
export const G = 860;

/** A windmill: a whitewashed tower under a red cap, with four lattice sails turned to `spin` (rad). */
export function windmill(paper: Paper, x: number, spin: number): void {
  card(paper, () => {
    paper.piece([{ x: x - 92, y: G }, { x: x - 56, y: G - 330 }, { x: x + 56, y: G - 330 }, { x: x + 92, y: G }], '#f3ece0', { seed: 5000, tear: 1 });
    paper.inside(() => {
      paper.piece(rrect(x - 28, G - 112, x + 28, G, 24), '#8a5a3c', { seed: 5001, tear: 0.5 });
      paper.piece(circlePoly({ x, y: G - 222 }, 20, 18), '#6f8fa8', { seed: 5002, tear: 0.4 });
      paper.piece(box(x - 100, G - 16, x + 100, G), '#d9cfbf', { seed: 5003, tear: 0.6 });
    });
  }, { shadow: 12 });
  card(paper, () => paper.piece([{ x: x - 74, y: G - 322 }, { x: x - 42, y: G - 382 }, { x, y: G - 404 }, { x: x + 42, y: G - 382 }, { x: x + 74, y: G - 322 }], '#c8553d', { seed: 5010, tear: 0.8 }), { shadow: 8 });
  const hub = { x, y: G - 352 };
  for (let i = 0; i < 4; i++) {
    const a = spin + (i * Math.PI) / 2, dx = Math.cos(a), dy = Math.sin(a);
    const at = (s: number, w: number): V => ({ x: hub.x + dx * s - dy * w, y: hub.y + dy * s + dx * w });
    card(paper, () => {
      paper.piece([at(34, -6), at(236, -8), at(236, 44), at(70, 32)], '#efe6d6', { seed: 5020 + i, tear: 0.6 });
      paper.inside(() => { for (let k = 0; k < 5; k++) paper.line([at(78 + k * 34, -10), at(78 + k * 34, 46)], 'rgba(120, 90, 60, 0.45)', 3); });
    }, { shadow: 6 });
    paper.line([at(0, 0), at(242, 0)], '#8a6a4a', 7);
  }
  card(paper, () => paper.piece(circlePoly(hub, 16, 16), '#8a6a4a', { seed: 5030, tear: 0.4 }), { shadow: 4 });
}

/** A hot-air balloon: a striped envelope, ropes and a wicker basket, centred on the envelope at `c`. */
export function balloon(paper: Paper, c: V): void {
  const env: V[] = [];
  for (let i = 0; i <= 28; i++) {
    const a = -Math.PI / 2 + (i / 28) * Math.PI * 2, s = Math.sin(a);
    env.push({ x: c.x + Math.cos(a) * 104 * (s > 0 ? 1 - s * 0.62 : 1), y: c.y + s * (s > 0 ? 150 : 118) });
  }
  const colors = ['#e2574c', '#f2c14e', '#4f9e62', '#4a86c9', '#f2c14e'];
  card(paper, () => {
    paper.piece(env, '#e2574c', { seed: 5100, tear: 1 });
    paper.inside(() => colors.forEach((color, k) => paper.piece(box(c.x - 110 + k * 44, c.y - 130, c.x - 66 + k * 44, c.y + 160), color, { seed: 5101 + k, tear: 0.6 })));
  }, { shadow: 10 });
  for (const side of [-1, 1]) paper.line([{ x: c.x + side * 38, y: c.y + 140 }, { x: c.x + side * 24, y: c.y + 196 }], '#6b5540', 3);
  card(paper, () => paper.piece(rrect(c.x - 30, c.y + 192, c.x + 30, c.y + 236, 6), '#a0784f', { seed: 5110, tear: 0.6 }), { shadow: 6 });
}

/** A little town of three houses with a balloon rising behind them, bobbing with `t`. */
export function town(paper: Paper, x: number, t: number): void {
  balloon(paper, { x: x + 120, y: G - 440 - 22 * Math.sin(t * 1.3) });
  const houses = [
    { dx: -240, w: 170, h: 200, wall: '#e7b96a', roof: '#8c4a3a' },
    { dx: -40, w: 190, h: 262, wall: '#9cc1c9', roof: '#4f5d75' },
    { dx: 170, w: 160, h: 184, wall: '#e9a0a0', roof: '#7a4b5c' },
  ];
  houses.forEach((h, i) => {
    const cx = x + h.dx, x0 = cx - h.w / 2, x1 = cx + h.w / 2;
    card(paper, () => {
      paper.piece(box(x0, G - h.h, x1, G), h.wall, { seed: 5200 + i * 10, tear: 1 });
      paper.inside(() => {
        for (const [wx, wy] of [[-0.28, 0.32], [0.28, 0.32], [-0.28, 0.62]]) paper.piece(rrect(cx + wx * h.w - 18, G - h.h * (1 - wy) - 22, cx + wx * h.w + 18, G - h.h * (1 - wy) + 22, 4), '#fdf3d8', { seed: 5201 + i * 10 + wx * 10, tear: 0.3 });
        paper.piece(rrect(cx + h.w * 0.12, G - 76, cx + h.w * 0.12 + 40, G, 16), '#6e4a33', { seed: 5205 + i * 10, tear: 0.4 });
      });
    }, { shadow: 10 });
    card(paper, () => paper.piece([{ x: x0 - 16, y: G - h.h + 4 }, { x: cx, y: G - h.h - h.w * 0.5 }, { x: x1 + 16, y: G - h.h + 4 }], h.roof, { seed: 5206 + i * 10, tear: 0.8 }), { shadow: 8 });
  });
}

/**
 * A red-and-white lighthouse on the headland with a keeper's cottage. `beam` (0…1) lights the lamp and sweeps
 * a soft beam out to sea as it turns.
 */
export function lighthouse(paper: Paper, x: number, t: number, beam: number): void {
  card(paper, () => {
    paper.piece(box(x - 300, G - 120, x - 150, G), '#f4efe6', { seed: 6100, tear: 1 });
    paper.inside(() => { paper.piece(rrect(x - 250, G - 70, x - 214, G, 10), '#6e4a33', { seed: 6101, tear: 0.4 }); paper.piece(rrect(x - 190, G - 90, x - 162, G - 58, 3), '#7f9fb8', { seed: 6102, tear: 0.3 }); });
  }, { shadow: 8 });
  card(paper, () => paper.piece([{ x: x - 316, y: G - 116 }, { x: x - 225, y: G - 176 }, { x: x - 134, y: G - 116 }], '#c8453b', { seed: 6103, tear: 0.8 }), { shadow: 6 });
  card(paper, () => {
    paper.piece([{ x: x - 76, y: G }, { x: x - 50, y: G - 420 }, { x: x + 50, y: G - 420 }, { x: x + 76, y: G }], '#f6f1e8', { seed: 6000, tear: 1 });
    paper.inside(() => {
      for (const [y0, y1] of [[G - 150, G - 90], [G - 300, G - 240]]) paper.piece(box(x - 90, y0, x + 90, y1), '#c8453b', { seed: 6001 + y0, tear: 0.6 });
      paper.piece(rrect(x - 22, G - 70, x + 22, G, 14), '#5a3b2a', { seed: 6003, tear: 0.4 });
      paper.piece(rrect(x - 10, G - 206, x + 10, G - 180, 4), '#3b3f45', { seed: 6004, tear: 0.3 });
    });
  }, { shadow: 12 });
  card(paper, () => {
    paper.piece(box(x - 74, G - 434, x + 74, G - 418), '#3b3f45', { seed: 6010, tear: 0.4 });
    paper.piece(box(x - 38, G - 498, x + 38, G - 432), '#3b3f45', { seed: 6011, tear: 0.4 });
    paper.inside(() => paper.piece(box(x - 30, G - 490, x + 30, G - 440), beam > 0 ? '#ffe39a' : '#9fb4c4', { seed: 6012, tear: 0.3 }));
    paper.piece([{ x: x - 46, y: G - 496 }, { x, y: G - 548 }, { x: x + 46, y: G - 496 }], '#c8453b', { seed: 6013, tear: 0.6 });
  }, { shadow: 8 });
  if (beam <= 0.01) return;
  // The lamp turns: seen from the side, the beam swings out to one side, shrinks through the tower and swings out the other.
  const lamp = { x, y: G - 465 }, turn = Math.cos(t * 2.2), reach = 1100 * Math.abs(turn), dir = Math.sign(turn) || 1;
  paper.layer(beam * (0.35 + 0.35 * Math.abs(turn)), () => paper.piece([
    { x: lamp.x, y: lamp.y - 16 }, { x: lamp.x + dir * reach, y: lamp.y - 110 }, { x: lamp.x + dir * reach, y: lamp.y + 110 }, { x: lamp.x, y: lamp.y + 16 },
  ], '#fff1b8', { seed: 6020, tear: 0.4, shadow: 0, edge: false, texture: 0 }), 'screen');
  paper.layer(beam * 0.8, () => paper.piece(ellipse(lamp, 60, 60, 24), '#fff4c8', { seed: 6021, tear: 0.2, shadow: 0, edge: false, texture: 0 }), 'screen', 'blur(14px)');
}
