"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getQuizState, setQuizState } from "@/app/lib/storage";
import QuestionLabel from "@/app/components/QuestionLabel";
import HashtagInput from "@/app/components/HashtagInput";

const TRAIT_CHIPS = [
  "emotionally available",
  "ambitious & driven",
  "curious & open-minded",
  "family-oriented",
  "spiritually aligned",
  "financially responsible",
  "funny & playful",
  "good communicator",
  "physically active",
  "socially confident",
  "introverted & calm",
  "culturally aware",
];

/**
 * Hashtag-style multi-pick matching /interests, /event-yes, /event-no.
 * Page was previously h-dvh + overflow-hidden which pushed the submit
 * button off-screen as the HashtagInput grew vertically with each
 * selected pill. Now min-h-dvh + scrollable main so the button is
 * always reachable.
 */
export default function LastQuestionPage() {
  const [value, setValue] = useState(() => getQuizState("frinq_looking_for") ?? "");
  const [flashChip, setFlashChip] = useState<string | null>(null);
  const router = useRouter();

  function getTags(): string[] {
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }

  function isChipInValue(chip: string): boolean {
    return getTags().some((t) => t.toLowerCase() === chip.toLowerCase());
  }

  function toggleChip(chip: string) {
    const tags = getTags();
    setFlashChip(chip);
    setTimeout(() => setFlashChip(null), 320);
    const isOn = tags.some((t) => t.toLowerCase() === chip.toLowerCase());
    window.frinqTrack?.("toggle", { page: "/last-question", choice: chip, on: !isOn });
    if (isOn) {
      setValue(tags.filter((t) => t.toLowerCase() !== chip.toLowerCase()).join(", "));
    } else {
      setValue([...tags, chip].join(", "));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setQuizState("frinq_looking_for", value.trim());
    if (document.startViewTransition) {
      document.startViewTransition(() => { router.push("/connecting"); });
    } else {
      router.push("/connecting");
    }
  }

  return (
    <div className="min-h-dvh bg-[#F5F0E8] flex flex-col">
      <header className="flex items-center px-8 py-5 flex-shrink-0 bg-[#F5F0E8]">
        <Image src="/fq-logo.png" alt="frinq" width={38} height={38} className="w-[38px] h-[38px]" />
      </header>

      <main className="flex-1 px-8 pt-12 pb-28 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl">
          <QuestionLabel>what kind of people are you looking for?</QuestionLabel>
          <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[14px] mb-6">
            be honest. nobody is judging.
          </p>

          <form onSubmit={handleSubmit}>
            {/* Primary input — hashtag pills appear here from chip taps or typing. */}
            <div className="mb-8">
              <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.22em] text-[#8B7355] mb-2.5 uppercase">
                in your words · press enter to add
              </p>
              <HashtagInput
                value={value}
                onChange={setValue}
                placeholder="people who..."
                autoFocus
                flashKey={flashChip}
              />
            </div>

            {/* Trait chip suggestions — same rounded → square pattern as
                interests / event-yes / event-no. */}
            <div className="mb-10">
              <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.22em] text-[#8B7355] mb-3 uppercase">
                or pick from these
              </p>
              <div className="flex flex-wrap gap-2">
                {TRAIT_CHIPS.map((chip) => {
                  const active = isChipInValue(chip);
                  const isFlashing = flashChip === chip;
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => toggleChip(chip)}
                      className="px-3.5 py-1.5 border font-[family-name:var(--font-things)] text-[13px]"
                      style={{
                        borderColor: active ? "#7C1C0B" : "rgba(42,24,16,0.18)",
                        background: isFlashing ? "rgba(124,28,11,0.22)" : active ? "rgba(124,28,11,0.08)" : "transparent",
                        color: active ? "#7C1C0B" : "#2A1810",
                        borderRadius: active ? "4px" : "20px",
                        transform: isFlashing ? "scale(0.94)" : active ? "scale(1.03)" : "scale(1)",
                        transition: "transform 180ms cubic-bezier(0.34,1.56,0.64,1), background 220ms ease, border-color 220ms ease, color 220ms ease, border-radius 220ms ease",
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
              see my profile
              <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="transition-transform group-hover:translate-x-1">
                <path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>
          </form>
        </div>
      </main>

      <button
        onClick={() => { window.frinqTrack?.("back", { page: "/last-question" }); router.back(); }}
        className="fixed bottom-8 left-8 flex items-center gap-2 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors z-50"
      >
        <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
          <path d="M19 4H1M1 4L4.5 1M1 4L4.5 7" stroke="currentColor" strokeWidth="1" />
        </svg>
        back
      </button>
    </div>
  );
}
