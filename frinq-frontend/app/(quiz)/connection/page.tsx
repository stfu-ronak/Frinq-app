"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Header from "@/app/components/Header";
import QuestionLabel from "@/app/components/QuestionLabel";
import { setQuizState } from "@/app/lib/storage";

const CARDS = [
  {
    key: "curious",
    title: "they're curious",
    body: "they ask more questions than they answer.",
    imgSrc: "/photos/connection-1.png",
  },
  {
    key: "thinks-differently",
    title: "they think differently",
    body: "they see things you wouldn't have noticed.",
    imgSrc: "/photos/connection-4.png",
  },
  {
    key: "weird-interests",
    title: "they have weird interests",
    body: "niche obsessions, unusual hobbies, specific knowledge.",
    imgSrc: "/photos/connection-3.png",
  },
  {
    key: "great-storyteller",
    title: "they tell stories well",
    body: "even a coffee run sounds like a small adventure.",
    imgSrc: "/photos/connection-2.png",
  },
];

export default function ConnectionPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [customValue, setCustomValue] = useState("");
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  const router = useRouter();

  function advance(value: string) {
    setQuizState("frinq_connection", value);
    setTimeout(() => {
      if (document.startViewTransition) {
        document.startViewTransition(() => router.push("/red-flags"));
      } else {
        router.push("/red-flags");
      }
    }, 320);
  }

  function pickCard(key: string) {
    if (selected) return;
    const card = CARDS.find((c) => c.key === key);
    window.frinqTrack?.("select_card", { page: "/connection", choice: card?.title || key });
    setSelected(key);
    setCustomValue("");
    advance(card?.title || key);
  }

  function submitCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!customValue.trim() || selected) return;
    window.frinqTrack?.("submit", { page: "/connection", choice: customValue.trim(), kind: "custom" });
    setSelected("custom");
    advance(customValue.trim());
  }

  return (
    <div className="min-h-dvh bg-[#F5F0E8] flex flex-col">
      <Header section="s2 · what would you do" backHref="/story" />

      <main className="flex-1 px-6 pt-20 pb-32 md:px-[min(10vw,140px)]">
        <div className="animate-fade-up">
          <QuestionLabel>what makes a random stranger interesting to you?</QuestionLabel>

          {/* Mobile grid */}
          <div className="grid grid-cols-2 gap-2.5 w-full md:hidden mb-6">
            {CARDS.map((card) => {
              const isSelected = selected === card.key;
              return (
                <button
                  key={card.key}
                  onClick={() => pickCard(card.key)}
                  className="frinq-card text-left flex flex-col overflow-hidden w-full"
                  style={{
                    transform: isSelected ? "scale(1.03)" : "scale(1)",
                    opacity: selected !== null && !isSelected ? 0.4 : 1,
                    borderColor: isSelected ? "#7C1C0B" : "rgba(42,24,16,0.12)",
                    background: isSelected ? "rgba(124,28,11,0.04)" : "#F5F0E8",
                    transition: "transform 240ms cubic-bezier(0.34,1.56,0.64,1), opacity 240ms ease, border-color 240ms ease, background 240ms ease",
                  }}
                >
                  <div className="relative w-full flex-shrink-0 flex items-center justify-center" style={{ aspectRatio: "1/1", background: "#F5F0E8" }}>
                    {card.imgSrc && !imgErrors[card.key] && (
                      <Image
                        src={card.imgSrc}
                        alt={card.title}
                        fill
                        className="object-contain"
                        sizes="50vw"
                        onError={() => setImgErrors((p) => ({ ...p, [card.key]: true }))}
                        style={{ mixBlendMode: "darken" }}
                      />
                    )}
                  </div>
                  <div className="px-2.5 pt-2 pb-2.5 flex flex-col gap-1 flex-shrink-0">
                    <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase"
                       style={{ color: isSelected ? "#2A1810" : "#8B7355" }}>
                      {card.title}
                    </p>
                    <div className="w-full h-px bg-[rgba(42,24,16,0.12)] my-1" />
                    <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px] leading-snug">{card.body}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Desktop grid */}
          <div className="hidden md:grid grid-cols-2 gap-4 max-w-2xl mb-8">
            {CARDS.map((card) => {
              const isSelected = selected === card.key;
              return (
                <button key={card.key} onClick={() => pickCard(card.key)}
                  className="frinq-card text-left p-5 flex flex-col gap-3"
                  style={{
                    transform: isSelected ? "scale(1.03)" : "scale(1)",
                    opacity: selected !== null && !isSelected ? 0.4 : 1,
                    borderColor: isSelected ? "#7C1C0B" : "rgba(42,24,16,0.12)",
                    background: isSelected ? "rgba(124,28,11,0.04)" : "#F5F0E8",
                    transition: "transform 240ms cubic-bezier(0.34,1.56,0.64,1), opacity 240ms ease, border-color 240ms ease, background 240ms ease",
                  }}
                >
                  <div className="relative w-full aspect-[2/1]" style={{ background: "#F5F0E8" }}>
                    {card.imgSrc && !imgErrors[card.key] && (
                      <Image src={card.imgSrc} alt={card.title} fill className="object-contain" sizes="280px"
                        onError={() => setImgErrors((p) => ({ ...p, [card.key]: true }))}
                        style={{ mixBlendMode: "darken" }} />
                    )}
                  </div>
                  <div className="w-full h-px bg-[rgba(42,24,16,0.12)]" />
                  <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[18px]">{card.title}</p>
                  <p className="font-[family-name:var(--font-motive)] text-[#2A1810] text-[12px] font-light">{card.body}</p>
                </button>
              );
            })}
          </div>

          {/* Always-visible custom text input — 5th equal option */}
          <div className="max-w-2xl">
            <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.22em] text-[#8B7355] mb-2 uppercase">
              or describe what catches your attention
            </p>
            <form onSubmit={submitCustom} className="flex items-center gap-3">
              <input
                className="flex-1 bg-transparent border-b border-[rgba(42,24,16,0.25)] focus:border-[#7C1C0B] outline-none font-[family-name:var(--font-things)] text-[#2A1810] text-[16px] py-2 placeholder:text-[rgba(42,24,16,0.3)] transition-colors"
                placeholder="something else entirely..."
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                disabled={selected !== null && selected !== "custom"}
              />
              <button
                type="submit"
                disabled={!customValue.trim() || (selected !== null && selected !== "custom")}
                className="inline-flex items-center gap-2 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors disabled:opacity-25"
              >
                next
                <svg width="20" height="8" viewBox="0 0 20 8" fill="none"><path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" /></svg>
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
