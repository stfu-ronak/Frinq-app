-- user_blocks has PRIMARY KEY (blocker_user_id, blocked_user_id), which only
-- indexes blocker_user_id as a leading column. Two hot paths look the block up
-- bidirectionally and so cannot use the PK for the blocked_user_id side:
--
--   app/api/v1/communities.py  -- WHERE blocker_user_id = $1 OR blocked_user_id = $1
--   app/core/realtime.py       -- same OR-shape, evaluated on every chat publish
--
-- Without this index the blocked_user_id half of each OR falls back to a
-- sequential scan, on a table that grows with every block created.
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked
    ON user_blocks (blocked_user_id);
