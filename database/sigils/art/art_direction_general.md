# Sigil Art Direction — General

This is the art direction for every piece of sigil art. It says what the art
should look like and why. For the mechanics of placing art on the canvas
(which file goes in which slot), see [`../composition_def.md`](../composition_def.md).

Category-specific direction:

- [`art_direction_schools.md`](art_direction_schools.md): school drawings (frame, layout, complexity by level)
- [`art_direction_essence.md`](art_direction_essence.md): essence symbols

## 1. What a sigil is

A sigil is a spell written down. Each part of the casting gets its own
symbol, and the school arranges them into one figure:

| Part | Role in the figure | Answers |
|---|---|---|
| **School** | The frame: overall silhouette, and where every other symbol sits | *What kind of magic is this?* |
| **Essence** | The heart, the largest symbol, at the centre | *What is it made of?* |
| **Intent** | Main satellite, usually at the top | *What is it for?* |
| **Reach** | Satellite | *How far does it go?* |
| **Flow** | Satellite | *How does it spread?* |
| **Ornamentation** (l / m / s) | Secondary essences/intents, spell-name runes, geometric beads | *Whose spell is this, and how elaborate is it?* |

A reader should get a feeling for the spell before decoding any single
symbol. The school's shape is read first, then the essence at the centre,
then the satellites, then the ornament.

## 2. Two visual languages

The sigil deliberately mixes two kinds of drawing:

1. **Architecture: the school drawings.** Ruled, compass-and-straightedge
   geometry with even, thin lines. It can be literal and symmetric: triangles,
   squares, stars, rings. Its job is structure and legibility. It is the
   "paper" the spell is written on.
2. **Handwriting: every symbol** (essence, intent, reach, flow). Expressive,
   suggestive and not literal. Its job is meaning and feeling.

Keep the two apart. A symbol should not look like a frame (a plain polygon
tile), and a frame should not try to be expressive.

## 3. The core rule for symbols: suggest, don't depict

> A symbol draws **how a thing behaves**, not **what it looks like**.

A flame icon is cheap: anyone reads it instantly, and then there is nothing
left to read. A good sigil symbol carries the *movement, rhythm and weight*
of its subject, so it is recognised on the second look rather than the first.

Use this two-part test on every symbol:

- **Too literal:** you can name the object at a glance without being told
  (a flame, a snowflake, a drop, a skull, a lightning bolt, an arrow, an eye).
- **Too abstract:** after being told the name, you still can't *feel* it in
  the strokes (a generic diamond tile, a decorative cross).

The target sits between the two. Told "this is fire", the viewer should think
*"…yes, of course"*.

### Reference: approved symbols

These essence symbols are the reference set. Every new symbol, in any
category, should feel like it belongs next to them:

`e_fire_01`, `e_air_01`, `e_metal_01`, `e_radiance_01`, `e_sound_01`,
`e_stone_01`, `e_thunder_01`, `e_time_01`, `e_water_01`
(all in `raw/essence/`). Each one is broken down in
[`art_direction_essence.md`](art_direction_essence.md).

## 4. Pattern shared by the good symbols

Across the approved set, these traits keep recurring. Treat them as the house
style.

1. **A verb, not a noun.** Fire *rises and curls*. Sound *spreads outward*.
   Thunder *shatters outward*. Stone *stacks and balances*. Time *loops back*.
   Metal *folds and interlocks*. Pick the verb first, then draw it.
2. **Echo and repetition.** Nearly every good symbol repeats a line in
   nested or parallel copies: the arcs of sound, the hexagons of thunder, the
   loops of time, the waves of water and air, the rings of radiance, the
   nested folds of metal. Repetition gives rhythm and "vibration", and it
   reads as magic rather than illustration.
3. **Gesture strokes.** The organic symbols (fire, air, water, time, sound)
   use calligraphic strokes that swell and taper, like a single confident
   brush movement. The structured symbols (metal, radiance, thunder) use even,
   engraved strokes with crisp corners. Both are fine; pick the one that suits
   the subject and stay consistent within a symbol.
4. **Accent dots.** Small solid dots act as punctuation: sparks around fire,
   the eye in the water's whirl, the source of sound, the ends of radiance's
   rays, the two studs on metal. Use one to five, deliberately placed. They
   give the eye a resting point.
5. **Open line art, mostly unfilled.** Forms are built from strokes with
   plenty of negative space. Solid fills are reserved for small accents.
6. **Centred and balanced, but not mechanically symmetric.** The symbol fills
   most of the guide circle (about 80–95%), with its visual weight on the
   centre. It often has rotational or mirror balance with deliberate
   irregularities (fire's off-axis tendrils, metal's offset links).
7. **One idea per symbol.** Each symbol has a single dominant gesture. Detail
   supports it and never competes with it.

## 5. Common failures (what to avoid)

Taken from the rejected essences (`earth`, `cold`, `magic`) and from generic
icon habits:

- **Icon shortcuts:** flame shapes, droplets, snowflakes, skulls, hearts,
  leaves, bolts, arrows, eyes, crescent moons, stars.
- **Generic geometric tiles:** a diamond or cross made of segments that could
  stand for any essence (`magic`, `cold`). If you could swap its name with
  another essence and nobody would notice, it has no idea in it.
- **Religious or heraldic readings:** crosses and coats-of-arms shapes carry
  meanings we don't want (`cold` reads as a cross).
- **Shaky or uneven linework:** wobbly lines, inconsistent weights, a
  lopsided mass that doesn't sit centred (`earth`).
- **Map or diagram readings:** contour lines, charts, schematics (`earth`
  reads as a topographic map).
- **Too much small detail:** anything that disappears or turns to mud at
  `_s50`.

## 6. Line and colour

- **Source art is black on transparent.** Never bake colour into a symbol.
  Spell colour (`sigil_params.style.color_1/2/3`), glow and draw-in animation
  are applied later by CSS and script.
- **Strokes need to survive the glow.** The glow softens edges, so hairlines
  vanish and crowded parallels merge. Leave clear gaps between echo lines,
  roughly at least one stroke width.
- **Weight hierarchy:** school frame lines are thin; symbol strokes are
  clearly heavier. The essence (largest) reads boldest, and ornaments are
  lightest.

## 7. Sizes (`_s100`, `_s50`)

The size suffix is the canvas box, but in practice `_s50` is a **reduction**
of the design, not just a scaled copy. Compare `e_fire_01_s100` (full spiral
with four tendrils and sparks) with `e_fire_01_s50` (only the central S-spiral).

- `_s100` is the full statement of the idea.
- `_s50` keeps the **spine**, the one gesture that carries the idea, and
  drops secondary echoes and accents so it still reads small.
- Both sizes must be recognisably the same symbol.

## 8. Authoring checklist

Start from `raw/helpers/template_symbol_canvas_s100.svg` (or `__s50`). Keep the
art in the `symbol_art` layer; the guide circle/crosshair layers are helpers
and are not rendered.

Before calling a symbol done:

- [ ] I can name the **verb** it draws.
- [ ] It is not an icon of the object (literal test).
- [ ] Told its name, it feels right (abstract test).
- [ ] It uses echo/repetition, gesture or accent dots, not just a shape.
- [ ] It is clearly different from its sibling symbols (see the essence doc's
      "sibling pairs").
- [ ] It sits centred, fills the guide circle, and is balanced.
- [ ] It sits comfortably next to the approved reference set.
- [ ] The `_s50` reduction still reads, and gaps survive the glow.
- [ ] No colour baked in, and no stray helper geometry in `symbol_art`.

## 9. Status by category (as of 2026-11-02)

| Category | Folder | State |
|---|---|---|
| School | `raw/schools/` | 8 schools × levels 0–2 drawn. See schools doc. |
| Essence | `raw/essence/` | 9 approved. `earth`, `cold`, `magic` rejected. 12 are placeholder copies of other art (see essence doc). |
| Intent | `raw/intent/` | Only `burst`. Not yet reviewed against this direction. |
| Flow | `raw/flow/` | Only `projectile`. Not yet reviewed; note it is close to a literal arrow. |
| Reach | `raw/reach/` | Only `close`. Not yet reviewed. |
| Ornamentation: runes | `raw/ornamentation/runes/` | a–z, runic letterforms. They are letters, so they are exempt from the "suggest" rule. |
| Ornamentation: geo | `raw/ornamentation/geo/` | Two diamonds. Plain geometry is fine here; these are beads, not symbols. |
| Helpers | `raw/helpers/` | Authoring templates, not art. |

Intent, flow and reach need their own direction docs once their first
approved examples exist. Until then, sections 3–8 apply to them unchanged.
