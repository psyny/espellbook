# Project Notes

## Generating the spellbook

The pipeline has two steps:

1. Parse raw spell markdown and build the processed catalog:

   ```bash
   python3 generate_spell_catalog.py
   ```

   This writes `database/spells/processed/spells.json` (plus an `id_counter.json`) with stable spell IDs starting at `1000000`.

2. Generate the self-contained HTML from the processed catalog:

   ```bash
   python3 generate_html.py
   ```

   This produces a generic `spellbook.html` in the project root. Character-specific data is not baked into the HTML; users load and save their character state via the HTML UI.
