# Admin Question Editor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `frinq-admin`'s `/questions` page — full-width layout, click-to-expand accordion editing in place of the list/editor split, structured per-kind row editors replacing pipe-delimited textareas, and a landing-screen-styled empty state.

**Architecture:** Pure frontend change in `frinq-admin/app/components/`. `QuestionSerialization.ts`'s `quizStepForSave` becomes the single place that cleans up admin-entered rows (trim, drop-blank, default option value to label) — it now consumes structured arrays instead of parsing pipe-delimited text, but keeps being a pure, independently-testable function. A new `QuestionOptionEditors.tsx` provides four small repeating-row React components. `QuestionForm.tsx` is rewired to hold `options`/`pairs`/`sliders` directly in its `fields` state (no more `_optionsText`/`_pairsText` markers) and to render the new editors. `QuestionPreview.tsx`'s four multi-item cases are updated to read those same real fields instead of the markers. `QuestionsView.tsx` drops its two-column grid for a single-column accordion list plus a new `QuestionsEmptyState.tsx`. No backend, API contract, or mobile change.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, Tailwind utility classes (existing `frinq-input` class, `--font-motive`/`--font-things` custom font vars, `appColor` tokens from `app/lib/appTokens.ts`) — no new dependencies.

## Global Constraints

- No backend, `/api/v1/admin/quiz-config` contract, or mobile-side change. `QuizStepDraft`'s `options`/`pairs`/`sliders` shapes on the wire are unchanged.
- No new npm dependencies (no drag library, no form library) — plain React state and array operations.
- Follow existing code style exactly: Tailwind utility strings inline, `font-[family-name:var(--font-motive)]` / `font-[family-name:var(--font-things)]` for text, the existing color literals (`#8B7355`, `#2A1810`, `#7C1C0B`, `rgba(42,24,16,0.NN)`) used throughout these files — do not introduce a new color system for the parts of these files not already using `appColor`.
- Every task ends with `cd frinq-admin && npx tsc --noEmit` and `npx eslint <touched files>` passing clean before commit.

---

### Task 1: Rewrite `QuestionSerialization.ts` to clean up structured rows instead of parsing pipe-text

**Files:**
- Modify: `frinq-admin/app/components/QuestionSerialization.ts` (full-file replacement)
- Modify: `frinq-admin/app/components/QuestionSerialization.test.ts` (full-file replacement)

**Interfaces:**
- Produces: `quizStepForSave(step: Record<string, unknown>): QuizStepDraft` — same exported name and signature as today. Callers (`QuestionsView.tsx`, updated in Task 6) are unaffected by this task; they already just call `quizStepForSave(step)` and don't need to change how they call it.
- Produces: `StepKind`, `QuizStepDraft` — unchanged, re-exported as today.

This is the only task with dedicated automated tests in this codebase's existing pattern (`QuestionForm.tsx`/`QuestionPreview.tsx`/`QuestionsView.tsx` have none today — this plan follows that established pattern rather than introducing new test infrastructure for them).

- [ ] **Step 1: Write the new test file (fails against the current implementation)**

Replace `frinq-admin/app/components/QuestionSerialization.test.ts` with:

```ts
import assert from "node:assert/strict";
import { quizStepForSave } from "./QuestionSerialization";

// Choice options: blank labels are dropped, value defaults to label when
// left blank, description is included only when non-empty.
const choices = quizStepForSave({
  id: "choices",
  kind: "singleChoiceCard",
  options: [
    { label: "  Option C  ", value: "c", description: "  the third one  " },
    { label: "" },
    { label: "Option A" },
  ],
});
assert.deepEqual(choices.options, [
  { value: "c", label: "Option C", description: "the third one" },
  { value: "Option A", label: "Option A" },
]);

// multiChoiceTags options are plain strings, not objects.
const tags = quizStepForSave({
  id: "tags",
  kind: "multiChoiceTags",
  options: ["  hiking  ", "", "reading"],
});
assert.deepEqual(tags.options, ["hiking", "reading"]);

// No form-only underscore-prefixed keys survive (none should ever be
// produced anymore, but a stray one must still be stripped defensively).
for (const step of [
  { id: "intro", kind: "intro", heading: "Hi", ctaLabel: "Go", _stray: "x" },
  { id: "slider", kind: "slider", prompt: "Rate" },
  { id: "rapid", kind: "rapidFire", secondsPerPair: "10", pairs: [{ a: "a", b: "b" }] },
]) {
  const saved = quizStepForSave(step);
  assert.equal(Object.keys(saved).some((key) => key.startsWith("_")), false);
}

// Rapid fire: secondsPerPair coerced to a number, blank pairs dropped, text trimmed.
const rapid = quizStepForSave({
  id: "rapid", kind: "rapidFire", secondsPerPair: "10",
  pairs: [{ a: " a ", b: " b " }, { a: "", b: "" }],
});
assert.deepEqual(rapid.pairs, [{ a: "a", b: "b" }]);
assert.equal(rapid.secondsPerPair, 10);

// section defaults to "custom" when blank/missing.
const newQuestion = quizStepForSave({ id: "new", kind: "text", prompt: "New question?" });
assert.equal(newQuestion.section, "custom");

const sectionedQuestion = quizStepForSave({
  id: "sectioned", kind: "text", section: "who you are", prompt: "Sectioned question?",
});
assert.equal(sectionedQuestion.section, "who you are");

// Opinions: whyAnswerKey is derived only when a pair actually carries a
// non-empty whyPrompt; blank prompt/a/b pairs are dropped.
const opinionsNoWhy = quizStepForSave({
  id: "opinions", kind: "opinions", answerKey: "opinions",
  pairs: [{ prompt: "on ai:", a: "it will replace us", b: "humans can't be replaced" }],
});
assert.deepEqual(opinionsNoWhy.pairs, [{ prompt: "on ai:", a: "it will replace us", b: "humans can't be replaced" }]);
assert.equal(opinionsNoWhy.whyAnswerKey, undefined);

const opinionsWithWhy = quizStepForSave({
  id: "opinions", kind: "opinions", answerKey: "opinions",
  pairs: [
    { prompt: " on ai: ", a: " it will replace us ", b: " humans can't be replaced ", whyPrompt: " what makes you think that? " },
    { prompt: "", a: "", b: "" },
  ],
});
assert.deepEqual(opinionsWithWhy.pairs, [{
  prompt: "on ai:", a: "it will replace us", b: "humans can't be replaced",
  whyPrompt: "what makes you think that?", whyAllowVoice: true,
}]);
assert.equal(opinionsWithWhy.whyAnswerKey, "opinions_why");

// Preferences: blank sliders dropped, text trimmed.
const preferences = quizStepForSave({
  id: "preferences", kind: "preferences", answerKey: "preferences",
  sliders: [
    { prompt: " you trust more ", leftLabel: " what you see ", leftHint: " see ", rightLabel: " what you sense ", rightHint: " sense " },
    { prompt: "", leftLabel: "", leftHint: "", rightLabel: "", rightHint: "" },
  ],
});
assert.deepEqual(preferences.sliders, [
  { prompt: "you trust more", leftLabel: "what you see", leftHint: "see", rightLabel: "what you sense", rightHint: "sense" },
]);

const voiceOrText = quizStepForSave({ id: "story", kind: "voiceOrText", heading: "tell us a story" });
assert.equal(voiceOrText.heading, "tell us a story");

console.log("QuestionSerialization.test.ts: all assertions passed");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frinq-admin && npx tsx app/components/QuestionSerialization.test.ts`
Expected: throws an `AssertionError` (the current implementation still expects `_optionsText`/`_pairsText`, not `options`/`pairs`/`sliders` arrays, so e.g. `choices.options` comes back `undefined`, failing the first `assert.deepEqual`).

- [ ] **Step 3: Replace `QuestionSerialization.ts` with the array-based implementation**

Replace `frinq-admin/app/components/QuestionSerialization.ts` entirely with:

```ts
export type StepKind = "text" | "singleChoiceCard" | "singleChoiceList" | "multiChoiceTags" | "slider" | "rapidFire" | "intro" | "opinions" | "preferences" | "voiceOrText";

export interface QuizStepDraft {
  id: string;
  kind: StepKind;
  [key: string]: unknown;
}

type RawChoiceOption = string | { label?: unknown; value?: unknown; description?: unknown };

/** Trims a row's label and defaults value to it when left blank — the one
 *  piece of "magic" this format keeps (matches the old `value :: label`
 *  pipe-text editor's behavior exactly, just sourced from a structured row
 *  instead of a parsed line). Drops rows with no label — an admin can add a
 *  blank row via "+ add option" and never fill it in. */
function cleanChoiceOption(option: RawChoiceOption): { value: string; label: string; description?: string } | null {
  if (typeof option === "string") {
    const label = option.trim();
    return label ? { value: label, label } : null;
  }
  const label = typeof option.label === "string" ? option.label.trim() : "";
  if (!label) return null;
  const value = (typeof option.value === "string" ? option.value.trim() : "") || label;
  const description = typeof option.description === "string" ? option.description.trim() : "";
  return description ? { value, label, description } : { value, label };
}

/** Removes form-only (`_`-prefixed) fields, defaults `section`, cleans up
 *  the structured option/pair/slider rows QuestionForm's row editors
 *  produce (trims text, drops blank rows, defaults an option's value to its
 *  label), and derives `whyAnswerKey` for an opinions round from whichever
 *  pairs actually carry a `whyPrompt`. */
export function quizStepForSave(step: Record<string, unknown>): QuizStepDraft {
  const fields = Object.fromEntries(Object.entries(step).filter(([key]) => !key.startsWith("_")));
  if (typeof fields.section !== "string" || !fields.section.trim()) fields.section = "custom";

  if (fields.kind === "multiChoiceTags" && Array.isArray(fields.options)) {
    fields.options = fields.options
      .map((o) => {
        if (typeof o === "string") return o.trim();
        const label = (o as { label?: unknown }).label;
        return typeof label === "string" ? label.trim() : "";
      })
      .filter(Boolean);
  } else if ((fields.kind === "singleChoiceCard" || fields.kind === "singleChoiceList") && Array.isArray(fields.options)) {
    fields.options = fields.options
      .map((o) => cleanChoiceOption(o as RawChoiceOption))
      .filter((o): o is { value: string; label: string; description?: string } => o !== null);
  }

  if (fields.kind === "rapidFire") {
    fields.secondsPerPair = Number(fields.secondsPerPair) || 5;
    if (Array.isArray(fields.pairs)) {
      fields.pairs = fields.pairs
        .map((p) => {
          const pair = p as { a?: unknown; b?: unknown };
          const a = typeof pair.a === "string" ? pair.a.trim() : "";
          const b = typeof pair.b === "string" ? pair.b.trim() : "";
          return a || b ? { a, b } : null;
        })
        .filter((p): p is { a: string; b: string } => p !== null);
    }
  }

  if (fields.kind === "opinions" && Array.isArray(fields.pairs)) {
    const pairs = fields.pairs
      .map((p) => {
        const pair = p as { prompt?: unknown; a?: unknown; b?: unknown; whyPrompt?: unknown };
        const prompt = typeof pair.prompt === "string" ? pair.prompt.trim() : "";
        const a = typeof pair.a === "string" ? pair.a.trim() : "";
        const b = typeof pair.b === "string" ? pair.b.trim() : "";
        if (!prompt && !a && !b) return null;
        const whyPrompt = typeof pair.whyPrompt === "string" ? pair.whyPrompt.trim() : "";
        return whyPrompt
          ? { prompt, a, b, whyPrompt, whyAllowVoice: true }
          : { prompt, a, b };
      })
      .filter((p): p is { prompt: string; a: string; b: string; whyPrompt?: string; whyAllowVoice?: boolean } => p !== null);
    fields.pairs = pairs;
    // Auto-derived, not admin-typed — every real use case wants exactly this.
    fields.whyAnswerKey = pairs.some((p) => "whyPrompt" in p) ? `${fields.answerKey || newAnswerKey()}_why` : undefined;
  }

  if (fields.kind === "preferences" && Array.isArray(fields.sliders)) {
    fields.sliders = fields.sliders
      .map((s) => {
        const slider = s as Record<string, unknown>;
        const prompt = typeof slider.prompt === "string" ? slider.prompt.trim() : "";
        const leftLabel = typeof slider.leftLabel === "string" ? slider.leftLabel.trim() : "";
        const leftHint = typeof slider.leftHint === "string" ? slider.leftHint.trim() : "";
        const rightLabel = typeof slider.rightLabel === "string" ? slider.rightLabel.trim() : "";
        const rightHint = typeof slider.rightHint === "string" ? slider.rightHint.trim() : "";
        if (!prompt && !leftLabel && !rightLabel) return null;
        return { prompt, leftLabel, leftHint, rightLabel, rightHint };
      })
      .filter((s): s is { prompt: string; leftLabel: string; leftHint: string; rightLabel: string; rightHint: string } => s !== null);
  }

  return fields as QuizStepDraft;
}

function newAnswerKey(): string { return `custom_${Date.now()}`; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frinq-admin && npx tsx app/components/QuestionSerialization.test.ts`
Expected: prints `QuestionSerialization.test.ts: all assertions passed`, exits 0.

- [ ] **Step 5: Typecheck and lint**

Run: `cd frinq-admin && npx tsc --noEmit && npx eslint app/components/QuestionSerialization.ts app/components/QuestionSerialization.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frinq-admin/app/components/QuestionSerialization.ts frinq-admin/app/components/QuestionSerialization.test.ts
git commit -m "refactor: quizStepForSave cleans structured rows instead of parsing pipe-text"
```

---

### Task 2: Create `QuestionOptionEditors.tsx` — the four structured row editors

**Files:**
- Create: `frinq-admin/app/components/QuestionOptionEditors.tsx`

**Interfaces:**
- Consumes: nothing from other tasks — pure, self-contained React components. Uses the global `frinq-input` CSS class (defined in `frinq-admin/app/globals.css:59`) already used by every other input in this codebase.
- Produces (all named exports, consumed by Task 3):
  - `ChoiceOptionEditor(props: { options: (string | { label?: string; value?: string; description?: string })[]; onChange: (next: (string | { label?: string; value?: string; description?: string })[]) => void; showValue: boolean; showDescription: boolean })`
  - `PairEditor(props: { pairs: { a?: string; b?: string }[]; onChange: (next: { a?: string; b?: string }[]) => void })`
  - `OpinionPairEditor(props: { pairs: { prompt?: string; a?: string; b?: string; whyPrompt?: string }[]; onChange: (next: { prompt?: string; a?: string; b?: string; whyPrompt?: string }[]) => void })`
  - `SliderEditor(props: { sliders: { prompt?: string; leftLabel?: string; leftHint?: string; rightLabel?: string; rightHint?: string }[]; onChange: (next: { prompt?: string; leftLabel?: string; leftHint?: string; rightLabel?: string; rightHint?: string }[]) => void })`

No dedicated test file — matches this codebase's existing pattern (no other form/view component here has one). Verified via typecheck/lint now and the manual browser walk in Task 7.

- [ ] **Step 1: Write the file**

Create `frinq-admin/app/components/QuestionOptionEditors.tsx`:

```tsx
"use client";

type ChoiceOption = string | { label?: string; value?: string; description?: string };

function optionLabel(o: ChoiceOption): string {
  return typeof o === "string" ? o : o.label ?? "";
}
function optionValue(o: ChoiceOption): string {
  return typeof o === "string" ? "" : o.value ?? "";
}
function optionDescription(o: ChoiceOption): string {
  return typeof o === "string" ? "" : o.description ?? "";
}

/** Structured row editor for choice options — replaces the old one-textarea
 *  "value :: label | description" pipe syntax. `showValue`/`showDescription`
 *  control which extra inputs render per kind: multiChoiceTags is label-only
 *  (plain string rows), singleChoiceList adds value, singleChoiceCard adds
 *  both value and description. */
export function ChoiceOptionEditor({ options, onChange, showValue, showDescription }: {
  options: ChoiceOption[];
  onChange: (next: ChoiceOption[]) => void;
  showValue: boolean;
  showDescription: boolean;
}) {
  const structured = showValue || showDescription;

  function updateRow(index: number, patch: { label?: string; value?: string; description?: string }) {
    onChange(options.map((o, i) => {
      if (i !== index) return o;
      if (!structured) return patch.label ?? optionLabel(o);
      return {
        label: patch.label ?? optionLabel(o),
        value: patch.value ?? optionValue(o),
        description: patch.description ?? optionDescription(o),
      };
    }));
  }
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= options.length) return;
    const next = options.slice();
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  function remove(index: number) {
    onChange(options.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...options, structured ? { label: "" } : ""]);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] uppercase text-[#8B7355]">options</span>
      {options.map((option, index) => (
        <div key={index} className="flex items-start gap-2 border border-[rgba(42,24,16,0.12)] rounded-md p-2">
          <div className="flex flex-col gap-1 flex-1 min-w-0">
            <input value={optionLabel(option)} onChange={(e) => updateRow(index, { label: e.target.value })} placeholder="label" className="frinq-input" />
            {showValue && (
              <input value={optionValue(option)} onChange={(e) => updateRow(index, { value: e.target.value })} placeholder="value (optional — defaults to label)" className="frinq-input" />
            )}
            {showDescription && (
              <input value={optionDescription(option)} onChange={(e) => updateRow(index, { description: e.target.value })} placeholder="description (optional)" className="frinq-input" />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move option up" className="font-[family-name:var(--font-motive)] text-[9px] px-1.5 py-0.5 border border-[rgba(42,24,16,0.18)] text-[#8B7355] disabled:opacity-30">↑</button>
            <button type="button" onClick={() => move(index, 1)} disabled={index === options.length - 1} aria-label="Move option down" className="font-[family-name:var(--font-motive)] text-[9px] px-1.5 py-0.5 border border-[rgba(42,24,16,0.18)] text-[#8B7355] disabled:opacity-30">↓</button>
            <button type="button" onClick={() => remove(index)} aria-label="Remove option" className="font-[family-name:var(--font-motive)] text-[9px] px-1.5 py-0.5 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B]">×</button>
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="self-start font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] px-2.5 py-1 border border-[rgba(42,24,16,0.3)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)]">+ add option</button>
    </div>
  );
}

/** Rapid-fire pairs — two options per row, no prompt (rapid fire has no
 *  per-pair prompt, only the round's own copy). */
export function PairEditor({ pairs, onChange }: {
  pairs: { a?: string; b?: string }[];
  onChange: (next: { a?: string; b?: string }[]) => void;
}) {
  function update(index: number, patch: Partial<{ a: string; b: string }>) {
    onChange(pairs.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }
  function remove(index: number) {
    onChange(pairs.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...pairs, { a: "", b: "" }]);
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] uppercase text-[#8B7355]">pairs (this or that)</span>
      {pairs.map((pair, index) => (
        <div key={index} className="flex items-center gap-2 border border-[rgba(42,24,16,0.12)] rounded-md p-2">
          <input value={pair.a ?? ""} onChange={(e) => update(index, { a: e.target.value })} placeholder="option a" className="frinq-input flex-1" />
          <input value={pair.b ?? ""} onChange={(e) => update(index, { b: e.target.value })} placeholder="option b" className="frinq-input flex-1" />
          <button type="button" onClick={() => remove(index)} aria-label="Remove pair" className="font-[family-name:var(--font-motive)] text-[9px] px-1.5 py-1 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B]">×</button>
        </div>
      ))}
      <button type="button" onClick={add} className="self-start font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] px-2.5 py-1 border border-[rgba(42,24,16,0.3)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)]">+ add pair</button>
    </div>
  );
}

/** Opinions pairs — prompt + two options + an optional "also ask why"
 *  checkbox that reveals a why-question input. Checking it on always means
 *  the pair gets voice-enabled follow-up (whyAllowVoice) once saved —
 *  matches quizStepForSave's derivation, not a separately exposed toggle. */
export function OpinionPairEditor({ pairs, onChange }: {
  pairs: { prompt?: string; a?: string; b?: string; whyPrompt?: string }[];
  onChange: (next: { prompt?: string; a?: string; b?: string; whyPrompt?: string }[]) => void;
}) {
  function update(index: number, patch: Partial<{ prompt: string; a: string; b: string; whyPrompt: string }>) {
    onChange(pairs.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }
  function toggleWhy(index: number, on: boolean) {
    onChange(pairs.map((p, i) => {
      if (i !== index) return p;
      if (on) return { ...p, whyPrompt: p.whyPrompt ?? "" };
      const { whyPrompt, ...rest } = p;
      return rest;
    }));
  }
  function remove(index: number) {
    onChange(pairs.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...pairs, { prompt: "", a: "", b: "" }]);
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] uppercase text-[#8B7355]">pairs (this or that + optional why)</span>
      {pairs.map((pair, index) => (
        <div key={index} className="flex flex-col gap-1.5 border border-[rgba(42,24,16,0.12)] rounded-md p-2">
          <div className="flex items-center gap-2">
            <input value={pair.prompt ?? ""} onChange={(e) => update(index, { prompt: e.target.value })} placeholder="prompt" className="frinq-input flex-1" />
            <button type="button" onClick={() => remove(index)} aria-label="Remove pair" className="font-[family-name:var(--font-motive)] text-[9px] px-1.5 py-1 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B]">×</button>
          </div>
          <div className="flex items-center gap-2">
            <input value={pair.a ?? ""} onChange={(e) => update(index, { a: e.target.value })} placeholder="option a" className="frinq-input flex-1" />
            <input value={pair.b ?? ""} onChange={(e) => update(index, { b: e.target.value })} placeholder="option b" className="frinq-input flex-1" />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={"whyPrompt" in pair} onChange={(e) => toggleWhy(index, e.target.checked)} />
            <span className="font-[family-name:var(--font-motive)] text-[10px] text-[#2A1810]">also ask why (text + voice)</span>
          </label>
          {"whyPrompt" in pair && (
            <input value={pair.whyPrompt ?? ""} onChange={(e) => update(index, { whyPrompt: e.target.value })} placeholder="why-question" className="frinq-input" />
          )}
        </div>
      ))}
      <button type="button" onClick={add} className="self-start font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] px-2.5 py-1 border border-[rgba(42,24,16,0.3)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)]">+ add pair</button>
    </div>
  );
}

/** Preference sliders — prompt + left/right label+hint per row. */
export function SliderEditor({ sliders, onChange }: {
  sliders: { prompt?: string; leftLabel?: string; leftHint?: string; rightLabel?: string; rightHint?: string }[];
  onChange: (next: { prompt?: string; leftLabel?: string; leftHint?: string; rightLabel?: string; rightHint?: string }[]) => void;
}) {
  function update(index: number, patch: Partial<{ prompt: string; leftLabel: string; leftHint: string; rightLabel: string; rightHint: string }>) {
    onChange(sliders.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function remove(index: number) {
    onChange(sliders.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...sliders, { prompt: "", leftLabel: "", leftHint: "", rightLabel: "", rightHint: "" }]);
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] uppercase text-[#8B7355]">sliders</span>
      {sliders.map((slider, index) => (
        <div key={index} className="flex flex-col gap-1.5 border border-[rgba(42,24,16,0.12)] rounded-md p-2">
          <div className="flex items-center gap-2">
            <input value={slider.prompt ?? ""} onChange={(e) => update(index, { prompt: e.target.value })} placeholder="prompt" className="frinq-input flex-1" />
            <button type="button" onClick={() => remove(index)} aria-label="Remove slider" className="font-[family-name:var(--font-motive)] text-[9px] px-1.5 py-1 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B]">×</button>
          </div>
          <div className="flex items-center gap-2">
            <input value={slider.leftLabel ?? ""} onChange={(e) => update(index, { leftLabel: e.target.value })} placeholder="left label" className="frinq-input flex-1" />
            <input value={slider.leftHint ?? ""} onChange={(e) => update(index, { leftHint: e.target.value })} placeholder="left hint" className="frinq-input flex-1" />
          </div>
          <div className="flex items-center gap-2">
            <input value={slider.rightLabel ?? ""} onChange={(e) => update(index, { rightLabel: e.target.value })} placeholder="right label" className="frinq-input flex-1" />
            <input value={slider.rightHint ?? ""} onChange={(e) => update(index, { rightHint: e.target.value })} placeholder="right hint" className="frinq-input flex-1" />
          </div>
        </div>
      ))}
      <button type="button" onClick={add} className="self-start font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] px-2.5 py-1 border border-[rgba(42,24,16,0.3)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)]">+ add slider</button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd frinq-admin && npx tsc --noEmit && npx eslint app/components/QuestionOptionEditors.tsx`
Expected: no errors. (This file isn't imported anywhere yet, so `tsc`/`eslint` only check it in isolation — Task 3 wires it in.)

- [ ] **Step 3: Commit**

```bash
git add frinq-admin/app/components/QuestionOptionEditors.tsx
git commit -m "feat: add structured row editors for choice/pair/slider question fields"
```

---

### Task 3: Rewire `QuestionForm.tsx` to use the structured editors

**Files:**
- Modify: `frinq-admin/app/components/QuestionForm.tsx` (full-file replacement)

**Interfaces:**
- Consumes: `ChoiceOptionEditor`, `PairEditor`, `OpinionPairEditor`, `SliderEditor` from `./QuestionOptionEditors` (Task 2). `quizStepForSave` is NOT called here — `QuestionForm` only calls `onSave(fields)` with fully-assembled-but-not-yet-cleaned fields; `quizStepForSave` runs at the call site (`QuestionsView.tsx`, Task 6), same as before this plan.
- Produces: `QuestionForm(props: { initial: Record<string, unknown> | null; onSave: (step: Record<string, unknown>) => void; onCancel: () => void; allowRapidFire?: boolean; allowOpinions?: boolean })` — same signature as today, no caller changes required beyond Task 6's layout rewrite.
- Produces (for `QuestionPreview`, Task 4): the `fields` object passed to `<QuestionPreview kind={kind} fields={fields} />` now always carries real `options`/`pairs`/`sliders` arrays (never `_optionsText`/`_pairsText`) for the kinds that have them.

- [ ] **Step 1: Replace the file**

Replace `frinq-admin/app/components/QuestionForm.tsx` entirely with:

```tsx
"use client";

import { useState } from "react";
import { QuestionPreview } from "./QuestionPreview";
import { ChoiceOptionEditor, PairEditor, OpinionPairEditor, SliderEditor } from "./QuestionOptionEditors";

type StepKind = "text" | "singleChoiceCard" | "singleChoiceList" | "multiChoiceTags" | "slider" | "rapidFire" | "intro" | "opinions" | "preferences" | "voiceOrText";

const KIND_LABELS: Record<StepKind, string> = {
  text: "text (+ optional voice)",
  singleChoiceCard: "MCQ — description cards",
  singleChoiceList: "MCQ — vertical list or would-you-rather",
  multiChoiceTags: "MCQ — tag flow or checklist",
  slider: "slider (1-5)",
  rapidFire: "rapid fire",
  intro: "section intro screen",
  opinions: "this-or-that round (+ optional why)",
  preferences: "preference sliders (round of 4)",
  voiceOrText: "voice or text answer",
};

// A quiz has exactly one rapid-fire round and one opinions round — same
// precedent as rapidFire's existing gate, extended to cover both.
const SINGLETON_KINDS: readonly StepKind[] = ["rapidFire", "opinions"];

function newAnswerKey(): string { return `custom_${Date.now()}`; }

export function QuestionForm({ initial, onSave, onCancel, allowRapidFire = false, allowOpinions = false }: {
  initial: Record<string, unknown> | null;
  onSave: (step: Record<string, unknown>) => void;
  onCancel: () => void;
  allowRapidFire?: boolean;
  allowOpinions?: boolean;
}) {
  const [kind, setKind] = useState<StepKind | null>((initial?.kind as StepKind) ?? null);
  // initial already carries real options/pairs/sliders arrays (that's the
  // wire shape) — no text-marker fields to synthesize anymore.
  const [fields, setFields] = useState<Record<string, unknown>>(() => initial ? { section: "custom", ...initial } : { section: "custom" });

  const allowedSingleton: Partial<Record<StepKind, boolean>> = { rapidFire: allowRapidFire, opinions: allowOpinions };
  if (!kind) return <div className="border border-[rgba(42,24,16,0.15)] rounded-md p-4"><p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355] mb-3">pick a question type</p><div className="flex flex-wrap gap-2">{(Object.keys(KIND_LABELS) as StepKind[]).filter((k) => !SINGLETON_KINDS.includes(k) || allowedSingleton[k]).map((k) => <button key={k} onClick={() => setKind(k)} className="font-[family-name:var(--font-motive)] text-[10px] px-3 py-1.5 border border-[rgba(42,24,16,0.18)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)]">{KIND_LABELS[k]}</button>)}</div><button onClick={onCancel} className="mt-3 font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355]">cancel</button></div>;

  function field(key: string, label: string, placeholder = "") {
    return <label className="flex flex-col gap-1"><span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] uppercase text-[#8B7355]">{label}</span><input value={(fields[key] as string) ?? ""} placeholder={placeholder} onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))} className="frinq-input" /></label>;
  }
  function submit() {
    if (kind === "intro") {
      const id = (fields.id as string) || `intro_${Date.now()}`;
      onSave({ ...fields, id, kind });
      return;
    }
    if (kind === "rapidFire") {
      onSave({ ...fields, id: (fields.id as string) || "rapid_fire", kind });
      return;
    }
    const answerKey = (fields.answerKey as string) || newAnswerKey();
    onSave({ ...fields, id: (fields.id as string) || answerKey, answerKey, kind });
  }

  return <div className="flex flex-col lg:flex-row gap-8 xl:gap-12 items-start">
  <div className="border border-[rgba(42,24,16,0.15)] rounded-md p-5 flex flex-col gap-4 flex-1 min-w-0"><p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355]">{KIND_LABELS[kind]}</p>
    {field("section", "section", "custom")}
    {kind === "text" && <>{field("prompt", "prompt")}{field("placeholder", "placeholder (optional)")}<label className="flex items-center gap-2"><input type="checkbox" checked={!!fields.allowVoice} onChange={(e) => setFields((f) => ({ ...f, allowVoice: e.target.checked }))} /><span className="font-[family-name:var(--font-motive)] text-[10px] text-[#2A1810]">allow voice answer</span></label></>}
    {kind === "slider" && <>{field("prompt", "prompt")}{field("leftLabel", "left label")}{field("leftHint", "left hint (short)")}{field("rightLabel", "right label")}{field("rightHint", "right hint (short)")}</>}
    {kind === "intro" && <>{field("heading", "heading")}{field("body", "body (optional)")}{field("ctaLabel", "button label")}</>}
    {kind === "rapidFire" && <><PairEditor pairs={(fields.pairs as { a?: string; b?: string }[]) ?? []} onChange={(next) => setFields((f) => ({ ...f, pairs: next }))} />{field("secondsPerPair", "seconds per pair", "5")}</>}
    {kind === "opinions" && <OpinionPairEditor pairs={(fields.pairs as { prompt?: string; a?: string; b?: string; whyPrompt?: string }[]) ?? []} onChange={(next) => setFields((f) => ({ ...f, pairs: next }))} />}
    {kind === "preferences" && <SliderEditor sliders={(fields.sliders as { prompt?: string; leftLabel?: string; leftHint?: string; rightLabel?: string; rightHint?: string }[]) ?? []} onChange={(next) => setFields((f) => ({ ...f, sliders: next }))} />}
    {kind === "voiceOrText" && <>{field("heading", "heading")}{field("subtext", "subtext (optional)")}{field("placeholder", "placeholder (optional)")}</>}
    {(kind === "singleChoiceCard" || kind === "singleChoiceList" || kind === "multiChoiceTags") && <>{field("prompt", "prompt")}<ChoiceOptionEditor options={(fields.options as (string | { label?: string; value?: string; description?: string })[]) ?? []} onChange={(next) => setFields((f) => ({ ...f, options: next }))} showValue={kind !== "multiChoiceTags"} showDescription={kind === "singleChoiceCard"} />{kind === "singleChoiceList" && <label className="flex items-center gap-2"><input type="checkbox" checked={fields.variant === "box"} onChange={(e) => setFields((f) => ({ ...f, variant: e.target.checked ? "box" : "pill", chrome: e.target.checked ? "simple" : undefined }))} /><span className="font-[family-name:var(--font-motive)] text-[10px] text-[#2A1810]">&quot;would you rather&quot; style (exactly 2 options)</span></label>}{kind === "multiChoiceTags" && <label className="flex items-center gap-2"><input type="checkbox" checked={fields.layout === "list"} onChange={(e) => setFields((f) => ({ ...f, layout: e.target.checked ? "list" : "chips" }))} /><span className="font-[family-name:var(--font-motive)] text-[10px] text-[#2A1810]">vertical checklist style (instead of tag flow)</span></label>}</>}
    <div className="flex gap-2 mt-2"><button onClick={submit} className="font-[family-name:var(--font-motive)] text-[10px] px-3 py-1.5 border border-[rgba(42,24,16,0.3)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)]">save</button><button onClick={onCancel} className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355]">cancel</button></div>
  </div>
  <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-2 lg:sticky lg:top-4">
    <div className="flex items-baseline justify-between">
      <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355]">preview</p>
      <p className="font-[family-name:var(--font-motive)] text-[8px] text-[rgba(42,24,16,0.35)]">approx. phone screen</p>
    </div>
    <div className="h-[640px] overflow-y-auto rounded-md border border-[rgba(42,24,16,0.12)] bg-[#FFFBF7]">
      <QuestionPreview kind={kind} fields={fields} />
    </div>
  </div>
  </div>;
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd frinq-admin && npx tsc --noEmit && npx eslint app/components/QuestionForm.tsx`
Expected: `QuestionPreview`'s own type checking will not yet complain (its `fields` prop is `Record<string, unknown>`, untyped) — this step should be clean. If `tsc` reports an error inside `QuestionPreview.tsx` referencing `_optionsText`/`_pairsText`, that's expected and resolved by Task 4; do not attempt to fix `QuestionPreview.tsx` from this task.

- [ ] **Step 3: Commit**

```bash
git add frinq-admin/app/components/QuestionForm.tsx
git commit -m "refactor: QuestionForm holds options/pairs/sliders directly, no pipe-text markers"
```

---

### Task 4: Update `QuestionPreview.tsx` to read structured fields instead of pipe-text markers

**Files:**
- Modify: `frinq-admin/app/components/QuestionPreview.tsx:11-21` (delete the now-dead `allLines` helper)
- Modify: `frinq-admin/app/components/QuestionPreview.tsx:204-302` (the `preferences` / choice-kinds / `rapidFire` / `opinions` switch cases)

**Interfaces:**
- Consumes: `fields.options` (string[] for `multiChoiceTags`, `{value,label,description?}[]` for `singleChoiceCard`/`singleChoiceList`), `fields.pairs` (`{a,b}[]` for `rapidFire`, `{prompt,a,b,whyPrompt?}[]` for `opinions`), `fields.sliders` (`{prompt,leftLabel,leftHint,rightLabel,rightHint}[]`) — these are exactly what `QuestionForm` (Task 3) now keeps live in its `fields` state and what the backend already returns on `GET /api/v1/admin/quiz-config` (unchanged wire shape).
- Produces: `QuestionPreview(props: { kind: string; fields: Record<string, unknown> })` — same exported signature as today.

This component has no dedicated test file today (matches this codebase's existing pattern) — verified by typecheck/lint now and the manual browser walk in Task 7.

- [ ] **Step 1: Delete the dead `allLines` helper**

In `frinq-admin/app/components/QuestionPreview.tsx`, delete lines 11-21:

```tsx
/** Every non-empty line, each split on "|" into its pipe-delimited parts —
 *  used to render the FULL round (every slider/pair), not just the first
 *  item, matching what the real quiz actually shows across N screens. */
function allLines(text: unknown): string[][] {
  if (typeof text !== "string") return [];
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => line.split("|").map((part) => part.trim()));
}

```

Nothing else in the file calls `allLines` once Step 2 lands — if you run this step before Step 2, `tsc`/`eslint` will correctly flag the remaining call sites as errors; that's expected mid-task, not a regression.

- [ ] **Step 2: Rewrite the `preferences` case (was lines 204-228)**

Replace:

```tsx
    case "preferences": {
      const sliders = allLines(fields._optionsText);
      body = sliders.length ? (
        <>
          {sliders.map(([sPrompt, leftLabel, , rightLabel], i) => (
            <div key={i} style={{ marginBottom: i < sliders.length - 1 ? 14 : 0 }}>
              <RoundPosition index={i} total={sliders.length} />
              <Heading>{sPrompt || "slider round"}</Heading>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
                {[0, 1, 2, 3, 4].map((d) => (
                  <div key={d} style={{ width: 14, height: 14, borderRadius: 999, border: `1px solid ${MAROON}`, background: d === 2 ? MAROON : "transparent" }} />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-motive)", fontSize: 10, color: BROWN_SECONDARY }}>
                <span>{leftLabel || "left"}</span>
                <span>{rightLabel || "right"}</span>
              </div>
            </div>
          ))}
        </>
      ) : (
        <Heading>slider round</Heading>
      );
      break;
    }
```

with:

```tsx
    case "preferences": {
      const sliders = (Array.isArray(fields.sliders) ? fields.sliders : []) as { prompt?: string; leftLabel?: string; rightLabel?: string }[];
      body = sliders.length ? (
        <>
          {sliders.map((slider, i) => (
            <div key={i} style={{ marginBottom: i < sliders.length - 1 ? 14 : 0 }}>
              <RoundPosition index={i} total={sliders.length} />
              <Heading>{slider.prompt || "slider round"}</Heading>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
                {[0, 1, 2, 3, 4].map((d) => (
                  <div key={d} style={{ width: 14, height: 14, borderRadius: 999, border: `1px solid ${MAROON}`, background: d === 2 ? MAROON : "transparent" }} />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-motive)", fontSize: 10, color: BROWN_SECONDARY }}>
                <span>{slider.leftLabel || "left"}</span>
                <span>{slider.rightLabel || "right"}</span>
              </div>
            </div>
          ))}
        </>
      ) : (
        <Heading>slider round</Heading>
      );
      break;
    }
```

- [ ] **Step 3: Rewrite the choice-kinds case (was lines 229-254)**

Replace:

```tsx
    case "singleChoiceCard":
    case "singleChoiceList":
    case "multiChoiceTags": {
      const options = (fields._optionsText as string | undefined ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
      const parsed = (options.length ? options : ["option a", "option b"]).map((line) => {
        const sep = line.indexOf("::");
        const labelPart = sep >= 0 ? line.slice(sep + 2) : line;
        const [label, ...descParts] = labelPart.split("|").map((p) => p.trim());
        return { label: label || line, description: descParts.join("|").trim() || undefined };
      });
      body = (
        <>
          <Heading>{prompt || "prompt"}</Heading>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {parsed.map((opt, i) =>
              kind === "singleChoiceCard" ? (
                <ChoiceCard key={i} label={opt.label} description={opt.description} />
              ) : (
                <Pill key={i}>{opt.label}</Pill>
              ),
            )}
          </div>
        </>
      );
      break;
    }
```

with:

```tsx
    case "singleChoiceCard":
    case "singleChoiceList":
    case "multiChoiceTags": {
      const rawOptions = (Array.isArray(fields.options) ? fields.options : []) as (string | { label?: string; description?: string })[];
      const parsed = (rawOptions.length ? rawOptions : ["option a", "option b"]).map((o) =>
        typeof o === "string" ? { label: o, description: undefined } : { label: o.label || "", description: o.description }
      );
      body = (
        <>
          <Heading>{prompt || "prompt"}</Heading>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {parsed.map((opt, i) =>
              kind === "singleChoiceCard" ? (
                <ChoiceCard key={i} label={opt.label} description={opt.description} />
              ) : (
                <Pill key={i}>{opt.label}</Pill>
              ),
            )}
          </div>
        </>
      );
      break;
    }
```

- [ ] **Step 4: Rewrite the `rapidFire` case (was lines 255-276)**

Replace:

```tsx
    case "rapidFire": {
      const pairs = allLines(fields._pairsText);
      body = pairs.length ? (
        <>
          <p style={{ fontFamily: "var(--font-things)", color: MAROON, fontSize: 16, margin: "4px 0" }}>rapid fire round</p>
          {pairs.map(([a, b], i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <RoundPosition index={i} total={pairs.length} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Pill>{a || "option a"}</Pill>
                <Pill>{b || "option b"}</Pill>
              </div>
            </div>
          ))}
          <p style={{ fontFamily: "var(--font-motive)", fontSize: 9, color: BROWN_DISABLED, marginTop: 6 }}>timed — {(fields.secondsPerPair as string) || "5"}s per pair</p>
        </>
      ) : (
        <p style={{ fontFamily: "var(--font-things)", color: MAROON, fontSize: 16, margin: "4px 0" }}>rapid fire round</p>
      );
      continueLabel = undefined; // rapid fire advances on pick, no Continue bar
      break;
    }
```

with:

```tsx
    case "rapidFire": {
      const pairs = (Array.isArray(fields.pairs) ? fields.pairs : []) as { a?: string; b?: string }[];
      body = pairs.length ? (
        <>
          <p style={{ fontFamily: "var(--font-things)", color: MAROON, fontSize: 16, margin: "4px 0" }}>rapid fire round</p>
          {pairs.map((pair, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <RoundPosition index={i} total={pairs.length} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Pill>{pair.a || "option a"}</Pill>
                <Pill>{pair.b || "option b"}</Pill>
              </div>
            </div>
          ))}
          <p style={{ fontFamily: "var(--font-motive)", fontSize: 9, color: BROWN_DISABLED, marginTop: 6 }}>timed — {(fields.secondsPerPair as string) || "5"}s per pair</p>
        </>
      ) : (
        <p style={{ fontFamily: "var(--font-things)", color: MAROON, fontSize: 16, margin: "4px 0" }}>rapid fire round</p>
      );
      continueLabel = undefined; // rapid fire advances on pick, no Continue bar
      break;
    }
```

- [ ] **Step 5: Rewrite the `opinions` case (was lines 277-302)**

Replace:

```tsx
    case "opinions": {
      const pairs = allLines(fields._pairsText);
      body = pairs.length ? (
        <>
          <p style={{ fontFamily: "var(--font-things)", color: MAROON, fontSize: 16, margin: "4px 0" }}>this-or-that round</p>
          {pairs.map(([oPrompt, a, b, whyPrompt], i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <RoundPosition index={i} total={pairs.length} />
              <Heading>{oPrompt || "prompt"}</Heading>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Pill>{a || "option a"}</Pill>
                <Pill>{b || "option b"}</Pill>
              </div>
              {!!whyPrompt && (
                <p style={{ fontFamily: "var(--font-motive)", fontSize: 10, color: BROWN_SECONDARY, marginTop: 8 }}>
                  then asks (text + voice): &ldquo;{whyPrompt}&rdquo;
                </p>
              )}
            </div>
          ))}
        </>
      ) : (
        <p style={{ fontFamily: "var(--font-things)", color: MAROON, fontSize: 16, margin: "4px 0" }}>this-or-that round</p>
      );
      break;
    }
```

with:

```tsx
    case "opinions": {
      const pairs = (Array.isArray(fields.pairs) ? fields.pairs : []) as { prompt?: string; a?: string; b?: string; whyPrompt?: string }[];
      body = pairs.length ? (
        <>
          <p style={{ fontFamily: "var(--font-things)", color: MAROON, fontSize: 16, margin: "4px 0" }}>this-or-that round</p>
          {pairs.map((pair, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <RoundPosition index={i} total={pairs.length} />
              <Heading>{pair.prompt || "prompt"}</Heading>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Pill>{pair.a || "option a"}</Pill>
                <Pill>{pair.b || "option b"}</Pill>
              </div>
              {!!pair.whyPrompt && (
                <p style={{ fontFamily: "var(--font-motive)", fontSize: 10, color: BROWN_SECONDARY, marginTop: 8 }}>
                  then asks (text + voice): &ldquo;{pair.whyPrompt}&rdquo;
                </p>
              )}
            </div>
          ))}
        </>
      ) : (
        <p style={{ fontFamily: "var(--font-things)", color: MAROON, fontSize: 16, margin: "4px 0" }}>this-or-that round</p>
      );
      break;
    }
```

- [ ] **Step 6: Typecheck and lint**

Run: `cd frinq-admin && npx tsc --noEmit && npx eslint app/components/QuestionPreview.tsx app/components/QuestionForm.tsx`
Expected: no errors — this is the first point where `QuestionForm.tsx` + `QuestionPreview.tsx` together form a fully consistent, unused-marker-free pair.

- [ ] **Step 7: Commit**

```bash
git add frinq-admin/app/components/QuestionPreview.tsx
git commit -m "refactor: QuestionPreview reads options/pairs/sliders directly, drop allLines"
```

---

### Task 5: Create `QuestionsEmptyState.tsx`

**Files:**
- Create: `frinq-admin/app/components/QuestionsEmptyState.tsx`

**Interfaces:**
- Consumes: `appColor` from `frinq-admin/app/lib/appTokens.ts` (already exists — `appColor.maroon`, `appColor.cream`).
- Produces: `QuestionsEmptyState(props: { onCreateNew: () => void })` — consumed by Task 6.

- [ ] **Step 1: Write the file**

Create `frinq-admin/app/components/QuestionsEmptyState.tsx`:

```tsx
"use client";

import { appColor } from "../lib/appTokens";

/** Landing-screen-styled placeholder shown when no question is open —
 *  mirrors frinq-mobile's LandingScreen.tsx (maroon background, centered
 *  cursive wordmark, arrow-in-a-circle button) so the admin panel's empty
 *  state carries the same brand moment instead of a bare hint. The arrow
 *  opens "add question" — a real action, not decoration. */
export function QuestionsEmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-6 rounded-md py-16"
      style={{ background: appColor.maroon }}
    >
      <p className="font-[family-name:var(--font-things)] text-[40px]" style={{ color: appColor.cream }}>frinq</p>
      <button
        type="button"
        onClick={onCreateNew}
        aria-label="Add a new question"
        className="flex items-center justify-center w-16 h-16 rounded-full border transition-opacity hover:opacity-80"
        style={{ borderColor: appColor.cream }}
      >
        <svg width="28" height="20" viewBox="0 0 20 16" aria-hidden>
          <path d="M2 8H18M18 8L11 2M18 8L11 14" stroke={appColor.cream} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.08em] text-center" style={{ color: appColor.cream, opacity: 0.85 }}>
        pick a question below to edit it, or start a new one
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd frinq-admin && npx tsc --noEmit && npx eslint app/components/QuestionsEmptyState.tsx`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frinq-admin/app/components/QuestionsEmptyState.tsx
git commit -m "feat: add landing-screen-styled empty state for the questions page"
```

---

### Task 6: Rewrite `QuestionsView.tsx` (accordion + empty state) and widen `page.tsx`

**Files:**
- Modify: `frinq-admin/app/components/QuestionsView.tsx` (full-file replacement)
- Modify: `frinq-admin/app/questions/page.tsx` (full-file replacement)

**Interfaces:**
- Consumes: `QuestionForm` (Task 3), `QuestionsEmptyState` (Task 5), `quizStepForSave` (Task 1) — all already exist with compatible signatures, no changes needed to them from this task.
- Produces: `QuestionsView(props: { adminKey: string })` — same signature as today, `page.tsx` is its only caller and is updated in this same task.

- [ ] **Step 1: Replace `QuestionsView.tsx`**

Replace `frinq-admin/app/components/QuestionsView.tsx` entirely with:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/app/lib/adminFetch";
import { useAdminAuth } from "@/app/components/AdminShell";
import { QuestionForm } from "./QuestionForm";
import { QuestionsEmptyState } from "./QuestionsEmptyState";
import { Skeleton } from "./Skeleton";
import { quizStepForSave, type QuizStepDraft } from "./QuestionSerialization";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/** Multi-part kinds (opinions/preferences) have neither a top-level prompt
 *  nor heading — fall back to the step's own id is uninformative ("opinions"
 *  vs "opinions"), so describe the round instead. */
function stepRowLabel(step: QuizStepDraft): string {
  if (step.kind === "opinions" && Array.isArray(step.pairs)) {
    const withWhy = step.pairs.some((p) => p && typeof p === "object" && "whyPrompt" in p);
    return `opinions round (${step.pairs.length} pair${step.pairs.length === 1 ? "" : "s"}${withWhy ? " + why" : ""})`;
  }
  if (step.kind === "preferences" && Array.isArray(step.sliders)) {
    return `preference sliders (${step.sliders.length})`;
  }
  return step.id;
}

export function QuestionsView({ adminKey }: { adminKey: string }) {
  const { logout } = useAdminAuth();
  const [steps, setSteps] = useState<QuizStepDraft[] | null>(null);
  // null = nothing open (empty state shows); -1 = the "add question" row is
  // open; 0+ = that step's row is open. At most one is ever open at a time.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!adminKey) return;
    setLoadError(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/quiz-config`, {}, { key: adminKey });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) { setLoadError(`error ${res.status}`); return; }
      const data = await res.json();
      setSteps(data.steps as QuizStepDraft[]);
      // Land on the empty state, not an auto-opened first question — the
      // empty state is the intended landing view now.
      setSelectedIndex(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "network error");
    }
  }, [adminKey, logout]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  async function save() {
    if (!steps || saving) return;
    if (!window.confirm("Confirm save? This changes the quiz for the next session.")) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/quiz-config`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps }) },
        { key: adminKey });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFeedback(`failed: ${d.detail || res.status}`);
        return;
      }
      const body = await res.json();
      setSteps(body.steps);
      setFeedback("saved - live for the next quiz session to start");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "network error");
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  }

  function updateStep(index: number, nextStep: QuizStepDraft) {
    setSteps((current) => current ? current.map((step, i) => i === index ? nextStep : step) : current);
    // Collapse back to the row on save — confirms the edit landed, matches
    // clicking a row again to close it.
    setSelectedIndex(null);
  }

  function addStep(step: Record<string, unknown>) {
    const nextStep = quizStepForSave(step);
    setSteps((current) => {
      const next = [...(current ?? []), nextStep];
      // Keep the just-created question open for further tweaking, unlike
      // an edit-then-save which collapses — there's more reason to keep
      // going right after creating something new.
      setSelectedIndex(next.length - 1);
      return next;
    });
  }

  function deleteStep(index: number) {
    setSteps((current) => {
      if (!current) return current;
      return current.filter((_, i) => i !== index);
    });
    setSelectedIndex(null);
  }

  function dropStep(targetIndex: number) {
    if (dragIndex === null || !steps || dragIndex === targetIndex) return;
    const next = steps.slice();
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    setSteps(next);
    setSelectedIndex(targetIndex);
    setDragIndex(null);
  }

  function startDrag(index: number) {
    setDragIndex(index);
    // Dragging an open row first collapses it — drag and expand are
    // mutually exclusive per row, avoids a half-dragged-open-editor state.
    if (selectedIndex === index) setSelectedIndex(null);
  }

  if (loadError) return <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B]" role="alert">{loadError}</p>;
  if (!steps) return <Skeleton rows={6} height={52} />;

  const selectedStep = selectedIndex !== null && selectedIndex >= 0 ? steps[selectedIndex] : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-[family-name:var(--font-motive)] text-[10px] text-[#8B7355]">drag the handle to reorder. click a question to edit it in place.</p>
        <button onClick={() => void save()} disabled={saving} className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] px-4 py-2 border border-[rgba(42,24,16,0.3)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)] disabled:opacity-40">{saving ? "saving..." : "save all changes"}</button>
      </div>
      {feedback && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#2A7810]" role="status">{feedback}</p>}

      {selectedIndex === null && <QuestionsEmptyState onCreateNew={() => setSelectedIndex(-1)} />}

      <section className="flex flex-col gap-2" aria-label="Quiz questions">
        {steps.map((step, index) => (
          <div key={step.id} className="flex flex-col">
            <div
              draggable
              onDragStart={() => startDrag(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropStep(index)}
              className={`border px-4 py-3.5 flex items-center gap-4 cursor-grab active:cursor-grabbing ${selectedIndex === index ? "border-[#7C1C0B] bg-white" : "border-[rgba(42,24,16,0.12)] bg-white/50"}`}
            >
              <span className="font-[family-name:var(--font-motive)] text-[#8B7355] text-[13px] select-none" title="drag to reorder" aria-label="Drag to reorder">::: </span>
              <button onClick={() => setSelectedIndex(selectedIndex === index ? null : index)} className="text-left flex-1 min-w-0">
                <span className="block font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#7C1C0B]">{index + 1} - {step.kind}</span>
                <span className="block font-[family-name:var(--font-things)] text-[#2A1810] text-[13px] truncate">{(step.prompt as string) || (step.heading as string) || stepRowLabel(step)}</span>
              </button>
              <button aria-label={`Delete ${step.id}`} disabled={saving} onClick={() => deleteStep(index)} className="font-[family-name:var(--font-motive)] text-[9px] px-2 py-1 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] disabled:opacity-30">delete</button>
            </div>
            {selectedIndex === index && selectedStep && (
              <div className="border border-t-0 border-[#7C1C0B] bg-white p-4">
                <QuestionForm
                  key={`${index}-${step.id}`}
                  initial={selectedStep}
                  allowRapidFire={selectedStep.kind === "rapidFire" || !steps.some((s) => s.kind === "rapidFire")}
                  allowOpinions={selectedStep.kind === "opinions" || !steps.some((s) => s.kind === "opinions")}
                  onSave={(step) => updateStep(index, quizStepForSave(step))}
                  onCancel={() => setSelectedIndex(null)}
                />
              </div>
            )}
          </div>
        ))}

        {/* "+ add question" is its own always-last row, opened the same way
            as any existing question — not a special-cased button. */}
        <div className="flex flex-col">
          <button
            onClick={() => setSelectedIndex(selectedIndex === -1 ? null : -1)}
            disabled={saving}
            className={`border px-4 py-3.5 text-left font-[family-name:var(--font-motive)] text-[10px] tracking-[0.12em] uppercase disabled:opacity-40 ${selectedIndex === -1 ? "border-[#7C1C0B] bg-white text-[#2A1810]" : "border-dashed border-[rgba(42,24,16,0.3)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)]"}`}
          >
            + add question
          </button>
          {selectedIndex === -1 && (
            <div className="border border-t-0 border-[#7C1C0B] bg-white p-4">
              <QuestionForm
                key="new-question"
                initial={null}
                allowRapidFire={!steps.some((step) => step.kind === "rapidFire")}
                allowOpinions={!steps.some((step) => step.kind === "opinions")}
                onSave={addStep}
                onCancel={() => setSelectedIndex(null)}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Replace `page.tsx`**

Replace `frinq-admin/app/questions/page.tsx` entirely with:

```tsx
"use client";

import { useAdminAuth } from "@/app/components/AdminShell";
import { QuestionsView } from "@/app/components/QuestionsView";

export default function QuestionsPage() {
  const { adminKey } = useAdminAuth();

  return (
    <div>
      <header className="border-b border-[rgba(42,24,16,0.1)] px-6 py-4 flex items-center justify-between">
        <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-lg">questions</span>
      </header>
      <main className="px-2 sm:px-3 py-6">
        <QuestionsView adminKey={adminKey} />
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `cd frinq-admin && npx tsc --noEmit && npx eslint app/components/QuestionsView.tsx app/questions/page.tsx`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frinq-admin/app/components/QuestionsView.tsx frinq-admin/app/questions/page.tsx
git commit -m "feat: full-width accordion question list with landing-styled empty state"
```

---

### Task 7: Full verification and manual browser walk

**Files:** none (verification only)

**Interfaces:** none — this task confirms Tasks 1-6 work together as a whole.

- [ ] **Step 1: Full typecheck, lint, and unit test**

Run:
```bash
cd frinq-admin
npx tsc --noEmit
npx eslint app/components/QuestionSerialization.ts app/components/QuestionSerialization.test.ts app/components/QuestionOptionEditors.tsx app/components/QuestionForm.tsx app/components/QuestionPreview.tsx app/components/QuestionsEmptyState.tsx app/components/QuestionsView.tsx app/questions/page.tsx
npx tsx app/components/QuestionSerialization.test.ts
```
Expected: all clean, test script prints its pass message and exits 0.

- [ ] **Step 2: Production build**

Run: `cd frinq-admin && npm run build`
Expected: builds successfully, no errors.

- [ ] **Step 3: Manual browser walk**

With the admin dev server running (`cd frinq-admin && npm run dev`) and the backend reachable (see this project's established dev-stack pattern — backend on `127.0.0.1:8000`, admin's `NEXT_PUBLIC_API_URL` pointed at it), open `/questions` and confirm:

1. Page content runs edge-to-edge with only a small gutter (~8-12px) on a wide (laptop-width) window — not a narrow centered column.
2. On load, the empty state renders: maroon background, "frinq" wordmark, circular arrow button, caption. No question is auto-opened.
3. Clicking a question row expands its editor+preview directly beneath that row; the row above/below shift accordingly.
4. Clicking a second row while the first is open: the first collapses, only the second is open.
5. Open a `singleChoiceCard` question: options render as structured rows (label/value/description inputs, ↑/↓/× buttons), not a textarea. Add a row, fill it in, confirm it appears in the phone preview on the right without saving.
6. Open a `multiChoiceTags` question: option rows show only a label input (no value/description).
7. Open the `rapidFire` and `opinions` (this-or-that) rounds: pair rows render correctly; toggling "also ask why" on an opinions pair reveals the why-question input.
8. Open the `preferences` round: slider rows render with all five fields.
9. Click "+ add question": it opens the same way a question row does, at the bottom of the list.
10. Click the empty-state arrow button (reload the page first so nothing is open): it opens the "+ add question" row.
11. Drag-reorder still works on a collapsed row.
12. Edit an existing question, hit "save": its editor collapses back to just the row. Hit "save all changes" at the top, confirm the dialog, confirm the success message.

- [ ] **Step 4: Final commit**

If the manual walk surfaces no changes, there is nothing left to commit — Tasks 1-6 already committed everything. If the walk did surface a fix, make it, re-run Step 1-2, then:

```bash
git add -A
git commit -m "fix: <describe what the manual walk caught>"
```
