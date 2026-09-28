import {
  AmbientLight, BackSide, BufferGeometry, CanvasTexture, ColorManagement, DirectionalLight, DoubleSide, Fog, FrontSide, LineBasicMaterial, LineLoop,
  LinearSRGBColorSpace, Mesh, MeshBasicMaterial, MeshLambertMaterial, NoColorSpace, PCFShadowMap, PerspectiveCamera, PlaneGeometry, RepeatWrapping, Scene, type Side,
  type Texture, WebGLRenderer,
} from 'three';
import type { Camera3D } from '../camera/Camera3D';
import { clamp } from '../core/math';
import { type V3, add3, centroid3, scale3 } from '../core/math3';
import type { Actor, Diorama, Face } from '../diorama/Diorama';
import { Paper } from '../paper/Paper';
import { makeTexture } from '../paper/texture';
import { faceGeometry, loopGeometry } from './faceMesh';

// Colours are used as given, as the 2D renderer uses them: no sRGB decoding on the way in or encoding on the way out.
ColorManagement.enabled = false;

export interface DioramaGLOpts {
  /** Shadow map size (px). Default 2048. */
  shadowMap?: number;
  /** How much paper grain shows, as `Paper`'s texture option. Default 0.3. */
  grain?: number;
  /** How far faces' edges tear, in world units (a face's own `tear` is in px, for the 2D renderer). Default 0.022. */
  tear?: number;
  /** World units one tile of grain spans. Default 1.4. */
  grainSize?: number;
}

/** How a face sits in the set: on the floor (in `layer` order), its place among its piece's faces, whether it casts. */
type FaceRole = { flat: boolean; layer: number; order: number; casts: boolean; decal?: boolean };
/** A face's meshes for each of the three shapes its torn edge boils between, built as they are first needed. */
type Built = { variants: (Mesh | LineLoop)[][]; shown: number };
type Stand = { mesh: Mesh; canvas: HTMLCanvasElement; paper: Paper; texture: CanvasTexture };

/** Overlay the grain on a face's colour exactly as `Paper` does on the 2D canvas, and cap the fog at `fogMax`. */
const GRAIN = `
#ifdef USE_MAP
  vec3 grainTexel = texture2D( map, vMapUv ).rgb;
  vec3 base = diffuseColor.rgb;
  vec3 overlaid = mix( 2.0 * base * grainTexel, 1.0 - 2.0 * ( 1.0 - base ) * ( 1.0 - grainTexel ), step( 0.5, base ) );
  diffuseColor.rgb = mix( base, overlaid, grainAmount );
#endif`;
const FOG = `
#ifdef USE_FOG
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, smoothstep( fogNear, fogFar, vFogDepth ) * fogMax );
#endif`;

/**
 * A second renderer for a `Diorama`: the same floor, pieces and actors drawn by three.js on the GPU (WebGL2) instead
 * of back to front on the 2D canvas. Faces keep their torn edges (cut into the geometry, boiling like `Paper`'s),
 * the paper grain and a light cut edge, lit by the set's sun with its shade and fog. A depth buffer decides what is
 * in front at every pixel, so pieces may pass through one another, and the sun casts real shadows onto every
 * surface, actors' included. Actors stand as cards facing the camera, drawn by the 2D engine each frame.
 *
 * Draw the sky on the 2D canvas first: `draw` composites the set over what is there. Colour management is off in
 * three.js, so colours match the 2D renderer's.
 *
 * @example
 * const gl = new DioramaGL(1920, 1080);
 * draw(t) { paintSky(); gl.draw(this.set, this.cam.set(view), this.paper); captions.draw(this.paper, t); }
 */
export class DioramaGL {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly sun = new DirectionalLight('#ffffff', 1);
  private readonly ambient = new AmbientLight('#ffffff', 1);
  private readonly grainMap: Texture;
  private readonly edgeMaterial = new LineBasicMaterial({ color: '#fff6e8', transparent: true, opacity: 0.32 });
  private readonly materials = new Map<string, MeshLambertMaterial>();
  private readonly fogMax = { value: 1 };
  private readonly fog = new Fog('#ffffff', 1, 2);
  private readonly built = new Map<Face, Built>();
  private readonly stands = new Map<Actor, Stand>();
  private readonly o: Required<DioramaGLOpts>;

  constructor(readonly width: number, readonly height: number, o: DioramaGLOpts = {}) {
    this.o = { shadowMap: 2048, grain: 0.3, tear: 0.022, grainSize: 1.4, ...o };
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.renderer = new WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.camera = new PerspectiveCamera(32, width / height, 0.1, 2000);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.o.shadowMap, this.o.shadowMap);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 2.5;
    this.scene.add(this.sun, this.sun.target, this.ambient);
    const grain = makeTexture(512, 11);
    this.grainMap = new CanvasTexture(grain);
    this.grainMap.colorSpace = NoColorSpace;
    this.grainMap.wrapS = this.grainMap.wrapT = RepeatWrapping;
    this.grainMap.repeat.set(1 / this.o.grainSize, 1 / this.o.grainSize);
  }

  /** What draws the pixels: the GPU's name, or a software rasteriser's (SwiftShader) when the GPU isn't used. */
  get info(): { renderer: string; webgl2: boolean } {
    const g = this.renderer.getContext(), ext = g.getExtension('WEBGL_debug_renderer_info');
    return { renderer: String(ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)), webgl2: typeof WebGL2RenderingContext !== 'undefined' && g instanceof WebGL2RenderingContext };
  }

  /** Draw `set` through `cam` on the GPU and composite it over the 2D canvas `paper` draws on. */
  draw(set: Diorama, cam: Camera3D, paper: Paper): void {
    this.light(set);
    const boil = paper.boil, seen = new Set<Face>();
    set.floor.forEach((f, i) => this.face(f, { flat: true, layer: i, order: 0, casts: false }, boil, seen));
    for (const p of set.pieces) p.faces.forEach((f, i) => {
      this.face(f, { flat: !!f.flat, layer: 0, order: i, casts: p.casts !== false && !f.flat }, boil, seen);
      for (const d of f.decals ?? []) this.face(d, { flat: true, layer: 1, order: 0, casts: false, decal: true }, boil, seen);
    });
    for (const [f, b] of this.built) if (!seen.has(f)) { this.drop(b); this.built.delete(f); }
    const standing = new Set<Actor>();
    for (const a of set.actors) { this.stand(a, cam, paper); standing.add(a); }
    for (const [a, s] of this.stands) if (!standing.has(a)) { this.scene.remove(s.mesh); s.texture.dispose(); this.stands.delete(a); }

    const { up } = cam.axes;
    this.camera.fov = (cam.fov * 180) / Math.PI;
    this.camera.near = Math.max(0.05, cam.near * 2);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
    this.camera.up.set(up.x, up.y, up.z);
    this.camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
    this.renderer.render(this.scene, this.camera);
    const g = paper.context;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.canvas, 0, 0);
    g.restore();
  }

  /** The set's sun, shade and air: the light keeps its direction, the shadow camera covers the floor and what casts. */
  private light(set: Diorama): void {
    const pts = [...set.floor.flatMap(f => f.pts), ...set.pieces.filter(p => p.casts !== false).flatMap(p => p.faces.flatMap(f => f.pts))];
    const mid = pts.length ? centroid3(pts) : { x: 0, y: 0, z: 0 };
    const reach = Math.max(8, ...pts.map(p => Math.hypot(p.x - mid.x, p.z - mid.z)));
    const at = add3(mid, scale3(set.light, reach * 2));
    this.sun.position.set(at.x, at.y, at.z);
    this.sun.target.position.set(mid.x, mid.y, mid.z);
    Object.assign(this.sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: reach * 4 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.intensity = set.shade[1] * Math.PI;
    this.ambient.intensity = set.shade[0] * Math.PI;
    if (set.fog) { this.fog.color.set(set.fog.color); this.fog.near = set.fog.near; this.fog.far = set.fog.far; }
    this.scene.fog = set.fog ? this.fog : null;
    this.fogMax.value = set.fog?.max ?? 1;
  }

  /** A paper material in a colour: grain overlaid as `Paper` overlays it, fog capped at the set's `max`. */
  private material(color: string, side: Side, decal: boolean, layer: number): MeshLambertMaterial {
    const key = `${color}|${side}|${decal}|${layer}`;
    let m = this.materials.get(key);
    if (m) return m;
    m = new MeshLambertMaterial({ color, map: this.grainMap, side, polygonOffset: decal || layer > 0, polygonOffsetFactor: -1 - layer, polygonOffsetUnits: -2 - 2 * layer });
    m.onBeforeCompile = shader => {
      shader.uniforms.grainAmount = { value: this.o.grain };
      shader.uniforms.fogMax = this.fogMax;
      shader.fragmentShader = `uniform float grainAmount;\nuniform float fogMax;\n${shader.fragmentShader}`
        .replace('#include <map_fragment>', GRAIN).replace('#include <fog_fragment>', FOG);
    };
    m.customProgramCacheKey = () => 'papermotion-grain';
    this.materials.set(key, m);
    return m;
  }

  /** Show a face's meshes for this boil state, building them the first time; they stay while the face lives. */
  private face(f: Face, o: FaceRole, boil: number, seen: Set<Face>): void {
    seen.add(f);
    let b = this.built.get(f);
    if (!b) { b = { variants: [], shown: -1 }; this.built.set(f, b); }
    if (b.shown === boil) return;
    if (b.shown >= 0) for (const m of b.variants[b.shown]) m.visible = false;
    if (!b.variants[boil]) { b.variants[boil] = this.build(f, o, boil); this.scene.add(...b.variants[boil]); }
    for (const m of b.variants[boil]) m.visible = true;
    b.shown = boil;
  }

  /**
   * A face's fill and its light cut edge. A card gets a front and a back, each lifted off the plane toward its own side
   * by its place among its piece's faces, so a later face lies over an earlier one from either side (a crown over its
   * trunk), as the 2D painter lays them.
   */
  private build(f: Face, o: FaceRole, boil: number): (Mesh | LineLoop)[] {
    const { fill, edge, plane: { n } } = faceGeometry(f.pts, f.seed, this.o.tear, boil);
    const meshes: (Mesh | LineLoop)[] = [];
    const side = (color: string, s: Side, sign: number) => {
      const lift = sign * o.order * 0.003, g = lift ? fill.clone().translate(n.x * lift, n.y * lift, n.z * lift) : fill;
      const m = new Mesh(g, this.material(color, s, !!o.decal, o.layer));
      m.castShadow = o.casts;
      m.receiveShadow = true;
      meshes.push(m);
      if (!o.decal) meshes.push(new LineLoop(loopGeometry(edge, n, lift + sign * 0.001), this.edgeMaterial));
    };
    if (f.solid || o.flat) side(f.color, FrontSide, 1);
    else { side(f.color, FrontSide, 1); side(f.back ?? f.color, BackSide, -1); }
    return meshes;
  }

  private drop(b: Built): void {
    const geometries = new Set<BufferGeometry>();
    for (const variant of b.variants) for (const m of variant ?? []) { this.scene.remove(m); geometries.add(m.geometry); }
    geometries.forEach(g => g.dispose());
  }

  /**
   * An actor as a card standing where it stands, turned to the camera: drawn by the 2D engine into a canvas sized to
   * how big it is on screen, and cast into shadow like any other paper.
   */
  private stand(a: Actor, cam: Camera3D, main: Paper): void {
    const p = cam.project(a.at), onScreen = p.depth > cam.near ? (p.scale * a.height) / a.art : 0;
    let s = this.stands.get(a);
    if (!s) {
      const canvas = document.createElement('canvas'), texture = new CanvasTexture(canvas);
      texture.colorSpace = NoColorSpace;
      // Unlit, as the 2D renderer draws actors, but casting its shadow like any paper.
      const mesh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: texture, alphaTest: 0.5, side: DoubleSide }));
      mesh.castShadow = true;
      this.scene.add(mesh);
      s = { mesh, canvas, paper: new Paper(canvas.getContext('2d')!), texture };
      this.stands.set(a, s);
    }
    // The card is square, the actor 45 % of its height (room for arms and hops), feet 5 % above its bottom edge; its canvas
    // has about the px it covers on screen.
    const cardPx = 2 ** Math.round(Math.log2(clamp((a.art * onScreen) / 0.45, 64, 1024)));
    if (s.canvas.width !== cardPx) {
      s.canvas.width = s.canvas.height = cardPx;
      s.texture.dispose();
    }
    const g = s.canvas.getContext('2d')!, k = (0.45 * cardPx) / a.art, size = a.height / 0.45;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cardPx, cardPx);
    g.setTransform(k, 0, 0, k, cardPx / 2, cardPx * 0.95);
    s.paper.boil = main.boil;
    a.draw(s.paper, onScreen || 1);
    s.texture.needsUpdate = true;
    const at: V3 = a.at;
    s.mesh.scale.set(size, size, 1);
    s.mesh.position.set(at.x, at.y + size * 0.45, at.z);
    s.mesh.rotation.set(0, Math.atan2(cam.pos.x - at.x, cam.pos.z - at.z), 0);
  }
}
