import { type Letter, type Paper, clamp, layoutLetters, overshoot, smoothstep, textWidth } from '../../src';
import { card, place, rrect } from './kit';

/** A word of the title. With `letters`, each letter drops on its own; otherwise the word drops as one. */
export interface TitleWord { text: string; font: string; color: string; letters?: boolean }

export interface TitleOpts {
  /** The words on one line, centred together, e.g. a name and an accent word in another colour or script. */
  words: TitleWord[];
  /** A line on a paper card under the title. */
  subtitle?: { text: string; font: string; color: string; paper?: string };
  /** Baseline of the title line; the subtitle card sits `subtitleGap` below it. */
  y: number;
  subtitleGap?: number;
  /** When the first letter starts to fall, and the gap between letters (s). */
  at: number;
  stagger?: number;
  /** When the whole title lifts away (omit to keep it). */
  out?: number;
  /** Frame width, for centring; the gap between words. */
  width?: number;
  gap?: number;
}

/**
 * A title cut from paper that drops in letter by letter with a bounce and a small alternating twist, then an
 * accent word, then a subtitle card, and can lift away as a whole. `landings` gives the moment each letter and
 * word lands, for sound cues.
 *
 * @example
 * this.title = new TitleCard(this.ctx, { words: [{ text: 'PAPER', font: '800 210px Montserrat', color: '#2d3a4a', letters: true }], y: 440, at: 0.5, out: 3.3 });
 * draw(t) { this.title.draw(this.paper, t); }
 */
export class TitleCard {
  /** Scene time at which each letter (of `letters` words) and each whole word lands. */
  readonly landings: number[] = [];
  private readonly layout: { word: TitleWord; x: number; letters: Letter[]; start: number }[] = [];
  private readonly subtitleAt: number;

  constructor(ctx: CanvasRenderingContext2D, readonly o: TitleOpts) {
    const stagger = o.stagger ?? 0.09, gap = o.gap ?? 44, width = o.width ?? 1920;
    const widths = o.words.map(w => textWidth(ctx, w.text, w.font));
    let x = (width - widths.reduce((a, b) => a + b, 0) - gap * (o.words.length - 1)) / 2, start = o.at;
    o.words.forEach((word, i) => {
      const letters = word.letters ? layoutLetters(ctx, word.text, word.font).filter(l => l.ch.trim()) : [];
      this.layout.push({ word, x, letters, start });
      if (word.letters) {
        letters.forEach((_, k) => this.landings.push(start + k * stagger + 0.28));
        start += letters.length * stagger + 0.1;
      } else {
        this.landings.push(start + 0.25);
        start += 0.35;
      }
      x += widths[i] + gap;
    });
    this.subtitleAt = start + 0.1;
  }

  draw(paper: Paper, t: number): void {
    const o = this.o, stagger = o.stagger ?? 0.09, lift = o.out === undefined ? 0 : smoothstep(o.out, o.out + 0.6, t) * 750;
    if (t < o.at || lift >= 749) return;
    for (const { word, x, letters, start } of this.layout) {
      if (word.letters) {
        letters.forEach((l, k) => {
          const u = (t - start - k * stagger) / 0.45;
          if (u <= 0) return;
          const e = Math.min(1, u);
          paper.text(l.ch, { x: x + l.x, y: o.y - 140 * (1 - overshoot(e, 1.9)) - lift }, { font: word.font, color: word.color, angle: (1 - e) * 0.3 * (k % 2 ? 1 : -1), sheet: { shadow: 12, rim: { color: '#ffffff', width: 3 }, alpha: clamp(u / 0.12) } });
        });
      } else {
        const z = clamp((t - start) / 0.4);
        if (z > 0) paper.text(word.text, { x, y: o.y - 8 - 60 * (1 - overshoot(z, 1.8)) - lift }, { font: word.font, color: word.color, sheet: { shadow: 10, rim: { color: '#ffffff', width: 3 }, alpha: z } });
      }
    }
    const sub = o.subtitle, s = clamp((t - this.subtitleAt) / 0.35);
    if (!sub || s <= 0) return;
    const w = textWidth(paper.context, sub.text, sub.font);
    place(paper, (o.width ?? 1920) / 2, o.y + (o.subtitleGap ?? 100) - lift, 0.9 + 0.1 * overshoot(s, 1.6), 0, () => {
      card(paper, () => paper.piece(rrect(-w / 2 - 30, -46, w / 2 + 30, 22, 10), sub.paper ?? '#fbf4e6', { seed: 240, tear: 1.2 }), { shadow: 8, alpha: s });
      paper.text(sub.text, { x: 0, y: 0 }, { font: sub.font, color: sub.color, align: 'center', sheet: { shadow: 0, alpha: s } });
    });
  }
}
