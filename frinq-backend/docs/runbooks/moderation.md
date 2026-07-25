# Moderation Runbook

## Staffing policy (Task 46 Step 5's explicit requirement)

**Set a moderation review target before public chat launches, and staff to
it.** If no trained moderator is available at any point after launch —
illness, the owner is unreachable, whatever — the correct action is
flipping `CHAT_DISABLED` (see `docs/runbooks/incident-response.md`) rather
than leaving the report queue to grow unattended. An unmoderated public
chat with open reports nobody is looking at is a worse outcome than chat
being temporarily unavailable.

This is a single-owner project today — there is no separate trained
moderator distinct from the owner. Until that changes, "staffed" means the
owner personally checks the open-report queue on a fixed cadence (propose:
daily, tightened to multiple-times-daily if `moderation_reports_open`
trends upward — see the metric in `app/core/metrics.py`). If the owner
can't sustain that cadence for a period, disable chat rather than let
reports sit open indefinitely.

## Checking the queue

`GET /api/v1/admin/reports?status=open` (bearer admin auth — see
`app/api/v1/admin.py`'s `list_reports`). Filters:
- `status`: `open` (default) | `resolved` | `dismissed`
- `reason`: optional, matches `message_reports.reason`
- `limit`/`offset`: pagination, default 50/page, max 200

`GET /health/metrics` (also admin-protected) exposes
`moderation_reports_open` as a live gauge — the queue depth without paging
through the admin API.

## Working a report

Each open report references a specific message + reporter
(`message_reports` table, `migrations/012_communities_and_chat.sql`).
Actions available via `app/api/v1/admin.py`, each recorded in
`moderation_actions` (actor/target/reason/action, `migrations/
014_admin_moderation.sql`) — this table is the permanent audit trail, not
just the request logs:
- **Resolve, no action** — the report was reviewed and didn't warrant one.
- **Delete message** — removes the specific message; the author isn't
  otherwise sanctioned.
- **Suspend user** (`POST /users/{id}/suspend`) — time-boxed; the account
  can't authenticate new sessions/reconnect chat until it expires
  (`app/api/deps.py`'s `get_current_account` checks `suspended_until`).
  Publishes a ban-control event that force-closes any live WebSocket
  connection immediately (`publish_ban_event`, `app/core/realtime.py`) —
  the user is disconnected the instant the action is taken, not on their
  next reconnect attempt.
- **Ban user** (`POST /users/{id}/ban`) — permanent; same immediate
  force-disconnect behavior.

Every action requires the second-factor `X-Action-Password` header
(`_require_action_password` in `admin.py`) in addition to the admin bearer
key — destructive moderation actions are never one credential away from a
mistake or a single leaked key.

## Community rules and reasons

`message_reports.reason` is a fixed enum, not free text (see the schema) —
this keeps the report queue triageable without reading every report's full
context first. Cross-reference `frinq-frontend/app/community-rules/` (the
public-facing rules page) when deciding whether a report warrants action —
the DRAFT-marked placeholder content there is what a user actually agreed
to; don't enforce a stricter standard than what's published.

## When the queue is growing faster than it's being worked

1. Check `moderation_reports_open`'s trend, not just its current value —
   a single burst (e.g. one bad actor reported by several people) is
   different from a sustained backlog.
2. If sustained and no moderator capacity is coming online soon, flip
   `CHAT_DISABLED` (incident-response.md) rather than let it grow further.
3. Once staffed again, clear the backlog before re-enabling chat — flipping
   `CHAT_DISABLED` back off with a large unworked backlog just repeats the
   same problem.
