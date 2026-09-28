/**
 * Per-platform settings for the render scripts, so the same commands run on a Mac, under WSL2 and on Linux.
 * Frames are drawn on the CPU (bit-exact) unless a script asks for the GPU: `chrome` turns that choice into
 * Chrome's flags and environment for this host, and `encoder` turns a `--codec` name into ffmpeg arguments.
 *
 * | Host  | GPU drawing (`--gpu`)                                      | Hardware encoder (`--codec hw`) |
 * | ----- | ---------------------------------------------------------- | ------------------------------- |
 * | macOS | ANGLE → Metal                                              | VideoToolbox                    |
 * | WSL2  | ANGLE → EGL → Mesa's d3d12 driver → Direct3D 12 → Windows  | NVENC                           |
 * | Linux | ANGLE → EGL → the system's driver                          | NVENC                           |
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export type Host = 'macos' | 'wsl' | 'linux' | 'windows';
export type Draw = 'cpu' | 'gpu';

/** The host this process runs on. WSL2 is told apart from Linux by its kernel's name. */
export function host(platform: string = process.platform, kernel: string = linuxKernel()): Host {
  if (platform === 'darwin') return 'macos';
  if (platform === 'win32') return 'windows';
  return /microsoft/i.test(kernel) ? 'wsl' : 'linux';
}

function linuxKernel(): string {
  try { return readFileSync('/proc/sys/kernel/osrelease', 'utf8'); } catch { return ''; }
}

/**
 * Chrome's flags and environment to draw on the CPU or on this host's GPU. The CPU needs `--disable-gpu`:
 * Chrome on macOS draws on the GPU by default, even headless, and GPU frames aren't bit-exact.
 */
export function chrome(draw: Draw, on: Host = host(), env: NodeJS.ProcessEnv = process.env): { args: string[]; env: NodeJS.ProcessEnv } {
  if (draw === 'cpu') return { args: ['--disable-gpu'], env };
  const gpu = ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'];
  if (on === 'macos') return { args: [...gpu, '--use-angle=metal'], env };
  if (on === 'windows') return { args: gpu, env };   // Chrome's own choice there: ANGLE on Direct3D 11
  const egl = [...gpu, '--use-gl=angle', '--use-angle=gl-egl'];
  if (on === 'linux') return { args: egl, env };
  // WSL2 reaches the Windows GPU through Mesa's d3d12 driver; without these, Chrome falls back to software.
  return { args: egl, env: { ...env, LD_LIBRARY_PATH: '/usr/lib/wsl/lib', GALLIUM_DRIVER: 'd3d12', MESA_D3D12_DEFAULT_ADAPTER_NAME: env.MESA_D3D12_DEFAULT_ADAPTER_NAME || 'NVIDIA' } };
}

/**
 * Whether Chrome draws canvases on a real GPU, given its 2D canvas feature status and GL renderer (from
 * `SystemInfo.getInfo`). SwiftShader, llvmpipe and Windows' basic render driver are GPUs emulated on the CPU.
 */
export function canvasOnGpu(status: string | undefined, renderer = ''): boolean {
  return !!status?.startsWith('enabled') && !/swiftshader|llvmpipe|softpipe|basic render/i.test(renderer);
}

/**
 * The output pixel format. ffmpeg 8 keeps the JPEG frames' full range with `-pix_fmt yuv420p` alone;
 * `-color_range tv` converts to the limited range players expect, as older versions did by themselves.
 */
export const PIXELS = ['-pix_fmt', 'yuv420p', '-color_range', 'tv'];

/** Hardware H.264 encoders by `--codec` name. */
const HARDWARE: Record<string, string[]> = {
  nvenc: ['-c:v', 'h264_nvenc', '-preset', 'p6', '-tune', 'hq', '-rc', 'vbr', '-cq', '18', '-b:v', '0'],
  // Constant quality needs Apple Silicon. On `showcase`, 78 edged out x264 (SSIM and PSNR) with ~15% more bytes, 6× faster.
  videotoolbox: ['-c:v', 'h264_videotoolbox', '-q:v', '78', '-profile:v', 'high'],
};

/** The encoder `--codec hw` means on this host. */
export function hardwareCodec(on: Host = host()): 'videotoolbox' | 'nvenc' {
  return on === 'macos' ? 'videotoolbox' : 'nvenc';
}

/**
 * ffmpeg's video encoder arguments for a `--codec` name: `x264` (libopenh264 when ffmpeg has no libx264),
 * `nvenc`, `videotoolbox`, or `hw` for this host's hardware encoder, with x264 as its fallback. A hardware
 * encoder is tried on a few blank frames first: ffmpeg lists encoders it has no device for, and a render
 * should fail before drawing rather than after.
 */
export function encoder(codec = 'x264', on: Host = host()): { name: string; args: string[] } {
  const name = codec === 'hw' ? hardwareCodec(on) : codec;
  if (name === 'x264') return x264();
  if (!HARDWARE[name]) throw new Error(`Unknown codec "${codec}": use x264, nvenc, videotoolbox or hw.`);
  const failure = trial(HARDWARE[name]);
  if (!failure) return { name, args: HARDWARE[name] };
  if (codec !== 'hw') throw new Error(`${name} can't encode on this machine: ${failure}`);
  console.warn(`${name} can't encode on this machine (${failure}); using x264`);
  return x264();
}

/** The encoders this ffmpeg was built with. */
function encoders(): string {
  return execFileSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
}

function x264(): { name: string; args: string[] } {
  const list = encoders();
  if (list.includes('libx264')) return { name: 'x264', args: ['-c:v', 'libx264', '-crf', '17', '-preset', 'slow'] };
  if (list.includes('libopenh264')) return { name: 'openh264', args: ['-c:v', 'libopenh264', '-b:v', '18M'] };
  throw new Error('ffmpeg has no H.264 encoder (libx264 or libopenh264).');
}

/** Why `args` can't encode a few blank frames here (ffmpeg's first error line), or null if they can. */
function trial(args: string[]): string | null {
  if (!encoders().includes(args[1])) return `this ffmpeg has no ${args[1]} encoder`;
  const run = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=1280x720:r=30', '-frames:v', '3', ...args, ...PIXELS, '-f', 'null', '-'],
    { encoding: 'utf8', timeout: 30_000 });
  return run.status === 0 ? null : run.stderr?.trim().split('\n')[0] || `ffmpeg exited with ${run.status ?? run.signal}`;
}
