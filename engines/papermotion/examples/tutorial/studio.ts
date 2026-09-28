import { Camera, Stage, type Stereo, type View, fillGradient, grain, smoothstep, vignette, wash } from '../../src';
import { Captions } from '../shared/captions';
import { Clawd } from '../shared/Clawd';
import { CueClock, card, place, pop, rrect } from '../shared/kit';
import { type Voice, Narration } from '../shared/narration';
import { Screen } from '../shared/screen';
import { TitleCard, type TitleWord } from '../shared/title';
import { type Hop, HopPath } from '../shared/walk';
import { Boards } from './boards';
import { soundtrack as score } from './sound';
import type { TutorialText } from './text';

const W = 1920, H = 1080, G = 905;
const X = (i: number) => 960 + i * 2000;
/** Clawd presents from this far left of a stop's centre; at a title, a little closer; beside the paper TV, further. */
const PRESENTER = 780, TITLE_SPOT = 420, TV_SPOT = 700;
const BOARD_Y = 470;
/** The paper TV of a film-first opening: its screen, which the camera starts on at full frame. */
const TV = { y: 430, w: 960, h: 540 };

/** A sound on a board's beat: when `word` is said in narration block `block`, `after` seconds later. */
export interface Beat { block: string; word: string; sound: string; after?: number; pan?: number; gain?: number; data?: Record<string, number> }

/** One stop along the studio wall: the narration blocks told there, and the board pinned there (none at stop 0). */
export interface Stop { blocks: string[]; header?: string; board?: (b: Boards, bx: number, by: number, t: number) => void }

/** A film told along the studio wall: its stops in order, what opens it, and the sounds on its boards' beats. */
export interface Plan {
  stops: Stop[];
  /** Stop 0 is a title card that drops in letter by letter and lifts away as the camera leaves… */
  title?: { words: TitleWord[]; subtitle?: string };
  /** …or a film playing on a paper TV (from `from` seconds into it), full frame until the narrator says `pull`'s
   * word, when the camera pulls back to the wall. */
  screen?: { make: (canvas: HTMLCanvasElement) => Stage; from: number; until?: number; pull: [block: string, word: string] };
  /** Beats of blocks this narration doesn't have are skipped, so one list can serve every film. */
  beats: Beat[];
  /** The camera leaves stop 0 this long before its narration ends, instead of 0.7 s before the next block. */
  leave?: number;
  /** When the narration starts, and how long the film runs on after it (defaults 1 s and 3.2 s). */
  voiceAt?: number;
  tail?: number;
  /** When Clawd blinks. */
  blinks?: number[];
  /** The boards, when a film pins boards of its own (a subclass of Boards). */
  boards?: (paper: Stage['paper'], n: Narration, text: TutorialText) => Boards;
}

const PAN: Record<string, number> = { pip: 0.2, typing: 0.1, stamp: 0.3, ding: 0.4, shutter: 0.2 };
const GAIN: Record<string, number> = { pip: 0.7 };

/**
 * A film told by a narration along a paper studio wall: Clawd hops from board to board, what's on each board pops
 * in on the narrator's words, subtitles follow the voice, and a quiet lo-fi bed runs underneath. `Plan` says which
 * boards, in what order, and how it opens; re-voicing the script re-times the whole film.
 */
export class StudioScene extends Stage {
  readonly narration: Narration;
  private readonly cam = new Camera(X(0), { width: W, height: H, stiffness: 10, damping: 6.3, handheld: 1.3, ease: 3 });
  private readonly clawd: Clawd;
  private readonly moments = new CueClock();
  private readonly title?: TitleCard;
  private readonly subs: Captions;
  private readonly boards: Boards;
  private readonly walk: HopPath;
  readonly screen?: Screen;
  /** When the camera pulls back from the TV (a film-first opening), and when the score comes in. */
  readonly pull: number;
  readonly musicAt: number;
  /** When the camera sets off for each stop. */
  readonly arrive: number[] = [0];
  readonly voiceAt: number;
  /** Seconds the film runs on after the narration. */
  readonly tail: number;
  private readonly stopOf = new Map<string, number>();

  constructor(canvas: HTMLCanvasElement, readonly voice: Voice, readonly text: TutorialText, readonly plan: Plan) {
    const voiceAt = plan.voiceAt ?? 1.0;
    super(canvas, { duration: voiceAt + voice.length + (plan.tail ?? 3.2), preroll: 0.4 });
    this.voiceAt = voiceAt;
    this.tail = plan.tail ?? 3.2;
    this.paper.light = { x: -0.45, y: 0.85 };
    plan.stops.forEach((s, i) => s.blocks.forEach(b => this.stopOf.set(b, i)));
    const spot = plan.screen ? TV_SPOT : TITLE_SPOT;
    this.clawd = new Clawd({ x: X(0) - spot, y: G }, 18, 3300, plan.blinks ?? Array.from({ length: Math.ceil(this.duration / 8) }, (_, i) => 3.1 + i * 8 + ((i * 7) % 5) * 0.6));
    this.clawd.width = 0.8;
    this.narration = new Narration(voice, voiceAt, text.cues);
    const opening = voice.blocks.filter(b => this.stopOf.get(b.id) === 0).map(b => this.narration.block(b.id).end);
    const leaveAt = plan.leave !== undefined && opening.length ? Math.max(...opening) - plan.leave : undefined;
    const moves: Hop[] = [];
    let at = 0, from = X(0) - spot;
    for (const b of voice.blocks) {
      const s = this.stopOf.get(b.id);
      if (s === undefined) throw new Error(`narration block "${b.id}" has no stop`);
      if (s === at) continue;
      const start = Math.min(this.narration.block(b.id).start - 0.7, at === 0 && leaveAt !== undefined ? leaveAt : Infinity);
      moves.push({ a: from, b: X(s) - PRESENTER, start, duration: 1.3, hops: 4, height: 60 });
      this.arrive[s] = start;
      at = s;
      from = X(s) - PRESENTER;
    }
    this.walk = new HopPath(moves);
    this.subs = new Captions(this.narration.subtitles(9, text.captions.maxChars), { font: text.captions.font, y: 994, height: 66, padding: 30, delay: 0.04, land: 0.2, fall: 0.18 });
    this.boards = plan.boards ? plan.boards(this.paper, this.narration, text) : new Boards(this.paper, this.narration, text);
    if (plan.title) {
      this.title = new TitleCard(this.ctx, {
        words: plan.title.words,
        subtitle: plan.title.subtitle ? { text: plan.title.subtitle, font: `700 36px ${text.family}`, color: '#3d4654' } : undefined,
        y: 380, at: 0.3, stagger: 0.06, out: leaveAt ?? Math.max(...opening) + 0.2, subtitleGap: 100,
      });
    }
    if (plan.screen) this.screen = new Screen(plan.screen.make, 0, plan.screen.from, plan.screen.until);
    this.pull = plan.screen ? this.narration.at(...plan.screen.pull) : 0;
    this.musicAt = plan.screen ? this.pull : 0.1;
  }

  soundtrack(sampleRate: number): Stereo { return score(this, sampleRate); }

  /** Where the camera looks at stop s at time t: at the TV's screen, full frame, until the pull-back. */
  private view(s: number, t: number): { x: number; y: number; zoom: number } {
    const close = this.screen && s === 0 && t < this.pull;
    return close ? { x: X(0), y: TV.y, zoom: W / (TV.w - 14) } : { x: X(s), y: 540, zoom: 1 };
  }

  protected start(): void { this.cam.cut(this.view(0, 0)); }

  /** The stop the story is at (or heading to) at time t. */
  private station(t: number): number {
    let s = 0;
    this.arrive.forEach((at, i) => { if (at !== undefined && t >= at) s = i; });
    return s;
  }

  protected update(t: number, dt: number): void {
    this.moments.step(t);
    this.screen?.step(t);
    const c = this.clawd, { x, lift, moving } = this.walk.at(t), s = this.station(t);
    const block = this.voice.blocks.find(b => this.stopOf.get(b.id) === s && t >= b.start + this.voiceAt - 0.2 && t <= b.end + this.voiceAt + 0.3);
    const talking = !!block && !moving, swing = Math.sin(t * 14), end = this.narration.block('outro').start;
    c.rest();
    c.root = { x, y: G - lift };
    Object.assign(c.intent, {
      look: moving ? { x: 0.7, y: 0 } : s === 0 ? (this.screen ? { x: 0.7, y: -0.25 } : { x: 0.3, y: -0.4 }) : { x: 0.65, y: -0.35 },
      armR: moving ? 0.3 + 0.35 * swing : t < 3.6 || t > end ? -1 + 0.35 * Math.sin(t * 11) : talking ? -0.4 + 0.08 * Math.sin(t * 3) : 0.45,
      armL: moving ? 0.3 - 0.35 * swing : t > end + 1 ? -0.9 + 0.3 * Math.sin(t * 9 + 1) : 0.5,
      lean: moving ? 0.08 : talking ? 0.04 * Math.sin(t * 2.2) : 0,
      smile: 0.55,
      happy: t > end + 1.5 ? 1 : 0,
    });
    c.update(dt, t);
    this.boards.update(t, dt);
    this.cues();
  }

  private cues(): void {
    const hit = (at: number, name: string, pan: number, gain = 1, data: Record<string, number> = {}) => { if (this.moments.passed(at)) this.cue(name, { pan, gain, data }); };
    const n = this.narration;
    this.title?.landings.forEach((at, i) => hit(at, 'letter', -0.5 + i * 0.07, 1, { i }));
    if (this.screen) hit(this.pull, 'whoosh', 0, 0.5);
    this.walk.moves.forEach(m => hit(m.start, 'whoosh', 0.3, 0.6));
    this.walk.landings().forEach(at => hit(at, 'tap', -0.4, 0.6));
    this.arrive.forEach((at, i) => { if (i > 0) hit(at + 0.35, 'pop', 0.2); });
    // Words that make something appear on a board.
    for (const b of this.plan.beats) {
      if (this.stopOf.has(b.block) && this.voice.blocks.some(v => v.id === b.block)) hit(n.at(b.block, b.word) + (b.after ?? 0), b.sound, b.pan ?? PAN[b.sound] ?? 0, b.gain ?? GAIN[b.sound] ?? 1, b.data);
    }
  }

  protected lateUpdate(t: number, dt: number): void {
    this.cam.frame(this.view(this.station(t), t), dt, t);
  }

  probe(): Record<string, unknown> { return { ...super.probe(), camX: Math.round(this.cam.x), station: this.station(this.time), clawd: Math.round(this.clawd.root.x) }; }

  protected draw(t: number, frame: number): void {
    const { ctx, paper, cam } = this, stops = this.plan.stops;
    fillGradient(ctx, [[0, '#f5ead6'], [1, '#e9d8bb']]);
    cam.layer(paper, 1, v => {
      this.room(v);
      this.garland(v, t);
      if (this.screen && Math.abs(X(0) - cam.x) < 2300) this.tv();
      for (let i = 1; i < stops.length; i++) {
        const bx = X(i) + 120, board = stops[i].board;
        if (!board || this.arrive[i] === undefined || Math.abs(bx - cam.x) > 2300) continue;
        this.boards.frame(bx, BOARD_Y, pop(t, this.arrive[i] + 0.35, 0.5), stops[i].header ?? '', 900 + i, () => board(this.boards, bx, BOARD_Y, t));
      }
      this.clawd.draw(paper);
    });
    this.title?.draw(paper, t);
    this.subs.draw(paper, t);
    vignette(ctx, [60, 40, 20], 0.22);
    grain(ctx, frame, 0.04);
    wash(ctx, '#15110d', 1 - smoothstep(0, 0.35, t));
    wash(ctx, '#15110d', smoothstep(this.duration - 0.5, this.duration, t));
  }

  /** The paper TV at stop 0, playing its film: a dark bezel around the picture, and legs down to the floor. */
  private tv(): void {
    const { paper } = this, x = X(0), { y, w, h } = TV;
    for (const dx of [-300, 300]) card(paper, () => paper.piece(rrect(x + dx - 16, y + h / 2, x + dx + 16, G - 30, 6), '#6b5646', { seed: 61 + dx, tear: 0.6 }), { shadow: 6 });
    card(paper, () => paper.piece(rrect(x - w / 2 - 34, y - h / 2 - 34, x + w / 2 + 34, y + h / 2 + 58, 26), '#3a3431', { seed: 64, tear: 1 }), { shadow: 18 });
    this.screen?.draw(paper.context, x - w / 2, y - h / 2, w, h);
    for (const [i, c] of ['#e2574c', '#f2c14e'].entries()) card(paper, () => paper.piece(rrect(x + w / 2 - 90 + i * 44, y + h / 2 + 16, x + w / 2 - 62 + i * 44, y + h / 2 + 34, 8), c, { seed: 65 + i, tear: 0.3 }), { shadow: 0, edge: false });
  }

  /** A paper studio: striped wallpaper, a skirting board and floorboards. */
  private room(v: View): void {
    const { paper } = this, first = Math.floor((v.from - 200) / 150) * 150;
    for (let x = first; x < v.to + 200; x += 150) paper.piece([{ x, y: -100 }, { x: x + 70, y: -100 }, { x: x + 70, y: G - 40 }, { x, y: G - 40 }], '#efe1c6', { seed: 10 + x, tear: 0.4, shadow: 0, edge: false, texture: 0.15 });
    card(paper, () => paper.piece(rrect(v.from - 100, G - 52, v.to + 100, G - 16, 4), '#d6bd93', { seed: 20, tear: 0.8 }), { shadow: 6 });
    paper.piece([{ x: v.from - 100, y: G - 18 }, { x: v.to + 100, y: G - 18 }, { x: v.to + 100, y: H + 300 }, { x: v.from - 100, y: H + 300 }], '#c49c6a', { seed: 21, tear: 1.2, shadow: 8, rim: { color: '#e3c393', width: 3 } });
    for (let x = Math.floor(v.from / 240) * 240; x < v.to + 200; x += 240) paper.line([{ x, y: G }, { x: x - 70, y: H + 40 }], 'rgba(110, 72, 36, 0.22)', 3);
  }

  /** A garland of film frames across the top of the opening wall and the last board. */
  private garland(v: View, t: number): void {
    const { paper } = this;
    for (const cx of [X(0), X(this.plan.stops.length - 1) + 120]) {
      if (cx < v.from - 1200 || cx > v.to + 1200) continue;
      const pts = Array.from({ length: 21 }, (_, k) => { const u = k / 20; return { x: cx - 900 + u * 1800, y: 70 + Math.sin(u * Math.PI) * 60 }; });
      paper.line(pts, '#8a6a4a', 3);
      for (let k = 1; k < 20; k += 2) {
        const p = pts[k], sway = Math.sin(t * 1.6 + k) * 0.08, colors = ['#9cc7ea', '#f2c14e', '#e9a0a0', '#86b163', '#c9b6f0'];
        place(paper, p.x, p.y, 1, sway, () => card(paper, () => {
          paper.piece(rrect(-26, 0, 26, 64, 4), '#3a3431', { seed: 30 + k, tear: 0.4 });
          paper.inside(() => paper.piece(rrect(-18, 10, 18, 54, 3), colors[k % colors.length], { seed: 50 + k, tear: 0.3 }));
        }, { shadow: 4 }));
      }
    }
  }
}
