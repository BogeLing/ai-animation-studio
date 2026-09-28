import type { Stage } from '../src';

/** Builds a scene's stage on a canvas; URL params allow per-scene options. */
export type MakeStage = (canvas: HTMLCanvasElement, params: URLSearchParams) => Stage;

/**
 * Every scene in this project, by name. Scenes load lazily, so this list can be read anywhere
 * (the player, the render scripts) without pulling in the scenes themselves. Register new ones here.
 */
export const EXAMPLES: Record<string, () => Promise<MakeStage>> = {
  hello: async () => {
    const { HelloScene } = await import('./hello/main');
    return canvas => new HelloScene(canvas);
  },
  smoke: async () => {
    const { SmokeScene } = await import('./smoke/main');
    return canvas => new SmokeScene(canvas);
  },
  plane: async () => {
    const { PlaneScene } = await import('./plane/main');
    return canvas => new PlaneScene(canvas);
  },
  showcase: async () => {
    const { ShowcaseScene } = await import('./showcase/main');
    return canvas => new ShowcaseScene(canvas);
  },
  tutorial: async () => {
    // The narration (public/voice/tutorial.flac and .json, from tools/voice/narrate.py) is decoded before the stage is built.
    const { TutorialScene, loadVoice } = await import('./tutorial/main');
    const voice = await loadVoice('voice/tutorial.flac');
    return canvas => new TutorialScene(canvas, voice);
  },
  ubc: async () => {
    const { UbcScene } = await import('./ubc/main');
    return canvas => new UbcScene(canvas);
  },
};
