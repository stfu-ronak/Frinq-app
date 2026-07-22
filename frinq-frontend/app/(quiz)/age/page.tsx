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

export default function AgePage() {
  const [day, setDay] = useState(() => storedDobPart(0));
  const [month, setMonth] = useState(() => storedDobPart(1));
  const [year, setYear] = useState(() => storedDobPart(2));
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  function handleDay(raw: string) {
    const v = raw.replace(/\D/g, "").slice(0, 2);
    setDay(v);
    if (v.length === 2) monthRef.current?.focus();
  }

  function handleMonth(raw: string) {
    const v = raw.replace(/\D/g, "").slice(0, 2);
    setMonth(v);
    if (v.length === 2) yearRef.current?.focus();
  }

  function handleYear(raw: string) {
    const v = raw.replace(/\D/g, "").slice(0, 4);
    setYear(v);
    if (v.length === 4) submitRef.current?.focus();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!day || !month || !year || year.length < 4) return;
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
