# Inspection: look before you claim

## Tools

```bash
pnpm grab <name> 0.5 2 4.2 7 --probe   # prints the scene's probe() at each time (seconds, increasing)
pnpm grab <name> 0.5 2 4.2 7           # + frames out/grab/<name>_<t>.jpg and out/grab/<name>_sheet.jpg
pnpm render <name>                     # the real video: out/<name>.mp4 (minutes for heavy scenes)
pnpm sheet <name> [fps=2] [from=0] [seconds=10]   # out/<name>_sheet_<from>.jpg from the video
pnpm listen <name>                     # soundtrack only: cue list, loudness, out/<name>_audio.png
pnpm scout <name> 3.4                  # a scene in 3D: one moment from nine shot setups, with numbers
pnpm scout <name> 3.4 --setups=s.json  # your own setups (the fields of ShotSetup)
pnpm scout <name> --path              # the film's own camera move: strip, preview.mp4, numbers per frame
pnpm scout <name> --path=move.json     # the same for a candidate move (shot setups at times)
pnpm typecheck && pnpm test
```

- Open the JPEGs and look at them. Crop or grab more frames around a problem instead of guessing.
- `pnpm dev` serves `/?example=<name>` (the rendered MP4) and `&live` (the browser run, only a
  sketchpad).
- **Faster:** `grab --probe` takes seconds. A full render takes minutes (about 3–5 for 30 s at 1080p
  with many sheets).

## Order of checks

1. **Numbers first.** Put in `probe()`:
   - positions;
   - the current beat or shot;
   - `history.map(b => b.beat + '@' + b.at)`;
   - counts of things that should exist (particles, school members);
   - distances that define contacts.

   Most bugs show here: late arrivals, a beat skipped, an event firing at once, an actor off-screen,
   `NaN`.
2. **A contact sheet of stills** across the whole timeline (8–12 times). Check that the story reads,
   the framing, parallax, and that every set has its layers.
3. **Full resolution on key frames:** faces, contacts, silhouettes, seams, proportions, line weights
   in close-ups.
4. **Render, then look at the video's sheet** (2 fps) for timing, and at 5 fps around fast actions
   (falls, jumps, cuts).
5. **Measure motion problems numerically.** Log how far points move per frame. Anything over about 12
   px in one frame on a strand is a jump.

## Scouting a camera in 3D

`pnpm scout` draws on the GPU (`--cpu` to force the CPU; the numbers are the same) and writes to `out/scout/`.
Each tile is labelled with numbers from the scene's `scout(view)`:
- `seen`: the share of the subject no piece hides; `size`: its share of the frame's height;
- `near`: the distance to the nearest piece through the frame; `clutter`: the share of the frame where a piece
  is closer than 4 units; `OUT OF FRAME` when part of the subject leaves the frame.

1. **Reject by the numbers:** `seen` under 90, `OUT OF FRAME`, any `clutter` (unless it is a deliberate
   foreground frame).
2. **Judge the rest by eye:** does the subject stand out from what is behind it (value and colour), do lines
   lead to it, is there headroom and room to move into? Numbers can't see a subject merging with a wall of
   the same colour.
3. **Check the whole move** with `--path`: it prints the worst of each number over every frame. A turn above
   about 30°/s reads as a whip pan; travel is in subject heights per second.

In the `diorama` example, the path check caught a pop-up tree swinging up across Clawd for six frames
(`seen 81`); moving the tree fixed it.

## What to look for in every pass

- The key event happens in frame, big enough.
- Nothing pops between frames: strands, props, cameras.
- Feet touch floors, bodies touch what they touch, and held props sit in hands.
- Light direction is consistent within a shot.
- Background layers exist and move slower than the foreground (compare two times).
- Close-ups have thin rims and a readable face.
- Transitions and cuts land on the intended moment.

## Reporting

Tell the user what you checked and how:
- which frames you looked at;
- what the probes showed;
- what still looks weak.

Don't call motion smooth without watching the render. When a fix taught something general, add it to
`docs/field-notes.md`.
