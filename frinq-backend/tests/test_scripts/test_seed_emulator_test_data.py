from __future__ import annotations

import pytest

import scripts.seed_emulator_test_data as seed_script


def test_emulator_seed_accounts_are_the_three_fixed_phones() -> None:
    assert seed_script.EMULATOR_ACCOUNTS == [
        ("8000000001", "reset"),
        ("8000000002", "chat_a"),
        ("8000000003", "chat_b"),
    ]


@pytest.mark.asyncio
async def test_seed_refuses_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(seed_script.settings, "APP_ENV", "production")
    with pytest.raises(RuntimeError, match="production"):
        await seed_script.seed()
