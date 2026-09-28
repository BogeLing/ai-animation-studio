import { type V3, add3, dist3, scale3, yaw3 } from '../core/math3';
import { Camera3D, type View3 } from './Camera3D';

/** Focal length (px) that gives a vertical field of view of `degrees` on a frame `height` px tall. */
export const focalFor = (degrees: number, height: number): number => height / 2 / Math.tan((degrees * Math.PI) / 360);

/** How tall the subject stands on screen, as a fraction of the frame's height, for each named shot size. */
export const SHOT_SIZES = { establishing: 0.06, wide: 0.14, medium: 0.3, full: 0.55, close: 1.1 } as const;
export type ShotSize = keyof typeof SHOT_SIZES;

/** What a shot is about: the ground point it stands on, how tall it is, and which way it faces (rad; 0 faces +z). */
export interface Subject { at: V3; height: number; facing?: number }

/** A shot described the way a director would; every field but `size` has a default. */
export interface ShotSetup {
  /** How tall the subject is on screen: a shot size, or a fraction of the frame's height. */
  size: ShotSize | number;
  /** Degrees around the subject from straight in front of it; positive swings the camera to the subject's left. Default 0. */
  bearing?: number;
  /** Degrees above the aim point; negative looks up at the subject. Default 8. */
  elevation?: number;
  /** The point on the subject to frame, as a fraction of its height. Default 0.5, or 0.72 for a close shot. */
  aim?: number;
  /** Where that point lands on screen, as fractions of the frame. Default the centre; thirds leave room to look or move into. */
  place?: { x: number; y: number };
  /** Focal length in px. Default: a 32° vertical field of view. */
  focal?: number;
  roll?: number;
}

/**
 * The camera view for a shot of `subject`: sized so the subject fills `size` of the frame's height, from `bearing`
 * degrees around it and `elevation` degrees above, with its aim point at `place` on screen. Scenes build their camera
 * moves from these (see `CameraPath`), and `pnpm scout` renders candidates side by side.
 *
 * @example
 * const frame = { width: 1920, height: 1080 };
 * const wide = shot({ at: hero, height: 1.2 }, { size: 'wide', bearing: -35, elevation: 25 }, frame);
 * const near = shot({ at: hero, height: 1.2 }, { size: 'full', bearing: -10, place: { x: 0.4, y: 0.55 } }, frame);
 */
export function shot(subject: Subject, spec: ShotSetup, frame: { width: number; height: number }): View3 {
  const focal = spec.focal ?? frame.height * 1.76, size = typeof spec.size === 'number' ? spec.size : SHOT_SIZES[spec.size];
  const aim = add3(subject.at, { x: 0, y: (spec.aim ?? (spec.size === 'close' ? 0.72 : 0.5)) * subject.height, z: 0 });
  const distance = (focal * subject.height) / (size * frame.height);
  const bearing = ((spec.bearing ?? 0) * Math.PI) / 180 + (subject.facing ?? 0), elevation = ((spec.elevation ?? 8) * Math.PI) / 180;
  const out = yaw3({ x: 0, y: Math.sin(elevation), z: Math.cos(elevation) }, bearing);
  const view: View3 = { pos: add3(aim, scale3(out, distance)), target: aim, focal, roll: spec.roll ?? 0 };
  const place = spec.place ?? { x: 0.5, y: 0.5 };
  if (place.x === 0.5 && place.y === 0.5) return view;
  // Turn the camera until the aim point sits where it was asked to: each pass moves the target by the screen error.
  const cam = new Camera3D(frame.width, frame.height, view), want = { x: place.x * frame.width, y: place.y * frame.height };
  for (let i = 0; i < 16; i++) {
    const p = cam.project(aim), ex = p.x - want.x, ey = p.y - want.y;
    if (Math.abs(ex) < 0.01 && Math.abs(ey) < 0.01) break;
    const { right, up } = cam.axes, k = dist3(cam.target, cam.pos) / cam.focal;
    cam.target = add3(cam.target, add3(scale3(right, ex * k), scale3(up, -ey * k)));
    cam.update();
  }
  return cam.view;
}
