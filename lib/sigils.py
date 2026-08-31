"""Build the client-side sigil library: a shared <defs> block of <symbol>s
plus the lookup tables the browser needs to compose each spell's sigil on
the fly, following database/sigils/composition_def.md.
"""

import json
import xml.etree.ElementTree as ET
from pathlib import Path

from generate_processed_symbols import INKSCAPE_NS, SODIPODI_NS, is_group, label_of

ART_LAYER_LABELS = ("symbol_art", "sigil_art")
SKIP_ATTR_NAMESPACES = (INKSCAPE_NS, SODIPODI_NS)

# Color is driven entirely by the parent .immersive-sigil CSS (currentColor
# via .sigil-symbol-path / .sigil-symbol-stroke), never by the art itself.
# Drop internal ids so splitting one SVG into multiple symbols does not
# produce duplicate IDs in the shared <defs> block.
SKIP_ATTR_NAMES = ("fill", "stroke", "id")


def _art_root(root_dir):
    return Path(root_dir) / "database" / "sigils" / "art" / "processed"


def load_viewbox_per_level(root_dir):
    """Return the spell-level -> sigil viewBox size map from process_params.json."""
    params_path = Path(root_dir) / "database" / "spells" / "process_params.json"
    if not params_path.exists():
        return {}
    params = json.loads(params_path.read_text(encoding="utf-8"))
    return params.get("viewbox_per_level", {})


def _slugify(text):
    return "".join(ch if ch.isalnum() else "-" for ch in text.lower()).strip("-") or "x"


def _local_tag(tag):
    return tag.split("}", 1)[1] if tag.startswith("{") else tag


def _clean_copy(elem, drop_stroke_width=False):
    """Copy an element dropping inkscape/sodipodi bookkeeping and namespace
    prefixes, so it can be embedded directly as literal HTML (foreign
    content), matching the plain-tag style of svg_reuse_example.html.
    When `drop_stroke_width` is true, the `stroke-width` attribute is also
    stripped so callers can set it on a `<use>` reference instead."""
    new = ET.Element(_local_tag(elem.tag))
    for name, value in elem.attrib.items():
        if name.startswith("{"):
            uri, local = name[1:].split("}", 1)
            if uri in SKIP_ATTR_NAMESPACES:
                continue
            name = local
        if name in SKIP_ATTR_NAMES:
            continue
        if drop_stroke_width and name == "stroke-width":
            continue
        new.set(name, value)
    for child in elem:
        new.append(_clean_copy(child, drop_stroke_width=drop_stroke_width))
    return new


def _clean_entity_copy(elem):
    """Clean an entity element and return the cleaned element plus its original
    stroke-width. The returned element has no stroke-width attributes, so the
    value can be applied (and overridden) on the referencing `<use>`."""
    raw_stroke = elem.get("stroke-width")
    stroke_width = None
    if raw_stroke is not None:
        try:
            stroke_width = float(raw_stroke)
        except ValueError:
            pass
    return _clean_copy(elem, drop_stroke_width=True), stroke_width


def _art_layer(svg_path):
    root = ET.parse(svg_path).getroot()
    layer = next(
        (child for child in root if is_group(child) and label_of(child) in ART_LAYER_LABELS),
        None,
    )
    if layer is None:
        return None, None, None
    view_box = root.get("viewBox", "0 0 100 100")
    width = float(view_box.split()[2])
    return _clean_copy(layer), width, layer


def _symbol_markup(symbol_id, width, layer):
    inner = ET.tostring(layer, encoding="unicode")
    return f'<symbol id="{symbol_id}" viewBox="0 0 {width:g} {width:g}">{inner}</symbol>'


def _element_by_id(root, elem_id):
    for elem in root.iter():
        if _local_tag(elem.get("id", "")) == elem_id:
            return elem
    return None


def _register_school_entities(register, raw_layer, width, base_symbol_id, entity_map):
    """For a school SVG, register one symbol per entity and return per-group
    metadata containing entity lists. Each entity record includes its
    is_stroke flag, random_group, original stroke-width, and generated symbol
    id so the client can draw and optionally rescale stroke widths."""
    groups = (entity_map or {}).get("groups", {})
    entities = (entity_map or {}).get("entities", {})
    entity_symbols = {}

    for entity_id, entity_data in entities.items():
        elem = _element_by_id(raw_layer, entity_id)
        if elem is None:
            continue
        cleaned, stroke_width = _clean_entity_copy(elem)
        symbol_id = f"{base_symbol_id}--entity-{entity_id}"
        register(symbol_id, width, cleaned, entity_map)
        entity_symbols[entity_id] = {
            "id": entity_id,
            "is_stroke": entity_data.get("is_stroke", False),
            "random_group": entity_data.get("random_group", []),
            "stroke_width": stroke_width,
            "symbol": {"id": symbol_id, "size": width},
        }

    result = []
    for group_id, group_data in groups.items():
        result.append({
            "id": group_id,
            "category": group_data.get("category", ""),
            "random_group": group_data.get("random_group", []),
            "entities": [
                entity_symbols[entity_id]
                for entity_id in group_data.get("entities", [])
                if entity_id in entity_symbols
            ],
        })
    return result


def build_sigil_library(root_dir):
    """Scan every processed sigil art asset and return everything needed to
    build spell sigils client-side: the shared symbol defs, per-category
    asset lookup tables, per-category fallbacks, school topology data, and
    per-symbol entity maps."""
    art_root = _art_root(root_dir)
    symbols_html = []
    entity_maps = {}

    def register(symbol_id, width, layer, entity_map=None):
        symbols_html.append(_symbol_markup(symbol_id, width, layer))
        if entity_map is not None:
            entity_maps[symbol_id] = entity_map

    named_categories = {"essence": {}, "intent": {}, "reach": {}, "flow": {}}
    for category, table in named_categories.items():
        folder = art_root / category
        if not folder.exists():
            continue
        for json_path in sorted(folder.glob("*.json")):
            svg_path = json_path.with_suffix(".svg")
            if not svg_path.exists():
                continue
            data = json.loads(json_path.read_text(encoding="utf-8"))
            metadata = data.get("metadata", {})
            subtype = metadata.get("subtype", "").lower()
            if not subtype:
                continue
            layer, width, _ = _art_layer(svg_path)
            if layer is None:
                continue
            size = int(round(width))
            symbol_id = f"sig-{category}-{_slugify(subtype)}-{size}"
            register(symbol_id, width, layer, data.get("entity_map"))
            table.setdefault(subtype, {})[size] = {"id": symbol_id, "size": size}

    runes = {}
    runes_folder = art_root / "ornamentation" / "runes"
    if runes_folder.exists():
        for json_path in sorted(runes_folder.glob("*.json")):
            svg_path = json_path.with_suffix(".svg")
            if not svg_path.exists():
                continue
            data = json.loads(json_path.read_text(encoding="utf-8"))
            metadata = data.get("metadata", {})
            variant = metadata.get("variant", "").lower()
            if not variant:
                continue
            layer, width, _ = _art_layer(svg_path)
            if layer is None:
                continue
            size = int(round(width))
            symbol_id = f"sig-rune-{_slugify(variant)}-{size}"
            register(symbol_id, width, layer, data.get("entity_map"))
            runes[variant] = {"id": symbol_id, "size": size}

    geo = []
    geo_folder = art_root / "ornamentation" / "geo"
    if geo_folder.exists():
        for index, json_path in enumerate(sorted(geo_folder.glob("*.json"))):
            svg_path = json_path.with_suffix(".svg")
            if not svg_path.exists():
                continue
            data = json.loads(json_path.read_text(encoding="utf-8"))
            layer, width, _ = _art_layer(svg_path)
            if layer is None:
                continue
            size = int(round(width))
            symbol_id = f"sig-geo-{index}-{size}"
            register(symbol_id, width, layer, data.get("entity_map"))
            geo.append({"id": symbol_id, "size": size})

    schools = {}
    schools_folder = art_root / "schools"
    if schools_folder.exists():
        for json_path in sorted(schools_folder.glob("*.json")):
            svg_path = json_path.with_suffix(".svg")
            if not svg_path.exists():
                continue
            data = json.loads(json_path.read_text(encoding="utf-8"))
            metadata = data.get("metadata", {})
            school = metadata.get("school", "").lower()
            level = metadata.get("level")
            if not school or level is None:
                continue
            layer, width, raw_layer = _art_layer(svg_path)
            if layer is None:
                continue
            symbol_id = f"sig-school-{_slugify(school)}-{level}"
            register(symbol_id, width, layer, data.get("entity_map"))
            groups_meta = _register_school_entities(
                register, raw_layer, width, symbol_id, data.get("entity_map")
            )
            schools.setdefault(school, {})[str(level)] = {
                "symbol": {"id": symbol_id, "size": width},
                "topology": data.get("topology", {}),
                "groups": groups_meta,
            }

    fallbacks = {
        category: sorted(table.keys())[0]
        for category, table in named_categories.items()
        if table
    }
    default_school = sorted(schools.keys())[0] if schools else None

    return {
        "defs_html": "".join(symbols_html),
        "assets": {
            "essence": named_categories["essence"],
            "intent": named_categories["intent"],
            "reach": named_categories["reach"],
            "flow": named_categories["flow"],
            "runes": runes,
            "geo": geo,
        },
        "fallbacks": fallbacks,
        "schools": schools,
        "default_school": default_school,
        "entity_maps": entity_maps,
    }
