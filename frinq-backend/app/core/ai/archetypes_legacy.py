"""Legacy (pre-2026-07-31) archetype taxonomy for frinq's vibe-audit summary
card. Superseded by the 18-role "friend type" taxonomy in
app.core.ai.page2_prompts / app.core.ai.archetypes for new completions —
kept verbatim so existing users' already-completed summaries keep
resolving (archetypes.get_archetype checks both dicts) and so admin's
/ai-test step="insights"/"deep_report" (which still prompts for these
exact 24 names via prompts.py) keeps validating against the taxonomy its
own prompt actually describes.

Each entry has:
- slug:        kebab-case id used for asset filenames and DB
- name:        title-case display name (e.g. "Quiet Anchor")
- nickname:    casual label (e.g. "the quiet one")
- description: 2-3 sentence "social species" description (Claude personalises further)
- group_role:  enum from GROUP_ROLES — which role this archetype tends to play
- secret_edge: 1-word default — Claude can override based on quiz answers
- energy_range: (min, max) for SOCIAL ENERGY stat — Claude picks a number in range
- rarity_base: 0-100 % rarity baseline (lower = rarer, used for "Top X%" line)
- clicks_with: 3 archetype slugs this person tends to vibe with
- clashes_with: 3 archetype slugs this person tends to clash with
- illustration_prompt: pollinations.ai FLUX prompt for the duck illustration

The illustration_prompt is appended to a shared STYLE_PREFIX so every duck
shares the same visual language (sketchy ink, brand colors, white bg).
"""

from __future__ import annotations
from typing import TypedDict


GROUP_ROLES: tuple[str, ...] = (
    "The Glue",        # holds groups together, low ego
    "The Spark",       # starts the energy
    "The Anchor",      # steady, dependable presence
    "The Compass",     # guides direction, has opinions
    "The Bridge",      # connects subgroups, translates
    "The Witness",     # observes, doesn't perform
    "The Catalyst",    # changes what happens when they arrive
    "The Sanctuary",   # safe place people return to
)


STYLE_PREFIX: str = (
    "hand-drawn ink illustration, single cartoon duck character, "
    "burnt-red and brown ink lines on warm cream paper background, "
    "loose sketchy linework with crosshatching shading, "
    "radiating energy lines, comic-book sketch style, "
    "expressive cartoon eyes, orange beak and feet, "
    "minimalist composition, white space, no text, no border"
)


class LegacyArchetype(TypedDict):
    slug: str
    name: str
    nickname: str
    description: str
    group_role: str
    secret_edge: str
    energy_range: tuple[int, int]
    rarity_base: int  # smaller = rarer (1-15)
    clicks_with: tuple[str, str, str]
    clashes_with: tuple[str, str, str]
    illustration: str  # short pose description appended to STYLE_PREFIX


LEGACY_ARCHETYPES: dict[str, LegacyArchetype] = {
    "quiet-anchor": {
        "slug": "quiet-anchor",
        "name": "Quiet Anchor",
        "nickname": "the quiet one",
        "description": "a rare social species found holding groups together without ever asking for credit. powered by genuine curiosity and an unsettling ability to remember small things people said weeks ago.",
        "group_role": "The Glue",
        "secret_edge": "Presence",
        "energy_range": (55, 75),
        "rarity_base": 7,
        "clicks_with": ("late-night-mind", "tender-realist", "patient-witness"),
        "clashes_with": ("wild-card", "salt-air", "open-hand"),
        "illustration": "standing tall with arms crossed, confident calm expression, looking slightly off-camera, radiating quiet authority",
    },
    "quiet-storm": {
        "slug": "quiet-storm",
        "name": "Quiet Storm",
        "nickname": "the still water",
        "description": "intense interior, calm exterior. doesn't speak much but doesn't miss a thing. when they finally say something, the room rearranges itself around it.",
        "group_role": "The Witness",
        "secret_edge": "Depth",
        "energy_range": (40, 65),
        "rarity_base": 6,
        "clicks_with": ("tender-realist", "late-night-mind", "soft-skeptic"),
        "clashes_with": ("salt-air", "open-hand", "backup-plan"),
        "illustration": "sitting cross-legged, eyes closed in deep thought, faint storm clouds and lightning sketched in background",
    },
    "soft-anchor": {
        "slug": "soft-anchor",
        "name": "Soft Anchor",
        "nickname": "the steady one",
        "description": "holds people without making a show of it. the one in the group chat who actually replies, remembers the dentist appointment, shows up early to set chairs out.",
        "group_role": "The Anchor",
        "secret_edge": "Reliability",
        "energy_range": (55, 75),
        "rarity_base": 9,
        "clicks_with": ("steady-flame", "tender-realist", "open-hand"),
        "clashes_with": ("wild-card", "velvet-rebel", "quiet-rioter"),
        "illustration": "standing solid like an oak, holding a steaming cup of chai, gentle smile, small leaves swirling gently around feet",
    },
    "velvet-rebel": {
        "slug": "velvet-rebel",
        "name": "Velvet Rebel",
        "nickname": "the polite no",
        "description": "defies softly, never loudly. politely declines the group dinner to do exactly what they wanted instead. polite refusal as their love language.",
        "group_role": "The Compass",
        "secret_edge": "Conviction",
        "energy_range": (50, 75),
        "rarity_base": 8,
        "clicks_with": ("quiet-rioter", "soft-skeptic", "tender-realist"),
        "clashes_with": ("backup-plan", "open-hand", "steady-flame"),
        "illustration": "tipping a top hat at the viewer with a knowing smirk, one wing in pocket, casually walking away",
    },
    "curious-outsider": {
        "slug": "curious-outsider",
        "name": "Curious Outsider",
        "nickname": "the watcher",
        "description": "observes first, then engages on their own terms. the kind who walks into a party and reads the bookshelf before talking to anyone. doesn't need to be the center, prefers the corner.",
        "group_role": "The Witness",
        "secret_edge": "Curiosity",
        "energy_range": (35, 60),
        "rarity_base": 10,
        "clicks_with": ("pocket-universe", "hidden-door", "late-night-mind"),
        "clashes_with": ("salt-air", "wild-card", "spark"),
        "illustration": "peeking around a tall stack of books with wide curious eyes, magnifying glass in one wing",
    },
    "late-night-mind": {
        "slug": "late-night-mind",
        "name": "Late-Night Mind",
        "nickname": "the 2am philosopher",
        "description": "turns on after dark. boring at brunch, dangerous at midnight. their best conversations happen when everyone else is on their second wind or first existential crisis.",
        "group_role": "The Catalyst",
        "secret_edge": "Range",
        "energy_range": (45, 70),
        "rarity_base": 11,
        "clicks_with": ("quiet-storm", "pocket-universe", "sharp-empath"),
        "clashes_with": ("backup-plan", "steady-flame", "open-hand"),
        "illustration": "sitting on a rooftop under a crescent moon, hot tea in hand, stars and constellations sketched above",
    },
    "slow-burn": {
        "slug": "slow-burn",
        "name": "Slow Burn",
        "nickname": "the long fuse",
        "description": "takes a while to open, then doesn't close. you'll know them six months and barely know them, then suddenly know everything. friendship with a delayed payoff that's worth waiting for.",
        "group_role": "The Sanctuary",
        "secret_edge": "Patience",
        "energy_range": (40, 60),
        "rarity_base": 9,
        "clicks_with": ("patient-witness", "tender-realist", "inside-voice"),
        "clashes_with": ("wild-card", "spark", "salt-air"),
        "illustration": "tending a small ember in cupped wings, sparks rising slowly, peaceful absorbed expression",
    },
    "backup-plan": {
        "slug": "backup-plan",
        "name": "Backup Plan",
        "nickname": "the one who fixes it",
        "description": "the friend everyone calls when the original plan falls through. not anxiety — just a person who needs the anticipation as much as the event. their phone has 12 contingency restaurants saved.",
        "group_role": "The Glue",
        "secret_edge": "Foresight",
        "energy_range": (60, 80),
        "rarity_base": 11,
        "clicks_with": ("soft-anchor", "steady-flame", "compass"),
        "clashes_with": ("velvet-rebel", "quiet-rioter", "wild-card"),
        "illustration": "holding three different maps fanned out, alert and ready, small briefcase at feet labelled with a sketched lightning bolt",
    },
    "open-window": {
        "slug": "open-window",
        "name": "Open Window",
        "nickname": "the easy hello",
        "description": "curious, lets things in without losing themselves. talks to strangers in queues, learns one new word a week, never feels foreign in a new city for very long.",
        "group_role": "The Bridge",
        "secret_edge": "Openness",
        "energy_range": (65, 85),
        "rarity_base": 13,
        "clicks_with": ("wandering-compass", "salt-air", "bridge-person"),
        "clashes_with": ("pocket-universe", "inside-voice", "soft-skeptic"),
        "illustration": "leaning out of an open window with a curious tilt, wind ruffling feathers, small bird companion landing on sill",
    },
    "steady-flame": {
        "slug": "steady-flame",
        "name": "Steady Flame",
        "nickname": "the warm one",
        "description": "warm and predictable in the best way. the friend you call when you don't want surprise. shows up on the same day, asks about the same things, doesn't ghost when life gets weird.",
        "group_role": "The Sanctuary",
        "secret_edge": "Warmth",
        "energy_range": (55, 75),
        "rarity_base": 10,
        "clicks_with": ("soft-anchor", "open-hand", "tender-realist"),
        "clashes_with": ("wild-card", "velvet-rebel", "quiet-rioter"),
        "illustration": "sitting beside a small steady campfire, hands outstretched to warm them, soft glow on face",
    },
    "wild-card": {
        "slug": "wild-card",
        "name": "Wild Card",
        "nickname": "the never-same-twice",
        "description": "never the same energy twice. one day quiet, next day chaos. the friend whose stories all start 'so this was random'. proof that you don't have to be consistent to be loved.",
        "group_role": "The Spark",
        "secret_edge": "Range",
        "energy_range": (50, 90),
        "rarity_base": 9,
        "clicks_with": ("salt-air", "spark", "wandering-compass"),
        "clashes_with": ("steady-flame", "soft-anchor", "backup-plan"),
        "illustration": "mid-leap with one wing waving wildly, fireworks and confetti exploding around, no two feathers the same color",
    },
    "soft-skeptic": {
        "slug": "soft-skeptic",
        "name": "Soft Skeptic",
        "nickname": "the kind doubter",
        "description": "kind but doesn't buy it. asks 'wait, really?' more than anyone you know. their compliments mean more because they mean what they say.",
        "group_role": "The Compass",
        "secret_edge": "Discernment",
        "energy_range": (45, 65),
        "rarity_base": 8,
        "clicks_with": ("velvet-rebel", "tender-realist", "sharp-empath"),
        "clashes_with": ("open-hand", "open-window", "salt-air"),
        "illustration": "raising one eyebrow with a knowing half-smile, holding a tiny magnifying glass up to one eye",
    },
    "bridge-person": {
        "slug": "bridge-person",
        "name": "Bridge Person",
        "nickname": "the translator",
        "description": "translates between scenes and groups. friends from college still text them about friends from work. lives in the in-between and somehow it's the most stable spot.",
        "group_role": "The Bridge",
        "secret_edge": "Empathy",
        "energy_range": (60, 80),
        "rarity_base": 10,
        "clicks_with": ("open-window", "open-hand", "wandering-compass"),
        "clashes_with": ("pocket-universe", "quiet-storm", "soft-skeptic"),
        "illustration": "standing on a sketched rope bridge between two tiny worlds, gesturing welcomingly to both sides",
    },
    "inside-voice": {
        "slug": "inside-voice",
        "name": "Inside Voice",
        "nickname": "the small-room king",
        "description": "speaks the loudest in the smallest rooms. quiet at parties, unstoppable at 2am with one friend. their best conversations happen one-on-one in a corner.",
        "group_role": "The Witness",
        "secret_edge": "Depth",
        "energy_range": (35, 55),
        "rarity_base": 8,
        "clicks_with": ("late-night-mind", "patient-witness", "pocket-universe"),
        "clashes_with": ("salt-air", "wild-card", "spark"),
        "illustration": "leaning in close in soft lamp-lit corner, whispering animatedly, one wing on chest",
    },
    "sharp-empath": {
        "slug": "sharp-empath",
        "name": "Sharp Empath",
        "nickname": "the mirror",
        "description": "feels everything, calls it cleanly. the friend who tells you 'you're not actually mad about the dishes' and means it gently. emotional radar set to high resolution.",
        "group_role": "The Compass",
        "secret_edge": "Insight",
        "energy_range": (55, 75),
        "rarity_base": 7,
        "clicks_with": ("tender-realist", "late-night-mind", "soft-skeptic"),
        "clashes_with": ("salt-air", "wild-card", "backup-plan"),
        "illustration": "holding up a small hand mirror toward the viewer with kind direct eyes, soft ripples around",
    },
    "patient-witness": {
        "slug": "patient-witness",
        "name": "Patient Witness",
        "nickname": "the steady listener",
        "description": "present without needing the floor. you can talk for an hour and they won't make it about themselves. then they'll say one thing that reframes everything.",
        "group_role": "The Sanctuary",
        "secret_edge": "Stillness",
        "energy_range": (40, 60),
        "rarity_base": 7,
        "clicks_with": ("slow-burn", "tender-realist", "quiet-storm"),
        "clashes_with": ("wild-card", "spark", "backup-plan"),
        "illustration": "sitting still on a small rock by a calm lake, head tilted attentively, ripples spreading outward",
    },
    "quiet-rioter": {
        "slug": "quiet-rioter",
        "name": "Quiet Rioter",
        "nickname": "the gentle rebel",
        "description": "refuses the script, doesn't write a manifesto about it. left the job that was killing them without making it a tweet thread. quietly does the thing everyone else is loud about not doing.",
        "group_role": "The Compass",
        "secret_edge": "Conviction",
        "energy_range": (55, 75),
        "rarity_base": 6,
        "clicks_with": ("velvet-rebel", "soft-skeptic", "tender-realist"),
        "clashes_with": ("backup-plan", "steady-flame", "open-hand"),
        "illustration": "holding a tiny protest sign that just reads 'no thanks', calm half-smile, walking past chaos in background",
    },
    "wandering-compass": {
        "slug": "wandering-compass",
        "name": "Wandering Compass",
        "nickname": "the soft drifter",
        "description": "drawn outward, knows the way back. takes solo trips and comes back somehow more grounded. has friends in cities they've only spent two days in.",
        "group_role": "The Bridge",
        "secret_edge": "Curiosity",
        "energy_range": (55, 75),
        "rarity_base": 11,
        "clicks_with": ("open-window", "bridge-person", "wild-card"),
        "clashes_with": ("inside-voice", "soft-anchor", "steady-flame"),
        "illustration": "walking a winding path with a small backpack, a compass-shaped pendant around neck pointing inward",
    },
    "tender-realist": {
        "slug": "tender-realist",
        "name": "Tender Realist",
        "nickname": "the soft truth",
        "description": "soft mouth, clear eyes. won't sugarcoat but won't be cruel. the friend whose advice you ask for when you actually want to know what's happening.",
        "group_role": "The Compass",
        "secret_edge": "Honesty",
        "energy_range": (50, 70),
        "rarity_base": 6,
        "clicks_with": ("sharp-empath", "soft-skeptic", "patient-witness"),
        "clashes_with": ("open-hand", "salt-air", "wild-card"),
        "illustration": "handing the viewer a small folded note with a tender expression, one wing on the viewer's shoulder",
    },
    "long-fuse": {
        "slug": "long-fuse",
        "name": "Long Fuse",
        "nickname": "the slow spark",
        "description": "slow to spark, deep when it does. cool to most things, electric about the three things that matter. patient with people, intolerant of waste.",
        "group_role": "The Witness",
        "secret_edge": "Focus",
        "energy_range": (40, 65),
        "rarity_base": 9,
        "clicks_with": ("slow-burn", "patient-witness", "quiet-storm"),
        "clashes_with": ("wild-card", "spark", "salt-air"),
        "illustration": "lighting a long curling fuse with a calm match, slight smile, watching the spark travel slowly",
    },
    "salt-air": {
        "slug": "salt-air",
        "name": "Salt Air",
        "nickname": "the refresher",
        "description": "light to be around, refreshing on contact. the friend you call when you've been too serious for too long. effortlessly fun without being shallow.",
        "group_role": "The Spark",
        "secret_edge": "Levity",
        "energy_range": (70, 90),
        "rarity_base": 12,
        "clicks_with": ("wild-card", "open-window", "spark"),
        "clashes_with": ("quiet-storm", "inside-voice", "soft-skeptic"),
        "illustration": "splashing playfully in a small wave, big joyful smile, seagulls and salt spray sketched around",
    },
    "pocket-universe": {
        "slug": "pocket-universe",
        "name": "Pocket Universe",
        "nickname": "the inner world",
        "description": "rich interior nobody fully sees. their hobbies are weird in the best way — collecting old maps, knowing every bus route, learning a language only for the menus. you only get a tour if you earn it.",
        "group_role": "The Sanctuary",
        "secret_edge": "Depth",
        "energy_range": (35, 55),
        "rarity_base": 5,
        "clicks_with": ("hidden-door", "late-night-mind", "curious-outsider"),
        "clashes_with": ("salt-air", "wild-card", "open-window"),
        "illustration": "cross-legged inside a sketched bubble containing tiny planets and constellations, peaceful curious expression",
    },
    "open-hand": {
        "slug": "open-hand",
        "name": "Open Hand",
        "nickname": "the giver",
        "description": "gives first, easily, without keeping score. drops you home even when it's the long way. asks how the thing went without you having to remind them what the thing was.",
        "group_role": "The Sanctuary",
        "secret_edge": "Generosity",
        "energy_range": (65, 85),
        "rarity_base": 10,
        "clicks_with": ("steady-flame", "soft-anchor", "bridge-person"),
        "clashes_with": ("soft-skeptic", "velvet-rebel", "quiet-rioter"),
        "illustration": "extending one wing forward palm-up offering a small wrapped gift, warm direct smile",
    },
    "hidden-door": {
        "slug": "hidden-door",
        "name": "Hidden Door",
        "nickname": "the secret room",
        "description": "you have to know how to find them, then everything opens. quiet on the surface, an entire life underneath. the rarest kind of person to be friends with — and the hardest to lose.",
        "group_role": "The Sanctuary",
        "secret_edge": "Mystery",
        "energy_range": (40, 60),
        "rarity_base": 4,
        "clicks_with": ("pocket-universe", "curious-outsider", "quiet-storm"),
        "clashes_with": ("salt-air", "open-window", "spark"),
        "illustration": "standing beside a small ornate door set into a wall of vines, holding an old brass key, mysterious half-smile",
    },
}
