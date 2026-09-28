import type { Cues } from '../shared/narration';

/**
 * Everything the tutorial writes on screen, in one language. Commands, code and file names stay as they are
 * typed. A narration in another language also says which of its words each board beat waits for (`cues`).
 */
export interface TutorialText {
  /** Font families after the weight and size: Montserrat, then a face for any script it lacks. */
  family: string;
  /** Board headers by station; station 0 is the title wall. */
  headers: string[];
  subtitle: string;
  /** Subtitles: the font, and for Chinese the most characters on one strip. */
  captions: { font: string; maxChars?: number };
  how: { video: string; code: string; frames: string; sound: string };
  edit: { still: string; moved: string; again: string };
  /** The chat: its title, your request (typed at `cps` characters a second), the reply, and the three asks. */
  ask: { agent: string; prompt: string; cps: number; reply: string; asks: [string, string, string] };
  loop: { skill: string; steps: [string, string, string, string, string] };
  modules: { caption: string; title: string; snap: string };
  speed: { parallel: string; film: string; took: (seconds: number) => string; where: string; checked: string };
  outro: [string, string, string];
  cues?: Cues;
}

export const EN: TutorialText = {
  family: 'Montserrat',
  headers: ['', '01 · NO VIDEO MODEL', '02 · EDIT ANYTHING', '03 · QUICK START', '04 · JUST ASK', '05 · THE PRODUCTION LOOP', '06 · SCENE MODULES', '07 · FAST RENDERS', '08 · GET STARTED'],
  subtitle: 'Animated films, written as code by AI agents',
  captions: { font: '700 36px Montserrat' },
  how: { video: 'video model', code: 'code', frames: 'frames', sound: 'music & sound' },
  edit: { still: 'The tree stands still.', moved: 'The tree has moved!', again: 'render again' },
  ask: {
    agent: 'your agent', cps: 48, asks: ['story', 'style', 'length'],
    prompt: 'Make a 20-second paper cut-out film: a lighthouse keeper adopts a seagull. Cozy, lo-fi, with captions.',
    reply: 'On it. Storyboard first, then key frames for you to review.',
  },
  loop: { skill: 'skill', steps: ['Storyboard', 'Review', 'Pacing', 'Sound', 'Render'] },
  modules: { caption: 'Hello, paper world', title: 'TITLE', snap: 'Snap!' },
  speed: { parallel: 'frames drawn in parallel', film: '12 s film', took: s => `→ ${s} s`, where: 'on a laptop GPU', checked: 'CHECKED ✓' },
  outro: ['1 · Clone it', '2 · Open your agent', '3 · Make your first film'],
};
