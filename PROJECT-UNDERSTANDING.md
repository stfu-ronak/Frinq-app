# Frinq — Project Understanding

_Generated 2026-07-26 from a full read-only audit of all four sub-projects (backend, mobile, frontend, admin). This is a living reference: the "what/why/how" of the whole system in one place._

---

## 1. What Frinq is

Frinq is an India-focused social / community product built around a **personality quiz**. A user signs up by phone OTP, accepts Terms/Privacy, answers a short personality quiz (optionally recording short voice answers), and an LLM turns those answers into a personal **archetype** plus a shareable **"story" card** and a longer **deep report**. The user is then auto-placed into an archetype-based **community** with **realtime chat**.

The onboarding is **server-authoritative**: the mobile client never keeps its own "onboarding complete" flag — it asks the backend what screen to show next based on the account's state (boot state machine). This is the single most important design principle in the app.

Core flow, end to end:

```
Phone OTP  ->  Legal acceptance (Terms/Privacy gate)  ->  Personality quiz (+ optional voice)
   ->  AI insight generation (archetype + story card + deep report)
   ->  Auto-join archetype community  ->  Realtime WebSocket chat
```

---

## 2. System architecture

Four deployables plus shared infrastructure.

| Sub-project | Stack | Role |
|---|---|---|
| `frinq-backend` | FastAPI + asyncpg + Redis + ARQ workers | The whole API, AI pipeline, realtime, ops/admin endpoints |
| `frinq-mobile` | Bare React Native 0.86 | The real consumer app (quiz + chat) |
| `frinq-frontend` | Next.js static export | Public marketing/legal site (download links, Terms/Privacy/support/delete-account) |
| `frinq-admin` | Next.js 16 (SSR) | Internal ops/moderation console (`admin.frinq.in`) |

Shared infra: **DigitalOcean App Platform** (`.do/app.yaml`), **Postgres/Supabase** (primary DB), **Redis** (rate limits, pub/sub, ARQ queue; runs locally as docker container `frinq-chat-redis`), **Firebase** (FCM push + Crashlytics), **Twilio** (OTP SMS + WhatsApp), **OpenAI** (AI insight generation).

Post "Task 43" the product was cut over to native: the **consumer web app was reduced to a static marketing/legal site** — all quiz/OTP/chat now live only in the mobile app.

---

## 3. The AI story-generation logic (the heart of the product)

- **Trigger**: quiz submission enqueues an ARQ worker task `generate_quiz_insights` (`app/workers/tasks/quiz_insights.py`).
- **Provider**: OpenAI, model `OPENAI_MODEL` (currently `"gpt-5.5"`, `app/core/config.py:32`), key `OPENAI_API_KEY`. Called via raw `httpx` POST to `https://api.openai.com/v1/chat/completions` (`app/core/ai/openai_client.py:108`). A Claude path (`claude_client.py`, `claude-sonnet-4-6`) exists but is idle, switched by `INSIGHTS_PROVIDER`.
- **Two parallel calls** (`quiz_insights.py:131-133`):
  1. `generate_insights` — archetype slug, headline, stats, tags (`insights.py:277`).
  2. `generate_deep_report` — the longer narrative report (`openai_client.py:227`).
- **Pipeline**: quiz answers -> `annotate_answers` (token expansion) -> **PII scrub** (strip name/phone) -> JSON-mode prompt + few-shot examples (`app/core/ai/prompts.py`) -> parse and clamp to a fixed char-limited schema (`openai_client.py:202`) -> `archetype_slug` validated against the fixed taxonomy before persist (`quiz_insights.py:153`).

The archetype taxonomy is fixed (the illustration set names them: hidden-door, curious-outsider, inside-voice, sharp-empath, wild-card, quiet-storm, salt-air, pocket-universe, backup-plan, wandering-compass, late-night-mind, bridge-person, open-hand, soft-skeptic, slow-burn, long-fuse, quiet-anchor, open-window, velvet-rebel, quiet-rioter, tender-realist, steady-flame, soft-anchor, patient-witness).

---

## 4. Sub-project detail

### 4.1 Backend (`frinq-backend`)

- **Entrypoint**: `app/main.py` (FastAPI, `lifespan` initialises the DB pool). Production: `uvicorn app.main:app --proxy-headers` (`.do/app.yaml`).
- **18 routers** (`main.py:155-171`): auth, communities, legal, moderation, otp, users, questionnaire, profile, push, quiz, realtime, sessions, tracking, voice, whatsapp, admin, health, social.
- **Workers**: ARQ, three tasks — `generate_quiz_insights`, `build_profile` (legacy, see dead code), `send_community_push`.
- **Core modules**: `ai/`, `profile/` (legacy), `export/`, `otp`, `rate_limit`, `redis_client`, `realtime`, `session`, `push`, `moderation`, `whatsapp`, `production_guard`, `security_headers`, `age_gate`, `reverify`.
- **Migrations**: 15 SQL files, `001`–`015` (`migrations/`).
- **Connections** (all pooled/reused correctly): asyncpg pool once at startup (min 1 / max 10, `statement_cache_size=0` for pgbouncer); Supabase, Redis + pub/sub, ARQ, Firebase, Twilio all lazy singletons.
- **Tests**: pytest, ~379 test functions across 47 files. Run from `frinq-backend/`: `python -m pytest`.

### 4.2 Mobile (`frinq-mobile`) — the real consumer app

- **Boot**: `App.tsx` -> `src/app/App.tsx`; `BootController` resolves boot state from the server (`bootMachine.ts`); `RootNavigator` is a pure `BootState -> screen` map. One `NavigationContainer`.
- **Main tabs**: Community / Profile / Settings, each a nested native stack.
- **Services** (`src/services/*`): `api` (apiClient, httpTransport, contracts), `session` (SessionCoordinator — in-memory access token, single-flight refresh), `push` (Firebase messaging), `audio` (voice recording, foreground-only, 120s cap), `realtime` (CommunitySocket + pure `realtimeMachine`), `telemetry` (analytics, crashReporter).
- **Storage**: AES-256 MMKV for quiz drafts + non-secret prefs; **Keychain/Keystore** for the refresh token and the MMKV key; RN-FS cache for voice clips. Access token is memory-only.
- **Design system**: a real, test-enforced token system — `colors.ts` (single hex source, `no-raw-hex.test.js` enforces it), `typography.ts` (**Borel** display + **Vastago** body), `spacing.ts` (44/48 touch targets), `motion.ts` (with a reduced-motion recipe). 22-primitive shared component library. Portrait-locked, single warm palette (no dark mode by design). Accessibility baseline is genuinely good.
- **Tests**: `npm test` (jest). Full gate: `npm run verify` (lint + typecheck + test).

### 4.3 Frontend (`frinq-frontend`) — public site

- Minimal Next.js **static export** (`output: "export"`): a download landing page plus legal/support/delete-account pages. No auth, no chat, no quiz (all moved to native).
- The only network call is consent-gated analytics `track()` (POST `/api/v1/track`), with a fixed event allowlist and no PII.
- **Design tokens exist but are bypassed** — pages hardcode literal hex utilities (`bg-[#F5F0E8]`, `text-[#2A1810]`, etc.) instead of the defined `@theme` tokens.
- **Tests**: `npm run test` (vitest); e2e `npx playwright test`; lint/build via `npm run lint` / `npm run build`.

### 4.4 Admin (`frinq-admin`) — ops console

- Next.js 16 **SSR** (chosen specifically so it can send security headers: HSTS, `X-Frame-Options: DENY`, CSP, `Referrer-Policy: no-referrer`, `noindex`). Admin key kept in `sessionStorage` only; all auth via `Authorization: Bearer` + `X-Action-Password` headers; audio/exports fetched as blobs so the key never rides in a URL.
- Three surfaces: **main dashboard** (7 tabs — overview/analytics/insights/funnel/journey + users/testing, with per-user actions: retry-AI, flags, follow-ups, delete, export), **moderation queue** (report triage: resolve / delete message / suspend 7d / permanent ban), **RSVP dashboard** (WhatsApp campaign funnel + 1:1 reply).
- **No test suite.** Lint/build only.

---

## 5. Security model

- **Consumer auth**: phone OTP -> rotating JWT session (`deps.get_current_account`), refresh token HMAC-peppered and single-use rotated. A **legacy** Supabase-JWT path (`deps.get_current_user`) is still live for profile/questionnaire/users/auth routes.
- **Token storage (mobile)**: refresh token in device Keychain/Keystore; access token in memory only.
- **Admin auth**: single shared static `ADMIN_KEY` (Bearer) + a second static `X-Action-Password` for destructive actions.
- **Rate limits**: Redis-Lua atomic, fail-closed on OTP and ws-ticket issuance.
- **Kill-switches** (env-only): `CHAT_DISABLED`, `OTP_DISABLED`, `QUIZ_DISABLED`, `PUSH_*_DISABLED`.
- **PII discipline**: logs/crash-reports/analytics scrub name/phone/message/token; crash reporter has dual-layer redaction; mobile analytics is off by design.
- **Boot guard**: `production_guard` blocks dev-default secrets, wildcard CORS, and http origins at startup in prod.

---

## 6. Current health snapshot (from the 2026-07-26 audit)

Overall: **architecture is solid and disciplined**; the issues are specific and fixable, not structural. Key flags, by severity:

**App-breaking risk**
- `OPENAI_MODEL="gpt-5.5"` is an unverified model id — if wrong, every quiz AI call 400s and story-gen fails. Needs a live test with a real `OPENAI_API_KEY`.
- `/health/dependencies` checks `ANTHROPIC_API_KEY` for AI health while the live provider is OpenAI — the health page can report "AI ok" while every quiz is failing.

**Security**
- The `rest_authenticated` rate-limiter is defined but wired to **no** route — quiz submit/retry, profile, and push registration have no per-user limit.
- `/quiz/start` is fully unauthenticated and returns an existing submission id per phone/24h — a phone-enumeration oracle.
- `ADMIN_KEY` has a weak default (`"frinq-admin"`), is a single shared static key with no rotation/identity, and admin login has no MFA / IP allowlist / lockout.
- Frontend site has no CSP/HSTS at the hosting layer (`.do/app.yaml`).

**Admin control gaps** (relative to "admin controls everything")
- No consumer-user management (users only reachable via a report), no **unban/unsuspend** (one-way), no audit-log view, no kill-switch/feature-flag UI (all env-only), no force-logout, no community management, no metrics UI.

**Correctness**
- Mobile voice-upload: the 401 retry re-sends a spent file-backed `FormData` stream, so a refreshed retry likely uploads an empty body.
- No request timeout/AbortController on the mobile HTTP transport — a hung request never aborts.

**Size / dead code**
- ~45 MB of archetype PNGs + a 46 MB zip in `frinq-frontend/public` are unreferenced (native app owns those images now).
- Dead font families (Urbanist / Vastago / Borel / Motive `.ttf` dupes) copied wholesale into both web apps — but **mobile genuinely uses Borel + Vastago**, so pruning is web-only.
- `App/Figma/` at repo root is a committed design dump (mockups + a plan.txt), outside all four code projects.
- Backend legacy profile pipeline (`build_profile`, `core/profile/*`, `profile.py`, `questionnaire.py`, tables `user_profiles`/`questionnaire_responses`, the `voyageai` dep) is orphaned from the OTP-native flow — a removal candidate, but must be cross-checked against the mobile client first.

**UI/UX**
- Web apps bypass their own design tokens (literal hex); the admin **RSVP page uses a different design system** (stone/emerald) than the rest of the console; small sub-WCAG text and missing focus states in the web apps. Mobile is the exception — clean and consistent.

---

## 7. How to run / test

| Sub-project | Test | Lint | Build |
|---|---|---|---|
| backend | `python -m pytest` | — | `uvicorn app.main:app` |
| mobile | `npm test` (jest) / `npm run verify` | `npm run lint` / `npm run typecheck` | gradle `bundleRelease` |
| frontend | `npm run test` (vitest) / `npx playwright test` | `npm run lint` | `npm run build` |
| admin | (none) | `npm run lint` | `npm run build` |

Local Redis: docker container `frinq-chat-redis` (`redis:7-alpine`). Some backend integration tests need it live.

---

## 8. Explicitly out of scope / deferred

- iOS build/verification (no Mac available).
- Twilio live testing (OTP/WhatsApp) — deferred.
- Real counsel-reviewed legal content — placeholder "DRAFT" copy is wired end to end.
- Prod Firebase project swap — mobile currently ships `frinq-app-test` `google-services.json`.
- DB credential rotation — the real Supabase secrets in `.env` still need rotating.
