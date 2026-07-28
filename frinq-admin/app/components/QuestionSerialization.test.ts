import assert from "node:assert/strict";
import { quizStepForSave } from "./QuestionSerialization";

const originalChoices = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
  { value: "c", label: "Option C" },
];
// Delete the middle option and reorder the surviving choices.
const edited = quizStepForSave({
  id: "choices",
  kind: "singleChoiceCard",
  _optionsText: `${originalChoices[2].value} :: ${originalChoices[2].label}\n${originalChoices[0].value} :: ${originalChoices[0].label}`,
  _pairsText: "editor-only",
});
assert.deepEqual(edited.options, [
  { value: "c", label: "Option C" },
  { value: "a", label: "Option A" },
]);
assert.equal("_optionsText" in edited, false);
assert.equal("_pairsText" in edited, false);

for (const step of [
  { id: "intro", kind: "intro", heading: "Hi", ctaLabel: "Go", _optionsText: "editor-only", _pairsText: "editor-only" },
  { id: "slider", kind: "slider", prompt: "Rate", _optionsText: "editor-only", _pairsText: "editor-only" },
  { id: "rapid", kind: "rapidFire", secondsPerPair: "10", _pairsText: "a | b", _optionsText: "editor-only" },
]) {
  const saved = quizStepForSave(step);
  assert.equal(Object.keys(saved).some((key) => key.startsWith("_")), false);
}

const rapid = quizStepForSave({ id: "rapid", kind: "rapidFire", secondsPerPair: "10", _pairsText: "a | b" });
assert.deepEqual(rapid.pairs, [{ a: "a", b: "b" }]);
assert.equal(rapid.secondsPerPair, 10);
