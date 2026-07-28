# Admin Dashboard Redesign + Analytics/Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add sort/filter to the Users and Chat browser lists, add a live system-health panel, and add a handful of new charts (community/chat activity, user retention, model-config spend trend) — all within the existing frinq branding, horizontal top-nav, and hand-rolled SVG chart approach.

**Architecture:** Sort is a new query param on two existing endpoints (no schema change). Health is a new read-only endpoint that pings the DB and Redis directly, plus a small ARQ `WorkerSettings` tweak so its already-built-in health-check key reflects near-real-time liveness instead of its 1-hour default. New charts are new aggregate queries + new hand-rolled SVG chart components matching `page.tsx`'s existing `BarChart`/`DailyChart` style.

**Tech Stack:** FastAPI + asyncpg (existing), Next.js/React admin (existing Tailwind + inline-SVG chart patterns) — no new dependency anywhere in this plan.

## Global Constraints

- No new charting library — every chart is a new hand-rolled SVG component matching `frinq-admin/app/page.tsx`'s existing `BarChart`/`DailyChart`/`HourChart`/`FunnelChart` style.
- Keep the horizontal top-nav (`AdminShell.tsx`) — no sidebar.
- Sort/filter lives per-tab (Users tab, Chat browser each get their own control) — no shared cross-tab component.
- System health is a live check on page load — no new scheduled job, no new time-series storage table.

---

### Task 1: Sort order for `GET /admin/submissions`

**Files:**
- Modify: `frinq-backend/app/api/v1/admin.py:54-149` (`list_submissions`)
- Test: `frinq-backend/tests/test_api/test_admin_submissions_sort.py` (new)

**Interfaces:**
- Produces: `list_submissions` gains a `sort: str = Query(default="newest")` param, accepting `newest` / `oldest` / `alphabetical`.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_api/test_admin_submissions_sort.py
from __future__ import annotations


async def test_default_sort_is_newest_first(async_client, admin_headers):
    res = await async_client.get("/api/v1/admin/submissions", headers=admin_headers)
    assert res.status_code == 200
    subs = res.json()["submissions"]
    dates = [s["created_at"] for s in subs if s["created_at"]]
    assert dates == sorted(dates, reverse=True)


async def test_oldest_sort_reverses_order(async_client, admin_headers):
    res = await async_client.get("/api/v1/admin/submissions?sort=oldest", headers=admin_headers)
    assert res.status_code == 200
    subs = res.json()["submissions"]
    dates = [s["created_at"] for s in subs if s["created_at"]]
    assert dates == sorted(dates)


async def test_alphabetical_sort_orders_by_name(async_client, admin_headers):
    res = await async_client.get("/api/v1/admin/submissions?sort=alphabetical", headers=admin_headers)
    assert res.status_code == 200
    # Smoke check only — exact name ordering depends on seeded data;
    # the important assertion is that the request succeeds with this
    # sort value and doesn't 500/422.


async def test_unknown_sort_value_rejected(async_client, admin_headers):
    res = await async_client.get("/api/v1/admin/submissions?sort=nonsense", headers=admin_headers)
    assert res.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frinq-backend && .venv/Scripts/python.exe -m pytest tests/test_api/test_admin_submissions_sort.py -q`
Expected: FAIL (`oldest`/`alphabetical` currently ignored — `newest` "fails" only in the sense the param doesn't exist yet, but the unknown-value 422 test definitely fails since there's no validation)

- [ ] **Step 3: Add the param + `ORDER BY` mapping**

In `admin.py`, add to `list_submissions`'s signature:
```python
sort: Literal["newest", "oldest", "alphabetical"] = Query(default="newest"),
```
(add `from typing import Literal` to the top imports if not already present — check first, this file already imports `Any` from `typing`).

Replace the hardcoded `ORDER BY created_at DESC` in the SQL f-string with a variable:
```python
order_clause = {
    "newest": "ORDER BY created_at DESC",
    "oldest": "ORDER BY created_at ASC",
    "alphabetical": "ORDER BY answers->>'name' ASC NULLS LAST",
}[sort]
```
and use `{order_clause}` in place of the literal `ORDER BY created_at DESC` inside the f-string.

FastAPI's `Literal[...]` type on a `Query` param already returns 422 for a value outside the set — no manual validation needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_api/test_admin_submissions_sort.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frinq-backend/app/api/v1/admin.py frinq-backend/tests/test_api/test_admin_submissions_sort.py
git commit -m "feat: add sort query param to GET /admin/submissions"
```

---

### Task 2: Sort order for chat browser messages

**Files:**
- Modify: `frinq-backend/app/api/v1/admin.py:1771-1824` (`list_community_messages`)
- Test: `frinq-backend/tests/test_api/test_admin_community_messages_sort.py` (new)

**Interfaces:**
- Produces: `list_community_messages` gains `sort: Literal["newest", "oldest"] = Query(default="newest")`. `before_id`'s comparator flips with sort direction so cursor pagination stays correct in both directions.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_api/test_admin_community_messages_sort.py
from __future__ import annotations


async def test_default_sort_is_newest_first(async_client, admin_headers, seeded_community_with_messages):
    slug = seeded_community_with_messages
    res = await async_client.get(f"/api/v1/admin/communities/{slug}/messages", headers=admin_headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["messages"]]
    assert ids == sorted(ids, reverse=True)


async def test_oldest_sort_reverses_order(async_client, admin_headers, seeded_community_with_messages):
    slug = seeded_community_with_messages
    res = await async_client.get(f"/api/v1/admin/communities/{slug}/messages?sort=oldest", headers=admin_headers)
    assert res.status_code == 200
    ids = [m["id"] for m in res.json()["messages"]]
    assert ids == sorted(ids)


async def test_before_id_pagination_still_works_when_sorted_oldest(async_client, admin_headers, seeded_community_with_messages):
    slug = seeded_community_with_messages
    first_page = (await async_client.get(f"/api/v1/admin/communities/{slug}/messages?sort=oldest&limit=1", headers=admin_headers)).json()
    last_id = first_page["messages"][-1]["id"]
    second_page = await async_client.get(
        f"/api/v1/admin/communities/{slug}/messages?sort=oldest&limit=1&before_id={last_id}", headers=admin_headers,
    )
    assert second_page.status_code == 200
    for m in second_page.json()["messages"]:
        assert m["id"] > last_id  # ascending order: "before" the cursor means a higher id came before it chronologically... 
        # NOTE: verify this assertion direction against the actual seeded fixture's message ids/timestamps once
        # `seeded_community_with_messages` is written (Step 0 below) — the point being tested is that switching
        # sort direction also switches which side of `before_id` the comparator excludes, not the literal ids here.
```

(If a `seeded_community_with_messages` fixture doesn't already exist in `tests/conftest.py` or a neighboring fixture file, check `test_api/test_admin_moderation.py` or similar for how existing community-message tests seed data, and either reuse that pattern or add the fixture — this is a real Step 0 for whichever engineer picks this up, not skippable.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_api/test_admin_community_messages_sort.py -q`
Expected: FAIL

- [ ] **Step 3: Add the param + flip the comparator**

In `admin.py`'s `list_community_messages`, add `sort: Literal["newest", "oldest"] = Query(default="newest")` to the signature. Find the existing `before_id` WHERE-clause construction (around line 1791, `m.id < $N`) and make the comparator sort-dependent:

```python
cursor_op = "<" if sort == "newest" else ">"
order_clause = "ORDER BY m.id DESC" if sort == "newest" else "ORDER BY m.id ASC"
```
then use `cursor_op` in place of the hardcoded `<` in the `before_id` condition, and `{order_clause}` in place of the hardcoded `ORDER BY m.id DESC`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_api/test_admin_community_messages_sort.py -q`
Expected: PASS

- [ ] **Step 5: Run the full backend suite**

Run: `.venv/Scripts/python.exe -m pytest -q`
Expected: PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add frinq-backend/app/api/v1/admin.py frinq-backend/tests/test_api/test_admin_community_messages_sort.py
git commit -m "feat: add sort query param to chat browser messages endpoint"
```

---

### Task 3: Admin frontend — sort dropdowns

**Files:**
- Modify: `frinq-admin/app/page.tsx` (Users tab's filter row)
- Modify: `frinq-admin/app/components/ChatBrowserView.tsx:170-184` (community-picker row)

**Interfaces:** none new — pure UI, driven by the query params added in Tasks 1-2.

- [ ] **Step 1: Add a sort dropdown to the Users tab**

In `page.tsx`, find the Users tab's existing filter controls (status/category/age selects, matching `moderation/page.tsx`'s exact select styling) and add a `sort` state + `<select>` alongside them:
```typescript
const [sort, setSort] = useState<"newest" | "oldest" | "alphabetical">("newest");
```
Thread `sort` into the existing fetch call's query params (`URLSearchParams`) and add:
```tsx
<select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
  aria-label="sort"
  className="font-[family-name:var(--font-motive)] text-[11px] px-2 py-1.5 border border-[rgba(42,24,16,0.18)] bg-transparent text-[#2A1810]">
  <option value="newest">newest first</option>
  <option value="oldest">oldest first</option>
  <option value="alphabetical">alphabetical</option>
</select>
```
Add `sort` to whatever `useEffect`/`useCallback` dependency array already triggers a refetch on filter change (matching how `statusFilter`/`categoryFilter` already do this in `moderation/page.tsx`'s pattern, or however the Users tab's own existing load function is structured).

- [ ] **Step 2: Add a sort dropdown to the Chat browser**

In `ChatBrowserView.tsx`, add a `sort` state (`"newest" | "oldest"`) next to the existing `slug` state, add the param to `loadMessages`'s `URLSearchParams` (alongside `limit`/`before_id`), and add a `<select>` next to the existing community `<select>`:
```tsx
<select value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setMessages([]); setHasMore(true); loadMessages(slug); }}
  aria-label="sort"
  className="font-[family-name:var(--font-motive)] text-[11px] px-2 py-1.5 border border-[rgba(42,24,16,0.18)] bg-transparent text-[#2A1810]">
  <option value="newest">newest first</option>
  <option value="oldest">oldest first</option>
</select>
```

- [ ] **Step 3: `npm run build && npm run lint`**

Run: `cd frinq-admin && npm run build && npm run lint`
Expected: both clean

- [ ] **Step 4: Manual click-through**

Switch each dropdown, confirm the list re-fetches and visibly reorders; for Chat browser, confirm "load more" still works correctly after switching to oldest-first (no duplicate or skipped messages).

- [ ] **Step 5: Commit**

```bash
git add frinq-admin/app/page.tsx frinq-admin/app/components/ChatBrowserView.tsx
git commit -m "feat: add sort dropdowns to Users tab and Chat browser"
```

---

### Task 4: System health endpoint

**Files:**
- Modify: `frinq-backend/app/workers/queue.py` (WorkerSettings — shorten `health_check_interval`)
- Modify: `frinq-backend/app/api/v1/admin.py`
- Test: `frinq-backend/tests/test_api/test_admin_health.py` (new)

**Interfaces:**
- Produces: `GET /admin/health` (admin-only) → `{"database": {"ok": bool, "latency_ms": float}, "redis": {"ok": bool, "latency_ms": float}, "arq_worker": {"ok": bool, "latency_ms": float | None}}`.

ARQ already writes a health-check key to Redis (`arq:queue:health-check`, TTL-refreshed every `health_check_interval` seconds, confirmed via `arq/worker.py`/`arq/constants.py` in the installed package) — but `WorkerSettings` doesn't currently override the 3600-second (1-hour) default, so the key could still exist for up to an hour after a crashed worker. Shortening it makes "is the worker alive right now" actually meaningful.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_api/test_admin_health.py
from __future__ import annotations


async def test_health_endpoint_requires_admin_key(async_client):
    res = await async_client.get("/api/v1/admin/health")
    assert res.status_code == 401


async def test_health_endpoint_reports_database_and_redis(async_client, admin_headers):
    res = await async_client.get("/api/v1/admin/health", headers=admin_headers)
    assert res.status_code == 200
    body = res.json()
    assert body["database"]["ok"] is True
    assert isinstance(body["database"]["latency_ms"], (int, float))
    assert "redis" in body
    assert "arq_worker" in body


async def test_health_endpoint_reports_db_down_without_500(async_client, admin_headers, monkeypatch):
    # Force the pool dependency to raise — the endpoint must catch this and
    # report {"ok": False}, never propagate a 500 for a health-check endpoint.
    from app.api import deps

    async def _broken_pool():
        raise Exception("simulated db outage")

    monkeypatch.setattr(deps, "get_pool", _broken_pool)
    res = await async_client.get("/api/v1/admin/health", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["database"]["ok"] is False
```

(The `monkeypatch.setattr(deps, "get_pool", ...)` approach only works if the health endpoint calls `deps.get_pool()` directly rather than via FastAPI's `Depends()` injection for this one specific check — see Step 3's implementation, which deliberately does its own try/except around each check rather than relying on `Depends()` to fail the whole request.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/Scripts/python.exe -m pytest tests/test_api/test_admin_health.py -q`
Expected: FAIL (404 — route doesn't exist)

- [ ] **Step 3: Shorten the ARQ health-check interval**

In `app/workers/queue.py`'s `WorkerSettings` class, add:
```python
health_check_interval = 30
```

- [ ] **Step 4: Add the endpoint**

In `admin.py`, add imports `import time` and `from app.core.redis_client import get_redis`, then:

```python
@router.get("/health", dependencies=[Depends(_require_admin)])
async def admin_health() -> dict[str, Any]:
    result: dict[str, Any] = {}

    start = time.monotonic()
    try:
        from app.database import get_pool as _get_raw_pool
        pool = _get_raw_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        result["database"] = {"ok": True, "latency_ms": round((time.monotonic() - start) * 1000, 1)}
    except Exception:
        result["database"] = {"ok": False, "latency_ms": None}

    start = time.monotonic()
    try:
        redis = await get_redis()
        if redis is None:
            raise RuntimeError("redis client unavailable")
        await redis.ping()
        result["redis"] = {"ok": True, "latency_ms": round((time.monotonic() - start) * 1000, 1)}
    except Exception:
        result["redis"] = {"ok": False, "latency_ms": None}

    start = time.monotonic()
    try:
        redis = await get_redis()
        alive = redis is not None and await redis.exists("arq:queue:health-check")
        result["arq_worker"] = {
            "ok": bool(alive),
            "latency_ms": round((time.monotonic() - start) * 1000, 1) if alive else None,
        }
    except Exception:
        result["arq_worker"] = {"ok": False, "latency_ms": None}

    return result
```

Note this deliberately does NOT use `pool: asyncpg.Pool = Depends(get_pool)` for the database check — that dependency raises a 503 before the route body even runs if the pool is down, which would prevent reporting `redis`/`arq_worker` status in the same response. Importing `app.database.get_pool` directly (the raw, non-HTTP-wrapping version) and handling `None`/exceptions locally is what lets all three checks run independently.

- [ ] **Step 5: Run tests to verify they pass**

Run: `.venv/Scripts/python.exe -m pytest tests/test_api/test_admin_health.py -q`
Expected: PASS

- [ ] **Step 6: Run the full backend suite**

Run: `.venv/Scripts/python.exe -m pytest -q`
Expected: PASS, no regressions

- [ ] **Step 7: Commit**

```bash
git add frinq-backend/app/workers/queue.py frinq-backend/app/api/v1/admin.py frinq-backend/tests/test_api/test_admin_health.py
git commit -m "feat: add GET /admin/health checking database, redis, and ARQ worker liveness"
```

---

### Task 5: Admin frontend — health panel

**Files:**
- Create: `frinq-admin/app/components/HealthPanel.tsx`
- Modify: `frinq-admin/app/page.tsx` (mount it in the Analytics/Overview tab)

**Interfaces:**
- Produces: `HealthPanel({ adminKey }: { adminKey: string })` — self-contained, fetches on mount + manual refresh button, no props beyond the key.

- [ ] **Step 1: Write the component**

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/app/lib/adminFetch";
import { useAdminAuth } from "@/app/components/AdminShell";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface HealthCheck { ok: boolean; latency_ms: number | null; }
interface HealthResponse { database: HealthCheck; redis: HealthCheck; arq_worker: HealthCheck; }

function StatusChip({ label, check }: { label: string; check: HealthCheck | undefined }) {
  const ok = check?.ok ?? false;
  return (
    <div className="border border-[rgba(42,24,16,0.12)] rounded-md px-4 py-3 min-w-[140px]">
      <div className="flex items-center gap-2 mb-1">
        <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-green-600" : "bg-red-600"}`} />
        <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355]">{label}</span>
      </div>
      <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[16px]">
        {ok ? `${check?.latency_ms ?? "—"}ms` : "down"}
      </p>
    </div>
  );
}

export function HealthPanel({ adminKey }: { adminKey: string }) {
  const { logout } = useAdminAuth();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/health`, {}, { key: adminKey });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) { setError(`error ${res.status}`); return; }
      setHealth(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "network error");
    } finally {
      setLoading(false);
    }
  }, [adminKey, logout]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  return (
    <div className="flex flex-wrap gap-3 items-start">
      <StatusChip label="database" check={health?.database} />
      <StatusChip label="redis" check={health?.redis} />
      <StatusChip label="worker" check={health?.arq_worker} />
      <button onClick={load} disabled={loading}
        className="font-[family-name:var(--font-motive)] text-[9px] px-2.5 py-1.5 border border-[rgba(42,24,16,0.18)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-40 self-center">
        {loading ? "checking…" : "refresh"}
      </button>
      {error && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B]">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Mount it in the Overview tab**

In `page.tsx`, import `HealthPanel` and render `<HealthPanel adminKey={adminKey} />` near the top of the `overview` tab's content (above the existing totals cards), matching that tab's existing spacing conventions.

- [ ] **Step 3: `npm run build && npm run lint`**

Run: `cd frinq-admin && npm run build && npm run lint`
Expected: both clean

- [ ] **Step 4: Manual click-through**

Load the Overview tab, confirm all three chips show green/latency under normal conditions; stop the ARQ worker process, click refresh, confirm the worker chip flips to red within `health_check_interval` (30s) of the worker actually stopping — not immediately, since the key's TTL takes up to 30s to expire.

- [ ] **Step 5: Commit**

```bash
git add frinq-admin/app/components/HealthPanel.tsx frinq-admin/app/page.tsx
git commit -m "feat: add live system-health panel to admin Overview tab"
```

---

### Task 6: Community/chat activity chart

**Files:**
- Modify: `frinq-backend/app/api/v1/admin.py` (extend the communities list or add a small aggregate endpoint)
- Modify: `frinq-admin/app/components/ChatBrowserView.tsx` or `page.tsx`'s Community section
- Test: `frinq-backend/tests/test_api/test_admin_community_activity.py` (new)

**Interfaces:**
- Produces: `GET /admin/communities/activity` (admin-only) → `{"daily": [{"day": "YYYY-MM-DD", "count": int}], "by_community": [{"slug": str, "name": str, "message_count": int}]}` — last 30 days.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_api/test_admin_community_activity.py
from __future__ import annotations


async def test_community_activity_returns_daily_and_by_community(async_client, admin_headers):
    res = await async_client.get("/api/v1/admin/communities/activity", headers=admin_headers)
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body["daily"], list)
    assert isinstance(body["by_community"], list)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest tests/test_api/test_admin_community_activity.py -q`
Expected: FAIL (404)

- [ ] **Step 3: Add the endpoint**

Reuses `messages`' existing `idx_messages_archetype_slug_desc` index — no schema change:

```python
@router.get("/communities/activity", dependencies=[Depends(_require_admin)])
async def community_activity(pool: asyncpg.Pool = Depends(get_pool)) -> dict[str, Any]:
    async with pool.acquire() as conn:
        daily = await conn.fetch(
            """SELECT date_trunc('day', created_at)::date AS day, COUNT(*) AS count
               FROM messages
               WHERE created_at >= now() - interval '30 days' AND deleted_at IS NULL
               GROUP BY day ORDER BY day"""
        )
        by_community = await conn.fetch(
            """SELECT c.archetype_slug AS slug, c.name, COUNT(m.id) AS message_count
               FROM communities c
               LEFT JOIN messages m ON m.archetype_slug = c.archetype_slug AND m.deleted_at IS NULL
               GROUP BY c.archetype_slug, c.name
               ORDER BY message_count DESC"""
        )
    return {
        "daily": [{"day": r["day"].isoformat(), "count": r["count"]} for r in daily],
        "by_community": [{"slug": r["slug"], "name": r["name"], "message_count": r["message_count"]} for r in by_community],
    }
```

(Check the actual `communities` table's column names — `archetype_slug`/`name` are inferred from `ChatBrowserView.tsx`'s `CommunityRow` interface seen earlier; confirm against the real schema/migration 012 before finalizing this query.)

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest tests/test_api/test_admin_community_activity.py -q`
Expected: PASS

- [ ] **Step 5: Add the chart to the admin frontend**

Add a `DailyChart`-style component call (reuse `page.tsx`'s existing `DailyChart` component if it's generic enough to accept `{day, count}[]` directly — check its prop signature first; if it's typed specifically to `Analytics["daily_last_30"]`'s shape, either loosen its prop type to the shared `{day: string; count: number}` shape or copy its rendering logic into a new small component in `ChatBrowserView.tsx`/wherever the Community tab's Reports/Chat section header lives) plus a simple ranked list for `by_community`.

- [ ] **Step 6: `npm run build && npm run lint`**

Run: `cd frinq-admin && npm run build && npm run lint`
Expected: both clean

- [ ] **Step 7: Commit**

```bash
git add frinq-backend/app/api/v1/admin.py frinq-backend/tests/test_api/test_admin_community_activity.py frinq-admin/app/components/ChatBrowserView.tsx
git commit -m "feat: add community/chat activity chart to the Community tab"
```

---

### Task 7: Model Config daily-spend trend

**Files:**
- Modify: `frinq-backend/app/api/v1/admin.py` (`get_ai_usage`)
- Modify: `frinq-admin/app/components/ModelConfigView.tsx`
- Test: extend `frinq-backend/tests/test_api/test_admin_ai_usage.py` if it exists, else create `frinq-backend/tests/test_api/test_admin_ai_usage_trend.py`

**Interfaces:**
- Produces: `GET /admin/ai-usage`'s response gains a `"daily": [{"day": "YYYY-MM-DD", "cost_usd": float}]` field (last 30 days) alongside the existing `total_cost_usd`/`by_model`/`recent` fields — additive, no existing field removed or renamed.

- [ ] **Step 1: Write the failing test**

```python
async def test_ai_usage_includes_daily_trend(async_client, admin_headers):
    res = await async_client.get("/api/v1/admin/ai-usage", headers=admin_headers)
    assert res.status_code == 200
    assert isinstance(res.json()["daily"], list)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/Scripts/python.exe -m pytest -k test_ai_usage_includes_daily_trend -q`
Expected: FAIL (`KeyError: 'daily'`)

- [ ] **Step 3: Add the query + response field**

In `get_ai_usage` (`admin.py`), add alongside the existing `by_model`/`recent` queries:
```python
daily = await conn.fetch(
    """SELECT date_trunc('day', created_at)::date AS day, COALESCE(SUM(cost_usd), 0) AS cost
       FROM ai_usage_log
       WHERE created_at >= now() - interval '30 days'
       GROUP BY day ORDER BY day"""
)
```
and add to the returned dict:
```python
"daily": [{"day": r["day"].isoformat(), "cost_usd": float(r["cost"])} for r in daily],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest -k test_ai_usage_includes_daily_trend -q`
Expected: PASS

- [ ] **Step 5: Run the full backend suite**

Run: `.venv/Scripts/python.exe -m pytest -q`
Expected: PASS, no regressions (additive field only)

- [ ] **Step 6: Render the trend line in `ModelConfigView.tsx`**

Add a `daily: { day: string; cost_usd: number }[]` field to the existing `UsageSummary` interface, and render it with a small new inline-SVG line/bar chart component (matching `page.tsx`'s `DailyChart` visual style) placed above the existing "spend by model" table in the usage section.

- [ ] **Step 7: `npm run build && npm run lint`**

Run: `cd frinq-admin && npm run build && npm run lint`
Expected: both clean

- [ ] **Step 8: Commit**

```bash
git add frinq-backend/app/api/v1/admin.py frinq-backend/tests/test_api/ frinq-admin/app/components/ModelConfigView.tsx
git commit -m "feat: add daily spend trend chart to Model Config usage view"
```

---

### Task 8: Users-tab retention view (active vs. dormant)

**Files:**
- Modify: `frinq-backend/app/api/v1/admin.py` (analytics endpoint that builds the `Analytics` response)
- Modify: `frinq-admin/app/page.tsx` (Analytics tab)
- Test: `frinq-backend/tests/test_api/test_admin_analytics_retention.py` (new)

**Interfaces:**
- Produces: the existing analytics response gains a `"retention": {"active_30d": int, "dormant_30d": int}` field — additive. "Active" = a `users` row with `onboarding_state='active'` and `updated_at >= now() - interval '30 days'`; "dormant" = `onboarding_state='active'` but `updated_at` older than that.

- [ ] **Step 1: Write the failing test**

```python
async def test_analytics_includes_retention_split(async_client, admin_headers):
    res = await async_client.get("/api/v1/admin/analytics", headers=admin_headers)
    assert res.status_code == 200
    retention = res.json()["retention"]
    assert "active_30d" in retention
    assert "dormant_30d" in retention
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frinq-backend && .venv/Scripts/python.exe -m pytest -k test_analytics_includes_retention_split -q`
Expected: FAIL (`KeyError: 'retention'`)

- [ ] **Step 3: Add the query**

Find the existing analytics-building function (`GET /admin/analytics`, look for wherever `_analytics_cache`/`_ANALYTICS_TTL` from `admin.py:37-39` are used — this endpoint already caches its result for 60s, so add the new query alongside whatever other aggregate queries it already runs, inside the same cached block, not as a second uncached round-trip):

```python
retention_row = await conn.fetchrow(
    """SELECT
         COUNT(*) FILTER (WHERE updated_at >= now() - interval '30 days') AS active_30d,
         COUNT(*) FILTER (WHERE updated_at < now() - interval '30 days') AS dormant_30d
       FROM users WHERE onboarding_state = 'active'"""
)
```
and add to the returned dict:
```python
"retention": {"active_30d": retention_row["active_30d"], "dormant_30d": retention_row["dormant_30d"]},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/Scripts/python.exe -m pytest -k test_analytics_includes_retention_split -q`
Expected: PASS

- [ ] **Step 5: Run the full backend suite**

Run: `.venv/Scripts/python.exe -m pytest -q`
Expected: PASS, no regressions

- [ ] **Step 6: Render it in the Analytics tab**

In `page.tsx`, add `retention: { active_30d: number; dormant_30d: number }` to the `Analytics` interface, and render a simple two-bar comparison (reusing the existing `BarChart` component with a two-item `data` array: `[{label: "active", count: retention.active_30d}, {label: "dormant", count: retention.dormant_30d}]` — check `BarChart`'s exact prop names, `labelKey`/`valueKey`, from its existing call sites and match them) near the existing daily/hourly charts.

- [ ] **Step 7: `npm run build && npm run lint`**

Run: `cd frinq-admin && npm run build && npm run lint`
Expected: both clean

- [ ] **Step 8: Commit**

```bash
git add frinq-backend/app/api/v1/admin.py frinq-backend/tests/test_api/test_admin_analytics_retention.py frinq-admin/app/page.tsx
git commit -m "feat: add active-vs-dormant retention chart to Analytics tab"
```

---

## Post-plan verification

- [ ] Full backend suite: `cd frinq-backend && .venv/Scripts/python.exe -m pytest -q` — all green.
- [ ] Admin build/lint: `cd frinq-admin && npm run build && npm run lint` — both clean.
- [ ] Manual click-through of every new control (sort dropdowns, health panel refresh, new charts) against the live local backend.
- [ ] Code review pass (per this session's established per-phase convention): dispatch a code-reviewer subagent against the full diff before considering this plan done.

## Deferred (per spec's "out of scope")

- Historical uptime-percentage tracking (would need a scheduled job + storage table).
- Events charts (blocked on Phase 5 shipping first — revisit once `events` table exists).
