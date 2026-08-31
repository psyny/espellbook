#!/usr/bin/env python3
"""Render check SVGs overlaying topology slots on the base sigil art."""

import json
import xml.etree.ElementTree as ET
from pathlib import Path

from generate_processed_symbols import (
    INKSCAPE_NS,
    PROCESSED_DIR,
    RAW_DIR,
    SVG_NS,
    filter_group,
    is_group,
    label_of,
)


ROOT_DIR = Path(__file__).parent.resolve()
CHECKS_DIR = ROOT_DIR / "database" / "sigils" / "art" / "checks"

SLOT_SIZE = 10.0

# One colour per topology category.
CATEGORY_COLORS = {
    "essence": "#e6194b",
    "reach": "#3cb44b",
    "flow": "#4363d8",
    "intent": "#f58231",
    "ornamentation_s": "#911eb4",
    "ornamentation_m": "#00a0a0",
    "ornamentation_l": "#bcbd22",
}
FALLBACK_COLOR = "#808080"


def svg_elem(tag, **attrib):
    """Create a namespaced SVG element from plain keyword attributes."""
    return ET.Element(f"{{{SVG_NS}}}{tag}", {k: str(v) for k, v in attrib.items()})


def set_label(elem, label):
    """Tag an element with an inkscape:label so Inkscape shows a name."""
    elem.set(f"{{{INKSCAPE_NS}}}label", label)


def build_slot(slot, color):
    """
    Build a square of SLOT_SIZE centred on the slot, turned by its rotation.

    The square is drawn in a local frame centred on the origin, so the group's
    `translate(x, y) rotate(r)` transform places it exactly on the slot. A tick
    pointing along the local -y axis is added because a square is symmetric
    every 90 degrees, which would otherwise make the rotation unverifiable.
    """
    x, y = slot["x"], slot["y"]
    rotation = slot["rotation"]
    half = SLOT_SIZE / 2.0

    group = svg_elem("g", transform=f"translate({x},{y}) rotate({rotation})")
    set_label(group, slot.get("source_id", "slot"))

    group.append(svg_elem(
        "rect",
        x=-half,
        y=-half,
        width=SLOT_SIZE,
        height=SLOT_SIZE,
        style=(
            f"fill:{color};fill-opacity:0.35;"
            f"stroke:{color};stroke-width:1;stroke-opacity:1"
        ),
    ))
    group.append(svg_elem(
        "path",
        d=f"M 0,{-half} V {-half - SLOT_SIZE * 0.6}",
        style=f"fill:none;stroke:{color};stroke-width:1;stroke-opacity:1",
    ))
    return group


def build_topology_layer(topology):
    """Build one Inkscape layer per topology category, holding its slots."""
    layers = []
    for category, slots in topology.items():
        color = CATEGORY_COLORS.get(category, FALLBACK_COLOR)

        layer = svg_elem("g", id=f"check_{category}")
        layer.set(f"{{{INKSCAPE_NS}}}groupmode", "layer")
        set_label(layer, f"check_{category}")

        for slot in slots:
            layer.append(build_slot(slot, color))
        layers.append(layer)
    return layers


def build_legend(topology):
    """Build a small colour key so each category is identifiable."""
    layer = svg_elem("g", id="check_legend")
    layer.set(f"{{{INKSCAPE_NS}}}groupmode", "layer")
    set_label(layer, "check_legend")

    for index, (category, slots) in enumerate(topology.items()):
        color = CATEGORY_COLORS.get(category, FALLBACK_COLOR)
        y = 20 + index * 20

        layer.append(svg_elem(
            "rect",
            x=20, y=y, width=12, height=12,
            style=f"fill:{color};fill-opacity:0.35;stroke:{color};stroke-width:1",
        ))
        text = svg_elem(
            "text",
            x=38, y=y + 11,
            style="font-family:sans-serif;font-size:13px;fill:#000000",
        )
        text.text = f"{category} ({len(slots)})"
        layer.append(text)

    return layer


def build_check_svg(base_svg_path, topology, output_path):
    """Write a check SVG: the base art plus the topology slot overlay."""
    root = ET.parse(base_svg_path).getroot()

    new_root = ET.Element(root.tag, root.attrib)

    # Reuse the processing filter so the backdrop is exactly the entities that
    # survive into the processed SVG.
    for child in root:
        if is_group(child):
            if label_of(child) in ("sigil_art", "symbol_art"):
                new_group, _, _, _ = filter_group(child)
                new_root.append(new_group)
        else:
            new_root.append(child)

    for layer in build_topology_layer(topology):
        new_root.append(layer)
    new_root.append(build_legend(topology))

    ET.indent(new_root, space="  ")
    ET.ElementTree(new_root).write(
        output_path, xml_declaration=True, encoding="unicode"
    )


def check_all():
    """Generate a check SVG for every processed schools JSON."""
    source_dir = PROCESSED_DIR / "schools"
    output_dir = CHECKS_DIR / "schools"

    if not source_dir.exists():
        print(f"Processed directory not found: {source_dir}")
        return

    output_dir.mkdir(parents=True, exist_ok=True)

    for json_path in sorted(source_dir.glob("*.json")):
        data = json.loads(json_path.read_text(encoding="utf-8"))
        topology = data.get("topology", {})

        base_name = data.get("metadata", {}).get("base_svg_filename")
        base_svg = RAW_DIR / "schools" / base_name if base_name else None
        if not base_svg or not base_svg.exists():
            print(f"Skipping {json_path.name}: base SVG not found ({base_name})")
            continue

        output_path = output_dir / f"{json_path.stem}_check.svg"
        build_check_svg(base_svg, topology, output_path)

        total = sum(len(s) for s in topology.values())
        print(f"Check written: {output_path.relative_to(ROOT_DIR)} ({total} slots)")


if __name__ == "__main__":
    check_all()
