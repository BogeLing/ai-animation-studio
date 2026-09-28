/**
 * Scout camera shots for a scene in 3D before settling its camera move (see `shot` and `CameraPath` in src/camera):
 * draw one moment from several shot setups side by side, each labelled with numbers that judge it, or check a whole
 * camera move frame by frame. Look at the sheet yourself: the numbers catch a hidden subject, a head out of frame or
 * a tree in front of the lens; eyes catch what numbers can't, such as a subject that merges with what is behind it.
 *
 *   pnpm scout <example> <seconds> [--subject=name] [--setups=file.json] [--width=640] [--cpu] [--out=dir]
 *     → <out>/<example>_<t>s/sheet.jpg, a JPEG per setup, and setups.json (each setup with its view and numbers)
 *   pnpm scout <example> --path[=file.json] [--width=960] [--cpu] [--out=dir]
 *     → <out>/<example>_path/strip.jpg, preview.mp4 and path.json (numbers for every frame, and the worst of each):
 *       the scene's own camera move (`Stage.cameraView`), or a candidate move from the file
 *
 * Setups are JSON like [{ "id": "A", "size": "wide", "bearing": -35, "elevation": 25 }, …], the fields of `ShotSetup`;
 * without --setups, a standard nine: three wides, three mediums, a low angle, a full shot and a reverse. A path file
 * is { "subject": "clawd", "keys": [{ "at": 0, "setup": { … } }, { "at": 4, "setup": { … }, "hold": true }, …] }; each
 * key frames the subject where it stands at that time. Times are scene seconds (video seconds unless the scene has
 * slow motion). Draws on the GPU unless --cpu; the numbers don't depend on it. Needs Chromium and ffmpeg; the
 * sheets come from the repository's tools/video/tile.sh.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright-core';
import { EXAMPLES } from '../examples/catalog.ts';
import { canvasBackend, load, open } from './browser.ts';
import { PIXELS, encoder } from './platform.ts';

type V3 = { x: number; y: number; z: number };
type Setup = { id?: string; size: string | number; bearing?: number; elevation?: number } & Record<string, unknown>;
type Subject = { at: V3; height: number; facing?: number };
type View = { pos: V3; target: V3; focal: number; roll?: number };
type Numbers = Record<string, unknown>;
type Drawn = { frame: number; t: number; view: View; motion: { speed: number; turn: number; zoom: number }; image: string; numbers: Numbers };
/** The page's hooks (src/stage/player.ts) that scouting uses. */
type Hooks = {
  reset(): void;
  scout: {
    subjects(n: number): Record<string, Subject>;
    view(subject: Subject, setup: Setup): View;
    frameAt(t: number): number;
    shots(n: number, views: View[], width: number): { image: string; numbers: Numbers }[];
    path(keys: { at: number; view: View; hold?: boolean }[] | null, frames: number[], width: number): Drawn[];
  };
};

const NINE: Setup[] = [
  { id: 'A', size: 'wide', bearing: -40, elevation: 25 }, { id: 'B', size: 'wide', bearing: 0, elevation: 25 }, { id: 'C', size: 'wide', bearing: 40, elevation: 25 },
  { id: 'D', size: 'medium', bearing: -35, elevation: 8 }, { id: 'E', size: 'medium', bearing: 0, elevation: 8 }, { id: 'F', size: 'medium', bearing: 35, elevation: 8 },
  { id: 'G', size: 'medium', bearing: 60, elevation: -6 }, { id: 'H', size: 'full', bearing: -20, elevation: 5 }, { id: 'I', size: 'wide', bearing: 160, elevation: 20 },
];
const TILE = fileURLToPath(new URL('../../../tools/video/tile.sh', import.meta.url));

const args = process.argv.slice(2);
const option = (key: string) => args.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const [name, seconds] = args.filter(a => !a.startsWith('--'));
const pathFile = option('path'), checkPath = !!pathFile || args.includes('--path'), gpu = !args.includes('--cpu'), out = option('out') ?? join('out', 'scout');
if (!name || !EXAMPLES[name] || (!checkPath && Number.isNaN(Number(seconds)))) {
  console.error(`usage: pnpm scout <example> <seconds> [--subject=name] [--setups=file.json] [--width=640] [--cpu] [--out=dir]\n       pnpm scout <example> --path[=file.json] [--width=960] [--cpu] [--out=dir]\nexamples: ${Object.keys(EXAMPLES).join(', ')}`);
  process.exit(1);
}

const pct = (v: unknown) => (typeof v === 'number' ? String(Math.round(v * 100)) : '?');
/** The numbers a scene gives for a view, in a line short enough for a tile label (no ' : or |, which tile.sh can't take). */
function describe(n: Numbers): string {
  const parts: string[] = [];
  if (typeof n.visible === 'number') parts.push(`seen ${pct(n.visible)}`);
  if (typeof n.height === 'number') parts.push(`size ${pct(n.height)}`);
  if (typeof n.nearest === 'number') parts.push(`near ${Number.isFinite(n.nearest) ? n.nearest.toFixed(1) : '-'}`);
  if (typeof n.close === 'number' && n.close > 0) parts.push(`clutter ${pct(n.close)}`);
  if (n.inFrame === false) parts.push('OUT OF FRAME');
  return parts.join(' · ');
}
/** What is wrong with a view by the numbers alone. */
const faults = (n: Numbers): string[] => [
  ...(typeof n.visible === 'number' && n.visible < 0.9 ? [`only ${pct(n.visible)}% of the subject is seen`] : []),
  ...(n.inFrame === false ? ['the subject leaves the frame'] : []),
  ...(typeof n.close === 'number' && n.close > 0 ? [`something is close to the lens in ${pct(n.close)}% of the frame`] : []),
];

const save = (url: string, file: string) => writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
function sheet(file: string, cols: number, width: number, tiles: string[]): void {
  if (!existsSync(TILE)) { console.log(`(no sheet: ${TILE} is missing)`); return; }
  execFileSync(TILE, [file, String(cols), String(width), ...tiles], { stdio: 'ignore' });
  console.log(`sheet → ${file}`);
}

async function subjectAt(page: Page, t: number, which?: string): Promise<{ frame: number; name: string; subject: Subject }> {
  const frame = await page.evaluate(s => (globalThis as unknown as Hooks).scout.frameAt(s), t);
  const all = await page.evaluate(n => (globalThis as unknown as Hooks).scout.subjects(n), frame);
  const key = which ?? Object.keys(all)[0];
  if (!key || !all[key]) throw new Error(`${name} has no subject "${which ?? ''}" to scout (it lists: ${Object.keys(all).join(', ') || 'none; add subjects() to the scene'}).`);
  return { frame, name: key, subject: all[key] };
}
const viewOf = (page: Page, subject: Subject, setup: Setup) => page.evaluate(([s, u]) => (globalThis as unknown as Hooks).scout.view(s, u), [subject, setup] as const);

const session = await open(gpu ? 'gpu' : 'cpu');
try {
  const errors: string[] = [];
  const { fps, frames } = await load(session.page, session.base, name, errors);
  const drawing = await canvasBackend(session.browser);
  if (drawing && drawing.gpu !== gpu) console.warn(`warning: asked for the ${gpu ? 'GPU' : 'CPU'} but Chrome draws on the ${drawing.gpu ? 'GPU' : 'CPU'} (${drawing.renderer})`);
  const page = session.page, t0 = Date.now();

  if (!checkPath) {
    const t = Number(seconds), width = Number(option('width') ?? 640);
    const setups = (option('setups') ? JSON.parse(readFileSync(option('setups')!, 'utf8')) : NINE) as Setup[];
    const { frame, name: who, subject } = await subjectAt(page, t, option('subject'));
    const views: View[] = [];
    for (const s of setups) views.push(await viewOf(page, subject, s));
    const shots = await page.evaluate(([n, v, w]) => (globalThis as unknown as Hooks).scout.shots(n, v, w), [frame, views, width] as const);
    if (errors.length) throw new Error(`${name} @ ${t}s: ${errors.join('; ')}`);
    const dir = join(out, `${name}_${t}s`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const tiles = shots.map((s, i) => {
      const id = setups[i].id ?? String.fromCharCode(65 + i), file = join(dir, `${id}.jpg`), u = setups[i];
      save(s.image, file);
      console.log(`${id}  ${String(u.size).padEnd(12)} bearing ${String(u.bearing ?? 0).padStart(4)}° elevation ${String(u.elevation ?? 8).padStart(3)}°  ${describe(s.numbers)}${faults(s.numbers).length ? `  ✗ ${faults(s.numbers).join('; ')}` : ''}`);
      return `${id} ${u.size} ${u.bearing ?? 0}° ${u.elevation ?? 8}° · ${describe(s.numbers)}|${file}`;
    });
    writeFileSync(join(dir, 'setups.json'), JSON.stringify({ example: name, t, frame, subject: who, shots: setups.map((s, i) => ({ ...s, view: views[i], numbers: shots[i].numbers })) }, null, 1));
    console.log(`${shots.length} setups of ${who} at ${t}s in ${Date.now() - t0} ms (${gpu ? 'GPU' : 'CPU'})`);
    sheet(join(dir, 'sheet.jpg'), 3, width, tiles);
  } else {
    const width = Number(option('width') ?? 960);
    const plan = pathFile ? JSON.parse(readFileSync(pathFile, 'utf8')) as { subject?: string; keys: { at: number; setup: Setup; hold?: boolean }[] } : null;
    // Pass 1: where the subject stands at each key, and the view that frames it there. Then start over.
    let keys: { at: number; view: View; hold?: boolean }[] | null = null, height = (await subjectAt(page, 0, plan?.subject)).subject.height;
    if (plan) {
      keys = [];
      for (const k of [...plan.keys].sort((a, b) => a.at - b.at)) {
        const { subject } = await subjectAt(page, k.at, plan.subject);
        height = subject.height;
        keys.push({ at: k.at, view: await viewOf(page, subject, k.setup), hold: k.hold });
      }
    }
    await page.evaluate(() => (globalThis as unknown as Hooks).reset());
    // Pass 2: every frame along the move, a second at a time so no single message gets huge.
    const drawn: Drawn[] = [];
    for (let from = 0; from < frames; from += fps) {
      const chunk = Array.from({ length: Math.min(fps, frames - from) }, (_, i) => from + i);
      drawn.push(...await page.evaluate(([k, f, w]) => (globalThis as unknown as Hooks).scout.path(k, f, w), [keys, chunk, width] as const));
      if (errors.length) throw new Error(`${name} @ frame ${from}: ${errors.join('; ')}`);
    }
    const dir = join(out, `${name}_path`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    drawn.forEach(d => save(d.image, join(dir, `f${String(d.frame).padStart(5, '0')}.jpg`)));
    const codec = encoder('hw');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(fps), '-i', join(dir, 'f%05d.jpg'), ...codec.args, '-g', String(fps), ...PIXELS, '-movflags', '+faststart', join(dir, 'preview.mp4')]);
    const num = (d: Drawn, k: string) => (typeof d.numbers[k] === 'number' ? (d.numbers[k] as number) : NaN);
    const worst = {
      seen: Math.min(...drawn.map(d => num(d, 'visible'))),
      near: Math.min(...drawn.map(d => num(d, 'nearest'))),
      clutter: Math.max(...drawn.map(d => num(d, 'close'))),
      size: [Math.min(...drawn.map(d => num(d, 'height'))), Math.max(...drawn.map(d => num(d, 'height')))],
      turnDegPerSec: Math.max(...drawn.map(d => d.motion.turn)),
      heightsPerSec: Math.max(...drawn.map(d => d.motion.speed)) / height,
      zoomPerSec: Math.max(...drawn.map(d => d.motion.zoom)),
      outOfFrame: drawn.filter(d => d.numbers.inFrame === false).map(d => +d.t.toFixed(2)),
    };
    writeFileSync(join(dir, 'path.json'), JSON.stringify({ example: name, keys, worst, frames: drawn.map(d => ({ frame: d.frame, t: d.t, view: d.view, motion: d.motion, numbers: d.numbers })) }, null, 1));
    const picks = Array.from({ length: 8 }, (_, i) => drawn[Math.round((i * (drawn.length - 1)) / 7)]);
    sheet(join(dir, 'strip.jpg'), 4, 480, picks.map(d => `${d.t.toFixed(1)}s · ${describe(d.numbers)} · turn ${d.motion.turn.toFixed(0)}°/s|${join(dir, `f${String(d.frame).padStart(5, '0')}.jpg`)}`));
    console.log(`${drawn.length} frames along the move in ${Date.now() - t0} ms (${gpu ? 'GPU' : 'CPU'} drawing, ${codec.name}) → ${join(dir, 'preview.mp4')}`);
    console.log(`worst: seen ${pct(worst.seen)}%, nearest ${worst.near.toFixed(1)}, clutter ${pct(worst.clutter)}%, size ${pct(worst.size[0])}–${pct(worst.size[1])}%, turn ${worst.turnDegPerSec.toFixed(0)}°/s, travel ${worst.heightsPerSec.toFixed(1)} subject heights/s, zoom ${pct(worst.zoomPerSec)}%/s${worst.outOfFrame.length ? `, out of frame at ${worst.outOfFrame.slice(0, 6).join(', ')}s` : ''}`);
  }
} finally {
  await session.close();
}
