# Sigil Art Direction — General

This is the art direction for every piece of sigil art: what it should look
like, why, and how to make new pieces that fit. It is written for anyone
creating art for the sigils, human or AI. For the mechanics of placing art on
the canvas (which file goes in which slot), see
[`../composition_def.md`](../composition_def.md).

Read this first, then the doc for the category you're working on:

| Doc | Covers |
|---|---|
| [`art_direction_schools.md`](art_direction_schools.md) | School drawings: the frame, symbol layout, complexity by level |
| [`art_direction_essence.md`](art_direction_essence.md) | Essence symbols, the heart of each sigil |
| [`art_direction_satellites.md`](art_direction_satellites.md) | Intent, flow and reach symbols |
| [`art_direction_ornamentation.md`](art_direction_ornamentation.md) | Runes and geometric separators |

## 1. What a sigil is

A sigil is a spell written down. Each part of the casting gets its own
symbol, and the school arranges them into one figure:

| Part | Role in the figure | Answers |
|---|---|---|
| **School** | The frame: overall silhouette, and where every other symbol sits | *What kind of magic is this?* |
| **Essence** | The heart, the largest symbol, at the centre | *What is it made of?* |
| **Intent** | Main satellite, at the top | *What is it for?* |
| **Reach** | Satellite | *How far does it go?* |
| **Flow** | Satellite | *How does it spread?* |
| **Ornamentation** (l / m / s) | Secondary essences/intents, spell-name runes, geometric separators | *Whose spell is this, and how elaborate is it?* |

A reader should get a feeling for the spell before decoding any single
symbol: the school's shape first, then the essence at the centre, then the
satellites, then the ornament.

## 2. Two visual languages

1. **Architecture: the school drawings.** Ruled, compass-and-straightedge
   geometry with thin, even lines. It can be literal and symmetric. It is
   the "paper" the spell is written on.
2. **Handwriting: the symbols** (essence, intent, reach, flow). Expressive and
   suggestive, never illustrative. They carry meaning and feeling.

Ornamentation sits in between: runes are letters, and separators are plain
geometry.

## 3. The core rule: suggest, don't depict

> A symbol draws **how a thing behaves**, not **what it looks like**.

A flame icon is read in an instant and then there is nothing left to read. A
good sigil symbol carries the *movement, rhythm and weight* of its subject,
so it is recognised on the second look, not the first.

Use this two-part test on every symbol:

- **Too literal:** you can name the object at a glance without being told.
- **Too abstract:** after being told the name, you still can't *feel* it.

The target is between the two. Told "this is fire", the viewer should think
*"…yes, of course"*.

**It's a symbol, not a picture.** Don't reproduce the physical complexity of
the thing. Lightning doesn't need dozens of cracks: three strokes that each
change direction twice, alternating left and right, are enough to *remind*
you of a bolt without *being* one. Take one defining trait of the behaviour
and build a clean structure around it.

## 4. The house style

These traits recur across the approved art. New art should share them.

1. **A verb, not a noun.** Fire *rises and curls*, sound *spreads*, thunder
   *shatters outward*, stone *stacks*, time *loops back*, poison *multiplies*.
   Pick the verb first, then draw it.
2. **Echo and repetition.** Nested or parallel copies of a line give rhythm
   and read as magic rather than illustration: sound's arcs, thunder's
   hexagons, water's waves, reach's rows of dashes.
3. **Gesture strokes.** Organic subjects use calligraphic strokes that swell
   and taper, like one confident brush movement. Structured subjects use
   even, engraved strokes with crisp corners. Pick one per symbol.
4. **Accent dots, used sparingly.** One to five deliberate solid dots act as
   punctuation (sparks, a centre, a source). **Don't use dots as the main way
   to fill a shape**: a field of dots looks unfinished and disappears at small
   sizes. Short dashes or strokes are usually better (see plant).
5. **Open line art.** Mostly strokes with negative space; solid fills only
   for small accents.
6. **Centred and balanced.** Fill most of the guide circle (about 80–95%),
   with the visual weight at the centre.
7. **One idea per symbol.** One dominant gesture; detail supports it.

## 5. Symmetry and orientation

| Category | Symmetry | Orientation |
|---|---|---|
| Essence | Asymmetry allowed when the idea needs it (fire, air). Rotational balance is common. | Its main feature should face north when it has one (magic's open arm points up). |
| Intent, flow, reach | **Mirror-symmetric about the vertical axis.** | **North-aligned**: the symbol reads upright, its "direction" pointing up. |
| Separators | Symmetric. | North-aligned. |

Slots rotate symbols to follow the school's layout, so a symbol that is not
north-aligned ends up pointing in arbitrary directions once composed.

## 6. Icon lookalikes to avoid

Almost every rejected draft failed by accidentally resembling a known icon.
Before you call a symbol done, check it against this list of real misses
from this project:

| Looked like | What caused it |
|---|---|
| Wi-Fi icon | Concentric arcs fanning from a dot or corner |
| Radiation or biohazard sign | Three wedges or three lobes around a dot |
| Smiley face, eye | A dot inside a U shape, or a dot inside an almond (vesica) |
| "Empty set" (∅) | A ring with a slash through it |
| Exclamation mark | A heavy vertical stroke above a dot |
| Letters (D, G, ʖ) | Half-square, half-circle loops; open spirals |
| Sun, target, cog | Rays around a ring; concentric solid rings; a wavy ring |
| Parachute | Threads converging from an arc to a dot |
| Steam/smell icon | Three parallel wavy lines |
| First-aid/Swiss cross | An outlined plus sign |
| Lightning bolt / zap | Zigzag paths, many jagged cracks |
| Snowflake, cross | Six-fold or four-fold branching arms |
| Twig, tree, vine | Branching tapered strokes from one stem |
| Galaxy | A spiral arm over a field of dots |
| Bird, insect | Two mirrored blades meeting at a point |
| Caterpillar | A row of linked bumps |

## 7. Line and colour

- **Black on transparent, always.** Never bake colour into the art. Spell
  colour, glow and the draw-in animation are applied later by CSS and script.
- **Filled outlines, not strokes.** All art is filled shapes (strokes
  converted to paths). This is what the processing pipeline and the draw-in
  animation expect.
- **Leave room for the glow.** The glow softens edges: hairlines vanish and
  close parallels merge. Keep gaps of at least one stroke width.
- **Weight hierarchy:** school frame lines thinnest, then ornament, then
  satellites; the essence reads boldest.

## 8. Minimum sizes

Small details vanish under the glow at the size symbols are actually shown.
Measured on the final 50×50 canvas (double these on a 100×100 canvas):

- strokes at least about **2** units thick
- dots at least about **1.75** units in radius
- dashes at least about **3** units long

When something is under these, remove it rather than shrink it further (for
example, five tiny shards became three larger ones; rays around a dot were
dropped).

## 9. Files, sizes and versions

- **Canvas:** start from `raw/helpers/template_symbol_canvas_s100.svg` or
  `__s50.svg`. Art goes in the `symbol_art` layer; the `general_boundaries`
  layer (guide circle and crosshair) is a helper and is not rendered.
- **Sizes:** `_s100` is a 100×100 canvas, `_s50` is 50×50. An `_s50` of an
  essence is a **reduction** of the idea, not a scaled copy: keep the spine
  (the one gesture that carries the idea) and drop secondary echoes and
  accents. Runes use `_s` / `_m` / `_l` instead (see the ornamentation doc).
- **Versions:** raw files carry a version before the size,
  `e_fire_02_s100.svg`, `burst_02_s50.svg`, `flair_rune_a_02_l.svg`.
  `generate_processed_symbols.py` (`make.bat generate-symbols`) uses only the
  **highest version** of each symbol and writes it unversioned
  (`e_fire_s100`). So:
  - to try a new design, add the next version and keep the old one;
  - to roll back, delete the newer version;
  - small fixes (rotation, cleanup) can be made in place on the latest version.

## 10. How to make a new symbol

1. **Read the definition** in `database/sigils/symbols_definitions.json`
   (description, associated and not-associated terms).
2. **Pick the verb** and write one line: "X *does* Y, drawn as Z".
3. **Check siblings**: what nearby symbols already use that shape language?
   (Each category doc lists sibling pairs and current designs.)
4. **Draw 2–3 options**, not one. Most first drafts hit an icon lookalike.
5. **Review them on a contact sheet** next to approved references, at full
   size *and* at the size they appear in a sigil (about 25–30 px for small
   symbols). Check the lookalike list (section 6) and the minimum sizes
   (section 8).
6. **Save as a new version** and rebuild (`make.bat generate-symbols`, then
   `make.bat generate-html`).

### Checklist

- [ ] I can name the **verb** it draws.
- [ ] It isn't an icon of the object, and doesn't resemble any icon in section 6.
- [ ] Told its name, it feels right.
- [ ] It uses echo, gesture or accent, not only a shape.
- [ ] It's distinct from its sibling symbols.
- [ ] Symmetry and orientation follow section 5.
- [ ] Nothing is under the minimum sizes in section 8.
- [ ] It sits comfortably next to the approved reference set.
- [ ] Black filled outlines only, in `symbol_art`, nothing stray.
