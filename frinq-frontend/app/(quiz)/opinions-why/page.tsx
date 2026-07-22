"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import VoiceRecorder from "@/app/components/VoiceRecorder";
import { getQuizState, setQuizState } from "@/app/lib/storage";

const QUESTION_WHYS = [
  {
    key: "ai",
    intro: (ans: string) => `you said: "${ans}"`,
    ask: "what makes you think so?",
    placeholder: "genuinely curious...",
  },
  {
    key: "truth",
    intro: (ans: string) => `you chose: "${ans}"`,
    ask: "any reason why?",
    placeholder: "a moment that shaped this?",
  },
  {
    key: "respect",
    intro: (ans: string) => `you said you respect people who: "${ans}"`,
    ask: "care to share why?",
    placeholder: "what does that say about you?",
  },
];

export default function OpinionsWhyPage() {
  const [opinions] = useState<string[]>(() => {
    try {
      const raw = getQuizState("frinq_opinions");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [answers, setAnswers] = useState<string[]>(["", "", ""]);
  const [current, setCurrent] = useState(0);
  // Track recorder state per question so "next" disables while the
  // current question's voice clip is still uploading.
  const [recorderState, setRecorderState] = useState<"idle" | "recording" | "uploading" | "done" | "failed">("idle");
  const router = useRouter();

  function handleNext(e: React.FormEvent) {
    e.preventDefault();
    if (current + 1 < QUESTION_WHYS.length) {
      setCurrent((c) => c + 1);
    } else {
      setQuizState("frinq_opinions_why", JSON.stringify(answers));
      if (document.startViewTransition) {
        document.startViewTransition(() => router.push("/preferences-intro"));
      } else {
        router.push("/preferences-intro");
      }
    }
  }

  const q = QUESTION_WHYS[current];
  const opinionText = opinions[current] || "...";

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <header className="flex items-center px-8 py-5 flex-shrink-0">
        <Image src="/fq-logo.png" alt="frinq" width={38} height={38} className="w-[38px] h-[38px]" />
      </header>

      <main className="flex-1 flex flex-col justify-center px-8 pb-20 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl" key={current}>
          {/* Their opinion echoed back */}
          <p
            className="font-[family-name:var(--font-things)] text-[#2A1810] leading-snug mb-3"
            style={{ fontSize: "clamp(16px, 3vw, 22px)" }}
          >
            {q.intro(opinionText)}
          </p>

          <h1
            className="font-[family-name:var(--font-motive)] text-[#8B7355] leading-[1.1] mb-10 font-light tracking-[0.06em]"
            style={{ fontSize: "clamp(14px, 2.5vw, 18px)" }}
          >
            {q.ask}
          </h1>

          <form onSubmit={handleNext}>
            <textarea
              className="w-full bg-transparent border-b border-[rgba(42,24,16,0.2)] focus:border-[#2A1810] focus:outline-none font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] placeholder:text-[rgba(42,24,16,0.2)] resize-none pb-2 transition-colors"
              rows={2}
              placeholder={q.placeholder}
              value={answers[current]}
              onChange={(e) => {
                const next = [...answers];
                next[current] = e.target.value;
                setAnswers(next);
              }}
            />

            {/* Voice option — alternative to typing. Placeholder
                "[voice response]" is only set AFTER successful upload
                (onComplete fires post-upload now), so we never end up
                with the placeholder text but no audio row. */}
            <div className="flex items-center gap-3 mt-5">
              <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.2em] text-[#8B7355]">or</span>
              <VoiceRecorder
                key={current}
                compact
                questionKey={`opinion_why_${current}`}
                onStateChange={(s) => setRecorderState(s)}
                onComplete={(secs) => {
                  if (secs > 0 && !answers[current].trim()) {
                    const next = [...answers];
                    next[current] = "[voice response]";
                    setAnswers(next);
                  }
                }}
              />
            </div>

            <div className="flex items-center gap-6 mt-8">
              <button
                type="submit"
                disabled={!answers[current].trim() || recorderState === "uploading" || recorderState === "recording"}
                className="inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors group disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {recorderState === "uploading" ? "saving…" : current + 1 < QUESTION_WHYS.length ? "next" : "done"}
                <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="transition-transform group-hover:translate-x-1">
                  <path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" />
                </svg>
              </button>
            </div>
          </form>

          {/* Progress */}
          <div className="flex gap-1.5 mt-10">
            {QUESTION_WHYS.map((_, i) => (
              <div key={i} style={{
                height: 3, borderRadius: 999,
                width: i <= current ? 20 : 8,
                background: i < current ? "#7C1C0B" : i === current ? "rgba(124,28,11,0.4)" : "rgba(42,24,16,0.1)",
                transition: "all 300ms ease",
              }} />
            ))}
          </div>
        </div>
      </main>

      <button
        onClick={() => {
          window.frinqTrack?.("back", { page: "/opinions-why" });
          if (current === 0) router.back();
          else setCurrent((c) => c - 1);
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
