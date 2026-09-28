/**
 * Encode H.264 in the page with WebCodecs, on the browser's hardware encoder (VideoToolbox on a Mac): frames go from the
 * canvas to the encoder without a JPEG, a trip to Node or a file each. `render-parallel.ts --codec webcodecs` gives each
 * worker a run of frames; each run starts on a key frame, so the runs' Annex B streams join end to end.
 */
import type { Page } from 'playwright-core';

type Encoding = { encoder: VideoEncoder; chunks: Uint8Array[]; error: string; first: number; fps: number };
type Page2 = { __encoding?: Encoding; draw(n: number): void };

/** The encoder settings for a frame size and rate: High profile, about 0.32 bits per pixel, tuned for quality over latency. */
export function encoderConfig(width: number, height: number, fps: number): VideoEncoderConfig {
  return {
    codec: fps > 30 ? 'avc1.64002A' : 'avc1.640028', width, height, framerate: fps, bitrate: Math.round(width * height * fps * 0.32),
    hardwareAcceleration: 'prefer-hardware', latencyMode: 'quality', bitrateMode: 'variable', avc: { format: 'annexb' },
  };
}

/** Whether this page's browser can encode that config on hardware. */
export function canEncode(page: Page, config: VideoEncoderConfig): Promise<boolean> {
  return page.evaluate(async c => typeof VideoEncoder !== 'undefined' && !!(await VideoEncoder.isConfigSupported(c)).supported, config);
}

/** Open an encoder in the page for a run of frames that starts at `first`. */
export function start(page: Page, config: VideoEncoderConfig, first: number, fps: number): Promise<void> {
  return page.evaluate(([c, first, fps]) => {
    const g = globalThis as unknown as Page2, chunks: Uint8Array[] = [];
    const e: Encoding = { chunks, error: '', first, fps, encoder: null as unknown as VideoEncoder };
    e.encoder = new VideoEncoder({
      output: chunk => { const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); e.chunks.push(b); },
      error: err => { e.error = String(err); },
    });
    e.encoder.configure(c);
    g.__encoding = e;
  }, [config, first, fps] as const);
}

/** Draw frames `from` to `to` (exclusive, in order) and hand each to the encoder, a key frame every second of video. */
export function encode(page: Page, from: number, to: number): Promise<void> {
  return page.evaluate(async ([from, to]) => {
    const g = globalThis as unknown as Page2, e = g.__encoding!, canvas = document.getElementById('stage') as HTMLCanvasElement;
    for (let n = from; n < to; n++) {
      g.draw(n);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((n * 1e6) / e.fps), duration: Math.round(1e6 / e.fps) });
      e.encoder.encode(frame, { keyFrame: (n - e.first) % e.fps === 0 });
      frame.close();
      while (e.encoder.encodeQueueSize > 3) await new Promise(r => setTimeout(r, 0));
      if (e.error) throw new Error(`WebCodecs: ${e.error}`);
    }
  }, [from, to] as const);
}

/** The encoded bytes so far (an Annex B stream), taken out of the page; with `flush`, after the encoder has finished. */
export async function take(page: Page, flush = false): Promise<Buffer> {
  const b64 = await page.evaluate(async flush => {
    const e = (globalThis as unknown as Page2).__encoding!;
    if (flush) { await e.encoder.flush(); e.encoder.close(); }
    if (e.error) throw new Error(`WebCodecs: ${e.error}`);
    const all = new Uint8Array(e.chunks.reduce((s, c) => s + c.length, 0));
    let at = 0, s = '';
    for (const c of e.chunks) { all.set(c, at); at += c.length; }
    e.chunks = [];
    for (let i = 0; i < all.length; i += 0x8000) s += String.fromCharCode(...all.subarray(i, i + 0x8000));
    return btoa(s);
  }, flush);
  return Buffer.from(b64, 'base64');
}
