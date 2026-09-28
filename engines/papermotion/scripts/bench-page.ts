// Time one CPU render page the way a cloud worker runs it: launch, load, then seek + draw 30 frames spread
// over the film, and a long seek. Meant to run inside a cgroup (see bench-cgroup.sh); prints one JSON line
// with per-frame times, CPU use and throttling of the cgroup, and its peak memory.
//   node scripts/bench-page.ts <example> [label]      (run from engines/papermotion/)
import { readFileSync } from 'node:fs';
import { open } from './browser.ts';

type Hooks = { frame(i: number): string; seek(i: number): void };
const [name = 'plane', label = 'run'] = process.argv.slice(2);
const cg = '/sys/fs/cgroup' + readFileSync('/proc/self/cgroup', 'utf8').trim().split('::')[1];
const read = (f: string) => { try { return readFileSync(`${cg}/${f}`, 'utf8'); } catch { return ''; } };
const cpu = () => Object.fromEntries(read('cpu.stat').trim().split('\n').filter(Boolean).map(l => { const [k, v] = l.split(' '); return [k, Number(v)]; }));

const t0 = performance.now();
const s = await open();
const launchMs = performance.now() - t0;
const errors: string[] = [];
s.page.on('pageerror', e => errors.push(e.message));
await s.page.goto(`${s.base}/?example=${name}&headless`);
await s.page.waitForFunction(() => (globalThis as { ready?: boolean }).ready, null, { timeout: 300_000 });
const loadMs = performance.now() - t0 - launchMs;
const meta = await s.page.evaluate(() => (globalThis as unknown as { meta: { frames: number } }).meta);
const frames = Array.from({ length: 30 }, (_, i) => Math.round(((i + 0.5) / 30) * meta.frames));
const c1 = cpu(), tf0 = performance.now(), draws: number[] = [];
for (const n of frames) {
  await s.page.evaluate(i => (globalThis as unknown as Hooks).seek(i - 1), n);
  const t = performance.now();
  await s.page.evaluate(i => (globalThis as unknown as Hooks).frame(i), n);
  draws.push(performance.now() - t);
}
const c2 = cpu(), wall = (performance.now() - tf0) / 1000;
await s.page.reload();
await s.page.waitForFunction(() => (globalThis as { ready?: boolean }).ready, null, { timeout: 300_000 });
const ts = performance.now();
await s.page.evaluate(n => (globalThis as unknown as Hooks).seek(n), meta.frames - 2);
const longSeekMs = performance.now() - ts;
const peakMB = Math.round((Number(read('memory.peak')) || 0) / 2 ** 20);
await s.close();
const sorted = [...draws].sort((a, b) => a - b), avg = draws.reduce((a, b) => a + b, 0) / draws.length;
const cpuS = ((c2.usage_usec ?? 0) - (c1.usage_usec ?? 0)) / 1e6;
console.log(JSON.stringify({
  label, errors: errors.length, launchMs: Math.round(launchMs), loadMs: Math.round(loadMs),
  drawAvgMs: Math.round(avg), drawP90Ms: Math.round(sorted[Math.floor(sorted.length * 0.9)]), drawMaxMs: Math.round(sorted[sorted.length - 1]),
  coresBusy: +(cpuS / wall).toFixed(2), throttledPeriods: (c2.nr_throttled ?? 0) - (c1.nr_throttled ?? 0), periods: (c2.nr_periods ?? 0) - (c1.nr_periods ?? 0),
  longSeekMs: Math.round(longSeekMs), peakMB,
}));
