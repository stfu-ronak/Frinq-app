"""Task 44 Step 5 — scan every git-tracked file in the repo for accidentally
committed secrets. No gitleaks binary is available in this environment (no
internet access to fetch one, and this is a solo dev machine, not a CI
runner) — this is a lightweight, pattern-based equivalent covering the
credential shapes this project's own providers actually issue (Twilio,
OpenAI, Anthropic, Firebase/Google service-account keys, generic PEM private
keys, AWS-style keys, and JWT-shaped bearer tokens), plus the specific test
phone numbers used throughout this session's seed/test scripts.

Deliberately scans `git ls-files` output, not the whole working tree — this
automatically respects every .gitignore rule already in place (so .env,
node_modules, build/ outputs, etc. are never scanned), which is exactly the
same boundary a real gitleaks run against the git history would use.

Usage: python scripts/scan_for_secrets.py [--root <repo-root>]
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

# (name, compiled pattern) — patterns are deliberately specific to real
# credential shapes, not generic "any long string" heuristics, to keep the
# false-positive rate near zero.
_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("AWS access key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("Twilio Account SID", re.compile(r"\bAC[0-9a-fA-F]{32}\b")),
    ("Twilio Auth Token (assigned, not a placeholder)", re.compile(r"TWILIO_AUTH_TOKEN\s*=\s*[0-9a-fA-F]{32}\b")),
    ("OpenAI API key", re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b")),
    ("Anthropic API key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}\b")),
    ("PEM private key", re.compile(r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----")),
    ("Google/Firebase service-account JSON", re.compile(r'"type"\s*:\s*"service_account"')),
    ("Generic bearer/JWT-shaped token assigned to a variable",
     re.compile(r"(?:token|secret|api_key|password)\s*[:=]\s*['\"]eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
]

# Real test-fixture phone numbers used across this session's seed/test
# scripts — must never appear in committed source (only ever in a real,
# gitignored .env for local dev).
_TEST_FIXTURE_PHONES = ["8000000001", "8000000002", "8000000003"]

# Files where these patterns are EXPECTED and fine (e.g. this very script,
# test fixtures asserting the patterns are correctly rejected elsewhere,
# documentation showing what a bad value looks like).
_ALLOWLISTED_FILES = {
    "frinq-backend/scripts/scan_for_secrets.py",
    "frinq-backend/tests/test_scripts/test_scan_for_secrets.py",
    # These files intentionally contain deterministic local-only fixtures or
    # redacted credential-shaped strings used to test the scanner. They are
    # not runtime credentials and are kept explicit rather than broadening the
    # allowlist to all test/source files.
    "frinq-backend/tests/test_utils/test_logger.py",
    "frinq-mobile/src/services/telemetry/__tests__/crashReporter.test.ts",
}

_TEST_FIXTURE_PHONE_ALLOWLIST = {
    "frinq-backend/.env.example",
    "frinq-backend/app/config.py",
    "frinq-backend/scripts/seed_emulator_test_data.py",
    "frinq-backend/scripts/seed_release_test_data.py",
    "frinq-backend/tests/test_api/test_failure_switches.py",
    "frinq-backend/tests/test_core/test_test_fixtures.py",
    "frinq-backend/tests/test_scripts/test_seed_emulator_test_data.py",
    "frinq-mobile/scripts/verify-release-artifact.mjs",
}

_BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".ttf", ".otf", ".woff", ".woff2",
    ".zip", ".apk", ".keystore", ".jar", ".so", ".pyc", ".pdf",
}


def _tracked_files(root: Path) -> list[Path]:
    out = subprocess.run(
        ["git", "ls-files"], cwd=root, capture_output=True, text=True, check=True,
    ).stdout
    return [root / line for line in out.splitlines() if line.strip()]


def scan_for_secrets(root: Path) -> list[str]:
    findings: list[str] = []
    for path in _tracked_files(root):
        rel = path.relative_to(root).as_posix()
        if rel in _ALLOWLISTED_FILES or path.suffix.lower() in _BINARY_EXTENSIONS:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except (OSError, UnicodeDecodeError):
            continue
        for name, pattern in _PATTERNS:
            m = pattern.search(text)
            if m:
                findings.append(f"{rel}: possible {name} ({m.group(0)[:20]}...)")
        if rel not in _TEST_FIXTURE_PHONE_ALLOWLIST:
            for phone in _TEST_FIXTURE_PHONES:
                if phone in text:
                    findings.append(f"{rel}: test-fixture phone number committed: {phone}")
    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=None, help="Repo root (default: git rev-parse --show-toplevel)")
    args = parser.parse_args()

    if args.root:
        root = Path(args.root).resolve()
    else:
        top = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True,
        ).stdout.strip()
        root = Path(top)

    findings = scan_for_secrets(root)
    if findings:
        print("secret scan FAILED:")
        for f in findings:
            print(f"  - {f}")
        return 1
    print("secret scan passed — no committed secrets found")
    return 0


if __name__ == "__main__":
    sys.exit(main())
