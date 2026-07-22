"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

const LINES = [
  "reading your answers…",
  "noticing the patterns…",
  "connecting the dots…",
  "writing your read…",
];

export default function ConnectingPage() {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const totalLen = 340;
  const pathLen = (step / LINES.length) * totalLen;

  useEffect(() => {
    if (step >= LINES.length) {
      const t = setTimeout(() => {
        if (document.startViewTransition) {
          document.startViewTransition(() => router.push("/vibe-box"));
        } else {
          router.push("/vibe-box");
        }
      }, 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep((s) => s + 1), 1100);
    return () => clearTimeout(t);
  }, [step, router]);

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col items-center justify-center px-8 select-none">
      <div className="flex flex-col items-center gap-10 max-w-sm w-full">
        {/* Logo */}
        <Image src="/fq-logo.png" alt="frinq" width={32} height={32} className="opacity-60" />

        {/* SVG wave path */}
        <svg width="280" height="40" viewBox="0 0 280 40" fill="none" className="overflow-visible">
          {/* Ghost track */}
          <path
            d="M0 20 C30 5, 60 35, 90 20 S150 5, 180 20 S240 35, 280 20"
            stroke="rgba(42,24,16,0.1)"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          {/* Animated trace */}
          <path
            d="M0 20 C30 5, 60 35, 90 20 S150 5, 180 20 S240 35, 280 20"
            stroke="#7C1C0B"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={totalLen}
            strokeDashoffset={totalLen - pathLen}
            style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>

        {/* Lines */}
        <div className="flex flex-col gap-3 w-full">
          {LINES.map((line, i) => (
            <div
              key={i}
              className="flex items-center gap-3"
              style={{
                opacity: i < step ? 1 : i === step ? 0.3 : 0.1,
                transform: i < step ? "translateX(0)" : "translateX(-8px)",
                transition: "opacity 500ms ease, transform 500ms ease",
                transitionDelay: `${i * 60}ms`,
              }}
            >
              <span
                className="font-[family-name:var(--font-things)] text-[#7C1C0B] text-[11px] w-5 flex-shrink-0"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-[family-name:var(--font-things)] text-[#2A1810]" style={{ fontSize: "clamp(14px, 3vw, 18px)" }}>
                {line}
              </span>
              {i < step && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="ml-auto flex-shrink-0">
                  <path d="M2 6l2.5 2.5L10 3.5" stroke="#7C1C0B" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>

        <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.2em] text-[#8B7355]">
          frinq is thinking
        </p>
      </div>
    </div>
  );
}
