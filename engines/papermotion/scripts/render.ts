/**
 * Render examples to video, offline: every frame is simulated and drawn in headless Chromium
 * and piped to ffmpeg, so the result is smooth no matter how heavy a frame is.
 *
 *   pnpm render sea            → out/sea.mp4
 *   pnpm render kite sea
 *   pnpm render all
 *
 * Scenes with a `soundtrack` get it mixed and muxed in (and out/<name>.wav, out/<name>_audio.png).
 *
 * Needs ffmpeg and Chrome or Chromium (see findChromium in browser.ts, or set CHROMIUM_PATH).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { EXAMPLES } from '../examples/catalog.ts';
import { inspect, loudness, mux, pullAudio } from './audio.ts';
import { load, open } from './browser.ts';
import { PIXELS, encoder } from './platform.ts';

const OUT = 'out';

async function render(page: Page, base: string, name: string, codec: string[]): Promise<void> {
  const errors: string[] = [];
  const { fps, frames } = await load(page, base, name, errors);

  const file = join(OUT, `${name}.mp4`);
  const ffmpeg = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    ...codec, '-g', String(fps), ...PIXELS, '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise<number | null>(resolve => ffmpeg.on('close', resolve));

  const t0 = Date.now();
  for (let n = 0; n < frames; n++) {
    const url = await page.evaluate(i => (globalThis as unknown as { frame(i: number): string }).frame(i), n);
    if (errors.length) throw new Error(`${name} @ frame ${n}: ${errors.join('; ')}`);
    if (!ffmpeg.stdin.write(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))) await new Promise(r => ffmpeg.stdin.once('drain', r));
    if ((n + 1) % fps === 0 || n === frames - 1) process.stdout.write(`\r${name}: ${n + 1}/${frames} frames`);
  }
  ffmpeg.stdin.end();
  if ((await done) !== 0) throw new Error(`${name}: ffmpeg failed`);
  console.log(` → ${file} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  const sound = await pullAudio(page, name, OUT);
  if (sound) {
    mux(file, sound.wav);
    const png = join(OUT, `${name}_audio.png`);
    console.log(`${name}: sound muxed (${sound.cues.length} cues), ${loudness(inspect(sound.wav, png))} → ${png}`);
  }
}

const args = process.argv.slice(2);
const names = args.includes('all') || !args.length ? Object.keys(EXAMPLES) : args;
const unknown = names.filter(n => !EXAMPLES[n]);
if (unknown.length) throw new Error(`Unknown example(s): ${unknown.join(', ')}. Try: ${Object.keys(EXAMPLES).join(', ')}, all`);

mkdirSync(OUT, { recursive: true });
const codec = encoder().args;
const session = await open();
try {
  for (const name of names) await render(session.page, session.base, name, codec);
} finally {
  await session.close();
}
