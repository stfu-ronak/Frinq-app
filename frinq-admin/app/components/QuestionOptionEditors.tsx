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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
