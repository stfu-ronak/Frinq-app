# Handoff — Frinq admin/quiz-builder work, continuation prompt

Written because the current session is about to run out of budget. This is a
self-contained briefing for a fresh agent (or the same one after context
loss) to resume with zero prior context. Read this whole file before doing
anything.

## Repo

`F:\Project\Test\FrinqFull\Frinq` — monorepo: `frinq-backend/` (FastAPI +
asyncpg), `frinq-admin/` (Next.js), `frinq-mobile/` (React Native + TS).
Branch: `main`. Current HEAD as of writing: `41780c0`.

## What's already fully shipped and merged to main (do not redo)

- Admin panel Phases 1-4 (shared shell/nav, Accounts tab, Chat browser,
  Model Config tab with provider/model/effort picker + usage dashboard) —
  all committed, tested, code-reviewed. No memory doc needed here, it's
  just done.
- Two design specs, brainstormed and user-approved:
  - `docs/superpowers/specs/2026-07-28-dynamic-quiz-builder-design.md`
  - `docs/superpowers/specs/2026-07-28-admin-dashboard-analytics-design.md`
- Two implementation plans written from those specs (bite-sized TDD tasks,
  `superpowers:writing-plans` format):
  - `docs/superpowers/plans/2026-07-28-dynamic-quiz-builder.md` (12 tasks)
  - `docs/superpowers/plans/2026-07-28-admin-dashboard-analytics.md` (8 tasks)

## Execution method: superpowers:subagent-driven-development

The user explicitly chose this skill to execute both plans, then continue to
the original phased roadmap's Phase 5 (Events — see
`C:\Users\Admin\.claude\plans\cuddly-mapping-island.md` for that older plan
file's Phase 5 section; Phase 6 in that old file is superseded/absorbed by
the new dynamic-quiz-builder plan, don't redo it separately).

**Order the user asked for:** quiz builder plan → dashboard plan → Phase 5.

**How the skill works, in short:** one implementer subagent per task
(writes code, tests, commits), then one reviewer subagent per task (spec
compliance + quality gate). Findings trigger a fix loop (resume same
implementer, re-review) up to 5 rounds, then adjudicate/park. A ledger file
tracks everything so a fresh session can resume without re-reading this
whole transcript.

**To resume:** invoke `Skill("superpowers:subagent-driven-development")`,
then read the ledger below — it tells you exactly which task to dispatch
next. Do NOT re-dispatch completed tasks.

## Quiz builder plan — current state

**Ledger (read this first, it's the authoritative record):**
`F:\Project\Test\FrinqFull\Frinq\.superpowers\sdd\2026-07-28-dynamic-quiz-builder\progress.md`

**Done: Tasks 1-8 of 12**, all committed to `main`, all reviewed and
approved (two tasks needed fix rounds — details in the ledger). Commit
range so far: `c58adbf..41780c0`.

**Remaining:**
- **Task 9** — fetch quiz config at quiz start, with fallback. **IMPORTANT:
  this task's brief (in the plan file) is now missing two hard requirements
  that Task 6's and Task 7's reviews surfaced afterward — you MUST add these
  to Task 9's dispatch, they are not optional, read the ledger's Task 6
  entry for full detail:**
  1. `quizSubmissionService.ts`'s static `ANSWER_KEYS` completeness check
     (used at finalize time) will permanently break quiz completion the
     moment this task installs a fetched content-step set whose answer
     keys differ from the compiled-in defaults. It must become dynamic —
     same shape as Task 7's fix to the draft-save allowlist, but for the
     finalize-time completeness gate.
  2. `quizDefinition.ts`'s `setContentSteps` (added in Task 6) has zero
     validation. Task 9's fetch-and-install call site must guard against:
     an empty steps array, and any content-step `id` colliding with an
     `ONBOARDING_PREFIX` id (both currently corrupt navigation silently).
- **Task 10** — Borel display-heading clipping fix (typography.ts
  line-height bump). Low risk, independent of the others.
- **Task 11** — admin Questions tab shell (list/reorder/delete UI).
- **Task 12** — per-kind question authoring form.
- **Final whole-branch review** — dispatch on `sonnet` (see model note
  below), using `superpowers:requesting-code-review`'s template, pointed at
  the ledger's parked/deferred-minor lines so it can triage what must be
  fixed before calling this plan done.

**Files this plan touches most** (for quick orientation, not exhaustive —
each task's brief has the real file list):
- Backend: `app/core/quiz_config.py` (validation), `app/api/v1/quiz.py` +
  `app/api/v1/admin.py` (endpoints), `app/core/ai/insights.py` +
  `app/core/ai/prompts.py` (AI-prompt generic fallback), migration
  `020_quiz_config.sql`.
- Mobile: `src/features/quiz/domain/quizDefinition.ts` (now has
  `ONBOARDING_PREFIX`/`DEFAULT_CONTENT_STEPS`/`setContentSteps`/
  `currentLastStepId`), `src/features/quiz/screens/QuizStepScreen.tsx`,
  `src/storage/quizDraftRepository.ts` (now has `FIXED_ANSWER_KEYS`/
  `setDynamicAnswerKeys`/`isKnownAnswerKey`), `src/navigation/QuizNavigator.tsx`
  (Task 9's target, not yet touched).
- Admin: not started yet (Tasks 11-12) — will add
  `frinq-admin/app/questions/page.tsx` + `app/components/QuestionsView.tsx`
  + `app/components/QuestionForm.tsx`.

## ⚠️ Recurring failure mode this session — read before dispatching more implementers

**Several of `quizDefinition.ts`, `QuizStepScreen.tsx`,
`quizDraftRepository.ts`, `app/api/v1/admin.py`, and `app/core/ai/insights.py`
have PRE-EXISTING, UNRELATED uncommitted changes sitting in the working
tree** (leftover from an earlier uncommitted audit pass — see memory file
`frinq-audit-2026-07-26.md`; do not touch or investigate their content,
they belong to other work). Every implementer dispatched against these
files must be explicitly warned NOT to `git add` the whole file — isolate
their own hunks via `git add -p` or a hand-built patch + `git apply
--cached`, then verify `git diff --cached --stat` before committing.

**This actually went wrong once** (Task 7): round 1 leaked an unrelated
broken import + speculative code into the commit; the "fix" for that then
over-corrected and deleted 4 legitimate required keys. Both were caught
(one by the task reviewer, one by the controller reading the diff directly)
and fixed in later rounds. **Lesson: after every implementer claims
DONE on one of these files, read the actual commit diff yourself
(`git show --stat <sha>` + a skim of the real diff) before trusting the
report or dispatching the reviewer** — don't just trust "isolation verified"
in the implementer's own words.

## Dashboard plan — not started (0/8 tasks)

Plan file: `docs/superpowers/plans/2026-07-28-admin-dashboard-analytics.md`.
No SDD workspace/ledger created yet for this plan. To start: run this
skill's `sdd-workspace` script against that plan file, create the ledger,
then Task 1 (sort param on `GET /admin/submissions`).

Tasks 1-3 (sort dropdowns) are independent of the quiz builder plan and low
risk. Task 4 (`GET /admin/health`) needs a one-line `WorkerSettings`
change (`health_check_interval = 30`) — check nothing else touched that
file in the meantime. Tasks 6-8 (new charts) each touch `app/page.tsx` and
`app/api/v1/admin.py`, which by then will have accumulated a lot of this
session's other changes — re-confirm current line numbers before dispatch,
the plan's file:line references were accurate as of when it was written,
not necessarily by the time you get here.

## Phase 5 (Events) — not started

Not part of either new plan. It's Phase 5 of the ORIGINAL plan file:
`C:\Users\Admin\.claude\plans\cuddly-mapping-island.md`. That file's Phase 5
section has its own migration number already assigned (`020_events.sql` in
that older doc) — **this now collides** with the new quiz-builder plan's
`020_quiz_config.sql`, which was actually created and applied. Before
starting Phase 5, renumber its migration to whatever the next free number
is (check `frinq-backend/migrations/` for the current highest, don't trust
the old plan file's number). No brainstorming/spec/plan doc exists for
Phase 5 in the new `superpowers:writing-plans` format — the old plan file's
Phase 5 section is fairly detailed already (backend table + endpoints,
admin UI, mobile Events tab), so it's a judgment call whether to run it
through the full brainstorm→spec→plan pipeline again or execute directly
against the existing Phase 5 description via `superpowers:executing-plans`
or ad-hoc task-by-task work. Ask the user which they'd prefer if it's not
obvious when you get here.

## Standing constraints (from memory files — read these too)

- `C:\Users\Admin\.claude\projects\f--Project-Test-FrinqFull-Frinq\memory\frinq-standing-constraints.md`
  — never commit/push/deploy without a fresh ask (the SDD skill's per-task
  autocommit behavior is already covered by the user's explicit choice of
  "subagent-driven" execution + "lets move on" approval — this has held for
  the whole session so far without objection, don't re-ask for every task).
- `C:\Users\Admin\.claude\projects\f--Project-Test-FrinqFull-Frinq\memory\feedback_no_opus.md`
  — **never dispatch a subagent with `model: opus`.** Sonnet is the ceiling
  tier even for "most capable model" cases the skill's own guidance calls
  for (highest-risk implementations, final whole-branch reviews). Haiku for
  cheap/mechanical tasks as normal. This was an explicit, direct user
  correction mid-session — Task 6's dispatches used opus before this
  correction landed; everything after did not.
- Token/time budget: user has asked twice this session to move fast and
  conserve budget. Favor haiku/sonnet over slower iteration, don't over-ask
  for confirmation on mechanical fix-loop rounds, but don't skip task
  reviews entirely — they've caught real bugs (Task 2's incomplete kind
  allowlist + unparsed jsonb, Task 7's isolation failures) that would have
  shipped otherwise.

## Skills actually used this session, for reference

- `superpowers:using-superpowers` (meta — check for relevant skills before acting)
- `superpowers:brainstorming` (produced both specs)
- `superpowers:writing-plans` (produced both plans)
- `superpowers:subagent-driven-development` (currently executing the quiz
  builder plan; will execute the dashboard plan next)
- `superpowers:requesting-code-review` (template used for the plan-writing
  phase's spec review, and will be used again for each plan's final
  whole-branch review)

## Immediate next action

1. Read the quiz-builder ledger
   (`.superpowers/sdd/2026-07-28-dynamic-quiz-builder/progress.md`) to
   confirm Tasks 1-8 are marked complete (they are, as of this doc).
2. Extract Task 9's brief (`scripts/task-brief` against the plan file),
   dispatch its implementer with the two carried-forward requirements above
   folded in explicitly (they are NOT in the plan file's literal Task 9
   text — you must add them yourself when writing the dispatch prompt).
3. Continue task-by-task through 10, 11, 12, then the final whole-branch
   review, per the skill's normal loop.
4. Then start the dashboard plan the same way.
5. Then Phase 5, per the note above.
