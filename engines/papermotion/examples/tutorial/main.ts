import type { Voice } from '../shared/narration';
import { NAVY, RED } from './boards';
import { type Beat, type Plan, StudioScene } from './studio';
import { EN, type TutorialText } from './text';

export { loadVoice } from '../shared/narration';

/**
 * Sounds on the boards' beats, by narration block and cue word: a pip when something pops in, keys while a line is
 * typed, a stamp, a ding, a shutter. Every film on the studio wall shares the list; a film gets the beats of the
 * blocks it narrates.
 */
export const BEATS: Beat[] = [
  ...([['how', 'video'], ['how', 'writes'], ['how', 'papermotion'], ['how', 'music'], ['edit', 'Move'], ['edit', 'rewrite'], ['edit', 'retime'],
    ['install', 'three'], ['render', 'paper'], ['ask', 'Claude'], ['ask', 'Codex'], ['ask', 'open'], ['loop', 'skill'], ['loop', 'storyboards'], ['loop', 'key'], ['loop', 'pacing'],
    ['loop', 'score'], ['loop', 'renders'], ['modules', 'captions'], ['modules', 'title'], ['modules', 'hop'], ['modules', 'sky'], ['modules', 'instant'], ['modules', 'lofi'],
    ['speed', 'parallel'], ['speed', 'twelve'], ['speed', 'GPU'], ['outro', 'Clone'], ['outro', 'open'], ['outro', 'make']] as const).map(([block, word]): Beat => ({ block, word, sound: 'pip' })),
  ...([['install', 'Clone'], ['install', 'install'], ['install', 'smoke'], ['render', 'command'], ['how', 'writes'], ['ask', 'ask']] as const)
    .map(([block, word]): Beat => ({ block, word, sound: 'typing', data: { length: block === 'ask' ? 2.2 : 1.1 } })),
  { block: 'install', word: 'match', sound: 'stamp', after: 0.4 },
  { block: 'speed', word: 'glitches', sound: 'stamp', after: 0.9, pan: -0.1 },
  { block: 'edit', word: 'render', sound: 'ding', after: 0.95 },
  { block: 'modules', word: 'instant', sound: 'shutter', after: 0.15 },
  { block: 'outro', word: 'make', sound: 'ding', after: 0.3, pan: 0 },
];

/** The tutorial: the title, then eight boards from "no video model" to "get started". */
export function tutorialPlan(text: TutorialText): Plan {
  const h = text.headers;
  return {
    title: {
      words: [{ text: 'AI Animation', font: '800 130px Montserrat', color: NAVY, letters: true }, { text: 'Studio', font: '800 130px Montserrat', color: RED }],
      subtitle: text.subtitle,
    },
    stops: [
      { blocks: ['hook'] },
      { blocks: ['how'], header: h[1], board: (b, x, y, t) => b.how(x, y, t) },
      { blocks: ['edit'], header: h[2], board: (b, x, y, t) => b.edit(x, y, t) },
      { blocks: ['install', 'render'], header: h[3], board: (b, x, y, t) => b.terminal(x, y, t) },
      { blocks: ['ask'], header: h[4], board: (b, x, y, t) => b.ask(x, y, t) },
      { blocks: ['loop'], header: h[5], board: (b, x, y, t) => b.loop(x, y, t) },
      { blocks: ['modules'], header: h[6], board: (b, x, y, t) => b.modules(x, y, t) },
      { blocks: ['speed'], header: h[7], board: (b, x, y, t) => b.speed(x, y, t) },
      { blocks: ['outro'], header: h[8], board: (b, x, y, t) => b.outro(x, y, t) },
    ],
    beats: BEATS,
    blinks: [3.1, 9.7, 18.4, 27.2, 36.9, 45.5, 58.3, 71.2, 84.6, 97.1, 104.8],
  };
}

/**
 * "Tutorial": a two-minute quick start for this repository, told by a narration (see `narration.md` and
 * `tools/voice/narrate.py`) and timed to it. Clawd walks along a paper studio wall from board to board; what's on
 * each board pops in on the narrator's words, subtitles follow the voice, and a quiet lo-fi bed runs underneath.
 * Re-voicing the script re-times the whole film; `text` puts it in another language (see `text.ts`).
 */
export class TutorialScene extends StudioScene {
  constructor(canvas: HTMLCanvasElement, voice: Voice, text: TutorialText = EN) {
    super(canvas, voice, text, tutorialPlan(text));
  }
}
