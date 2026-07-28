"use client";

import { useState } from "react";

type StepKind = "text" | "singleChoiceCard" | "singleChoiceList" | "multiChoiceTags" | "slider" | "rapidFire" | "intro";

const KIND_LABELS: Record<StepKind, string> = {
  text: "text (+ optional voice)",
  singleChoiceCard: "MCQ — description cards",
  singleChoiceList: "MCQ — vertical list or would-you-rather",
  multiChoiceTags: "MCQ — tag flow or checklist",
  slider: "slider (1-5)",
  rapidFire: "rapid fire",
  intro: "section intro screen",
};

function newAnswerKey(): string { return `custom_${Date.now()}`; }

function optionsText(initial: Record<string, unknown>): string {
  if (!Array.isArray(initial.options)) return "";
  return initial.options.map((option) => {
    if (typeof option === "string") return option;
    if (!option || typeof option !== "object") return "";
    const value = option as { label?: unknown; value?: unknown; description?: unknown };
    const label = typeof value.label === "string" ? value.label : String(value.value ?? "");
    const prefix = typeof value.value === "string" ? `${value.value} :: ` : "";
    return typeof value.description === "string" ? `${prefix}${label} | ${value.description}` : `${prefix}${label}`;
  }).filter(Boolean).join("\n");
}

function pairsText(initial: Record<string, unknown>): string {
  if (!Array.isArray(initial.pairs)) return "";
  return initial.pairs.map((pair) => {
    if (!pair || typeof pair !== "object") return "";
    const { a, b } = pair as { a?: unknown; b?: unknown };
    return typeof a === "string" && typeof b === "string" ? `${a} | ${b}` : "";
  }).filter(Boolean).join("\n");
}

export function QuestionForm({ initial, onSave, onCancel, allowRapidFire = false }: {
  initial: Record<string, unknown> | null;
  onSave: (step: Record<string, unknown>) => void;
  onCancel: () => void;
  allowRapidFire?: boolean;
}) {
  const [kind, setKind] = useState<StepKind | null>((initial?.kind as StepKind) ?? null);
  const [fields, setFields] = useState<Record<string, unknown>>(() => initial ? {
    ...initial,
    _optionsText: optionsText(initial),
    _pairsText: pairsText(initial),
  } : {});

  if (!kind) return <div className="border border-[rgba(42,24,16,0.15)] rounded-md p-4"><p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355] mb-3">pick a question type</p><div className="flex flex-wrap gap-2">{(Object.keys(KIND_LABELS) as StepKind[]).filter((k) => k !== "rapidFire" || allowRapidFire).map((k) => <button key={k} onClick={() => setKind(k)} className="font-[family-name:var(--font-motive)] text-[10px] px-3 py-1.5 border border-[rgba(42,24,16,0.18)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)]">{KIND_LABELS[k]}</button>)}</div><button onClick={onCancel} className="mt-3 font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355]">cancel</button></div>;

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

  return <div className="border border-[rgba(42,24,16,0.15)] rounded-md p-4 flex flex-col gap-3"><p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355]">{KIND_LABELS[kind]}</p>
    {kind === "text" && <>{field("prompt", "prompt")}{field("placeholder", "placeholder (optional)")}<label className="flex items-center gap-2"><input type="checkbox" checked={!!fields.allowVoice} onChange={(e) => setFields((f) => ({ ...f, allowVoice: e.target.checked }))} /><span className="font-[family-name:var(--font-motive)] text-[10px] text-[#2A1810]">allow voice answer</span></label></>}
    {kind === "slider" && <>{field("prompt", "prompt")}{field("leftLabel", "left label")}{field("leftHint", "left hint (short)")}{field("rightLabel", "right label")}{field("rightHint", "right hint (short)")}</>}
    {kind === "intro" && <>{field("heading", "heading")}{field("body", "body (optional)")}{field("ctaLabel", "button label")}</>}
    {kind === "rapidFire" && <><label className="flex flex-col gap-1"><span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] uppercase text-[#8B7355]">pairs (one “this or that” pair per line)</span><textarea rows={5} value={(fields._pairsText as string) ?? ""} onChange={(e) => setFields((f) => ({ ...f, _pairsText: e.target.value }))} className="frinq-input" /></label>{field("secondsPerPair", "seconds per pair", "5")}</>}
    {(kind === "singleChoiceCard" || kind === "singleChoiceList" || kind === "multiChoiceTags") && <>{field("prompt", "prompt")}<label className="flex flex-col gap-1"><span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] uppercase text-[#8B7355]">options (one per line{kind === "multiChoiceTags" ? "" : ', use “value :: label” to preserve a choice value'}{kind === "singleChoiceCard" ? ', and “label | description” for descriptions' : ""})</span><textarea rows={5} value={(fields._optionsText as string) ?? ""} onChange={(e) => setFields((f) => ({ ...f, _optionsText: e.target.value }))} className="frinq-input" /></label>{kind === "singleChoiceList" && <label className="flex items-center gap-2"><input type="checkbox" checked={fields.variant === "box"} onChange={(e) => setFields((f) => ({ ...f, variant: e.target.checked ? "box" : "pill", chrome: e.target.checked ? "simple" : undefined }))} /><span className="font-[family-name:var(--font-motive)] text-[10px] text-[#2A1810]">&quot;would you rather&quot; style (exactly 2 options)</span></label>}{kind === "multiChoiceTags" && <label className="flex items-center gap-2"><input type="checkbox" checked={fields.layout === "list"} onChange={(e) => setFields((f) => ({ ...f, layout: e.target.checked ? "list" : "chips" }))} /><span className="font-[family-name:var(--font-motive)] text-[10px] text-[#2A1810]">vertical checklist style (instead of tag flow)</span></label>}</>}
    <div className="flex gap-2 mt-2"><button onClick={submit} className="font-[family-name:var(--font-motive)] text-[10px] px-3 py-1.5 border border-[rgba(42,24,16,0.3)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)]">save</button><button onClick={onCancel} className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355]">cancel</button></div>
  </div>;
}
