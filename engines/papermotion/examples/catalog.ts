import type { Stage } from '../src';

/** Builds a scene's stage on a canvas; URL params allow per-scene options. */
export type MakeStage = (canvas: HTMLCanvasElement, params: URLSearchParams) => Stage;

/**
 * Every scene in this project, by name. Scenes load lazily, so this list can be read anywhere
 * (the player, the render scripts) without pulling in the scenes themselves. Register new ones here.
 */
const HERE: Record<string, () => Promise<MakeStage>> = {
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
  diorama: async () => {
    const { DioramaScene } = await import('./diorama/main');
    return canvas => new DioramaScene(canvas);
  },
  diorama_three: async () => {
    const [{ DioramaScene }, { DioramaGL }] = await Promise.all([import('./diorama/main'), import('../src/three')]);
    return canvas => new DioramaScene(canvas, (w, h) => new DioramaGL(w, h));
  },
  plane25d: async () => {
    const { PlaneScene } = await import('./plane/main'), { depthCamera } = await import('./plane/depth');
    return canvas => new PlaneScene(canvas, { camera: depthCamera });
  },
  ubc25d: async () => {
    const { UbcScene } = await import('./ubc/main'), { depthCamera } = await import('./ubc/depth');
    return canvas => new UbcScene(canvas, { camera: depthCamera });
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

/**
 * Films kept out of this public repository (client work, personal films) go in `examples/local/`, which git
 * ignores: usually a link to a folder of a private repository (`ln -s ~/private-repo/films examples/local`). If it
 * holds a `catalog.ts` exporting `EXAMPLES`, those films are listed with these, for the player and every script.
 */
const LOCAL_CATALOG = './local/catalog.ts';
const LOCAL: Record<string, () => Promise<MakeStage>> = await import(/* @vite-ignore */ LOCAL_CATALOG).then(m => m.EXAMPLES ?? {}, () => ({}));

export const EXAMPLES: Record<string, () => Promise<MakeStage>> = { ...HERE, ...LOCAL };
