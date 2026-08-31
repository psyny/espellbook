#!/usr/bin/env python3
"""Generate a self-contained HTML spellbook from the database spells."""

import json
from pathlib import Path

from lib.catalog import load_processed_spells
from lib.data import load_database_classes, load_database_rules, load_templates
from lib.html import replace_placeholders
from lib.sigils import build_sigil_library, load_viewbox_per_level


ROOT_DIR = Path(__file__).parent.resolve()
DEFAULT_CHARACTER = {
    "name": "",
    "classes": {},
    "stats": {"hp": 1},
    "attributes": {
        "strength": 10,
        "dexterity": 10,
        "constitution": 10,
        "intelligence": 10,
        "wisdom": 10,
        "charisma": 10,
    },
    "skill_proficiencies": [],
    "custom_mods": {
        "spell_dc_mod": 0,
        "spell_attack_mod": 0,
        "slots": {str(i): 0 for i in range(10)},
        "prepared": {str(i): 0 for i in range(10)},
        "skills": {},
    },
}


def generate_spellbook_html(root_dir):
    index_html, css, js = load_templates(root_dir)
    spells = load_processed_spells(root_dir)
    if not spells:
        raise RuntimeError("No spells found in database/spells.")

    rules = load_database_rules(root_dir)
    classes = load_database_classes(root_dir)
    sigil_library = build_sigil_library(root_dir)
    sigil_viewbox_per_level = load_viewbox_per_level(root_dir)

    data = {
        "CHARACTER_JSON": json.dumps(DEFAULT_CHARACTER, ensure_ascii=False),
        "INITIAL_PREPARED_JSON": json.dumps([], ensure_ascii=False),
        "RULES_JSON": json.dumps(rules, ensure_ascii=False),
        "CLASSES_JSON": json.dumps(classes, ensure_ascii=False),
        "CSS": css,
        "SPELLS_JSON": json.dumps(spells, ensure_ascii=False),
        "JS": js,
        "SIGIL_DEFS": sigil_library["defs_html"],
        "SIGIL_ASSETS_JSON": json.dumps(sigil_library["assets"], ensure_ascii=False),
        "SIGIL_FALLBACKS_JSON": json.dumps(sigil_library["fallbacks"], ensure_ascii=False),
        "SIGIL_SCHOOLS_JSON": json.dumps(sigil_library["schools"], ensure_ascii=False),
        "SIGIL_DEFAULT_SCHOOL_JSON": json.dumps(sigil_library["default_school"], ensure_ascii=False),
        "SIGIL_VIEWBOX_PER_LEVEL_JSON": json.dumps(sigil_viewbox_per_level, ensure_ascii=False),
        "SIGIL_ENTITY_MAPS_JSON": json.dumps(sigil_library["entity_maps"], ensure_ascii=False),
    }
    return replace_placeholders(index_html, data)


def main():
    html = generate_spellbook_html(ROOT_DIR)
    output_path = ROOT_DIR / "spellbook.html"
    output_path.write_text(html, encoding="utf-8")
    print(f"Generated {output_path}")


if __name__ == "__main__":
    main()
