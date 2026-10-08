"""Re-chain a school frame's stroke geometry into pen strokes for the
draw-on-cast animation.

The art stores shapes the way the vector editor left them, not the way a
hand would draw them: two overlapping squares are typically saved as the
union outline (a star) plus the intersection (an octagon). Tracing those
paths as stored draws an octagon and then eight triangles. This module
ignores the stored path boundaries, cuts every stroke at its corners, and
re-joins the pieces by "good continuation" (the line that carries straight
on through a junction is the same stroke), which recovers the two squares.

See code_map/html_sigil_gen.md for how the client consumes the result.
Standard library only.
"""

import math
import re

# Turn (degrees) at a vertex above which a path is cut into separate edges.
CORNER_ANGLE = 20.0
# Max deviation (degrees) from straight-through for two edge ends meeting
# at a junction to count as one continuous stroke.
SMOOTH_ANGLE = 20.0
# Edge ends closer than this (user units, on a 1000-unit canvas) share a junction.
JOIN_TOLERANCE = 0.75
# Longest gap (user units) a stroke is carried across, and how closely the
# two ends must line up (degrees) for that to happen.
MAX_GAP = 40.0
GAP_ANGLE = 12.0
_KAPPA = 0.5522847498307936  # cubic-bezier circle approximation constant

_TOKEN_RE = re.compile(r"([MmLlHhVvCcZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)")
_TRANSFORM_RE = re.compile(r"(matrix|translate|scale|rotate)\s*\(([^)]*)\)")
_ARG_COUNT = {"m": 2, "l": 2, "h": 1, "v": 1, "c": 6}
_IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


class UnsupportedGeometry(ValueError):
    """The element uses path commands or shapes this module does not chain."""


def _local_tag(tag):
    return tag.split("}", 1)[1] if tag.startswith("{") else tag


# --- geometry primitives -------------------------------------------------
# A segment is a tuple of points: (p0, p1) for a line, (p0, c1, c2, p3) for
# a cubic. Reversing a segment is just reversing the tuple.

def _dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _unit(a, b):
    length = _dist(a, b)
    return None if length < 1e-9 else ((b[0] - a[0]) / length, (b[1] - a[1]) / length)


def _start_dir(seg):
    """Unit travel direction at the segment's start (skips coincident control points)."""
    for point in seg[1:]:
        direction = _unit(seg[0], point)
        if direction:
            return direction
    return None


def _end_dir(seg):
    """Unit travel direction at the segment's end."""
    for point in reversed(seg[:-1]):
        direction = _unit(point, seg[-1])
        if direction:
            return direction
    return None


def _angle_between(a, b):
    dot = max(-1.0, min(1.0, a[0] * b[0] + a[1] * b[1]))
    return math.degrees(math.acos(dot))


def _seg_length(seg):
    if len(seg) == 2:
        return _dist(seg[0], seg[1])
    p0, c1, c2, p3 = seg
    total, prev = 0.0, p0
    for i in range(1, 17):
        t = i / 16.0
        u = 1.0 - t
        point = (
            u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1],
        )
        total += _dist(prev, point)
        prev = point
    return total


# --- parsing -------------------------------------------------------------

def _parse_transform(text):
    matrix = _IDENTITY
    for name, raw in _TRANSFORM_RE.findall(text or ""):
        args = [float(v) for v in re.split(r"[\s,]+", raw.strip()) if v]
        if name == "matrix" and len(args) == 6:
            local = tuple(args)
        elif name == "translate":
            local = (1.0, 0.0, 0.0, 1.0, args[0], args[1] if len(args) > 1 else 0.0)
        elif name == "scale":
            local = (args[0], 0.0, 0.0, args[1] if len(args) > 1 else args[0], 0.0, 0.0)
        elif name == "rotate":
            cos_a, sin_a = math.cos(math.radians(args[0])), math.sin(math.radians(args[0]))
            cx, cy = (args[1], args[2]) if len(args) == 3 else (0.0, 0.0)
            local = (cos_a, sin_a, -sin_a, cos_a,
                     cx - cos_a * cx + sin_a * cy, cy - sin_a * cx - cos_a * cy)
        else:
            raise UnsupportedGeometry(f"transform {name}({raw})")
        matrix = _multiply(matrix, local)
    return matrix


def _multiply(m, n):
    """Matrix for "apply n, then m" (SVG transform lists apply right-to-left)."""
    return (
        m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    )


def _apply(matrix, point):
    return (matrix[0] * point[0] + matrix[2] * point[1] + matrix[4],
            matrix[1] * point[0] + matrix[3] * point[1] + matrix[5])


def _parse_path(d):
    """Return [(segments, closed)] per subpath. Supports M L H V C Z (both cases),
    which is everything the processed school art uses."""
    if re.search(r"[AaSsQqTt]", d):
        raise UnsupportedGeometry("arc/smooth/quadratic path commands")
    subpaths = []
    segments, closed = [], False
    cur = start = (0.0, 0.0)
    command = None
    def flush():
        nonlocal segments, closed
        if segments:
            subpaths.append((segments, closed))
        segments, closed = [], False

    tokens = _TOKEN_RE.findall(d)
    index = 0
    while index < len(tokens):
        letter, number = tokens[index]
        if letter:
            if letter in "Zz":
                if _dist(cur, start) > 1e-6:
                    segments.append((cur, start))
                cur = start
                closed = True
                flush()
                command = None
            else:
                command = letter
            index += 1
            continue
        if command is None:
            raise UnsupportedGeometry("path data without a command")
        lower = command.lower()
        count = _ARG_COUNT[lower]
        numbers = [float(tokens[index + k][1]) for k in range(count)]
        index += count
        relative = command.islower()
        ox, oy = cur if relative else (0.0, 0.0)
        if lower == "m":
            flush()
            cur = start = (ox + numbers[0], oy + numbers[1])
            command = "l" if relative else "L"  # further pairs are implicit lineto
        elif lower == "l":
            point = (ox + numbers[0], oy + numbers[1])
            segments.append((cur, point))
            cur = point
        elif lower == "h":
            point = ((cur[0] if relative else 0.0) + numbers[0], cur[1])
            segments.append((cur, point))
            cur = point
        elif lower == "v":
            point = (cur[0], (cur[1] if relative else 0.0) + numbers[0])
            segments.append((cur, point))
            cur = point
        elif lower == "c":
            c1 = (ox + numbers[0], oy + numbers[1])
            c2 = (ox + numbers[2], oy + numbers[3])
            point = (ox + numbers[4], oy + numbers[5])
            segments.append((cur, c1, c2, point))
            cur = point
    flush()
    return subpaths


def _element_subpaths(elem):
    """Absolute-coordinate subpaths for a path/rect/circle element, with the
    element's own `transform` applied."""
    tag = _local_tag(elem.tag)
    if tag == "path":
        subpaths = _parse_path(elem.get("d", ""))
    elif tag == "rect":
        if float(elem.get("rx", 0) or 0) or float(elem.get("ry", 0) or 0):
            raise UnsupportedGeometry("rounded rect")
        x, y = float(elem.get("x", 0)), float(elem.get("y", 0))
        w, h = float(elem.get("width", 0)), float(elem.get("height", 0))
        corners = [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]
        subpaths = [([(corners[i], corners[(i + 1) % 4]) for i in range(4)], True)]
    elif tag == "circle":
        cx, cy, r = float(elem.get("cx", 0)), float(elem.get("cy", 0)), float(elem.get("r", 0))
        k = r * _KAPPA
        # Clockwise on screen, starting at the top.
        subpaths = [([
            ((cx, cy - r), (cx + k, cy - r), (cx + r, cy - k), (cx + r, cy)),
            ((cx + r, cy), (cx + r, cy + k), (cx + k, cy + r), (cx, cy + r)),
            ((cx, cy + r), (cx - k, cy + r), (cx - r, cy + k), (cx - r, cy)),
            ((cx - r, cy), (cx - r, cy - k), (cx - k, cy - r), (cx, cy - r)),
        ], True)]
    else:
        raise UnsupportedGeometry(f"<{tag}>")

    matrix = _parse_transform(elem.get("transform"))
    result = []
    for segments, closed in subpaths:
        moved = [tuple(_apply(matrix, p) for p in seg) for seg in segments]
        moved = [seg for seg in moved if _seg_length(seg) > 1e-6]
        if moved:
            result.append((moved, closed))
    return result


# --- chaining ------------------------------------------------------------

class _Edge:
    """A corner-free run of segments from one stored path."""

    def __init__(self, segments, entity_id):
        self.segments = segments
        self.entity_id = entity_id
        self.length = sum(_seg_length(seg) for seg in segments)
        self.loop = False  # smooth closed loop (e.g. a circle): no free ends

    def end_point(self, end):
        return self.segments[0][0] if end == 0 else self.segments[-1][-1]

    def outward_dir(self, end):
        """Direction pointing away from the edge, out through this end."""
        if end == 0:
            direction = _start_dir(self.segments[0])
            return (-direction[0], -direction[1])
        return _end_dir(self.segments[-1])

    def oriented(self, entered_at):
        """Segments in travel order when the pen enters at end `entered_at`."""
        if entered_at == 0:
            return list(self.segments)
        return [tuple(reversed(seg)) for seg in reversed(self.segments)]


def _split_edges(segments, closed, entity_id):
    """Cut one subpath into edges at every vertex sharper than CORNER_ANGLE."""
    count = len(segments)
    cuts = []
    for i in range(count):
        nxt = (i + 1) % count
        if nxt == 0 and not closed:
            continue
        if _angle_between(_end_dir(segments[i]), _start_dir(segments[nxt])) > CORNER_ANGLE:
            cuts.append(nxt)  # an edge starts at segment index `nxt`
    if closed and not cuts:
        edge = _Edge(list(segments), entity_id)
        edge.loop = True
        return [edge]
    if not closed:
        cuts = sorted(set([0] + cuts))
        bounds = cuts + [count]
        return [_Edge(segments[bounds[i]:bounds[i + 1]], entity_id) for i in range(len(cuts))]
    cuts = sorted(set(cuts))
    rotated = segments[cuts[0]:] + segments[:cuts[0]]
    offsets = [c - cuts[0] for c in cuts] + [count]
    return [_Edge(rotated[offsets[i]:offsets[i + 1]], entity_id) for i in range(len(cuts))]


def _pair_ends(edges):
    """Decide which edge ends continue into each other.
    Returns {(edge_index, end): (edge_index, end)} (symmetric).

    Three kinds of continuation, tried in this order:
      1. smooth: two ends touch and the line carries straight through;
      2. bridged: two ends face each other across a short gap, in line with
         one another. Interlaced art cuts the "under" band where another
         band crosses it; the eye (and a pen) carries the line across;
      3. corner: ends that still touch turn the corner together, so the pen
         keeps going instead of lifting at every vertex.
    """
    ends = [(i, end) for i, edge in enumerate(edges) if not edge.loop for end in (0, 1)]
    smooth, bridged, corner = [], [], []
    for a in range(len(ends)):
        edge_a, end_a = edges[ends[a][0]], ends[a][1]
        point_a, dir_a = edge_a.end_point(end_a), edge_a.outward_dir(end_a)
        for b in range(a + 1, len(ends)):
            edge_b, end_b = edges[ends[b][0]], ends[b][1]
            point_b, dir_b = edge_b.end_point(end_b), edge_b.outward_dir(end_b)
            gap = _dist(point_a, point_b)
            if gap > MAX_GAP:
                continue
            # Straight-through means the two outward directions oppose.
            deviation = _angle_between(dir_a, (-dir_b[0], -dir_b[1]))
            if gap <= JOIN_TOLERANCE:
                target = smooth if deviation <= SMOOTH_ANGLE else corner
                target.append((deviation, ends[a], ends[b]))
            elif edge_a is not edge_b and deviation <= GAP_ANGLE:
                across = _unit(point_a, point_b)
                if (_angle_between(dir_a, across) <= GAP_ANGLE
                        and _angle_between(dir_b, (-across[0], -across[1])) <= GAP_ANGLE):
                    bridged.append((deviation + gap, ends[a], ends[b]))

    partner = {}
    for candidates in (smooth, bridged, corner):
        for _, end_a, end_b in sorted(candidates, key=lambda item: item[0]):
            if end_a not in partner and end_b not in partner:
                partner[end_a] = end_b
                partner[end_b] = end_a
    return partner


def _walk(edges, partner, start_key, visited):
    """Follow partners from `start_key` (entering that end); returns oriented edges."""
    path = []
    key = start_key
    while key is not None and key[0] not in visited:
        visited.add(key[0])
        path.append((edges[key[0]], key[1]))
        key = partner.get((key[0], 1 - key[1]))
    return path


def _format(value):
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def _chain_record(walked, closed):
    segments = []
    for edge, entered_at in walked:
        segments.extend(edge.oriented(entered_at))
    parts = [f"M{_format(segments[0][0][0])},{_format(segments[0][0][1])}"]
    length = 0.0
    cursor = segments[0][0]
    for seg in segments:
        # A bridged gap is drawn through with a plain line: a new subpath
        # would restart the dash pattern the client traces the stroke with.
        if _dist(cursor, seg[0]) > 0.01:
            parts.append(f"L{_format(seg[0][0])},{_format(seg[0][1])}")
            length += _dist(cursor, seg[0])
        cursor = seg[-1]
        length += _seg_length(seg)
        if len(seg) == 2:
            parts.append(f"L{_format(seg[1][0])},{_format(seg[1][1])}")
        else:
            parts.append("C" + " ".join(f"{_format(p[0])},{_format(p[1])}" for p in seg[1:]))
    if closed:
        parts.append("Z")
    entities = []
    for edge, _ in walked:
        if edge.entity_id not in entities:
            entities.append(edge.entity_id)
    return {
        "d": "".join(parts),
        "length": round(length, 1),
        "entities": entities,
    }


def build_draw_chains(elements):
    """`elements` is an iterable of (entity_id, element) for stroke shapes that
    share one coordinate space. Returns pen strokes, longest first, as
    [{"d": absolute path data, "length": float, "entities": [entity ids]}].
    Raises UnsupportedGeometry if any element can't be chained."""
    edges = []
    for entity_id, elem in elements:
        for segments, closed in _element_subpaths(elem):
            edges.extend(_split_edges(segments, closed, entity_id))

    # Slivers shorter than the join tolerance (editor boolean-op leftovers)
    # would claim a junction's pairings for themselves; their neighbours
    # still meet at the same node without them.
    edges = [edge for edge in edges if edge.loop or edge.length > JOIN_TOLERANCE]

    partner = _pair_ends(edges)
    visited = set()
    chains = []

    for index, edge in enumerate(edges):
        if edge.loop:
            visited.add(index)
            chains.append(_chain_record([(edge, 0)], True))

    # Open chains start from an end nothing continues into.
    for index, edge in enumerate(edges):
        if index in visited:
            continue
        for end in (0, 1):
            if (index, end) not in partner:
                chains.append(_chain_record(_walk(edges, partner, (index, end), visited), False))
                break

    # Whatever remains is a closed loop; start it at its topmost corner.
    remaining = [i for i in range(len(edges)) if i not in visited]
    remaining.sort(key=lambda i: (edges[i].end_point(0)[1], edges[i].end_point(0)[0]))
    for index in remaining:
        if index not in visited:
            chains.append(_chain_record(_walk(edges, partner, (index, 0), visited), True))

    chains.sort(key=lambda chain: -chain["length"])
    return chains
