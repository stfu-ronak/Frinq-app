"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import QuestionLabel from "@/app/components/QuestionLabel";
import { getQuizState, setQuizState } from "@/app/lib/storage";

function storedDobPart(index: number): string {
  const s = getQuizState("frinq_dob");
  if (!s) return "";
  return s.split("/")[index] ?? "";
}

// Mirrors app/core/age_gate.py — feedback only, the server is the
// authority (it re-validates on both partial save and quiz completion).
function parseDob(day: string, month: string, year: string): Date | null {
  const d = Number(day), m = Number(month), y = Number(year);
  if (!d || !m || !y) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null; // rejects impossible calendar dates (e.g. 31/02) instead of letting them roll over
  }
  return date;
}

function isAtLeast18(dob: Date, today: Date): boolean {
  const eighteenth = new Date(Date.UTC(dob.getUTCFullYear() + 18, dob.getUTCMonth(), dob.getUTCDate()));
  return today.getTime() >= eighteenth.getTime();
}

export default function AgePage() {
  const [day, setDay] = useState(() => storedDobPart(0));
  const [month, setMonth] = useState(() => storedDobPart(1));
  const [year, setYear] = useState(() => storedDobPart(2));
  const [error, setError] = useState<string | null>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  function handleDay(raw: string) {
    const v = raw.replace(/\D/g, "").slice(0, 2);
    setDay(v);
    setError(null);
    if (v.length === 2) monthRef.current?.focus();
  }

  function handleMonth(raw: string) {
    const v = raw.replace(/\D/g, "").slice(0, 2);
    setMonth(v);
    setError(null);
    if (v.length === 2) yearRef.current?.focus();
  }

  function handleYear(raw: string) {
    const v = raw.replace(/\D/g, "").slice(0, 4);
    setYear(v);
    setError(null);
    if (v.length === 4) submitRef.current?.focus();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!day || !month || !year || year.length < 4) return;

    const dob = parseDob(day, month, year);
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");
    if (!dob || dob.getTime() > today.getTime()) {
      setError("that doesn't look like a real date");
      return;
    }
    if (!isAtLeast18(dob, today)) {
      setError("frinq is for 18+ right now");
      return;
    }
    setError(null);

    setQuizState("frinq_dob", `${day}/${month}/${year}`);
    if (document.startViewTransition) {
      document.startViewTransition(() => { router.push("/ready"); });
    } else {
      router.push("/ready");
    }
  }

  const fields = [
    { label: "day", value: day, onChange: handleDay, placeholder: "14", ref: null as null },
    { label: "month", value: month, onChange: handleMonth, placeholder: "03", ref: monthRef },
    { label: "year", value: year, onChange: handleYear, placeholder: "1999", ref: yearRef, wide: true },
  ];

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <Header section="s0 · let's begin" backHref="/city" />

      <main className="flex-1 flex flex-col justify-center px-8 pt-20 pb-16 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl">
          <QuestionLabel>when were you born?</QuestionLabel>
          <div className="mb-6" />
          <form onSubmit={handleSubmit}>
            <div className="flex gap-8 md:gap-12 items-end">
              {fields.map(({ label, value, onChange, placeholder, ref, wide }) => (
                <div key={label} className="flex flex-col gap-2">
                  <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.18em] text-[#8B7355]">
                    {label}
                  </span>
                  <input
                    ref={ref as React.RefObject<HTMLInputElement>}
                    className={`frinq-input text-center font-[family-name:var(--font-things)] tracking-wider ${wide ? "w-24 md:w-32" : "w-14 md:w-20"}`}
                    style={{ fontSize: "clamp(22px, 4.5vw, 34px)" }}
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    inputMode="numeric"
                    autoFocus={label === "day"}
                  />
                </div>
              ))}
            </div>
            {error && (
              <p className="mt-4 font-[family-name:var(--font-motive)] text-[11px] tracking-[0.1em] text-[#7C1C0B]">
                {error}
              </p>
            )}
            <button
              ref={submitRef}
              type="submit"
              disabled={!day || !month || !year || year.length < 4}
              className="mt-10 inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors group disabled:opacity-30 disabled:cursor-not-allowed"
            >
              next
              <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="transition-transform group-hover:translate-x-1">
                <path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
