import { type Paper, type V, circlePoly, clamp, layoutLetters, lerp, overshoot, smoothstep, textWidth } from '../../src';
import { Clawd } from '../shared/Clawd';
import { dayAt } from '../shared/daySky';
import { box, card, ellipse, place, pop, rrect, sparkle } from '../shared/kit';
import { PaperPlane } from '../shared/Plane';
import { Polaroid } from '../shared/polaroid';
import type { Narration } from '../shared/narration';

export const INK = '#2b2521', CREAM = '#fbf6ea', RED = '#d9644f', NAVY = '#2d3a4a', GOLD = '#ffd84d', GREEN = '#4f9e62';
export const MONO = '"DejaVu Sans Mono", Menlo, Consolas, monospace';
const LABEL = '800 26px Montserrat';

/** How far a thing has come in, 0…1+, `d` seconds after `t0` (with a pop-up overshoot). */
const inn = (t: number, t0: number, d = 0.35) => pop(t, t0, d);
const typed = (text: string, t: number, t0: number, cps = 42) => (t < t0 ? '' : text.slice(0, Math.floor((t - t0) * cps)));

/** An arrow from a toward b, drawn out as u goes 0 → 1. */
function arrow(paper: Paper, a: V, b: V, u: number, color = INK, width = 5): void {
  if (u <= 0) return;
  const k = Math.min(1, u), e = { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) }, ang = Math.atan2(b.y - a.y, b.x - a.x), s = 10 + width * 1.8;
  paper.line([a, { x: e.x - Math.cos(ang) * s * 0.7, y: e.y - Math.sin(ang) * s * 0.7 }], color, width);
  const g = paper.context;
  g.save();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(e.x, e.y);
  g.lineTo(e.x - Math.cos(ang - 0.5) * s, e.y - Math.sin(ang - 0.5) * s);
  g.lineTo(e.x - Math.cos(ang + 0.5) * s, e.y - Math.sin(ang + 0.5) * s);
  g.fill();
  g.restore();
}

/** Plain text, not cut from paper: for terminal and code lines, which change every frame. */
function write(paper: Paper, text: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left'): void {
  const g = paper.context;
  g.save();
  g.font = font;
  g.fillStyle = color;
  g.textAlign = align;
  g.fillText(text, x, y);
  g.restore();
}

/** A small paper label (a chip) centred at x, y. */
function chip(paper: Paper, x: number, y: number, text: string, k: number, fill = '#fffdf8', ink = INK, font = LABEL, seed = 1): void {
  if (k <= 0.01) return;
  const w = textWidth(paper.context, text, font) + 36;
  place(paper, x, y, k, 0, () => {
    card(paper, () => paper.piece(rrect(-w / 2, -26, w / 2, 26, 12), fill, { seed, tear: 0.8 }), { shadow: 6 });
    paper.text(text, { x: 0, y: 9 }, { font, color: ink, align: 'center', sheet: { shadow: 0 } });
  });
}

/** A glow behind something that's active. */
function glow(paper: Paper, w: number, h: number, alpha: number, color = GOLD): void {
  if (alpha > 0.01) paper.layer(alpha, () => paper.piece(rrect(-w / 2 - 14, -h / 2 - 14, w / 2 + 14, h / 2 + 14, 22), color, { seed: 9, tear: 0.4, shadow: 0, edge: false, texture: 0 }));
}

/** A little landscape (sky, hill, sun) inside a w × h window centred on 0, 0: the stand-in for a rendered frame. */
function miniScene(paper: Paper, w: number, h: number, sunX: number, seed: number, sky = ['#9cc7ea', '#fbeed6']): void {
  const g = paper.context, grad = g.createLinearGradient(0, -h / 2, 0, h / 2);
  grad.addColorStop(0, sky[0]);
  grad.addColorStop(1, sky[1]);
  paper.piece(box(-w / 2, -h / 2, w / 2, h / 2), grad, { seed, tear: 0.3, shadow: 0 });
  paper.clip(box(-w / 2, -h / 2, w / 2, h / 2), () => {
    paper.piece(circlePoly({ x: lerp(-w * 0.35, w * 0.35, sunX), y: -h * 0.2 }, h * 0.1, 20), '#fff1c2', { seed: seed + 1, tear: 0.3, shadow: 0 });
    paper.piece(ellipse({ x: -w * 0.15, y: h * 0.45 }, w * 0.55, h * 0.35, 24), '#86b163', { seed: seed + 2, tear: 0.8, shadow: 0 });
    paper.piece(ellipse({ x: w * 0.35, y: h * 0.5 }, w * 0.4, h * 0.28, 24), '#6f9f55', { seed: seed + 3, tear: 0.8, shadow: 0 });
  });
}

/**
 * The boards on the studio wall, one per chapter of the narration. Each is drawn around its centre (bx, by) and
 * folds up out of the page as the camera arrives; what's on it pops in on the narrator's words.
 */
export class Boards {
  private readonly mini = new Clawd({ x: 0, y: 0 }, 9, 3100, [1.2, 4.4]);
  private readonly plane = new PaperPlane({ x: 0, y: 0 }, 0, 3200);
  private readonly photo = new Polaroid((paper, w, h) => {
    const g = paper.context, day = dayAt(3);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, day.sky[0]);
    grad.addColorStop(1, day.sky[2]);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    place(paper, w / 2, h / 2, 1, 0, () => miniScene(paper, w, h, 0.7, 60, [day.sky[0], day.sky[2]]));
  }, { label: 'Snap!', seed: 7 });

  constructor(private readonly paper: Paper, private readonly n: Narration) {
    this.mini.width = 0.8;
  }

  /** Move what has springs (the hop-walk demo's Clawd) on the stage's fixed step, so every render worker agrees. */
  update(t: number, dt: number): void {
    const c = this.mini, u = t - this.n.at('modules', 'hop'), s = (Math.max(0, u) * 0.5) % 2, dir = s < 1 ? 1 : -1, v = s < 1 ? s : 2 - s;
    c.rest();
    c.root = { x: lerp(-130, 130, v), y: 88 - Math.abs(Math.sin(v * Math.PI * 3)) * 40 };
    Object.assign(c.intent, { look: { x: 0.7 * dir, y: 0 }, lean: 0.08 * dir, smile: 0.6 });
    c.update(dt, t);
  }

  /**
   * The board: a big sheet with tape and a numbered header tab, folding up from its bottom edge by k. `content`
   * draws what's on it, in world coordinates, and folds with it.
   */
  frame(bx: number, by: number, k: number, header: string, seed: number, content: () => void): void {
    const { paper } = this, g = paper.context;
    if (k <= 0.01) return;
    g.save();
    g.translate(bx, by + 340);
    g.scale(1, k);
    g.translate(-bx, -(by + 340));
    place(paper, bx, by, 1, 0, () => {
      card(paper, () => paper.piece(rrect(-700, -340, 700, 340, 18), CREAM, { seed, tear: 1.4 }), { shadow: 16 });
      for (const x of [-620, 620]) card(paper, () => paper.piece(rrect(x - 46, -356, x + 46, -326, 3), 'rgba(236, 220, 170, 0.92)', { seed: seed + x, tear: 1.2 }), { shadow: 2 });
      const w = textWidth(paper.context, header, '800 28px Montserrat') + 40;
      card(paper, () => paper.piece(rrect(-670, -318, -670 + w, -270, 10), NAVY, { seed: seed + 3, tear: 0.8 }), { shadow: 5 });
      paper.text(header, { x: -670 + w / 2, y: -284 }, { font: '800 28px Montserrat', color: '#ffffff', align: 'center', sheet: { shadow: 0 } });
    });
    content();
    g.restore();
  }

  /** 01 · No video model: code → frames → sound. */
  how(bx: number, by: number, t: number): void {
    const { paper, n } = this, cy = by + 40;
    chip(paper, bx + 400, by - 245, 'video model', inn(t, n.at('how', 'video')), '#f3e9dc', '#8a7f74', '800 38px Montserrat', 4);
    const strike = clamp((t - n.at('how', 'video') - 0.25) / 0.3), sw = textWidth(paper.context, 'video model', '800 38px Montserrat') / 2 + 26;
    if (strike > 0) paper.line([{ x: bx + 400 - sw, y: by - 245 }, { x: lerp(bx + 400 - sw, bx + 400 + sw, strike), y: by - 245 }], RED, 9);
    // The code card.
    const code = inn(t, n.at('how', 'writes'));
    if (code > 0) place(paper, bx - 380, cy, code, -0.01, () => {
      card(paper, () => paper.piece(rrect(-240, -150, 240, 150, 16), '#2b2f36', { seed: 101, tear: 0.8 }), { shadow: 12 });
      for (const [i, c] of ['#e2574c', '#f2c14e', '#4f9e62'].entries()) card(paper, () => paper.piece(circlePoly({ x: -210 + i * 26, y: -124 }, 8, 12), c, { seed: 102 + i, tear: 0.2 }), { shadow: 0, edge: false });
      const lines: [string, string][] = [['// scene.ts', '#8a93a3'], ['clawd.root = walk.at(t);', '#f3e9dc'], ['sky = dayAt(t / 20);', '#9fd3a6'], ['captions.draw(paper, t);', '#f2c14e']];
      let t0 = n.at('how', 'writes') + 0.2;
      lines.forEach(([text, color], i) => { write(paper, typed(text, t, t0), -210, -70 + i * 48, `600 24px ${MONO}`, color); t0 += text.length / 42 + 0.1; });
    });
    chip(paper, bx - 380, cy + 205, 'code', code);
    arrow(paper, { x: bx - 125, y: cy }, { x: bx - 45, y: cy }, (t - n.at('how', 'papermotion')) / 0.3);
    // The film strip: frames appear one at a time.
    const film = inn(t, n.at('how', 'papermotion'));
    if (film > 0) place(paper, bx + 170, cy, film, 0.01, () => {
      card(paper, () => {
        paper.piece(rrect(-190, -110, 190, 110, 8), '#3a3431', { seed: 110, tear: 0.8 });
        paper.inside(() => { for (let i = -5; i <= 5; i++) for (const y of [-96, 84]) paper.piece(rrect(i * 32 - 9, y, i * 32 + 9, y + 12, 3), '#f3e9dc', { seed: 111 + i, tear: 0.2 }); });
      }, { shadow: 12 });
      for (let i = 0; i < 3; i++) {
        const k = inn(t, n.at('how', 'frame') + i * 0.28, 0.25);
        if (k > 0) place(paper, -118 + i * 118, -4, k, 0, () => card(paper, () => miniScene(paper, 100, 130, i / 2, 120 + i * 5), { shadow: 3 }));
      }
    });
    chip(paper, bx + 170, cy + 205, 'frames', film);
    arrow(paper, { x: bx + 375, y: cy }, { x: bx + 445, y: cy }, (t - n.at('how', 'music')) / 0.3);
    // The sound card: bars moving like a meter.
    const sound = inn(t, n.at('how', 'music'));
    if (sound > 0) place(paper, bx + 560, cy, sound, 0.02, () => {
      card(paper, () => paper.piece(rrect(-105, -110, 105, 110, 14), '#fffdf8', { seed: 130, tear: 0.8 }), { shadow: 12 });
      for (let i = 0; i < 9; i++) {
        const h = 20 + 60 * Math.abs(Math.sin(t * (3 + i * 0.7) + i * 1.3));
        paper.piece(rrect(-80 + i * 18, 40 - h, -68 + i * 18, 40, 4), i % 2 ? RED : NAVY, { seed: 131 + i, tear: 0.3, shadow: 0 });
      }
      write(paper, '♪', -60, -60 + 6 * Math.sin(t * 4), '800 40px Montserrat', RED);
      write(paper, '♫', 40, -58 + 6 * Math.sin(t * 4 + 1.5), '800 40px Montserrat', NAVY);
    });
    chip(paper, bx + 560, cy + 205, 'music & sound', sound);
  }

  /** 02 · Edit anything: move a prop, rewrite a caption, retime a beat, render again. */
  edit(bx: number, by: number, t: number): void {
    const { paper, n } = this, wx = bx - 170, wy = by - 30;
    const show = inn(t, n.at('edit', 'every'));
    if (show <= 0) return;
    place(paper, wx, wy, show, -0.005, () => {
      card(paper, () => paper.piece(rrect(-390, -220, 390, 220, 10), '#e9dfcf', { seed: 201, tear: 0.8 }), { shadow: 12 });
      place(paper, 0, 0, 1, 0, () => card(paper, () => miniScene(paper, 740, 400, 0.25, 202), { shadow: 0, edge: false }));
      // The tree: the prop that moves.
      const move = n.at('edit', 'Move'), mx = lerp(-200, 170, smoothstep(move, move + 0.8, t));
      card(paper, () => {
        paper.piece(box(mx - 12, 20, mx + 12, 140), '#6d4c3d', { seed: 203, tear: 0.4 });
        paper.piece(ellipse({ x: mx, y: -10 }, 80, 90, 20), '#5f8f45', { seed: 204, tear: 1.2 });
      }, { shadow: 8 });
      if (t > move - 0.2 && t < move + 1.3) {
        const hx = mx + 60, hy = 70 + 6 * Math.sin(t * 10);
        card(paper, () => { paper.piece(rrect(hx - 16, hy - 6, hx + 16, hy + 40, 10), '#fff4e8', { seed: 205, tear: 0.4 }); paper.piece(rrect(hx - 7, hy - 40, hx + 7, hy, 6), '#fff4e8', { seed: 206, tear: 0.3 }); }, { shadow: 6 });
      }
      // The caption: rewritten, it flips over.
      const re = n.at('edit', 'rewrite'), flip = clamp((t - re) / 0.4), text = flip < 0.5 ? 'The tree stands still.' : 'The tree has moved!';
      const w = textWidth(paper.context, text, '700 30px Montserrat') + 50;
      place(paper, 0, 172, 1, 0, () => {
        card(paper, () => paper.piece(rrect(-w / 2, -28, w / 2, 28, 4), flip >= 0.5 ? '#fbe7a6' : '#ecdfc6', { seed: 207, tear: 1.2 }), { shadow: 6 });
        paper.text(text, { x: 0, y: 11 }, { font: '700 30px Montserrat', color: INK, align: 'center', sheet: { shadow: 0 } });
      }, Math.abs(Math.cos(flip * Math.PI)) * 0.9 + 0.1);
    });
    // The timeline under the window: the third beat slides later.
    const beat = n.at('edit', 'retime'), slide = smoothstep(beat, beat + 0.7, t);
    place(paper, wx, wy + 275, show, 0, () => {
      card(paper, () => paper.piece(rrect(-390, -12, 390, 12, 6), '#d8cdbb', { seed: 210, tear: 0.6 }), { shadow: 4 });
      [-300, -150, 0, 150, 300].forEach((x, i) => {
        const bx2 = i === 2 ? x + 110 * slide : x, lit = i === 2 && t > beat - 0.1 && t < beat + 1.2;
        place(paper, bx2, 0, 1, 0, () => { glow(paper, 22, 44, lit ? 0.8 : 0); card(paper, () => paper.piece(rrect(-11, -22, 11, 22, 5), i === 2 ? RED : NAVY, { seed: 211 + i, tear: 0.3 }), { shadow: 4 }); });
      });
    });
    // Render again: the button spins, then a check.
    const again = n.at('edit', 'render'), spin = smoothstep(again, again + 0.9, t) * Math.PI * 2;
    const btn = inn(t, n.at('edit', 'every') + 0.4);
    if (btn > 0) place(paper, bx + 470, by + 30, btn, 0, () => {
      card(paper, () => paper.piece(circlePoly({ x: 0, y: 0 }, 110, 40), '#fffdf8', { seed: 220, tear: 1 }), { shadow: 12 });
      const pts: V[] = [];
      for (let i = 0; i <= 24; i++) { const a = spin - Math.PI * 0.1 + (i / 24) * Math.PI * 1.6; pts.push({ x: Math.cos(a) * 62, y: Math.sin(a) * 62 }); }
      paper.line(pts, NAVY, 14);
      const tip = pts[pts.length - 1], a = spin + Math.PI * 1.5;
      paper.piece([{ x: tip.x + Math.cos(a) * 26, y: tip.y + Math.sin(a) * 26 }, { x: tip.x + Math.cos(a + 2.2) * 22, y: tip.y + Math.sin(a + 2.2) * 22 }, { x: tip.x + Math.cos(a - 2.2) * 22, y: tip.y + Math.sin(a - 2.2) * 22 }], NAVY, { seed: 221, tear: 0.3, shadow: 0 });
      const ok = inn(t, again + 0.95, 0.3);
      if (ok > 0) place(paper, 70, -70, ok, 0, () => { card(paper, () => paper.piece(circlePoly({ x: 0, y: 0 }, 38, 24), GREEN, { seed: 222, tear: 0.4 }), { shadow: 6 }); paper.line([{ x: -16, y: 0 }, { x: -4, y: 13 }, { x: 18, y: -12 }], '#ffffff', 8); });
    });
    chip(paper, bx + 470, by + 200, 'render again', btn);
  }

  /** 03 · Quick start: the terminal (three commands, the smoke test), then rendering the plane film. */
  terminal(bx: number, by: number, t: number): void {
    const { paper, n } = this, tx = bx - 150, ty = by + 20;
    const term = inn(t, n.block('install').start + 0.1);
    if (term <= 0) return;
    const lines: [string, number, string][] = [
      ['$ git clone https://github.com/BogeLing/ai-animation-studio', n.at('install', 'Clone'), '#f3e9dc'],
      ['$ cd ai-animation-studio/engines/papermotion', n.at('install', 'install') - 0.6, '#f3e9dc'],
      ['$ pnpm install', n.at('install', 'install') + 0.1, '#f3e9dc'],
      ['$ pnpm smoke', n.at('install', 'smoke'), '#f3e9dc'],
      ['smoke: OK · 30 frames, sound, sequential = parallel', n.at('install', 'match'), '#9fd3a6'],
      ['$ pnpm render plane', n.at('render', 'command'), '#f3e9dc'],
    ];
    place(paper, tx, ty, term, 0, () => {
      card(paper, () => paper.piece(rrect(-470, -250, 470, 250, 16), '#262a30', { seed: 301, tear: 0.8 }), { shadow: 14 });
      for (const [i, c] of ['#e2574c', '#f2c14e', '#4f9e62'].entries()) card(paper, () => paper.piece(circlePoly({ x: -440 + i * 26, y: -222 }, 8, 12), c, { seed: 302 + i, tear: 0.2 }), { shadow: 0, edge: false });
      lines.forEach(([text, at, color], i) => write(paper, typed(text, t, at, 60), -440, -168 + i * 50, `600 25px ${MONO}`, color));
      // The render's progress bar, then the file it wrote.
      const r0 = n.at('render', 'command') + 0.5, prog = clamp((t - r0) / 2.2);
      if (prog > 0) {
        const filled = Math.round(prog * 24);
        write(paper, `[${'█'.repeat(filled)}${'░'.repeat(24 - filled)}] ${Math.round(prog * 150)}/150 frames`, -440, -168 + 6 * 50, `600 25px ${MONO}`, '#f2c14e');
        if (prog >= 1) write(paper, 'encoded → out/plane.mp4, with sound', -440, -168 + 7 * 50, `600 25px ${MONO}`, '#9fd3a6');
      }
    });
    // Three commands: one numbered dot per command, lit as it's typed.
    const three = inn(t, n.at('install', 'three'));
    [lines[0], lines[2], lines[3]].forEach(([, at], i) => {
      const lit = t >= at;
      place(paper, bx + 400 + i * 80, by - 250, three, 0, () => {
        glow(paper, 56, 56, lit ? 0.7 : 0);
        card(paper, () => paper.piece(circlePoly({ x: 0, y: 0 }, 30, 24), lit ? RED : '#d8cdbb', { seed: 310 + i, tear: 0.5 }), { shadow: 6 });
        paper.text(String(i + 1), { x: 0, y: 11 }, { font: '800 30px Montserrat', color: '#ffffff', align: 'center', sheet: { shadow: 0 } });
      });
    });
    // "OK" stamp for the smoke test.
    const ok = t - n.at('install', 'match') - 0.4;
    if (ok > 0 && t < n.block('render').start + 0.6) {
      const s = 1 + 0.5 * (1 - clamp(ok / 0.15)) ** 2;
      place(paper, bx + 500, by + 40, s, -0.2, () => paper.layer(0.9 * clamp(ok * 6), () => {
        const g = paper.context;
        g.save(); g.strokeStyle = g.fillStyle = GREEN; g.lineWidth = 9;
        g.strokeRect(-110, -52, 220, 104); g.font = '800 66px Montserrat'; g.textAlign = 'center'; g.fillText('OK', 0, 24); g.restore();
      }, 'multiply'));
    }
    // The finished film on a little screen: the paper plane loops over a hill.
    const screen = inn(t, n.at('render', 'paper'));
    if (screen > 0) place(paper, bx + 520, by + 60, screen, 0.02, () => {
      card(paper, () => paper.piece(rrect(-190, -130, 190, 130, 12), '#3a3431', { seed: 320, tear: 0.8 }), { shadow: 14 });
      place(paper, 0, 0, 1, 0, () => card(paper, () => miniScene(paper, 350, 230, 0.8, 321), { shadow: 0, edge: false }));
      const u = (t - n.at('render', 'paper')) * 0.5, a = u * Math.PI * 2;
      this.plane.pos = { x: 0, y: 0 };
      place(paper, Math.sin(a) * 110, -20 - Math.cos(a) * 55, 0.9, Math.atan2(Math.sin(a) * 55, Math.cos(a) * 110), () => this.plane.draw(paper));
      const snd = inn(t, n.at('render', 'sound'), 0.3);
      if (snd > 0) place(paper, 150, -90, snd, 0, () => {
        card(paper, () => paper.piece([{ x: -22, y: -10 }, { x: -8, y: -10 }, { x: 8, y: -24 }, { x: 8, y: 24 }, { x: -8, y: 10 }, { x: -22, y: 10 }], '#fffdf8', { seed: 322, tear: 0.3 }), { shadow: 4 });
        for (let i = 0; i < 2; i++) paper.line(Array.from({ length: 9 }, (_, k) => { const b = -0.8 + k * 0.2; return { x: 14 + Math.cos(b) * (16 + i * 12), y: Math.sin(b) * (16 + i * 12) }; }), '#fffdf8', 4);
      });
    });
    chip(paper, bx + 520, by + 235, 'plane.mp4', screen);
  }

  /** 04 · Just ask: a chat with the agent. */
  ask(bx: number, by: number, t: number): void {
    const { paper, n } = this;
    chip(paper, bx - 400, by - 250, '>_ Claude Code', inn(t, n.at('ask', 'Claude')), '#fffdf8', NAVY, '800 26px Montserrat', 2);
    chip(paper, bx - 110, by - 250, '>_ Codex', inn(t, n.at('ask', 'Codex')), '#fffdf8', NAVY, '800 26px Montserrat', 3);
    const chat = inn(t, n.at('ask', 'open'));
    if (chat <= 0) return;
    const prompt = 'Make a 20-second paper cut-out film: a lighthouse keeper adopts a seagull. Cozy, lo-fi, with captions.';
    const reply = 'On it. Storyboard first, then key frames for you to review.';
    const wrap = (text: string, font: string, width: number) => {
      const out: string[] = [];
      let line = '';
      for (const word of text.split(' ')) { const next = line ? `${line} ${word}` : word; if (textWidth(paper.context, next, font) > width && line) { out.push(line); line = word; } else line = next; }
      if (line) out.push(line);
      return out;
    };
    place(paper, bx - 20, by + 40, chat, 0, () => {
      card(paper, () => paper.piece(rrect(-520, -230, 520, 230, 18), '#fffdf8', { seed: 401, tear: 0.8 }), { shadow: 14 });
      card(paper, () => paper.piece(rrect(-520, -230, 520, -180, 18), '#e9e2d6', { seed: 402, tear: 0.4 }), { shadow: 0, edge: false });
      write(paper, 'your agent', 0, -196, '700 22px Montserrat', '#7a7066', 'center');
      // Your message, typed, in a bubble on the right.
      const font = '600 27px Montserrat', shown = typed(prompt, t, n.at('ask', 'ask', 1) + 0.1, 48), lines = wrap(shown || ' ', font, 560);
      const full = wrap(prompt, font, 560), h = full.length * 38 + 34;
      if (shown) {
        card(paper, () => paper.piece(rrect(-120, -150, 480, -150 + h, 18), '#dbe9f7', { seed: 403, tear: 0.6 }), { shadow: 5 });
        lines.forEach((l, i) => write(paper, l, -96, -110 + i * 38, font, INK));
      }
      // The agent's reply: typing dots, then the message.
      const r0 = n.at('ask', 'long'), dots = t > r0 - 0.6 && t < r0 + 0.3;
      if (dots) for (let i = 0; i < 3; i++) paper.piece(circlePoly({ x: -440 + i * 26, y: 80 - 6 * Math.max(0, Math.sin(t * 9 - i)) }, 8, 12), '#b8ab9b', { seed: 404 + i, tear: 0.2, shadow: 0 });
      const rk = inn(t, r0 + 0.3, 0.3);
      if (rk > 0) place(paper, -470, 60, rk, 0, () => {
        const rl = wrap(reply, font, 520), rh = rl.length * 38 + 34;
        card(paper, () => paper.piece(rrect(0, 0, 560, rh, 18), '#f3e9dc', { seed: 405, tear: 0.6 }), { shadow: 5 });
        rl.forEach((l, i) => write(paper, l, 22, 40 + i * 38, font, INK));
      });
    });
    ['story', 'style', 'long'].forEach((word, i) => chip(paper, bx + 190 + i * 150, by + 305, ['story', 'style', 'length'][i], inn(t, n.at('ask', word)), '#fbe7a6', INK, '800 24px Montserrat', 10 + i));
  }

  /** 05 · The production loop: five steps around the skill, lit in turn. */
  loop(bx: number, by: number, t: number): void {
    const { paper, n } = this, cx = bx, cy = by + 30;
    const center = inn(t, n.at('loop', 'skill'));
    if (center > 0) place(paper, cx, cy, center, 0, () => {
      card(paper, () => paper.piece(ellipse({ x: 0, y: 0 }, 180, 70, 36), NAVY, { seed: 501, tear: 1 }), { shadow: 10 });
      paper.text('film-production', { x: 0, y: -2 }, { font: '800 30px Montserrat', color: '#ffffff', align: 'center', sheet: { shadow: 0 } });
      paper.text('skill', { x: 0, y: 32 }, { font: '700 24px Montserrat', color: '#cfd8e6', align: 'center', sheet: { shadow: 0 } });
    });
    const steps: [string, string][] = [['Storyboard', 'storyboards'], ['Review', 'key'], ['Pacing', 'pacing'], ['Sound', 'score'], ['Render', 'renders']];
    const at = steps.map(([, w]) => n.at('loop', w)), pos = steps.map((_, i) => { const a = -Math.PI / 2 + (i / 5) * Math.PI * 2; return { x: cx + Math.cos(a) * 470, y: cy + Math.sin(a) * 215 }; });
    steps.forEach(([label], i) => {
      const next = pos[(i + 1) % 5], u = i < 4 ? (t - at[i + 1] + 0.35) / 0.35 : 0;
      arrow(paper, { x: lerp(pos[i].x, next.x, 0.3), y: lerp(pos[i].y, next.y, 0.3) }, { x: lerp(pos[i].x, next.x, 0.7), y: lerp(pos[i].y, next.y, 0.7) }, u, '#8a7f74', 4);
      const k = inn(t, at[i]);
      if (k <= 0) return;
      const active = t >= at[i] && (i === 4 ? t < at[i] + 2 : t < at[i + 1]);
      place(paper, pos[i].x, pos[i].y, k, 0, () => {
        glow(paper, 230, 130, active ? 0.75 : 0);
        card(paper, () => paper.piece(rrect(-115, -65, 115, 65, 14), '#fffdf8', { seed: 510 + i, tear: 0.8 }), { shadow: 8 });
        this.icon(i, t);
        paper.text(label, { x: 0, y: 52 }, { font: '800 24px Montserrat', color: INK, align: 'center', sheet: { shadow: 0 } });
      });
    });
  }

  private icon(i: number, t: number): void {
    const { paper } = this;
    if (i === 0) for (let k = 0; k < 4; k++) paper.piece(rrect(-52 + (k % 2) * 56, -54 + Math.floor(k / 2) * 38, -4 + (k % 2) * 56, -22 + Math.floor(k / 2) * 38, 4), ['#9cc7ea', '#86b163', '#f2c14e', '#e9a0a0'][k], { seed: 520 + k, tear: 0.3, shadow: 0 });
    if (i === 1) { paper.piece(rrect(-44, -52, 44, 16, 6), '#9cc7ea', { seed: 525, tear: 0.3, shadow: 0 }); paper.line([{ x: -14, y: -18 }, { x: -2, y: -6 }, { x: 22, y: -34 }], GREEN, 8); }
    if (i === 2) { paper.line([{ x: -60, y: 8 }, { x: 60, y: 8 }], '#b8ab9b', 4); paper.line([{ x: -60, y: 4 }, { x: -20, y: -40 }, { x: 20, y: -44 }, { x: 60, y: -10 }], RED, 5); }
    if (i === 3) for (let k = 0; k < 9; k++) { const h = 10 + 30 * Math.abs(Math.sin(t * 3 + k)); paper.piece(rrect(-54 + k * 12, 10 - h, -46 + k * 12, 10, 3), NAVY, { seed: 530 + k, tear: 0.2, shadow: 0 }); }
    if (i === 4) { paper.piece(rrect(-60, -50, 60, 10, 4), '#3a3431', { seed: 540, tear: 0.3, shadow: 0 }); paper.piece([{ x: -12, y: -38 }, { x: 18, y: -20 }, { x: -12, y: -2 }], '#fffdf8', { seed: 541, tear: 0.2, shadow: 0 }); }
  }

  /** 06 · Scene modules: six cards, each running a tiny demo of its module. */
  modules(bx: number, by: number, t: number): void {
    const { paper, n } = this;
    const cards: [string, string][] = [['captions.ts', 'captions'], ['title.ts', 'title'], ['walk.ts', 'hop'], ['daySky.ts', 'sky'], ['polaroid.ts', 'instant'], ['lofi.ts', 'lofi']];
    cards.forEach(([file, word], i) => {
      const t0 = n.at('modules', word), k = inn(t, t0);
      if (k <= 0) return;
      const x = bx - 450 + (i % 3) * 450, y = by - 115 + Math.floor(i / 3) * 290, u = t - t0;
      place(paper, x, y, k, (i % 2 ? 0.01 : -0.01), () => {
        glow(paper, 400, 240, 0.7 * (1 - clamp(u / 1.2)));
        card(paper, () => paper.piece(rrect(-200, -120, 200, 120, 14), '#fffdf8', { seed: 600 + i, tear: 0.9 }), { shadow: 10 });
        write(paper, file, -180, -88, `600 22px ${MONO}`, '#8a7f74');
        this.demo(i, u, t);
      });
    });
  }

  private demo(i: number, u: number, t: number): void {
    const { paper } = this;
    if (i === 0) {   // a caption strip laid down
      const k = overshoot(clamp((u - 0.2) / 0.3), 1.6), w = 300;
      if (k > 0) place(paper, 0, 30, 0.9 + 0.1 * k, 0.02, () => {
        card(paper, () => paper.piece(rrect(-w / 2, -26, w / 2, 26, 4), '#ecdfc6', { seed: 610, tear: 1.4 }), { shadow: 4 + 8 * (1 - k), alpha: clamp(k * 3) });
        paper.text('Hello, paper world', { x: 0, y: 9 }, { font: '700 26px Montserrat', color: INK, align: 'center', sheet: { shadow: 0, alpha: clamp(k * 3) } });
      });
    }
    if (i === 1) {   // letters dropping in, kerned as the word
      const font = '800 72px Montserrat', x0 = -textWidth(paper.context, 'TITLE', font) / 2;
      layoutLetters(paper.context, 'TITLE', font).forEach((l, k) => {
        const e = clamp((u - 0.15 - k * 0.09) / 0.4);
        if (e > 0) paper.text(l.ch, { x: x0 + l.x, y: 52 - 70 * (1 - overshoot(e, 1.9)) }, { font, color: k % 2 ? RED : NAVY, angle: (1 - e) * 0.3, sheet: { shadow: 6, rim: { color: '#ffffff', width: 2 }, alpha: clamp(e * 5) } });
      });
    }
    if (i === 2) {   // a hop walk
      this.mini.draw(paper);
      paper.line([{ x: -180, y: 90 }, { x: 180, y: 90 }], '#b8ab9b', 3);
    }
    if (i === 3) {   // the day running from morning to sunset
      const day = dayAt((u * 1.1) % 4.4 > 4 ? 4 : (u * 1.1) % 4.4), g = paper.context, grad = g.createLinearGradient(0, -80, 0, 100);
      grad.addColorStop(0, day.sky[0]);
      grad.addColorStop(0.6, day.sky[1]);
      grad.addColorStop(1, day.sky[2]);
      paper.piece(rrect(-170, -70, 170, 100, 8), grad, { seed: 620, tear: 0.4, shadow: 0 });
      const sun = { x: lerp(-120, 120, day.sun.x / 1920), y: lerp(-40, 70, day.sun.y / 700) };
      paper.piece(circlePoly(sun, 18, 20), day.sunColor, { seed: 621, tear: 0.4, shadow: 0 });
      paper.piece(ellipse({ x: 0, y: 105 }, 190, 30, 24), day.hills[1], { seed: 622, tear: 0.6, shadow: 0 });
    }
    if (i === 4) {   // an instant photo flying up out of a flash
      const k = clamp((u - 0.2) / 0.5), e = k * k * (3 - 2 * k);
      if (u > 0.15 && u < 0.35) paper.layer(1 - (u - 0.15) / 0.2, () => paper.piece(circlePoly({ x: 0, y: 60 }, 90, 24), '#ffffff', { seed: 630, tear: 0.4, shadow: 0, edge: false, texture: 0 }));
      if (k > 0) this.photo.draw(paper, { at: { x: 0, y: lerp(90, 10, e) }, scale: lerp(0.15, 0.62, e), angle: lerp(-0.4, -0.06, e) });
    }
    if (i === 5) {   // a lo-fi score: a meter and notes
      for (let k = 0; k < 12; k++) {
        const h = 12 + 50 * Math.abs(Math.sin(t * 2.4 + k * 0.9) * Math.sin(t * 1.3 + k));
        paper.piece(rrect(-150 + k * 25, 80 - h, -134 + k * 25, 80, 4), k % 3 ? NAVY : RED, { seed: 640 + k, tear: 0.2, shadow: 0 });
      }
      write(paper, '♪', 90, -10 + 8 * Math.sin(t * 3), '800 44px Montserrat', RED);
      write(paper, '♫', 130, -30 + 8 * Math.sin(t * 3 + 1.2), '800 44px Montserrat', NAVY);
    }
  }

  /** 07 · Fast renders: six workers feeding one film strip, a timer, a GPU, and a glitch check. */
  speed(bx: number, by: number, t: number): void {
    const { paper, n } = this, t0 = n.at('speed', 'parallel'), stripY = by - 60;
    const workers = inn(t, t0);
    if (workers > 0) {
      // The strip runs right into a reel; frames fall onto it from the workers.
      place(paper, bx - 150, stripY, workers, 0, () => {
        card(paper, () => paper.piece(rrect(-460, -40, 460, 40, 6), '#3a3431', { seed: 701, tear: 0.6 }), { shadow: 8 });
        const shift = ((t - t0) * 160) % 64;
        for (let x = -448 + shift; x < 448; x += 64) paper.piece(rrect(x, -26, x + 50, 26, 4), '#9cc7ea', { seed: 702 + Math.round(x), tear: 0.2, shadow: 0 });
      });
      place(paper, bx + 360, stripY, workers, (t - t0) * 2.5, () => {
        card(paper, () => paper.piece(circlePoly({ x: 0, y: 0 }, 90, 36), '#3a3431', { seed: 710, tear: 0.8 }), { shadow: 10 });
        for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; paper.piece(circlePoly({ x: Math.cos(a) * 48, y: Math.sin(a) * 48 }, 18, 16), CREAM, { seed: 711 + k, tear: 0.3, shadow: 0 }); }
      });
      for (let i = 0; i < 6; i++) {
        const x = bx - 530 + i * 150, k = inn(t, t0 + i * 0.08);
        place(paper, x, by + 170, k, 0, () => {
          card(paper, () => { paper.piece(rrect(-58, -50, 58, 50, 10), '#e7b96a', { seed: 720 + i, tear: 0.6 }); paper.piece(rrect(-40, -62, 40, -48, 4), '#8c6a4a', { seed: 730 + i, tear: 0.3 }); }, { shadow: 8 });
          paper.text(`#${i + 1}`, { x: 0, y: 14 }, { font: '800 30px Montserrat', color: INK, align: 'center', sheet: { shadow: 0 } });
          const f = ((t - t0) * 1.6 + i * 0.37) % 1;
          if (t > t0 + 0.4) paper.piece(rrect(-22, -70 - f * 150, 22, -40 - f * 150, 4), '#9cc7ea', { seed: 740 + i, tear: 0.2, shadow: 3 });
        });
      }
    }
    chip(paper, bx - 150, by + 280, 'frames drawn in parallel', workers);
    // The timer.
    const tk = inn(t, n.at('speed', 'twelve'));
    if (tk > 0) place(paper, bx + 450, by - 215, tk, 0.01, () => {
      card(paper, () => paper.piece(rrect(-190, -70, 190, 70, 14), '#fffdf8', { seed: 750, tear: 0.8 }), { shadow: 10 });
      const secs = Math.min(40, Math.round(clamp((t - n.at('speed', 'forty') + 0.8) / 0.8) * 40));
      paper.text('12 s film', { x: -90, y: -8 }, { font: '800 32px Montserrat', color: NAVY, align: 'center', sheet: { shadow: 0 } });
      paper.text(`→ ${secs} s`, { x: 90, y: -8 }, { font: '800 32px Montserrat', color: RED, align: 'center', sheet: { shadow: 0 } });
      paper.text('on a laptop GPU', { x: 0, y: 40 }, { font: '700 22px Montserrat', color: '#7a7066', align: 'center', sheet: { shadow: 0 } });
    });
    // The GPU chip.
    const gpu = inn(t, n.at('speed', 'GPU'));
    if (gpu > 0) place(paper, bx + 520, by + 170, gpu, 0.05, () => {
      card(paper, () => {
        paper.piece(rrect(-70, -70, 70, 70, 10), '#4f5d75', { seed: 760, tear: 0.6 });
        for (let k = -2; k <= 2; k++) for (const [dx, dy] of [[k * 26, -82], [k * 26, 70], [-82, k * 26], [70, k * 26]]) paper.piece(rrect(dx - 5, dy - 1, dx + 5, dy + 13, 2), '#c9ced6', { seed: 761 + k, tear: 0.2 });
      }, { shadow: 10 });
      paper.text('GPU', { x: 0, y: 12 }, { font: '800 38px Montserrat', color: '#ffffff', align: 'center', sheet: { shadow: 0 } });
    });
    // The glitch check: a magnifier sweeps the strip, then a stamp.
    const g0 = n.at('speed', 'glitches');
    if (t > g0 - 0.4) {
      const sweep = clamp((t - g0 + 0.4) / 1.2), mx = bx - 560 + sweep * 820;
      if (sweep < 1) place(paper, mx, stripY - 10, 1, -0.4, () => {
        paper.layer(0.25, () => paper.piece(circlePoly({ x: 0, y: 0 }, 58, 30), '#ffffff', { seed: 770, tear: 0.2, shadow: 0, edge: false, texture: 0 }));
        paper.line(Array.from({ length: 31 }, (_, k) => ({ x: Math.cos((k / 30) * Math.PI * 2) * 60, y: Math.sin((k / 30) * Math.PI * 2) * 60 })), NAVY, 10);
        paper.line([{ x: 42, y: 42 }, { x: 100, y: 100 }], NAVY, 16);
      });
      const st = t - g0 - 0.9;
      if (st > 0) place(paper, bx - 150, stripY + 5, 1 + 0.5 * (1 - clamp(st / 0.15)) ** 2, -0.12, () => paper.layer(0.9 * clamp(st * 6), () => {
        const c = paper.context;
        c.save(); c.strokeStyle = c.fillStyle = GREEN; c.lineWidth = 9;
        c.strokeRect(-190, -50, 380, 100); c.font = '800 54px Montserrat'; c.textAlign = 'center'; c.fillText('CHECKED ✓', 0, 20); c.restore();
      }, 'multiply'));
    }
  }

  /** 08 · Get started: the address and three steps. */
  outro(bx: number, by: number, t: number): void {
    const { paper, n } = this, t0 = n.at('outro', 'Clone');
    const url = inn(t, t0 - 0.3, 0.45);
    if (url > 0) {
      const text = 'github.com/BogeLing/ai-animation-studio', w = textWidth(paper.context, text, '800 54px Montserrat') + 90;
      place(paper, bx, by - 90, url, -0.01, () => {
        card(paper, () => paper.piece(rrect(-w / 2, -64, w / 2, 64, 14), '#fffdf8', { seed: 801, tear: 1.2 }), { shadow: 14 });
        paper.text(text, { x: 0, y: 19 }, { font: '800 54px Montserrat', color: NAVY, align: 'center', sheet: { shadow: 0 } });
      });
    }
    ([['1 · Clone it', 'Clone'], ['2 · Open your agent', 'open'], ['3 · Make your first film', 'make']] as const).forEach(([text, word], i) =>
      chip(paper, bx - 430 + i * 430, by + 110, text, inn(t, n.at('outro', word)), i === 2 ? '#fbe7a6' : '#fffdf8', INK, '800 30px Montserrat', 810 + i));
    for (let i = 0; i < 6; i++) if (t > t0 + 1.2) sparkle(paper, { x: bx - 600 + i * 240 + 20 * Math.sin(t * 2 + i), y: by - 230 + 30 * Math.sin(t * 3 + i * 1.7) }, 14 + 6 * Math.sin(t * 4 + i), i % 2 ? GOLD : '#f6c4be', 820 + i);
  }
}
