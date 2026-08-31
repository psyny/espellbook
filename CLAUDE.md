# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

espellbook generates a single self-contained `spellbook.html` file: a D&D spell reference/tracker with procedurally-composed SVG "sigils" for each spell, driven off deterministic pseudo-random factors so the same spell always renders the same sigil. Everything (data, CSS, JS) is inlined into that one HTML file at generation time; there is no server and no build step beyond running the Python generators.

## Commands

```sh
make install              # create venv/ and install requirements.txt
make generate-catalog     # generate_spell_catalog.py: raw spell markdown -> database/spells/processed/spells.json (stable IDs from 1000000)
make generate-html        # generate_html.py: processed catalog -> spellbook.html
make generate-all         # catalog then html (the usual full pipeline)
make generate-symbols     # generate_processed_symbols.py: raw sigil SVGs -> database/sigils/art/processed/*.svg + metadata JSON
make generate-check-symbols  # generate_check_symbols.py: renders topology-slot overlays for reviewing sigil art
make clean / clean-kernel / clean-all   # remove pyc/caches / venv / both
```

All scripts are run via `venv/bin/python`, invoked as `python3 <script>.py` from the repo root (each script resolves paths relative to its own location).

There is no test suite and no linter configured.

`lib/` and `generate_*.py` use only the standard library. `numpy`, `sentence-transformers`, and `torch` (see `requirements.txt`) are used solely by `lib/sigil_params.py` for embedding-based sigil color scoring during catalog generation — not needed to just run `generate_html.py` on an already-processed catalog.

## Architecture

**Two-stage generation pipeline**, each stage reads/writes `database/`:

1. `generate_spell_catalog.py` (`lib/catalog.py`) parses spell markdown/CSV under `database/spells/` and `lib/sigil_params.py` computes each spell's deterministic sigil styling (colors, five `rand_factor_*` seeds — see `code_map/spell_rand_factors.md`) using sentence-transformer embeddings scored against `database/sigils/symbols_definitions.json`. Output: `database/spells/processed/spells.json`, keyed by stable IDs that persist across regenerations via `database/spells/processed/id_counter.json`.
2. `generate_html.py` loads the processed catalog, `database/rules/`, `database/classes/`, and the sigil symbol library (`lib/sigils.py`, scanning `database/sigils/art/processed/`), then stamps them as JSON/HTML into `template/default/{index.html,style.css,script.js}` via `lib/html.py::replace_placeholders` (placeholders look like `{{ KEY }}` / `/* {{ KEY }} */`) to produce the standalone `spellbook.html`.

**Sigil art has its own sub-pipeline**, independent of spell generation: `generate_processed_symbols.py` converts hand-authored raw SVGs (`database/sigils/art/raw/`) into cleaned per-symbol SVGs plus topology metadata (`database/sigils/art/processed/`), which `generate_check_symbols.py` can render back out with slot overlays for visual QA (`database/sigils/art/checks/`). See `database/sigils/composition_def.md` for the composition model and `code_map/html_sigil_gen.md` for how the processed symbols become client-side `<svg>` markup.

**Client-side runtime** (`template/default/script.js`, inlined into the generated HTML) owns character state (classes, attributes, prepared spells, slots), spell filtering/search, and sigil composition (`buildSigilSvg()` and friends) purely from the JSON baked into the page at generation time — it does not fetch anything. Character data is not baked in; users load/save their character JSON through the page's UI (see `chars/*/char.json` for the format).

## Testing

Do not auto-launch a browser (headless or otherwise) to verify UI changes to `spellbook.html` — just regenerate it and reason about the diff/code. If visual verification is needed, ask the user to open the file themselves.

## Deep-dive notes

`code_map/` holds notes on non-obvious algorithms and where each system lives — not a restatement of the directory structure. Read `code_map/README.md` first, then the relevant note, before touching sigil generation/composition or the rand-factor system. **Update the relevant `code_map/*.md` whenever you change the logic it documents.**

## Git commits

- Never add a `Co-Authored-By: Claude` (or similar) trailer, or any other Claude/Anthropic watermark, to commit messages.
- Keep commit messages brief and high-level: a short summary line, no blow-by-blow file lists or restated diffs.
