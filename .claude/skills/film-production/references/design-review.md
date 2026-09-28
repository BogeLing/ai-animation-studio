# Design review: variants, captions, logos, colour

## Variants on the same frame

1. Add options to the scene's catalog entry and read them from the URL:
   ```ts
   return (canvas, params) => new MyScene(canvas, {
     caption: params.get('caption') ?? undefined,          // e.g. a | b | c | mix
     palette: params.get('palette')?.split(',').map(h => `#${h}`),
   });
   ```
   Keep one options object (`MySceneOptions`) instead of growing positional constructor arguments.
2. Grab each variant at the same times (from `engines/papermotion/`):
   `corepack pnpm grab myfilm 6.5 20 39.5 --query="caption=b&palette=9a6392,3d5170" --out=out/review`
3. Tile them with labels: `../../tools/video/tile.sh cmp.jpg 2 960 "A now|a.jpg" "B option|b.jpg"`
   (labels may be Chinese or Japanese too).
4. For a detail, add a 1:1 crop tile (`ffmpeg -vf crop=960:540:0:540`).

Grabs run the simulation from 0 up to each time, so times must increase within one call. A 50 s scene
grabs in 20–60 s.

## Deciding between options

- **Keep the options to 2–4.** Build each as a URL-param variant of the same scene (for a prop, one small
  module per option loaded by `import()`, so one broken option can't break the others).
- **Judge them yourself on the comparison sheet**, against the same questions each time:
  - Does it read at film size and on a phone?
  - Does it look like hand-made paper, and is it one design everywhere it appears?
  - Is it apt for the audience and platform? Is there any brand-misuse risk?
- **Measure what can be measured** instead of eyeballing it: colour distance (ΔE) between neighbours,
  contrast with the text on top, whether a label covers a logo.
- **Recommend one, with reasons, and let the user choose.** Their pick wins. Then fix what they point at.

## Captions that belong in a paper world

A clean lower third (a flat rounded bar, printed text, a width that jumps when the line changes, a
crossfade) reads as a TV overlay on top of the diorama. What makes a caption belong:

- **Material**: a torn strip with a shadow and a rim; cut-paper letters (per-letter `paper.text` with a
  small shadow and a white rim, dropped in one by one) for names; a printed look for the long story lines.
- **Imperfection**: tilts of ±1–3°, irregular edges.
- **Attachment**: tape on a corner, a sticker, or strings.
- **Physical change**:
  - a new line is laid down (it appears slightly lifted with a bigger shadow, then presses flat);
  - the old one drops away;
  - a whole label peels off or falls at the end of its chapter.

The `Captions` module (`examples/shared/captions.ts`) implements the laid-down strip that drops away, and
`TitleCard` (`title.ts`) the cut-paper name dropped in letter by letter. Two styles that worked, chosen per
scene:

- **Scrapbook label (bottom left)**: the logo on a white card, taped; a year sticker off the card's corner
  (never over the logo); each story line on its own kraft strip. It suits scenes whose sky is busy with
  props.
- **Stage sign (top left)**: a kraft board flown in on strings when the camera arrives, swinging with
  damping, with the story on a small board below that flips over. It is world space, so it only fits
  where the sky is open, and it isn't visible before the camera gets there.

When the style switches between chapters, lead the eye: the outgoing bottom-left label peels up and to
the left, the sign drops in on strings, and the character glances up at it. Line the sign's left edge up
with the labels (compute its x from the chapter's framing).

## Logos

- Use official files (the brand's own site header, or Wikimedia's official SVGs). Rasterize SVGs large (8–10×)
  with headless Chrome and trim by alpha.
- Print them unmodified: `drawImage` inside `paper.inside()` on a white card, with `imageSmoothingQuality =
  'high'` and paper texture ≤ 0.12.
- Letters-only crops (drop the local-language part of a wordmark) and monochrome versions are fine when
  asked for or official (e.g. a black wordmark used on the brand's own site).
- Don't compose look-alike lockups (e.g. "BRAND | Our Lab"): they imitate official sub-brand marks.
- For public videos, mention nominative use and that brand guidelines forbid recolouring, distorting or
  implying endorsement.

## Colour

- **Accent stickers (years, chapter numbers):**
  - Six saturated brand colours side by side look like a random rainbow.
  - What worked: the brand hues muted to one weight, with any too-similar pair replaced.
  - Two neighbouring oranges clashed, and a teal-green looked wrong for its subject; both were replaced.
  - A set that worked: plum `#9a6392`, slate navy `#3d5170`, dusty rose `#b35c6c`, graphite `#5c6068`,
    muted blue `#48589a` and muted orange `#cf7445`.
- Check neighbours' ΔE (CIEDE2000 over about 15) and contrast with white numerals (about 3.5:1 or more).
- Keep the route red for the route and the tagline only.

## Timelines with cards above and below

People read top to bottom, so alternating cards get read as "top row, then bottom row". Fix it with:

1. The years on the axis, left to right.
2. A reveal in order: the plane flies the route and draws the dashes, each stop's year lands as the plane
   passes, and its card pops up 0.1 s later. The name appears first.
3. Each stem and each card's edge facing the axis tinted in that year's colour.
4. An arrow at the end of the route.

Cards can then be about 400×190 px, large enough for logos to read.

## Characters (the shared Clawd)

- `clawd.width` (for example 0.8) makes it slimmer without touching other films (the default is 1).
- The `clawd.wear` hook draws worn props (the VR visor) as their own paper on top. Straps are clipped to
  the body so they don't turn into "ears". The character's eyes hide once the prop is seated, and the
  visor can show eyes on its glass so it keeps its expression.
