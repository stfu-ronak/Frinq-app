"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import QuestionLabel from "@/app/components/QuestionLabel";
import HashtagInput from "@/app/components/HashtagInput";
import { getQuizState, setQuizState } from "@/app/lib/storage";

function initialTagsValue(key: string): string {
  const raw = getQuizState(key);
  if (!raw) return "";
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.join(", ") : raw;
  } catch {
    return raw;
  }
}

const CATEGORIES = [
  {
    label: "arts & creativity",
    chips: ["photography", "painting / drawing", "writing", "music", "film & cinema", "fashion & style", "dancing"],
  },
  {
    label: "food & lifestyle",
    chips: ["cooking", "baking", "trying new restaurants", "coffee culture", "wine & spirits", "cocktail making"],
  },
  {
    label: "active & outdoors",
    chips: ["hiking", "gym / fitness", "yoga", "running", "swimming", "cycling", "rock climbing", "football / sports"],
  },
  {
    label: "mind & culture",
    chips: ["reading", "podcasts", "philosophy", "history", "current affairs", "spirituality", "psychology"],
  },
  {
    label: "social & travel",
    chips: ["travelling", "live music / concerts", "festivals", "board games / game nights", "volunteering", "nightlife"],
  },
  {
    label: "tech & building",
    chips: ["tech & startups", "gaming", "diy & crafts", "investing", "gardening", "coding"],
  },
];

/**
 * Hashtag-style multi-pick across category groups. Tapping a chip in any
 * group adds it as a removable tag in the HashtagInput above. Users can
 * also type free text — both feed the same input. Same pattern as
 * /hobbies, /red-flags, /event-yes, /event-no.
 */
export default function InterestsPage() {
  const [value, setValue] = useState(() => initialTagsValue("frinq_interests"));
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
    window.frinqTrack?.("select", { page: "/interests", choice: chip, selected: !isOn });
    if (isOn) {
      setValue(tags.filter((t) => t.toLowerCase() !== chip.toLowerCase()).join(", "));
    } else {
      setValue([...tags, chip].join(", "));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const tags = getTags();
    if (tags.length === 0) return;
    setQuizState("frinq_interests", JSON.stringify(tags));
    if (document.startViewTransition) {
      document.startViewTransition(() => router.push("/sweet"));
    } else {
      router.push("/sweet");
    }
  }

  const tagsCount = getTags().length;

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <Header section="s1 · who you are" backHref="/hobbies" />

      <main className="flex-1 overflow-y-auto px-8 pt-20 pb-24 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl">
          <QuestionLabel>pick your interests</QuestionLabel>
          <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#8B7355] mb-6 tracking-[0.1em]">
            {tagsCount} selected
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
                placeholder="anything you're into..."
                autoFocus
                flashKey={flashChip}
              />
            </div>

            {/* Chip suggestions grouped by category — tapping any chip
                inserts it into the input above. */}
            <div className="flex flex-col gap-6 mb-8">
              {CATEGORIES.map((cat) => (
                <div key={cat.label}>
                  <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.22em] text-[#8B7355] mb-2.5 uppercase">
                    {cat.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {cat.chips.map((chip) => {
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
              ))}
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
