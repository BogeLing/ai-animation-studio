# Engine API (everything exported from `src/index.ts`)

Import from the index, e.g. `import { Stage, Paper, Beats } from '../../src';`. Coordinates are px,
+y down. `V` is `{ x, y }`. Angles are radians: 0 = +x, −π/2 = up.

## core

- **Vectors:** `add`, `sub`, `scale`, `len`, `lerp`, `lerpV`, `rot(v, a)`, `clamp(x, lo=0, hi=1)`.
- **Easing:** `smoothstep(e0, e1, x)` (safe with ±Infinity edges), `easeInOut(t)`, `overshoot(t, s=1.7)`
  (back-ease).
- `ik(root, target, l1, l2, bend, stretch=1.12)`: the middle joint of a two-bone chain.
- `smooth(pts, n)` / `smoothClosed(pts, n)`: Catmull-Rom through control points.
- **Randomness:** `rng(seed)` gives a seeded PRNG `() => [0,1)`. Also `hash(n)` (stateless `[0,1)`),
  `noise1(x, seed)` and `fbm1(x, seed, octaves)` (smooth, in −1…1), `within(r, [a, b])`, `pick(r, xs)`.
- `Spring(pos: V, stiffness, damping)`: `.step(target, dt)`; fields `pos`, `vel`. For a scalar, use `.x`.

## physics

`World`: a deterministic Verlet world. `Stage` owns one as `this.world`.
- **Fields:**
  - `gravity` (1400);
  - `iterations` (32);
  - `wind(x, y, t) → V`: air or water velocity; points drag toward it;
  - `ground(x) → y`;
  - `surfaces: Surface[]`: one-way platforms;
  - `colliders: Collider[]`: `{ x, y, r, soft? }`. `soft` is a spring stiffness; use it for bodies that
    push through strands;
  - `forces`: `(dt, t) => void` callbacks run every step.
- **Methods:**
  - `point(x, y, { mass, drag, dragY, friction, gravity })`: `mass: Infinity` makes it kinematic. Move
    it with `World.drive(p, x, y)`.
  - `link(a, b, stiff=1, rope=false, length?) → Link`: mutable later.
  - `chain(from, count, seg, dir, opts, stiff, rope) → Pt[]`.
  - `floorBelow(x, y)`: the highest floor at or below y. Walkers query it about 30–40 px above their
    feet.
  - `step(dt, t)`: the Stage calls it for you.
- `Pt` has `x`, `y`, `px`, `py` (the previous position, which carries the velocity), `ax`, `ay` (extra
  acceleration this step), `grounded`.

Other physics primitives:
- **Surfaces and ropes:**
  - `Surface(pts)`: a one-way polyline sorted by x; `heightAt(x)`. Roofs, ledges, letter tops.
  - `rope(world, a, b, length, segments, material, lay?)`: a rope between two points.
- **Bodies:**
  - `Plate(world, localPts, center, angle, material)`: a rigid body from all-pairs links.
    `.aerofoil(spec, nose, tail)` gives lift and flutter (kites, cards, leaves).
  - `SoftBody(world, shape, at, angle, { stiffness, damping, upright, …point opts })`: a shape-matched
    blob. Animate `.rest` to pulse or breathe. Also `.center`, `.toWorld(local)`, `.axis(local)`.
- **Lines:**
  - `Spool(world, anchor, source: () => V, { segment, …point opts })`: a line that pays out behind a
    moving source (yarn, a fishing line). Call `.update()` before each step. Also `.paid` and `.pts`.

## rig

- `Skeleton(defs: BoneDef[], root)`: a bone tree in a "facing right" local space.
  - **Bones:** `BoneDef { name, parent?, length, angle, at?, spring?: { stiffness, damping, inertia,
    sway }, limits? }`. Springs give lag, overlap and follow-through.
  - **Placement:** `root` is the world floor point; `rootOffset` is the local offset of the root bone
    (e.g. hip height); `flip` is 1 or −1, and values in between squash (a paper turn).
  - **Targets:** `set(name, angle)` is relative to the parent; `setWorld(name, angle)`;
    `pose(targets, weight)` blends toward a pose; `reach(upper, lower, localTarget, bend)` is IK.
    Then call `step(dt)`.
  - **Reading:** `map(local) → world`, `toLocal(world)`, `point(name, u, offset)`.
  - **Drawing frames:** `boneFrame(name)` gives local → world along a bone (+x along it).
    `uprightFrame(name, along)` gives a frame where +x is "forward" and +y is "down"; use it for heads,
    faces and torsos.
- `Gait(config)`: procedural legged locomotion for 2 or 4 legs.
  - **Config:** `{ pelvis, pelvisAngle?, legs: [thigh, shin][], phases?, bends?, arms?, hipHeight, step,
    runSpeed, bounce, footLift, footReach, lean, stance, armSwing?, elbow? }`.
  - **Per step:** `update(skel, { speed, crouch?, lean?, ground: localX => localY, footOffset?, limp? },
    dt)`.
  - Keep `footReach ≈ step / 2` (otherwise the feet slide). Knees bend with −1, elbows and hocks with +1.
- `Strand(world, frame: () => (local) => world, rest: V[], { hold, drag, bend, mass?, gravity?,
  falloff? })`: a chain that remembers a shape in a moving frame. Use it for tails, antennae, flaps
  and scarf ends.
  - `.pts`; `.rest` can be reassigned to re-pose it.
  - `.strength` scales the hold; `.flex` scales the resistance to folding (lower it for cloth or wet
    things).
- `Hair(world, headFrame, radius, style: HairStyle, material, seed)`: locks made of strands.
  - `.draw(paper, 'under' | 'over')`; `.strength` (wet or lying hair: lower it).
  - `HairStyle { locks: LockSpec[], palette, sheen, density, jitter }`.
  - `LockSpec { angle, length, width, comb, curl, layer, tone, inset?, hold? }`. Angles are in degrees
    in the head frame: 0 forward, −90 up, 180 back.

## motion

- `Leap(from, to, apex, gravity)`: a planned ballistic hop. `.duration`, `.at(t)`, `.velocityAt(t)`,
  `.progress(t)`. Drive a root with it, then land and kick a squash spring.
- `Swimmer(at, SwimSpec, facing, seed)`: side-view swimming or flying.
  - **Control:** `.steer(desiredVel)` every step, `.kick(impulse)`, `.lookAt`, `.update(dt, flow)`.
  - **Output:** `.pose` gives `{ at, vel, angle, flip, bend, beat, effort }`, which drives a skin.
  - `SwimSpec { maxSpeed, accel, drag, beat: [rest, perSpeed], turn, maxPitch }`.
- `steer.arrive(from, to, speed, slow)`, `steer.orbit(from, center, r, speed, dir, squash)`,
  `steer.flee(from, threat, speed, range)`, `steer.add(...vs)`.
- `School(SchoolSpec)`: boids of `Swimmer`s. It avoids `avoid()` circles and heads to `goal(t)`.
  `.update(dt, t, flow)`, `.members`, `.center`, `.velocity`.

## paper (rendering)

Every stage has `this.paper`, the `Paper` renderer.
- **Settings:** `paper.light = { x, y }`, the direction light travels (e.g. `{ x: -0.6, y: 0.8 }` = from
  the upper right). `paper.edgeColor`, `paper.shadowColor`.
- **Pieces:**
  - `piece(poly, fill, { seed, tear, shadow, edge, texture, rim?, shade? })`: one torn paper piece. Give
    each piece a stable `seed`.
  - `blob(pts, fill, o)`: a smooth closed shape through control points.
  - `tube(pts, w0, w1, fill, o)`: a tapered limb.
  - `ribbon(pts, width(u), fill, o)`: locks, leaves, tails.
  - `line(pts, color, width)`: plain strings and wires.
  - `text(str, at, { font, color, align?, angle?, sheet? })`: letters cut from paper.
- **Grouping:**
  - `sheet({ shadow, rim, shade, texture, edge, anchor, alpha }, draw)`: everything drawn inside merges
    into **one silhouette** with one shadow, rim, core shadow, texture and edge. Draw characters this
    way.
  - `inside(draw)`: only within a sheet. Markings clipped to what is already on it; they never grow the
    silhouette.
  - `clip(region, draw)`: redraw the same piece (same seed) in another color within a region, for socks,
    tips or hems.
  - `layer(alpha, draw, blend?, filter?)`: draw a group as one translucent layer (vellum, glow with
    `'screen'`, depth of field with `'blur(6px)'`). Without `blend` it respects the current
    compositing, so it works inside `inside`.
  - `context` is the current canvas context: an offscreen one inside `sheet` or `layer`.
- **Geometry and type:** `circlePoly(c, r, n, rx?)`, `tubePoly`. `layoutLetters(ctx, text, font) →
  Letter[]` (`ch`, `x`, `width`, `ascent`, `descent`) animates each letter on its own; `textWidth`.
- `drawShafts(paper, ShaftSpec, from, to, t)`: light shafts (sun through water or windows).
- `paper.castShadow(from, grow, draw, { color, blur, alpha })`: the flat shadow a group throws on a backdrop
  behind it from a point light (a fire, a lamp), grown by `grow` away from `from`. Wrap it in
  `paper.clip(wall, …)` to keep it on the wall.
- `darkness(paper, view, { rgb, alpha, lights: Glow[], region? })`: night as a veil over what is drawn,
  with each light (`{ at, radius, strength, core?, aspect? }`) cut out of it. Clip it to a region (wall,
  floor) and draw the cast afterwards.

## scenery

- `scatter({ seed, from, to, spacing, ground, makers: [{ make, weight }], flex?, avoid? }) → PropSet`:
  deterministic placement.
- `drawProps(paper, set, from, to, wind: x => number, t, pushers?)`: draw with sway and with bending
  around bodies passing through.
- **Makers** (`PropMaker`):
  - `flora.tuft`, `flora.tree` (`loose: false` drops the loose leaves), `flora.pine`, `flora.bush`, `flora.rock`, `flora.flower`, `flora.coral`,
    `flora.cloud`;
  - `building({ width, height, colors, window, lit, base })` for skylines (`base` extends the block
    below its ground line so it never floats when the camera rises).
  - You can write your own: `(r, x, y, seed) => ({ x, y, draw(paper, sway, t) {…} })`.
- **Lawns** (`drawSward(paper, spec, from, to, wind, t, pushers)`): a dense mass of overlapping blades in
  rows, each dark at the root and light at the tip (`tones: [root, tip][]`), leaning one way together,
  with broad patches of light and shade and a few dark hairline `accent`s. Hashed per cell (stable
  while panning), gusts travel across it, blades part around pushers. `depth`/`grow` plant a band that
  recedes from the lens; `keep(x, y)` limits it to land; `patchy` gathers blades in clumps with bare
  ground between. For a lawn near the camera, use it only for a short band along the horizon line (one
  row drawn after the character, to hide its feet) and a few fine strands over a flat ground with soft
  patches: many visible blades read as assets or spikes.
- `paper.fill(path, fill, area)` fills a `Path2D` of many small shapes at once (joins a `sheet`).
- **Night sky:** `starSky(SkySpec)` builds stars and a Milky Way band around a pole; `drawSky(ctx, sky,
  { turn, trail, t, twinkle, wash })` draws them turned by `turn` (rad), as arcs when `trail` > 0 (a
  time-lapse), with `wash` hiding the faintest stars (haze, city light). `skyPoint` places a star.
- `RidgeSpec` and `drawRidge(paper, spec, from, to, bottom)`: noise hills with bands, patches and a grass
  fringe. `ridgeHeight(spec, x)`.

## weather and effects

- **Rain:** `drawRain(ctx, RainSpec, view, t, floor?)` is stateless and safe across cuts. Streak layers
  end in splashes where `floor(x)` says (ground, umbrella, roof).
  - `RainSpec { seed, density, period, speed, slant, length, width, rgb, alpha: [a, b], splash? }`.
- **Water:** `drawRipples(ctx, center, rx, ry, RippleSpec, t)` for rings on puddles.
  `drawDrips(ctx, points, floorY, DripSpec, t)` for water dripping off edges.
- **Spray and stencils:** `drawSpray(ctx, { seed, center, radius, rgb, amount, mask?, specks?, opacity? })`:
  pigment blown or sprayed on a surface, stateless in `amount` (0…1); nothing lands inside `mask`.
- `Particles({ seed, gravity, drag, floor?, flow? })`: short-lived specks: splashes, mud, seeds, bubbles,
  confetti.
  - `.emit(at, count, { angle, spread, speed, life, size, carry? })`, `.update(dt)`,
    `.draw((p, u) => …)`. You draw them yourself.
  - `flow(x, y)` makes them drift with wind or current.

## camera and direction

- `Camera(x, { width, height, stiffness, damping, handheld, ease })`:
  - **Layers:** `.layer(paper, depth, view => …)` draws in a parallax layer. Depth is 0 = infinitely
    far, 1 = the action plane, >1 = foreground. The view is `{ from, to, top, bottom }` in that layer's
    coordinates.
  - **Motion:** `.frame({ x, y, zoom, roll?, handheld? }, dt, t)` eases to a framing. `.cut(framing)`
    jumps there. `.snap(x, y)` jumps position only; `.update(x, dt, t, y)` follows a target without
    touching zoom.
  - **Coordinates:** `.toLayer(worldX, depth)` gives where to place scenery on a far layer.
    `.toScreen(p, depth)` gives the screen position.
- `DepthCamera(x, opts, { distance?, focal?, orbit?(t), crane?(t) })`: a drop-in `Camera` for a 2.5D cut. It films
  the same layers as sheets standing at real distances through a perspective lens (a multiplane camera): with no
  orbit or crane it frames every layer as `Camera` does; `orbit` and `crane` (degrees over scene time) swing the
  lens around the framed point, so near sheets slide across far ones. Depth 0 is the sky at infinity (it only turns
  with the lens). The default long lens (height × 4) makes 2–8° of swing read strongly. A scene that builds its
  camera through `{ camera?: MakeCamera }` gets a 2.5D cut in one line; paint drawn straight on the screen (a sky
  gradient) doesn't move with it, so orbit rather than crane over it.
- `Beats<B>(first, { [beat]: { enter?, during?, exit?, next?, after?, then? } })`: a state machine for a
  performance. `.update(t, dt)`, `.current`, `.since(t)`, `.startOf(b)`, `.reached(b)`, `.history`.
  `next` returns a beat name to switch; `after` + `then` is a timed fallback.
- `Edit<S>(first, { [shot]: { frame(ctx) → Framing, next?, after?, then?, cut? } })`: a shot list over
  one continuous simulation. Call `.update(t, dt)` in update and `.apply(cam, t, dt)` in lateUpdate.
  Shots cut hard unless `cut: false`.
- **Timeline helpers:** `ramp(t, a, b)`, `envelope(t, a, b, c, d)`, `blink(t, times)`,
  `keys(t, [[time, value], …])`, `speedRamp([{ from, to, rate }])` (for `StageOptions.rate`, slow
  motion).

## 3D: cameras, shots and dioramas

For sets built in 3D (a paper theatre, a pop-up book) instead of parallax layers. World axes: x right, y up,
z toward the viewer of an unturned camera; units are whatever the set uses (the `diorama` example uses metres).
- **Vectors:** `V3 { x, y, z }` with `add3`, `sub3`, `scale3`, `dot3`, `cross3`, `len3`, `dist3`, `norm3`,
  `lerp3`, `yaw3(p, angle, about?)` (positive swings +z toward +x), `centroid3`, `normal3(poly)` (points to the
  side the polygon winds counterclockwise from), `crossing(from, to, poly)` (where a segment passes through a
  polygon, 0…1, or null).
- `Camera3D(width, height, view?)`: a pinhole camera. `View3 { pos, target, focal, roll? }`; `focal` is in px
  (default `height × 1.76`, a 32° vertical field of view; `focalFor(degrees, height)`).
  - `.set(view)`, `.view`, `.axes`, `.fov`, `.near` (the clip distance).
  - `.project(p) → { x, y, depth, scale }` (px, and px per world unit there); `.polygon(pts) → V[] | null`,
    clipped at the near plane and trimmed to the frame plus a margin, ready for `paper.piece`;
    `.direction(d)` (the sun); `.ray(x, y)`; `.horizon(x?)` (screen y, for the sky); `.box(pts)` (screen box
    as fractions, and `inFrame`).
- `shot(subject, setup, frame) → View3`: a camera placed the way a director describes a shot.
  - `Subject { at, height, facing? }`: the ground point it stands on, and the way it faces (rad, 0 = +z).
  - `ShotSetup { size, bearing?, elevation?, aim?, place?, focal?, roll? }`. `size` is the subject's share of
    the frame's height, a number or a name from `SHOT_SIZES` (establishing 0.06, wide 0.14, medium 0.3,
    full 0.55, close 1.1). `bearing`: degrees around from its front, positive to its left. `elevation`:
    degrees above, negative for a low angle. `place`: where the aim point lands on screen (thirds, room to
    move into).
- `CameraPath([{ at, view, hold? }])`: a camera move through views at scene times. It passes every key exactly,
  is smooth through the middle ones, starts and ends at rest, stops at `hold` keys and zooms in log space.
  `.at(t) → View3`, `.motion(t, dt) → { speed, turn (°/s), zoom }`; `motionBetween(a, b, dt)` for any two views.
- `Diorama({ light, ground, shadow, fog, shade })`: paper faces placed in 3D, drawn through a `Camera3D` with
  `Paper`.
  - `.floor: Face[]`: the ground, roads, ponds, drawn first and in order.
  - `.pieces: Piece[]`: `{ faces, at?, casts? }`, sorted back to front as wholes.
  - `.actors: Actor[]`: `{ at, height, art, draw(paper, scale) }`, 2D art (a rig) standing in the world and
    facing the camera, `art` px tall in its own drawing with its feet at (0, 0).
  - `Face { pts, color, back?, seed, solid?, flat?, tear?, texture?, decals? }`: planar and counterclockwise
    from its front. `solid` faces belong to a closed convex shape and are skipped when facing away; other
    faces are cards that show `back` from behind; `decals` (doors, windows) sit on a face.
  - `.draw(paper, cam)`: the floor, the pieces' shadows on the ground along `light`, then pieces and actors
    back to front, each face lit by the sun, faded into the air (`fog`) and torn like paper.
  - **Builders:** `panel(outline, at, yaw?, tilt?)` (a card; `tilt` −π/2 lies flat, for pop-ups),
    `groundPoly(outline, y?)`, `prism(outline, depth, at, yaw, { color, seed, sides? })` (houses, walls, boxes).
  - **Scouting numbers:** `.judge(cam, billboard(at, width, height, cam.pos)) → { visible, height, x, y,
    inFrame, nearest, close }`, built from `.visible(points, cam)` and `.clutter(cam, near?)`.
  - **Limits:** pieces sort as wholes (the painter's algorithm), so keep them apart; pieces that pass through
    each other can sort wrongly. Shadows fall only on the ground plane. Actors always face the camera, so
    shots from behind them don't work.
- `DioramaGL(width, height, { shadowMap?, grain?, tear?, grainSize? })` from `src/three` (a separate entry point, so
  scenes without it never load three.js): a second renderer for the same `Diorama`, on the GPU (WebGL2). Faces keep
  their torn edges (cut into the geometry), grain and cut edge; a depth buffer settles what is in front at every
  pixel, so pieces may pass through each other, and the sun casts real shadows onto every surface, actors' too.
  `.draw(set, cam, paper)` composites over the 2D canvas (draw the sky first); `.info` names what drew it (a GPU, or
  SwiftShader on the CPU, about 4× slower). Scenes take it as a `SetRenderer` maker: `(width, height) => new DioramaGL(width, height)`.

## audio

Sound is code, like everything else. Nothing here knows what a scene sounds like; scenes compose.
- **From the simulation:** `this.cue(name, { gain, pan, pitch, data })` fires an event at the current
  scene time (ignored in the pre-roll); `this.level(name, value)` records a continuous level every step.
  Both land in `this.sound` (`SoundLog`: `.cues`, `.named(name)`, `.track(name) → t => value`). Each cue
  has a stable `seed`.
- **The soundtrack:** override `soundtrack(sampleRate): Stereo | null` on the stage. It runs once after
  the whole story. Place sounds at `this.videoTime(cue.at)`; read levels at `this.sceneTime(videoT)`;
  `this.rateAt(t)` gives the slow-motion rate; `this.videoLength` the length.
- **Voices** (`voice.*`, each `(opts, sampleRate) → Float32Array`; `Param` = number or `t => number`):
  - `noise({ duration, seed, filter, freq, q, attack, decay, hold, crackle, level })`: steps, crunches,
    whooshes, wind, rumble. `crackle` makes grains (paper, snow, gravel); `level` drives it over time.
  - `thump({ duration, seed, from, to, sweep, decay, click, tone })`: impacts and kicks.
  - `pluck({ freq, duration, seed, decay, brightness })`: Karplus-Strong strings, harp, bass.
  - `bell({ freq, duration, ratio, index, decay, indexDecay })`: FM bells, music box, celesta.
  - `tone({ freq, length, release, attack, wave, voices, detune, cutoff, q, vibrato })`: pads, bass,
    leads, chirps (glide with a `freq` function).
  - `layer(sr, { buffer, gain, delay }…)` stacks voices into one sound.
- **Instruments** (`instrument.*`, pitched by MIDI, peak near 1): `musicBox`, `mallet`, `harp`, `bass`,
  `pad(midi, length)`, `chime`, and `chirp(fromHz, toHz, length)` for a small creature's voice.
- **DSP:** `Biquad`, `Smoother`, `noiseSource`, `decayEnvelope`, `gate`, `wave`, `hz(midi)`, `db`.
- **Music:** `note('F#4')`, `degree(root, mode, d)`, `triad(root, mode, d, seventh?)`, `tempo(bpm,
  offset, swing)`, `MODES`.
- `Mixer(duration, sampleRate)`: `.bus(name, { gain, reverb })`, `.add(bus, at, buffer, { gain, pan,
  rate })`, `.render({ reverb: { room, damp, width }, master, ceiling, fadeIn, fadeOut }) → Stereo`.
  Also `freeverb`, `limit`, `encodeWav`.

## stage

`Stage` (abstract): `constructor(canvas, { duration, width=1920, height=1080, fps=30, substeps=2,
preroll=0.6, rate? })`.
- **Hooks:**
  - `start()`: once, after the pre-roll;
  - `update(t, dt)`: before physics: intents, beats;
  - `lateUpdate(t, dt)`: after physics: cameras, contacts;
  - `draw(t, frame)`;
  - `probe()`: numbers for inspection.
- **Scouting (scenes in 3D):** return the scene's own camera from `cameraView(t)` and draw from
  `this.scouting ?? this.cameraView(t)`; list the cast in `subjects()` (`Record<string, Subject>`); return numbers
  for a view from `scout(view)` (usually `set.judge(…)`). `renderShot(n, view)` draws frame n from another view
  without touching the simulation; `pnpm scout` uses it.
- **Fields:** `this.world`, `this.paper`, `this.ctx`, `this.time`, `this.dt`, `this.settling` (true
  during the pre-roll).
- **Screen-space finishing** (after all layers):
  - `fillGradient(ctx, stops)`: a backdrop;
  - `vignette(ctx, rgb, strength, inner)`;
  - `caption(ctx, text, o)`;
  - `grade(ctx, cssFilter)`: e.g. `'grayscale(1) contrast(1.1)'`;
  - `grain(ctx, frame, amount)`;
  - `wash(ctx, color, alpha, blend?)`: fades and flashes;
  - `letterbox(ctx, 2.39)`;
  - `tearWipe(ctx, u, drawNext, { seed, angle })` and `irisWipe(ctx, u, center, drawNext, { seed })`:
    transitions.
