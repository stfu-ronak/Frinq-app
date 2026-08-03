"""Two independent invariants:

1. Legacy (pre-2026-07-31) taxonomy: the insights.py validation set and the
   legacy archetype dict must never drift. When they did once (insights
   offered "Glass House"; canonical had "Quiet Anchor"), a matching user
   passed _validate — spending paid AI calls — then dead-ended in
   onboarding_state='error' at get_archetype().
2. Current (18-role) taxonomy: slugs are literal snake_case ids embedded in
   the LLM schema directly (no slugify derivation step — see
   page2_summary.py), so the invariant here is just "well-formed and
   resolvable", not "slugifies back to itself".
"""
from __future__ import annotations

import re

from app.core.ai.archetypes import ARCHETYPES, get_archetype
from app.core.ai.archetypes_legacy import LEGACY_ARCHETYPES
from app.core.ai.insights import ARCHETYPES as INSIGHTS_VALIDATED_NAMES, _slugify


def test_every_insights_validated_name_maps_to_a_legacy_archetype():
    # Anything _validate accepts must slugify to a real, assignable legacy
    # archetype — otherwise the worker's get_archetype() lookup fails and
    # the user is stuck. (insights.py's prompt still describes the legacy
    # 24-entry taxonomy — see its module docstring.)
    for name in INSIGHTS_VALIDATED_NAMES:
        assert get_archetype(_slugify(name)) is not None, name


def test_legacy_names_slugify_to_their_own_slug():
    for slug, entry in LEGACY_ARCHETYPES.items():
        assert _slugify(entry["name"]) == slug, (entry["name"], slug)


def test_current_taxonomy_has_eighteen_snake_case_slugs():
    assert len(ARCHETYPES) == 18
    for slug in ARCHETYPES:
        assert re.fullmatch(r"[a-z_]+", slug), slug


def test_current_taxonomy_round_trips_through_get_archetype():
    for slug, entry in ARCHETYPES.items():
        assert get_archetype(slug) == entry


def test_legacy_and_current_slugs_are_disjoint():
    # New snake_case ids (e.g. "hype_friend") can never collide with old
    # kebab-case ones (e.g. "quiet-anchor") — confirms get_archetype's
    # dual-dict lookup can never return the wrong taxonomy's entry.
    assert set(ARCHETYPES) & set(LEGACY_ARCHETYPES) == set()
