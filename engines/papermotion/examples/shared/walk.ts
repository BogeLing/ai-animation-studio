import { clamp, easeInOut, lerp } from '../../src';

/** One move: from x `a` to `b`, starting at `start` and lasting `duration` s, in `hops` hops up to `height` px. */
export interface Hop { a: number; b: number; start: number; duration: number; hops: number; height: number }

/**
 * A character's walk as hop moves along x; between moves it stands still. Each move eases in and out along x
 * while the hops bounce (|sin|), so the character lands exactly at the end. `landings()` lists every
 * touchdown for hop sounds, so nothing has to detect them frame by frame.
 *
 * Keep a move at 1.5 s or more of video: a 0.5 s whip with several hops reads as a jump cut.
 *
 * @example
 * const walk = new HopPath([{ a: -400, b: 500, start: 1.4, duration: 1.2, hops: 3, height: 60 }]);
 * update(t) { const { x, lift } = walk.at(t); clawd.root = { x, y: GROUND - lift }; }
 */
export class HopPath {
  constructor(readonly moves: Hop[]) {
    if (!moves.length) throw new Error('HopPath needs at least one move');
    for (let i = 1; i < moves.length; i++) if (moves[i].start < moves[i - 1].start + moves[i - 1].duration) throw new Error(`move ${i} starts before move ${i - 1} ends`);
  }

  /** Where the character is at `t`: x, height above the ground, and whether it is mid-move. */
  at(t: number): { x: number; lift: number; moving: boolean } {
    let x = this.moves[0].a;
    for (const m of this.moves) {
      if (t < m.start) break;
      const u = clamp((t - m.start) / m.duration);
      x = lerp(m.a, m.b, easeInOut(u));
      if (u < 1) return { x, lift: Math.abs(Math.sin(u * Math.PI * m.hops)) * m.height, moving: true };
    }
    return { x, lift: 0, moving: false };
  }

  /** Every touchdown, in order; the last one of each move is the arrival. */
  landings(): number[] {
    return this.moves.flatMap(m => Array.from({ length: m.hops }, (_, k) => m.start + (m.duration * (k + 1)) / m.hops));
  }

  /** When each move ends. */
  arrivals(): number[] { return this.moves.map(m => m.start + m.duration); }
}

/**
 * A camera target that keeps a character at a fixed offset, clamped to the film's extent. Feed it to the
 * camera's spring every step so the camera travels with the character instead of racing ahead of it.
 */
export const follow = (x: number, offset: number, min: number, max: number): number => clamp(x + offset, min, max);
