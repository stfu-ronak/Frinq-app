"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/app/lib/adminFetch";
import { useAdminAuth } from "@/app/components/AdminShell";
import { QuestionForm } from "./QuestionForm";
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
      const loaded = data.steps as QuizStepDraft[];
      setSteps(loaded);
      setSelectedIndex(loaded.length ? 0 : null);
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
  }

  function addStep(step: Record<string, unknown>) {
    const nextStep = quizStepForSave(step);
    setSteps((current) => {
      const next = [...(current ?? []), nextStep];
      setSelectedIndex(next.length - 1);
      return next;
    });
  }

  function deleteStep(index: number) {
    setSteps((current) => {
      if (!current) return current;
      const next = current.filter((_, i) => i !== index);
      setSelectedIndex(next.length ? Math.min(index, next.length - 1) : null);
      return next;
    });
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

  if (loadError) return <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B]" role="alert">{loadError}</p>;
  if (!steps) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.9fr)] gap-5 items-start">
        <Skeleton rows={6} height={52} />
        <Skeleton rows={4} height={40} />
      </div>
    );
  }

  const selectedStep = selectedIndex !== null && selectedIndex >= 0 ? steps[selectedIndex] : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-[family-name:var(--font-motive)] text-[10px] text-[#8B7355]">drag the handle to reorder. select a question to edit it beside the list.</p>
        <button onClick={() => void save()} disabled={saving} className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] px-4 py-2 border border-[rgba(42,24,16,0.3)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)] disabled:opacity-40">{saving ? "saving..." : "save all changes"}</button>
      </div>
      {feedback && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#2A7810]" role="status">{feedback}</p>}

      {/* Wider editor column + a real gutter: on a laptop the list and the
          editor/preview pair were touching, and the editor half was too
          narrow to read a long prompt without wrapping mid-word. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)] gap-6 xl:gap-10 items-start">
        <section className="flex flex-col gap-2" aria-label="Quiz questions">
          {steps.map((step, index) => (
            <div
              key={step.id}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropStep(index)}
              className={`border px-4 py-3.5 flex items-center gap-4 cursor-grab active:cursor-grabbing ${selectedIndex === index ? "border-[#7C1C0B] bg-white" : "border-[rgba(42,24,16,0.12)] bg-white/50"}`}
            >
              <span className="font-[family-name:var(--font-motive)] text-[#8B7355] text-[13px] select-none" title="drag to reorder" aria-label="Drag to reorder">::: </span>
              <button onClick={() => setSelectedIndex(index)} className="text-left flex-1 min-w-0">
                <span className="block font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#7C1C0B]">{index + 1} - {step.kind}</span>
                <span className="block font-[family-name:var(--font-things)] text-[#2A1810] text-[13px] truncate">{(step.prompt as string) || (step.heading as string) || stepRowLabel(step)}</span>
              </button>
              <button aria-label={`Delete ${step.id}`} disabled={saving} onClick={() => deleteStep(index)} className="font-[family-name:var(--font-motive)] text-[9px] px-2 py-1 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] disabled:opacity-30">delete</button>
            </div>
          ))}
          <button onClick={() => setSelectedIndex(-1)} disabled={saving} className="self-start mt-2 font-[family-name:var(--font-motive)] text-[10px] tracking-[0.12em] px-3 py-1.5 border border-[rgba(42,24,16,0.3)] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)] disabled:opacity-40">+ add question</button>
        </section>

        {/* Not sticky itself — QuestionForm's preview column owns the sticky
            behaviour now, so the (taller) editor fields can scroll normally
            instead of being pinned and clipped. */}
        <section aria-label="Question editor">
          {selectedIndex === -1 ? (
            <QuestionForm
              key="new-question"
              initial={null}
              allowRapidFire={!steps.some((step) => step.kind === "rapidFire")}
              allowOpinions={!steps.some((step) => step.kind === "opinions")}
              onSave={addStep}
              onCancel={() => setSelectedIndex(steps.length ? 0 : null)}
            />
          ) : selectedStep && selectedIndex !== null ? (
            <QuestionForm
              key={`${selectedIndex}-${selectedStep.id}`}
              initial={selectedStep}
              allowRapidFire={selectedStep.kind === "rapidFire" || !steps.some((step) => step.kind === "rapidFire")}
              allowOpinions={selectedStep.kind === "opinions" || !steps.some((step) => step.kind === "opinions")}
              onSave={(step) => updateStep(selectedIndex, quizStepForSave(step))}
              onCancel={() => setSelectedIndex(null)}
            />
          ) : (
            <div className="border border-dashed border-[rgba(42,24,16,0.18)] p-5 text-center font-[family-name:var(--font-motive)] text-[10px] text-[#8B7355]">select a question to edit</div>
          )}
        </section>
      </div>
    </div>
  );
}
