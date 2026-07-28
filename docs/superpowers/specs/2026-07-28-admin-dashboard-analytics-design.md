# Admin Dashboard Redesign + Analytics/Observability — Design

## Context

The admin panel (Phases 1-4, already shipped) is functionally complete but visually plain —
bordered cards/tables in the frinq cream/brown palette, with real charts only on the Analytics
tab (hand-rolled inline SVG: `BarChart`, `DailyChart`, `HourChart`, `FunnelChart` in
`frinq-admin/app/page.tsx`, no charting library dependency). This design covers making every tab
look and feel like a proper dashboard, adding more charts, adding sort/filter to existing lists,
and a basic system-health panel — without changing the frinq branding, fonts, or the horizontal
top-nav (confirmed: no sidebar).

## Scope (confirmed with user)

- Keep frinq cream/brown branding + fonts exactly as-is.
- Keep the horizontal top-nav (`AdminShell.tsx`'s `NAV_ITEMS` row) — not a sidebar.
- Extend the existing hand-rolled SVG chart approach — no new charting library.
- Sort/filter controls added **per existing list** (Users tab, Chat browser), not a single shared
  cross-tab component.
- System health = **live check on page load** (is the API responding, is the ARQ worker alive and
  processing, is Redis/DB reachable) — not historical uptime-percentage tracking. No new
  recurring background job, no new time-series table. If historical uptime tracking is wanted
  later, that's a separate, bigger follow-up (needs a scheduled health-check job + storage).

## New charts, per tab

- **Community/Chat** (new): messages-per-day trend per community (reuses `messages` table +
  its existing `idx_messages_archetype_slug_desc` index — no schema change), most-active
  communities by message count, report volume over time (from `moderation_reports`).
- **Users** (extend existing Analytics tab): today's daily/hourly/funnel charts stay; add a
  retention-style view — active vs. dormant users over the last 30 days (active = has an
  `onboarding_state='active'` session/action in the window).
- **Events** (once Phase 5 ships): open-vs-expired event counts and creation trend only — Phase
  5's confirmed scope has **no in-app RSVP/signup tracking** (external form link only), so no
  signup-count chart is possible here. Flagged explicitly so Phase 5 and this design don't
  silently contradict each other.
- **Model Config** (extend existing usage view): add a daily-spend trend line from
  `ai_usage_log` (`GROUP BY date_trunc('day', created_at)`) alongside the existing
  totals/by-model/recent-calls sections — no new table.

## Sort/filter additions

- **Users tab**: sort dropdown (newest / oldest / alphabetical by name) added to the existing
  filter row (`admin.py`'s `list_submissions` already accepts `search`; add `sort` query param —
  `created_at desc` (default) / `created_at asc` / `answers->>'name' asc`).
- **Chat browser**: sort dropdown (newest / oldest) on the message list — `admin.py`'s
  `GET /admin/communities/{slug}/messages` already orders `id DESC`; add a `sort` param mirroring
  the above, keeping the existing `before_id` cursor pagination compatible with both directions.
- Both are query-param driven (no new component), matching each tab's existing per-tab
  filter-row pattern (`ChatBrowserView.tsx`'s community picker + refresh button row).

## System health panel

New **Status** section (part of an existing tab, likely folded into the top-level nav as its own
small tab, or a compact strip inside the existing Analytics tab — final placement decided during
implementation planning) showing, refreshed on load / manual refresh button:

- **API**: the admin frontend's own `adminFetch` call to a new lightweight `GET /admin/health`
  endpoint — round-trip latency + 200 status = "up".
- **Database**: `GET /admin/health` internally does a trivial `SELECT 1` against the pool —
  reachable/not, with latency.
- **ARQ worker**: `GET /admin/health` checks Redis directly (already a dependency) for the ARQ
  worker's own heartbeat key (ARQ writes a `worker:health-check` key on a timer) — freshness of
  that key indicates the worker is alive and looping, not just that Redis itself is reachable.
- Each of the three renders as a simple green/red status chip + latency number — no chart, no
  history, matches the "live check on load" scope decision above.

## Testing

- Backend: unit test for the sort-param branches on `list_submissions` and the community
  messages endpoint (each sort value produces the expected `ORDER BY`), a test for
  `GET /admin/health`'s three checks (mock a down Redis/DB and confirm the endpoint reports it
  rather than throwing 500).
- Admin: manual click-through per tab (no existing test suite for `frinq-admin`, consistent with
  prior phases).

## Out of scope

- Historical uptime percentage / time-series health tracking (would need a new scheduled job +
  storage table — bigger follow-up if wanted later).
- Tracking AI providers' (OpenAI/Anthropic) own status pages or latency separately from what
  `ai_usage_log` already captures.
- A shared cross-tab search/filter component (each tab keeps its own, matching existing
  per-tab patterns).
- A sidebar navigation redesign (horizontal top-nav stays).
- Any new charting library dependency.
