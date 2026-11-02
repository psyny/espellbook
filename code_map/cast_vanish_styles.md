# Cast Vanish Styles

How a cast sigil leaves the screen depends on the spell. Everything lives in `template/default/script.js`; there is no server-side part.

## Choosing the style

`sigilVanishStyle(spell)` returns a numeric id from `VANISH_STYLE`:

1. the top-scoring essence in `sigil_params.essence` through `VANISH_BY_ESSENCE`, but only if it leads the runner-up by at least `VANISH_ESSENCE_MIN_LEAD`;
2. otherwise the school through `VANISH_BY_SCHOOL`;
3. otherwise `dissolve` (id 0, the original effect).

Essences with no physical character of their own (Magic, Mind) are deliberately absent from `VANISH_BY_ESSENCE` so the school decides. Magic alone is the top essence of about a third of the catalog, so the school table matters as much as the essence one.

The lead check exists because essence scores are flat, so the top essence is often decided by noise, and the two editions of one spell can disagree. Find Familiar (2014) led with Poison by 0.0005 and melted like acid. `0.001` is the smallest value that clears the known bad cases. It is a compromise, not a clean cut: no threshold on lead, absolute score, or z-score separates wrong winners from right ones. Some plainly elemental spells have tiny leads too (Wall of Fire 0.0005, Wall of Stone 0.0005) and fall through to the school.

`buildSigilSvg()` stores the id in the render params as `vanishStyle`. It is a pure function of the spell, so the cached markup stays valid; the "Themed Vanish on Cast" option is applied later, in `startCastFadeOut()`, which zeroes the id when the option is off.

## How a style is drawn

Each style is up to three branches on the `u_vanishStyle` uniform in the sigil fragment shader, all gated on `u_fadeOut > 0` so idle and static (immersive page) renders are untouched:

- `vanishWarp()` (called at the top of `displacedUV()`): where each output pixel samples the sigil from. It is an inverse map: to move the image up, the lookup moves down.
- the themed block at the top of `fadeOutErosionMask()`: the order in which pixels are removed. Every style feeds a per-pixel value into `vanishSweep()`, which sweeps a soft front across it as `u_fadeOut` goes 0 to 1 and is exactly 1 at 0 and 0 at 1. The result is multiplied by the idle erosion so the sigil does not pop when fade-out starts.

- optionally, in `main()`: an extra premultiplied layer added over the sigil, for styles that paint where it has no ink (burn, phantasm, tesla).

Adding a style means adding an id to `VANISH_STYLE`, a branch in the first two places, and a mapping entry. Its length defaults to `SIGIL_FADE_OUT_TOTAL`; `VANISH_SECONDS` overrides it per style, and `startCastFadeOut()` stores the result as `entry.fadeOutTotal`.

### Fracture (glass)

Most styles get away with warping the lookup inside fixed windows. Broken glass cannot: shards have to keep their shape while the gaps between them open. `fractureWarp()` therefore treats shards as rigid bodies. The canvas is a Voronoi partition (`shardSite()`, one jittered site per cell of a `SHARDS` grid, seeded per spell by `u_alphaSeed`). Each shard's site is pushed away from the centre, sags and drifts a little, and the shard turns about its site. For an output pixel the shader undoes that motion for every shard in a 5x5 neighbourhood and keeps the one whose undone position lands back inside that same shard (`inShard()`); if none does, the pixel is in a gap and the lookup returns (-1, -1), which `main()` already treats as transparent. Sites spread apart while shards keep their size, which is what opens the gaps.

The mask branch runs in unbroken-sigil space (it receives the warped lookup), so the nearest site identifies the shard: crack lines darken shard borders in the first eighth of the fade-out, before anything moves, and later each shard disappears whole at its own moment.

### Ash

`ashWarp()` reuses the same rigid-piece machinery at a much finer grid (`ASH`), with different motion: every flake only falls. `ashProgress()` gives each flake a release moment (top of the sigil first, roughened by a per-flake hash) and a fixed fall duration; the flake accelerates from rest, sways and tumbles, and the mask fades it over the second half of its fall. Because flakes only move down, the search for which flake covers a pixel is a column of cells above it rather than a square neighbourhood, and `ASH_FALL` must stay below the height that column covers. Flakes are tried bottom row first so falling ash paints over the part of the sigil that is still intact.

### Burn

The sigil does not move. `burnTime()` gives every point the moment the fire front reaches it: the front closes in from the rim to the centre, with soft noise for a ragged edge, and the mask cuts the sigil off sharply there. The front starts at `u_inkRadius` (`sigilInkRadius()`, measured at fade-out start), not at the canvas edge, because sigils fill only about half the canvas radius and would otherwise spend the first quarter of the fade-out burning nothing. The unburnt edge heats up through `brightnessOverlay()`, which `main()` already uses to blend towards the bright colour, and the last sliver of ink turns white-hot.

The flames are a separate layer, `flameOverlay()`, because fire must appear where the sigil has no ink, which no warp can do. Each pixel looks down a short wobbling column; burning lines below it (`burnBand()`) heat it, and two upward-scrolling noises cut the heat into small tongues. The column samples the alpha of `u_vanishMap`, here a 128px blurred copy of the sigil built once at fade-out start (`buildSigilFlameCanvas()`), because the real lines are thin enough to fall between samples. `burnBand()` must stay narrow: it decides how much of the ring burns at once, and a wide band turns the small flames into one large blaze.

### Tesla

Lightning's style. Arcs must start and end on the sigil's ink, which the shader cannot search for, so `buildTeslaArcs()` plans the discharge once at fade-out start, seeded by `alphaSeed` so a spell always discharges the same way. It reads the sigil's alpha, picks `TESLA_ARC_COUNT` arcs (ink to ink, or ink out into the air), and returns two things:

- the bite map, in the red channel of `u_vanishMap`: the fade-out progress at which each point is eaten. Every arc end stamps a radial gradient with canvas `darken` compositing, so the earliest bite wins. The mask only compares this with `u_fadeOut`, so 34 arcs cost one texture read. Whatever no arc reached fades over the last 18% of the fade-out.
- `params.teslaArcs`. `teslaArcSlots()` packs the arcs alive right now into the `u_arcs` uniform each frame. `TESLA_SLOTS` must cover the most arcs alive at once (4 with the current count and `TESLA_ARC_LIFE`), and it is repeated as a literal in the shader.

`teslaOverlay()` draws each live arc as a segment bent by two piecewise-linear zigzags (`arcZigzag()`), reseeded 45 times a second. Smooth noise here reads as a thread, not electricity. The line width is corrected for the zigzag's slope; the halo deliberately is not, because the slope jumps at each kink and would throw hard streaks across a wide glow.

### Wind

`windWarp()` tears coarser pieces (`WIND`) off from the left edge first and accelerates them to the right along a wavy path; the search for covering pieces is a row of cells upwind, bounded by `WIND_REACH`. It uses rigid pieces because shifting whole rows read as melting sideways.

### Phantasm

Replaced a scanline-glitch strobe that read as technological. `phantasmRipple()` runs soft rings through the sigil, the real image fades, and `phantasmOverlay()` paints four ghost copies that drift apart, each at its own scale. It stands for Sound and Illusion.

### Vortex

No erosion at all: the lookup rotates (centre faster than rim, which winds straight lines into spiral arms) while scaling down to a point by 90% of the fade-out, then the mask switches it off.

`crumble` is the older, cheaper cousin: square blocks on a fixed grid whose contents slide. It reads as stone breaking up rather than glass.

## The flat timing texture

Fade-out normally replays the fade-in reveal timing backwards (`u_castProgress` runs 1 to 0 against the timing texture), which hides whole parts partway through. For a themed vanish, `startCastFadeOut()` replaces the entry's timing image with a 1x1 black canvas (`getSigilFlatTimingCanvas()`), meaning "everything revealed at time 0". The style then owns the whole fade-out, and the last few percent of `u_castProgress` still guarantee an empty frame at the end. Style 0 keeps the original timing behaviour.

## Not covered

The CSS glow and the bokeh are the same for every style.
