import { type CameraOpts, DepthCamera, keys } from '../../src';

/**
 * The 2.5D cut of "Boomerang": the same film through a `DepthCamera`. The lens starts a little left of Clawd, swings
 * right while the dart loops (the hills slide past behind it), comes back as the dart lands, and arcs round the joy.
 * It doesn't crane: the sky is painted on the screen, and rising would lift the hills over its warm horizon.
 */
export const depthCamera = (x: number, o: CameraOpts): DepthCamera => new DepthCamera(x, o, {
  orbit: t => keys(t, [[0, -4], [0.72, -2.5], [2.4, 4.5], [3.5, 1], [5, -2.5]]),
});
