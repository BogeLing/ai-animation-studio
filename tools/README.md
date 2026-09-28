# tools

Small, independent scripts used while making the films. They aren't tied to one engine: anything that renders
frames to a folder or an MP4 can use them.

## audio/

For films timed to an outside recording. The Python scripts declare their dependencies inline, so `uv run`
installs them into a throwaway environment. The transcription model downloads on first use.

| Script | Use |
| --- | --- |
| `analyze.py` | `uv run tools/audio/analyze.py clip.m4a -o clip.json [--language zh] [--model large-v3-turbo]`. Writes a transcript with word timings (faster-whisper), the tempo and beats, and rough sections (librosa). It also finds where the sound starts and ends, and prints the lines, flagging low-confidence words. |
| `recheck.py` | `uv run tools/audio/recheck.py clip.m4a 5.4:7.45 6.0:7.45 [--pitch 7.3:7.8]`. Re-transcribes short windows with no surrounding text, so words the full pass guessed from context (homophones) get a second opinion. Optionally prints a pitch contour: a Mandarin 2nd tone rises and a 4th tone falls. |
| `trim_silence.py` | `python3 tools/audio/trim_silence.py in.m4a out.wav [--threshold -40] [--margin 0.05]`. Cuts silence off both ends, fades the edges, and prints the kept span so timings can be shifted. Needs only ffmpeg. |

## gpu/

| Script | Use |
| --- | --- |
| `wsl-gpu.sh` | `source tools/gpu/wsl-gpu.sh`. Sets the environment headless Chrome needs to draw on the Windows GPU from WSL2: `LD_LIBRARY_PATH=/usr/lib/wsl/lib`, `GALLIUM_DRIVER=d3d12` and `MESA_D3D12_DEFAULT_ADAPTER_NAME`. It also sets `EXTRA_CHROME_FLAGS` for the brush kit. |
| `probe.mjs` | `node tools/gpu/probe.mjs [chrome]` (needs `pnpm install` in `engines/papermotion/`; without a path it uses the Chromium the papermotion scripts find). For the CPU path, Chrome's default and this machine's `--gpu` setup (on WSL2 also the GPU flags without the d3d12 environment), prints whether 2D canvases are drawn on the GPU, the GL renderer, and a synthetic Canvas 2D timing. The GPU should show as `D3D12 (<your GPU>)` on WSL2 and as ANGLE's Metal renderer on a Mac; llvmpipe or SwiftShader means software. Benchmark real scenes too: the synthetic test can point the wrong way. |

## video/

| Script | Use |
| --- | --- |
| `mux.sh` | `tools/video/mux.sh video.mp4 audio.wav out.mp4 [gain_db]`. Puts a sound track under a video, copying the picture as it is; the result is as long as the shorter input. |
| `shrink.sh` | `tools/video/shrink.sh in.mp4 out.mp4 [max_mb=25]`. Two-pass x264 to fit a size budget, for upload limits and chat apps. Film grain makes these films large at fixed quality. |
| `compare.sh` | `tools/video/compare.sh a.mp4 "Label A" b.mp4 "Label B" out.mp4`. Two videos side by side, labelled, with the sound from the left one. |
| `count_frames.py` | `python3 tools/video/count_frames.py out/film.mp4`. Counts frames already encoded into a video-only MP4 that's still being written, to see how far a render got. |
| `check_video.sh` | `tools/video/check_video.sh film.mp4 [expected_frames] [frames_dir]`. The check before sending a film: duration, frames decoded against the expected count, decode errors, loudness and true peak, and (given the frames folder) a glitch scan. Exits non-zero on a frame-count mismatch. |
| `glitch_scan.py` | `uv run tools/video/glitch_scan.py out/frames/<name> [--threshold 2.0] [--ratio 3.0]`. Flags single-frame glitches: a frame that differs from both neighbours while the neighbours match each other, such as a stale GPU texture drawn for one frame. Camera moves and cuts change both pairs, so they don't trip it. |
| `tile.sh` | `tools/video/tile.sh sheet.jpg <cols> <tile_width> "label\|image" …`. A labelled contact sheet for review rounds and A/B comparisons, one ffmpeg pass per tile (several `drawtext` filters in one graph have crashed ffmpeg). Labels can be Chinese or Japanese: it picks a CJK font from `fc-list`. |

## Skills

| Script | Use |
| --- | --- |
| `sync-skills.sh` | `tools/sync-skills.sh`. Copies each skill from `.agents/skills/` (the open Agent Skills location, which Codex and other agents read) to `.claude/skills/` (which Claude Code reads), at the repository root and in every engine. Edit the `.agents` copy, then run it; `pnpm test` in `engines/papermotion/` fails while the copies differ. Copies rather than symlinks, because Windows checkouts turn symlinks into plain text files. |
