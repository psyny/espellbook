import json
import statistics
from pathlib import Path

from .sigil_params import SigilEmbedder, calculate_sigil_colors
from .spells import load_all_spells


DEFAULT_START_ID = 1_000_000


def _processed_dir(root_dir):
    return Path(root_dir) / "database" / "spells" / "processed"


def _load_process_params(root_dir):
    params_path = Path(root_dir) / "database" / "spells" / "process_params.json"
    return json.loads(params_path.read_text(encoding="utf-8"))


def _load_existing_catalog(root_dir):
    catalog_path = _processed_dir(root_dir) / "spells.json"
    if not catalog_path.exists():
        return []
    data = json.loads(catalog_path.read_text(encoding="utf-8"))
    return data.get("spells", []) if isinstance(data, dict) else data


def _load_id_counter(root_dir):
    counter_path = _processed_dir(root_dir) / "id_counter.json"
    if counter_path.exists():
        try:
            return max(DEFAULT_START_ID, json.loads(counter_path.read_text(encoding="utf-8")).get("next_id", DEFAULT_START_ID))
        except (json.JSONDecodeError, OSError):
            pass
    return DEFAULT_START_ID


def _save_id_counter(root_dir, next_id):
    counter_path = _processed_dir(root_dir) / "id_counter.json"
    counter_path.parent.mkdir(parents=True, exist_ok=True)
    counter_path.write_text(json.dumps({"next_id": next_id}, indent=2), encoding="utf-8")


def _spell_key(spell):
    source = spell.get("source")
    if source is None:
        sources = spell.get("source_list") or []
        source = sources[0] if sources else ""
    book_source = spell.get("book_source") or "Unknown"
    return source.casefold(), book_source.casefold(), spell["name"].casefold()


def _assign_ids(spells, existing_ids, legacy_ids, next_id):
    """Return spells with stable IDs, plus the next available ID."""
    assigned_ids = [*existing_ids.values(), *legacy_ids.values()]
    max_existing = max(assigned_ids, default=DEFAULT_START_ID - 1)
    next_id = max(next_id, max_existing + 1)

    result = []
    for spell in spells:
        spell = dict(spell)
        spell_id = existing_ids.get(_spell_key(spell))
        if spell_id is None:
            spell_id = legacy_ids.pop(spell["name"].casefold(), None)
        if spell_id is None:
            spell_id = next_id
            next_id += 1
        spell["id"] = spell_id
        result.append(spell)
    return result, next_id


STAT_SPECS = {
    "essence_stats": ("dominance", "clarity", "spread", "entropy"),
    "intent_stats": ("dominance", "clarity", "spread", "entropy"),
    "style": (
        "vector_noise",
        "angle_noise",
        "position_noise",
        "rand_factor_1",
        "rand_factor_2",
        "rand_factor_3",
        "rand_factor_4",
        "rand_factor_5",
    ),
}


def _compute_field_stats(spells, category, field):
    """Return mean/median/min/max (with spell ids) for one stat field."""
    entries = [
        (spell["id"], spell["sigil_params"][category][field])
        for spell in spells
    ]
    values = [value for _, value in entries]

    min_id, min_value = min(entries, key=lambda entry: entry[1])
    max_id, max_value = max(entries, key=lambda entry: entry[1])

    return {
        "mean": statistics.mean(values),
        "median": statistics.median(values),
        "min": min_value,
        "min_spell_id": min_id,
        "max": max_value,
        "max_spell_id": max_id,
    }


def _build_spells_stats(spells):
    """Aggregate mean/median/min/max stats for essence_stats, intent_stats, and style."""
    return {
        category: {
            field: _compute_field_stats(spells, category, field)
            for field in fields
        }
        for category, fields in STAT_SPECS.items()
    }


def build_spell_catalog(root_dir):
    """Parse raw spells, assign stable IDs, and write the processed catalog."""
    existing = _load_existing_catalog(root_dir)
    existing_ids = {
        _spell_key(spell): spell["id"]
        for spell in existing
        if "id" in spell and ("source" in spell or spell.get("source_list"))
    }
    legacy_ids = {
        spell["name"].casefold(): spell["id"]
        for spell in existing
        if "id" in spell and "source" not in spell and not spell.get("source_list")
    }
    next_id = _load_id_counter(root_dir)
    process_params = _load_process_params(root_dir)

    raw_spells = load_all_spells(root_dir)
    spells, next_id = _assign_ids(raw_spells, existing_ids, legacy_ids, next_id)

    if spells:
        embedder = SigilEmbedder(root_dir)
        sigil_params = embedder.compute_sigil_params(
            spells,
            essence_top_gap=process_params["essence_top_gap"],
            intent_top_gap=process_params["intent_top_gap"],
            noise_params={
                "vector_noise": process_params["vector_noise"],
                "angle_noise": process_params["angle_noise"],
                "position_noise": process_params["position_noise"],
            },
        )
        for spell, sigil in zip(spells, sigil_params):
            spell["sigil_params"]["essence"] = sigil["essence"]
            spell["sigil_params"]["intent"] = sigil["intent"]
            spell["sigil_params"]["essence_stats"] = sigil["essence_stats"]
            spell["sigil_params"]["intent_stats"] = sigil["intent_stats"]
            spell["sigil_params"]["essence_top"] = sigil["essence_top"]
            spell["sigil_params"]["intent_top"] = sigil["intent_top"]
            spell["sigil_params"]["reach"] = sigil["reach"]
            spell["sigil_params"]["flow"] = sigil["flow"]
            spell["sigil_params"]["style"]["vector_noise"] = sigil["vector_noise"]
            spell["sigil_params"]["style"]["angle_noise"] = sigil["angle_noise"]
            spell["sigil_params"]["style"]["position_noise"] = sigil["position_noise"]
            spell["sigil_params"]["style"].update(sigil["rand_factors"])
            spell["sigil_params"]["style"].update(
                calculate_sigil_colors(sigil, process_params["essence_colors"])
            )

    processed_dir = _processed_dir(root_dir)
    processed_dir.mkdir(parents=True, exist_ok=True)
    catalog_path = processed_dir / "spells.json"
    catalog_path.write_text(
        json.dumps({"spells": spells}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    _save_id_counter(root_dir, next_id)

    if spells:
        stats_path = processed_dir / "spells_stats.json"
        stats_path.write_text(
            json.dumps(_build_spells_stats(spells), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    return catalog_path


def load_processed_spells(root_dir):
    """Load the processed spell catalog produced by build_spell_catalog."""
    catalog_path = _processed_dir(root_dir) / "spells.json"
    if not catalog_path.exists():
        raise FileNotFoundError(
            f"Processed spell catalog not found: {catalog_path}\n"
            "Run `python3 generate_spell_catalog.py` first."
        )
    data = json.loads(catalog_path.read_text(encoding="utf-8"))
    return data.get("spells", []) if isinstance(data, dict) else data
