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
