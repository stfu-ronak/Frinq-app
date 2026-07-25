from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from scripts.scan_for_secrets import scan_for_secrets


def _init_repo(tmp_path: Path, files: dict[str, str]) -> Path:
    repo = tmp_path / "repo"
    repo.mkdir()
    for rel, content in files.items():
        full = repo / rel
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text(content, encoding="utf-8")
    subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=repo, check=True)
    return repo


def test_passes_on_a_clean_tree(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path, {"app/main.py": "print('hello')\n"})
    assert scan_for_secrets(repo) == []


def test_flags_an_openai_key(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path, {"app/config.py": 'OPENAI_API_KEY = "sk-abcdefghijklmnopqrstuvwxyz123456"\n'})
    findings = scan_for_secrets(repo)
    assert any("OpenAI" in f for f in findings)


def test_flags_a_pem_private_key(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path, {"creds.json": "-----BEGIN PRIVATE KEY-----\nMIIBogIBAA==\n-----END PRIVATE KEY-----\n"})
    findings = scan_for_secrets(repo)
    assert any("PEM private key" in f for f in findings)


def test_flags_a_firebase_service_account_json(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path, {"google-services.json": '{"type": "service_account", "project_id": "x"}'})
    findings = scan_for_secrets(repo)
    assert any("service-account" in f for f in findings)


def test_flags_a_committed_test_fixture_phone_number(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path, {"seed.py": 'PHONE = "8000000001"\n'})
    findings = scan_for_secrets(repo)
    assert any("8000000001" in f for f in findings)


def test_does_not_false_positive_on_a_real_project_looking_string(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path, {"app/config.py": 'OPENAI_API_KEY: str = ""\nADMIN_ACTOR_ID: str = "dhairya"\n'})
    assert scan_for_secrets(repo) == []


def test_ignores_untracked_files(tmp_path: Path) -> None:
    repo = _init_repo(tmp_path, {"app/config.py": "print('clean')\n"})
    (repo / ".env").write_text('OPENAI_API_KEY = "sk-abcdefghijklmnopqrstuvwxyz123456"\n', encoding="utf-8")
    # .env was never `git add`ed — scan_for_secrets only sees tracked files.
    assert scan_for_secrets(repo) == []
