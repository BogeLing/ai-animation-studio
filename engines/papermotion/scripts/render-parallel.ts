/**
 * Render an example with several headless pages at once. The frames are split into contiguous chunks;
 * each page fast-forwards its simulation to the start of its chunk (`seek`, no drawing) and draws only
 * its own frames. The simulation is deterministic, so the chunks join seamlessly.
 *
 *   node scripts/render-parallel.ts <example> [--workers 4] [--range from:to] [--gpu] [--codec x264|nvenc|videotoolbox|hw] [--out file] [--bench]
 *
 * --gpu     draw on the GPU (macOS: ANGLE on Metal; WSL2: ANGLE on EGL, through Mesa's D3D12 driver; see platform.ts)
 * --codec   x264 (default), nvenc, videotoolbox, or hw: this machine's hardware encoder (VideoToolbox on macOS, else NVENC)
 * --shared  all workers in one browser (default: a browser each, so they don't share a GPU process)
 * --bench   draw and time the frames, but write and encode nothing
 * A scene with a soundtrack gets it mixed and muxed in when the whole film is rendered (as `pnpm render` does).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { EXAMPLES } from '../examples/catalog.ts';
import { inspect, loudness, mux, pullAudio } from './audio.ts';
import { canvasBackend, launch, load } from './browser.ts';
import { PIXELS, encoder } from './platform.ts';

type Hooks = { frame(i: number): string; seek(i: number): void };

const args = process.argv.slice(2);
const opt = (key: string, fallback: string): string => { const i = args.indexOf(`--${key}`); return i >= 0 ? args[i + 1] : fallback; };
const name = args[0];
if (!name || !EXAMPLES[name]) {
  console.error(`usage: node scripts/render-parallel.ts <example> [--workers N] [--range a:b] [--gpu] [--codec x264|nvenc|videotoolbox|hw] [--out file] [--bench]\nexamples: ${Object.keys(EXAMPLES).join(', ')}`);
  process.exit(1);
}
const workers = Math.max(1, Number(opt('workers', '4'))), gpu = args.includes('--gpu'), bench = args.includes('--bench'), shared = args.includes('--shared');
// Checked now, so an encoder this machine can't run fails before the drawing rather than after it.
const codec = bench ? null : encoder(opt('codec', 'x264'));

const server = await createServer({ server: { port: 0, hmr: false, watch: null }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
const browsers = await Promise.all(Array.from({ length: shared ? 1 : workers }, () => launch(gpu ? 'gpu' : 'cpu')));

try {
  // A context (and renderer process) per worker; by default a browser per worker too.
  const pages = await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const page = await (await browsers[shared ? 0 : w].newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    const errors: string[] = [];
    return { page, errors, meta: await load(page, base, name, errors) };
  }));
  const { fps, frames } = pages[0].meta;
  // Chrome falls back to software without a word when it can't use the GPU, so say what it really draws with.
  const drawing = await canvasBackend(browsers[0]);
  if (drawing) {
    console.log(`${name}: drawing on the ${drawing.gpu ? `GPU (${drawing.renderer})` : 'CPU'}${codec ? `, encoding with ${codec.name}` : ''}`);
    if (drawing.gpu !== gpu) console.warn(`warning: asked for the ${gpu ? 'GPU' : 'CPU'} but Chrome draws on the ${drawing.gpu ? 'GPU' : 'CPU'} (2D canvas: ${drawing.status}); see ../../tools/gpu/probe.mjs`);
  }
  const [from, to] = opt('range', `0:${frames}`).split(':').map(Number);
  const total = Math.min(to, frames) - from;
  const dir = join('out', 'frames', name);
  if (!bench) { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); }

  const t0 = Date.now();
  // Frames are dealt out in turn (worker w draws from+w, from+w+N, …) so heavy stretches are shared;
  // between its frames a worker only simulates (seek), which costs next to nothing.
  await Promise.all(pages.map(async ({ page, errors }, w) => {
    const t = Date.now();
    let count = 0;
    for (let n = from + w; n < from + total; n += workers) {
      if (n > 0) await page.evaluate(i => (globalThis as unknown as Hooks).seek(i - 1), n);
      const url = await page.evaluate(i => (globalThis as unknown as Hooks).frame(i), n);
      if (errors.length) throw new Error(`${name} @ frame ${n}: ${errors.join('; ')}`);
      if (!bench) writeFileSync(join(dir, `f${String(n).padStart(5, '0')}.jpg`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      count++;
    }
    if (count) console.log(`worker ${w}: ${count} frames, ${((Date.now() - t) / count).toFixed(0)} ms/frame`);
  }));
  const secs = (Date.now() - t0) / 1000;
  console.log(`${name}: ${total} frames, ${workers} worker(s)${gpu ? ', GPU' : ''}: ${secs.toFixed(1)}s → ${((secs * 1000) / total).toFixed(0)} ms/frame overall`);

  if (codec) {
    const out = opt('out', join('out', `${name}.mp4`)), e0 = Date.now();
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-start_number', String(from), '-i', join(dir, 'f%05d.jpg'),
      ...codec.args, '-g', String(fps), ...PIXELS, '-movflags', '+faststart', out], { stdio: 'inherit' });
    console.log(`encoded → ${out} (${((Date.now() - e0) / 1000).toFixed(1)}s)`);
    // Sound comes from the simulation's cue log, which every worker has once it has reached the end.
    if (from === 0 && total === frames) {
      const sound = await pullAudio(pages[0].page, name, 'out');
      if (sound) {
        mux(out, sound.wav);
        const png = join('out', `${name}_audio.png`);
        console.log(`${name}: sound muxed (${sound.cues.length} cues), ${loudness(inspect(sound.wav, png))} → ${png}`);
      }
    } else console.log(`${name}: partial range, so no sound`);
  }
} finally {
  await Promise.all(browsers.map(b => b.close()));
  await server.close();
}
