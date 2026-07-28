"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/app/lib/adminFetch";
import { useAdminAuth } from "@/app/components/AdminShell";
import { QuestionForm } from "./QuestionForm";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type StepKind = "text" | "singleChoiceCard" | "singleChoiceList" | "multiChoiceTags" | "slider" | "rapidFire" | "intro";

interface QuizStepDraft {
  id: string;
  kind: StepKind;
  [key: string]: unknown;
}

export function optionsForSave(step: Record<string, unknown>): QuizStepDraft {
  const { _optionsText, _optionValues, ...fields } = step;
  if (typeof _optionsText !== "string") return fields as QuizStepDraft;

  const lines = _optionsText.split("\n").map((line) => line.trim()).filter(Boolean);
  if (fields.kind === "multiChoiceTags") return { ...fields, options: lines } as unknown as QuizStepDraft;
  const existingValues = Array.isArray(_optionValues) ? _optionValues : [];

  const options = lines.map((line, index) => {
    const [labelPart, ...descriptionParts] = line.split("|");
    const label = labelPart.trim();
    const description = descriptionParts.join("|").trim();
    const value = typeof existingValues[index] === "string" ? existingValues[index] : label;
    return description ? { value, label, description } : { value, label };
  });
  return { ...fields, options } as unknown as QuizStepDraft;
}

export function QuestionsView({ adminKey, onRequestPassword, onWrongPassword }: {
  adminKey: string;
  onRequestPassword: () => Promise<string | null>;
  onWrongPassword: () => void;
}) {
  const { logout } = useAdminAuth();
  const [steps, setSteps] = useState<QuizStepDraft[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!adminKey) return;
    setLoadError(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/quiz-config`, {}, { key: adminKey });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) { setLoadError(`error ${res.status}`); return; }
      const data = await res.json();
      setSteps(data.steps);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "network error");
    }
  }, [adminKey, logout]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  async function save(nextSteps: QuizStepDraft[]) {
    const pwd = await onRequestPassword();
    if (!pwd) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/quiz-config`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps: nextSteps }) },
        { key: adminKey, pwd });
      if (res.status === 401) { logout(); return; }
      if (res.status === 403) { onWrongPassword(); setFeedback("wrong action password — try again"); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setFeedback(`failed: ${d.detail || res.status}`);
        return;
      }
      const body = await res.json();
      setSteps(body.steps);
      setFeedback("saved — live for the next quiz session to start");
      setEditingIndex(null);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "network error");
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  }

  function moveStep(index: number, direction: -1 | 1) {
    if (!steps) return;
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = steps.slice();
    [next[index], next[target]] = [next[target], next[index]];
    void save(next);
  }

  function deleteStep(index: number) {
    if (!steps) return;
    void save(steps.filter((_, i) => i !== index));
  }

  if (loadError) return <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B]" role="alert">{loadError}</p>;
  if (!steps) return <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#8B7355]">loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      {feedback && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#2A7810]" role="status">{feedback}</p>}
      <div className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <div key={step.id} className="border border-[rgba(42,24,16,0.12)] bg-white/50 px-4 py-3 flex items-center justify-between gap-3">
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#7C1C0B]">{step.kind}</span>
              <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[13px] truncate">{(step.prompt as string) || (step.heading as string) || step.id}</span>
            </span>
            <div className="flex gap-1.5 shrink-0">
              <button aria-label={`Move ${step.id} up`} disabled={saving || i === 0} onClick={() => moveStep(i, -1)} className="font-[family-name:var(--font-motive)] text-[9px] px-2 py-1 border border-[rgba(42,24,16,0.15)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-30">up</button>
              <button aria-label={`Move ${step.id} down`} disabled={saving || i === steps.length - 1} onClick={() => moveStep(i, 1)} className="font-[family-name:var(--font-motive)] text-[9px] px-2 py-1 border border-[rgba(42,24,16,0.15)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-30">down</button>
              <button aria-label={`Edit ${step.id}`} disabled={saving} onClick={() => setEditingIndex(i)} className="font-[family-name:var(--font-motive)] text-[9px] px-2 py-1 border border-[rgba(42,24,16,0.15)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-30">edit</button>
              <button aria-label={`Delete ${step.id}`} disabled={saving} onClick={() => deleteStep(i)} className="font-[family-name:var(--font-motive)] text-[9px] px-2 py-1 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] disabled:opacity-30">delete</button>
            </div>
          </div>
        ))}
      </div>
      {editingIndex !== null ? (
        <QuestionForm
          initial={editingIndex >= 0 ? steps[editingIndex] : null}
          allowRapidFire={!steps.some((step) => step.kind === "rapidFire")}
          onSave={(step) => {
            const nextStep = optionsForSave(step);
            const next = editingIndex >= 0 ? steps.map((s, i) => (i === editingIndex ? nextStep : s)) : [...steps, nextStep];
            void save(next);
          }}
          onCancel={() => setEditingIndex(null)}
        />
      ) : (
        <button onClick={() => setEditingIndex(-1)} disabled={saving} className="self-start font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(42,24,16,0.3)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)] disabled:opacity-40">+ add question</button>
      )}
    </div>
  );
}
