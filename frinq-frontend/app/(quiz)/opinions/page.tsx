"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setQuizState } from "@/app/lib/storage";

const questions = [
  {
    prompt: "on ai taking over:",
    a: "it will replace everything we know.",
    b: "humans can't truly be replaced.",
  },
  {
    prompt: "when it comes to truth:",
    a: "hard truth, always. no sugarcoating.",
    b: "empathy matters more than brutal honesty.",
  },
  {
    prompt: "you respect people who:",
    a: "have a five year plan and stick to it.",
    b: "live fully in the moment.",
  },
  {
    prompt: "on how people show up:",
    a: "word is bond.",
    b: "action > words.",
  },
];

// Derives the highlighted choice for a question index from stored answers.
// Called directly at every site that changes `current` (see below) instead
// of via an effect, so the newly-arrived question renders already-correct
// in a single batched update — no stale-highlight frame to guard against.
function pickedForIndex(index: number, ans: string[]): "a" | "b" | null {
  const prior = ans[index];
  if (prior === questions[index].a) return "a";
  if (prior === questions[index].b) return "b";
  return null;
}

export default function OpinionsPage() {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [picked, setPicked] = useState<"a" | "b" | null>(null);
  // Separate "advancing" lock: blocks duplicate picks during the brief
  // animation window before transitioning to the next question, but does
  // NOT block re-clicking a different option after going back.
  const [advancing, setAdvancing] = useState(false);
  const router = useRouter();

  function pick(choice: "a" | "b") {
    // BLOCK only during the active advancing animation. Allow re-clicking
    // a different option freely (including when revisiting via back).
    if (advancing) return;
    setAdvancing(true);
    setPicked(choice);
    const val = questions[current][choice];
    window.frinqTrack?.("select_option", { page: "/opinions", choice: val, question: questions[current].prompt });
    // Replace at the current index (not append) so going back and changing
    // doesn't grow the array with duplicates.
    const next = [...answers];
    next[current] = val;
    setAnswers(next);

    setTimeout(() => {
      if (current + 1 >= questions.length) {
        setQuizState("frinq_opinions", JSON.stringify(next));
        if (document.startViewTransition) {
          document.startViewTransition(() => { router.push("/opinions-why"); });
        } else {
          router.push("/opinions-why");
        }
      } else {
        // Compute and apply the next question's highlight in the same
        // batch as the index change, so it renders correct on the very
        // first frame — no intermediate "prior question's choice still
        // highlighted" flash to guard against.
        const nextIndex = current + 1;
        setAdvancing(false);
        setCurrent(nextIndex);
        setPicked(pickedForIndex(nextIndex, next));
      }
    }, 350);
  }

  const q = questions[current];

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <header className="flex items-center px-8 py-5 flex-shrink-0">
        <Image src="/fq-logo.png" alt="frinq" width={38} height={38} className="w-[38px] h-[38px]" />
      </header>

      <main className="flex-1 px-8 pt-28 pb-24 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl">
          <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.2em] text-[#8B7355] mb-3">
            pick your side
          </p>
          <p
            className="font-[family-name:var(--font-things)] text-[#2A1810] mb-8"
            style={{ fontSize: "clamp(16px, 3vw, 22px)" }}
          >
            {q.prompt}
          </p>

          <div className="flex flex-col gap-3">
            {(["a", "b"] as const).map((choice) => (
              <button
                key={choice}
                onClick={() => pick(choice)}
                disabled={advancing}
                className={`
                  text-left px-5 py-4 border transition-all duration-200
                  font-[family-name:var(--font-things)] text-[#2A1810] leading-snug
                  ${picked === choice
                    ? "border-[#7C1C0B] bg-[rgba(124,28,11,0.06)] scale-[1.02]"
                    : picked && picked !== choice
                    ? "border-[rgba(42,24,16,0.08)] opacity-30"
                    : "border-[rgba(42,24,16,0.15)] active:scale-[0.99]"
                  }
                `}
                style={{ fontSize: "clamp(15px, 2.5vw, 18px)" }}
              >
                <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] text-[#8B7355] mr-3">{choice}.</span>
                {q[choice]}
              </button>
            ))}
          </div>

          {/* Progress dots */}
          <div className="flex gap-2 mt-10">
            {questions.map((_, i) => (
              <div
                key={i}
                style={{
                  height: 4,
                  borderRadius: 999,
                  width: i === current ? 24 : 8,
                  background: i <= current ? "#7C1C0B" : "rgba(42,24,16,0.15)",
                  transition: "width 320ms cubic-bezier(0.34,1.56,0.64,1), background 240ms ease",
                }}
              />
            ))}
          </div>
        </div>
      </main>

      <button
        onClick={() => {
          window.frinqTrack?.("back", { page: "/opinions" });
          if (current === 0) {
            router.back();
          } else {
            const prevIndex = current - 1;
            setAdvancing(false);
            setCurrent(prevIndex);
            setPicked(pickedForIndex(prevIndex, answers));
          }
        }}
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
