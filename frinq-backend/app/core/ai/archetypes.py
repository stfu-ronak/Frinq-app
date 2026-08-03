"""Master archetype ("friend role") taxonomy — the 18-role set from
app.core.ai.page2_prompts.FRIEND_ROLES, the single source of truth (the
LLM prompt embeds this content directly, so this module is a thin
re-export rather than a second hand-authored copy that could drift).

The old 24-entry illustrated taxonomy lives in app.core.ai.archetypes_legacy
as LEGACY_ARCHETYPES — get_archetype() checks both, so a completion made
before this taxonomy swapped over keeps resolving on any page/endpoint that
looks up its archetype_slug. Community assignment is permanent (see
app/core/communities.py), so existing users' old-taxonomy community rows
stay untouched and still need their slug to resolve.
"""

from __future__ import annotations

from typing import TypedDict

from app.core.ai.archetypes_legacy import LEGACY_ARCHETYPES
from app.core.ai.page2_prompts import FRIEND_ROLES


class Archetype(TypedDict):
    slug: str
    display_name: str
    meaning: str
    strong_evidence: str
    boundary: str


ARCHETYPES: dict[str, Archetype] = {role["slug"]: role for role in FRIEND_ROLES}


def get_archetype(slug: str) -> Archetype | dict | None:
    return ARCHETYPES.get(slug) or LEGACY_ARCHETYPES.get(slug)


def archetype_slugs() -> list[str]:
    return list(ARCHETYPES.keys())


def archetype_names() -> list[str]:
    return [a["display_name"] for a in ARCHETYPES.values()]
