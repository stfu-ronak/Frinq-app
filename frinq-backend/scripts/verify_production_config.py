"""Standalone production-config gate — validates a given .env file against
the exact same rules app/main.py's boot-time lifespan() enforces
(app/core/production_guard.py), without booting the app or touching a real
DB/Redis connection. Meant to run in CI against .env.staging/.env.production
before a real deploy, catching a misconfigured secret before it ever reaches
a running process.

Usage: python scripts/verify_production_config.py --env-file .env.staging
"""

from __future__ import annotations

import argparse
import sys

from app.config import Settings
from app.core.production_guard import validate_production_settings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", required=True, help="Path to the .env file to validate")
    args = parser.parse_args()

    settings = Settings(_env_file=args.env_file)  # type: ignore[call-arg]
    errors = validate_production_settings(settings)
    if errors:
        print("production-config verification FAILED:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("production-config verification passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
