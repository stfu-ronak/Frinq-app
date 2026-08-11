"""Pins the Azure AI Foundry **v1** contract (OpenAI-compatible).

The distinction matters: an earlier pass targeted the CLASSIC Azure OpenAI
shape (`<res>.openai.azure.com/openai/deployments/<d>/...?api-version=`,
`api-key` header, no `model` in the body). The Foundry v1 endpoint is the
opposite on all three counts, so these tests exist to stop a regression back
to the classic shape.
"""

import json

import pytest

from app.config import settings
from app.core.ai import azure_client
from app.core.ai.azure_client import AzureConfigError

ENDPOINT = "https://frinq-us-resource.services.ai.azure.com/openai/v1"


@pytest.fixture(autouse=True)
def _azure_env(monkeypatch):
    monkeypatch.setattr(settings, "AZURE_OPENAI_ENDPOINT", ENDPOINT)
    monkeypatch.setattr(settings, "AZURE_OPENAI_API_KEY", "azure-key")
    monkeypatch.setattr(settings, "AZURE_OPENAI_DEPLOYMENTS", "")
    monkeypatch.setattr(settings, "OPENAI_REASONING_EFFORT", "medium")


def test_url_is_the_openai_compatible_path_with_no_api_version():
    url = azure_client.build_url()
    assert url == f"{ENDPOINT}/chat/completions"
    # Classic-Azure artifacts must NOT reappear.
    assert "api-version" not in url
    assert "/deployments/" not in url


def test_trailing_slash_on_endpoint_does_not_double_up():
    settings.AZURE_OPENAI_ENDPOINT = ENDPOINT + "/"
    assert azure_client.build_url() == f"{ENDPOINT}/chat/completions"


def test_model_goes_in_the_body_carrying_the_deployment_name():
    payload = azure_client.build_payload(
        system="s", user="u", model="gpt-5.6-terra", temperature=0.7,
        max_tokens=100, examples=None, effort="medium",
    )
    assert payload["model"] == "gpt-5.6-terra"
    assert payload["max_completion_tokens"] == 100
    assert payload["response_format"] == {"type": "json_object"}


def test_deployment_name_can_be_remapped(monkeypatch):
    monkeypatch.setattr(
        settings, "AZURE_OPENAI_DEPLOYMENTS", json.dumps({"gpt-5.6-luna": "luna-deploy"})
    )
    payload = azure_client.build_payload(
        system="s", user="u", model="gpt-5.6-luna", temperature=0.7,
        max_tokens=10, examples=None, effort=None,
    )
    assert payload["model"] == "luna-deploy"
    # Unmapped ids fall through unchanged.
    assert azure_client.resolve_deployment("gpt-5.6-terra") == "gpt-5.6-terra"


def test_missing_endpoint_is_a_clear_operator_error(monkeypatch):
    monkeypatch.setattr(settings, "AZURE_OPENAI_ENDPOINT", "")
    with pytest.raises(AzureConfigError, match="AZURE_OPENAI_ENDPOINT"):
        azure_client.build_url()


def test_reasoning_effort_replaces_temperature():
    payload = azure_client.build_payload(
        system="s", user="u", model="m", temperature=0.7,
        max_tokens=100, examples=None, effort="high",
    )
    assert payload["reasoning_effort"] == "high"
    # GPT-5 reasoning models 400 on a custom temperature.
    assert "temperature" not in payload


def test_effort_none_omits_the_param_and_keeps_temperature():
    payload = azure_client.build_payload(
        system="s", user="u", model="m", temperature=0.42,
        max_tokens=100, examples=None, effort="none",
    )
    assert "reasoning_effort" not in payload
    assert payload["temperature"] == 0.42


def test_examples_become_alternating_turns():
    payload = azure_client.build_payload(
        system="sys", user="real", model="m", temperature=0.7,
        max_tokens=10, examples=[("ex-in", "ex-out")], effort=None,
    )
    assert [m["role"] for m in payload["messages"]] == ["system", "user", "assistant", "user"]
    assert payload["messages"][-1]["content"] == "real"
