# Sigil Art Direction — Satellites (Intent, Flow, Reach)

Read [`art_direction_general.md`](art_direction_general.md) first. This doc
covers the three satellite categories that sit around the essence. Their
meanings come from `database/sigils/symbols_definitions.json`.

## 1. Role and constraints

| Category | Answers | Slot |
|---|---|---|
| **Intent** | What is the spell for? | Directly above the essence; the first intent slot is the most prominent satellite |
| **Flow** | How does the effect spread? | Beside the essence |
| **Reach** | How far does it go? | Beside the essence |

They are small, so they follow stricter rules than essences:

- **Mirror-symmetric about the vertical axis.** Asymmetry is reserved for
  essences.
- **North-aligned.** The symbol reads upright, and any direction it implies
  (travel, spread, distance) points **up**. Slots rotate symbols to follow the
  school layout, so this keeps them coherent once composed.
- **`_s50` only** (50×50 canvas). If an `_s100` is ever added, the first
  intent slot will prefer it.
- **Bold and simple:** one gesture plus at most one supporting element (an
  echo, a source dot, a cap). Respect the minimum sizes in the general doc;
  remove details rather than shrinking them.
- **Still suggestive.** Flow and reach describe geometry, so they may be more
  diagrammatic than essences, but they must not become arrows or UI icons.

## 2. Intent (current set)

| Intent | Version | Idea | Drawn as |
|---|---|---|---|
| **Burst** | 02 | harm: edges driven into one point | Two blades meeting level at the centre, three shards flying up where they meet |
| **Protection** | 01 | layered defence | A kept point inside a ring, covered by three heavy outer arcs |
| **Creation** | 02 | something new emerges | A seed split open (two mirrored halves), a large point rising out of it |
| **Transformation** | 02 | this becomes that | A diamond below turns into a circle above, joined by one stroke |
| **Movement** | 02 | relocation | A hollow dashed ring below (where it was), a solid dot above (where it is), two curved paths around |
| **Knowledge** | 01 | insight held within | A point inside an open triangle, with an arc over the opening |
| **Influence** | 02 | one will steering another | A point above reaching down both sides and curling in around a point below |

## 3. Flow (current set)

| Flow | Version | Idea | Drawn as |
|---|---|---|---|
| **Point** | 01 | no spread; one place | A dot pinned by four short strokes that stop before touching it |
| **Projectile** | 02 | travels, then lands | Origin dot at the bottom, one trail dash, a shard in flight, a target ring at the top |
| **Line** | 02 | a straight narrow path | A vertical stroke rising from an origin dot, an echo line on each side |
| **Cone** | 02 | widening from an origin | Three strokes fanning upward from a bottom origin, closed by a far arc |
| **Burst** | 02 | outward in every direction | Long and short strokes radiating from a centre, a long one pointing straight up |
| **Wall** | 02 | a continuous barrier | A lying barrier with one echo below and three dots held back above |
| **Aura** | 02 | surrounds and radiates | A source in a ring, with a halo of eight short arcs around it |
| **Chain** | 02 | hops target to target | One point hops to two targets, each of which hops again, getting smaller |

## 4. Reach (current set: version 03)

Reach is a **family**: the five symbols share one structure, and only the
count changes. Readers should see "more of the same thing" as "farther".

- A **source dot** at the bottom.
- Above it, **one row per step of range**, each row wider than the one below.
- A **cap** above the last row marks the limit.
- **Unlimited** has no cap; its rows continue and the last one breaks into
  points.

| Reach | Rows | Cap |
|---|---|---|
| Touch | 0 | right on the source |
| Close | 1 | yes |
| Medium | 2 | yes |
| Far | 3 | yes |
| Unlimited | 4 | none; dissolves into points |

Two shape variants of this concept exist:

- **Version 02:** rows are pairs of horizontal dashes with a gap in the middle;
  the cap is a gentle dome.
- **Version 03 (current):** rows are chevrons, open at their peak; the cap is a
  solid chevron. Watch that touch and close don't read as an "up" arrow.

What made reach work: **abstract, symmetric, and counted**. Avoid an arc
travelling from source to target (too on-the-nose) and concentric arcs around
a dot (Wi-Fi).

## 5. Lessons from rejected drafts

| Symbol | Rejected | Why |
|---|---|---|
| Reach | Arcs fanning from a corner dot; an arc from source to a bar with ticks | Wi-Fi icon; too direct |
| Intent protection (draft) | Canopy arcs over a dot | Wi-Fi icon |
| Intent burst | Ring with a slash | "Empty set" sign |
| Intent creation | Dot over a U; swelling spiral | Smiley face; asymmetric (spirals can't be mirror-symmetric) |
| Intent transformation | Half-square, half-circle loop | Letter D |
| Intent influence | Lead and follower wavy lines; threads converging to a dot | Steam/smell icon; parachute |
| Flow point (draft) | Three wedges around a dot | Radiation sign |
| Flow aura | Rays around a ring; wavy ring; three concentric rings | Sun; cog; target |
| Flow projectile | Heavy stroke over a dot | Exclamation mark |
| Flow chain | Row of linked bumps | Caterpillar |

## 6. Sibling clashes to watch

- **Intent movement / flow projectile / flow line:** all vertical with a dot
  at one end. Movement has *two* states (hollow and solid); projectile has a
  *target*; line has *parallel echoes*.
- **Flow burst / flow aura / intent protection:** all radial. Burst radiates
  *strokes*, aura wraps a *halo of arcs*, protection uses *three heavy
  guarding arcs*.
- **Flow point / intent knowledge:** both "a held point"; point uses
  converging strokes, knowledge uses a triangle.
