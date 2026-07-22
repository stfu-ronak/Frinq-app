"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import QuestionLabel from "@/app/components/QuestionLabel";
import { setQuizState } from "@/app/lib/storage";

const OPTIONS = [
  {
    label: "i don't drink or smoke.",
    icon: (
      <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
        <path d="M9 2C9 2 4 7 4 12a5 5 0 0010 0C14 7 9 2 9 2z" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: "a beer or two. socially.",
    icon: (
      <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
        <rect x="3" y="6" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
        <path d="M13 9h2a2 2 0 010 4h-2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <line x1="3" y1="10" x2="13" y2="10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "hard drinks when i drink.",
    icon: (
      <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
        <path d="M4 3h10l-2 8H6L4 3z" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinejoin="round" />
        <line x1="9" y1="11" x2="9" y2="18" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <line x1="6" y1="18" x2="12" y2="18" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "i smoke or vape. that's my thing.",
    icon: (
      <svg width="22" height="16" viewBox="0 0 22 16" fill="none">
        <rect x="1" y="8" width="14" height="5" rx="2.5" stroke="currentColor" strokeWidth="1.1" />
        <rect x="15" y="8" width="4" height="5" rx="1" stroke="currentColor" strokeWidth="1.1" />
        <path d="M17 7V5a3 3 0 00-3-3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" />
        <path d="M19 7V4a5 5 0 00-5-3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      </svg>
    ),
  },
  {
    label: "weed is how i decompress.",
    icon: (
      <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
        <path d="M9 18V10" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M9 13C9 13 5 11 4 7c0 0 4 1 5 4z" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinejoin="round" />
        <path d="M9 11C9 11 13 9 14 5c0 0-4 1-5 4z" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinejoin="round" />
        <path d="M9 10C9 10 7 6 9 3c2 3 0 7 0 7z" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinejoin="round" />
        <line x1="7" y1="18" x2="11" y2="18" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: "some combination depending on the night.",
    icon: (
      <svg width="22" height="20" viewBox="0 0 22 20" fill="none">
        <circle cx="7" cy="10" r="5" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="15" cy="10" r="5" stroke="currentColor" strokeWidth="1.1" />
        <circle cx="11" cy="6" r="2" fill="currentColor" opacity="0.4" />
      </svg>
    ),
  },
];

export default function ScenePage() {
  const [picked, setPicked] = useState<number[]>([]);
  const router = useRouter();

  function toggle(i: number) {
    const adding = !picked.includes(i);
    window.frinqTrack?.("select", { page: "/scene", choice: OPTIONS[i].label, selected: adding });
    setPicked((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );
  }

  function handleNext() {
    if (picked.length === 0) return;
    const labels = picked.map((i) => OPTIONS[i].label);
    window.frinqTrack?.("submit", { page: "/scene", choices: labels });
    setQuizState("frinq_scene", JSON.stringify(labels));
    if (document.startViewTransition) {
      document.startViewTransition(() => router.push("/saturday-night"));
    } else {
      router.push("/saturday-night");
    }
  }

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <Header section="s1 · who you are" backHref="/social-type" />

      <main className="flex-1 min-h-0 overflow-y-auto px-8 pt-20 pb-24 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up">
          <QuestionLabel>what&apos;s your scene?</QuestionLabel>

          <div className="w-full max-w-2xl mb-8">
            {OPTIONS.map((opt, i) => {
              const active = picked.includes(i);
              return (
                <div
                  key={i}
                  onClick={() => toggle(i)}
                  className="flex items-center gap-5 py-4 border-b cursor-pointer transition-colors"
                  style={{
                    borderColor: "rgba(42,24,16,0.12)",
                    color: active ? "#7C1C0B" : "#2A1810",
                  }}
                >
                  {opt.icon && (
                    <span className="w-6 flex-shrink-0">{opt.icon}</span>
                  )}
                  <span className="font-[family-name:var(--font-motive)] text-[15px] md:text-[16px] font-light flex-1">
                    {opt.label}
                  </span>
                  <span
                    className="w-4 h-4 rounded-full border flex-shrink-0 transition-all"
                    style={{
                      borderColor: active ? "#7C1C0B" : "rgba(42,24,16,0.25)",
                      background: active ? "#7C1C0B" : "transparent",
                    }}
                  />
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleNext}
            disabled={picked.length === 0}
            className="inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors group disabled:opacity-30 disabled:cursor-not-allowed"
          >
            next
            <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="transition-transform group-hover:translate-x-1">
              <path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      </main>
    </div>
  );
}
