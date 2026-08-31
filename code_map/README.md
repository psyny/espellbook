# code_map

Notes on how the non-obvious parts of this codebase actually work, and where each system lives.

**What belongs here:** algorithms, invariants, deterministic-random schemes, "why it's built this way" — the kind of thing that takes reading several files to piece together. Also: which file/module owns which system, so that's discoverable without a search.

**What does not belong here:** directory listings, file trees, or anything a `find`/`grep` reconstructs in seconds. If a note is just restating the folder structure, it's stale by design and not worth maintaining — delete it instead.

**Keeping this current:** when you change logic that a note describes, update that note in the same change. A wrong note is worse than no note.

## Index

- [html_sigil_gen.md](html_sigil_gen.md) — server-side sigil `<symbol>` library generation and client-side sigil composition (`buildSigilSvg()`).
- [spell_rand_factors.md](spell_rand_factors.md) — the five deterministic `rand_factor_*` seeds per spell: how they're derived and where each one is consumed.
