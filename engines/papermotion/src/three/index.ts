// A second renderer, on three.js (WebGL2 on the GPU). A separate entry point, so scenes that don't use it never load three.js:
//   import { DioramaGL } from '../../src/three';
export { DioramaGL, type DioramaGLOpts } from './DioramaGL';
export { facePlane, tornOutline, faceGeometry, loopGeometry, type FacePlane } from './faceMesh';
