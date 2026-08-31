import csv
import io
import json
import re
from pathlib import Path

from .markdown import markdown_to_html


def parse_spells(text):
    sections = re.split(r"\n#### ", text)
    spells = []
    for section in sections[1:]:
        spell = parse_spell(section)
        if spell:
            spells.append(spell)
    return spells


def _parse_level_school(level_school):
    """Return (level, school) from strings like 'Level 1 Abjuration' or 'Evocation Cantrip'."""
    level_match = re.search(r"level\s+(\d+)", level_school, re.IGNORECASE)
    if level_match:
        level = int(level_match.group(1))
    else:
        level = 0  # cantrip or unspecified

    school = re.sub(r"level\s+\d+", "", level_school, flags=re.IGNORECASE).strip()
    school = re.sub(r"\bcantrip\b", "", school, flags=re.IGNORECASE).strip()
    if not school:
        school = "Unknown"
    school = school.capitalize()
    return level, school


def _parse_classes(text):
    """Return a lowercase list of classes from a comma-separated string."""
    if not text:
        return ["all"]
    classes = [c.strip().lower() for c in text.split(",") if c.strip()]
    return classes if classes else ["all"]


def _parse_csv_classes(*texts):
    """Extract base class names from CSV class lists like 'Wizard (PHB\'24)'.

    Accepts multiple column values so regular and optional/variant class lists
    can be merged.
    """
    classes = set()
    for text in texts:
        if not text:
            continue
        for entry in text.split(","):
            entry = entry.strip()
            if not entry:
                continue
            # Drop parenthetical source annotations and keep the base class name.
            base = re.sub(r"\s*\([^)]*\)", "", entry).strip()
            if base:
                classes.add(base.lower())
    return sorted(classes) if classes else ["all"]


def _parse_csv_level(level_str):
    """Convert CSV level strings like '1st' or 'Cantrip' to an integer."""
    if not level_str:
        return 0
    level_str = level_str.strip().lower()
    if "cantrip" in level_str:
        return 0
    match = re.search(r"\d+", level_str)
    return int(match.group(0)) if match else 0


def _parse_csv_school(school_str):
    """Return (school, ritual) from CSV school strings like 'Abjuration (ritual)'."""
    if not school_str:
        return "Unknown", False
    ritual = re.search(r"\(ritual\)", school_str, re.IGNORECASE) is not None
    school = re.sub(r"\s*\(?ritual\)?", "", school_str, flags=re.IGNORECASE).strip()
    school = school.capitalize() if school else "Unknown"
    return school, ritual


def _csv_description(text, at_higher_levels):
    """Build an HTML description from CSV text and at-higher-levels columns."""
    parts = [text.strip()] if text else []
    if at_higher_levels and at_higher_levels.strip():
        parts.append(f"***{at_higher_levels.strip()}***")
    return markdown_to_html("\n\n".join(parts)) if parts else ""


def _default_sigil_params(school):
    return {
        "school": school,
        "essence": {},
        "intent": {},
        "reach": "",
        "flow": {},
        "essence_top": [],
        "intent_top": [],
        "ornamentation": {},
        "style": {
            "vector_noise": 0.0,
            "angle_noise": 0.0,
            "position_noise": 0.0,
            "color_1": "",
            "color_2": "",
            "color_3": "",
            "rand_factor_1": 0.0,
            "rand_factor_2": 0.0,
            "rand_factor_3": 0.0,
            "rand_factor_4": 0.0,
            "rand_factor_5": 0.0,
        },
    }


def parse_spell(section):
    lines = section.splitlines()
    if not lines:
        return None

    name = lines[0].strip()
    raw_level_school = lines[1].strip().strip("*") if len(lines) > 1 else ""
    ritual = re.search(r"\(ritual\)", raw_level_school, re.IGNORECASE) is not None
    level_school = re.sub(r"\s*\(?ritual\)?", "", raw_level_school, flags=re.IGNORECASE).strip()
    level, school = _parse_level_school(level_school)

    meta = {}
    desc_start = None
    for i, line in enumerate(lines[2:], start=2):
        stripped = line.strip()
        if stripped == "---":
            desc_start = i + 1
            break
        match = re.match(r"- \*\*(.+?):\*\*\s*(.*)", line)
        if match:
            meta[match.group(1)] = match.group(2).strip()

    if not ritual and re.search(r"\britual\b", meta.get("Casting Time", ""), re.IGNORECASE):
        ritual = True

    description = ""
    classes = ""
    if desc_start:
        desc_lines = lines[desc_start:]
        class_idx = None
        for i, line in enumerate(desc_lines):
            if line.startswith("**Classes:**"):
                classes = line[len("**Classes:**"):].strip()
                class_idx = i
                break
        if class_idx is not None:
            desc_lines = desc_lines[:class_idx] + desc_lines[class_idx + 1:]
        while desc_lines and not desc_lines[-1].strip():
            desc_lines.pop()
        description = markdown_to_html("\n".join(desc_lines))

    return {
        "name": name,
        "level": level,
        "school": school,
        "casting_time": meta.get("Casting Time", ""),
        "range": meta.get("Range", ""),
        "components": meta.get("Components", ""),
        "duration": meta.get("Duration", ""),
        "description": description,
        "classes": _parse_classes(classes),
        "ritual": ritual,
        "sigil_params": _default_sigil_params(school),
        "source": "",
        "book_source": "Unknown",
        "book_page": "",
    }


def parse_csv_spells(text):
    """Parse spells from a spells.csv file."""
    reader = csv.DictReader(io.StringIO(text))
    spells = []
    for row in reader:
        name = (row.get("Name") or "").strip()
        if not name:
            continue
        level = _parse_csv_level(row.get("Level", ""))
        school_str = row.get("School", "")
        school, ritual = _parse_csv_school(school_str)
        casting_time = (row.get("Casting Time") or "").strip()
        if not ritual and re.search(r"\britual\b", casting_time, re.IGNORECASE):
            ritual = True
        classes = _parse_csv_classes(
            row.get("Classes", ""), row.get("Optional/Variant Classes", "")
        )
        description = _csv_description(
            row.get("Text", ""), row.get("At Higher Levels", "")
        )
        spells.append({
            "name": name,
            "level": level,
            "school": school,
            "casting_time": casting_time,
            "range": (row.get("Range") or "").strip(),
            "components": (row.get("Components") or "").strip(),
            "duration": (row.get("Duration") or "").strip(),
            "description": description,
            "classes": classes,
            "ritual": ritual,
            "sigil_params": _default_sigil_params(school),
            "source": "",
            "book_source": (row.get("Source") or "").strip() or "Unknown",
            "book_page": (row.get("Page") or "").strip(),
        })
    return spells


def _add_source_spells(parsed_spells, source, spells, spell_keys):
    loaded_names = []
    for spell in parsed_spells:
        spell["source"] = source
        loaded_names.append(spell["name"])
        key = (
            source.casefold(),
            spell["book_source"].casefold(),
            spell["name"].casefold(),
        )
        if key not in spell_keys:
            spell_keys.add(key)
            spells.append(spell)
    return loaded_names


def load_spells_from_file(file_path, source, spells, spell_keys):
    if not file_path.exists():
        return []
    text = file_path.read_text(encoding="utf-8")
    return _add_source_spells(parse_spells(text), source, spells, spell_keys)


def load_spells_from_csv(file_path, source, spells, spell_keys):
    if not file_path.exists():
        return []
    text = file_path.read_text(encoding="utf-8")
    return _add_source_spells(parse_csv_spells(text), source, spells, spell_keys)


def load_database_spells(root_dir, spells, spell_keys):
    db_dir = Path(root_dir) / "database" / "spells"
    if not db_dir.exists():
        return

    subdirs = sorted([p for p in db_dir.iterdir() if p.is_dir()], key=lambda p: p.name.lower())
    general = next((p for p in subdirs if p.name.lower() == "general"), None)
    homebrew = next((p for p in subdirs if p.name.lower() == "homebrew"), None)

    ordered = []
    if general:
        ordered.append(general)
    for p in subdirs:
        if p != general and p != homebrew:
            ordered.append(p)
    if homebrew:
        ordered.append(homebrew)

    for subdir in ordered:
        spells_csv = subdir / "spells.csv"
        load_spells_from_csv(spells_csv, subdir.name, spells, spell_keys)
        spells_md = subdir / "spells.md"
        load_spells_from_file(spells_md, subdir.name, spells, spell_keys)


def load_valyrian_names(root_dir):
    valyrian_path = Path(root_dir) / "database" / "valyrian" / "valyrian.json"
    if valyrian_path.exists():
        return json.loads(valyrian_path.read_text(encoding="utf-8"))
    return {}


def load_all_spells(root_dir):
    spells = []
    load_database_spells(root_dir, spells, set())

    valyrian = load_valyrian_names(root_dir)
    for spell in spells:
        entry = valyrian.get(spell["name"])
        spell["valyrian"] = {
            "name": entry.get("valyrian", "") if entry else "",
            "interpretation": entry.get("interpretation", "") if entry else "",
        }

    spells.sort(key=lambda s: (
        s["name"].lower(), s["source"].lower(), s["book_source"].lower()
    ))
    return spells
