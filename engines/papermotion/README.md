# papermotion engine

Paper cut-out short films rendered from code with [papermotion](https://github.com/francozanardi/papermotion),
a paper-cutout animation engine built for AI agents by Franco Zanardi. This folder started from papermotion's
project template (the engine, its tools, tests, agent skill and field notes). On top of it: a parallel/GPU
renderer, reusable scene modules, sets in 3D with camera scouting, and the films.

```bash
corepack enable && pnpm install
pnpm smoke                                         # 1 s test film: checks the whole pipeline in about 30 s
pnpm render plane                                  # → out/plane.mp4, sound included
pnpm render:fast showcase --workers 6 --gpu --codec nvenc          # WSL2 + NVIDIA
pnpm render:fast showcase --workers 2 --gpu --codec videotoolbox   # a Mac (Metal)
```

You also need ffmpeg and Chrome or Chromium. The scripts find Google Chrome, or else a Chromium that
Playwright installed (`~/.cache/ms-playwright`, `~/Library/Caches/ms-playwright` on macOS, or
`PLAYWRIGHT_BROWSERS_PATH`). Set `CHROMIUM_PATH` to use another one, or run
`npx playwright-core install chromium` if you have none.

## Films

| Name | Length | Files |
| --- | --- | --- |
| `plane` | 5 s | `examples/plane/`: Clawd throws a paper dart; it loops, stalls, flips around and lands on Clawd's head. Story, camera and a soundtrack synthesized from the simulation's events (`sound.ts`). |
| `showcase` | 12 s | `examples/showcase/`: every scene module on screen at once. A title card, a hop walk past three pop-up stations (`props.ts`) while the sky runs from morning to sunset, an instant photo at each stop, an album at the end, over a `lofi` score and `foley` (`sound.ts`). |
| `ubc` | 12 s | `examples/ubc/`: a quick tour of UBC's campus from morning to sunset: the clock tower on Main Mall, the Irving K. Barber Learning Centre, the Museum of Anthropology and Wreck Beach (`places.ts`), with a photo at each stop, an album, captions, a `lofi` score, foley and the clock tower's bells (`sound.ts`). |
| `diorama` | 8 s | `examples/diorama/`: a paper village built in 3D (`village.ts`). Pop-up trees fold up, Clawd hops out of its front door and down the road, and the camera cranes down from a wide shot to a full shot; the move was chosen with `pnpm scout`. A `lofi` score and foley (`sound.ts`). |
| `diorama_three` | 8 s | The same film drawn by the second renderer, `DioramaGL` on three.js (WebGL2 on the GPU): the same set with true occlusion and the sun's shadows on every surface. |
| `plane25d`, `ubc25d` | 5 s, 12 s | The same two films shot in 2.5D: a `DepthCamera` films their layers as sheets at real distances and swings round the action (`plane/depth.ts`, `ubc/depth.ts`). Nothing else changes: story, sound and render speed are the originals'. |
| `tutorial` | 1 min 51 s | `examples/tutorial/`: a narrated quick start for this repository. Clawd walks along a studio wall of boards (`boards.ts`) that fill in on the narrator's words; subtitles follow the voice; the narration is `narration.md`, voiced by `tools/voice/narrate.py` into `public/voice/tutorial.flac` (a synthetic voice, Kokoro-82M). |
| `hello` | 4 s | The template's starter scene. |
| `smoke` | 1 s | `examples/smoke/`: a test film. A paper cottage's chimney puffs twice and "OK" drops in, with sound. It fails at once if the bundled Montserrat didn't load. |

## Scene modules (`examples/shared/`)

The cast the films share, and building blocks for new films. Each has TSDoc with an example.

| Module | What it gives you |
| --- | --- |
| `Clawd.ts` | A paper rig of the Claude Code mascot: springs, expressions, a hop, hand and top anchors, a `width` option and a `wear` hook for worn props. |
| `Plane.ts` | `PaperPlane`, a paper dart that flies along a `Track` with a speed profile, or is posed by hand. |
| `kit.ts` | `card`, `place`, `pop`, `ease`, shapes, cartoon `eyes` / `mouth`, `sparkle`, `puff`, and `CueClock` (each sound cue fires exactly once). |
| `captions.ts` | `Captions`: kraft-paper strips laid down at the bottom and dropped away as the next arrives. |
| `title.ts` | `TitleCard`: letters dropping in one by one, an accent word, a subtitle card, a lift-away, and the landing times for sound. |
| `walk.ts` | `HopPath`: hop moves between stops, with every touchdown listed; `follow`: a camera target that travels with the character. |
| `daySky.ts` | `dayAt(d)`: a day from morning to sunset (sky, sun, sea, hills), `paintSky`, `paintSun`, `tinted`. |
| `polaroid.ts` | `Polaroid`: an instant photo whose picture is drawn once from the set's own props; poses for its flight to a stack and an album; `handCamera`, `flash`. |
| `lofi.ts` | `lofi(mix, …)`: a warm lo-fi score from sections: electric-piano chords, bass, a half-time beat, a tune, vinyl crackle. |
| `narration.ts` | `loadVoice` and `Narration`: a voice track with the time of every word, so pictures, sounds and subtitles follow the narrator (`n.at('block', 'word')`, `n.subtitles()`). Voice the script with `tools/voice/narrate.py`. |
| `foley.ts` | `foley.*`: normalised paper-world effects: pop, knock, letter, slide, whoosh, swish, tape, tap, click, crumple, stamp, clank, shutter, whirr, chime, birds, gull, surf, pluck. |

## Sets in 3D and camera scouting

A set can also be built in 3D and filmed through a perspective camera, still as torn paper (`src/camera/`,
`src/diorama/`). `Diorama` places paper faces, cards and 2D rigs in the world and draws them back to front with
`Paper`, lit by the sun, faded into the air and casting shadows on the ground. `shot` places a `Camera3D` the way
a director describes a shot (size, bearing, elevation, where the subject sits), and `CameraPath` moves through
shots. `DioramaGL` (`src/three`, three.js) is a second renderer for the same sets, on the GPU with true occlusion and
shadows on every surface. `DepthCamera` gives an existing 2D film a 2.5D cut: it films the film's parallax layers as sheets at real
distances through a perspective lens and swings round the action. `pnpm scout` draws one moment from several shot setups side by side with numbers that judge each (how
much of the subject is seen, its size, clutter near the lens), and checks a whole camera move frame by frame.
On an Apple M4 the `diorama` film's 240 frames draw in under 5 s on the GPU with 2 workers, and scouting nine
setups takes about 0.2 s.

## Commands

```bash
pnpm render <name>                 # one browser, sequential, soundtrack muxed
pnpm render:fast <name> [options]  # parallel workers, optionally on the GPU (see below)
pnpm render:detached <name> [...]  # render:fast, detached and guarded: one render at a time, log in out/<name>_render.log
pnpm grab <name> 1 3.5 6 --probe   # print the scene's probe at those seconds
pnpm grab <name> 1 3.5 6           # frames + a contact sheet → out/grab/
pnpm grab <name> 6 --query="a=1"   # a variant the scene reads from its URL; --out=<dir> to write elsewhere
pnpm sheet <name> 2 0 10           # contact sheet of the rendered video
pnpm listen <name>                 # soundtrack only: wav, spectrogram, loudness, cue list
pnpm scout <name> 3.4              # a set in 3D: one moment from nine shot setups, with numbers → out/scout/
pnpm scout <name> --path           # its camera move checked frame by frame (or --path=move.json for a candidate)
pnpm bench <name> 1769 3008        # one render page under cloud-sized CPU/memory limits (systemd)
pnpm smoke                         # render `smoke` with both renderers and check the videos
pnpm typecheck && pnpm test
```

`pnpm smoke` (`scripts/smoke.ts`) runs `pnpm render smoke`, then `render:fast smoke --workers 2`. It checks
that both videos have 30 frames at 1920×1080 and a sound track, and that their frames are identical,
since CPU renders must match. It prints `smoke: OK` or lists what failed, and exits with an error code
if anything did.

`render:fast` (`scripts/render-parallel.ts`) options:

| Option | What it does |
| --- | --- |
| `--workers N` | Number of workers, each in its own browser (default 4). Frames are dealt out in turn so heavy stretches are shared. |
| `--gpu` | Draw on the GPU: through Metal on macOS, through Mesa's d3d12 driver on WSL2 (see `../../tools/gpu/`). Without it frames are drawn on the CPU, which is bit-exact. The render prints what Chrome really draws with, and warns when it isn't what was asked for. |
| `--codec x264\|nvenc\|videotoolbox\|hw` | The encoder: x264 (default), NVIDIA NVENC, Apple VideoToolbox, or `hw` for this machine's own (VideoToolbox on macOS, NVENC elsewhere, x264 if it can't run). A hardware encoder is tried on a few frames before the drawing starts. |
| `--range a:b` | Only frames a…b−1 (a partial range gets no sound). |
| `--bench` | Draw and time the frames without writing or encoding anything. |
| `--shared` | All workers in one browser. Usually slower; kept for comparison. |
| `--out file` | Output path (default `out/<name>.mp4`). |

On a laptop with a 6 GB RTX 3060 (WSL2 with 12 GB of RAM), 6 GPU workers draw a 1080p frame in about 60 ms
overall, against 1.2–1.4 s for one CPU page. More workers stop helping once the GPU's memory is full. GPU
frames aren't bit-exact (and can, rarely, show a one-frame glitch: scan with `../../tools/video/check_video.sh`);
CPU workers are.

On a MacBook Air with an Apple M4 (24 GB), 2 Metal workers draw a 1080p frame in about 70 ms overall, and
`--codec videotoolbox` encodes `showcase` in 2 s where x264 takes 13 s. More Metal workers don't help (4: 73 ms,
6: 78 ms). Its CPU also beats the laptop's: about 0.4 s a frame for one page, ~100 ms overall with 8 workers.

## Changes to the template

- `src/stage/player.ts`: a `seek(n)` hook that simulates up to frame `n` without drawing it, so a worker
  can start anywhere in the film, and `scout.*` hooks for scouting shots. `src/stage/Stage.ts`: `renderShot`,
  `cameraView`, `subjects`, `scout` and `scouting`, which let a scene in 3D be drawn from any view without touching
  its simulation.
- `src/camera/Camera.ts`: `y` is public, for `DepthCamera`. New in `src/`: `core/math3.ts`, `camera/Camera3D.ts`,
  `camera/shot.ts`, `camera/CameraPath.ts`, `camera/DepthCamera.ts` (with `tests/depthcamera.test.ts`) and `diorama/`
  (sets in 3D drawn with `Paper`), exported from `src/index.ts`, with `tests/camera3d.test.ts` and
  `tests/diorama.test.ts`. `src/three/`: `DioramaGL`, a three.js renderer for dioramas, its own entry point (`three`
  is the only runtime dependency), with `tests/three.test.ts`. The rest of `src/` is upstream's engine as published.
- `scripts/scout.ts` (`pnpm scout`): shot scouting, on the GPU unless `--cpu`.
- `scripts/render-parallel.ts`: the parallel/GPU renderer. It muxes a scene's soundtrack like
  `pnpm render` does. `scripts/render-detached.sh` (which does without `setsid` on macOS), `bench-cgroup.sh`
  and `bench-page.ts` wrap it.
- `scripts/platform.ts`: what `--gpu` and `--codec` mean on each platform (Metal and VideoToolbox on macOS;
  Mesa d3d12 and NVENC on WSL2), shared by every script that launches Chrome or encodes. CPU drawing passes
  `--disable-gpu`, since Chrome on macOS otherwise draws on the GPU even headless, and the videos are
  encoded with `-color_range tv`, since ffmpeg 8 would keep the frames' full range.
- `scripts/grab.ts`: `--query` and `--out`. `scripts/browser.ts`: `findChromium` also looks in
  `PLAYWRIGHT_BROWSERS_PATH`, in Playwright's older `chrome-linux` folders, where this playwright-core puts its
  own build (on macOS too) and at the usual Google Chrome and Chromium paths, and accepts `CHROME_PATH`; `load`
  fails as soon as the page throws, with the page's message, and takes URL parameters.
- `examples/`: the films above, the shared cast and the scene modules; `tests/shared.test.ts` covers the
  modules that don't need a canvas.
- `index.html` and `public/fonts/`: Montserrat is bundled instead of loaded from Google Fonts, so rendering
  works offline. If the font file doesn't load, `examples/play.ts` names it.
- `scripts/smoke.ts` and `examples/smoke/`: the smoke test and its film.
- `package.json`: pins pnpm 11.1.3 and adds `render:fast`, `render:detached`, `scout`, `bench` and `smoke`.

The engine in `src/` is licensed under MIT by Franco Zanardi (`src/LICENSE`, also copied to `LICENSE`).
`AGENTS.md`, `docs/field-notes.md` and the skill in `.agents/skills/papermotion/` (copied to `.claude/skills/`) come from upstream and
explain how to make new films with an agent; the repository's `film-production` skill covers the
production loop around them.
