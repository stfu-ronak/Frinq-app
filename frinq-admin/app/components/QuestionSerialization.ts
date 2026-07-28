export type StepKind = "text" | "singleChoiceCard" | "singleChoiceList" | "multiChoiceTags" | "slider" | "rapidFire" | "intro";

export interface QuizStepDraft {
  id: string;
  kind: StepKind;
  [key: string]: unknown;
}

function choiceOption(line: string): { value: string; label: string; description?: string } {
  const separator = line.indexOf("::");
  const valuePart = separator >= 0 ? line.slice(0, separator) : "";
  const labelPart = separator >= 0 ? line.slice(separator + 2) : line;
  const [label, ...descriptionParts] = (labelPart ?? "").split("|").map((part) => part.trim());
  const value = valuePart.trim() || label;
  const description = descriptionParts.join("|").trim();
  return description ? { value, label, description } : { value, label };
}

/** Removes form-only fields and turns the editor's text formats into API data. */
export function quizStepForSave(step: Record<string, unknown>): QuizStepDraft {
  const optionText = typeof step._optionsText === "string" ? step._optionsText : null;
  const pairText = typeof step._pairsText === "string" ? step._pairsText : null;
  const fields = Object.fromEntries(Object.entries(step).filter(([key]) => !key.startsWith("_")));

  if (optionText !== null && fields.kind === "multiChoiceTags") {
    fields.options = optionText.split("\n").map((line) => line.trim()).filter(Boolean);
  } else if (optionText !== null && (fields.kind === "singleChoiceCard" || fields.kind === "singleChoiceList")) {
    fields.options = optionText.split("\n").map((line) => line.trim()).filter(Boolean).map(choiceOption);
  }

  if (pairText !== null && fields.kind === "rapidFire") {
    fields.pairs = pairText.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      const [a, ...rest] = line.split("|");
      return { a: a.trim(), b: rest.join("|").trim() };
    });
    fields.secondsPerPair = Number(fields.secondsPerPair) || 5;
  }

  return fields as QuizStepDraft;
}
