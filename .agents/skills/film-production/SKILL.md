---
name: film-production
description: End-to-end production workflow for animated short films that an AI agent writes as code in this repo (papermotion paper cut-out today). It covers turning a brief (a story, a script, an audio clip, a CV) into stations and a storyboard, then iterating with small batches of key-frame review images. It also covers side-by-side comparisons for taste decisions, paper captions and titles, logos and colour, and a code-synthesized score and foley from the shared modules. Finally it covers pacing with slow-motion transitions, fast parallel GPU rendering, glitch QA, compression and delivery, and sizing cloud rendering (Lambda, Cloud Run, Modal, Spot). Use when making, revising, re-timing, re-scoring, rendering, checking or delivering a film in this repo, or when asked how to render one faster or in the cloud.
compatibility: Node 24 with corepack pnpm, ffmpeg, and Google Chrome or Playwright's Chromium (found automatically; CHROMIUM_PATH or CHROME_PATH override it). uv for the Python tools. The GPU path was measured on WSL2 with an NVIDIA card.
metadata:
  project: ai-animation-studio
  version: "1.0"
---

# Film production

This skill is the production loop around an engine: what to do in what order, the traps, and the numbers we
measured while shipping several films end to end. For the engine itself (Stage, Paper, rigs, cameras, sound
primitives) read the engine's own skill first: `engines/papermotion/.agents/skills/papermotion/` (the same skill is
in `.claude/skills/` for Claude Code).

## Where things are

| Path | What |
| --- | --- |
| `engines/papermotion/` | The engine (`src/`), its scripts (render, parallel/GPU render, grab, listen, smoke), tests, and the films in `examples/`. Work from here; `pnpm` may not be on PATH, so use `corepack pnpm`. |
| `engines/papermotion/examples/shared/` | The cast (`Clawd`, `PaperPlane`) and the scene modules listed below. |
| `engines/papermotion/examples/ubc/`, `showcase/` | Two 12 s films that use every scene module: a real campus tour and a made-up world. Read them to see the modules working together. |
| `tools/` | Engine-independent tools: video (check, glitch scan, contact sheets, shrink, mux, compare), WSL2 GPU setup, audio analysis. |

## The loop

1. **Plan**: brief → chapters → one world with a station per chapter → a timeline table.
2. **Storyboard**: grab 1–2 frames per second into labelled contact sheets. From then on, iterate on **key
   frames only** (2–6 images per round), never full renders.
3. **Decide taste questions with evidence**: render the options on the same frame side by side, look at
   them yourself, recommend one, and let the user choose ([references/design-review.md](references/design-review.md)).
4. **Captions, titles, logos and colour**: physical paper, logos printed unmodified, one harmonious palette
   ([references/design-review.md](references/design-review.md)).
5. **Pacing pass**: slow the transitions, not the chapters ([references/pacing.md](references/pacing.md)).
   Do this **before** the final score, because the music is laid out on the video clock.
6. **Sound**: sparse foley on the story's beats, plus one consistent score ([references/sound.md](references/sound.md)).
7. **Render, QA, deliver**: one render at a time, verify, scan for glitch frames, compress, send
   ([references/render-qa.md](references/render-qa.md)).
8. **Cloud (only if asked or needed)**: size it from measurements ([references/cloud.md](references/cloud.md)).

## Scene modules (`examples/shared/`)

Reach for these before writing the same thing again. Each has TSDoc with an example; `ubc` and `showcase` use all of them.

| Module | Use it for |
| --- | --- |
| `kit.ts` | `card` (one-sheet props), `place` (a local frame), `pop` / `ease` (entrances), shapes, cartoon `eyes` / `mouth`, `sparkle`, `puff`, and `CueClock`, which fires each sound cue exactly once. |
| `captions.ts` | `Captions`: kraft-paper strips at the bottom that are laid down and drop away. Pass lines with times; draw in screen space. |
| `title.ts` | `TitleCard`: a title that drops in letter by letter, an accent word, a subtitle card, a lift-away; `landings` gives the cue times. |
| `walk.ts` | `HopPath`: hop moves between stops with every touchdown listed for sounds; `follow` for a camera that travels with the character. |
| `daySky.ts` | `dayAt(d)`: morning → noon → afternoon → golden hour → sunset (sky, sun, sea, hills); `paintSky`, `paintSun`, `tinted`. |
| `polaroid.ts` | `Polaroid` (an instant photo whose picture is drawn once), `between` / `stackPose` / `albumPose` for its flight, `handCamera`, `flash`. |
| `lofi.ts` | `lofi(mix, …)`: a warm lo-fi score from sections (keys, bass, half-time beat, tune, crackle), in video time. |
| `foley.ts` | `foley.*`: normalised paper-world effects (pop, knock, slide, whoosh, tape, tap, stamp, clank, shutter, whirr, chime, birds, gull, surf…). |

## Planning rules

- **One world, many stations.** Put each chapter at an x position along one world (`X = [ … ]`). The camera
  follows the character (`follow`), and the character hops between stops (`HopPath`). Put chapter starts on
  bar lines of the score's grid (for example every 2 s at 120 BPM).
- **Give every chapter at least ~3.5 s at full speed after arrival.** A chapter that only exists
  mid-flight or for one second doesn't register.
- **Private material stays out of public repos.** A film built from someone's CV, their voice, or client
  logos belongs in a private repo. Check `git status` before any commit.
- When a stop comes after a vehicle move (a flight), start the walk from where the vehicle set the
  character down, not from the previous stop. Otherwise it teleports off screen and races back.

## Review loop rules

- **Send small, labelled batches.** Label each tile with what it is and the time, in the user's language:
  `tools/video/tile.sh` finds a CJK font. Put labels where they don't hide the subject (top right is
  usually safe). Add a 1:1 crop when the point is a detail.
- **Compare A/B on the same frame.** Expose variants as URL params in the catalog entry
  (`params.get('caption')`), then grab each with `pnpm grab <name> <seconds…> --query="caption=b"`.
- **Look at every image yourself before sending.** Check that labels don't cover logos, that nothing is
  cut off at the frame edge, that the character stays in frame through moves, and that text is readable at
  phone size.
- **The user's taste decides.** Give a recommendation with reasons. If the user picks something else,
  adopt it and fix what they point at.

## Captions, logos, colour (summary; details in design-review.md)

- **Captions must read as paper objects**: thickness and a shadow, torn edges, a slight tilt, and a
  physical change (laid down, dropped, flipped), never a crossfade. `Captions` does this.
- **Choose the caption style per scene** by how it sits in the background: a strip or scrapbook label at the
  bottom where the sky is busy; a sign flown in on strings where the sky is open. Keep style switches rare
  and lead the eye across each one.
- **Logos**: official files, printed unmodified on a white paper card; no invented lockups; mention
  nominative-use and brand-guideline caveats when the video will be public.
- **Colour**: accents from one muted family, with no near-duplicates between neighbours; never recolour a
  logo to match.

## Pacing (summary; details in pacing.md)

A move between chapters that takes ~0.5 s (a spring camera whip plus several hops) reads as a jump cut.
Wrap the transitions in `speedRamp(TRANSITIONS)`, passed as `StageOptions.rate`, at rate 0.3–0.6, so that
each move lasts 1.5–4 s of video, or simply give moves 1.5 s or more. Chapters stay at full speed. Place
every sound by `videoTime`, and lay the score out from the chapters' video times.

## Sound (summary; details in sound.md)

- **Write a shared contract first:** key, the scale for pitched foley, the tempo grid, buses, and video time.
- **Foley:** only the story's beats; more than ~40 small effects reads as clutter. Fire cues with `CueClock`.
- **Score:** one style for the whole film (`lofi` is a good default). Sections add or remove layers; the beat
  breaks during transitions.
- **Mix target:** −16 LUFS integrated, true peak under −1 dBFS. The biggest story moment must be the loudest.

## Render, QA, deliver (summary; details in render-qa.md)

- **One render at a time.** Two concurrent renders to the same output corrupt it (a 1498-frame film came
  out with 368 decodable frames). Launch with `corepack pnpm render:detached <name> [options]`: it refuses
  to start if a render is running, and it survives agent restarts, which kill ordinary background tasks.
- **Pick the path:**
  - GPU (`--workers 6 --gpu --codec nvenc`; 4 if WSL has under ~8 GB RAM) is ~60 ms/frame, but it can
    produce a rare one-frame garbage block. More workers stop helping once the GPU's VRAM fills.
  - CPU (`--workers 8`) is bit-exact and ~5× slower.
  - After a GPU render, always run `../../tools/video/check_video.sh out/<name>.mp4 <frames> out/frames/<name>`:
    frame count, decode errors, loudness and a glitch scan.
- **Deliver:** make a ≤25 MB copy with `../../tools/video/shrink.sh` for chat apps and upload caps, and
  give the full file's path too.

## Cloud (summary; details in cloud.md)

- **Is it needed?** For short films the local GPU path is competitive (~2 min for 50 s of video).
- **CPU rendering needs a vCPU per page:** one page is single-threaded at ~1.2–1.4 s/frame and ~0.6 GB of
  memory, so run pages = vCPUs. On Lambda, 1769 MB = 1 vCPU, and Chromium's `--single-process` makes extra
  pages useless there, so use extra browsers instead.
- **Cloud Run Jobs:** ~74 s of startup per execution, and each instance is billed at least 1 minute.
- **Modal** starts containers in seconds, which makes it the best fit for wide fan-out.
- **Before touching an account:** ask which account and region to use, never create resources on a CI or
  shared identity, and delete the test resources afterwards.

## Tools

| Tool | Use |
| --- | --- |
| `pnpm grab <name> <seconds…> [--query=…] [--out=dir] [--probe]` | Key frames (and the stage's probe) at those times, plus a contact sheet. `--query` passes URL params for variants. |
| `pnpm listen <name>` | The soundtrack alone: cue list in video time, loudness, `out/<name>.wav` and a spectrogram. |
| `pnpm render:fast <name> --workers 6 --gpu --codec nvenc` | The parallel renderer (CPU without `--gpu`); `--range a:b` for part of a film, `--bench` to time it. |
| `pnpm render:detached <name> [render:fast options]` | One guarded, detached render; the log is `out/<name>_render.log` and ends with an `EXIT` line. |
| `pnpm bench <name> <memMB…>` | Emulate cloud worker sizes locally (CPU quota = mem/1769 MB, memory cap, no swap): per-frame time, CPU use, peak memory. |
| `tools/video/check_video.sh` | Frame count, decode errors, loudness, glitch scan. |
| `tools/video/glitch_scan.py` | `uv run` it on a frames folder: frames that differ from both neighbours while the neighbours match. |
| `tools/video/tile.sh` | Labelled comparison sheets, one ffmpeg pass per tile. |
| `tools/video/shrink.sh`, `mux.sh`, `compare.sh` | A size-capped copy; a new soundtrack under a picture; two videos side by side. |
| `tools/gpu/wsl-gpu.sh`, `probe.mjs` | The WSL2 GPU environment for headless Chrome, and a check of which renderer it lands on. |
| `tools/audio/analyze.py` | For films timed to a recording: transcript with word timings, tempo, beats and sections. |

## Adding another engine

Put it in `engines/<name>/` with its own skill in `engines/<name>/.agents/skills/`, and run `tools/sync-skills.sh` to
copy it to `.claude/skills/` for Claude Code. If its renderer leaves
frames in `out/frames/<film>/` and writes an MP4 with sound, every tool in `tools/` and this workflow apply
unchanged; add its commands to the table above and to the root `README.md`.
