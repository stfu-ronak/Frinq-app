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
      .filter((p): p is { prompt: string; a: string; b: string } | { prompt: string; a: string; b: string; whyPrompt: string; whyAllowVoice: true } => p !== null);
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

  if (pairText !== null && fields.kind === "opinions") {
    const pairs = pairText.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [prompt, a, b, whyPrompt] = line.split("|").map((part) => part.trim());
      return whyPrompt ? { prompt, a, b, whyPrompt, whyAllowVoice: true } : { prompt, a, b };
    });
    fields.pairs = pairs;
    // Auto-derived, not admin-typed — every real use case wants exactly this.
    fields.whyAnswerKey = pairs.some((p) => "whyPrompt" in p) ? `${fields.answerKey || newAnswerKey()}_why` : undefined;
  }

  if (optionText !== null && fields.kind === "preferences") {
    fields.sliders = optionText.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [prompt, leftLabel, leftHint, rightLabel, rightHint] = line.split("|").map((part) => part.trim());
      return { prompt, leftLabel, leftHint, rightLabel, rightHint };
    });
  }

  return fields as QuizStepDraft;
}

function newAnswerKey(): string { return `custom_${Date.now()}`; }
