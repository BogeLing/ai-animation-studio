import { type Paper, type V, Leap, Spring, blink, circlePoly, clamp } from '../../src';

const CLAY = '#d9774f', CLAY_LT = '#eb9a70', CLAY_DK = '#b95a37', INK = '#2b1913', SPARK = '#fff4e4';

/** What the scene asks of Clawd this step. `rest()` resets it, then the active beat sets it. */
export interface ClawdIntent {
  /** Body tilt about the feet (rad, + leans right). */
  lean: number;
  /** Squash target: + flat and wide, − tall and thin. */
  crouch: number;
  /** Arm angles (rad): 0 straight out to that side, negative raises it, positive lowers it. */
  armR: number;
  armL: number;
  /** Where the eyes look, −1…1 on each axis. */
  look: V;
  /** 0…1: the eyes turn in toward each other. */
  cross: number;
  /** 0…1: surprise: taller eyes and a small open mouth. */
  wide: number;
  squint: number;
  /** 0…1: the eyes close into happy arcs, a smile and blushing cheeks. */
  happy: number;
  /** 0…1: a smile and blushing cheeks with the eyes left open. */
  smile: number;
  /** 0…1: dazzled: the eyes squeeze shut into chevrons. */
  dazzle: number;
  /** 0…1: wearing a VR headset: a visor over the eyes, a strap across the block. */
  visor: number;
}

/** What a headset hook gets: Clawd's local space (feet at 0,0), already leaned, squashed and lifted. */
export interface Wearing {
  u: number;
  /** Half the body's width. */
  half: number;
  /** 0…1 as the headset slides down over the eyes. */
  visor: number;
  seed: number;
  lens: number;
  t: number;
  /** The body block's outline, to keep straps on it. */
  body: V[];
  /** Height of the eye line (negative, up). */
  eyeY: number;
  look: V;
}

const REST: ClawdIntent = { lean: 0, crouch: 0, armR: 0.5, armL: 0.5, look: { x: 0.35, y: 0 }, cross: 0, wide: 0, squint: 0, happy: 0, smile: 0, dazzle: 0, visor: 0 };

/** Outline of a rounded rectangle from (x0, y0) to (x1, y1). */
export function rrect(x0: number, y0: number, x1: number, y1: number, r: number): V[] {
  const rr = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2), pts: V[] = [];
  const corners: [number, number, number][] = [[x1 - rr, y0 + rr, -Math.PI / 2], [x1 - rr, y1 - rr, 0], [x0 + rr, y1 - rr, Math.PI / 2], [x0 + rr, y0 + rr, Math.PI]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= 4; i++) {
      const a = a0 + (i / 4) * (Math.PI / 2);
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
  }
  return pts;
}

/**
 * Clawd cut from one sheet of terracotta paper: a block on four stubby legs, two arm nubs and two
 * slit eyes, seen from the front. Life comes from springs on the lean, the squash, the arms, the eyes
 * and a planned hop; the scene only sets intents.
 */
export class Clawd {
  readonly intent: ClawdIntent = { ...REST, look: { ...REST.look } };
  /** Line-weight factor for the camera's zoom (about zoom^-0.55). */
  lens = 1;
  private readonly leanS = new Spring({ x: 0, y: 0 }, 110, 10);
  private readonly squashS = new Spring({ x: 0, y: 0 }, 330, 12);
  private readonly armRS = new Spring({ x: REST.armR, y: 0 }, 320, 18);
  private readonly armLS = new Spring({ x: REST.armL, y: 0 }, 210, 12);
  private readonly lookS = new Spring({ ...REST.look }, 170, 22);
  private readonly wideS = new Spring({ x: 0, y: 0 }, 300, 15);
  private squint = 0;
  private happy = 0;
  private smile = 0;
  private cross = 0;
  private leap: Leap | null = null;
  private flight = 0;
  private lift = 0;
  private landedFlag = false;
  private time = 0;
  /** Body width: 1 is the original block; smaller is slimmer (legs, arms, eyes and cheeks follow). */
  width = 1;
  /** Draws the headset instead of the built-in visor, as its own paper on top of the body; Clawd's eyes hide once it is seated. */
  wear: ((paper: Paper, w: Wearing) => void) | null = null;

  constructor(public root: V, readonly u: number, private readonly seed: number, private readonly blinks: number[]) {}

  /** Half the body's width. */
  get half(): number { return 5 * this.u * this.width; }

  rest(): void { Object.assign(this.intent, REST, { look: { ...REST.look } }); }

  /** Add squash velocity: + slams it flat, − stretches it tall. */
  kick(amount: number): void { this.squashS.vel.x += amount; }

  /** A small hop on the spot, `height` px. */
  hop(height: number): void {
    this.leap = new Leap({ x: 0, y: 0 }, { x: 0, y: 0 }, height, 2800);
    this.flight = 0;
    this.kick(-7);
  }

  /** True once after each hop lands. */
  consumeLanding(): boolean { const l = this.landedFlag; this.landedFlag = false; return l; }

  get armAngle(): number { return this.armRS.pos.x; }

  update(dt: number, t: number): void {
    const i = this.intent;
    this.time = t;
    this.leanS.step({ x: i.lean, y: 0 }, dt);
    this.squashS.step({ x: i.crouch, y: 0 }, dt);
    this.armRS.step({ x: i.armR, y: 0 }, dt);
    this.armLS.step({ x: i.armL, y: 0 }, dt);
    this.lookS.step(i.look, dt);
    this.wideS.step({ x: i.wide, y: 0 }, dt);
    const k = 1 - Math.exp(-dt * 16), kh = 1 - Math.exp(-dt * 9);
    this.squint += (i.squint - this.squint) * k;
    this.cross += (i.cross - this.cross) * k;
    this.happy += (i.happy - this.happy) * kh;
    this.smile += (i.smile - this.smile) * kh;
    if (this.leap) {
      this.flight += dt;
      this.lift = -this.leap.at(this.flight).y;
      if (this.flight >= this.leap.duration) { this.leap = null; this.lift = 0; this.kick(9); this.landedFlag = true; }
    }
  }

  private get squash(): number { return clamp(this.squashS.pos.x, -1.3, 1.3); }

  /** Clawd's local space (front view, feet at 0,0, +y down) → world, with lean, squash and hop. */
  map(p: V): V {
    const s = this.squash, x = p.x * (1 + 0.2 * s), y = p.y * (1 - 0.2 * s);
    const a = this.leanS.pos.x, c = Math.cos(a), sn = Math.sin(a);
    return { x: this.root.x + x * c - y * sn, y: this.root.y - this.lift + x * sn + y * c };
  }

  private arm(side: 1 | -1, angle: number): { base: V; tip: V; dir: V } {
    const u = this.u, base = { x: side * (this.half - 0.3 * u), y: -5.2 * u }, dir = { x: side * Math.cos(angle), y: Math.sin(angle) };
    return { base, dir, tip: { x: base.x + dir.x * 2.5 * u, y: base.y + dir.y * 2.5 * u } };
  }

  /** The tip of the right arm (world), where a held thing sits, and the arm's world angle. */
  hand(): { at: V; angle: number } {
    const R = this.arm(1, this.armRS.pos.x), s = this.squash;
    return { at: this.map(R.tip), angle: Math.atan2(R.dir.y * (1 - 0.2 * s), R.dir.x * (1 + 0.2 * s)) + this.leanS.pos.x };
  }

  /** A point on top of the body at local x (world), and the body's tilt there. */
  top(x: number): { at: V; angle: number } {
    return { at: this.map({ x, y: -8 * this.u }), angle: this.leanS.pos.x };
  }

  /** Middle of the eyes (world), to aim the look. */
  get eyes(): V { return this.map({ x: 0, y: -5.6 * this.u }); }

  get height(): number { return this.lift; }

  draw(paper: Paper): void {
    const ctx = paper.context, u = this.u, k = this.lens, s = this.squash;
    const air = clamp(this.lift / 140);
    ctx.save();
    ctx.fillStyle = `rgba(44, 56, 24, ${0.34 * (1 - air * 0.55)})`;
    ctx.filter = 'blur(3px)';
    ctx.beginPath();
    ctx.ellipse(this.root.x + this.leanS.pos.x * 14, this.root.y + 2, (this.half + 0.9 * u) * (1 + 0.18 * s) * (1 - air * 0.3), 0.95 * u * (1 - air * 0.3), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(this.root.x, this.root.y - this.lift);
    ctx.rotate(this.leanS.pos.x);
    ctx.scale(1 + 0.2 * s, 1 - 0.2 * s);
    const R = this.arm(1, this.armRS.pos.x), L = this.arm(-1, this.armLS.pos.x);
    paper.sheet({ shadow: 8, rim: { color: '#ffc9a3', width: 3.6 * k }, shade: { color: 'rgba(96, 32, 12, 0.3)', width: 11 * k }, anchor: { x: 0, y: 0 } }, () => {
      paper.tube([L.base, L.tip], 1.25 * u, 1.1 * u, CLAY, { seed: this.seed + 1, tear: 0.9 });
      paper.tube([R.base, R.tip], 1.25 * u, 1.1 * u, CLAY, { seed: this.seed + 2, tear: 0.9 });
      const half = this.half, leg = 0.55 * u * (0.6 + 0.4 * this.width);
      [-0.81, -0.47, 0.47, 0.81].forEach((f, j) => paper.piece(rrect(f * half - leg, -2.6 * u, f * half + leg, 0, 0.3 * u), CLAY, { seed: this.seed + 10 + j, tear: 0.8 }));
      paper.piece(rrect(-half, -8 * u, half, -2 * u, 0.7 * u), CLAY, { seed: this.seed, tear: 1.5 });
      paper.inside(() => {
        paper.piece(rrect(-half - u, -2.02 * u, half + u, 0.6 * u, 0), CLAY_DK, { seed: this.seed + 20, tear: 0.7 });
        paper.piece(rrect(-half - 0.3 * u, -8.5 * u, half + 0.3 * u, -7.4 * u, 0), CLAY_LT, { seed: this.seed + 21, tear: 0.9 });
        this.face(paper);
      });
    });
    const visor = clamp(this.intent.visor);
    if (this.wear && visor > 0) {
      this.wear(paper, { u, half: this.half, visor, seed: this.seed, lens: k, t: this.time, body: rrect(-this.half, -8 * u, this.half, -2 * u, 0.7 * u), eyeY: -5.5 * u, look: this.lookS.pos });
    }
    ctx.restore();
  }

  private face(paper: Paper): void {
    const u = this.u, look = this.lookS.pos, wide = clamp(this.wideS.pos.x, -0.2, 1.3), happy = this.happy;
    const open = blink(this.time, this.blinks, 0.065), covered = this.wear !== null && this.intent.visor > 0.9;
    for (const side of [-1, 1] as const) {
      if (covered) break;
      const lx = clamp(look.x - side * this.cross * 0.75, -1.3, 1.3), ly = clamp(look.y, -1.2, 1.2);
      const cx = side * 2.45 * u * (0.6 + 0.4 * this.width) + lx * 0.8 * u, cy = -5.45 * u + ly * 0.62 * u;
      if (this.intent.dazzle > 0.5) {
        paper.tube([{ x: cx + 0.55 * side * u, y: cy - 0.6 * u }, { x: cx - 0.45 * side * u, y: cy }, { x: cx + 0.55 * side * u, y: cy + 0.6 * u }], 0.42 * u, 0.42 * u, INK, { seed: this.seed + 44 + side, tear: 0.3 });
        continue;
      }
      if (happy > 0.5) {
        const curl = 0.2 + 0.6 * clamp((happy - 0.5) / 0.5);   // the arc bends up as the smile grows
        paper.tube([{ x: cx - 0.62 * u, y: cy + 0.25 * u }, { x: cx, y: cy - curl * u }, { x: cx + 0.62 * u, y: cy + 0.25 * u }], 0.46 * u, 0.46 * u, INK, { seed: this.seed + 40 + side, tear: 0.4 });
        continue;
      }
      const w = u * (1 + 0.2 * wide);
      const h = 2.2 * u * (1 + 0.32 * wide) * (1 - 0.5 * this.squint) * Math.max(0.1, open) * (1 - 1.5 * happy);
      paper.piece(rrect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2, Math.min(w, h) * 0.42), INK, { seed: this.seed + 30 + side, tear: 0.45 });
      if (h > 0.8 * u) paper.piece(circlePoly({ x: cx + w * 0.17, y: cy - h * 0.26 }, 0.17 * u, 10), SPARK, { seed: this.seed + 34 + side, tear: 0.2 });
    }
    const visor = clamp(this.intent.visor);
    if (visor > 0 && !this.wear) {
      // The headset slides down over the eyes: a strap across the block, a dark visor with a lens sheen.
      const y = -5.5 * u - (1 - visor) * 3 * u;
      paper.piece(rrect(-5.4 * u, y - 0.45 * u, 5.4 * u, y + 0.45 * u, 0.3 * u), '#3a3f4b', { seed: this.seed + 80, tear: 0.4 });
      paper.piece(rrect(-4.1 * u, y - 1.35 * u, 4.1 * u, y + 1.35 * u, 0.9 * u), '#2b2f3a', { seed: this.seed + 81, tear: 0.5 });
      paper.piece(rrect(-3.6 * u, y - 0.95 * u, 3.6 * u, y + 0.55 * u, 0.7 * u), '#4d6fd0', { seed: this.seed + 82, tear: 0.4 });
      paper.piece([{ x: -3.2 * u, y: y - 0.8 * u }, { x: -1.4 * u, y: y - 0.8 * u }, { x: -2.3 * u, y: y + 0.4 * u }, { x: -3.2 * u, y: y + 0.4 * u }], 'rgba(255, 255, 255, 0.35)', { seed: this.seed + 83, tear: 0.2 });
    }
    const mx = look.x * 0.45 * u, joy = Math.max(clamp((happy - 0.35) / 0.5), clamp(this.smile));
    if (wide > 0.4 && joy < 0.3) {
      const m = clamp((wide - 0.4) / 0.5);
      paper.piece(circlePoly({ x: mx, y: -3.35 * u }, 0.44 * u * m, 14, 0.36 * u * m), INK, { seed: this.seed + 50, tear: 0.3 });
    }
    if (joy > 0) {
      const m = joy;
      for (const side of [-1, 1]) paper.piece(circlePoly({ x: side * 0.71 * this.half + mx * 0.5, y: -3.95 * u }, 0.42 * u, 16, 0.85 * u), `rgba(246, 128, 116, ${0.62 * m})`, { seed: this.seed + 60 + side, tear: 0.5 });
      const w = 0.85 * u * m, d = 0.75 * u * m, y0 = -3.8 * u;
      const mouth: V[] = [{ x: mx - w, y: y0 }, ...Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * Math.PI; return { x: mx + Math.cos(a) * w, y: y0 + Math.sin(a) * d }; }).reverse().slice(1)];
      paper.piece(mouth, INK, { seed: this.seed + 70, tear: 0.3 });
      paper.piece(circlePoly({ x: mx, y: y0 + d * 0.68 }, d * 0.3, 12, w * 0.5), '#e86b5c', { seed: this.seed + 71, tear: 0.2 });
    }
  }
}
