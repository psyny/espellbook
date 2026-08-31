#!/usr/bin/env python3
"""Process raw sigil SVGs into cleaned SVGs plus metadata JSON."""

import hashlib
import json
import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT_DIR = Path(__file__).parent.resolve()
RAW_DIR = ROOT_DIR / "database" / "sigils" / "art" / "raw"
PROCESSED_DIR = ROOT_DIR / "database" / "sigils" / "art" / "processed"
DEFINITIONS_PATH = ROOT_DIR / "database" / "sigils" / "symbols_definitions.json"
ID_COUNTER_PATH = ROOT_DIR / "database" / "sigils" / "id_counter.json"

START_ID = 10000000001

# Only these top-level raw folders are converted into the processed tree.
ALLOWED_FOLDERS = {"essence", "flow", "intent", "ornamentation", "reach", "schools"}

# Sub-folders that are helper / test sets and should not be copied.
SKIP_SUBFOLDERS = {"test"}

SVG_NS = "http://www.w3.org/2000/svg"
INKSCAPE_NS = "http://www.inkscape.org/namespaces/inkscape"
SODIPODI_NS = "http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
XLINK_NS = "http://www.w3.org/1999/xlink"

# Register namespace prefixes so the output SVG keeps readable prefixes.
ET.register_namespace("", SVG_NS)
ET.register_namespace("inkscape", INKSCAPE_NS)
ET.register_namespace("sodipodi", SODIPODI_NS)
ET.register_namespace("svg", SVG_NS)
ET.register_namespace("xlink", XLINK_NS)

MARKER_CENTER = "_marker_center"

# Maps a substring of the marker's parent label to a topology category.
# Order matters: the first matching substring wins.
TOPOLOGY_CATEGORIES = [
    ("essence", "essence"),
    ("reach", "reach"),
    ("flow", "flow"),
    ("intent", "intent"),
    ("flair_s", "ornamentation_s"),
    ("flair_m", "ornamentation_m"),
    ("flair_l", "ornamentation_l"),
]

# Identity transform matrix, expressed as SVG's (a, b, c, d, e, f).
IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_definitions():
    """Load symbol definitions, returning an empty dict if missing."""
    if DEFINITIONS_PATH.exists():
        return json.loads(DEFINITIONS_PATH.read_text(encoding="utf-8"))
    return {}


def load_id_counter():
    """Return the next available global entity ID, never below START_ID."""
    next_id = START_ID
    if ID_COUNTER_PATH.exists():
        try:
            data = json.loads(ID_COUNTER_PATH.read_text(encoding="utf-8"))
            next_id = max(next_id, data.get("next_id", START_ID))
        except (json.JSONDecodeError, OSError):
            pass

    # Guard against lost counter files by scanning already-processed JSONs.
    max_used = next_id - 1
    if PROCESSED_DIR.exists():
        for json_path in PROCESSED_DIR.rglob("*.json"):
            try:
                data = json.loads(json_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue
            entity_map = data.get("entity_map", {})
            for key in ("entities", "groups"):
                for entity_id in entity_map.get(key, {}):
                    if isinstance(entity_id, str) and entity_id.isdigit():
                        max_used = max(max_used, int(entity_id))
    return max_used + 1


def save_id_counter(next_id):
    """Persist the next available global entity ID."""
    ID_COUNTER_PATH.write_text(
        json.dumps({"next_id": next_id}, indent=2), encoding="utf-8"
    )


class IdCounter:
    """Callable counter that hands out global entity IDs one at a time."""

    def __init__(self, start):
        self.next_id = start

    def __call__(self):
        current = self.next_id
        self.next_id += 1
        return str(current)


def replace_ids(root, next_id):
    """
    Replace every id in the tree with a fresh global id.

    References of the form url(#id), #id in href / xlink:href, and
    inkscape:current-layer are rewritten to match.  Returns the old-id
    to new-id mapping.
    """
    id_map = {}

    # First pass: allocate a new id for every unique old id.
    for elem in root.iter():
        old_id = elem.get("id")
        if old_id and old_id not in id_map:
            id_map[old_id] = next_id()

    # Second pass: rewrite element ids.
    for elem in root.iter():
        old_id = elem.get("id")
        if old_id and old_id in id_map:
            elem.set("id", id_map[old_id])

    # Third pass: rewrite references in attributes.
    xlink_href = f"{{{XLINK_NS}}}href"
    inkscape_current_layer = f"{{{INKSCAPE_NS}}}current-layer"

    for elem in root.iter():
        for attr_name, value in list(elem.attrib.items()):
            if not value:
                continue

            new_value = value

            # url(#id) and url('#id') / url("#id")
            def repl_url(match):
                quote = match.group(1) or ""
                ref_id = match.group(2)
                return f"url({quote}#{id_map.get(ref_id, ref_id)}{quote})"

            new_value = re.sub(
                r"url\((['\"]?)([^)'\"]+)\1\)", repl_url, new_value
            )

            # Direct href / xlink:href fragment references.
            if attr_name in ("href", xlink_href) and new_value.startswith("#"):
                ref_id = new_value[1:]
                if ref_id in id_map:
                    new_value = f"#{id_map[ref_id]}"

            # Inkscape current-layer pointer.
            if attr_name == inkscape_current_layer and new_value in id_map:
                new_value = id_map[new_value]

            if new_value != value:
                elem.set(attr_name, new_value)

    return id_map


def label_of(elem):
    """Return the inkscape:label of an element, or '' if absent."""
    return elem.get(f"{{{INKSCAPE_NS}}}label", "")


def is_group(elem):
    """Return True if the element is an SVG <g>."""
    return elem.tag == f"{{{SVG_NS}}}g"


def category_from_name(name):
    """Derive 'main' or 'sub' from substrings in the name; default to 'main'."""
    lowered = name.lower()
    if "sub" in lowered:
        return "sub"
    return "main"


def parse_school_filename(filename, definitions):
    """Parse 'school_level_N.svg' filenames against symbol definitions."""
    match = re.match(r"^([a-zA-Z]+)_level_(\d+)\.svg$", filename)
    if not match:
        return None

    slug = match.group(1)
    level = int(match.group(2))

    schools = definitions.get("School", {}).get("symbols", [])
    canonical = next(
        (s["name"] for s in schools if s["name"].lower() == slug.lower()),
        slug.capitalize(),
    )
    return {"school": canonical, "level": level}


def svg_tag_without_ns(tag):
    """Return the local tag name, stripping the namespace URI."""
    if tag.startswith("{"):
        return tag.split("}", 1)[1]
    return tag


def drawing_seed_attrs(elem):
    """Return a stable string of the element's geometric/content attributes."""
    tag = svg_tag_without_ns(elem.tag)
    attr_names = (
        "d", "points", "cx", "cy", "r", "x", "y", "width", "height",
        "rx", "ry", "x1", "y1", "x2", "y2",
    )
    parts = [tag]
    for attr in attr_names:
        value = elem.get(attr)
        if value is not None:
            parts.append(f"{attr}={value}")
    return "|".join(parts)


def stable_random_group(seed_material):
    """Return a deterministic vector of three ints in [0, 5] for *seed_material*."""
    digest = hashlib.sha256(seed_material.encode("utf-8")).digest()
    return [
        int.from_bytes(digest[i * 4:(i + 1) * 4], "big") % 6
        for i in range(3)
    ]


def compute_random_group(source_seed, elem, ancestors=(), original_id=None):
    """Build a stable seed from the source SVG and element traits, then hash it."""
    parts = [source_seed]
    parts.extend(ancestors)
    if original_id:
        parts.append(f"id={original_id}")
    parts.append(f"label={label_of(elem)}")
    parts.append(drawing_seed_attrs(elem))
    return stable_random_group("|".join(parts))


# CSS-style properties that we promote to XML attributes.
# Any property not in this set is dropped during standardisation.
PROMOTED_STYLE_PROPS = {
    "fill", "fill-opacity", "fill-rule",
    "stroke", "stroke-width", "stroke-opacity",
    "stroke-linecap", "stroke-linejoin",
    "stroke-dasharray", "stroke-dashoffset",
    "opacity", "display",
}

# Properties tied to stroke rendering, aside from "stroke" itself. These are
# only meaningful (and only emitted) when the element actually has a stroke.
STROKE_DEPENDENT_PROPS = {
    "stroke-linecap", "stroke-linejoin",
    "stroke-dasharray", "stroke-dashoffset",
}


def _parse_style(style_str):
    """Parse a CSS-style string into a dict of property -> value."""
    props = {}
    for part in style_str.split(";"):
        part = part.strip()
        if ":" not in part:
            continue
        key, val = part.split(":", 1)
        props[key.strip()] = val.strip()
    return props


def standardize_element_style(elem, is_stroke):
    """
    Normalise an SVG element's visual properties.

    1. Any ``style`` attribute is parsed; its entries are promoted to
       standalone XML attributes and the ``style`` attribute is removed.
    2. Presentation attributes already present on the element (not inside
       ``style``) are kept but normalised the same way.
    3. All colour values (fill / stroke) are replaced with ``#000000``.
    4. A ``class`` attribute is set to ``sigil-symbol-stroke`` when
       *is_stroke* is true, otherwise ``sigil-symbol-path``.
    """
    # Collect properties from inline style (highest priority).
    style_str = elem.get("style", "")
    style_props = _parse_style(style_str) if style_str else {}

    # Collect presentation attributes already on the element.
    existing_attrs = {}
    for prop in PROMOTED_STYLE_PROPS:
        val = elem.get(prop)
        if val is not None:
            existing_attrs[prop] = val

    # Merge: style properties override element attributes.
    merged = {**existing_attrs, **style_props}

    # Remove the style attribute and all promoted attributes from the element.
    if "style" in elem.attrib:
        del elem.attrib["style"]
    for prop in PROMOTED_STYLE_PROPS:
        if prop in elem.attrib:
            del elem.attrib[prop]

    # A stroke is only present if "stroke" is set to something other than
    # "none". When there is no stroke we still record stroke-opacity=0.0 and
    # stroke-width=0 explicitly, matching the fill handling above.
    fill_val = merged.get("fill")
    has_fill = fill_val is not None and fill_val.lower() != "none"

    stroke_val = merged.get("stroke")
    has_stroke = stroke_val is not None and stroke_val.lower() != "none"

    try:
        fill_opacity_is_zero = float(merged.get("fill-opacity", "1")) == 0
    except ValueError:
        fill_opacity_is_zero = False

    # Write back only the promoted properties, normalising colours.
    for prop in PROMOTED_STYLE_PROPS:
        val = merged.get(prop)

        if prop == "fill":
            # No fill (missing/"none") or an explicit fill-opacity of 0 both
            # mean the element renders unfilled, so "fill" is omitted.
            if not has_fill or fill_opacity_is_zero:
                continue
            elem.set(prop, "#000000")
            continue

        if prop == "fill-opacity":
            # If there is no fill, record that explicitly as fill-opacity 0.
            if not has_fill:
                elem.set(prop, "0.0")
            elif val is not None:
                elem.set(prop, val)
            continue

        if prop == "stroke":
            # No stroke (missing/"none") means "stroke" itself is omitted,
            # same as the fill handling above.
            if not has_stroke:
                continue
            elem.set(prop, "#000000")
            continue

        if prop == "stroke-opacity":
            # If there is no stroke, record that explicitly as stroke-opacity 0.
            if not has_stroke:
                elem.set(prop, "0.0")
            elif val is not None:
                elem.set(prop, val)
            continue

        if prop == "stroke-width":
            # If there is no stroke, record that explicitly as stroke-width 0.
            if not has_stroke:
                elem.set(prop, "0")
            elif val is not None:
                elem.set(prop, val)
            continue

        if prop in STROKE_DEPENDENT_PROPS and not has_stroke:
            continue

        if val is None:
            continue
        elem.set(prop, val)

    # Set the class.
    elem.set("class", "sigil-symbol-stroke" if is_stroke else "sigil-symbol-path")


# ---------------------------------------------------------------------------
# Transform math
#
# An SVG transform is the matrix [[a c e], [b d f], [0 0 1]], stored here as
# the tuple (a, b, c, d, e, f). Composing the transforms of every ancestor
# down to an element yields its CTM, which converts local coordinates into
# global (viewBox) coordinates.
#
# Note that inkscape:transform-center-x/y is deliberately ignored: it is only
# Inkscape's interactive rotation-pivot hint (the vector from an element's
# bounding-box centre to the pivot, with a flipped y axis) and carries no
# information about the element's actual placement.
# ---------------------------------------------------------------------------

def matrix_multiply(m, n):
    """Return the product of two transform matrices (m applied after n)."""
    a1, b1, c1, d1, e1, f1 = m
    a2, b2, c2, d2, e2, f2 = n
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def rotation_matrix(degrees, cx=0.0, cy=0.0):
    """Return a matrix rotating by `degrees` around the point (cx, cy)."""
    angle = math.radians(degrees)
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    rotate = (cos_a, sin_a, -sin_a, cos_a, 0.0, 0.0)
    if cx == 0.0 and cy == 0.0:
        return rotate
    return matrix_multiply(
        (1.0, 0.0, 0.0, 1.0, cx, cy),
        matrix_multiply(rotate, (1.0, 0.0, 0.0, 1.0, -cx, -cy)),
    )


def parse_transform(value):
    """Parse an SVG transform attribute into a single matrix."""
    matrix = IDENTITY
    if not value:
        return matrix

    for name, raw_args in re.findall(r"([a-zA-Z]+)\s*\(([^)]*)\)", value):
        args = [float(a) for a in re.split(r"[,\s]+", raw_args.strip()) if a]
        if name == "translate":
            tx = args[0]
            ty = args[1] if len(args) > 1 else 0.0
            step = (1.0, 0.0, 0.0, 1.0, tx, ty)
        elif name == "rotate":
            if len(args) >= 3:
                step = rotation_matrix(args[0], args[1], args[2])
            else:
                step = rotation_matrix(args[0])
        elif name == "scale":
            sx = args[0]
            sy = args[1] if len(args) > 1 else sx
            step = (sx, 0.0, 0.0, sy, 0.0, 0.0)
        elif name == "matrix":
            step = tuple(args[:6])
        elif name == "skewX":
            step = (1.0, 0.0, math.tan(math.radians(args[0])), 1.0, 0.0, 0.0)
        elif name == "skewY":
            step = (1.0, math.tan(math.radians(args[0])), 0.0, 1.0, 0.0, 0.0)
        else:
            continue
        matrix = matrix_multiply(matrix, step)

    return matrix


def apply_matrix(matrix, x, y):
    """Transform the point (x, y) by the given matrix."""
    a, b, c, d, e, f = matrix
    return (a * x + c * y + e, b * x + d * y + f)


def matrix_rotation(matrix):
    """Return the rotation of a matrix in degrees, normalised to [0, 360)."""
    a, b = matrix[0], matrix[1]
    return math.degrees(math.atan2(b, a)) % 360.0


def clean_number(value, digits=4):
    """Round a float, collapsing -0.0 and float noise to a tidy value."""
    rounded = round(value, digits)
    return rounded + 0.0


def local_origin(elem):
    """Return the element's local reference point, used as its centre."""
    if elem.get("cx") is not None or elem.get("cy") is not None:
        return (float(elem.get("cx", 0.0)), float(elem.get("cy", 0.0)))
    return (float(elem.get("x", 0.0)), float(elem.get("y", 0.0)))


# ---------------------------------------------------------------------------
# Topology extraction
# ---------------------------------------------------------------------------

def topology_category(label):
    """Map a marker's parent label to its topology category, if any."""
    lowered = label.lower()
    for needle, category in TOPOLOGY_CATEGORIES:
        if needle in lowered:
            return category
    return None


def collect_slots(group, matrix, slots, variable_rotation=False):
    """
    Recursively walk a group, accumulating the transform chain.

    Every `_marker_center` descendant defines a slot; its parent group supplies
    the source id and the label that decides the slot's category. The sibling
    `_marker_direction` and `_marker_boundary` markers are purely visual and
    are ignored.

    `variable_rotation` is decided by the label of the top-level group nested
    directly under `symbols_layout` (see `extract_topology`) and applies to
    every slot found underneath it.
    """
    for child in group:
        child_matrix = matrix_multiply(matrix, parse_transform(child.get("transform")))

        if is_group(child):
            collect_slots(child, child_matrix, slots, variable_rotation)
            continue

        if label_of(child) != MARKER_CENTER:
            continue

        category = topology_category(label_of(group))
        if category is None:
            continue

        cx, cy = local_origin(child)
        x, y = apply_matrix(child_matrix, cx, cy)
        slots.setdefault(category, []).append({
            "source_id": group.get("id"),
            "x": clean_number(x),
            "y": clean_number(y),
            "rotation": clean_number(matrix_rotation(child_matrix)),
            "variable_rotation": variable_rotation,
        })


def extract_topology(root):
    """Build the topology dictionary from the `symbols_layout` layer."""
    slots = {}

    for child in root:
        if is_group(child) and label_of(child) == "symbols_layout":
            matrix = parse_transform(child.get("transform"))
            for sub_group in child:
                sub_matrix = matrix_multiply(
                    matrix, parse_transform(sub_group.get("transform"))
                )
                if not is_group(sub_group):
                    continue
                variable_rotation = "_r_" in label_of(sub_group)
                collect_slots(sub_group, sub_matrix, slots, variable_rotation)

    # Emit categories in a stable, declared order.
    ordered = {}
    for _, category in TOPOLOGY_CATEGORIES:
        if category in slots:
            ordered[category] = slots[category]
    return ordered


# ---------------------------------------------------------------------------
# SVG filtering and metadata extraction
# ---------------------------------------------------------------------------

def filter_group(group, owning_group_id=None, source_seed=None,
                 reverse_id_map=None, ancestors=()):
    """
    Recursively filter a group, dropping children whose inkscape:label
    starts with '_'.

    Returns a tuple of:
      - new_group: the filtered <g> element (Element)
      - entities: dict mapping entity id -> metadata
      - groups: dict mapping direct subgroup id -> group metadata
      - own_entities: list of entity ids that belong to owning_group_id
    """
    new_group = ET.Element(group.tag, group.attrib)
    entities = {}
    groups = {}
    own_entities = []

    group_label = label_of(group)
    child_ancestors = ancestors + (group_label,)

    for child in group:
        child_label = label_of(child)

        # Any group/entity whose name starts with '_' is discarded entirely.
        if child_label.startswith("_"):
            continue

        original_id = child.get("id")
        if reverse_id_map and original_id:
            original_id = reverse_id_map.get(original_id, original_id)

        if is_group(child):
            child_id = child.get("id")
            if not child_id:
                # We need an id to reference the group in the entity map.
                continue

            # Direct subgroups of sigil_art/symbol_art become entries in the
            # entity_map groups dictionary.
            next_owner = owning_group_id
            if owning_group_id is None:
                next_owner = child_id
                groups[child_id] = {
                    "id": child_id,
                    "category": category_from_name(child_label),
                    "entities": [],
                    "random_group": compute_random_group(
                        source_seed, child, ancestors, original_id
                    ),
                }

            new_child, child_entities, child_groups, child_own = filter_group(
                child,
                owning_group_id=next_owner,
                source_seed=source_seed,
                reverse_id_map=reverse_id_map,
                ancestors=child_ancestors,
            )
            new_group.append(new_child)
            entities.update(child_entities)
            groups.update(child_groups)

            if owning_group_id is None:
                groups[child_id]["entities"] = child_own
            else:
                own_entities.extend(child_own)
        else:
            # Leaf element: an "entity".
            child_id = child.get("id")
            if not child_id:
                continue

            new_entity = ET.Element(child.tag, child.attrib)

            category = category_from_name(child_label)
            entity_is_stroke = child_label.endswith("_s")
            standardize_element_style(new_entity, entity_is_stroke)

            new_group.append(new_entity)

            entities[child_id] = {
                "id": child_id,
                "category": category,
                "is_stroke": entity_is_stroke,
                "random_group": compute_random_group(
                    source_seed, child, child_ancestors, original_id
                ),
            }

            if owning_group_id is None:
                # Top-level leaf under symbol_art / sigil_art: it is its own group.
                groups[child_id] = {
                    "id": child_id,
                    "category": category,
                    "entities": [child_id],
                    "random_group": compute_random_group(
                        source_seed, child, ancestors, original_id
                    ),
                }
            else:
                own_entities.append(child_id)

    return new_group, entities, groups, own_entities


def process_svg(input_path, output_svg_path, next_id):
    """
    Filter an SVG, keeping only sigil_art / symbol_art groups.

    Every id in the source is first rewritten to a fresh global id so that
    no two processed entities share the same identifier.  References such
    as url(#id), href="#id" and inkscape:current-layer are updated to
    match.  Returns (entities, groups, topology) extracted from the source.
    """
    tree = ET.parse(input_path)
    root = tree.getroot()

    id_map = replace_ids(root, next_id)
    reverse_id_map = {new_id: old_id for old_id, new_id in id_map.items()}
    source_seed = str(input_path.relative_to(ROOT_DIR))

    topology = extract_topology(root)

    new_root = ET.Element(root.tag, root.attrib)
    entities = {}
    groups = {}

    for child in root:
        if is_group(child):
            group_label = label_of(child)
            if group_label in ("sigil_art", "symbol_art"):
                new_group, child_entities, child_groups, _ = filter_group(
                    child,
                    source_seed=source_seed,
                    reverse_id_map=reverse_id_map,
                )
                new_root.append(new_group)
                entities.update(child_entities)
                groups.update(child_groups)
            # All other root-level groups are dropped.
        else:
            # Preserve non-group root children such as <defs>.
            new_root.append(child)

    ET.indent(new_root, space="  ")
    ET.ElementTree(new_root).write(
        output_svg_path, xml_declaration=True, encoding="unicode"
    )

    return entities, groups, topology


def subtype_from_base_filename(raw_folder, filename):
    """Derive the symbol subtype from the raw SVG filename."""
    stem = Path(filename).stem
    if raw_folder == "essence":
        # e.g. e_fire_01_s100 -> fire
        match = re.match(r"^e_([a-zA-Z0-9]+)_", stem)
        if match:
            return match.group(1).lower()
    elif raw_folder in ("flow", "intent", "reach"):
        # e.g. burst_s50 -> burst
        match = re.match(r"^([a-zA-Z0-9]+)(?:_s\d+)?$", stem)
        if match:
            return match.group(1).lower()
    return None


def rune_variant_from_filename(filename):
    """Extract the rune letter variant from filenames like flair_rune_a_s50.svg."""
    stem = Path(filename).stem
    match = re.match(r"^flair_rune_([a-zA-Z])_", stem)
    if match:
        return match.group(1).lower()
    return None


def build_metadata(input_svg, definitions):
    """Build metadata from the raw file path and, for schools, the filename."""
    rel = input_svg.relative_to(RAW_DIR)
    raw_folder = rel.parts[0]

    metadata = {
        "base_svg_filename": input_svg.name,
        "type": raw_folder,
    }

    if raw_folder == "schools":
        metadata["type"] = "school"
        parsed = parse_school_filename(input_svg.name, definitions)
        if parsed:
            metadata["school"] = parsed["school"]
            metadata["level"] = parsed["level"]
            metadata["subtype"] = parsed["school"].lower()
    elif raw_folder == "ornamentation" and len(rel.parts) >= 3:
        metadata["subtype"] = rel.parts[1].lower()
        if metadata["subtype"] == "runes":
            variant = rune_variant_from_filename(input_svg.name)
            if variant:
                metadata["variant"] = variant
    else:
        subtype = subtype_from_base_filename(raw_folder, input_svg.name)
        if subtype:
            metadata["subtype"] = subtype

    return metadata


def process_svg_file(input_svg, output_dir, definitions, next_id):
    """Create the processed SVG and JSON for a single raw SVG."""
    output_dir.mkdir(parents=True, exist_ok=True)

    output_svg = output_dir / f"{input_svg.stem}.svg"
    output_json = output_dir / f"{input_svg.stem}.json"

    entities, groups, topology = process_svg(input_svg, output_svg, next_id)

    metadata = build_metadata(input_svg, definitions)

    data = {
        "metadata": metadata,
        "entity_map": {
            "entities": entities,
            "groups": groups,
        },
    }

    # Only school sigils carry a topology map.
    if metadata["type"] == "school" and topology:
        data["topology"] = topology

    output_json.write_text(json.dumps(data, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def process_all():
    """Walk the allowed raw folders and convert their SVGs to processed art."""
    definitions = load_definitions()

    if not RAW_DIR.exists():
        print(f"Raw directory not found: {RAW_DIR}")
        return

    counter = IdCounter(load_id_counter())
    try:
        for folder in sorted(RAW_DIR.iterdir()):
            if not folder.is_dir() or folder.name not in ALLOWED_FOLDERS:
                continue

            for svg_file in sorted(folder.rglob("*.svg")):
                if any(part in SKIP_SUBFOLDERS for part in svg_file.parts):
                    continue

                rel = svg_file.relative_to(folder)
                out_dir = PROCESSED_DIR / folder.name / rel.parent

                print(f"Processing: {svg_file.relative_to(ROOT_DIR)}")
                process_svg_file(svg_file, out_dir, definitions, counter)
    finally:
        save_id_counter(counter.next_id)


if __name__ == "__main__":
    process_all()
