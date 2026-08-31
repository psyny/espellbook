# Sigil Composition

This document specifies how to build the final sigil SVG for a spell inside the
generated spellbook HTML. It replaces ad-hoc rendering: any script that draws a
sigil (e.g. a future `generate_sigil_svg.py`, or client-side JS in the HTML
itself) should follow this spec.

It reuses the same drawing primitives that `generate_check_symbols.py` already
uses to visualise topology slots (translate + rotate groups centred on a slot),
but instead of drawing debug squares, it places real symbol art there.

## 1. Rendering model: `<defs>` + `<use>`

A spell's sigil is drawn as a single `<svg>` per rendering (see
`svg_reuse_example.html`):

- Every piece of art that ends up on the canvas (the school base art, and every
  essence / intent / reach / flow / ornamentation symbol used) is registered
  once as a `<symbol id="...">` inside a shared `<defs>`.
- Each placement on the canvas is a `<use href="#...">` with a `transform`.

Registering art as `<symbol>` (rather than inlining the paths at every
placement) matters because:

- The same symbol is frequently reused multiple times in one sigil (e.g. the
  dominant essence appears in every essence slot, ornamentation runes reuse
  the same handful of letters, geo flair repeats).
- The same sigil may be rendered more than once on the page (e.g. a small
  thumbnail in a spell list row and a large version in a spell detail view).
  Defining the symbols once and reusing them via `<use>` avoids duplicating
  path data.

Styling follows `svg_html_example.html`: symbol paths get a shared
`sigil-symbol` (or `sigil-symbol-path` / `sigil-symbol-stroke`, matching the
classes already emitted by `generate_processed_symbols.py`) CSS class for
fill/stroke, and the outer `<svg class="sigil">` gets the glow
`drop-shadow(...)` filter treatment. Per-spell color (`sigil_params.style.color_1/2/3`)
should be applied as CSS custom properties or inline `style` on the root
`<svg>` / `<g>` so the shared classes can reference them, rather than baking
colors into each symbol.

## 2. Coordinate system

Every school base SVG (`database/sigils/art/raw/schools/*.svg`, processed into
`database/sigils/art/processed/schools/*.json` + `.svg`) uses a `viewBox="0 0
1000 1000"` canvas. All `topology.*[].x` / `.y` values in the school JSON are
expressed in that same 1000x1000 space, so slots can be used directly — no
rescaling between the school JSON and the school SVG.

Symbol art (essence, intent, reach, flow, ornamentation) is authored at a
smaller scale, sized so it can be dropped straight into that 1000x1000 canvas.
The size is baked into the filename/viewBox: a file ending in `_s100` has
`viewBox="0 0 100 100"` (i.e. it occupies a 100x100 unit box), a file ending
in `_s50` has `viewBox="0 0 50 50"` (a 50x50 unit box). This "sNN" suffix is
purely a render size, not a content variant — do not treat `_s100` and `_s50`
of the same subtype as different art, just different sizes of the same art.

To place a symbol on a topology slot `{ x, y, rotation }` with box size `W`
(100 or 50):

```xml
<use href="#<symbol-id>" width="W" height="W" x="-W/2" y="-W/2"
     transform="translate(<x>,<y>) rotate(<rotation>)" />
```

This mirrors `build_slot()` in `generate_check_symbols.py`: translate to the
slot, rotate around it, then offset the symbol by half its box so it is
centred on the slot rather than anchored at its top-left corner.

## 3. Selecting the base school art

From `sigil_params.school` and `sigil_params.level`, load:

```
database/sigils/art/processed/schools/<school_lowercase>_level_<level>.json
```

(and its sibling `.svg`, via `metadata.base_svg_filename`). This JSON's
`topology` dict is the source of every slot category available for that
school/level combination (`essence`, `reach`, `flow`, `intent`,
`ornamentation_s`, `ornamentation_m`, `ornamentation_l` — not every
school/level has every category, e.g. level 0 schools have no
`ornamentation_s`).

The school's own base art (its `sigil_art` layer) is registered as one
`<symbol>` and placed once via `<use>` at the canvas origin — it is the
backdrop everything else is layered onto.

## 4. Locating symbol art by category

Processed art assets live under `database/sigils/art/processed/<category>/`
(`essence`, `intent`, `reach`, `flow`, `ornamentation/runes`,
`ornamentation/geo`). Each asset is a `.json` + `.svg` pair; the `.json`
carries a `metadata` block:

```json
{ "metadata": { "base_svg_filename": "...", "type": "essence", "subtype": "fire" } }
```

(`ornamentation/runes` assets additionally carry `"variant": "<letter>"`.)

To find the asset for a given name, match on `metadata.type` /
`metadata.subtype` (subtype = the name lowercased), not by re-deriving a
filename — the filename encoding (`e_fire_01_s100.svg`) contains extra
housekeeping tokens (like the `_01`) that are not meaningful for selection.
If more than one asset matches the same `type` + `subtype` + size, pick the
lexicographically first `base_svg_filename` so selection stays deterministic.

Size suffix (`_s100` vs `_s50`) is selected per the rules in each section
below, not by name.

| `sigil_params` field | Category folder | `metadata.subtype` |
|---|---|---|
| `essence_top[i]` | `essence` | essence name, lowercased |
| `intent_top[i]` | `intent` | intent name, lowercased |
| `reach` | `reach` | reach string, lowercased |
| `flow` | `flow` | flow string, lowercased |
| (letter fallback) | `ornamentation/runes` | always `"runes"`; pick by `metadata.variant == letter` |
| (blank fallback) | `ornamentation/geo` | always `"geo"`; see §7 for the pick rule |

## 5. Filling `essence` and `intent` slots

All `essence` slots in the topology are filled with the **same** essence:
`sigil_params.essence_top[0]`. Likewise all `intent` slots are filled with
`sigil_params.intent_top[0]`. (Any additional entries in `essence_top` /
`intent_top` beyond index 0 are not drawn in these slots — they instead feed
`ornamentation_l`, see §6.)

Within the list of slots for a category, order matters for essence sizing:
the **first** slot (in topology array order) uses the `_s100` asset for that
essence if one exists, and every other slot for that same essence uses the
`_s50` asset. If no `_s100` variant exists for that essence, fall back to
`_s50` for every slot. This same first-slot/rest-of-slots sizing rule applies
to any category where both sizes exist for the selected name (today, only
essence assets ship both sizes).

## 6. Filling `reach` and `flow` slots

There is one `reach` slot and one `flow` slot per school/level. They are
filled from `sigil_params.reach` and `sigil_params.flow` respectively (e.g.
`"reach": "close"` → the `reach` asset whose `metadata.subtype == "close"`).

## 7. Filling `ornamentation_l`

`ornamentation_l` slots first absorb essences/intents that didn't fit in §5:

1. Build an overflow queue: `sigil_params.essence_top[1:]` followed by
   `sigil_params.intent_top[1:]` (essences first, in list order, then
   intents, in list order).
2. If that queue is non-empty, fill every `ornamentation_l` slot (in topology
   order) by walking the queue, **cycling back to its start** whenever the
   queue is exhausted before the slots are. Each queued essence/intent is
   drawn using its `_s50` asset (ornamentation is always drawn at the small
   size, regardless of the §5 first-slot rule).
3. If the queue is empty (i.e. `essence_top` and `intent_top` both have
   exactly one entry), fall back to runes: take the spell name, lowercase it,
   drop characters with no matching rune (`ornamentation/runes` only has
   `a`-`z`; spaces, punctuation, digits, apostrophes, etc. are all dropped),
   and fill the `ornamentation_l` slots in order with one letter per slot,
   **cycling back to the start of the filtered name** whenever it runs out
   before the slots do. If the filtered name is empty (no letters at all),
   leave the remaining `ornamentation_l` slots empty.

## 8. Filling `ornamentation_m` and `ornamentation_s`

These never receive essence/intent symbols. Both are filled the same way,
independently of each other and of `ornamentation_l`:

1. Take the spell name as a character sequence (not lowercased/filtered up
   front, since spaces are handled specially — see below).
2. Walk the slots for the category in topology order, consuming one
   character per slot, **wrapping around to the start of the name** whenever
   it's exhausted before the slots are (same wrap rule as §7).
3. For a consumed character:
   - If it's a space, place a geo ornamentation symbol instead of a rune
     (see the pick rule below).
   - Otherwise lowercase it; if a rune exists for it, place that rune.
   - Otherwise (no rune for this character, e.g. a digit or punctuation),
     skip it without consuming a slot — advance to the next character in the
     (wrapping) name and try again, rather than leaving the slot empty.
4. If the spell name has no space and no rune-able character at all, leave
   the category's slots empty.

Geo symbol pick: use `sigil_params.style.rand_factor_1` to pick the geo
ornamentation for every `ornamentation_m` blank, and
`sigil_params.style.rand_factor_5` to pick the geo ornamentation for every
`ornamentation_s` blank, so the choice is stable for a given spell (same
factor reused for every blank in that category) but varies spell to spell.
List the available assets under `database/sigils/art/processed/ornamentation/geo`
sorted by filename, and index into that list with:

```
index = floor(rand_factor * number_of_available_geo_assets) % number_of_available_geo_assets
```

## 9. Summary of slot categories

| Topology category | Filled from | Fallback |
|---|---|---|
| `essence` | `essence_top[0]` (s100 first slot, s50 rest) | — |
| `intent` | `intent_top[0]` | — |
| `reach` | `sigil_params.reach` | — |
| `flow` | `sigil_params.flow` | — |
| `ornamentation_l` | overflow of `essence_top[1:]` + `intent_top[1:]` (cycled) | spell-name runes (cycled) |
| `ornamentation_m` | spell-name runes (cycled) | geo (via `rand_factor_1`) on spaces / unsupported chars are skipped |
| `ornamentation_s` | spell-name runes (cycled) | geo (via `rand_factor_5`) on spaces / unsupported chars are skipped |
