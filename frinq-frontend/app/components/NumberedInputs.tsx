"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setQuizState } from "@/app/lib/storage";

interface Props {
  placeholders: string[];
  nextHref: string;
  storageKey?: string;
  minRequired?: number;
}

export default function NumberedInputs({ placeholders, nextHref, storageKey, minRequired = 2 }: Props) {
  const [values, setValues] = useState<string[]>(placeholders.map(() => ""));
  const router = useRouter();

  function handleChange(i: number, val: string) {
    setValues((prev) => {
      const next = [...prev];
      next[i] = val;
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const filled = values.filter((v) => v.trim());
    if (filled.length < minRequired) return;
    if (storageKey) {
      setQuizState(storageKey, JSON.stringify(filled));
    }
    if (document.startViewTransition) {
      document.startViewTransition(() => { router.push(nextHref); });
    } else {
      router.push(nextHref);
    }
  }

  const filledCount = values.filter((v) => v.trim()).length;
  const canSubmit = filledCount >= minRequired;

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl flex flex-col gap-0">
      {placeholders.map((ph, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-[rgba(42,24,16,0.15)] py-4">
          <span className="font-[family-name:var(--font-things)] text-[22px] text-[#7C1C0B] w-7 flex-shrink-0 leading-none">
            {String(i + 1).padStart(2, "0")}
          </span>
          <input
            className="frinq-input border-none py-0"
            style={{ borderBottom: "none" }}
            placeholder={ph}
            value={values[i]}
            onChange={(e) => handleChange(i, e.target.value)}
            autoFocus={i === 0}
          />
        </div>
      ))}
      <div className="flex items-center gap-4 mt-10">
        {canSubmit && (
          <button
            type="submit"
            className="self-start inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors group"
          >
            continue
            <svg width="28" height="8" viewBox="0 0 28 8" fill="none" className="transition-transform group-hover:translate-x-1">
              <path d="M0 4H26M26 4L22.5 1M26 4L22.5 7" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        )}
        {!canSubmit && filledCount > 0 && (
          <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] text-[#8B7355]">
            {minRequired - filledCount} more to go
          </span>
        )}
      </div>
    </form>
  );
}
