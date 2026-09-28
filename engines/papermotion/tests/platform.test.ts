import { describe, expect, it } from 'vitest';
import { canvasOnGpu, chrome, encoder, hardwareCodec, host } from '../scripts/platform';

describe('platform', () => {
  it('tells macOS, WSL2 and Linux apart', () => {
    expect(host('darwin', '')).toBe('macos');
    expect(host('linux', '5.15.167.4-microsoft-standard-WSL2\n')).toBe('wsl');
    expect(host('linux', '6.8.0-45-generic\n')).toBe('linux');
    expect(host('win32', '')).toBe('windows');
  });

  it('draws on the CPU with --disable-gpu everywhere, since Chrome on macOS picks the GPU by itself', () => {
    for (const on of ['macos', 'wsl', 'linux', 'windows'] as const) {
      expect(chrome('cpu', on, { HOME: '/h' })).toEqual({ args: ['--disable-gpu'], env: { HOME: '/h' } });
    }
  });

  it('draws on the GPU through Metal on macOS', () => {
    const mac = chrome('gpu', 'macos', { HOME: '/h' });
    expect(mac.args).toContain('--use-angle=metal');
    expect(mac.env).toEqual({ HOME: '/h' });
  });

  it('keeps the measured WSL2 setup: ANGLE on EGL through Mesa d3d12, and no d3d12 outside WSL', () => {
    const wsl = chrome('gpu', 'wsl', { HOME: '/h' });
    expect(wsl.args).toEqual(['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-gl=angle', '--use-angle=gl-egl']);
    expect(wsl.env).toEqual({ HOME: '/h', LD_LIBRARY_PATH: '/usr/lib/wsl/lib', GALLIUM_DRIVER: 'd3d12', MESA_D3D12_DEFAULT_ADAPTER_NAME: 'NVIDIA' });
    expect(chrome('gpu', 'wsl', { MESA_D3D12_DEFAULT_ADAPTER_NAME: 'AMD' }).env.MESA_D3D12_DEFAULT_ADAPTER_NAME).toBe('AMD');
    expect(chrome('gpu', 'linux', { HOME: '/h' })).toEqual({ args: wsl.args, env: { HOME: '/h' } });
  });

  it('counts GPUs emulated on the CPU as the CPU', () => {
    expect(canvasOnGpu('enabled', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Version 26.4 (Build 25E246))')).toBe(true);
    expect(canvasOnGpu('enabled', 'D3D12 (NVIDIA GeForce RTX 3060 Laptop GPU)')).toBe(true);
    expect(canvasOnGpu('unavailable_software', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver-5.0.0)')).toBe(false);
    expect(canvasOnGpu('enabled', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver-5.0.0)')).toBe(false);
    expect(canvasOnGpu('enabled', 'llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(false);
    expect(canvasOnGpu(undefined)).toBe(false);
  });

  it('uses VideoToolbox as the hardware encoder on macOS and NVENC elsewhere, and rejects unknown codecs', () => {
    expect(hardwareCodec('macos')).toBe('videotoolbox');
    expect(hardwareCodec('wsl')).toBe('nvenc');
    expect(hardwareCodec('linux')).toBe('nvenc');
    expect(() => encoder('h265')).toThrow(/Unknown codec "h265"/);
  });
});
