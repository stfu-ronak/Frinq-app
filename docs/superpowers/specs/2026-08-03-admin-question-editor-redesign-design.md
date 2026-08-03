# Admin Question Editor Redesign — Design

## Context

`frinq-admin/app/questions` (`QuestionsView.tsx` + `QuestionForm.tsx` + `QuestionPreview.tsx`,
built in earlier passes — see `2026-07-28-dynamic-quiz-builder-design.md` and this session's
QuestionPreview rewrite) lets an admin author quiz steps against the `quiz_config` table without
an app release. Three real usability problems remain, all confirmed with the user:

1. **Wasted width.** The page wrapper is `max-w-4xl mx-auto` — on a laptop screen the editor sits
   in a narrow centered column with hundreds of pixels of empty margin on both sides.
2. **Confusing options entry.** Every multi-item field (choice options, rapid-fire pairs, opinions
   pairs, preference sliders) is one `<textarea>` where each line is a pipe-delimited
   mini-language (`value :: label | description`). There is no visual structure — an admin has to
   remember syntax that isn't documented anywhere in the UI itself, and a single typo (extra `|`,
   missing `::`) silently produces a wrong option with no feedback until they check the preview.
3. **Layout doesn't map to what's being edited.** Today the page is two permanent side-by-side
   columns (question list on the left, the currently-selected question's editor+preview on the
   right). Switching questions doesn't visually connect "this row" to "this editor" — and there's
   no strong visual cue at all when nothing is selected.

This redesign is UI/interaction only. It does **not** change the `QuizStepDraft` data shape, the
`/api/v1/admin/quiz-config` contract, or anything mobile reads — `options`/`pairs`/`sliders`
arrays on the wire are exactly what they are today.

## Section 1 — Full-width, single-column, accordion rows

Replace `QuestionsPage`'s `max-w-4xl mx-auto` wrapper with a near-edge-to-edge gutter
(`px-2 sm:px-3` — 8-12px, matches the user's "5-15px from screen corners" across breakpoints).

`QuestionsView` drops its current two-column grid (`list | editor+preview`) entirely. The question
list becomes the whole page: one full-width column of rows, in existing drag-to-reorder order.

Clicking a row toggles it open **in place** — its editor (Section 2) plus its phone preview
(existing `QuestionPreview`, unchanged) render directly below that row, inside an expanding
container, pushing every row below it down. Opening a row **auto-collapses** whichever other row
was open (confirmed with user: single-open accordion, not multi-open) — so at most one editor is
visible at a time, and there's never ambiguity about which row's changes are in the open editor.

"+ add question" becomes its own always-last row in the same list; clicking it opens the
kind-picker + (once a kind is picked) the same structured editor, in the same place, collapsing
any other open row exactly like an existing question would. This is also where the empty-state
arrow (Section 3) lands when clicked.

Inside an open row, editor fields go on the left and the phone preview on the right (same pairing
as today, just relocated under the row instead of beside the entire list) — full page width means
this split finally has real room on both sides.

Drag-to-reorder (existing `dragIndex`/`dropStep`) is unaffected — it operates on collapsed row
headers exactly as it does today; dragging a row that happens to be open first collapses it (drag
and expand are mutually exclusive per row, avoids a half-dragged-open-editor state).

## Section 2 — Structured per-kind row editors, no pipe syntax

Every kind that currently drives a single big pipe-delimited `<textarea>` (`_optionsText` /
`_pairsText`) gets a repeating structured-row editor instead. State is held as real arrays
(`fields.options` / `fields.pairs` / `fields.sliders`) from the moment the form opens — there is no
intermediate text representation to parse on save, so the `_optionsText`/`_pairsText` marker
mechanism in `QuestionSerialization.ts` (`quizStepForSave`'s text-parsing branches, `choiceOption`)
is deleted, not just bypassed. `QuestionForm` reads `initial.options`/`initial.pairs`/
`initial.sliders` directly into local state on mount; `submit()` includes the finalized arrays
verbatim in the object passed to `onSave`.

Per kind:

- **Choice kinds** (`singleChoiceCard` / `singleChoiceList` / `multiChoiceTags`): one row per
  option — `[label input] [value input, optional — defaults to label if left blank, same default
  `choiceOption` already applies today] [description input, singleChoiceCard only] [× remove]`.
  `↑`/`↓` buttons per row for reordering (plain array-splice, no drag library — a handful of
  options doesn't justify one). `+ add option` appends a blank row.
- **Rapid fire**: one row per pair — `[option A] [option B] [× remove]`. `+ add pair`.
  `secondsPerPair` stays its own separate field, unchanged.
- **Opinions**: one row per pair — `[prompt] [option A] [option B] [× remove]`, plus a per-row
  "also ask why" checkbox that reveals a `[why-question]` input when checked (mirrors today's
  optional-4th-pipe-segment semantics, but visible instead of implicit). A pair with the checkbox
  on always sets `whyAllowVoice: true` (matches today's `quizStepForSave` behavior exactly — this
  isn't a separately exposed toggle, voice was never optional once `whyPrompt` exists). `+ add
  pair`.
- **Preferences**: one row per slider — `[prompt] [left label] [left hint] [right label]
  [right hint] [× remove]`. `+ add slider`.

`slider` (the standalone single-slider kind) already uses discrete labeled fields today (`prompt`,
`leftLabel`, `leftHint`, `rightLabel`, `rightHint`) — no textarea, no change needed. `intro` /
`text` / `voiceOrText` have no list field at all — no change needed.

Removing a row mid-list needs no confirmation (this is pre-save draft state; the top-level
"save all changes" `window.confirm` is still the real gate before anything reaches the backend).

## Section 3 — Landing-screen-styled empty state

When no row is open (nothing selected, not creating), the space where an editor+preview would
render shows a full-width panel styled like the mobile app's own `LandingScreen`: `appColor.maroon`
background, the cursive "frinq" wordmark centered (`--font-things` at a large size, cream color —
matching `QuestionPreview.tsx`'s existing `intro`-kind treatment, not a new asset), an arrow-in-a-
pill button below it (same inline SVG arrow `QuestionPreview`'s `intro` case already draws — no
new asset needed), and a short caption ("pick a question below to edit it, or start a new one").

Clicking the arrow opens the "+ add question" row (same action as clicking that row directly) —
confirmed with user: the brand moment does real work, it's not purely decorative.

## Testing

- `QuestionSerialization.test.ts` currently exercises `quizStepForSave`'s `_optionsText`/
  `_pairsText` parsing — those cases are removed along with the code they test; any case asserting
  the final `options`/`pairs`/`sliders` shape independent of how they were entered stays.
- Manual verification (per this session's established pattern): run `npx tsc --noEmit` and
  `npx eslint` on the touched files, `npm run build`, then walk the actual `/questions` page in a
  browser — open a choice-kind question, add/remove/reorder a couple of options, open an
  opinions/rapid-fire/preferences question, confirm the empty state and its arrow, confirm only one
  row is ever open at a time, confirm `QuestionPreview` still renders correctly for every kind.
