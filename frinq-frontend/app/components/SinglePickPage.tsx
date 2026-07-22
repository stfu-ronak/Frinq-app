"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import { getQuizState, setQuizState } from "@/app/lib/storage";

interface Option {
  value: string;
  label: string;
}

interface Props {
  question: string;
  storageKey: string;
  options: Option[];
  nextHref: string;
  backHref: string;
  trackPage: string;
}

/**
 * Single-pick option list page. Layout copied EXACTLY from the existing
 * TripScreen pattern so the 6 new event-org pages match the rest of
 * the quiz (font, weight, prefix letter, divider lines, hover behavior).
 */
export default function SinglePickPage({
  question, storageKey, options, nextHref, backHref, trackPage,
}: Props) {
  const [selected, setSelected] = useState<string | null>(() => getQuizState(storageKey));
  const [advancing, setAdvancing] = useState(false);
  const router = useRouter();

  function pick(value: string) {
    if (advancing) return;
    setAdvancing(true);
    setSelected(value);
    setQuizState(storageKey, value);
    window.frinqTrack?.("select_option", { page: trackPage, choice: value });
    setTimeout(() => {
      if (document.startViewTransition) {
        document.startViewTransition(() => router.push(nextHref));
      } else {
        router.push(nextHref);
      }
    }, 280);
  }

  return (
    <div className="min-h-dvh bg-[#F5F0E8] flex flex-col relative">
      <Header backHref={backHref} />
      {/* TOP-ANCHORED layout — matches hobbies/show-up/red-flags/etc so all
          question pages render at the same vertical position. The previous
          vertically-centered layout made the question text bounce up and
          down between consecutive option pages. */}
      <main className="flex-1 px-8 pt-28 pb-24 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl">
          <p
            className="font-[family-name:var(--font-motive)] text-[#2A1810] leading-[1.5] mb-10"
            style={{ fontSize: "clamp(16px, 2.5vw, 20px)" }}
          >
            {question}
          </p>
          <div>
            {options.map((opt, i) => {
              const isSelected = selected === opt.value;
              return (
                <div
                  key={opt.value}
                  onClick={() => pick(opt.value)}
                  className={`flex items-center gap-4 py-4 border-b border-[rgba(42,24,16,0.12)] cursor-pointer transition-colors select-none
                    ${i === 0 ? "border-t border-[rgba(42,24,16,0.12)]" : ""}
                    ${isSelected ? "text-[#7C1C0B]" : "text-[#2A1810]"}`}
                >
                  <span className="font-[family-name:var(--font-motive)] text-[11px] text-[#8B7355] w-3 flex-shrink-0">
                    {String.fromCharCode(97 + i)}
                  </span>
                  <span className="font-[family-name:var(--font-motive)] text-[15px] md:text-[16px] font-light">
                    {opt.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
