// Which renderer does headless Chrome land on? For each configuration, print the WebGL renderer and time a
// Canvas 2D stress test. On WSL2 the GPU line should read "D3D12 (<your GPU>)"; llvmpipe or SwiftShader
// means software rendering.
//
//   node tools/gpu/probe.mjs [chrome path]        (needs `pnpm install` in engines/papermotion/, for playwright-core)
//
// Note: the stress test is synthetic. Real scenes can behave differently (papermotion ran 4x faster on the
// GPU although this test ran 2x slower), so always benchmark the real thing: render-parallel.ts --bench.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../engines/papermotion/package.json', import.meta.url));
const { chromium } = require('playwright-core');
// no path given: the Chromium the papermotion scripts would use (CHROMIUM_PATH, Playwright's builds, then system Chrome)
const exe = process.argv[2] || (await import('../../engines/papermotion/scripts/browser.ts')).findChromium();
const gpuFlags = ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-gl=angle', '--use-angle=gl-egl'];
const wsl = { LD_LIBRARY_PATH: '/usr/lib/wsl/lib', GALLIUM_DRIVER: 'd3d12', MESA_D3D12_DEFAULT_ADAPTER_NAME: process.env.MESA_D3D12_DEFAULT_ADAPTER_NAME || 'NVIDIA' };
const configs = {
  'default': { args: [], env: {} },
  'angle gl-egl': { args: gpuFlags, env: {} },
  'angle gl-egl + WSL d3d12': { args: gpuFlags, env: wsl },
};

for (const [name, c] of Object.entries(configs)) {
  let browser;
  try {
    browser = await chromium.launch({ executablePath: exe, args: c.args, env: { ...process.env, ...c.env } });
    const page = await browser.newPage();
    const result = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = !gl ? 'no WebGL' : ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
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
      return { renderer, canvas: ((performance.now() - t0) / 10).toFixed(1) };
    });
    console.log(`${name.padEnd(26)} WebGL: ${result.renderer}\n${''.padEnd(26)} Canvas 2D stress: ${result.canvas} ms/frame`);
  } catch (e) {
    console.log(`${name.padEnd(26)} failed: ${String(e.message).split('\n')[0]}`);
  } finally {
    await browser?.close();
  }
}
