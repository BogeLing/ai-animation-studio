# Camera scouting for sets in 3D

A set built in 3D (`Diorama`, see the engine skill) can be filmed from anywhere, so the camera becomes a real
choice. Decide it the way a layout artist does: look at the key moments from several places, keep what works,
then check the whole move before rendering.

## The loop

1. **Shots from the story.** For each beat, write what the shot must show (who, doing what) and how big:
   `wide` sets the place, `medium` shows the action, `full` or `close` a reaction. Keep the camera on the side
   the actors face: they are 2D art that always faces the lens, so shots from behind them don't work.
2. **Scout the key moment.** `pnpm scout <name> <seconds>` draws that moment from nine standard setups; pass
   `--setups=file.json` for your own. Keep a sheet to 6–9 tiles, or they get too small to judge.
3. **Reject by the numbers, then judge by eye.** Drop tiles with `seen` under 90, `OUT OF FRAME` or `clutter`.
   Of the rest, prefer the subject standing out from what is behind it, lines leading to it, headroom, and room
   on the side it moves or looks toward.
4. **Pick keys and check the move.** Write the chosen setups as keys at their times: in a file to try them
   (`pnpm scout <name> --path=move.json`), or in the scene once chosen (`pnpm scout <name> --path` checks the
   film's own move). Watch `preview.mp4` and read the worst numbers: `seen` stays at 100,
   nothing crowds the lens, turns stay under about 30°/s, and a calm move travels under about 3 subject
   heights a second.
5. **Let the user make the taste calls.** Send the sheet with a recommendation and reasons
   ([design-review.md](design-review.md)); the user's choice wins.
6. **Keep the decision as data.** The keys go into the scene as shot setups (`MOVE` in the `diorama` example),
   so "push in more" or "come lower" is a one-number change.

## Rules of thumb

- Start wide and high to set the place; come down to the actor's eye level as the story tightens.
- Stay on one side of the line of action across keys (the 180° rule): bearings of one sign do this.
- Place the subject a third across with room on its moving or looking side (`place`), unless the shot is
  about symmetry.
- A piece near the lens can frame a shot, but make it a choice: `clutter` tells you it is there.
- Fix an occlusion in the set (move the tree) before bending the camera around it. In the `diorama` example,
  the path check caught a pop-up tree swinging across Clawd for six frames; moving it 0.8 m fixed it.

## A 2.5D cut of a 2D film

A film built from parallax layers can be re-shot with a `DepthCamera` (see the engine skill): the same layers become
sheets at real distances and the lens swings round the action. Only the camera changes, so story, sound and timing
stay as they were. Swing 2–8° on beats that move (a throw, a walk), orbit rather than crane when the sky is painted
on the screen, and compare with the original side by side (`tools/video/compare.sh`).

## Speed

Scouting draws on the GPU. On an Apple M4, nine setups of the `diorama` village take about 0.2 s, and its whole
8-second move with numbers for every frame about 5 s, so scout freely.
