# Comprehensive Analysis & Architecture Report: Frinq Platform

## Executive Summary & Core Concept

**Frinq** is an intentional, AI-powered friendship and social matching platform designed to foster deep, authentic, real-world human connections. Unlike traditional swipe-based dating or social networking apps that encourage superficial judgments, Frinq positions itself as **"a quiet experiment in friendship."**

It combines vintage editorial design aesthetics with psychological trait modeling and state-of-the-art Generative AI. The platform guides candidates through a 38-step immersive questionnaire—collecting psychological traits, storytelling clips, lifestyle preferences, and boundary choices—before running a multi-tier AI pipeline to generate a personalized **"Vibe Report"** and pair users based on latent psychological compatibility.

---

## Technical Stack Overview

```
                      +------------------------------------+
                      |     frinq-frontend (Next.js 16)   |
                      |   React 19 / TypeScript / Tailwind |
                      +-----------------+------------------+
                                        |
                                HTTP REST / JSON
                                        |
                      +-----------------v------------------+
                      |     frinq-backend (FastAPI)       |
                      |   Python 3.12 / Asyncpg / Pydantic |
                      +--------+-----------------+---------+
                               |                 |
             +-----------------+                 +-----------------+
             |                                                     |
+------------v------------+                               +--------v--------+
|   PostgreSQL / Supabase |                               |   Redis + ARQ   |
|   + pgvector (1024-dim) |                               |   Worker Tasks  |
+-------------------------+                               +--------+--------+
                                                                   |
+------------------------------------------------------------------v--------+
|                               AI Engine                                  |
|  - OpenAI GPT-5.5 (Deep Vibe Reports)                                    |
|  - Anthropic Claude Sonnet 4.6 (Trait Extraction & Summarization)        |
|  - Voyage AI (voyage-3-large 1024-dim Embeddings)                         |
+---------------------------------------------------------------------------+
```

| Layer | Component | Technologies & Tools |
| :--- | :--- | :--- |
| **Frontend** | Framework | **Next.js 16.2.6** (App Router, dynamic rendering), **React 19**, **TypeScript 5.8** |
| | Styling | **Tailwind CSS v4**, `@font-face` custom fonts, View Transitions API |
| | Analytics | Google Analytics (`gtag`), Microsoft Clarity, Custom event logger (`/api/track` -> `events.jsonl`) |
| | Client Tools | `html-to-image` (PNG export for share cards), Playwright (E2E testing) |
| **Backend** | Framework | **FastAPI 0.115**, **Uvicorn 0.30**, **Pydantic Settings** |
| | Database | **PostgreSQL** (Supabase), **`asyncpg`** (raw SQL, transaction pool compatible) |
| | Vector Engine | **`pgvector`** extension with HNSW Cosine Indexing (`vector(1024)`) |
| | Task Queue | **Redis 5.0** + **ARQ 0.25** (distributed background worker pipeline) |
| | Audio Storage | Direct PostgreSQL `BYTEA` storage (ephemeral deployment safe) |
| **AI Models** | Reveal & Reports | **OpenAI GPT-5.5** (Deep Vibe Reports & reasoning analysis) |
| | Trait Pipeline | **Anthropic Claude Sonnet 4.6** (Free-text trait extraction & profile synthesis) |
| | Embeddings | **Voyage AI `voyage-3-large`** (1024-dimensional psychological vectors) |
| **Integrations**| Auth & Messaging | **Twilio Verify API** (WhatsApp OTP), **Twilio Messaging** (WhatsApp notifications & webhooks), **LinkedIn OIDC** |

---

## UI/UX Theme & Design System

### Aesthetic & Concept
Frinq deliberately rejects digital clutter, bright saturated neons, and gamified animations. Instead, it utilizes a **retro-editorial, vintage paper aesthetic** reminiscent of a personal journal, intimate written letter, or literary print magazine.

* **Tone of Voice**: Soft, quiet, introspective, respectful, and deliberate.
* **Single-Page Illusion (`UrlMask.tsx`)**: Intercepts `pushState` and `replaceState` to lock the visible address bar to `/` throughout the 38 quiz steps, preventing browser standard header distraction while maintaining full Next.js step history in memory.

### Color Palette Tokens
| Token Name | Hex Code | Visual Role |
| :--- | :--- | :--- |
| **Cream** | `#F5F0E8` / `#F4EEE2` | Base paper canvas background |
| **Deep Brown** | `#2A1810` / `#201A15` | Primary typography, dark borders, CTA buttons |
| **Muted Tan** | `#8B7355` / `#6B5D4A` | Secondary text, step indicators, labels |
| **Crimson Red** | `#7C1C0B` / `#8A2018` | Brand accent, active selection chips, dot accents, envelope wax seal |

### Typography System
* **Display Font (`Things`)**: Custom serif font (`Things-Regular.ttf`) used for quiz titles, archetype headers, quotes, and report highlights.
* **Body Font (`Motive`)**: Custom sans-serif font family (`Motive-Light`, `Motive-Regular`, `Motive-Bold`) used for option labels, inputs, chips, and body text.

### Visual Micro-Interactions
* **Envelope Reveal Animation**: Multi-stage interactive sequence (closed sealed envelope -> top flap rotates 175° -> archetype card peeks & slides upward -> scales full screen -> expands into full Vibe Report).
* **Grid Image Blend**: Uses CSS `mixBlendMode: "darken"` on 2x2 mobile grid illustrations to seamlessly blend PNG backgrounds into the paper background.

---

## User Journey & Onboarding Funnel

The frontend funnel spans **38 distinct step routes**:

```
[ Splash / Landing ] --> [ Intro / Expectations ] --> [ Name & WhatsApp OTP ]
                                                             |
[ Deep Signals / Story ] <-- [ Hobbies / Lifestyle ] <-- [ Demographics ]
           |
[ Rapid Fire (10s) ] --> [ Preferences / Sliders ] --> [ Sealed Envelope / Reveal ]
                                                             |
                                                   [ AI Vibe Report Reveal ]
```

1. **Splash & Verification (`/`, `/s0`, `/name`, `/phone`, `/verify`, `/social-verify`)**:
   * Landing hero text ("find your frinq.") with custom duck illustration (`landing-ducks.png`).
   * Phone entry triggers Twilio WhatsApp OTP send.
   * OTP verification issues a signed JWT phone token and initiates early backend quiz tracking to capture partial completions.

2. **Demographics & Social Style (`/city`, `/age`, `/ready`, `/nahh`, `/social-type`, `/scene`, `/saturday-night`)**:
   * Captures NCR zone, age, dealbreakers ("nahh"), social archetype (e.g. introverted vs extraverted), substance preferences ("i don't drink or smoke"), and weekend habits.

3. **Hobbies, Interests & Travel (`/hobbies`, `/red-flags`, `/interests`, `/sweet`, `/trip`, `/travel-style`, `/connection-mode`, `/event-yes`, `/event-no`, `/would-rather`, `/meeting-style`)**:
   * Hashtag chip selector with auto-tokenization and suggestion chips.
   * Travel style choices, meeting venue preferences, and red flag indicators.

4. **Deep Storytelling & Values (`/story`, `/connection`, `/show-up`)**:
   * Open-ended text inputs (with optional voice clip upload support stored via WebM audio) asking candidates to describe a personal story, friendship expectations, and how they show up for loved ones.

5. **Rapid-Fire & Preference Sliders (`/rapid-intro`, `/rapid-fire`, `/glorious`, `/opinions`, `/preferences-intro`, `/preferences`, `/last-question`)**:
   * 10-second rapid binary choice round.
   * Continuous preference sliders measuring behavioral tendencies.

6. **The Vibe Box & AI Reveal (`/vibe-box`)**:
   * Polled loading screen -> Sealed Wax Envelope -> Animated Card Slide -> Full AI Vibe Report display with launch waitlist status (100-user gate).

---

## Backend Architecture & AI Pipeline

### Database Schema Highlights (`frinq-backend`)

* **`users`**: Core candidate identity (`id` UUID, `supabase_uid`, `phone`, `display_name`, `age`, `ncr_zone`, `schedule`).
* **`quiz_submissions`**: Quiz response records stores JSONB `answers`, partial page progress (`last_page`), status (`pending` -> `processing` -> `done`), and generated AI artifacts:
  * `headline` & `spirit_animal` (Archetype title).
  * `insights` (3 dot-connecting psychological points).
  * `share_card` (PNG visual export metadata).
  * `deep_summary` (Multi-section structured psychological breakdown).
* **`user_profiles`**: Comprehensive psychological trait vector store:
  * **Big Five**: Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism.
  * **HEXACO**: Honesty-Humility, Connection Anxiety, Connection Avoidance, Reliability.
  * **Schwartz Values**: Self-direction, Stimulation, Security, Universalism, Tradition, Conservation.
  * **RIASEC & Activities**: Realistic, Investigative, Artistic, Social, Enterprising, Conventional.
  * **Embeddings**: `vector(1024)` generated via Voyage AI with HNSW Cosine distance indexing.
* **`matches`**: Candidate pairs with `composite_score` and 9 sub-scores (`activity`, `big_five`, `values`, `bonding`, `communication`, `h_factor`, `lifestyle`, `intent`, `vibe_text`).
* **`voice_clips`**: Audio file storage (`BYTEA` binary payload directly in SQL).

### Psychological Profile Extraction Engine

```
[ Raw Quiz JSONB + Voice Clip ]
             |
   Deterministic Seeding (builder.py) ---> Base Big Five, Schwartz & RIASEC scores
             |
   LLM Trait Extraction (extractor.py) -> Anthropic Claude Sonnet 4.6 nudges traits
             |
   AI Narrative (summariser.py) -----------> Synthesizes narrative & latent tags
             |
   Voyage AI Vectorization ---------------> Produces 1024-dim embedding vector
             |
   Supabase pgvector Store ---------------> HNSW Cosine Matchmaking index ready
```

1. **Deterministic Seeding (`builder.py`)**: Converts discrete quiz choices into baseline numerical scores for Big Five, Schwartz Values, and RIASEC codes.
2. **LLM Free-Text Extraction (`extractor.py`)**: Runs Claude Sonnet 4.6 over free-text answers (`story`, `looking_for_text`, `hobbies_text`) to extract latent psychological indicators and confidence metrics.
3. **AI Narrative Synthesis (`summariser.py`)**: Generates an overall `ai_summary` narrative and `latent_tags`.
4. **Vector Embedding**: Generates a 1024-dimensional embedding vector via Voyage AI (`voyage-3-large`) for exact or approximate nearest neighbor matching.
5. **Archetype Taxonomy (`archetypes.py`)**: Maps candidate choices against a taxonomy of 30+ custom social archetypes (e.g., *Quiet Anchor*, *Velvet Rebel*, *Soft Anchor*, *Quiet Storm*).

---

## Security, Governance & Production Safeguards

1. **PII Scrubbing (`app/core/ai/pii.py`)**: All candidate text is scrubbed for phone numbers, email addresses, and full names before being sent to third-party LLM APIs (OpenAI & Anthropic).
2. **Double-Header Admin Protection**: Admin endpoints (`/api/v1/admin`) require both an `ADMIN_KEY` header and an explicit `X-Action-Password` (`ADMIN_ACTION_PASSWORD`) header for destructive or override actions.
3. **Payload Cap Middleware**: Custom FastAPI middleware enforces a 1MB payload cap across standard REST routes, elevated strictly to 6MB on `/api/v1/voice` for Opus audio files.
4. **Production Fail-Fast**: The backend inspects environment configuration on startup and immediately halts execution if dev keys, unhandled CORS origins, or missing admin passwords are present in a production environment.

---

## Key Maintenance & Refactoring Checklist

Based on project audit documentation (`CHANGES.md` and `changes we need to work on.txt`):

* [ ] **Back Navigation**: Fix router state restoration when clicking back on "Let's get to know you" (`/s0`) and post-WhatsApp verification steps.
* [ ] **Visual Feedback**: Enhance button state color transitions across option selectors and continuous slider release behaviors.
* [ ] **Copy & Tone Re-framing**:
  * Update `/s0` intro text to eliminate negative phrasing ("we are trying to understand you. it's difficult...").
  * Reframe "weird hobby" question (`/hobbies`) to more welcoming phrasing.
  * Adjust "So. are you ready" (`/ready`) header to "Are you ready?".
  * Clean up top text on final reveal page ("Before we show you...").
* [ ] **Interstitials**: Remove placeholder string labels (`'perfection.'`, `'sweet.'`, `'glorious.'`) from transition screens (`/ready`, `/sweet`, `/glorious`).
* [ ] **Opinion Visuals**: Redesign `/opinions` screen to stand out visually from `/rapid-fire`.

---

*Report compiled following thorough analysis of `frinq-backend` and `frinq-frontend` repositories.*
