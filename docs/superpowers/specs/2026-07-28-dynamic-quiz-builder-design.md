# Dynamic Quiz Builder — Design

## Context

The mobile quiz's questions (`frinq-mobile/src/features/quiz/domain/quizDefinition.ts`) are a
flat, compiled-in TypeScript array (`QUIZ_STEPS`), each step a typed object discriminated by
`kind` (`intro`, `text`, `date`, `singleChoiceCard`, `singleChoiceList`, `multiChoiceTags`,
`rapidFire`, `opinions`, `preferences`, `voiceOrText`, `socialVerification`). `QuizStepScreen.tsx`
already dispatches purely on `kind` to the matching template component — every rendering template
this design needs (all 4 requested MCQ layouts, rapid fire, slider, text with/without voice)
**already exists and is production-tested**. This is not a UI-building project; it's a project to
let an admin author `QuizStep`-shaped data and get it onto the phone without an app release.

The previous plan's Phase 6 scoped this narrowly ("edit text/options/reorder *existing-kind*
steps only, no new kinds, no app-release-free new step types"). This design supersedes that scope:
the admin can now add brand-new questions, of any already-supported kind, at any position, and
they take effect on mobile without an app release.

## Scope boundary (confirmed with user)

- **Onboarding steps stay fixed**: `s0`/`name`/`city`/`age`/`gender`/`pronoun`/
  `social_verification` and their surrounding `intro` screens are compiled into the app as today —
  they map to real account fields (`users.name`, `users.city`, etc.), not the generic `answers`
  JSONB blob, and are out of scope for this builder.
- **Everything from `social_type` onward** ("content steps") is admin-managed: add, remove,
  reorder, edit copy/options, freely.
- **Rapid Fire** stays a single block (matches today's product) — admin edits its list of pairs,
  does not add multiple separate rapid-fire sections.
- **Slider**: each slider becomes its own standalone step (one slider = one question), not bundled
  groups of four like today's `preferences` step. Existing `preferences` step is left as one
  legacy step in the seed data; new slider questions the admin adds are each their own step.
- **MCQ layouts exposed in the builder**: 4 total —
  1. Tag-flow with optional "anything else?" free text (`multiChoiceTags`, `layout: 'chips'`)
  2. Vertical icon-row list (`multiChoiceTags`, `layout: 'list'`)
  3. "Would you rather" stacked boxes (`singleChoiceList`, `variant: 'box'`)
  4. Description card (`singleChoiceCard`) — bigger cards with title + one line of description
- **Text questions** get one toggle: "allow voice answer" — off renders via the existing
  `TextInputTemplate`/`text` kind, on renders via the existing `VoiceOrTextTemplate`/`voiceOrText`
  kind. Same underlying templates, just an admin-facing toggle instead of two separate kinds.

## Data model

New backend table `quiz_config` (versioned, JSONB, never mutated in place):

```sql
CREATE TABLE quiz_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INT NOT NULL,
  steps JSONB NOT NULL,        -- array of QuizStep-shaped objects, "content steps" only
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);
CREATE UNIQUE INDEX quiz_config_one_active ON quiz_config (is_active) WHERE is_active;
```

Seed row (version 1, `is_active = TRUE`) = today's content steps (`social_type` through
`last_question`) copied in verbatim, so day one changes nothing until an admin touches it.

Editing = insert a new version with `is_active = TRUE`, flip the previous row's flag off in the
same transaction. Rollback = re-activate an old version row (kept for history, never deleted).

## Backend validation

A step's `kind` determines its required fields — validated server-side before a version can be
saved, mirroring the model-config validation philosophy already used for Phase 4 (never trust the
admin client alone):

| kind | required fields | notes |
|---|---|---|
| `text` | `answerKey`, `prompt` | + `allowVoice: bool` (builder-only field, maps to `voiceOrText` kind when true) |
| `singleChoiceCard` | `answerKey`, `prompt`, `options` (≥2, each `value`+`label`, optional `description`) | |
| `singleChoiceList` | `answerKey`, `prompt`, `options` (≥2), `variant` (`pill`\|`box`) | `box` requires exactly 2 options |
| `multiChoiceTags` | `answerKey`, `prompt`, `options` (≥2 strings), `layout` (`chips`\|`list`), optional `allowCustom` | |
| `slider` (new, single) | `answerKey`, `prompt`, `leftLabel`, `rightLabel` | one slider, not a `sliders` array |
| `rapidFire` | `pairs` (≥1, each `a`+`b`), `secondsPerPair` | admin edits the ONE existing block's pairs |
| `intro` | `heading`, `ctaLabel` | section-title screens between groups |

- `answerKey` must be unique across the whole content-steps array and must not collide with any
  onboarding `answerKey` (name, city, dob, gender, pronoun, social_linkedin, social_instagram) or
  any already-reserved key in `frinq-mobile/src/features/quiz/storage/answerSchema.ts`'s
  `ANSWER_KEYS` allowlist — reject the save with a clear error rather than silently colliding.
- Reject unknown `kind` values outright (closed set, matches the mobile union type exactly).

## Mobile wiring

- `QuizNavigator`/quiz-start flow fetches `GET /api/v1/quiz/config` **once**, at quiz start (not
  mid-flow — an admin edit mid-session must never shift step indices under someone already
  answering). Response: `{ version: number, steps: QuizStep[] }`.
- Concatenates fetched `steps` after the fixed compiled-in onboarding prefix into the same
  in-memory step array `nextStep`/`previousStep`/`getStep`/`answerKeysForStep` already operate
  over — those functions get parameterized on a step array instead of closing over the
  module-level `QUIZ_STEPS` constant.
- On fetch failure (network, malformed response, backend down): falls back to the existing
  compiled-in `QUIZ_STEPS` content-steps slice — quiz still works, matches the offline-tolerant
  pattern already used elsewhere in this app (e.g. quiz draft persistence).
- New `allowVoice` builder field on `text` steps maps to using `VoiceOrTextTemplate` instead of
  `TextInputTemplate` at render time — no new mobile template needed, just a mapping rule.
- New single-`slider` kind renders via a trimmed version of the existing `PreferencesTemplate`
  (currently takes a `sliders` array of ≥1) — passing a one-element array reuses the existing
  `SnapSlider` component with zero new mobile code.

## AI-insights generic-answers fix

`app/core/ai/insights.py`'s `_build_insights_prompt` builds a **fully rigid, named-placeholder**
prompt (`prompts.INSIGHTS_USER.format(birth_month=..., social_type=..., ...)` — roughly 25 named
fields, each tied to one specific existing `answerKey`). A brand-new admin-added question's answer
would be silently stored but **never reach this prompt** without a change here.

By contrast, `app/core/ai/openai_client.py`'s `generate_deep_report` is already fully generic — it
JSON-dumps the entire (annotated, scrubbed) answers dict, so new questions already flow into the
deep-report/vibe-report generation with zero changes needed.

Fix: add one trailing section to `INSIGHTS_USER`'s template and `_build_insights_prompt`'s return —
a generic "additional context" block built by iterating `answers.items()`, skipping every key
already covered by the ~25 named placeholders (a `_KNOWN_ANSWER_KEYS` frozenset), scrubbing any
remaining string/list values the same way (`_scrub_free_text`), and formatting them as
`"{key}: {value}"` lines. Empty when there are no admin-added questions (today's behavior
unchanged); populated automatically the moment an admin adds a new content step.

## Admin builder UI

New **Questions** top-level nav tab (own route, matching `/moderation`/`/model-config`'s
standalone-page pattern):

- Ordered list of current content steps (kind badge + prompt/heading preview per row).
- "+ add question" → pick kind (Text [+ allow-voice toggle] / MCQ [pick 1 of 4 layouts] / Slider /
  Rapid Fire [only if none exists yet — otherwise "edit rapid fire" opens the existing block] /
  Intro screen) → a form scoped to that kind's required fields (reusing `PasswordModal` and the
  existing Tailwind form patterns from `AccountsView`/`ChatBrowserView`).
- Up/down reorder arrows per row (no new drag-and-drop dependency, matches the established
  "avoid unrequested new libraries" convention already used elsewhere in this admin).
- Edit existing step inline (same form, pre-filled); delete with confirm.
- Save = `PUT /admin/quiz-config` — validates the whole array server-side, inserts a new version,
  flips `is_active`. Every save is a full-array replace (simplest correctness story — no partial
  update races), guarded by the same action-password pattern as other destructive admin actions.
- A lightweight "preview" — reuses the mobile-side kind→template mapping conceptually by just
  rendering a read-only summary card per step (prompt + options), not a live device preview
  (out of scope; a full mobile-rendering preview inside the admin web app is a bigger, separate
  ask if wanted later).

## Testing

- Backend: unit tests for the per-kind validation (reject missing required fields, reject
  duplicate/reserved `answerKey`, reject unknown `kind`, reject `singleChoiceList` `box` variant
  with ≠2 options), a test proving `PUT` inserts a new version and flips `is_active` rather than
  mutating in place, and a test proving `GET /api/v1/quiz/config` returns only the active version.
- Backend: test for the `_build_insights_prompt` generic-fallback section — an answers dict with
  an unrecognized key produces a non-empty "additional context" block; an answers dict with only
  known keys produces today's exact prompt output (no regression).
- Mobile: a test proving `nextStep`/`previousStep`/`answerKeysForStep` work correctly against a
  fetched (non-default) step array, and a test proving the fetch-failure fallback path renders the
  compiled-in content steps unchanged.
- Admin: manual click-through (no existing test suite for `frinq-admin`, consistent with prior
  phases in this plan).

## Out of scope

- Editing/reordering/removing onboarding steps (name/city/age/gender/pronoun/social verification).
- Multiple independent Rapid Fire blocks (stays a single block).
- Brand-new step *kinds* beyond the palette above (still needs an app release, per the original
  plan's confirmed constraint — this design only removes the "can't add more of the existing
  kinds without a release" limitation, not "can't invent an entirely new kind of interaction").
- Live, on-device-accurate preview inside the admin web app (read-only summary card only).
- Conditional/branching quiz logic (the product has none today; not introduced here).
