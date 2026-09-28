/** Shared by the render and inspection scripts: a Vite server and a headless Chromium on an example. */
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { type Browser, type Page, chromium } from 'playwright-core';
import { type ViteDevServer, createServer } from 'vite';
import { type Draw, canvasOnGpu, chrome } from './platform.ts';

/** Where Chrome/Chromium may be installed, most preferred first: the system's, then Playwright's. */
function chromiumCandidates(): string[] {
  const system = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  // Chromium builds Playwright downloaded (chromium-NNNN, newest first), in its default cache or PLAYWRIGHT_BROWSERS_PATH
  const caches = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(homedir(), '.cache', 'ms-playwright')].filter((d): d is string => !!d && existsSync(d));
  const playwright = caches.flatMap(cache => readdirSync(cache).filter(d => /^chromium-\d+$/.test(d))
    .sort((a, b) => +b.split('-')[1] - +a.split('-')[1])
    .flatMap(b => ['chrome-linux64', 'chrome-linux'].map(dir => join(cache, b, dir, 'chrome'))));
  // and where this playwright-core puts its own build on any platform (on macOS: ~/Library/Caches/ms-playwright)
  let bundled: string[] = [];
  try { bundled = [chromium.executablePath()]; } catch { /* no build for this platform */ }
  return [...system, ...playwright, ...bundled];
}

export function findChromium(): string {
  const explicit = process.env.CHROMIUM_PATH || process.env.CHROME_PATH;
  if (explicit) return explicit;
  const bin = chromiumCandidates().find(p => existsSync(p));
  if (bin) return bin;
  throw new Error('No Chromium found: set CHROMIUM_PATH, install Google Chrome, or run `npx playwright-core install chromium`.');
}

/** A headless Chrome drawing on the CPU (bit-exact) or on this machine's GPU (see platform.ts). */
export function launch(draw: Draw = 'cpu'): Promise<Browser> {
  return chromium.launch({ executablePath: findChromium(), ...chrome(draw) });
}

/** What a launched Chrome draws canvases with, from its GPU info; null if it doesn't say. */
export async function canvasBackend(browser: Browser): Promise<{ gpu: boolean; status: string; renderer: string } | null> {
  try {
    const cdp = await browser.newBrowserCDPSession();
    const { gpu } = await cdp.send('SystemInfo.getInfo');
    await cdp.detach();
    const status = gpu.featureStatus?.['2d_canvas'] ?? 'unknown', renderer = String(gpu.auxAttributes?.glRenderer ?? gpu.devices[0]?.deviceString ?? '');
    return { gpu: canvasOnGpu(status, renderer), status, renderer };
  } catch {
    return null;
  }
}

export interface Session { server: ViteDevServer; browser: Browser; page: Page; base: string; close(): Promise<void> }

export async function open(): Promise<Session> {
  // No HMR and no file watching: editing sources while a script runs must not reload the page.
  const server = await createServer({ server: { port: 0, hmr: false, watch: null }, logLevel: 'error' });
  await server.listen();
  const base = server.resolvedUrls!.local[0].replace(/\/$/, '');
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  return { server, browser, page, base, close: async () => { await browser.close(); await server.close(); } };
}

/** Load an example paused, ready for `frame(n)` / `probe(n)`; throws on page errors. */
export async function load(page: Page, base: string, name: string, errors: string[], query = ''): Promise<{ fps: number; frames: number }> {
  page.removeAllListeners('pageerror');
  page.on('pageerror', e => errors.push(e.message));
  // A scene that throws while loading fails now, with its message, instead of at the timeout.
  const failed = new Promise<never>((_, reject) => page.once('pageerror', e => reject(new Error(`${name}: ${e.message}`))));
  await page.goto(`${base}/?example=${name}&headless${query ? `&${query.replace(/^[?&]/, '')}` : ''}`);
  const ready = page.waitForFunction(() => (globalThis as { ready?: boolean }).ready || document.querySelector('p'), null, { timeout: 60_000 });
  for (const p of [failed, ready]) p.catch(() => {});   // the race below reports whichever settles first
  await Promise.race([ready, failed]);
  if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
  const meta = await page.evaluate(() => (globalThis as unknown as { meta?: { fps: number; frames: number } }).meta);
  if (!meta) throw new Error(`${name}: the page did not mount a stage (${await page.textContent('p')})`);
  return meta;
}
