# HTML Sigil Generation

Server-side produces a shared `<defs>` block of `<symbol>` elements from the processed sigil art assets.

- `lib/sigils.py::build_sigil_library()` scans `database/sigils/art/processed`, extracts the art layers, and emits `<symbol id="sig-{category}-{subtype}-{size}">` markup plus lookup tables.
- `generate_html.py` injects that markup as `SIGIL_DEFS` into the template and passes asset/school metadata as JSON placeholders.

Client-side composes each spell's sigil using `<use>` tags against those symbols.

- `template/default/script.js::buildSigilSvg()` resolves the school/level topology, computes placements, and builds an `<svg>` containing a base school `<use>` plus one `<use>` per essence/intent/reach/flow/ornament slot.
- `get_random_seed()` in the same file computes a per-`<use>` seed from the symbol's processed `entity_map.random_group` and the spell's `sigil_params.style.rand_factor_*` values; a group entry of `0` skips that factor, and an all-zero group yields seed `0`.
- `get_spell_noise()` averages `vector_noise`, `angle_noise`, and `position_noise` from the spell style.
- Topology slots flagged `variable_rotation: true` (set by `generate_processed_symbols.py` from `_r_` in a `symbols_layout` sub-group's label) can ignore their baked-in `rotation` and render at `0` instead. This is decided per placement group (`essence`, `intent`, `reach`, `flow`, `orn_l`, `orn_m`, `orn_s` in the `categoryOrder` loop of `buildSigilSvg()`), not per spell: the group's seed — `get_random_seed()` on the `entity_map` `random_group` of its first placed symbol — is compared against the spell's `sigil_params.style.angle_noise`. When the group's seed is greater than `angle_noise`, every `variable_rotation` slot in that group snaps to `0`; otherwise the whole group keeps its topology rotation.
- For `orn_m` and `orn_s` groups only, that same group seed also gates an extra flip applied on top of the above: when the seed is at or below `rand_factor_4`, every symbol in the group gets an additional 180 degree rotation.
- School symbols are split into per-entity symbols. Sub-groups whose seed is `<= GROUP_SKIP_CHANCE` (`0.1`) are skipped. For visible **sub-group** stroke entities, if `get_spell_noise()` is `>= SPELL_NOISE_THRESHOLD` (`0.5`), the group picks a single shared `stroke-width` from its first stroke entity (`base × vector_noise`, then clamped: below `MIN_STROKE_WIDTH / 2` → `0`, below `MIN_STROKE_WIDTH` (`0.2`) → `MIN_STROKE_WIDTH`, otherwise unchanged) and applies that width to every stroke entity in the group.

## Cast reveal: timing texture and draw-on-cast

Cast sigils are not shown as SVG. `applySigilMasks()` rasterizes the composed `<svg>` into three images (full shape, school-only shape, timing) and a WebGL fragment shader paints them to a canvas. The timing image's R channel is each pixel's normalized reveal time; the shader shows a pixel once `u_castProgress` sweeps past it (`smoothstep` of width `u_fadeEdge`).

- Classic fade (`buildSigilTimingSvg()`): one flat gray per `.sigil-part`, from `SIGIL_FADEIN_DELAY`, swept in `SIGIL_FADE_IN_TOTAL`.
- Draw-on-cast (`buildSigilDrawTimingSvg()`, option "Draw Sigil on Cast", `showDrawSigilCast()`): time varies inside each symbol, swept in `sigilDrawSeconds()` (option "Sigil Draw Time").
  - SVG cannot paint a gradient along a stroke, so "traced along its length" is always built the same way: the stroke is stacked N times with a shorter `stroke-dasharray` prefix and an earlier gray each time, earliest copy painted last. This needs `pathLength="1"` on the stroked shape.
  - Non-school symbols are traced per `<use>` (`SIGIL_DRAW_STEPS` copies). The dash is set on the `<use>` and inherited by the shapes, so the defs copy used for this image (`getSigilDrawDefsHtml()`) adds `pathLength="1"` to every shape and strips the art's `stroke-dasharray:none`, which would otherwise block the inheritance. Filled shapes cannot be traced; they get a per-`<use>` `linearGradient` (object bounding box, left to right in the symbol's own frame) as a wipe.
  - The school frame is traced along pen strokes, not along its stored shapes (`appendSchoolDrawChains()`). See the next section for where the strokes come from. Its `<use>`s stay in the image only as a flat underlay at the school window's end time; the strokes are plain `<path>`s in SVG user coordinates stacked over it. A stroke is dropped when every entity it runs through is absent for this spell (skipped sub-group, or stroke-width rescaled to 0); stroke width comes from the widest present entity. Strokes run longest first, each taking a share of the school window proportional to `length ^ SIGIL_CHAIN_LENGTH_POWER` and overlapping the previous by `SIGIL_CHAIN_OVERLAP`.
  - Parts are ordered by their `data-cat` attribute through `SIGIL_DRAW_WINDOWS`, then staggered within a category in DOM order. All times stay within `[SIGIL_DRAW_T_MIN, SIGIL_DRAW_T_MAX]` so the smoothstep fully hides them at progress 0 and fully shows them at 1.
  - `u_drawTip` (fade-in phase only) whitens pixels the front has just passed, giving the pen-tip glow.
- The draw timing image is cached under `<cacheKey>:draw`, separate from the classic one, so toggling the option never reuses a stale image. Immersive-page sigils never use it.
- Fade-out reuses the fade-in timing image with `u_castProgress` running 1 to 0, so a drawn sigil unwinds in reverse while the erosion noise dissolves it.
- The CSS glow (`--glow-intensity`) is paced separately: `applyDrawSigilMode()` puts `draw-sigil` and `--sigil-draw-duration` on the cast modal, which selects `cast-sigil-glow-draw` at the same duration. The Cast button's auto-close waits for the drawing, then holds 2s.

## School pen strokes (`draw_chains`)

`lib/sigil_strokes.py::build_draw_chains()`, called from `lib/sigils.py` at HTML generation, emits `draw_chains` on each school level record: `[{d, length, entities}]`, longest first, `d` in absolute coordinates on the school's 1000-unit canvas.

Why it exists: the art stores shapes as the vector editor left them. Two overlapping squares are saved as their union outline (a star) plus their intersection (an octagon); an interlaced band is saved as the separate pieces left after another band cut through it. Tracing stored paths draws an octagon and eight triangles, not two squares.

How it works:
1. Every stroke shape (path, rect, circle; own `transform` applied) becomes line and cubic segments, cut into edges at each vertex turning more than `CORNER_ANGLE`. Stored path boundaries are discarded. Edges shorter than `JOIN_TOLERANCE` (boolean-op slivers) are dropped.
2. Edge ends are paired, in priority order: smooth (ends touch and the line carries straight through, within `SMOOTH_ANGLE`); bridged (ends face each other in line across a gap up to `MAX_GAP`, which is how a band cut by an interlace is carried across); corner (ends that still touch turn the corner, so the pen does not lift at every vertex).
3. Following the pairs yields the strokes. A bridged gap is emitted as a line, not a new subpath, because a subpath would restart the dash pattern the client traces with.

Only `M L H V C Z` path commands are supported, which is all the processed school art uses; anything else raises `UnsupportedGeometry` and that frame gets an empty `draw_chains`, making the client fall back to per-shape tracing.
