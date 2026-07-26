"""The insights validation set and the canonical archetype taxonomy must
never drift. When they did (insights offered "Glass House"; canonical had
"Quiet Anchor"), a matching user passed _validate — spending paid AI calls —
then dead-ended in onboarding_state='error' at get_archetype().
"""
from __future__ import annotations

from app.core.ai.archetypes import ARCHETYPES as CANONICAL
from app.core.ai.archetypes import get_archetype
from app.core.ai.insights import ARCHETYPES, _slugify


def test_every_validated_name_maps_to_a_canonical_archetype():
    # Anything _validate accepts must slugify to a real, assignable archetype —
    # otherwise the worker's get_archetype() lookup fails and the user is stuck.
    for name in ARCHETYPES:
        assert get_archetype(_slugify(name)) is not None, name


def test_canonical_names_slugify_to_their_own_slug():
    for slug, entry in CANONICAL.items():
        assert _slugify(entry["name"]) == slug, (entry["name"], slug)
