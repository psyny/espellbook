# Spell `rand_factor` Logic

`sigil_params.style` stores five deterministic pseudo-random values in `[0, 1]` for every spell. They are produced by `lib/sigil_params.py::calculate_rand_factors()` during catalog generation and consumed later by the color and sigil-composition code.

## Generation

All five values are derived from stable SHA-256 hashes so the same spell always gets the same factors across runs:

| Field | Seed | Meaning |
|---|---|---|
| `rand_factor_1` | `school\|name` lower-cased | Spell identity — stable for a given school + name |
| `rand_factor_2` | canonical normalized Essence vector | Semantic "what the spell is" |
| `rand_factor_3` | canonical normalized Intent vector | Semantic "what the spell does" |
| `rand_factor_4` | `reach\|flow` | Spell range/geometry bucket |
| `rand_factor_5` | `rand_factor_1\|rand_factor_2\|rand_factor_3\|rand_factor_4` | Synthesis of the other four |

The helper `stable_hash_to_float()` hashes a UTF-8 string with SHA-256, takes the first 8 bytes as a big-endian integer, and divides by `2**64 - 1` to get a value in `[0, 1]`. `_canonical_vector_string()` formats a normalized vector as `name:value|name:value` with six decimal places.

## When to use each factor

Use `rand_factor_1` when the choice should depend on the spell's fixed identity (school + name). It is used for:
- The hue drift of the primary fill color (`calculate_color_1`).
- Picking geo ornamentation for `ornamentation_m` blanks (`template/default/script.js` and `database/sigils/composition_def.md §8`).

Use `rand_factor_2` when the choice should reflect the spell's Essence semantics. It is used for:
- The lightness drift of the core glow color (`calculate_color_2`).
- Per-Essence randomization in the aura color (`calculate_color_3`).

Use `rand_factor_3` when the choice should reflect the spell's Intent semantics. It is used for:
- The lightness drift of the aura color (`calculate_color_3`).

Use `rand_factor_4` when the choice should reflect the spell's range and shape (reach + flow). It is currently not used by the default color or composition code, but is available for future reach/flow-driven variations.

Use `rand_factor_5` when the choice should blend identity, semantics, and geometry into a single stable seed. It is used for:
- Picking geo ornamentation for `ornamentation_s` blanks.
- As a general "spell-level random" in `get_random_seed()` on the client: symbol `entity_map` groups can request any subset of factors via `random_group`; `5` gives a fully-mixed seed while `0` entries skip that factor.

## Client-side seeding

`template/default/script.js::get_random_seed(randomGroup, style)` multiplies the requested factors together to produce a per-symbol seed. A `random_group` entry of `0` skips that factor; if every entry is skipped the seed is `0`.


## Random var usage

The values below live in `spell.sigil_params.style` and are generated server-side by `lib/sigil_params.py`. On the client they are consumed in `template/default/script.js`.

- **`vector_noise`, `angle_noise`, `position_noise`** — Averaged by `get_spell_noise()` into `spellNoise`. This gates whether school **sub-group** strokes are rescaled. When rescaling, the new width is `entity.stroke_width * vector_noise`.

- **`rand_factor_1` ... `rand_factor_5`** — All five feed into `get_random_seed()`. Each entity/group in a symbol's `entity_map` lists a `random_group` array of factor numbers; a `0` entry skips that factor, and the remaining factors are multiplied together to produce a deterministic per-entity seed. This seed decides whether a sub-group is skipped, how much stroke-width is applied, etc.

  Specific direct uses in the composition code:
  - **`rand_factor_1`** — Picks the geo ornamentation asset for every blank (space / unsupported character) in `ornamentation_m` slots (`fillWithRunesAndGeo()` → `pickGeoAsset()`).
  - **`rand_factor_2`, `rand_factor_3`** — No dedicated composition code paths yet; they participate only through generic `random_group` seeding.
  - **`rand_factor_4`** — Compared directly (not as part of `random_group` seeding) against the placement group's own seed for `orn_m` / `orn_s` groups only, in `buildSigilSvg()`'s `categoryOrder` loop. When the group's seed is at or below `rand_factor_4`, every symbol in that group gets an extra 180 degree rotation on top of whatever the `angle_noise` check (below) produced.
  - **`rand_factor_5`** — Picks the geo ornamentation asset for every blank in `ornamentation_s` slots.

- **`angle_noise`** — Compared directly (not part of `random_group` seeding) against each placement group's own seed in `buildSigilSvg()`'s `categoryOrder` loop (groups: `essence`, `intent`, `reach`, `flow`, `orn_l`, `orn_m`, `orn_s`). The group's seed is `get_random_seed()` on the `entity_map` `random_group` of its first placed symbol. When that seed is greater than `angle_noise`, every topology slot in the group flagged `variable_rotation: true` (see `generate_processed_symbols.py`, set from `_r_` in a `symbols_layout` sub-group's label) ignores its baked-in `rotation` and renders at `0`; otherwise the group keeps its topology rotation.
