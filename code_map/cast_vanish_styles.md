# Cast Vanish Styles

How a cast sigil leaves the screen depends on the spell. There is no server-side part: the logic and the shader live in `template/default/script.js`, the glow keyframes for ash and radiate (`cast-sigil-glow-out`, `cast-sigil-glow-flare`) in `style.css`, and the "Themed Vanish on Cast" option in `index.html`.

## Choosing the style

`sigilVanishStyle(spell)` returns a numeric id from `VANISH_STYLE`:

1. the top-scoring essence in `sigil_params.essence` through `VANISH_BY_ESSENCE`, but only if it leads the runner-up by at least `VANISH_ESSENCE_MIN_LEAD`;
2. otherwise the school through `VANISH_BY_SCHOOL`;
3. otherwise `dissolve` (id 0, the original effect).

Essences with no physical character of their own (Magic, Mind) are deliberately absent from `VANISH_BY_ESSENCE` so the school decides. Magic alone is the top essence of about a third of the catalog, so the school table matters as much as the essence one.

The lead check exists because essence scores are flat, so the top essence is often decided by noise, and the two editions of one spell can disagree. Find Familiar (2014) led with Poison by 0.0005 and melted like acid. `0.001` is the smallest value that clears the known bad cases. It is a compromise, not a clean cut: no threshold on lead, absolute score, or z-score separates wrong winners from right ones. Some plainly elemental spells have tiny leads too (Wall of Fire 0.0005, Wall of Stone 0.0005) and fall through to the school.

`buildSigilSvg()` stores the id in the render params as `vanishStyle`. It is a pure function of the spell, so the cached markup stays valid; the "Themed Vanish on Cast" option is applied later, in `startCastFadeOut()`, which zeroes the id when the option is off.

## How a style is drawn

A style must not draw its element. Fire does not catch fire and lightning does not throw bolts, in the same way that sigil symbols avoid literal pictures: the theme is carried by how and in what order the sigil itself goes away.

Each style is up to three branches on the `u_vanishStyle` uniform in the sigil fragment shader, all gated on `u_fadeOut > 0` so idle and static (immersive page) renders are untouched:

- `vanishWarp()` (called at the top of `displacedUV()`): where each output pixel samples the sigil from. It is an inverse map: to move the image up, the lookup moves down.
- the themed block at the top of `fadeOutErosionMask()`: the order in which pixels are removed. Every style feeds a per-pixel value into `vanishSweep()`, which sweeps a soft front across it as `u_fadeOut` goes 0 to 1 and is exactly 1 at 0 and 0 at 1. The result is multiplied by the idle erosion so the sigil does not pop when fade-out starts.

- optionally, in `main()`: an extra premultiplied layer added over the sigil, for styles that paint where it has no ink (phantasm, radiate).

Adding a style means adding an id to `VANISH_STYLE`, a branch in the first two places, and a mapping entry. Its length defaults to `SIGIL_FADE_OUT_TOTAL`; `VANISH_SECONDS` overrides it per style, and `startCastFadeOut()` stores the result as `entry.fadeOutTotal`.

### Fracture (glass)

Most styles get away with warping the lookup inside fixed windows. Broken glass cannot: shards have to keep their shape while the gaps between them open. `fractureWarp()` therefore treats shards as rigid bodies. The canvas is a Voronoi partition (`shardSite()`, one jittered site per cell of a `SHARDS` grid, seeded per spell by `u_alphaSeed`). Each shard's site is pushed away from the centre, sags and drifts a little, and the shard turns about its site. For an output pixel the shader undoes that motion for every shard in a 5x5 neighbourhood and keeps the one whose undone position lands back inside that same shard (`inShard()`); if none does, the pixel is in a gap and the lookup returns (-1, -1), which `main()` already treats as transparent. Sites spread apart while shards keep their size, which is what opens the gaps.

The mask branch runs in unbroken-sigil space (it receives the warped lookup), so the nearest site identifies the shard: crack lines darken shard borders in the first eighth of the fade-out, before anything moves, and later each shard disappears whole at its own moment.

### Ash

The light dies first, then the sigil falls apart into dust. `ashRelease()` gives every grain a release moment (top of the sigil first, roughened by a per-grain hash). `main()` darkens each point over the quarter of the fade-out before its grain lets go. The glow needs its own step: it is a CSS drop-shadow on the alpha, so it would keep burning around dark ink, and `startCastFadeOut()` adds the modal class `vanish-glow-out` to run it down. Both glow keyframes start from `--vanish-glow-from`, the value sampled at fade-out start, so dismissing a cast while it draws does not jump the glow up first. `clearCastFadeOutClasses()` runs on open as well as after close, because reopening cancels the delayed cleanup.

`ashWarp()` moves the grains: each accelerates from rest, sways, tumbles and shrinks, and the mask fades it over the last third of its fall. The grid is too fine for the Voronoi test the other rigid styles use, so grains are plain squares of the `ASH` grid. Because grains only move down, the search for which grain covers a pixel is a band of cells above it rather than a square neighbourhood, and `ASH_FALL` must stay below the height that band covers. Grains are tried from the highest row down and the first hit wins, so falling dust paints over the part of the sigil that is still intact.

### Burn

The sigil does not move and no fire is drawn: it goes the way burning paper goes, and the order of disappearance is the whole effect. `burnTime()` gives every point the moment the front reaches it: the front closes in from the rim to the centre, with soft noise for a ragged edge, and the mask cuts the sigil off sharply there. The front starts at `u_inkRadius` (`sigilInkRadius()`, measured at fade-out start), not at the canvas edge, because sigils fill only about half the canvas radius and would otherwise spend the first quarter of the fade-out burning nothing. The unburnt edge heats up through `brightnessOverlay()`, which `main()` already uses to blend towards the bright colour, and the last sliver of ink turns white-hot.

### Tesla

Lightning's style. No bolt or arc is drawn: the sigil loses pieces in sudden jumps, at two places at once. The bites must land on the sigil's ink, which the shader cannot search for, so `buildTeslaBiteMap()` plans them once at fade-out start, seeded by `alphaSeed` so a spell always goes the same way. It reads the sigil's alpha and picks pairs of points until no ink is left, each point on ink no earlier bite reached and the second within `TESLA_BITE_JUMP` of the first when any such ink remains, then spreads the pairs evenly over the fade-out. Picking from the leftovers matters: sampling all the ink lets dense interiors soak up the bites while thin outer rings sit untouched. Each point stamps a radial gradient with canvas `darken` compositing, so the earliest bite wins. The result is `u_vanishMap`, whose red channel is the fade-out progress at which each point is eaten. The mask only compares this with `u_fadeOut`; whatever no bite reached fades over the last 18% of the fade-out, and `main()` lights the ink just before it goes.

### Wind

`windWarp()` tears coarser pieces (`WIND`) off from the left edge first and accelerates them to the right along a wavy path; the search for covering pieces is a row of cells upwind, bounded by `WIND_REACH`. It uses rigid pieces because shifting whole rows read as melting sideways.

### Phantasm

Replaced a scanline-glitch strobe that read as technological. `phantasmRipple()` runs soft rings through the sigil, the real image fades, and `phantasmOverlay()` paints four ghost copies that drift apart, each at its own scale. It stands for Sound and Illusion.

### Radiate

Two beats: the sigil flares in place, then comes apart. `radiateFlare()` runs over the first third of the fade-out: `main()` pushes the lines towards white and `radiateBloom()` spills soft light off them. `radiateProgress()` starts just as the flare peaks and drives the expansion and the centre-out mask, so nothing moves or erodes before then. The mask measures distance against `u_inkRadius`, or a small sigil would lie entirely inside the first part of the sweep and vanish all at once. The expansion is modest because large sigils nearly fill the canvas and the rim goes last. The page's glow is a CSS drop-shadow, so `startCastFadeOut()` adds the modal class `vanish-glow-flare`, whose keyframes peak at the same moment; the 36% peak repeats `radiateFlare()` by hand, and `--vanish-seconds` carries the length.

### Vortex

The sigil cracks, then its shards are drawn down a whirlpool to a point. `vortexWarp()` uses the rigid-shard machinery of fracture at a finer grid (`VORTEX_SHARDS`), but the motion is the swirl: each site is carried round by `vortexAngle()` (centre faster than rim, which winds the shards into spiral arms) and scaled towards the centre by `vortexPull()`, reaching a point by 90% of the fade-out. Each shard turns with the flow plus a little of its own, and shrinks so gaps open. Shards can travel far from where they started, so a fixed neighbourhood around the pixel would miss them; undoing the swirl at the pixel gives the place in the unbroken sigil to search around instead, which works because all shards follow the same flow. The mask draws crack lines with `nearestShard()`, as fracture does, and switches everything off once it has collapsed.

`crumble` is the older, cheaper cousin: square blocks on a fixed grid whose contents slide. The warp chooses blocks by output position, so its mask hashes `v_uv` rather than the warped lookup, or a block would be cut along seams that do not match its edges. It reads as stone breaking up rather than glass.

## Dismissing mid-draw

A cast dismissed while it is still drawing in must not reveal what was never drawn. `startCastFadeOut()` stores the current `u_castProgress` in `entry.heldProgress`, keeps the real timing image, and the animation loop holds that progress, with the draw edge, while the style plays. `u_castHeld` makes the painted layers read ink through `drawnInk()`, and planning (`sigilInkRadius()`, `buildTeslaBiteMap()`) reads `readVisibleAlpha()`, so neither sees parts that were never drawn. Style 0 keeps its original behaviour. A cast dismissed before its images finish decoding never showed anything, so it registers no entry and simply closes.

## Cost

The rigid-piece searches run per fragment on a 1024px target. They try candidates from the top of the stacking order and return on the first hit, `inShard()` rejects a candidate as soon as it can, `displacedUV()` skips its noise for holes, and ash and vortex return early outside the disc their pieces can reach, using `u_inkRadius`. Those bounds must stay wider than the farthest a piece can travel, or the edge of the effect gets cut off. Wind and fracture have no such bound: their pieces reach most of the canvas. `renderSigilFrame()` uploads a texture only when its image changes (`uploadSigilTexture()`); `renderSigil()` writes the same textures directly and resets that record. `u_vanishMap` starts as one white texel so the texture is complete on every draw.

## The flat timing texture

Fade-out normally replays the fade-in reveal timing backwards (`u_castProgress` runs 1 to 0 against the timing texture), which hides whole parts partway through. For a themed vanish, `startCastFadeOut()` replaces the entry's timing image with a 1x1 black canvas (`getSigilFlatTimingCanvas()`), meaning "everything revealed at time 0". The style then owns the whole fade-out and has to reach empty by itself: at `u_castProgress = 0` the shader's fade only drops to 0.5 against this texture. Style 0 keeps the original timing behaviour.

## Not covered

The bokeh is the same for every style, and so is the CSS glow except for ash and radiate.
