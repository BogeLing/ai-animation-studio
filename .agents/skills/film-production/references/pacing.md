# Pacing: slow the transitions, keep the chapters

## Symptom

Moves between stations felt rushed. The camera spring swung about 1800 px and the character did 3–4
hops, all in ~0.55 s (0.14 s per hop), and a Pacific flight took 1.9 s. Viewers read that as a jump cut.

## Fix: speed ramps

The engine can play scene time slower than video time. The simulation keeps its fixed step, so springs,
camera and hops all slow down together and look like smooth slow motion.

```ts
import { speedRamp } from '../../src';
export const TRANSITIONS = [
  { from: 3.35, to: 4.1, rate: 0.32 },    // title lifts away → first station
  { from: 14.9, to: 16.9, rate: 0.53 },   // a flight
  { from: 17.7, to: 18.45, rate: 0.43 },  // station → station (label exit, camera move, hops, arrival)
  // …one per move; the finale reveal at ~0.8
];
super(canvas, { duration: LENGTH, preroll: 0.4, rate: speedRamp(TRANSITIONS) });
```

- A window should cover the outgoing caption's exit, the camera move and the hops, up to arrival.
- Without slow motion, give each move 1.5 s or more of real time: `HopPath` (`examples/shared/walk.ts`)
  takes the move's duration and hop count, and `follow` keeps the camera travelling with the character
  instead of racing ahead of it.
- The time it adds is about `w · (1/r − 1)` for a window `w` scene-seconds long at rate `r` (the 0.15 s
  ease at each edge adds a little).
- Rates of 0.3–0.6 made the moves last 1.5–4 s of video. Chapters stay at full speed.
- The video gets longer by itself: `frames` grows, and grab/render use it. A 40 s scene became 49.9 s.

## Everything else must use the video clock

- **Cues**: sounds placed at `s.videoTime(cue.at)` already follow the picture.
- **Beds** written in scene seconds (ambience, levels): place them at `V(a)`, give them a length of
  `V(b) − V(a)`, and read the levels at `S(V(a) + t)`:
  ```ts
  const V = (x: number) => s.videoTime(x), S = (v: number) => s.sceneTime(v);
  const bed = (a: number, b: number) => ({ at: V(a), dur: V(b) - V(a), scene: (t: number) => S(V(a) + t) });
  ```
  Add `sceneTime(v)` to the soundtrack's `Scored` interface; the Stage already has it.
- **The score**: lay it out from the chapters' video times (`V(chapterStart)`). Start each chapter on a
  fresh bar, and let the beat break during the moves so the uneven gaps don't matter.
- **The new marks**: `corepack pnpm -s listen <name>` prints every cue with its video time. The last
  cues also show the new length.

## Check

- Tile a transition at 5 fps (`ffmpeg -ss <t> -t 2.4 -vf fps=5,scale=384:-1,tile=4x3`) and check that the
  move takes 1.5 s or more with no frame where the character vanishes.
- Watch the chapter after a flight: the first stop must start from the landing point.

## Narrated films: the opening, the holds, the tail

Measured on the tutorial and a Chinese cut of it (September 2026), whose pace otherwise held up (about 160 words
a minute in English, 240 characters a minute in Chinese, something new on a board every ~2 s):

- **Don't hold the title for the whole opening sentence.** The title card stood alone for 10.5 s before the
  first board. A shorter first line, and leaving the opening 1.5 s before that line ends (`Plan.leave` in
  `examples/tutorial/studio.ts`), brought the first board in at 5.6–6.7 s in a tightened cut. An intro can
  open on a finished film instead: one playing on a paper TV (`Plan.screen`, `examples/shared/screen.ts`).
- **Find the holds from the cue list.** `pnpm listen <name>` writes `out/<name>_cues.json`; the pips, keys and
  stamps are the boards' beats, so long gaps between them are stretches where nothing new appears. Over ~5 s at
  one board drags: cut the sentence behind it (a detail of how the smoke test works cost 5–6 s).
- **A 2 s tail is enough** after the last line; the score's last chord rings through it.
