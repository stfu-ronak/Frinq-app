"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import QuestionLabel from "@/app/components/QuestionLabel";
import HashtagInput from "@/app/components/HashtagInput";
import { getQuizState, setQuizState } from "@/app/lib/storage";

const HOBBY_CHIPS = [
  "vintage collecting", "urban exploring", "hot sauce making", "competitive crosswords",
  "foraging", "rewatching shows", "solving puzzles", "open mics", "zine-making",
  "dumpster diving for gems", "astrology deep dives", "learning accents",
  "thrifting", "film photography", "journaling", "meme archaeology",
  "niche wikipedia rabbit holes", "community radio", "amateur astronomy",
  "fermenting things", "bonsai", "escape rooms", "speedrunning games",
];

export default function HobbiesPage() {
  const [inputValue, setInputValue] = useState(() => getQuizState("frinq_hobbies") ?? "");
  const [flashChip, setFlashChip] = useState<string | null>(null);
  const router = useRouter();

  function getSelectedChips(): string[] {
    return inputValue.split(",").map(s => s.trim()).filter(Boolean);
  }

  function isChipSelected(chip: string): boolean {
    return getSelectedChips().includes(chip);
  }

  function toggleChip(chip: string) {
    const selected = getSelectedChips();
    setFlashChip(chip);
    setTimeout(() => setFlashChip(null), 320);
    window.frinqTrack?.("select", { page: "/hobbies", choice: chip, selected: !selected.includes(chip) });
    if (selected.includes(chip)) {
      setInputValue(selected.filter(c => c !== chip).join(", "));
    } else {
      setInputValue([...selected, chip].join(", "));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inputValue.trim()) return;
    setQuizState("frinq_hobbies", inputValue.trim());
    if (document.startViewTransition) {
      document.startViewTransition(() => router.push("/interests"));
    } else {
      router.push("/interests");
    }
  }

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <Header section="s1 · who you are" backHref="/saturday-night" />

      <main className="flex-1 overflow-y-auto px-8 pt-20 pb-24 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl">
          <QuestionLabel>any unique hobbies you&apos;re proud of?</QuestionLabel>

          <form onSubmit={handleSubmit}>
            {/* Primary input — top, prominent. Hashtag-style chips. */}
            <div className="mb-8">
              <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.22em] text-[#8B7355] mb-2.5 uppercase">
                type your unique hobbies · press enter to add
              </p>
              <HashtagInput
                value={inputValue}
                onChange={setInputValue}
                placeholder="vintage collecting, fermenting things..."
                autoFocus
                flashKey={flashChip}
              />
            </div>

            {/* Chip grid — secondary */}
            <div className="mb-8">
              <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.22em] text-[#8B7355] mb-3 uppercase">
                or pick from these
              </p>
              <div className="flex flex-wrap gap-2">
                {HOBBY_CHIPS.map((chip) => {
                  const active = isChipSelected(chip);
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
              disabled={!inputValue.trim()}
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
