"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import QuestionLabel from "@/app/components/QuestionLabel";
import { getQuizState, setQuizState } from "@/app/lib/storage";
import { setIdentityField } from "@/app/lib/identity";

export default function NamePage() {
  const [value, setValue] = useState(() => getQuizState("frinq_name") ?? "");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setQuizState("frinq_name", value.trim());
    setIdentityField("name", value.trim());
    window.frinqTrack?.("submit_name", { page: "/name" });
    if (document.startViewTransition) {
      document.startViewTransition(() => { router.push("/phone"); });
    } else {
      router.push("/phone");
    }
  }

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <Header section="s0 · let's begin" backHref="/s0" />

      <main className="flex-1 flex flex-col justify-center px-8 pt-20 pb-16 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl">
          <QuestionLabel>what should we call you?</QuestionLabel>
          <div className="mb-6" />
          <form onSubmit={handleSubmit}>
            <input
              className="frinq-input text-[1.1rem] md:text-[1.25rem]"
              placeholder="your name..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              disabled={!value.trim()}
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
