# Render, QA and delivery

## Commands (from `engines/papermotion/`)

```bash
corepack pnpm -s smoke                              # 1 s check: both renderers, frame count, sound, frames match
source ../../tools/gpu/wsl-gpu.sh                   # WSL2 only: GPU env (LD_LIBRARY_PATH, d3d12 driver) for --gpu
corepack pnpm -s render:fast plane --workers 6 --gpu --codec nvenc          # WSL2 + RTX 3060: ~60 ms/frame overall
corepack pnpm -s render:fast plane --workers 2 --gpu --codec videotoolbox   # Apple M4 (Metal): ~70 ms/frame overall
corepack pnpm -s render:fast plane --workers 8                               # bit-exact CPU: ~5x slower (WSL), ~1.5x (M4)
```

- `--gpu` means Metal on macOS and Mesa's d3d12 driver on WSL2 (`scripts/platform.ts`). Each render prints
  what Chrome really draws with (`drawing on the GPU (…)` or `on the CPU`) and warns when it isn't what was
  asked for: Chrome falls back to software without a word. `node ../../tools/gpu/probe.mjs` shows why.
- Chrome on macOS draws on the GPU even without `--gpu`; the CPU path passes `--disable-gpu`, so it stays
  bit-exact there too.
- `--codec hw` is the machine's own hardware encoder: VideoToolbox on a Mac (6× faster than x264 at about
  the same quality), NVENC elsewhere, x264 if it can't run. A hardware encoder is tried before the drawing
  starts.

- **GPU workers are limited by the GPU's VRAM.** Each worker adds about 0.4 GB on top of the ~2 GB the
  Windows desktop holds.
  - On a 6 GB RTX 3060 laptop with WSL given 12 GB of RAM, measured on 1498 frames: 4 workers 71 ms/frame,
    **6 workers 60 ms/frame (fastest)**, 8 workers 62, 12 workers 107 (VRAM full).
  - With WSL's default memory (~7.4 GB), RAM runs out first and 4 is best.
  - Watch `nvidia-smi --query-gpu=memory.used` when trying more.
- **On an Apple M4 MacBook Air (24 GB)**, measured on `showcase`: 1 Metal worker 99 ms/frame, **2 workers
  70 ms/frame (fastest)**, 4 workers 73, 6 workers 78. CPU: 1 page ~0.4 s/frame, 8 workers ~100 ms/frame.
- Eight CPU workers give about 4× one worker.
- Frames are kept in `out/frames/<name>/fNNNNN.jpg` after a render; use them for scans and patches.
- A full render muxes the scene's soundtrack; a partial `--range` render has no sound.

## Hard rules

1. **One render at a time.** Two renders writing the same frames folder and output file produce a broken
   MP4 (368 of 1498 frames decodable), and each runs at a quarter of the speed. Check first:
   `pgrep -fl '^node .*render-parallel'` (match the node process, not shells whose command text mentions it).
2. **Launch detached** with `corepack pnpm render:detached <example> [options]`. Ordinary background tasks
   are killed when the agent restarts; this one isn't. It refuses to start if a render is running. Poll
   `grep EXIT out/<example>_render.log`.
3. **Verify before sending** with `../../tools/video/check_video.sh out/<file>.mp4 <frames> out/frames/<name>`. It
   checks the decoded frame count against the scene's frames, decode errors, loudness and single-frame
   glitches.

## GPU glitch frames

- **Symptom**: one frame where part of the picture (a logo card) is replaced by a dark block with
  stray colour. It was visible as a flicker at 31 s.
- **Diagnose it**: re-render just that frame on CPU (`pnpm grab <name> <t>`) and on GPU
  (`--range a:b --gpu`). If both are clean, it is the non-deterministic GPU path (Chrome → ANGLE → Mesa
  d3d12 or Metal → the driver), not the scene or the engine.
- **Detect it**: `tools/video/glitch_scan.py` flags a frame that differs from both neighbours by more than 3× the
  neighbours' difference from each other. A global view is also useful: `ffmpeg -vf
  "select='gt(scene,0.02)',metadata=print"`. Camera cuts and fades show up there too, so look for isolated
  spikes.
- **Fix it**:
  - Either render the final picture on CPU;
  - or patch the frame: grab it on CPU at `t = n / fps`, overwrite `out/frames/<name>/f%05d.jpg`, and
    re-encode:
    ```bash
    ffmpeg -framerate 30 -i out/frames/<name>/f%05d.jpg -i out/<name>.wav -c:v libx264 -crf 17 -preset slow \
      -pix_fmt yuv420p -color_range tv -c:a aac -b:a 192k -shortest out/<name>_fixed.mp4
    ```

## Delivery

- `../../tools/video/shrink.sh out/<name>.mp4 out/<name>_small.mp4 25` makes a two-pass x264 copy of at
  most 25 MB for chat apps and social platforms. It takes ~45 s. A single-pass copy at CRF 21 is also fine
  for these films: 30–50 s came out at 14–25 MB.
- Chat apps and agent file transfers often cap uploads (Claude Code's file sending reaches phone and web only
  up to 30 MiB). Send the small copy, and give the full file's path. On WSL, the Windows path looks like
  `\\wsl.localhost\<distro>\home\<you>\…\out\<name>.mp4`.
- The format is MP4 (H.264 + AAC). WebP/GIF only suit silent, few-second loops (README previews). WebM is
  smaller but less widely accepted by social platforms.

## Why GPU is faster, and what still bounds it

- **The GPU does the per-pixel work**: blurred paper shadows, compositing off-screen sheets, textures,
  gradients, grain and vignette.
- **The CPU still does the rest**:
  - the simulation (sequential in time, and tiny);
  - building torn-edge paths (Canvas 2D wants paths from JS);
  - issuing many small draw calls;
  - reading each frame back and JPEG-encoding it for the pipe.
  - Those serial parts cap the speedup (Amdahl), and the GPU's memory caps the workers, which is why ~6
    workers is the sweet spot on a 6 GB card.
- **Next steps if speed matters**:
  - WebCodecs hardware encoding instead of the readback + JPEG (estimated 1.3–2×);
  - or a WebGPU renderer (a large rewrite; frames in milliseconds; not bit-exact).
