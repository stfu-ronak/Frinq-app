"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
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

const EVENT_OPTIONS = [
  "board game night",
  "live music gig",
  "food hopping",
  "trek / nature outing",
  "pottery / DIY workshop",
  "bookstore or museum visit",
  "sports / activity meetup",
  "house party",
  "open mic / comedy night",
  "random city exploration",
  "box cricket",
  "concert",
];

/**
 * Hashtag-style multi-pick — tapping a chip adds it as a tag in the
 * HashtagInput above. Same behavior as /hobbies + /red-flags. Mirrors
 * event-no exactly; the only difference between the two pages is the
 * question copy + the storage key.
 */
export default function EventYesPage() {
  const [value, setValue] = useState(() => initialTagsValue("frinq_event_yes"));
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
    window.frinqTrack?.("toggle", { page: "/event-yes", choice: chip, on: !isOn });
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
    setQuizState("frinq_event_yes", JSON.stringify(tags));
    window.frinqTrack?.("submit", { page: "/event-yes", count: tags.length });
    if (document.startViewTransition) {
      document.startViewTransition(() => router.push("/event-no"));
    } else {
      router.push("/event-no");
    }
  }

  return (
    <div className="min-h-dvh bg-[#F5F0E8] flex flex-col">
      <Header backHref="/connection-mode" />
      <main className="flex-1 px-8 pt-28 pb-24 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl">
          <p
            className="font-[family-name:var(--font-motive)] text-[#2A1810] leading-[1.5] mb-8"
            style={{ fontSize: "clamp(16px, 2.5vw, 20px)" }}
          >
            which of these would you most likely say yes to?
          </p>

          <form onSubmit={handleSubmit}>
            {/* Primary input — hashtag chips. Selected chips appear here. */}
            <div className="mb-8">
              <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.22em] text-[#8B7355] mb-2.5 uppercase">
                in your words · press enter to add
              </p>
              <HashtagInput
                value={value}
                onChange={setValue}
                placeholder="anything you'd say yes to..."
                autoFocus
                flashKey={flashChip}
              />
            </div>

            {/* Chip suggestions — clicking one adds it to the input above. */}
            <div className="mb-10">
              <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.22em] text-[#8B7355] mb-3 uppercase">
                or pick from these
              </p>
              <div className="flex flex-wrap gap-2">
                {EVENT_OPTIONS.map((opt) => {
                  const active = isChipInValue(opt);
                  const isFlashing = flashChip === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => toggleChip(opt)}
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
                      {opt}
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
