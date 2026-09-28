# Sound: sparse foley, one consistent score

Engine primitives and the cue and level pipeline are in the engine skill's `references/sound.md`. This file
covers what worked in production.

## Structure

- Keep the sound in `sound.ts` (buses, render settings, the `Scored` interface); split out `sfx.ts` and
  `score.ts` when it grows. The shared modules cover most of it: `lofi` (`examples/shared/lofi.ts`) is the
  score recipe below with parameters, and `foley` (`foley.ts`) holds normalised effects. The showcase's
  `sound.ts` is a complete example in about 50 lines.
- **Decide before writing any sound:**
  - the key, and the scale for pitched foley (e.g. D major pentatonic D E F# A B);
  - the grid (120 BPM, a 2 s bar);
  - the buses (`air`, `sfx`, `voice`, `music`);
  - everything placed in video time.

## Foley

- Fire cues where the picture's event happens, with `CueClock` (`kit.ts`): it compares against the previous
  step's time, because `t - dt < at` drifts in floating point and fires some cues twice. Pan them by screen
  position.
- **Keep it sparse.** A first pass with ~175 cues, including strips, tape, stickers, data dots and counter
  ticks, sounded cluttered. Keep only the story's beats:
  - pop-ups, stamps, the takeoff, the big check "ding", the tear;
  - the finale's rising stop notes, one character "hello".
  - Silence the rest with a `SKIP` set, so they are easy to bring back.
- Bus gains that balanced a lo-fi score: `air 0.22`, `sfx 0.75`, `voice 0.75`, `music 0.7`, master ~6.4 dB.

## The score: warm lo-fi recipe (one style for the whole film)

The first score was called "weird" for three reasons at once: too busy, a toy-like timbre, and a different
style per chapter (guzheng-like in one, electronic in another). What replaced it:

- **Keys**: an FM bell with ratio 1, index 1.6 and indexDecay 0.08, mixed 30% with a twin detuned +0.4%.
  Strum the 4 notes 18 ms apart; decay 1.4 s, or 2.4 s on a chapter's last chord.
- **Harmony**: a 4-bar loop IVmaj7 – iii7 – ii9 – V13 (in D: Gmaj7 – F#m7 – Em9 – A13, with rootless
  voicings around C4). Resolve to Imaj9 (Dmaj9) at arrivals, after the biggest moment and at the end.
- **Beat (half-time)**:
  - the kick on 16th slots 0 and 10, the snare on slot 8;
  - hats on the 8ths, with the off-beats late by 60 ms;
  - it stops before each move, and holds its breath for half a bar around the biggest moment.
- **Bass**: `instrument.bass`, the root on the downbeat and the fifth on the "and" of 2.
- **Melody**: a muted pluck (`instrument.harp` with brightness 0.28 and decay 0.55), pentatonic, sparse,
  with the 8ths swung. It is an octave up with a faint music box in the climax chapter.
- **Glue**: a vinyl crackle bed (lowpass noise, crackle 0.96) and a soft noise swell (~1 s) into each
  chapter's downbeat.
- **Layout**: bars restart at each chapter's video start; transitions carry the ringing last chord and a
  pad. A flight needs keys over the pad, or it drops out.

## Targets and checks

- Aim for −16 LUFS integrated and a true peak under −1 dBFS. Adjust the master.
- `corepack pnpm -s listen <name>` prints the cue list with video times and the loudness, and writes
  `out/<name>.wav` and `out/<name>_audio.png` (a spectrogram plus waveform). Check in the image that:
  - each chapter shows a steady pulse;
  - the transitions show a break;
  - there are no long dead stretches;
  - the biggest moment is the loudest.
- Re-muxing a new soundtrack onto an existing picture: `listen` first, then
  `../../tools/video/mux.sh out/<name>.mp4 out/<name>.wav out/<name>_new.mp4`. Keep in mind that a
  render in progress uses the code it loaded when it started.
