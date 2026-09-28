import { encodeWav } from '../audio/Mixer';
import type { View3 } from '../camera/Camera3D';
import { type CameraMotion, CameraPath, type PathKey, motionBetween } from '../camera/CameraPath';
import { type ShotSetup, type Subject, shot } from '../camera/shot';
import type { Stage } from './Stage';

/** One scouted drawing: a JPEG data URL and the scene's numbers for the view. */
export interface Scouted { image: string; numbers: Record<string, unknown> }

export interface MountOptions {
  /** Don't play; wait for frames to be requested (capture). */
  headless?: boolean;
}

/** What a mounted page exposes on `window` for capture and inspection. */
export interface StageHooks {
  meta: { fps: number; frames: number; width: number; height: number };
  /** Render frame `n` (increasing order) and return it as a JPEG data URL. */
  frame(n: number): string;
  /** Render frame `n` and return the stage's probe. */
  probe(n: number): Record<string, unknown>;
  /** Render frame `n` and leave it on the canvas, for an encoder in the page to take (see scripts/webcodecs.ts). */
  draw(n: number): void;
  /**
   * Simulate up to frame `n` without drawing (increasing order), so a render worker can start in the
   * middle of the film: the simulation is deterministic, so frames drawn after a seek match a full run.
   */
  seek(n: number): void;
  /**
   * Simulate to the end and mix the scene's soundtrack: a base64 WAV plus the cues at their video
   * times, or null for a silent scene. Call it after the last frame (or instead of rendering frames).
   */
  audio(sampleRate?: number): { wav: string; cues: { name: string; at: number; gain: number }[] } | null;
  /** Start over from frame 0. */
  reset(): void;
  /**
   * Scouting shots, for scenes in 3D (see `Stage.renderShot`). Frames go forward only, as everywhere else;
   * `reset` to go back.
   */
  scout: {
    /** Simulate to frame `n` and say where each subject stands. */
    subjects(n: number): Record<string, Subject>;
    /** The camera view for a shot setup of a subject (see `shot`). */
    view(subject: Subject, setup: ShotSetup): View3;
    /** The frame that shows scene time `t`. */
    frameAt(t: number): number;
    /** Frame `n` drawn from each view, as JPEGs `width` px wide, with the scene's numbers for each. */
    shots(n: number, views: View3[], width?: number): Scouted[];
    /**
     * Frames (increasing) drawn along a camera move, with how fast it travels, turns and zooms there, per second of
     * video. The move is `keys`, or the scene's own camera (`Stage.cameraView`) when `keys` is null.
     */
    path(keys: PathKey[] | null, frames: number[], width?: number): (Scouted & { frame: number; t: number; view: View3; motion: CameraMotion })[];
  };
  ready: true;
}

/**
 * Put a stage on a page. It loops in real time, and always exposes `StageHooks` on `window`
 * so a headless browser can pull frames and probes.
 */
export function mount(canvas: HTMLCanvasElement, make: (canvas: HTMLCanvasElement) => Stage, o: MountOptions = {}): StageHooks {
  let stage = make(canvas);
  const hooks: StageHooks = {
    meta: { fps: stage.fps, frames: stage.frames, width: stage.width, height: stage.height },
    frame: n => { stage.renderFrame(n); return canvas.toDataURL('image/jpeg', 0.95); },
    probe: n => { stage.renderFrame(n); return stage.probe(); },
    draw: n => stage.renderFrame(n),
    seek: n => stage.advance(n),
    audio: (sampleRate = 48000) => {
      stage.advance(stage.frames - 1);
      const mix = stage.soundtrack(sampleRate);
      if (!mix) return null;
      const cues = stage.sound.cues.map(c => ({ name: c.name, at: +stage.videoTime(c.at).toFixed(3), gain: +c.gain.toFixed(2) }));
      return { wav: base64(encodeWav(mix, sampleRate)), cues };
    },
    reset: () => { stage = make(canvas); },
    scout: {
      subjects: n => { stage.advance(n); return stage.subjects(); },
      view: (subject, setup) => shot(subject, setup, { width: stage.width, height: stage.height }),
      frameAt: t => Math.min(stage.frames - 1, Math.round(stage.videoTime(t) * stage.fps)),
      shots: (n, views, width = 640) => views.map(v => ({ numbers: stage.renderShot(n, v), image: snapshot(canvas, width) })),
      path: (keys, frames, width = 960) => {
        const path = keys && new CameraPath(keys);
        const at = (t: number) => {
          const view = path ? path.at(t) : stage.cameraView(t);
          if (!view) throw new Error('This scene has no camera of its own in 3D (Stage.cameraView) to check; pass a move instead.');
          return view;
        };
        return frames.map(frame => {
          stage.advance(frame);
          const t = stage.time, rate = stage.rateAt(t), view = at(t), m = motionBetween(view, at(t + rate / stage.fps), rate / stage.fps);
          const motion = { speed: m.speed * rate, turn: m.turn * rate, zoom: m.zoom * rate };
          return { frame, t, view, motion, numbers: stage.renderShot(frame, view), image: snapshot(canvas, width) };
        });
      },
    },
    ready: true,
  };
  Object.assign(globalThis, hooks);
  if (!o.headless) play(canvas, () => stage, hooks);
  return hooks;
}

function play(canvas: HTMLCanvasElement, current: () => Stage, hooks: StageHooks): void {
  let n = 0;
  const loop = () => {
    if (!canvas.isConnected) return;
    current().renderFrame(n);
    n = (n + 1) % hooks.meta.frames;
    if (n === 0) hooks.reset();
    setTimeout(loop, 1000 / hooks.meta.fps);
  };
  loop();
}

/** The canvas as a JPEG data URL, scaled down to `width` px wide. */
function snapshot(canvas: HTMLCanvasElement, width: number): string {
  if (width >= canvas.width) return canvas.toDataURL('image/jpeg', 0.92);
  const small = document.createElement('canvas');
  small.width = width;
  small.height = Math.round((canvas.height * width) / canvas.width);
  small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL('image/jpeg', 0.9);
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
