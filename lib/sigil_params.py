import hashlib
import html
import json
import re
from pathlib import Path
from typing import Optional

import numpy as np
from sentence_transformers import SentenceTransformer

from .colors import clamp, hsl_to_rgb_string, normalize_hue, weighted_circular_hue_mean


DEFAULT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

DEFAULT_CATEGORIES = ("Essence", "Intent")

SCORE_WEIGHTS = {
    "definition": 0.60,
    "associated": 0.35,
    "not_associated": -0.25,
}

# ---------------------------------------------------------------------------
# Sigil color art-direction constants
# ---------------------------------------------------------------------------

# Sigil color variation constants.
COLOR_1_H_MAX_RANGE = 50.0
COLOR_2_L_MAX_RANGE = 5.0
COLOR_3_L_MAX_RANGE = 5.0

# Color 3 multi-Essence Aura hue randomization amplitude.
COLOR_3_HUE_RANDOM_RANGE = 0.55

import html
import re
from collections import defaultdict


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clean_text(text: Optional[str]) -> str:
    """
    Remove HTML, decode entities, and normalize whitespace.
    """
    if not text:
        return ""

    text = html.unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip().lower()


def _description(spell: dict) -> str:
    return _clean_text(spell.get("description", ""))


# ---------------------------------------------------------------------------
# Reach
# ---------------------------------------------------------------------------

def parse_spell_reach(spell: dict) -> str:
    """
    Return:
        touch
        close
        medium
        far
        unlimited

    Primarily derived from spell["range"].

    Current distance buckets:
        Touch       -> touch
        Self        -> touch
        <= 30 ft    -> close
        <= 120 ft   -> medium
        > 120 ft    -> far
        miles       -> far
        sight /
        unlimited /
        planar      -> unlimited
    """
    value = _clean_text(spell.get("range", ""))

    if not value:
        return "close"

    # Explicit exceptional ranges
    if re.search(
        r"\b("
        r"unlimited|"
        r"sight|"
        r"same plane|"
        r"same plane of existence|"
        r"any distance|"
        r"anywhere"
        r")\b",
        value,
    ):
        return "unlimited"

    if re.search(r"\btouch\b", value):
        return "touch"

    # Self means the magic originates directly from the caster.
    if re.search(r"\bself\b", value):
        return "touch"

    # Miles are still finite.
    if re.search(r"\b\d+(?:\.\d+)?\s*miles?\b", value):
        return "far"

    # Extract range in feet.
    match = re.search(
        r"\b(\d+(?:\.\d+)?)\s*(?:feet|foot|ft)\b",
        value,
    )

    if match:
        feet = float(match.group(1))

        if feet <= 30:
            return "close"

        if feet <= 120:
            return "medium"

        return "far"

    # Conservative fallback
    return "medium"


# ---------------------------------------------------------------------------
# Flow
# ---------------------------------------------------------------------------

def parse_spell_flow(spell: dict) -> str:
    """
    Return one of:
        point
        projectile
        line
        cone
        burst
        wall
        aura
        chain

    Flow is determined from explicit geometric / propagation language.
    Strong geometrical wording takes priority over generic words.
    """
    text = _description(spell)

    # ------------------------------------------------------------------
    # Chain
    # ------------------------------------------------------------------
    if re.search(
        r"\b("
        r"jumps? (?:to|from)|"
        r"leaps? (?:to|from)|"
        r"arcs? (?:to|between)|"
        r"bounces? (?:to|between)|"
        r"chains? (?:to|between)|"
        r"from one (?:creature|target) to another|"
        r"another (?:creature|target) within \d+ feet"
        r")\b",
        text,
    ):
        return "chain"

    # ------------------------------------------------------------------
    # Wall / barrier geometry
    # ------------------------------------------------------------------
    if re.search(
        r"\b("
        r"wall|"
        r"curtain|"
        r"barrier"
        r")\b",
        text,
    ):
        return "wall"

    # ------------------------------------------------------------------
    # Explicit D&D geometry
    #
    # These should win over words like "ray", "flame", "blast", etc.
    # ------------------------------------------------------------------
    if re.search(
        r"\b(?:\d+[- ]foot[- ](?:long )?)?cone\b",
        text,
    ):
        return "cone"

    if re.search(
        r"\b("
        r"line of|"
        r"in a \d+[- ]foot[- ](?:long )?line|"
        r"\d+ feet long and \d+ feet wide|"
        r"each creature in the line"
        r")\b",
        text,
    ):
        return "line"

    # ------------------------------------------------------------------
    # Aura / emanation
    #
    # 2024 wording often explicitly uses "Emanation".
    # ------------------------------------------------------------------
    if re.search(r"\bemanation\b", text):
        return "aura"

    if re.search(
        r"\b("
        r"aura|"
        r"radiates? from you|"
        r"emanates? from you|"
        r"surrounds? you|"
        r"surrounding you"
        r")\b",
        text,
    ):
        return "aura"

    # A persistent radius centered on the caster is also probably an aura.
    if (
        re.search(
            r"\b(?:within|in) (?:a )?\d+[- ]foot radius\b",
            text,
        )
        and re.search(
            r"\b(?:around you|centered on you|originating from you)\b",
            text,
        )
        and not re.search(r"\binstantaneous\b", _clean_text(spell.get("duration", "")))
    ):
        return "aura"

    # ------------------------------------------------------------------
    # Burst / radial area
    #
    # Cubes and spheres are treated as "burst" in this visual vocabulary:
    # a detached area centered at a point.
    # ------------------------------------------------------------------
    if re.search(
        r"\b("
        r"\d+[- ]foot[- ]radius|"
        r"\d+[- ]foot radius|"
        r"\d+[- ]foot[- ]radius sphere|"
        r"\bsphere\b|"
        r"\bcube\b|"
        r"\bcylinder\b|"
        r"centered on a point|"
        r"centered at a point|"
        r"explodes?|"
        r"erupts?|"
        r"detonates?"
        r")\b",
        text,
    ):
        return "burst"

    # ------------------------------------------------------------------
    # Projectile
    # ------------------------------------------------------------------
    if re.search(
        r"\b("
        r"projectile|"
        r"missile|"
        r"missiles|"
        r"bolt|"
        r"bolts|"
        r"ray|"
        r"rays|"
        r"dart|"
        r"darts|"
        r"orb|"
        r"orbs|"
        r"beam|"
        r"beams|"
        r"shoot|"
        r"shoots|"
        r"hurl|"
        r"hurls|"
        r"launch|"
        r"launches"
        r")\b",
        text,
    ):
        return "projectile"

    # Generic attack-roll language usually suggests something traveling
    # toward a target, unless stronger geometry was detected above.
    if re.search(
        r"\b(?:ranged spell attack|make a ranged attack)\b",
        text,
    ):
        return "projectile"

    # Default: effect happens directly on a creature/object/location.
    return "point"


# ---------------------------------------------------------------------------
# Essence
# ---------------------------------------------------------------------------

DAMAGE_TYPE_TO_ESSENCE = {
    "fire": "Fire",
    "cold": "Cold",
    "lightning": "Lightning",
    "thunder": "Thunder",
    "acid": "Acid",
    "poison": "Poison",
    "force": "Force",
    "radiant": "Radiance",
    "necrotic": "Necrosis",
    "psychic": "Mind",
}


# These are deliberately conservative.
#
# Generic words such as "creature", "spell", "range", "turn", etc. should
# NOT be used because they would classify nearly every spell.
ESSENCE_KEYWORDS = {
    "Fire": [
        r"\bflames?\b",
        r"\bfire\b",
        r"\bburning\b",
        r"\bignite[sd]?\b",
        r"\bcombust(?:ion|s|ed|ing)?\b",
        r"\bembers?\b",
    ],

    "Cold": [
        r"\bfrost\b",
        r"\bice\b",
        r"\bicy\b",
        r"\bfrozen\b",
        r"\bfreez(?:e|es|ing)\b",
        r"\bchill(?:ed|ing)?\b",
        r"\bsnow\b",
    ],

    "Lightning": [
        r"\blightning\b",
        r"\belectric(?:ity|al)?\b",
        r"\bsparks?\b",
        r"\bstatic electricity\b",
    ],

    "Thunder": [
        r"\bthunder\b",
        r"\bthunderous\b",
        r"\bshock ?wave\b",
        r"\bsonic boom\b",
        r"\bconcussive (?:sound|wave|blast)\b",
    ],

    "Acid": [
        r"\bacid(?:ic)?\b",
        r"\bcaustic\b",
        r"\bcorrod(?:e|es|ed|ing)\b",
    ],

    "Poison": [
        r"\bpoison(?:ed|ous)?\b",
        r"\bvenom(?:ous)?\b",
        r"\btoxins?\b",
    ],

    "Force": [
        r"\bforce damage\b",
        r"\bwall of force\b",
        r"\bforce field\b",
        r"\btelekinetic force\b",
    ],

    "Radiance": [
        r"\bradiant\b",
        r"\bholy light\b",
        r"\bdivine radiance\b",
        r"\bsacred (?:light|flame|energy)\b",
    ],

    "Necrosis": [
        r"\bnecrotic\b",
        r"\bnecrosis\b",
        r"\bdeathly energy\b",
        r"\bwithers?\b",
        r"\bwithering\b",
        r"\bdecay\b",
    ],

    "Life": [
        r"\bregains? hit points?\b",
        r"\brestores? hit points?\b",
        r"\bheals?\b",
        r"\bhealing\b",
        r"\bregeneration\b",
        r"\blife force\b",
        r"\bvitality\b",
        r"\brevives?\b",
        r"\bresurrect(?:s|ed|ion)?\b",
    ],

    "Mind": [
        r"\bpsychic\b",
        r"\bthoughts?\b",
        r"\bmemories?\b",
        r"\bmemory\b",
        r"\btelepath(?:y|ic)\b",
        r"\bcharmed\b",
        r"\bfrightened\b",
        r"\bdreams?\b",
        r"\bmental(?:ly)?\b",
    ],

    "Soul": [
        r"\bsouls?\b",
        r"\bspirits?\b",
        r"\bghosts?\b",
        r"\bspecters?\b",
        r"\bastral\b",
        r"\bafterlife\b",
        r"\bpossession\b",
        r"\breincarnat(?:e|es|ed|ion)\b",
    ],

    "Time": [
        r"\btime stop\b",
        r"\btemporal\b",
        r"\baccelerated time\b",
        r"\bslows? time\b",
        r"\bstops? time\b",
        r"\brewinds? time\b",
        r"\baging\b",
    ],

    "Space": [
        r"\bteleport(?:s|ed|ation)?\b",
        r"\bportal\b",
        r"\bportals\b",
        r"\bdemiplane\b",
        r"\bextradimensional\b",
        r"\bplane of existence\b",
        r"\bplanar\b",
        r"\bdimensional\b",
    ],

    "Air": [
        r"\bwind\b",
        r"\bwinds\b",
        r"\bbreeze\b",
        r"\bgale\b",
        r"\bair\b",
        r"\batmosphere\b",
    ],

    "Earth": [
        r"\bearth\b",
        r"\bsoil\b",
        r"\bdirt\b",
        r"\bsand\b",
        r"\bclay\b",
        r"\bground\b",
        r"\bmud\b",
    ],

    "Water": [
        r"\bwater\b",
        r"\brain\b",
        r"\briver\b",
        r"\bsea\b",
        r"\bocean\b",
        r"\btide\b",
        r"\bwave\b",
        r"\bfluid\b",
    ],

    "Plant": [
        r"\bplants?\b",
        r"\btrees?\b",
        r"\bvines?\b",
        r"\broots?\b",
        r"\bleaves?\b",
        r"\bflowers?\b",
        r"\bvegetation\b",
        r"\bthorns?\b",
    ],

    "Stone": [
        r"\bstone\b",
        r"\brock\b",
        r"\bboulder\b",
        r"\bcrystal\b",
        r"\bmasonry\b",
        r"\bpetrif(?:y|ies|ied|ication)\b",
    ],

    "Metal": [
        r"\bmetal\b",
        r"\bmetallic\b",
        r"\biron\b",
        r"\bsteel\b",
        r"\bsilver\b",
        r"\bgold\b",
    ],

    "Light": [
        r"\bbright light\b",
        r"\bdim light\b",
        r"\billuminat(?:e|es|ed|ion)\b",
        r"\bglows?\b",
        r"\bflash of light\b",
        r"\bvisible light\b",
    ],

    "Shadow": [
        r"\bdarkness\b",
        r"\bshadows?\b",
        r"\bshadowy\b",
        r"\bdimness\b",
        r"\bumbral\b",
    ],

    "Sound": [
        r"\bsound\b",
        r"\bsounds\b",
        r"\bvoice\b",
        r"\bvoices\b",
        r"\bmusic\b",
        r"\becho(?:es)?\b",
        r"\bwhispers?\b",
        r"\baudible\b",
    ],

    "Magic": [
        # Intentionally very restrictive.
        r"\bdetect magic\b",
        r"\bdispel magic\b",
        r"\bmagical effect\b",
        r"\bmagical effects\b",
        r"\bspellcasting\b",
        r"\bmagic item\b",
        r"\bmagic items\b",
    ],
}


def parse_spell_essence(spell: dict) -> dict[str, int]:
    """
    Extract essences from spell["description"].

    Damage dice get weighted by their number of dice:

        "3d8 fire damage" -> {"Fire": 3}
        "1d6 cold damage" -> {"Cold": 1}

    A subsequent textual occurrence without a die contributes +1.

    Example:
        "3d8 fire damage ... the creature is surrounded by fire"

        -> {"Fire": 4}

    Damage types are detected first so that the same phrase isn't counted
    again by generic keyword matching.
    """
    text = _description(spell)

    result: dict[str, int] = defaultdict(int)

    # Keep track of character ranges already consumed by explicit
    # damage expressions.
    consumed_spans: list[tuple[int, int]] = []

    # ------------------------------------------------------------------
    # 1. Dice + damage type:
    #
    #      3d8 fire damage
    #      2d6 necrotic damage
    # ------------------------------------------------------------------
    dice_damage_pattern = re.compile(
        r"\b(\d+)d\d+(?:\s*[+-]\s*\d+)?\s+"
        r"(acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder)"
        r"\s+damage\b",
        re.IGNORECASE,
    )

    for match in dice_damage_pattern.finditer(text):
        dice_count = int(match.group(1))
        damage_type = match.group(2).lower()

        essence = DAMAGE_TYPE_TO_ESSENCE[damage_type]
        result[essence] += dice_count

        consumed_spans.append(match.span())

    # ------------------------------------------------------------------
    # 2. Damage type without explicit dice:
    #
    #      "takes fire damage"
    #      "resistance to cold damage"
    #
    # Each occurrence contributes 1.
    # ------------------------------------------------------------------
    damage_pattern = re.compile(
        r"\b"
        r"(acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder)"
        r"\s+damage\b",
        re.IGNORECASE,
    )

    for match in damage_pattern.finditer(text):
        # Skip if this occurrence was already part of "3d8 fire damage".
        if any(
            match.start() >= start and match.end() <= end
            for start, end in consumed_spans
        ):
            continue

        damage_type = match.group(1).lower()
        essence = DAMAGE_TYPE_TO_ESSENCE[damage_type]

        result[essence] += 1
        consumed_spans.append(match.span())

    # ------------------------------------------------------------------
    # 3. Semantic but still explicit keyword matches.
    #
    # Don't double-count words inside damage expressions.
    # ------------------------------------------------------------------
    for essence, patterns in ESSENCE_KEYWORDS.items():
        for pattern in patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                if any(
                    match.start() >= start and match.end() <= end
                    for start, end in consumed_spans
                ):
                    continue

                result[essence] += 1

    return dict(result)


# ---------------------------------------------------------------------------
# Intent
# ---------------------------------------------------------------------------

INTENT_PATTERNS = {
    "Burst": [
        # High confidence
        (5, r"\b\d+d\d+(?:\s*[+-]\s*\d+)?\s+\w+\s+damage\b"),
        (4, r"\btakes? \w+ damage\b"),
        (4, r"\bdeal(?:s)? \w+ damage\b"),
        (4, r"\bextra \d+d\d+ damage\b"),
        (3, r"\bdamage on a failed save\b"),
        (3, r"\bmake a (?:melee|ranged) spell attack\b"),
    ],

    "Protection": [
        (6, r"\bresistance to\b"),
        (6, r"\bimmunity to\b"),
        (5, r"\breduce(?:s|d)? the damage\b"),
        (5, r"\btemporary hit points\b"),
        (5, r"\barmor class\b"),
        (5, r"\bhalf cover\b"),
        (5, r"\bthree-quarters cover\b"),
        (5, r"\bdisadvantage on attack rolls? against\b"),
        (5, r"\bcannot be targeted\b"),
        (5, r"\bprotected from\b"),
        (5, r"\bward(?:ed|s|ing)?\b"),
        (5, r"\bshield(?:ed|s|ing)?\b"),
        (5, r"\bnegate(?:s|d)?\b"),
        (4, r"\bprevent(?:s|ed)?\b"),
        (4, r"\bsucceed on the save instead\b"),
    ],

    "Creation": [
        (6, r"\byou summon\b"),
        (6, r"\byou create\b"),
        (6, r"\byou conjure\b"),
        (6, r"\bcreates? a creature\b"),
        (6, r"\bcreates? an? (?:object|wall|construct|weapon)\b"),
        (5, r"\bmaterializes?\b"),
        (5, r"\bmanifest(?:s|ed)?\b"),
        (5, r"\bappears? in an unoccupied space\b"),
        (4, r"\bbring(?:s)? .* into existence\b"),
    ],

    "Transformation": [
        (6, r"\btransform(?:s|ed)?\b"),
        (6, r"\bshape-shifts?\b"),
        (6, r"\bpolymorph(?:s|ed)?\b"),
        (6, r"\balter your physical form\b"),
        (5, r"\bchange(?:s)? (?:your|its|the target'?s?) appearance\b"),
        (5, r"\bchange(?:s)? size\b"),
        (5, r"\bgrow(?:s)? (?:claws|fangs|horns|wings|gills)\b"),
        (4, r"\bpetrif(?:y|ies|ied)\b"),
        (4, r"\bturns? into\b"),
        (3, r"\bregains? hit points?\b"),
        (3, r"\brestores? hit points?\b"),
        (3, r"\bheal(?:s|ed|ing)?\b"),
        (3, r"\bspeed (?:increases?|becomes?)\b"),
    ],

    "Movement": [
        (6, r"\bteleport(?:s|ed|ation)?\b"),
        (6, r"\btransport(?:s|ed)?\b"),
        (6, r"\bportal\b"),
        (5, r"\bmove(?:s|d)? .*? \d+ feet\b"),
        (5, r"\bpush(?:es|ed)? .*? \d+ feet\b"),
        (5, r"\bpull(?:s|ed)? .*? \d+ feet\b"),
        (5, r"\bflies?\b"),
        (5, r"\bflying speed\b"),
        (5, r"\bswim speed\b"),
        (5, r"\bclimb speed\b"),
        (4, r"\bspeed increases?\b"),
        (4, r"\brelocate(?:s|d)?\b"),
    ],

    "Knowledge": [
        (6, r"\byou learn\b"),
        (6, r"\byou know\b"),
        (6, r"\byou detect\b"),
        (6, r"\byou sense\b"),
        (6, r"\byou perceive\b"),
        (6, r"\byou identify\b"),
        (6, r"\breveals?\b"),
        (6, r"\bdivination\b"),
        (6, r"\bscry(?:ing)?\b"),
        (5, r"\bcommunicat(?:e|es|ion)\b"),
        (5, r"\bmessage\b"),
        (5, r"\bunderstand(?:s)?\b"),
        (5, r"\bsee invisible\b"),
        (5, r"\btrue form\b"),
        (4, r"\bbecomes aware\b"),
    ],

    "Influence": [
        (7, r"\bcharmed\b"),
        (7, r"\bfrightened\b"),
        (7, r"\bcommand(?:s|ed)?\b"),
        (7, r"\bcompel(?:s|led)?\b"),
        (7, r"\bdominat(?:e|es|ed)\b"),
        (6, r"\bsuggestion\b"),
        (6, r"\bmust .*? use its (?:action|reaction)\b"),
        (6, r"\bmust .*? attack\b"),
        (6, r"\bcontrol(?:led)?\b"),
        (5, r"\bconfused\b"),
        (5, r"\bdisadvantage on .*? attack roll\b"),
        (5, r"\badvantage on .*? attack roll\b"),
        (5, r"\bsubtract .*? attack roll\b"),
        (4, r"\bcan't take reactions\b"),
    ],
}


INTENT_TIE_PRIORITY = [
    "Protection",
    "Creation",
    "Transformation",
    "Movement",
    "Knowledge",
    "Influence",
    "Burst",
]


def parse_spell_intent(spell: dict) -> str:
    """
    Return the spell's primary intent:

        burst
        protection
        creation
        transformation
        movement
        knowledge
        influence

    Uses weighted regex matching only.

    Important:
    incidental damage should not automatically make a spell Burst.
    Strong functional patterns have larger weights.
    """
    text = _description(spell)

    scores = {
        intent: 0
        for intent in INTENT_PATTERNS
    }

    for intent, patterns in INTENT_PATTERNS.items():
        for weight, pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)

            if matches:
                scores[intent] += weight * len(matches)

    # ---------------------------------------------------------------
    # A few useful mechanical corrections.
    # ---------------------------------------------------------------

    # Damage is extremely common as a secondary consequence.
    # Protection language should beat it in something like Absorb Elements.
    if re.search(
        r"\b(?:resistance|immunity|reduce the damage|temporary hit points|armor class)\b",
        text,
    ):
        scores["Protection"] += 6

    # Healing is classified as Transformation by the project definition.
    if re.search(
        r"\b(?:regains?|restores?) hit points?\b",
        text,
    ):
        scores["Transformation"] += 6

    # Strong mental conditions.
    if re.search(
        r"\b(?:charmed|frightened|dominated|compelled)\b",
        text,
    ):
        scores["Influence"] += 6

    # Explicit creation wording.
    if re.search(
        r"\byou (?:create|summon|conjure)\b",
        text,
    ):
        scores["Creation"] += 6

    # Explicit teleportation should strongly imply Movement.
    if re.search(
        r"\bteleport(?:s|ed|ation)?\b",
        text,
    ):
        scores["Movement"] += 8

    # Explicit information gathering.
    if re.search(
        r"\b(?:detect|identify|learn|reveal|scry|foresee|predict)\b",
        text,
    ):
        scores["Knowledge"] += 5

    max_score = max(scores.values(), default=0)

    # If nothing useful was detected, use a light school-based fallback.
    if max_score == 0:
        school = _clean_text(spell.get("school", ""))

        fallback = {
            "abjuration": "Protection",
            "divination": "Knowledge",
            "enchantment": "Influence",
            "illusion": "Transformation",
            "transmutation": "Transformation",
        }

        intent = fallback.get(school, "Burst")
        return intent.lower()

    # Deterministic tie-breaking.
    candidates = {
        intent
        for intent, score in scores.items()
        if score == max_score
    }

    for intent in INTENT_TIE_PRIORITY:
        if intent in candidates:
            return intent.lower()

    return "burst"


def _strip_html(text):
    """Remove HTML tags, decode entities, and collapse whitespace."""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def build_spell_embedding_text(spell, category, known_essence=None, known_intent=None):
    name = spell["name"]
    school = spell.get("school", "")
    description = _strip_html(spell.get("description", ""))

    if category == "Essence":
        prompt = (
            "Identify the substance, element, energy, material, living principle, "
            "or metaphysical domain directly expressed by this spell."
        )
    elif category == "Intent":
        prompt = (
            "Identify the primary purpose or outcome this spell is designed to produce."
        )
    else:
        raise ValueError(f"Unsupported category: {category}")

    text = f"{prompt}\nSpell: {name}\nSchool: {school}\nDescription: {description}"

    if known_essence is not None:
        essence_str = ", ".join(
            f"{name}: {count}" for name, count in known_essence.items()
        )
        text += f"\nKnown Essence: {essence_str}"

    if known_intent is not None:
        text += f"\nKnown Intent: {known_intent}"

    return text

def build_spells_sigil_params(
    model,
    symbol_profiles,
    spells,
    essence_top_gap,
    intent_top_gap,
    noise_params,
):
    reach_values = [parse_spell_reach(spell) for spell in spells]
    flow_values = [parse_spell_flow(spell) for spell in spells]
    essence_values = [parse_spell_essence(spell) for spell in spells]
    intent_values = [parse_spell_intent(spell) for spell in spells]

    essence_texts = [
        build_spell_embedding_text(
            spell, "Essence", known_essence=essence, known_intent=intent
        )
        for spell, essence, intent in zip(spells, essence_values, intent_values)
    ]
    intent_texts = [
        build_spell_embedding_text(
            spell, "Intent", known_essence=essence, known_intent=intent
        )
        for spell, essence, intent in zip(spells, essence_values, intent_values)
    ]

    essence_embeddings = embed_texts(model, essence_texts)
    intent_embeddings = embed_texts(model, intent_texts)

    result = []
    for spell, essence_embedding, intent_embedding, reach, flow in zip(
        spells,
        essence_embeddings,
        intent_embeddings,
        reach_values,
        flow_values,
    ):
        essence_raw = calculate_category_scores(
            essence_embedding,
            symbol_profiles["Essence"],
        )
        intent_raw = calculate_category_scores(
            intent_embedding,
            symbol_profiles["Intent"],
        )

        essence_normalized = normalize_score_vector(essence_raw)
        intent_normalized = normalize_score_vector(intent_raw)

        school = spell["school"]

        rand_factors = calculate_rand_factors(
            school, spell["name"], essence_normalized, intent_normalized, reach, flow
        )

        result.append({
            "essence": essence_normalized,
            "intent": intent_normalized,
            "essence_stats": calculate_vector_stats(essence_normalized),
            "intent_stats": calculate_vector_stats(intent_normalized),
            "essence_top": select_top_symbols(essence_normalized, essence_top_gap),
            "intent_top": select_top_symbols(intent_normalized, intent_top_gap),
            "vector_noise": calculate_noise_parameter(
                school, essence_normalized, intent_normalized, noise_params["vector_noise"]
            ),
            "angle_noise": calculate_noise_parameter(
                school, essence_normalized, intent_normalized, noise_params["angle_noise"]
            ),
            "position_noise": calculate_noise_parameter(
                school, essence_normalized, intent_normalized, noise_params["position_noise"]
            ),
            "rand_factors": rand_factors,
            "reach": reach,
            "flow": flow,
        })

    return result


def load_embedding_model(model_name=DEFAULT_MODEL):
    """Load the sentence embedding model once."""
    return SentenceTransformer(model_name)


def load_symbol_definitions(root_dir):
    """Load the sigil symbol definitions from the database."""
    path = Path(root_dir) / "database" / "sigils" / "symbols_definitions.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _build_symbol_texts(symbol):
    """Return the three texts derived from a symbol definition."""
    definitions = symbol["definitions"]
    description = definitions.get("description", "")

    associated = definitions.get("associated", [])
    if associated:
        associated_text = (
            "This concept is strongly associated with: " + ", ".join(associated)
        )
    else:
        associated_text = ""

    not_associated = definitions.get("not_associated", [])
    if not_associated:
        not_associated_text = (
            "This concept is distinct from and should not match: "
            + ", ".join(not_associated)
        )
    else:
        not_associated_text = ""

    return description, associated_text, not_associated_text


def build_symbol_embedding_profiles(model, definitions, categories=DEFAULT_CATEGORIES):
    """Precompute definition, associated, and not-associated embeddings for each symbol."""
    profiles = {}
    for category in categories:
        category_profiles = []
        for symbol in definitions.get(category, {}).get("symbols", []):
            desc, associated, not_associated = _build_symbol_texts(symbol)
            embeddings = model.encode(
                [desc, associated, not_associated],
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
            )
            category_profiles.append({
                "name": symbol["name"],
                "definition": embeddings[0],
                "associated": embeddings[1],
                "not_associated": embeddings[2],
            })
        profiles[category] = category_profiles
    return profiles


def embed_texts(model, texts):
    """Encode a list of texts as normalized sentence embeddings."""
    if not texts:
        return np.empty((0, model.get_sentence_embedding_dimension()))
    return model.encode(
        texts,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )


def calculate_symbol_score(spell_embedding, symbol_profile):
    """Compute the weighted raw score for a single symbol."""
    def_sim = float(spell_embedding @ symbol_profile["definition"])
    assoc_sim = float(spell_embedding @ symbol_profile["associated"])
    not_assoc_sim = float(spell_embedding @ symbol_profile["not_associated"])
    return (
        SCORE_WEIGHTS["definition"] * def_sim
        + SCORE_WEIGHTS["associated"] * assoc_sim
        + SCORE_WEIGHTS["not_associated"] * not_assoc_sim
    )


def calculate_category_scores(spell_embedding, symbol_profiles):
    """Return a score for every symbol in a category."""
    return {
        profile["name"]: calculate_symbol_score(spell_embedding, profile)
        for profile in symbol_profiles
    }


def select_top_symbols(score_dict, gap):
    """
    Return symbol names whose score is within `gap` of the maximum score,
    sorted in descending order of score.

    Always includes the top symbol. Iterates the remaining symbols in
    descending order and stops as soon as one falls below `max - gap`.
    """
    sorted_items = sorted(score_dict.items(), key=lambda kv: kv[1], reverse=True)

    if not sorted_items:
        return []

    max_value = sorted_items[0][1]
    threshold = max_value - gap

    result = []
    for name, value in sorted_items:
        if value < threshold:
            break
        result.append(name)

    return result


def stable_hash_to_float(text):
    """
    Deterministically map a string to a float in [0, 1] via SHA-256.

    Stable across processes/runs (unlike Python's built-in hash()).
    """
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    integer = int.from_bytes(digest[:8], "big")
    return integer / (2**64 - 1)


def _canonical_vector_string(vector_dict, precision=6):
    """
    Build a stable, ordered string representation of a normalized vector
    for use as a hash seed. Preserves the vector's existing key order.
    """
    return "|".join(
        f"{name}:{value:.{precision}f}" for name, value in vector_dict.items()
    )


def calculate_noise_parameter(school, essence_normalized, intent_normalized, noise_config):
    """
    Calculate a single style noise value (vector_noise, angle_noise, or
    position_noise) for a spell.

    noise = school_base
        + sum(essence_value * essence_factor)
        + sum(intent_value * intent_factor)

    Clamped to [0, 1].
    """
    noise = noise_config["school_base"][school]

    essence_factors = noise_config["essence_factors"]
    for name, value in essence_normalized.items():
        noise += value * essence_factors[name]

    intent_factors = noise_config["intent_factors"]
    for name, value in intent_normalized.items():
        noise += value * intent_factors[name]

    return max(0.0, min(1.0, noise))


def calculate_rand_factors(school, name, essence_normalized, intent_normalized, reach, flow):
    """
    Compute 5 deterministic pseudo-random factors in [0, 1] for a spell,
    derived from stable identity/semantic seeds:

        rand_factor_1: school + spell name
        rand_factor_2: normalized Essence vector
        rand_factor_3: normalized Intent vector
        rand_factor_4: reach + flow
        rand_factor_5: synthesis of factors 1-4
    """
    rand_factor_1 = stable_hash_to_float(
        f"{school.strip().lower()}|{name.strip().lower()}"
    )
    rand_factor_2 = stable_hash_to_float(_canonical_vector_string(essence_normalized))
    rand_factor_3 = stable_hash_to_float(_canonical_vector_string(intent_normalized))
    rand_factor_4 = stable_hash_to_float(
        f"{reach.strip().lower()}|{flow.strip().lower()}"
    )
    rand_factor_5 = stable_hash_to_float(
        f"{rand_factor_1:.8f}|{rand_factor_2:.8f}|{rand_factor_3:.8f}|{rand_factor_4:.8f}"
    )

    return {
        "rand_factor_1": rand_factor_1,
        "rand_factor_2": rand_factor_2,
        "rand_factor_3": rand_factor_3,
        "rand_factor_4": rand_factor_4,
        "rand_factor_5": rand_factor_5,
    }


def _mean_noise(sigil_params):
    """Average of the three style noise values, in [0, 1]."""
    return (
        sigil_params["vector_noise"]
        + sigil_params["angle_noise"]
        + sigil_params["position_noise"]
    ) / 3.0


def calculate_color_1(sigil_params, essence_colors):
    """Primary fill color: the dominant Essence color with small Hue drift."""
    primary_essence = sigil_params["essence_top"][0]
    base_color = essence_colors[primary_essence]
    rand_factors = sigil_params["rand_factors"]
    mean_noise = _mean_noise(sigil_params)

    hue = normalize_hue(
        base_color["h"]
        + COLOR_1_H_MAX_RANGE
        * mean_noise
        * (rand_factors["rand_factor_1"] - 0.5)
    )

    return hue, base_color["s"], base_color["l"]


def calculate_color_2(sigil_params, color_1_hsl):
    """Core glow: darker version of Color 1."""
    hue, saturation, lightness = color_1_hsl
    rand_factors = sigil_params["rand_factors"]
    mean_noise = _mean_noise(sigil_params)

    lightness = clamp(
        lightness
        - 15.0
        + COLOR_2_L_MAX_RANGE * mean_noise * (rand_factors["rand_factor_2"] - 0.5),
        0.0,
        100.0,
    )

    return hue, saturation, lightness


def calculate_color_3(sigil_params, essence_colors, color_2_hsl):
    """Aura: multi-Essence Hue with Color 2 saturation and lighter drift."""
    hue, saturation, lightness = color_2_hsl
    rand_factors = sigil_params["rand_factors"]
    mean_noise = _mean_noise(sigil_params)

    # Hue: preserve the existing deterministic multi-Essence Aura calculation.
    essence_normalized = sigil_params["essence"]
    essence_top = sigil_params["essence_top"]
    random_amplitude = COLOR_3_HUE_RANDOM_RANGE * mean_noise

    hues = []
    weights = []
    for essence_name in essence_top:
        base_hue = essence_colors[essence_name]["h"]
        semantic_weight = essence_normalized[essence_name]
        per_essence_random = stable_hash_to_float(
            f"{rand_factors['rand_factor_2']:.8f}|color_3|{essence_name}"
        )
        multiplier = 1.0 + (per_essence_random * 2.0 - 1.0) * random_amplitude
        final_weight = max(0.0, semantic_weight * multiplier)
        hues.append(base_hue)
        weights.append(final_weight)

    hue = weighted_circular_hue_mean(hues, weights)

    lightness = clamp(
        lightness
        + COLOR_3_L_MAX_RANGE * mean_noise * (rand_factors["rand_factor_3"] - 0.5),
        0.0,
        100.0,
    )

    return hue, saturation, lightness


def calculate_sigil_colors(sigil_params, essence_colors):
    """Return RGB strings for the three sigil style colors."""
    color_1_hsl = calculate_color_1(sigil_params, essence_colors)
    color_2_hsl = calculate_color_2(sigil_params, color_1_hsl)
    color_3_hsl = calculate_color_3(sigil_params, essence_colors, color_2_hsl)

    return {
        "color_1": hsl_to_rgb_string(*color_1_hsl),
        "color_2": hsl_to_rgb_string(*color_2_hsl),
        "color_3": hsl_to_rgb_string(*color_3_hsl),
    }


def normalize_score_vector(score_dict):
    """
    Normalize a dict of raw scores into a probability distribution via Softmax.

    Subtracts the max value before exponentiating for numerical stability.
    Preserves the key ordering of the input dict.
    """
    names = list(score_dict.keys())
    scores = np.array([score_dict[name] for name in names], dtype=float)

    scores = scores - scores.max()
    exp = np.exp(scores)
    normalized = exp / exp.sum()

    return {name: float(value) for name, value in zip(names, normalized)}


def calculate_normalized_entropy(probability_vector):
    """
    Compute the normalized Shannon entropy of a probability vector.

    H = -sum(p * log(p)), ignoring entries where p == 0.
    Normalized by the theoretical maximum log(N), where N is the number
    of elements. Result is clamped to [0, 1].
    """
    probabilities = np.asarray(list(probability_vector), dtype=float)
    n = probabilities.size

    if n <= 1:
        return 0.0

    nonzero = probabilities[probabilities > 0]
    entropy = -np.sum(nonzero * np.log(nonzero))

    normalized = entropy / np.log(n)

    return float(np.clip(normalized, 0.0, 1.0))


def calculate_vector_stats(probability_dict):
    """
    Compute semantic statistics for a normalized probability vector.

    Generic over any category (Essence, Intent, or future vectors).

    Returns:
        dominance: probability of the strongest concept.
        clarity: gap between the two strongest concepts.
        spread: gap between the strongest and weakest concepts.
        entropy: normalized Shannon entropy of the vector.
    """
    probabilities = np.asarray(list(probability_dict.values()), dtype=float)

    if probabilities.size == 0:
        return {
            "dominance": 0.0,
            "clarity": 0.0,
            "spread": 0.0,
            "entropy": 0.0,
        }

    sorted_probs = np.sort(probabilities)[::-1]

    dominance = float(np.clip(sorted_probs[0], 0.0, 1.0))

    if sorted_probs.size > 1:
        clarity = float(np.clip(sorted_probs[0] - sorted_probs[1], 0.0, 1.0))
    else:
        clarity = 0.0

    spread = float(np.clip(sorted_probs[0] - sorted_probs[-1], 0.0, 1.0))

    entropy = calculate_normalized_entropy(probabilities)

    return {
        "dominance": dominance,
        "clarity": clarity,
        "spread": spread,
        "entropy": entropy,
    }


def build_sigil_params(spell_embedding, symbol_profiles):
    """Build the sigil_params dict for one spell embedding."""
    essence_raw = calculate_category_scores(spell_embedding, symbol_profiles["Essence"])
    intent_raw = calculate_category_scores(spell_embedding, symbol_profiles["Intent"])
    essence_normalized = normalize_score_vector(essence_raw)
    intent_normalized = normalize_score_vector(intent_raw)
    return {
        "essence": essence_normalized,
        "intent": intent_normalized,
        "essence_stats": calculate_vector_stats(essence_normalized),
        "intent_stats": calculate_vector_stats(intent_normalized),
    }

class SigilEmbedder:
    """Loads the embedding model once and precomputes symbol embeddings for reuse."""

    def __init__(self, root_dir, model_name=DEFAULT_MODEL):
        self.model = load_embedding_model(model_name)
        self.definitions = load_symbol_definitions(root_dir)
        self.symbol_profiles = build_symbol_embedding_profiles(
            self.model, self.definitions
        )

    def compute_sigil_params(
        self, spells, essence_top_gap, intent_top_gap, noise_params
    ):
        """Return a list of sigil_params dicts for the given spells."""
        return build_spells_sigil_params(
            self.model,
            self.symbol_profiles,
            spells,
            essence_top_gap,
            intent_top_gap,
            noise_params,
        )
