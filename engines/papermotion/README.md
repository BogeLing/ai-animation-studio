# papermotion engine

Paper cut-out short films rendered from code with [papermotion](https://github.com/francozanardi/papermotion),
a paper-cutout animation engine built for AI agents by Franco Zanardi. This folder started from papermotion's
project template (the engine, its tools, tests, agent skill and field notes). On top of it: a parallel/GPU
renderer, reusable scene modules, and the films.

```bash
corepack enable && pnpm install
pnpm smoke                                         # 1 s test film: checks the whole pipeline in about 30 s
pnpm render plane                                  # → out/plane.mp4, sound included
pnpm render:fast showcase --workers 6 --gpu --codec nvenc
```

You also need ffmpeg and Chrome or Chromium. The scripts find Google Chrome, or else a Chromium that
Playwright installed (`~/.cache/ms-playwright` or `PLAYWRIGHT_BROWSERS_PATH`). Set `CHROMIUM_PATH` to use
another one, or run `npx playwright-core install chromium` if you have none.

## Films

| Name | Length | Files |
| --- | --- | --- |
| `plane` | 5 s | `examples/plane/`: Clawd throws a paper dart; it loops, stalls, flips around and lands on Clawd's head. Story, camera and a soundtrack synthesized from the simulation's events (`sound.ts`). |
| `showcase` | 12 s | `examples/showcase/`: every scene module on screen at once. A title card, a hop walk past three pop-up stations (`props.ts`) while the sky runs from morning to sunset, an instant photo at each stop, an album at the end, over a `lofi` score and `foley` (`sound.ts`). |
| `ubc` | 12 s | `examples/ubc/`: a quick tour of UBC's campus from morning to sunset: the clock tower on Main Mall, the Irving K. Barber Learning Centre, the Museum of Anthropology and Wreck Beach (`places.ts`), with a photo at each stop, an album, captions, a `lofi` score, foley and the clock tower's bells (`sound.ts`). |
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
| `foley.ts` | `foley.*`: normalised paper-world effects: pop, knock, letter, slide, whoosh, swish, tape, tap, click, crumple, stamp, clank, shutter, whirr, chime, birds, gull, surf, pluck. |

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
| `--gpu` | Draw on the GPU. On WSL2 this goes through Mesa's d3d12 driver; see `../../tools/gpu/`. |
| `--codec nvenc` | Encode with NVIDIA NVENC instead of x264. |
| `--range a:b` | Only frames a…b−1 (a partial range gets no sound). |
| `--bench` | Draw and time the frames without writing or encoding anything. |
| `--shared` | All workers in one browser. Usually slower; kept for comparison. |
| `--out file` | Output path (default `out/<name>.mp4`). |

On a laptop with a 6 GB RTX 3060 (WSL2 with 12 GB of RAM), 6 GPU workers draw a 1080p frame in about 60 ms
overall, against 1.2–1.4 s for one CPU page. More workers stop helping once the GPU's memory is full. GPU
frames aren't bit-exact (and can, rarely, show a one-frame glitch: scan with `../../tools/video/check_video.sh`);
CPU workers are.

## Changes to the template

- `src/stage/player.ts`: a `seek(n)` hook that simulates up to frame `n` without drawing it, so a worker
  can start anywhere in the film. The rest of `src/` is upstream's engine as published.
- `scripts/render-parallel.ts`: the parallel/GPU renderer. It muxes a scene's soundtrack like
  `pnpm render` does. `scripts/render-detached.sh`, `bench-cgroup.sh` and `bench-page.ts` wrap it.
- `scripts/grab.ts`: `--query` and `--out`. `scripts/browser.ts`: `findChromium` also looks in
  `PLAYWRIGHT_BROWSERS_PATH`, in Playwright's older `chrome-linux` folders and at the usual Google Chrome and
  Chromium paths, and accepts `CHROME_PATH`; `load` fails as soon as the page throws, with the page's message,
  and takes URL parameters.
- `examples/`: the films above, the shared cast and the scene modules; `tests/shared.test.ts` covers the
  modules that don't need a canvas.
- `index.html` and `public/fonts/`: Montserrat is bundled instead of loaded from Google Fonts, so rendering
  works offline. If the font file doesn't load, `examples/play.ts` names it.
- `scripts/smoke.ts` and `examples/smoke/`: the smoke test and its film.
- `package.json`: pins pnpm 11.1.3 and adds `render:fast`, `render:detached`, `bench` and `smoke`.

The engine in `src/` is licensed under MIT by Franco Zanardi (`src/LICENSE`, also copied to `LICENSE`).
`AGENTS.md`, `docs/field-notes.md` and the skill in `.claude/skills/papermotion/` come from upstream and
explain how to make new films with an agent; the repository's `film-production` skill covers the
production loop around them.
