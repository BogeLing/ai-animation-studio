import type { Stage, Stereo } from '../../src';

/**
 * A film playing inside a scene, e.g. on a paper TV: another stage on a canvas of its own, stepped in lockstep with
 * the scene (so every render worker sees the same frames) and drawn wherever the scene puts it. It starts at
 * scene time `start`, `from` seconds into the film's video, and holds a frame once it reaches `until` (by default
 * the film's end), e.g. to stop before its end card.
 *
 * @example
 * this.tv = new Screen(canvas => new ShowcaseScene(canvas, { captions: false }), 0, 2.3);
 * update(t) { this.tv.step(t); }                                      // before drawing
 * draw()    { this.tv.draw(this.paper.context, x - 480, y - 270, 960, 540); }
 * soundtrack(sr) { const film = this.tv.sound(sr, 6); … }            // its sound, to mix in at `start`
 */
export class Screen {
  readonly stage: Stage;
  private frame = -1;

  constructor(make: (canvas: HTMLCanvasElement) => Stage, readonly start = 0, readonly from = 0, readonly until = Infinity, width = 1920, height = 1080) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    this.stage = make(canvas);
  }

  /** The film's frame at scene time t. */
  frameAt(t: number): number {
    const s = this.stage;
    return Math.max(0, Math.min(s.frames - 1, Math.round(Math.min(this.until, this.from + Math.max(0, t - this.start)) * s.fps)));
  }

  /** Simulate the film up to scene time t (call it from the scene's update, every step). */
  step(t: number): void {
    const f = this.frameAt(t);
    if (f > this.frame) {
      this.stage.advance(f);
      this.frame = f;
    }
  }

  /** Draw the film's current frame into the rectangle x, y, w, h of `ctx` (in its current transform). */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    this.stage.renderFrame(Math.max(0, this.frame));
    ctx.drawImage(this.stage.canvas, x, y, w, h);
  }

  /**
   * The film's own sound from `from` for `seconds`, faded in and out over `fade`, or null if it has none. Call it
   * after the scene has been simulated to its end (as `Stage.soundtrack` is), so the film's cues are all logged.
   */
  sound(sampleRate: number, seconds: number, fade = 0.25): Stereo | null {
    const mix = this.stage.soundtrack(sampleRate);
    if (!mix) return null;
    const a = Math.round(this.from * sampleRate), n = Math.min(Math.round(seconds * sampleRate), mix.left.length - a), f = Math.max(1, fade * sampleRate);
    const cut = (x: Float32Array) => {
      const out = x.slice(a, a + Math.max(0, n));
      for (let i = 0; i < out.length; i++) out[i] *= Math.min(1, i / f, (out.length - 1 - i) / f);
      return out;
    };
    return { left: cut(mix.left), right: cut(mix.right) };
  }
}
