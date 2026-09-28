import { type CameraOpts, DepthCamera, keys } from '../../src';
import { STOPS } from './main';

/**
 * The 2.5D cut of the UBC tour: the same film through a `DepthCamera` that changes sides on every walk, as if on a
 * curved track: the campus layers slide across one another between stops. It doesn't crane, since the sky is painted
 * on the screen.
 */
export const depthCamera = (x: number, o: CameraOpts): DepthCamera => new DepthCamera(x, o, {
  orbit: t => keys(t, [[0, -3], ...STOPS.flatMap((s, i): [number, number][] => [[s.arrive, i % 2 ? 3 : -2], [Math.min(s.leave, 11), i % 2 ? 3 : -2]]), [12, 0.5]]),
});
