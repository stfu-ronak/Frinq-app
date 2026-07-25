"""Task 47 Step 2 — synthetic chat load generator.

Real WebSocket clients, real HTTP ws-ticket issuance, real message sends
against a real running backend — the AI/OTP/WhatsApp/push providers are
naturally "stubbed" for this by simply never being exercised (chat send
never calls any of them; this script never touches /otp or /quiz routes).

*** SCALE WARNING ***
The plan's real target is 500 concurrent sockets / 20 accepted messages per
second / 50 concurrent quiz jobs, but that number assumes a DEDICATED
staging environment. This project has no isolated staging tier — the only
runnable target is the shared local/dev database also used for everyday
development. The defaults below are therefore deliberately small (10
sockets, ~5 msg/s combined) so this is safe to run against that shared dev
DB. Pass --sockets/--rate explicitly to ramp higher ONLY against a real
dedicated environment, never against a shared dev or production database.

Usage:
  PYTHONPATH=. python scripts/load_chat.py --base-url http://localhost:8000 --sockets 10 --rate 5 --duration 20

Cleans up every synthetic user it created, even on failure/interrupt.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from uuid import UUID, uuid4

import httpx
import websockets

from app.core.session import create_session
from app.database import close_pool, init_pool
from scripts.seed_release_test_data import cleanup_by_tag, seed

_DEFAULT_ARCHETYPE = "quiet-storm"


def _ws_url(base_url: str, path: str) -> str:
    return f"{base_url}{path}".replace("http://", "ws://", 1).replace("https://", "wss://", 1)


async def _mint_access_token(pool, user_id) -> str:
    async with pool.acquire() as conn:
        pair = await create_session(conn, user_id, "web")
    return pair.access_token


async def _get_ws_ticket(client: httpx.AsyncClient, access_token: str) -> str:
    res = await client.post(
        "/api/v1/community/ws-ticket", headers={"Authorization": f"Bearer {access_token}"}, timeout=10.0,
    )
    res.raise_for_status()
    return res.json()["ticket"]


class ClientResult:
    def __init__(self) -> None:
        self.sent = 0
        self.confirmed = 0
        self.rejected = 0
        self.duplicates = 0
        self.errors: list[str] = []
        self.latencies_ms: list[float] = []


async def _run_client(base_url: str, access_token: str, per_client_rate: float, duration: float) -> ClientResult:
    result = ClientResult()
    async with httpx.AsyncClient(base_url=base_url) as client:
        try:
            ticket = await _get_ws_ticket(client, access_token)
        except Exception as exc:  # noqa: BLE001
            result.errors.append(f"ws-ticket failed: {exc}")
            return result

    ws_url = _ws_url(base_url, f"/api/v1/ws/community?ticket={ticket}")
    pending: dict[str, float] = {}  # client_message_id -> sent monotonic time
    confirmed_ids: set[str] = set()

    try:
        async with websockets.connect(ws_url, open_timeout=10) as ws:
            # Wait for the server's 'ready' frame before sending anything.
            ready_raw = await asyncio.wait_for(ws.recv(), timeout=10)
            if json.loads(ready_raw).get("type") != "ready":
                result.errors.append("did not receive a ready frame first")
                return result

            async def sender() -> None:
                interval = 1.0 / per_client_rate if per_client_rate > 0 else 1.0
                end_at = time.monotonic() + duration
                while time.monotonic() < end_at:
                    cmid = str(uuid4())
                    pending[cmid] = time.monotonic()
                    await ws.send(json.dumps({"type": "message.send", "client_message_id": cmid, "body": "load test message"}))
                    result.sent += 1
                    await asyncio.sleep(interval)

            async def receiver() -> None:
                while True:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=duration + 15)
                    except asyncio.TimeoutError:
                        return
                    data = json.loads(raw)
                    if data.get("type") == "message.created":
                        cmid = data["message"]["client_message_id"]
                        if cmid not in pending and cmid not in confirmed_ids:
                            # Someone else's message broadcast on the same
                            # shared community channel — not one of ours.
                            continue
                        if cmid in confirmed_ids:
                            result.duplicates += 1
                            continue
                        confirmed_ids.add(cmid)
                        sent_at = pending.pop(cmid, None)
                        if sent_at is not None:
                            result.latencies_ms.append((time.monotonic() - sent_at) * 1000)
                        result.confirmed += 1
                    elif data.get("type") == "message.rejected":
                        result.rejected += 1
                        pending.pop(data.get("client_message_id", ""), None)

            send_task = asyncio.create_task(sender())
            recv_task = asyncio.create_task(receiver())
            await send_task
            # Give the receiver a grace window to catch trailing confirmations.
            try:
                await asyncio.wait_for(recv_task, timeout=10)
            except asyncio.TimeoutError:
                recv_task.cancel()
    except Exception as exc:  # noqa: BLE001 — a connection failure is a real result, not a crash
        result.errors.append(str(exc))

    return result


def _percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    values = sorted(values)
    idx = min(len(values) - 1, int(len(values) * pct))
    return values[idx]


async def run_load(base_url: str, sockets: int, rate: float, duration: float, tag: str) -> dict:
    # seed()/cleanup_by_tag() each own their own pool lifecycle (init+close),
    # matching their standalone-CLI-tool design (scripts/seed_release_test_
    # data.py) — a pool acquired before calling seed() would be closed out
    # from under this script the instant seed() returns. Acquire a fresh one
    # AFTER seed() for this script's own use (minting tokens).
    try:
        users = await seed(tag, sockets, _DEFAULT_ARCHETYPE)

        pool = await init_pool()
        if pool is None:
            raise RuntimeError("DATABASE_URL not set — cannot mint sessions for seeded users")
        tokens = [await _mint_access_token(pool, UUID(u["id"])) for u in users]
        await close_pool()

        per_client_rate = max(rate / sockets, 0.1)
        results = await asyncio.gather(
            *[_run_client(base_url, token, per_client_rate, duration) for token in tokens]
        )

        total_sent = sum(r.sent for r in results)
        total_confirmed = sum(r.confirmed for r in results)
        total_rejected = sum(r.rejected for r in results)
        total_duplicates = sum(r.duplicates for r in results)
        all_latencies = [l for r in results for l in r.latencies_ms]
        errors = [e for r in results for e in r.errors]

        return {
            "sockets": sockets,
            "requested_rate_per_sec": rate,
            "duration_sec": duration,
            "sent": total_sent,
            "confirmed": total_confirmed,
            "rejected": total_rejected,
            "duplicates": total_duplicates,
            "connection_errors": errors,
            "p50_ms": round(_percentile(all_latencies, 0.50), 1),
            "p95_ms": round(_percentile(all_latencies, 0.95), 1),
            "p99_ms": round(_percentile(all_latencies, 0.99), 1),
        }
    finally:
        await cleanup_by_tag(tag)  # owns its own pool lifecycle too


def _main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--sockets", type=int, default=10, help="concurrent WebSocket clients (plan target: 500, dedicated staging only)")
    parser.add_argument("--rate", type=float, default=5.0, help="combined accepted messages/sec across all sockets (plan target: 20, dedicated staging only)")
    parser.add_argument("--duration", type=float, default=20.0, help="seconds to sustain the load")
    parser.add_argument("--tag", default=f"load-{uuid4().hex[:8]}")
    args = parser.parse_args()

    report = asyncio.run(run_load(args.base_url, args.sockets, args.rate, args.duration, args.tag))
    print(json.dumps(report, indent=2))

    duplicates_found = report["duplicates"] > 0
    had_errors = len(report["connection_errors"]) > 0
    return 1 if (duplicates_found or had_errors) else 0


if __name__ == "__main__":
    sys.exit(_main())
