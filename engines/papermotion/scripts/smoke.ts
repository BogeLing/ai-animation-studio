/**
 * Smoke test: render the one-second `smoke` film with both renderers and check what they wrote, so a
 * fresh checkout or a new machine proves the whole pipeline in about a minute (Vite, Chromium, the
 * bundled fonts, drawing, sound, ffmpeg, the parallel renderer).
 *
 *   pnpm smoke
 *
 * Both renders draw on the CPU, so they must match frame for frame (the simulation is deterministic).
 */
import { execFileSync } from 'node:child_process';

/** The smoke film: 1 s at 30 fps, 1920×1080. */
const FRAMES = 30, WIDTH = 1920, HEIGHT = 1080;
const SEQUENTIAL = 'out/smoke.mp4', PARALLEL = 'out/smoke-parallel.mp4';

interface Stream { codec_type: string; width?: number; height?: number; nb_read_frames?: string }

const node = (...args: string[]) => execFileSync(process.execPath, args, { stdio: 'inherit' });
const streams = (file: string): Stream[] => JSON.parse(execFileSync('ffprobe',
  ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,width,height,nb_read_frames', '-of', 'json', file], { encoding: 'utf8' })).streams;
const frameHashes = (file: string): string[] => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v', '-f', 'framemd5', '-'], { encoding: 'utf8' })
  .split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split(',').pop()!.trim());

const t0 = Date.now();
node('scripts/render.ts', 'smoke');
node('scripts/render-parallel.ts', 'smoke', '--workers', '2', '--out', PARALLEL);

const problems: string[] = [];
for (const file of [SEQUENTIAL, PARALLEL]) {
  const all = streams(file), video = all.find(s => s.codec_type === 'video');
  if (!video) problems.push(`${file}: no video stream`);
  else if (video.width !== WIDTH || video.height !== HEIGHT || Number(video.nb_read_frames) !== FRAMES) {
    problems.push(`${file}: expected ${FRAMES} frames at ${WIDTH}×${HEIGHT}, got ${video.nb_read_frames} at ${video.width}×${video.height}`);
  }
  if (!all.some(s => s.codec_type === 'audio')) problems.push(`${file}: no sound track`);
}
const a = frameHashes(SEQUENTIAL), b = frameHashes(PARALLEL);
const differ = a.findIndex((hash, i) => hash !== b[i]);
if (differ >= 0 || a.length !== b.length) problems.push(`the two renders differ from frame ${differ >= 0 ? differ : Math.min(a.length, b.length)}: is something not deterministic?`);

const secs = ((Date.now() - t0) / 1000).toFixed(0);
if (problems.length) {
  console.error(`\nsmoke: FAILED after ${secs}s\n${problems.map(p => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`\nsmoke: OK in ${secs}s (${FRAMES} frames, sound, sequential = parallel) → ${SEQUENTIAL}`);
