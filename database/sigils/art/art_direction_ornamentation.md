# Sigil Art Direction — Ornamentation (Runes and Separators)

Read [`art_direction_general.md`](art_direction_general.md) first.
Ornamentation spells out the spell's name around the sigil. It is the one
category exempt from the "suggest, don't depict" rule: runes are letters,
and separators are plain geometry.

How slots are filled (which letter goes where, when a separator appears) is
defined in [`../composition_def.md`](../composition_def.md), sections 7–8.

## 1. Runes (`raw/ornamentation/runes/`)

One rune per letter `a`–`z`, angular runic letterforms of even weight.

### Three files per letter

| File | Used in | Slot scale | Stroke weight |
|---|---|---|---|
| `flair_rune_<x>_s.svg` | `ornamentation_s` | 0.3 | the base art |
| `flair_rune_<x>_m.svg` | `ornamentation_m` | 0.5 | 90% of what plain scaling of `_s` gives |
| `flair_rune_<x>_l.svg` | `ornamentation_l` (rune fallback) | 1.0 | 56% of what plain scaling of `_s` gives |

**Why:** the sigil scales the same 50×50 art up for bigger slots, which
scales stroke thickness too. Without separate files, an L-slot rune is more
than three times as heavy as an S-slot rune and looks blocky. The `_m` and
`_l` files keep the **same letterform and canvas**; only the strokes are
thinner, so all three read as the same family once placed.

**Making `_m` and `_l` from a new `_s`:** runes are filled outlines, so
thinning means shrinking the outline inward evenly by
`stroke_width × (1 − ratio) / 2`, with mitred corners. Measure the letter's
own stroke width first (letters differ). Targets: `_m` = 0.90 × `_s`
thickness, `_l` = 0.56 × `_s` thickness.

### Rules

- Same visual family across all 26 letters: even stroke weight, angular,
  vertically centred, similar height.
- Letters are allowed to be literal; they're writing.
- Versions work as for other art: `flair_rune_a_02_l.svg` replaces
  `flair_rune_a_l.svg`.

## 2. Geometric separators (`raw/ornamentation/geo/`)

Separators stand in for spaces in the spell name (in `ornamentation_m` and
`ornamentation_s` slots). One separator design is picked per spell and per
slot category from the spell's random factors, so different spells get
different separators.

### The pattern (set by the diamond)

Every separator design comes as a pair:

| File | Form | Size on the 50×50 canvas |
|---|---|---|
| `flair_geo_<shape>_l_s50.svg` | **Outline** | about 40 wide, stroke about 2.85 |
| `flair_geo_<shape>_s_s50.svg` | **Small solid** | about 14 wide |

### Current set

| Shape | Notes |
|---|---|
| Diamond | The original; the reference for weight and size |
| Circle | Ring / dot |
| Square | Axis-aligned, so it's distinct from the diamond |
| Hexagon | Point up |
| Triangle | Point up, slightly smaller than the others so it doesn't look heavier |

### Rules

- **Simple, single geometric shapes.** No compound or symbolic shapes.
- **Symmetric and north-aligned.**
- **Match the diamond's visual weight.** Pointed shapes (triangle) need to be
  a bit smaller; round shapes a bit smaller in radius than their bounding box
  suggests.
- **Avoid shapes that read as icons.** An outlined plus sign was dropped
  because it reads as a first-aid or Swiss cross.
