# Sigil Art Direction — Schools

Read [`art_direction_general.md`](art_direction_general.md) first. School
drawings are the one category that does **not** follow the "suggest, don't
depict" rule. They are the architecture the symbols are written on.

## 1. Role

The school drawing decides two things:

1. **The silhouette of the whole sigil.** This is the first thing anyone reads,
   from across a page and before any symbol. Each school must be recognisable
   from its outline alone.
2. **The distribution of symbols.** The `symbols_layout` layer places every
   slot (essence, intent, reach, flow, ornamentation l/m/s) and its rotation.
   The school controls the reading order and rhythm of the sigil.

It also carries **complexity**: the higher the spell level, the more elaborate
the drawing. See section 4.

## 2. Visual language

- **Ruled geometry:** compass-and-straightedge figures, such as triangles,
  squares, polygons, stars and concentric circles.
- **Thin, even lines,** clearly lighter than the symbols they hold. The frame
  supports the symbols and must never overpower them.
- **Symmetry is expected,** usually matching the shape's own symmetry
  (3-fold, 4-fold, 6-fold, radial).
- **Literal shapes are fine here.** A triangle can simply be a triangle. The
  meaning comes from which shape is chosen and how it holds the symbols.
- **Only sacred geometry,** nothing figurative: no creatures, eyes, skulls or
  hands.

## 3. The eight schools

Each school is built on a different base figure. The meaning column is the
current reading of why each shape fits. It is a guide for future tiers, not a
fixed canon.

| School | Base figure | Reading |
|---|---|---|
| **Abjuration** | Inverted triangle (point down), over a faint hexagram | A ward or shield planted into the ground, guarding and grounding. |
| **Divination** | Upright triangle, subdivided into corner cells | Ascending insight; the pyramid or eye-of-providence shape without the eye. |
| **Conjuration** | Concave 4-point star → 8-point star at higher levels | Gates at the compass points; things called in from every direction. |
| **Enchantment** | Square with inner frame | Enclosure and binding; the mind held inside a frame. |
| **Illusion** | Diamond (square turned 45°), nested diamonds | A familiar shape seen from another angle, which is deception by rotation. |
| **Evocation** | Circle with outer rings and a dashed inner ring | Energy released and radiating outward. |
| **Necromancy** | Hexagram (two interlocked triangles) | Two opposed states locked together: life and death, the boundary between them. |
| **Transmutation** | Concentric circles | Cycles, change, one state becoming another. |

**Open issue:** Evocation and Transmutation are both circle-based and look very
similar at small sizes. One of them should get a more distinct silhouette, for
example Transmutation built from offset or overlapping circles (one form
becoming another) rather than concentric ones.

## 4. Complexity by level

Higher-level spells must *look* more complex. The drawn tiers follow a
consistent progression:

| Tier | Frame | Symbols |
|---|---|---|
| **Level 0** | Single outline of the base figure | Core slots (essence, intent, reach, flow) plus a few `ornamentation_m` / `_l` |
| **Level 1** | Doubled outline; the figure gains parallel frame lines or a second layer (conjuration's star grows points) | More `ornamentation_m`; first `ornamentation_s` |
| **Level 2** | Adds an outer band lined with a "bead" border of small ornaments | Large ring of `ornamentation_s` (36–72), the spell name repeated as runes |

Rules for the progression:

- **The silhouette stays recognisable.** Level 2 Abjuration is still clearly
  an inverted triangle. Complexity is added *around and inside* the base
  figure; it never replaces it.
- **The core never moves.** The essence stays at the centre at the same size
  across levels, so the eye always finds the heart in the same place.
- **Complexity is built from echo.** Echo, the same principle as in the
  symbols: doubled lines, added rings, repeated bands. Don't add unrelated new
  shapes.
- **Small ornaments carry the name.** `ornamentation_s` and `_m` spell the spell
  name in runes, so higher levels literally have more writing.

**Missing tiers:** spells go from level 0 to 9, but only school levels 0–2
are drawn. Levels 3–9 currently reuse the nearest drawn tier (level 2) via
`resolveTopology()` in `template/default/script.js`. Future tiers should
continue the same progression: more outer bands, a second ring of
`ornamentation_m`, the base figure echoed at a larger scale, until level 9
reads as the most elaborate drawing in the book.

## 5. Symbol distribution

Current layout conventions across all schools:

| Slot | Where | Size |
|---|---|---|
| `essence` | Dead centre (500, 500), always exactly one | Largest (`_s100`) |
| `intent` | Directly above the essence (12 o'clock) | `_s50` |
| `reach`, `flow` | Flanking the essence: lower-left/lower-right or left/right, depending on the figure | `_s50` |
| `ornamentation_l` | Around the core, filling the figure's remaining vertices or cells | `_s50` |
| `ornamentation_m` | Mid ring, on the frame lines or in corner cells | smaller |
| `ornamentation_s` | Outer bead border along the frame | smallest |

Guidelines:

- **Reading order runs from the centre outward:** essence → intent →
  reach/flow → ornament. Size and distance from the centre must agree with
  that order.
- **Follow the figure's symmetry.** Slots sit on vertices, edge midpoints or
  cell centres of the base figure, not floating freely.
- **Keep breathing room** between slots and frame lines so the glow doesn't
  merge them.
- **Rotation:** slots may carry a rotation that orients symbols along the
  frame. Slots flagged as variable rotation (`_r_` in the layer label) may be
  reset to upright per spell (see `code_map/html_sigil_gen.md`). Symbols are
  authored **north-aligned** (see the general doc, section 5), so a slot's
  rotation is the direction the symbol's "up" will face: point it outward,
  along the frame, or upright, deliberately.

**Open issue:** Abjuration and Divination have **no `ornamentation_l` slots**,
so secondary essences and intents (`essence_top[1:]`, `intent_top[1:]`) are
never drawn for those schools. Decide whether that's intended or whether they
need `_l` slots.

## 6. Authoring notes

- Canvas is `viewBox="0 0 1000 1000"`. The figure sits at the centre, using
  roughly the middle third at level 0 and growing outward with level. Use
  `raw/helpers/template_symbol_school.svg` as the starting point.
- Layers: `sigil_art` (the drawing, which is what gets rendered),
  `symbols_layout` (slot markers, processed into topology), and helper layers.
- Slot markers are colour-coded in the source for authoring only: grey =
  essence, red = intent, blue = reach, green = flow, yellow = ornamentation.
- File names: `<school>_level_<n>.svg`. New tiers continue the numbering.
