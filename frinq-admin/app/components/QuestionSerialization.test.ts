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

const newQuestion = quizStepForSave({ id: "new", kind: "text", prompt: "New question?" });
assert.equal(newQuestion.section, "custom");

const sectionedQuestion = quizStepForSave({
  id: "sectioned",
  kind: "text",
  section: "who you are",
  prompt: "Sectioned question?",
});
assert.equal(sectionedQuestion.section, "who you are");

const opinionsNoWhy = quizStepForSave({
  id: "opinions", kind: "opinions", answerKey: "opinions",
  _pairsText: "on ai: | it will replace us | humans can't be replaced",
});
assert.deepEqual(opinionsNoWhy.pairs, [{ prompt: "on ai:", a: "it will replace us", b: "humans can't be replaced" }]);
assert.equal(opinionsNoWhy.whyAnswerKey, undefined);

const opinionsWithWhy = quizStepForSave({
  id: "opinions", kind: "opinions", answerKey: "opinions",
  _pairsText: "on ai: | it will replace us | humans can't be replaced | what makes you think that?",
});
assert.deepEqual(opinionsWithWhy.pairs, [{
  prompt: "on ai:", a: "it will replace us", b: "humans can't be replaced",
  whyPrompt: "what makes you think that?", whyAllowVoice: true,
}]);
assert.equal(opinionsWithWhy.whyAnswerKey, "opinions_why");

const preferences = quizStepForSave({
  id: "preferences", kind: "preferences", answerKey: "preferences",
  _optionsText: "you trust more | what you see | see | what you sense | sense",
});
assert.deepEqual(preferences.sliders, [{ prompt: "you trust more", leftLabel: "what you see", leftHint: "see", rightLabel: "what you sense", rightHint: "sense" }]);

const voiceOrText = quizStepForSave({ id: "story", kind: "voiceOrText", heading: "tell us a story" });
assert.equal("_optionsText" in voiceOrText, false);
assert.equal("_pairsText" in voiceOrText, false);
assert.equal(voiceOrText.heading, "tell us a story");
