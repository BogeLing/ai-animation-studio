// What does headless Chrome draw canvases with? For each setup (the CPU path, Chrome's default, and what
// `render:fast --gpu` uses on this machine), print whether 2D canvases are on the GPU, the GL renderer, and
// a Canvas 2D stress-test time. On a Mac the GPU line should name ANGLE's Metal renderer; on WSL2
// "D3D12 (<your GPU>)"; SwiftShader or llvmpipe means software.
//
//   node tools/gpu/probe.mjs [chrome path]        (needs `pnpm install` in engines/papermotion/, for playwright-core)
//
// Note: the stress test is synthetic. Real scenes can behave differently (papermotion ran 4x faster on the
// GPU although this test ran 2x slower), so always benchmark the real thing: render-parallel.ts --bench.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../engines/papermotion/package.json', import.meta.url));
const { chromium } = require('playwright-core');
const { canvasBackend, findChromium } = await import('../../engines/papermotion/scripts/browser.ts');
const { chrome, host } = await import('../../engines/papermotion/scripts/platform.ts');
// no path given: the Chromium the papermotion scripts would use (CHROMIUM_PATH, system Chrome, then Playwright's builds)
const exe = process.argv[2] || findChromium();
const on = host();
const configs = {
  'cpu': chrome('cpu'),
  'default (no flags)': { args: [], env: process.env },
  [`gpu (${on})`]: chrome('gpu'),
  // WSL2's GPU flags without Mesa's d3d12 environment: the silent fall back to software
  ...(on === 'wsl' ? { 'gpu flags, no d3d12 env': { args: chrome('gpu', 'linux').args, env: process.env } } : {}),
};

console.log(`host: ${on}, chrome: ${exe}`);
for (const [name, c] of Object.entries(configs)) {
  let browser;
  try {
    browser = await chromium.launch({ executablePath: exe, args: c.args, env: c.env });
    const page = await browser.newPage();
    const ms = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
      const g = c.getContext('2d'), t0 = performance.now();
      for (let f = 0; f < 10; f++) {
        g.clearRect(0, 0, 1920, 1080);
        for (let i = 0; i < 120; i++) {
          g.save(); g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 9; g.shadowOffsetY = 4;
          g.fillStyle = `hsl(${i * 3},60%,60%)`; g.beginPath(); g.ellipse((i * 97) % 1920, (i * 53) % 1080, 80, 50, 0, 0, 6.28); g.fill(); g.restore();
        }
        g.filter = 'blur(6px)'; g.drawImage(c, 0, 0); g.filter = 'none';
        g.getImageData(0, 0, 1, 1);
      }
      return ((performance.now() - t0) / 10).toFixed(1);
    });
    const d = await canvasBackend(browser);
    const where = !d ? 'unknown' : `${d.gpu ? 'GPU' : 'CPU'} (2D canvas: ${d.status})`;
    console.log(`${name.padEnd(26)} canvas on: ${where}\n${''.padEnd(26)} GL: ${d?.renderer || '?'}\n${''.padEnd(26)} Canvas 2D stress: ${ms} ms/frame`);
  } catch (e) {
    console.log(`${name.padEnd(26)} failed: ${String(e.message).split('\n')[0]}`);
  } finally {
    await browser?.close();
  }
}
