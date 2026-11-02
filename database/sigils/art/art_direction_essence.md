# Sigil Art Direction — Essence

Read [`art_direction_general.md`](art_direction_general.md) first. This doc
applies it to essence symbols.

## 1. Role

The essence is **what the spell is made of**: the element, energy or domain at
its core. It is the heart of the sigil:

- It sits at the centre of every school drawing, in the largest slot, drawn at
  `_s100`.
- Secondary essences (`essence_top[1:]`) appear again as `_s50` symbols in
  `ornamentation_l` slots.

Because it is the biggest and most central mark, the essence sets the mood of
the whole sigil. It must be the strongest symbol in the set, and it must still
read when reduced to `_s50`.

## 2. Approved reference set

These nine are approved. Each is described by the **verb** it draws, **how**
it draws it, and **why it isn't literal**.

| Essence | Verb | How it's drawn | Why it works |
|---|---|---|---|
| **Fire** | rises, curls, flickers | A central S-spiral climbing upward, four tapered tendrils flicking outward in rotational balance, scattered spark dots | No flame silhouette anywhere. The *motion* of flame (curl, flick, sparks) is all that's there. |
| **Air** | streams, swirls | Long horizontal currents that end in curled eddies, in several parallel layers | No cloud or breath icon. It is the path wind *takes*. |
| **Water** | flows, swirls around a centre | Stacked wave strokes under a whirl with a dot "eye" | Shares air's current language but heavier and lower, with a still centre. Reads as tide or current, not a droplet. |
| **Metal** | is folded, forged, interlocked | Two nested square links folded into each other, rigid right angles, an inner hook, two studs | No sword or ingot. It is the *workmanship* of metal: folding, joining, rigidity. |
| **Radiance** | emanates in sacred order | Concentric rings crossed by radial spokes, rose-window or mandala-like, dots at the ray ends | No sun with rays. Light given *structure and order*, which is what makes it holy rather than just bright. |
| **Sound** | propagates outward | A solid source dot with arcs echoing out on both sides, getting longer as they go | No speaker, note or ear. It is the *spreading of a vibration*. |
| **Stone** | stacks, rests, balances | A cairn of three ellipses, heavy base, thick-thin strokes | The most literal of the set, but it shows *placed, balanced weight* (a cairn), not "a rock". |
| **Thunder** | shatters outward | Nested hexagonal rings broken at the corners, like a concussion front cracking | No bolt (that's lightning) and no cloud. It is the *shockwave*. |
| **Time** | loops back on itself | Two looping, nested lobes pinched at a single point, like an hourglass turned into a lemniscate or butterfly | No clock or hourglass icon. It is *recurrence*: going around and returning to one point. |

### What the set teaches

- **Organic essences** (fire, air, water, time, sound) use swelling, tapering
  gesture strokes and curls.
- **Structured essences** (metal, radiance, thunder) use even, engraved
  strokes, straight segments and crisp corners.
- **Weighted essences** (stone) use closed, bold forms with a heavy base.
- Almost all of them use **echo** (nested or parallel repeats) and **accent
  dots**.

Choosing which family a new essence belongs to is the first design decision.

## 3. Rejected (redo)

| Essence | File | Why it fails |
|---|---|---|
| **Earth** | `e_earth_01` | Reads as contour lines on a map or a diagram. The linework is shaky and uneven, and the mass is lopsided, not centred. There's no verb. |
| **Cold** | `e_cold_01` | A segmented cross with diamond ends: reads as a religious or heraldic cross or a generic snowflake tile. It says nothing about *cold*. |
| **Magic** | `e_magic_01` | A generic diamond-and-triangles tile. Swap the name with any other essence and it would fit equally well, so it has no idea in it. |

## 4. Placeholders (not yet drawn)

These files exist so the pipeline works, but they are **byte-identical copies
of other essences** and need original art:

| Placeholder | Copy of |
|---|---|
| `light`, `lightning` | `fire` |
| `acid`, `life`, `poison`, `shadow` | `water` |
| `force`, `mind`, `necrosis` | `cold` |
| `plant`, `soul`, `space` | `magic` |

## 5. Sibling pairs (keep them distinct)

Several essences are close in meaning, so their symbols must be clearly
different at a glance:

| Siblings | Distinction |
|---|---|
| Fire / Light / Radiance | Fire = consuming motion. Light = revealing, an opening. Radiance = sacred order. |
| Lightning / Thunder | Lightning = a single sudden, branching *path*. Thunder = the *pressure wave* around it. |
| Thunder / Sound | Thunder = broken, violent, angular. Sound = clean, rhythmic, curved. |
| Air / Water | Air = light, high, open currents. Water = heavy, low, with a centre. |
| Earth / Stone / Metal | Earth = continuous, granular, settling. Stone = discrete, stacked, balanced. Metal = worked, folded, joined. |
| Acid / Poison / Necrosis | Acid = eats from the outside in. Poison = spreads from the inside out. Necrosis = fades, unravels, ends. |
| Life / Plant | Life = pulse, closing, restoring. Plant = growing outward, branching, reaching. |
| Mind / Soul | Mind = connections and loops of thought. Soul = a self and its displaced echo, separating from the body. |
| Space / Time | Space = folding distance so two points meet. Time = looping back to the same point. |
| Light / Shadow | Shadow is defined by absence: strokes interrupted by something unseen. |
| Force / Magic | Force = invisible pressure bending lines. Magic = a mark that refers to itself. |

## 6. Briefs for essences still to draw

These are **starting proposals**, not final decisions. Each gives a verb, a
direction, and the literal trap to avoid.

| Essence | Verb | Direction | Avoid |
|---|---|---|---|
| **Earth** | settles, compacts, holds | Wide, low, horizontal strokes that sag toward a heavy base, with grain dots between the layers. Continuous and granular, not stacked. | Contour or map lines, hills, mountains |
| **Cold** | slows, contracts, locks in place | Strokes that start fluid and end in sharp needle points; branching only at fixed angles (crystal growth); weight drawn inward, the opposite of fire's outward flick. | Snowflakes, crosses, icicles |
| **Magic** | refers to itself | One continuous line that knots or folds back into itself, or a mark annotating another mark. Glyph-of-a-glyph. | Generic diamond or star tiles, sparkles |
| **Light** | opens, reveals | An aperture: strokes parting around an empty centre, rays formed by the *gaps* (negative space) rather than drawn lines. | Sun with rays, light bulb, star burst |
| **Lightning** | jumps, forks | A single stroke that changes direction abruptly, with hairline branches that end in discharge dots. | The zig-zag bolt icon |
| **Acid** | dissolves, eats away | A solid, clean form whose outline breaks down on one side into fragments and dots. | Drips, droplets, bubbling flasks |
| **Poison** | seeps, spreads inside | Vein-like tendrils branching through or coiling inside another shape, slowly taking it over. | Skull, drop, bottle, snake |
| **Force** | pushes, presses | Parallel lines bending around an empty, unseen shape, so the force is implied by deformation. | Fists, arrows, impact stars |
| **Necrosis** | withers, unravels | Strokes that begin full and end broken, or a spiral that unwinds and fragments toward the edge. | Skulls, bones, wilted flowers |
| **Life** | pulses, restores, closes | Two halves stitching together, or a rhythmic beat repeated in echo; a seed-like form opening. | Hearts, crosses, ECG line |
| **Plant** | grows, branches, reaches | An unfurling spiral (like a fern's fiddlehead) or a phyllotaxis pattern of dots. Growth along a curve. | Leaves, trees, flowers |
| **Mind** | connects, thinks in loops | Interwoven open spirals with nodes where they cross, so thought is shown as a network. | Brains, eyes |
| **Soul** | separates from itself | A rising vertical form with its echo drawn slightly displaced, the self and its double. | Ghosts, wisps, flame shapes (too close to fire) |
| **Space** | folds, collapses distance | Two points joined by a folded line, or nested shapes receding in perspective. | Portal rings, stars, galaxies |
| **Shadow** | conceals, takes away | Strokes cut off by an invisible shape, or the only symbol where a solid mass is the main form, defined by what's missing. | Crescent moons, clouds, plain black blobs |

## 7. Essence-specific rules

- **The essence is the boldest symbol in the sigil.** It is the largest slot,
  so give it the heaviest stroke weight of any symbol.
- **It must read on any school.** It sits at the centre of triangles, squares,
  circles and stars, so avoid a silhouette that only fits one frame (for
  example a strongly triangular essence fights a square school).
- **The `_s50` keeps the spine.** Secondary essences show up small in
  ornament slots next to intent symbols, so the reduction must still read as
  that essence. See the general doc, section 7.
