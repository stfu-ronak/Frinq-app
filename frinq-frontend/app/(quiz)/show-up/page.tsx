"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import QuestionLabel from "@/app/components/QuestionLabel";
import HashtagInput from "@/app/components/HashtagInput";
import { getQuizState, setQuizState } from "@/app/lib/storage";

const CHIPS = [
  "i check in regularly",
  "i show up in person",
  "i remember small details",
  "i give thoughtful gifts",
  "i sit with them in silence",
  "i offer practical help",
  "i listen without fixing",
  "i send voice notes",
  "i plan quality time",
  "i hype them up loudly",
  "i text first, always",
  "i hold space in hard weeks",
];

export default function ShowUpPage() {
  const [value, setValue] = useState(() => getQuizState("frinq_show_up") ?? "");
  const [flashChip, setFlashChip] = useState<string | null>(null);
  const router = useRouter();

  function isChipInValue(chip: string): boolean {
    return value.toLowerCase().includes(chip.toLowerCase());
  }

  function addChip(chip: string) {
    setFlashChip(chip);
    setTimeout(() => setFlashChip(null), 320);
    window.frinqTrack?.("select", { page: "/show-up", choice: chip });
    setValue((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return chip;
      if (trimmed.toLowerCase().includes(chip.toLowerCase())) return prev;
      return trimmed + ", " + chip;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    window.frinqTrack?.("submit", { page: "/show-up", value });
    setQuizState("frinq_show_up", value.trim());
    if (document.startViewTransition) {
      document.startViewTransition(() => router.push("/rapid-intro"));
    } else {
      router.push("/rapid-intro");
    }
  }

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <Header section="s2 · what would you do" backHref="/red-flags" />

      <main className="flex-1 min-h-0 overflow-y-auto px-8 pt-20 pb-24 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl">
          <QuestionLabel>how do you show up for people you care about?</QuestionLabel>

          <form onSubmit={handleSubmit}>
            {/* Primary input — hashtag chips */}
            <div className="mb-8">
              <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.22em] text-[#8B7355] mb-2.5 uppercase">
                in your words · press enter to add
              </p>
              <HashtagInput
                value={value}
                onChange={setValue}
                placeholder="i remember the things you said in passing..."
                autoFocus
                flashKey={flashChip}
              />
            </div>

            {/* Chip suggestions — secondary */}
            <div className="mb-10">
              <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.22em] text-[#8B7355] mb-3 uppercase">
                or pick from these
              </p>
              <div className="flex flex-wrap gap-2">
                {CHIPS.map((chip) => {
                  const inValue = isChipInValue(chip);
                  const isFlashing = flashChip === chip;
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => addChip(chip)}
                      className="px-3.5 py-2 rounded-full border font-[family-name:var(--font-things)] text-[13px]"
                      style={{
                        borderColor: inValue ? "#7C1C0B" : "rgba(42,24,16,0.18)",
                        background: isFlashing ? "rgba(124,28,11,0.18)" : inValue ? "rgba(124,28,11,0.08)" : "transparent",
                        color: inValue ? "#7C1C0B" : "#2A1810",
                        transform: isFlashing ? "scale(0.94)" : inValue ? "scale(1.02)" : "scale(1)",
                        transition: "transform 180ms cubic-bezier(0.34,1.56,0.64,1), background 220ms ease, border-color 220ms ease, color 220ms ease",
                      }}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={!value.trim()}
              className="inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors group disabled:opacity-30 disabled:cursor-not-allowed"
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
