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
