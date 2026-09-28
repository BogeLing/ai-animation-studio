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

## Narration (a film told by a voice)

- Write the script in blocks (`[id]` per block) and say everything in words: TTS mangles `pnpm` and URLs, so
  show commands on screen instead. Voice it with `tools/voice/narrate.py script.md public/voice/film.flac`,
  which writes the audio and every word's time.
- Load it in the catalog entry (`loadVoice('voice/film.flac')`) and time the picture to the words
  (`narration.at('install', 'Clone')`) rather than to fixed seconds, so re-voicing re-times the whole film.
  `narration.subtitles()` gives the captions.
- Put the voice on its own bus and keep the music bed about 18 dB under it (measure each alone with `listen`
  by muting the other buses); no melody under speech.
- Check intelligibility without ears: transcribe the mix (`tools/audio/analyze.py … --model small.en`) and
  compare with the script. A word the recogniser mishears (it heard "hop walks" as "pop walks") is worth
  rephrasing.
- Another language: voice the translated script with a voice of that language (`--voice zf_001` reads
  Mandarin), keep the on-screen words in a table per language (the tutorial's `text.ts`), and map each cue
  word the scene waits for to the new language's word (`new Narration(voice, offset, cues)`). In Chinese a cue
  is any run of characters, and `subtitles(9, maxChars)` cuts strips by length at punctuation.
- Mandarin traps: the voice splits text into words and pauses at every boundary, so pass names and terms with
  `--words` (they also keep their tones: 拍立得 would end in a neutral 得); write numbers in characters; avoid
  polyphones it misreads (多长 as duō zhǎng: say 时长). Whisper in Chinese (`--language zh`) writes homophones
  (帧 as 针, 屏 as 瓶); only a difference in sound is a mistake. English words come out accented
  ("Claude Code" merged into one word until 或 became 或者).
- For public videos, say the voice is synthetic (a line in the description or the credits).
- Picking a TTS: in September 2026 the best-rated voices were cloud APIs, and the ranking differs by
  language; Kokoro-82M (Apache-2.0) is the local, commercially usable default here.
