import { type Paper, type V, Spring, clamp, noise1, smooth } from '../../src';

/** A smooth path through control points, measured by arc length, for something to fly along. */
export class Track {
  readonly pts: V[];
  private readonly cum: number[] = [0];
  readonly length: number;

  constructor(ctrl: V[], samples = 10) {
    this.pts = smooth(ctrl, samples);
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].y - this.pts[i - 1].y));
    this.length = this.cum[this.cum.length - 1];
  }

  /** Position at arc length `s` (clamped to the path). */
  at(s: number): V {
    const c = this.cum, x = clamp(s, 0, this.length);
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= x) lo = m; else hi = m; }
    const a = this.pts[lo], b = this.pts[hi], f = (x - c[lo]) / (c[hi] - c[lo] || 1);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  }

  /** Unit heading at arc length `s`, measured over a short chord so it turns smoothly. */
  heading(s: number): V {
    const a = this.at(s - 7), b = this.at(s + 7), l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  }
}

/** Speed (px/s) along a track, piecewise linear over `[fraction of length, speed]` keys. */
function speedAt(keys: readonly [number, number][], u: number): number {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const [u0, v0] = keys[i - 1], [u1, v1] = keys[i];
      return v0 + (v1 - v0) * ((u - u0) / (u1 - u0));
    }
  }
  return keys[keys.length - 1][1];
}

// The dart seen from the side, nose at +x: the upper wing, the near wing below the fold, the keel.
const NOSE: V = { x: 50, y: 0 }, NOTCH: V = { x: -31, y: -1 };
const LOWER: V[] = [NOSE, NOTCH, { x: -46, y: 15 }];
const KEEL: V[] = [{ x: -4, y: 1.5 }, { x: -30, y: 0 }, { x: -25, y: 10 }];
/** Where a hand pinches it: under the fold, toward the tail. */
const GRIP: V = { x: -21, y: 6 };

export type PlaneMode = 'held' | 'fly' | 'free';

/**
 * A paper dart. It is held (the holder sets where), flies along a `Track` with a speed profile, or is
 * placed freely by the scene (a stall, a perch). Its pitch always follows a spring, so the nose lags
 * a little behind every turn, and it flutters with speed.
 */
export class PaperPlane {
  pos: V;
  mode: PlaneMode = 'held';
  /** Paper turn: 1 faces right, −1 faces left, squashing through 0 on the way. */
  face = 1;
  lens = 1;
  speed = 0;
  /** Unwrapped heading of the track (rad), for events along a loop. */
  heading = 0;
  private readonly pitch: Spring;
  private track: Track | null = null;
  private profile: readonly [number, number][] = [];
  private s = 0;
  private time = 0;

  constructor(pos: V, pitch: number, private readonly seed: number) {
    this.pos = { ...pos };
    this.pitch = new Spring({ x: pitch, y: 0 }, 560, 32);
  }

  get angle(): number { return this.pitch.pos.x; }

  /** True once the current track has been flown to its end. */
  get arrived(): boolean { return this.mode === 'fly' && !!this.track && this.s >= this.track.length; }

  /** Turn the nose toward `angle` (rad, as drawn: see `draw`), taking the short way round. */
  aim(angle: number, dt: number): void {
    const cur = this.pitch.pos.x;
    this.pitch.step({ x: angle + 2 * Math.PI * Math.round((cur - angle) / (2 * Math.PI)), y: 0 }, dt);
  }

  /** Pitch that points the nose along direction `d` for the current facing. */
  pitchFor(d: V): number {
    const f = this.face < 0 ? -1 : 1;
    return Math.atan2(f * d.y, f * d.x);
  }

  /** Pinch it at `hand`, nose pitched toward `angle`. */
  hold(hand: V, angle: number, dt: number): void {
    this.mode = 'held';
    this.aim(angle, dt);
    const a = this.pitch.pos.x, gx = GRIP.x * this.face;
    this.pos = { x: hand.x - (gx * Math.cos(a) - GRIP.y * Math.sin(a)), y: hand.y - (gx * Math.sin(a) + GRIP.y * Math.cos(a)) };
  }

  fly(track: Track, profile: readonly [number, number][]): void {
    this.track = track;
    this.profile = profile;
    this.s = 0;
    this.mode = 'fly';
    const d = track.heading(0);
    this.heading = Math.atan2(d.y, d.x);
  }

  update(dt: number, t: number): void {
    this.time = t;
    if (this.mode !== 'fly' || !this.track) return;
    const tr = this.track;
    this.speed = speedAt(this.profile, this.s / tr.length);
    this.s = Math.min(tr.length, this.s + this.speed * dt);
    this.pos = tr.at(this.s);
    const d = tr.heading(this.s), h = Math.atan2(d.y, d.x);
    this.heading = h + 2 * Math.PI * Math.round((this.heading - h) / (2 * Math.PI));
    this.aim(this.pitchFor(d), dt);
  }

  draw(paper: Paper): void {
    const ctx = paper.context, k = this.lens, t = this.time;
    const flying = this.mode === 'fly' ? clamp(this.speed / 900) : 0;
    const flutter = noise1(t * 13, this.seed) * 0.05 * flying;
    const flex = noise1(t * 17, this.seed + 5) * 1.8 * flying;   // the upper wing gives a little in the air
    const upper: V[] = [NOSE, { x: -45, y: -19 + flex }, NOTCH];
    const f = Math.abs(this.face) < 0.04 ? 0.04 * (this.face < 0 ? -1 : 1) : this.face;
    ctx.save();
    ctx.translate(this.pos.x, this.pos.y);
    ctx.rotate(this.pitch.pos.x + flutter);
    ctx.scale(f, 1);
    paper.sheet({ shadow: 7, rim: { color: '#ffffff', width: 2.4 * k }, shade: { color: 'rgba(84, 70, 52, 0.2)', width: 4.5 * k }, anchor: { x: 0, y: 0 } }, () => {
      paper.piece(upper, '#fffaf1', { seed: this.seed, tear: 0.7 });
      paper.piece(LOWER, '#fffaf1', { seed: this.seed + 1, tear: 0.7 });
      paper.inside(() => {
        paper.piece(LOWER, '#ebe0cc', { seed: this.seed + 1, tear: 0.7 });
        paper.piece(KEEL, '#d3c3aa', { seed: this.seed + 2, tear: 0.5 });
        paper.line([NOSE, NOTCH], 'rgba(146, 126, 100, 0.85)', 1.6 * k);
      });
    });
    ctx.restore();
  }
}
