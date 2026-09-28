import { type Paper, clamp, overshoot, textWidth } from '../../src';
import { card, place, rrect } from './kit';

/** One caption: shown from `from` to `to` (scene seconds). `highlight` prints it on a brighter strip (a rule, a punchline). */
export interface CaptionLine { from: number; to: number; text: string; highlight?: boolean }

export interface CaptionStyle {
  /** Canvas font, e.g. `'800 44px Montserrat'` or `'900 46px "Noto Sans SC"'` (load web fonts before the stage measures). */
  font: string;
  /** Centre of the strip; defaults to the middle of the frame and near its bottom edge. */
  x: number;
  y: number;
  height: number;
  /** Space between the text and the strip's ends. */
  padding: number;
  paper: string;
  highlight: string;
  ink: string;
  /** Torn-edge wobble of the strip (px). */
  tear: number;
  /** The new strip waits this long after `from`, so the old one has already started to fall. */
  delay: number;
  /** Seconds to land and to fall away. */
  land: number;
  fall: number;
}

const DEFAULTS: CaptionStyle = {
  font: '800 44px Montserrat', x: 960, y: 978, height: 80, padding: 36, paper: '#ecdfc6', highlight: '#fbe7a6', ink: '#2b2521',
  tear: 1.6, delay: 0.12, land: 0.28, fall: 0.3,
};

/**
 * Captions as strips of kraft paper at the bottom of the frame. Each one is laid down with a small bounce and a
 * slight tilt (alternating left and right), then drops away and fades as the next arrives. They change by
 * physical action, never by crossfading text in place. The strip grows to fit its text. Draw them in screen
 * space, after the camera layers.
 *
 * @example
 * const subs = new Captions([{ from: 3.8, to: 6, text: 'The cache holds three cards' }]);
 * draw(t) { …; subs.draw(this.paper, t); }
 */
export class Captions {
  readonly style: CaptionStyle;

  constructor(readonly lines: CaptionLine[], style: Partial<CaptionStyle> = {}) {
    this.style = { ...DEFAULTS, ...style };
  }

  /** Every caption's text in one string, e.g. to load a web font's glyphs: `document.fonts.load(font, subs.text)`. */
  get text(): string { return this.lines.map(l => l.text).join(''); }

  draw(paper: Paper, t: number): void {
    const s = this.style, h = s.height / 2;
    this.lines.forEach((line, i) => {
      if (t < line.from || t > line.to + s.fall) return;
      const u = clamp((t - line.from - s.delay) / s.land), out = clamp((t - line.to) / s.fall);
      if (u <= 0) return;
      const w = textWidth(paper.context, line.text, s.font) + s.padding * 2, alpha = clamp(u / 0.25) * (1 - out);
      const tilt = (i % 2 ? -0.008 : 0.008) + 0.04 * (1 - u) + out * 0.18;
      place(paper, s.x, s.y + 240 * out * out, 1 + 0.08 * (1 - overshoot(u, 1.6)), tilt, () => {
        card(paper, () => paper.piece(rrect(-w / 2, -h, w / 2, h, 4), line.highlight ? s.highlight : s.paper, { seed: 200 + i, tear: s.tear }), { shadow: 6 + 14 * (1 - u), alpha });
        paper.text(line.text, { x: 0, y: h * 0.38 }, { font: s.font, color: s.ink, align: 'center', sheet: { shadow: 0, alpha } });
      });
    });
  }
}
