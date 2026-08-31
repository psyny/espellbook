"""Generic, deterministic color math helpers.

This module knows nothing about spells, sigils, or game semantics.
It only provides reusable HSL/RGB and circular hue operations.
"""

import math


def clamp(value, minimum, maximum):
    """Clamp `value` to the inclusive range [minimum, maximum]."""
    return max(minimum, min(maximum, value))


def normalize_hue(hue):
    """Wrap a hue angle so that 0 <= result < 360."""
    hue = hue % 360.0
    if hue < 0:
        hue += 360.0
    # Floating-point modulo of tiny negative values can round to exactly 360.0.
    if hue >= 360.0:
        hue = 0.0
    return hue


def lerp(a, b, t):
    """Linearly interpolate from `a` to `b` by factor `t`."""
    return a + (b - a) * t


def circular_hue_lerp(h1, h2, t):
    """Interpolate between two hues along the shortest path around the circle."""
    h1 = normalize_hue(h1)
    h2 = normalize_hue(h2)
    diff = ((h2 - h1 + 180.0) % 360.0) - 180.0
    return normalize_hue(h1 + diff * t)


def weighted_circular_hue_mean(hues, weights):
    """Compute the weighted circular mean of hues.

    `hues` and `weights` are iterables of the same length.  Hue values are
    treated as angles on the unit circle, averaged as vectors, and converted
    back to degrees with ``atan2`` so that wraparound is handled correctly.
    """
    total_x = 0.0
    total_y = 0.0
    total_weight = 0.0

    for hue, weight in zip(hues, weights):
        rad = math.radians(hue)
        total_x += math.cos(rad) * weight
        total_y += math.sin(rad) * weight
        total_weight += weight

    if total_weight == 0:
        return 0.0

    mean_x = total_x / total_weight
    mean_y = total_y / total_weight
    return normalize_hue(math.degrees(math.atan2(mean_y, mean_x)))


def hsl_to_rgb(h, s, l):
    """Convert HSL values to integer RGB channels in [0, 255].

    Hue is in degrees; saturation and lightness are in the range 0..100.
    """
    s = clamp(s, 0.0, 100.0) / 100.0
    l = clamp(l, 0.0, 100.0) / 100.0
    h = normalize_hue(h)

    chroma = (1.0 - abs(2.0 * l - 1.0)) * s
    sector = h / 60.0
    x = chroma * (1.0 - abs(sector % 2.0 - 1.0))
    m = l - chroma / 2.0

    if sector < 1.0:
        r1, g1, b1 = chroma, x, 0.0
    elif sector < 2.0:
        r1, g1, b1 = x, chroma, 0.0
    elif sector < 3.0:
        r1, g1, b1 = 0.0, chroma, x
    elif sector < 4.0:
        r1, g1, b1 = 0.0, x, chroma
    elif sector < 5.0:
        r1, g1, b1 = x, 0.0, chroma
    else:
        r1, g1, b1 = chroma, 0.0, x

    r = int(round((r1 + m) * 255.0))
    g = int(round((g1 + m) * 255.0))
    b = int(round((b1 + m) * 255.0))

    return clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255)


def hsl_to_rgb_string(h, s, l):
    """Convert HSL values to a standard CSS ``rgb(r, g, b)`` string."""
    r, g, b = hsl_to_rgb(h, s, l)
    return f"rgb({r}, {g}, {b})"
