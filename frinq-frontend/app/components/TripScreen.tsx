"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { setQuizState } from "@/app/lib/storage";

const options = [
  { letter: "a", value: "upset",    text: "genuinely upset" },
  { letter: "b", value: "annoyed",  text: "annoyed" },
  { letter: "c", value: "relieved", text: "secretly relieved" },
  { letter: "d", value: "backup",   text: "had a backup" },
];

export default function TripScreen() {
  const [selected, setSelected] = useState<number | null>(null);
  const router = useRouter();

  function pick(i: number) {
    setSelected(i);
    setQuizState("frinq_trip", options[i].value);
    window.frinqTrack?.("select_option", { page: "/trip", choice: options[i].value });
    setTimeout(() => {
      if (document.startViewTransition) {
        document.startViewTransition(() => { router.push("/travel-style"); });
      } else {
        router.push("/travel-style");
      }
    }, 320);
  }

  return (
    <main className="flex-1 px-8 pt-28 pb-24 md:px-[min(12vw,180px)] relative">
      <div className="animate-fade-up max-w-2xl">
        <p
          className="font-[family-name:var(--font-motive)] text-[#2A1810] leading-[1.5] mb-10"
          style={{ fontSize: "clamp(16px, 2.5vw, 20px)" }}
        >
          a weekend trip you waited all week for got cancelled last minute. what&apos;s your first reaction?
        </p>

        <div>
          {options.map((opt, i) => (
            <div
              key={i}
              onClick={() => pick(i)}
              className={`flex items-center gap-4 py-4 border-b border-[rgba(42,24,16,0.12)] cursor-pointer transition-colors select-none
                ${i === 0 ? "border-t border-[rgba(42,24,16,0.12)]" : ""}
                ${selected === i ? "text-[#7C1C0B]" : "text-[#2A1810] hover:text-[#7C1C0B]"}`}
            >
              <span className="font-[family-name:var(--font-motive)] text-[11px] text-[#8B7355] w-3 flex-shrink-0">
                {opt.letter}
              </span>
              <span className="font-[family-name:var(--font-motive)] text-[15px] md:text-[16px] font-light">
                {opt.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-0 right-0 w-32 md:w-52 pointer-events-none select-none">
        <Image
          src="/illustrations/trip-duck.png"
          alt=""
          width={360}
          height={440}
          className="w-full h-auto object-contain object-bottom"
        />
      </div>
    </main>
  );
}
