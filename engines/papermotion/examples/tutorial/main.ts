import { Camera, Stage, type Stereo, type View, fillGradient, grain, smoothstep, vignette, wash } from '../../src';
import { Captions } from '../shared/captions';
import { Clawd } from '../shared/Clawd';
import { CueClock, card, place, pop, rrect } from '../shared/kit';
import { TitleCard } from '../shared/title';
import { type Hop, HopPath } from '../shared/walk';
import { Boards, NAVY, RED } from './boards';
import { soundtrack as score } from './sound';
import { type Voice, Narration, loadVoice } from '../shared/narration';

const W = 1920, H = 1080, G = 905;
/** The narration starts this far into the film, and the film runs on this long after it ends. */
export const VOICE_AT = 1.0, TAIL = 3.2;
/** Which station (board on the studio wall) each narration block is told at. */
const STATION: Record<string, number> = { hook: 0, how: 1, edit: 2, install: 3, render: 3, ask: 4, loop: 5, modules: 6, speed: 7, outro: 8 };
const HEADERS = ['', '01 · NO VIDEO MODEL', '02 · EDIT ANYTHING', '03 · QUICK START', '04 · JUST ASK', '05 · THE PRODUCTION LOOP', '06 · SCENE MODULES', '07 · FAST RENDERS', '08 · GET STARTED'];
const X = (i: number) => 960 + i * 2000;
/** Clawd presents from this far left of a station's centre (the title station: a little closer). */
const PRESENTER = 780, TITLE_SPOT = 420;
const BOARD_Y = 470;

export { loadVoice };

/**
 * "Tutorial": a two-minute quick start for this repository, told by a narration (see `narration.md` and
 * `tools/voice/narrate.py`) and timed to it. Clawd walks along a paper studio wall from board to board; what's on
 * each board pops in on the narrator's words, subtitles follow the voice, and a quiet lo-fi bed runs underneath.
 * Re-voicing the script re-times the whole film.
 */
export class TutorialScene extends Stage {
  readonly narration: Narration;
  private readonly cam = new Camera(X(0), { width: W, height: H, stiffness: 10, damping: 6.3, handheld: 1.3, ease: 3 });
  private readonly clawd = new Clawd({ x: X(0) - TITLE_SPOT, y: G }, 18, 3300, [3.1, 9.7, 18.4, 27.2, 36.9, 45.5, 58.3, 71.2, 84.6, 97.1, 104.8]);
  private readonly moments = new CueClock();
  private readonly title: TitleCard;
  private readonly subs: Captions;
  private readonly boards: Boards;
  private readonly walk: HopPath;
  /** When the camera sets off for each station. */
  readonly arrive: number[] = [0];
  readonly voiceAt = VOICE_AT;

  constructor(canvas: HTMLCanvasElement, readonly voice: Voice) {
    super(canvas, { duration: VOICE_AT + voice.length + TAIL, preroll: 0.4 });
    this.paper.light = { x: -0.45, y: 0.85 };
    this.clawd.width = 0.8;
    this.narration = new Narration(voice, VOICE_AT);
    const moves: Hop[] = [];
    let at = 0, from = X(0) - TITLE_SPOT;
    for (const b of voice.blocks) {
      const s = STATION[b.id];
      if (s === undefined) throw new Error(`narration block "${b.id}" has no station`);
      if (s === at) continue;
      const start = this.narration.block(b.id).start - 0.7;
      moves.push({ a: from, b: X(s) - PRESENTER, start, duration: 1.3, hops: 4, height: 60 });
      this.arrive[s] = start;
      at = s;
      from = X(s) - PRESENTER;
    }
    this.walk = new HopPath(moves);
    this.subs = new Captions(this.narration.subtitles(), { font: '700 36px Montserrat', y: 994, height: 66, padding: 30, delay: 0.04, land: 0.2, fall: 0.18 });
    this.boards = new Boards(this.paper, this.narration);
    this.title = new TitleCard(this.ctx, {
      words: [{ text: 'AI Animation', font: '800 130px Montserrat', color: NAVY, letters: true }, { text: 'Studio', font: '800 130px Montserrat', color: RED }],
      subtitle: { text: 'Animated films, written as code by AI agents', font: '700 36px Montserrat', color: '#3d4654' },
      y: 380, at: 0.3, stagger: 0.06, out: this.narration.block('hook').end + 0.2, subtitleGap: 100,
    });
  }

  soundtrack(sampleRate: number): Stereo { return score(this, sampleRate); }

  protected start(): void { this.cam.cut({ x: X(0), y: 540, zoom: 1 }); }

  /** The station the story is at (or heading to) at time t. */
  private station(t: number): number {
    let s = 0;
    this.arrive.forEach((at, i) => { if (at !== undefined && t >= at) s = i; });
    return s;
  }

  protected update(t: number, dt: number): void {
    this.moments.step(t);
    const c = this.clawd, { x, lift, moving } = this.walk.at(t), s = this.station(t);
    const block = this.voice.blocks.find(b => STATION[b.id] === s && t >= b.start + VOICE_AT - 0.2 && t <= b.end + VOICE_AT + 0.3);
    const talking = !!block && !moving, swing = Math.sin(t * 14), end = this.narration.block('outro').start;
    c.rest();
    c.root = { x, y: G - lift };
    Object.assign(c.intent, {
      look: moving ? { x: 0.7, y: 0 } : s === 0 ? { x: 0.3, y: -0.4 } : { x: 0.65, y: -0.35 },
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
    this.title.landings.forEach((at, i) => hit(at, 'letter', -0.5 + i * 0.07, 1, { i }));
    this.walk.moves.forEach(m => hit(m.start, 'whoosh', 0.3, 0.6));
    this.walk.landings().forEach(at => hit(at, 'tap', -0.4, 0.6));
    this.arrive.forEach((at, i) => { if (i > 0) hit(at + 0.35, 'pop', 0.2); });
    // Keywords that make something appear on a board.
    const pops: [string, string, number?][] = [['how', 'video'], ['how', 'writes'], ['how', 'papermotion'], ['how', 'music'], ['edit', 'Move'], ['edit', 'rewrite'], ['edit', 'retime'],
      ['install', 'three'], ['render', 'paper'], ['ask', 'Claude'], ['ask', 'Codex'], ['ask', 'open'], ['loop', 'skill'], ['loop', 'storyboards'], ['loop', 'key'], ['loop', 'pacing'],
      ['loop', 'score'], ['loop', 'renders'], ['modules', 'captions'], ['modules', 'title'], ['modules', 'hop'], ['modules', 'sky'], ['modules', 'instant'], ['modules', 'lofi'],
      ['speed', 'parallel'], ['speed', 'twelve'], ['speed', 'GPU'], ['outro', 'Clone'], ['outro', 'open'], ['outro', 'make']];
    pops.forEach(([id, word]) => hit(n.at(id, word), 'pip', 0.2, 0.7));
    ([['install', 'Clone'], ['install', 'install'], ['install', 'smoke'], ['render', 'command'], ['how', 'writes'], ['ask', 'ask']] as const).forEach(([id, word]) => hit(n.at(id, word), 'typing', 0.1, 1, { length: id === 'ask' ? 2.2 : 1.1 }));
    hit(n.at('install', 'match') + 0.4, 'stamp', 0.3);
    hit(n.at('speed', 'glitches') + 0.9, 'stamp', -0.1);
    hit(n.at('edit', 'render') + 0.95, 'ding', 0.4);
    hit(n.at('modules', 'instant') + 0.15, 'shutter', 0.2);
    hit(n.at('outro', 'make') + 0.3, 'ding', 0);
  }

  protected lateUpdate(t: number, dt: number): void {
    this.cam.frame({ x: X(this.station(t)), y: 540, zoom: 1 }, dt, t);
  }

  probe(): Record<string, unknown> { return { ...super.probe(), camX: Math.round(this.cam.x), station: this.station(this.time), clawd: Math.round(this.clawd.root.x) }; }

  protected draw(t: number, frame: number): void {
    const { ctx, paper, cam } = this;
    fillGradient(ctx, [[0, '#f5ead6'], [1, '#e9d8bb']]);
    cam.layer(paper, 1, v => {
      this.room(v);
      this.garland(v, t);
      for (let i = 1; i <= 8; i++) {
        const bx = X(i) + 120;
        if (Math.abs(bx - cam.x) > 2300) continue;
        this.boards.frame(bx, BOARD_Y, pop(t, this.arrive[i] + 0.35, 0.5), HEADERS[i], 900 + i, () => this.content(i, bx, BOARD_Y, t));
      }
      this.clawd.draw(paper);
    });
    this.title.draw(paper, t);
    this.subs.draw(paper, t);
    vignette(ctx, [60, 40, 20], 0.22);
    grain(ctx, frame, 0.04);
    wash(ctx, '#15110d', 1 - smoothstep(0, 0.35, t));
    wash(ctx, '#15110d', smoothstep(this.duration - 0.5, this.duration, t));
  }

  private content(i: number, bx: number, by: number, t: number): void {
    const b = this.boards;
    if (i === 1) b.how(bx, by, t);
    if (i === 2) b.edit(bx, by, t);
    if (i === 3) b.terminal(bx, by, t);
    if (i === 4) b.ask(bx, by, t);
    if (i === 5) b.loop(bx, by, t);
    if (i === 6) b.modules(bx, by, t);
    if (i === 7) b.speed(bx, by, t);
    if (i === 8) b.outro(bx, by, t);
  }

  /** A paper studio: striped wallpaper, a skirting board and floorboards. */
  private room(v: View): void {
    const { paper } = this, first = Math.floor((v.from - 200) / 150) * 150;
    for (let x = first; x < v.to + 200; x += 150) paper.piece([{ x, y: -100 }, { x: x + 70, y: -100 }, { x: x + 70, y: G - 40 }, { x, y: G - 40 }], '#efe1c6', { seed: 10 + x, tear: 0.4, shadow: 0, edge: false, texture: 0.15 });
    card(paper, () => paper.piece(rrect(v.from - 100, G - 52, v.to + 100, G - 16, 4), '#d6bd93', { seed: 20, tear: 0.8 }), { shadow: 6 });
    paper.piece([{ x: v.from - 100, y: G - 18 }, { x: v.to + 100, y: G - 18 }, { x: v.to + 100, y: H + 300 }, { x: v.from - 100, y: H + 300 }], '#c49c6a', { seed: 21, tear: 1.2, shadow: 8, rim: { color: '#e3c393', width: 3 } });
    for (let x = Math.floor(v.from / 240) * 240; x < v.to + 200; x += 240) paper.line([{ x, y: G }, { x: x - 70, y: H + 40 }], 'rgba(110, 72, 36, 0.22)', 3);
  }

  /** A garland of film frames across the top of the title wall and the last board. */
  private garland(v: View, t: number): void {
    const { paper } = this;
    for (const cx of [X(0), X(8) + 120]) {
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
