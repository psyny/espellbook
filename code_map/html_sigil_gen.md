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
