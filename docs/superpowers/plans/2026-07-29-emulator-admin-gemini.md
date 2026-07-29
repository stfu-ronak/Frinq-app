# Emulator Test Accounts, Admin Question Editor, and Gemini Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three safe emulator test accounts, a usable draft-and-save admin question editor, selectable Gemini/Gemma models for both insight and summary generation, and a runnable local backend/admin/mobile verification path.

**Architecture:** Keep the existing FastAPI, ARQ, Postgres, Redis, Next.js admin, and React Native boundaries. Add a small development-only test-fixture policy and transaction helper; add Gemini/Gemma behind the existing provider/model configuration contract with provider-specific transport and shared response normalization; keep question editing as one local admin draft committed atomically by the backend.

**Tech Stack:** FastAPI, asyncpg, pytest, httpx, ARQ, Next.js/React/TypeScript, React Native, Docker Compose, Google GenAI API.

## Global Constraints

- Test phones are exactly `8000000001`, `8000000002`, and `8000000003`; shared emulator OTP is exactly `123456`.
- Test-phone OTP bypass and reset behavior are ignored in production.
- `8000000001` resets quiz/profile/AI/community/chat/voice/session state on every successful test login.
- `8000000002` and `8000000003` are stable active users in `quiet-storm` and their conversations persist.
- Admin question saves use one Confirm/Cancel flow and no action-password prompt; destructive actions and model changes retain action-password protection.
- Insights and deep reports have independent provider/model settings and snapshot the setting at job start.
- Gemini/Gemma models are `gemma-4-31b-it`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, and `gemini-3.6-flash`.
- Provider keys remain backend-only; all external prompts receive PII-scrubbed data.
- Do not overwrite or clean unrelated existing user changes in the dirty worktree.
- Production code changes require a failing test first; live provider tests are conditional on configured keys.

## File Map

- `frinq-backend/app/core/test_fixtures.py`: exact test-phone roles and reset transaction.
- `frinq-backend/app/core/otp.py`, `frinq-backend/app/api/v1/otp.py`, `frinq-backend/app/config.py`: test-phone behavior and configuration.
- `frinq-backend/scripts/seed_emulator_test_data.py`: idempotent local seed command.
- `frinq-backend/app/core/ai/gemini_client.py`: Gemini 3.x/Gemma 4 calls and safe response extraction.
- `frinq-backend/app/core/ai/model_pricing.py`, `frinq-backend/app/core/ai/model_config.py`, `frinq-backend/app/core/ai/insights.py`, `frinq-backend/app/core/ai/openai_client.py`, `frinq-backend/app/workers/tasks/quiz_insights.py`: provider catalog and shared generation contract.
- `frinq-backend/app/api/v1/admin.py`: model smoke-test endpoint and routine question-save authorization.
- `frinq-admin/app/components/QuestionsView.tsx`, `QuestionForm.tsx`, `QuestionSerialization.ts`: responsive draft editor, drag reorder, and single save.
- `frinq-admin/app/components/ModelConfigView.tsx`: provider/model switching and connection-test results.
- `frinq-backend/docker-compose.emulator.yml`, `frinq-backend/Dockerfile`, `frinq-admin/Dockerfile`: local service runtime.
- Tests alongside each backend/admin change plus existing mobile suites.

---

### Task 1: Add the three emulator accounts and reset-on-login behavior

**Files:**
- Create: `frinq-backend/app/core/test_fixtures.py`
- Create: `frinq-backend/scripts/seed_emulator_test_data.py`
- Modify: `frinq-backend/app/config.py`, `frinq-backend/app/core/otp.py`, `frinq-backend/app/api/v1/otp.py`, `frinq-backend/.env.example`
- Test: `frinq-backend/tests/test_core/test_test_fixtures.py`, `frinq-backend/tests/test_core/test_otp_bypass.py`, `frinq-backend/tests/test_scripts/test_seed_emulator_test_data.py`

**Interfaces:**
- `test_phone_role(phone: str) -> Literal["reset", "chat_a", "chat_b"] | None`.
- `is_test_phone(phone: str) -> bool`.
- `reset_test_account(conn: asyncpg.Connection, user_id: UUID) -> None`.
- `seed_emulator_test_data(...) -> list[dict[str, str]]`.

- [ ] **Step 1: Write the failing reset and role tests.** Assert the three exact roles, that an unknown phone has no role, and that `reset_test_account` issues account-scoped deletes/updates for child state but not unrelated users. Assert the OTP helper accepts `123456` only for the three configured phones.
- [ ] **Step 2: Run the focused tests to verify RED.** Run `python -m pytest tests/test_core/test_test_fixtures.py tests/test_core/test_otp_bypass.py tests/test_scripts/test_seed_emulator_test_data.py -q` from `frinq-backend`; expect failures for missing role/reset/seed behavior.
- [ ] **Step 3: Implement the minimal fixture policy.** Add explicit development defaults for the three phones and reset phone, preserve the existing DEV_PHONE compatibility path, and route successful test-phone OTP verification through a transaction that resets only the reset account before session creation. Remove the broad local `SKIP_OTP_VERIFICATION` default from the emulator example so arbitrary numbers do not bypass.
- [ ] **Step 4: Implement the idempotent seed command.** Use the existing community sync/assignment helpers; create/update chat accounts as active in `quiet-storm`, and create/update the reset account in pre-quiz state. Refuse production and print only phone/id/role metadata.
- [ ] **Step 5: Run the focused tests to verify GREEN.** Re-run the command above, then run the existing auth/OTP tests and confirm no production-guard tests regress.
- [ ] **Step 6: Review the SQL scope.** Inspect all relevant migration foreign keys and add missing explicit child-table cleanup tests before moving on.

### Task 2: Add Gemini/Gemma provider support and shared model catalog

**Files:**
- Create: `frinq-backend/app/core/ai/gemini_client.py`
- Modify: `frinq-backend/requirements.txt`, `frinq-backend/app/config.py`, `frinq-backend/app/core/ai/model_pricing.py`, `frinq-backend/app/core/ai/model_config.py`, `frinq-backend/app/core/ai/insights.py`, `frinq-backend/app/core/ai/openai_client.py`, `frinq-backend/app/workers/tasks/quiz_insights.py`
- Test: `frinq-backend/tests/test_ai/test_gemini_client.py`, `frinq-backend/tests/test_ai/test_model_config.py`, `frinq-backend/tests/test_ai/test_model_pricing.py`, `frinq-backend/tests/test_ai/test_insights.py`

**Interfaces:**
- `call_gemini_json(*, system: str, user: str, model: str, schema: dict[str, Any], effort: str | None = None) -> tuple[str, Usage]`.
- `generate_gemini_json(*, system: str, user: str, model: str, schema: dict[str, Any], effort: str | None = None) -> tuple[str, Usage]`.
- Provider model catalog entries use `provider="gemini"` and preserve existing `provider/model_id/effort` configuration fields.

- [ ] **Step 1: Write failing adapter tests.** Mock the HTTP/SDK boundary and assert Gemini 3.x sends the Interactions API shape with top-level JSON response format and no deprecated sampling fields; assert Gemma uses `generateContent`; assert successful text/usage extraction and safe handling of malformed/no-candidate responses.
- [ ] **Step 2: Run the focused tests to verify RED.** Run `python -m pytest tests/test_ai/test_gemini_client.py tests/test_ai/test_model_pricing.py -q`; expect missing-module/catalog failures.
- [ ] **Step 3: Add the smallest provider client.** Use the existing async `httpx` pattern and `GEMINI_API_KEY`; select `gemini-3.6-flash`, `gemini-3.5-flash-lite`, and `gemini-3.1-flash-lite` through Interactions API, and `gemma-4-31b-it` through `generateContent`. Do not include temperature/top_p/top_k. Redact provider error bodies from logs.
- [ ] **Step 4: Add model metadata.** Register provider, prices, supported effort levels, and model transport in `model_pricing.py`; update validation and aliases without changing OpenAI/Claude entries.
- [ ] **Step 5: Wire both generation steps.** Update `insights.py` and deep-report generation so `provider == "gemini"` calls the new client and both outputs flow through current schema normalizers, limits, archetype validation, and usage recorder.
- [ ] **Step 6: Run GREEN and regression tests.** Run the focused AI tests, then all `tests/test_ai` and worker insight tests; fix code rather than weakening existing contracts.

### Task 3: Add admin connection checks and independent model switching

**Files:**
- Modify: `frinq-backend/app/api/v1/admin.py`, `frinq-admin/app/components/ModelConfigView.tsx`, `frinq-admin/app/page.tsx`
- Test: `frinq-backend/tests/test_api/test_admin_ai_smoke.py`, `frinq-admin/app/components/ModelConfigView.test.tsx`

**Interfaces:**
- `POST /api/v1/admin/ai-test` accepts `{step, provider, model_id, effort}` and returns `{provider, model_id, step, latency_ms, parsed, normalized, error_code}`.
- The endpoint uses a fixed PII-free answer fixture, never user input, and does not return provider keys or raw model output.

- [ ] **Step 1: Write failing API/UI tests.** Assert admin auth is required, unknown models are rejected, the fixture reaches both insight and deep-report prompts, result fields are normalized, and an upstream error becomes a safe `error_code`. Assert the UI can select Gemini/Gemma and display test status.
- [ ] **Step 2: Run focused tests to verify RED.** Run backend endpoint tests and the admin component test command; expect missing endpoint/UI behavior.
- [ ] **Step 3: Implement the smoke endpoint.** Reuse model validation and generation functions, record usage with a null submission id, time the call, normalize output, and map failures to stable categories (`missing_key`, `upstream_unavailable`, `invalid_output`, `unknown_model`). Keep action-password protection for this cost-incurring operation and require a client Confirm step.
- [ ] **Step 4: Extend the admin UI.** Source provider/model options from the backend catalog, add a Gemini provider option, keep separate insight/deep-report cards, and add a test button with confirm dialog and safe result display.
- [ ] **Step 5: Run GREEN and lint/build checks.** Run focused tests, `npm run lint`, and `npm run build` from `frinq-admin`.

### Task 4: Replace the question tab with a responsive draft editor

**Files:**
- Modify: `frinq-admin/app/components/QuestionsView.tsx`, `frinq-admin/app/components/QuestionForm.tsx`, `frinq-admin/app/components/QuestionSerialization.ts`, `frinq-backend/app/api/v1/admin.py`
- Test: `frinq-admin/app/components/QuestionSerialization.test.ts`, `frinq-admin/app/components/QuestionsView.test.tsx`, `frinq-backend/tests/test_api/test_admin_quiz_config.py`

**Interfaces:**
- Draft state is `QuestionDraft[]` with stable ids and explicit `order`.
- Save sends the full serialized ordered draft once; the backend returns the canonical saved config.

- [ ] **Step 1: Write failing serialization/editor tests.** Assert reorder preserves all question fields/options, selecting a question shows the editor beside the list at desktop width, narrow layout stacks it, and Save opens Confirm/Cancel rather than an action-password modal.
- [ ] **Step 2: Run focused tests to verify RED.** Run the existing serialization tests plus new editor tests; expect missing split layout/reorder/save behavior.
- [ ] **Step 3: Implement local draft/reorder state.** Add native pointer/drag handlers around a grab handle, selected-question state, and a single dirty draft. Avoid adding a drag dependency.
- [ ] **Step 4: Implement the responsive layout and one-save confirmation.** Keep the question list compact, render the current editor in the right pane, stack with CSS at narrow widths, and confirm once before sending the atomic payload.
- [ ] **Step 5: Remove routine action-password dependency only for question save.** Preserve bearer auth, payload validation, and audit logging; do not weaken destructive/model endpoints.
- [ ] **Step 6: Run GREEN and admin checks.** Run focused component/serialization tests, `npm run lint`, and `npm run build`.

### Task 5: Add local Compose runtime and emulator wiring

**Files:**
- Create: `frinq-backend/docker-compose.emulator.yml`, `frinq-backend/Dockerfile`, `frinq-admin/Dockerfile`
- Modify: `frinq-backend/.env.example`, `frinq-admin/.env.example`, `frinq-mobile/src/services/api/config.ts`, `frinq-mobile/README.md`
- Test: `frinq-backend/tests/test_boot_guard.py`, `frinq-mobile/src/services/api/__tests__/apiClient.test.ts`

- [ ] **Step 1: Write failing configuration checks.** Assert emulator API configuration uses the Android emulator host mapping, production rejects test-phone bypass variables, and Compose exposes only intended local ports.
- [ ] **Step 2: Run focused tests to verify RED.** Run the relevant backend boot-guard and mobile API config tests.
- [ ] **Step 3: Add minimal Compose services.** Define Postgres, Redis, backend, and admin with health checks, local-only ports, migration/start commands, and environment variables passed from ignored local env files. Do not bake provider keys into images.
- [ ] **Step 4: Add Dockerfiles and mobile host configuration.** Keep Metro/native Android execution compatible with the existing package scripts and document `10.0.2.2` for the standard Android emulator.
- [ ] **Step 5: Run Compose config and health checks.** Run `docker compose -f docker-compose.emulator.yml config`, then start services and verify backend health and admin response without printing secrets.

### Task 6: End-to-end security and provider verification

**Files:**
- Modify only when a verified failure requires it.
- Test: existing backend security/admin suites, mobile verify suite, admin lint/build, and a new `frinq-backend/scripts/smoke_emulator_stack.py` only if a reusable smoke script is needed.

- [ ] **Step 1: Run static/security checks first.** Run `python scripts/scan_for_secrets.py`, production boot-guard tests, admin security tests, CORS/origin tests, and dependency health checks.
- [ ] **Step 2: Run full backend tests.** From `frinq-backend`, run `python -m pytest -q`; record any pre-existing failures separately from regressions.
- [ ] **Step 3: Run mobile verification.** From `frinq-mobile`, run `npm run verify` and confirm API/session tests pass.
- [ ] **Step 4: Run admin verification.** From `frinq-admin`, run `npm run lint` and `npm run build`.
- [ ] **Step 5: Exercise the three accounts.** Seed the fixture, log in/reset `8000000001` twice, log in both chat accounts, send messages, reload history, and verify admin community/user conversation visibility.
- [ ] **Step 6: Exercise model switching.** For every configured OpenAI, Claude, Gemini, and Gemma key, run both connection checks; then complete one real reset-account generation with the selected insights model and selected deep-report model and verify stored output is clean and schema-valid.
- [ ] **Step 7: Report exact evidence.** Include commands, pass/fail counts, service URLs, unavailable provider keys, and any unresolved environment blocker without claiming unverified live behavior.
