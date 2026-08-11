-- Seed the 18 friend-role communities.
--
-- app/core/ai/archetypes.py moved the generator from the 24 LEGACY_ARCHETYPES
-- to 18 FRIEND_ROLES, but `communities` was never seeded with the new slugs.
-- The two sets are completely disjoint, so EVERY successful generation then
-- died at assign_user_to_community with
--   ForeignKeyViolationError: community_members.archetype_slug -> communities
-- after the (paid) model calls had already run -- the submission landed in
-- 'error' with a perfectly good summary thrown away.
--
-- The legacy 24 rows stay: existing community_members rows reference them, and
-- dropping them would cascade into real memberships.

INSERT INTO communities (archetype_slug, name, description) VALUES
    ('initiator', 'the initiator', 'keeps connection alive by starting contact, checking in, and reopening a thread'),
    ('planner', 'the planner', 'turns a vague intention into a time, place, and workable backup'),
    ('host', 'the host', 'makes arrival easier, notices who is outside the circle, and gives a room a shape'),
    ('hype_friend', 'the hype friend', 'starts the bit, lifts the pace, and gets a stuck or quiet group moving'),
    ('wit', 'the wit', 'builds closeness through callbacks, playful nonsense, and shared weirdness'),
    ('conversationalist', 'the conversationalist', 'follows an idea past surface exchange until it becomes personal'),
    ('listener', 'the listener', 'asks or leaves the opening that makes people tell the version they usually skip'),
    ('observer', 'the observer', 'notices changes in tone and adjusts timing, directness, or care'),
    ('challenger', 'the challenger', 'uses honest difference as a route into closeness when both people stay curious'),
    ('straight_shooter', 'the straight shooter', 'prefers one clear difficult sentence to prolonged ambiguity'),
    ('rememberer', 'the rememberer', 'stores small specifics and brings them back when they matter'),
    ('fixer', 'the fixer', 'becomes useful when life is inconvenient and stays through the unglamorous part'),
    ('companion', 'the companion', 'makes closeness possible without filling every silence or solving every problem'),
    ('confidant', 'the confidant', 'opens most when the social surface area is low enough for real attention'),
    ('constant', 'the constant', 'lets trust compound slowly without requiring constant contact to keep a bond real'),
    ('explorer', 'the explorer', 'uses an unplanned detour, place, or shared discovery to make a bond feel alive'),
    ('teammate', 'the teammate', 'connects shoulder-to-shoulder around a task, game, or movement'),
    ('connector', 'the connector', 'moves between social worlds and helps people with different defaults find common ground')
ON CONFLICT (archetype_slug) DO NOTHING;
