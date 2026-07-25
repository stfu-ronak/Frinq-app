"""Task 47 Step 4 — smoke-test a running deployment after a release or a
rollback. Run against any base URL: local dev, a real staging app, or
(read-only checks only, never --seed) production.

Usage (PYTHONPATH=. is required — running this file directly puts only its
own directory on sys.path, not the project root; same gotcha `predeploy.py`
has, see docs/launch/execution-ledger.md's Task 44 entry):
  PYTHONPATH=. python scripts/smoke_release.py --base-url http://localhost:8000
  PYTHONPATH=. python scripts/smoke_release.py --base-url https://staging.example.com --admin-key <key> --seed

Exit 0 if every check passes, 1 otherwise — suitable as a CI/rollback-
rehearsal gate (see docs/runbooks/deploy-rollback.md).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from uuid import uuid4

import httpx

from app.utils.logger import logger


async def _check_live(client: httpx.AsyncClient) -> tuple[bool, str]:
    try:
        res = await client.get("/health/live", timeout=5.0)
        return res.status_code == 200, f"status={res.status_code}"
    except Exception as exc:  # noqa: BLE001 — any failure here is a real check failure
        return False, str(exc)


async def _check_ready(client: httpx.AsyncClient) -> tuple[bool, str]:
    try:
        res = await client.get("/health/ready", timeout=5.0)
        return res.status_code == 200, res.text
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


async def _check_dependencies(client: httpx.AsyncClient, admin_key: str | None) -> tuple[bool, str]:
    if not admin_key:
        return True, "skipped (no --admin-key given)"
    try:
        res = await client.get(
            "/health/dependencies", headers={"Authorization": f"Bearer {admin_key}"}, timeout=5.0,
        )
        return res.status_code == 200, res.text
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


async def check_seed_roundtrip(tag: str) -> tuple[bool, str]:
    """DB-direct (not HTTP) — proves the real write path works, not just
    that health endpoints respond. Only exercises whatever DATABASE_URL
    THIS process is configured with — that must be the same database the
    --base-url deployment actually uses, or this check is meaningless.
    Reuses seed_release_test_data.py's own production-refusal guard, so a
    --seed run against a real production DATABASE_URL fails loudly rather
    than silently creating/deleting a real row."""
    from scripts.seed_release_test_data import cleanup_by_tag, seed

    try:
        created = await seed(tag, 1, "quiet-storm")
        if len(created) != 1:
            return False, f"seed created {len(created)} users, expected 1"
        deleted = await cleanup_by_tag(tag)
        if deleted != 1:
            return False, f"cleanup deleted {deleted} rows, expected 1"
        return True, "seed+cleanup roundtrip ok"
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


async def run_smoke(
    base_url: str, admin_key: str | None, do_seed: bool,
    transport: httpx.BaseTransport | None = None,
) -> list[tuple[str, bool, str]]:
    """`transport` is injectable (httpx.MockTransport) purely for testing —
    real usage never passes it, leaving httpx's real network transport."""
    results: list[tuple[str, bool, str]] = []
    async with httpx.AsyncClient(base_url=base_url, transport=transport) as client:
        ok, detail = await _check_live(client)
        results.append(("health/live", ok, detail))
        ok, detail = await _check_ready(client)
        results.append(("health/ready", ok, detail))
        ok, detail = await _check_dependencies(client, admin_key)
        results.append(("health/dependencies", ok, detail))

    if do_seed:
        ok, detail = await check_seed_roundtrip(f"smoke-{uuid4().hex[:8]}")
        results.append(("db_write_roundtrip", ok, detail))

    return results


def _main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--admin-key", default=None)
    parser.add_argument("--seed", action="store_true", help="also run a real DB seed+cleanup roundtrip")
    args = parser.parse_args()

    results = asyncio.run(run_smoke(args.base_url, args.admin_key, args.seed))

    all_ok = all(ok for _, ok, _ in results)
    for name, ok, detail in results:
        logger.info("smoke.check", name=name, ok=ok)
        print(f"{'PASS' if ok else 'FAIL'}  {name:24s}  {detail[:200]}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(_main())
