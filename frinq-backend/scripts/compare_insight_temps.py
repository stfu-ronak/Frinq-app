"""Run the same fixture answer set through generate_insights at 3 temperatures.

Usage:
    ANTHROPIC_API_KEY=sk-... python -m scripts.compare_insight_temps

Prints each run's archetype, headline, share_quote, and first insight side-by-side
so you can eyeball which temp produces the least generic output.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from typing import Any

# Allow running as a script from the repo root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.ai import insights as insights_mod
from app.core.ai.claude_client import CLAUDE_SONNET, call_with_cache
from app.core.ai import prompts


FIXTURE: dict[str, Any] = {
    "name": "Ronak",
    "phone": "+91 98765 43210",
    "city": "bangalore",
    "dob": "12/03/1996",
    "social_type": "selective",
    "saturday": "dinner",
    "scene": ["weed", "occasional"],
    "hobbies": "i collect vintage postcards from flea markets and play chess against my dad over whatsapp every morning",
    "interests": ["urban planning", "old hindi cinema", "long walks at dusk", "secondhand bookstores"],
    "connection": ["counter", "weird"],
    "trip": "backup",
    "show_up": "i remember things people said three weeks ago and bring them up like no time passed",
    "red_flags": ["low effort", "performative", "one-uppers"],
    "rapid": [
        "word is bond", "take time to process", "deep 2 am talks", "home late",
        "mountain person", "i make the plans", "pick up where we left off",
        "deeper into my own", "hiking with strangers",
    ],
    "opinions": ["humans can't be replaced", "empathy > bitter truth", "people who live in the moment"],
    "opinions_why": [
        "ai writes coherent sentences but it can't sit in awkward silence with you",
        "you can be honest without making someone bleed for it",
        "i admire people who can be present without an exit plan",
    ],
    "preferences": [78, 65, 35],
    "story": "met my closest friend in a queue at blossom book house, we both reached for the same used copy of murakami. didn't speak. saw each other there 4 more times before either of us said hi.",
    "looking_for": "people who can sit through a quiet pause without filling it. not the loudest in the room. someone who notices when you've gone quiet and lets you stay there.",
    "linkedin_url": "linkedin.com/in/ronakpruthi-engineer",
    "instagram": "@ronakp.shots",
    "social_verified": "verified",
}


async def _run_one(temp: float) -> dict[str, Any]:
    user_prompt = insights_mod._build_insights_prompt(FIXTURE)
    raw = await call_with_cache(
        system=prompts.INSIGHTS_SYSTEM,
        user=user_prompt,
        model=CLAUDE_SONNET,
        temperature=temp,
        max_tokens=2400,
    )
    return json.loads(insights_mod._strip_fences(raw))


async def main() -> None:
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("ERROR: set ANTHROPIC_API_KEY in env before running")
        sys.exit(1)

    print("Running same fixture at 3 temperatures (sequential so cache benefits roll forward)...")
    print()
    results: dict[float, dict[str, Any]] = {}
    for t in (0.7, 0.85, 0.95):
        print(f"--- temp = {t} ---")
        try:
            data = await _run_one(t)
        except Exception as exc:
            print(f"  FAILED: {exc!r}")
            continue
        results[t] = data
        print(f"  archetype     : {data.get('archetype')}")
        print(f"  archetype_desc: {data.get('archetype_desc')}")
        print(f"  headline      : {data.get('headline')}")
        print(f"  share_quote   : {data.get('share_quote')}")
        print(f"  tags          : {data.get('tags')}")
        if data.get("insights"):
            first = data["insights"][0]
            print(f"  insight #1    : [{first.get('label')}] {first.get('text')}")
        print()

    print("Compare these by eye for: surprise (is the archetype obvious?), specificity")
    print("(does it quote actual answers?), and the share_quote screenshot test")
    print("(would you Instagram-story this verbatim?).")


if __name__ == "__main__":
    asyncio.run(main())
