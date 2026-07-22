"use client";

import Image from "next/image";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { setQuizState } from "@/app/lib/storage";

// User confirmed 4 sliders (introversion-style "people vs alone" dropped —
// already covered by /social-type). Order: cognition → decision → growth →
// values. Maps loosely to MBTI sensing/intuition, feeling/thinking, and
// the kind-vs-honest axis (HEXACO H/agreeableness blend).
const sliders = [
  {
    prompt: "you trust more",
    left: "what you can see",
    right: "what you sense",
    leftHint: "see",
    rightHint: "sense",
  },
  {
    prompt: "you decide things more with",
    left: "your heart",
    right: "your head",
    leftHint: "heart",
    rightHint: "head",
  },
  {
    prompt: "you grow more from",
    left: "going deeper",
    right: "going wider",
    leftHint: "deeper",
    rightHint: "wider",
  },
  {
    prompt: "if you had to pick, you'd rather be",
    left: "kind",
    right: "honest",
    leftHint: "kind",
    rightHint: "honest",
  },
];

const STOPS = [0, 25, 50, 75, 100];
const SNAP_LABELS = ["strongly left", "left", "middle", "right", "strongly right"];

function snap(val: number): number {
  return STOPS.reduce((prev, curr) =>
    Math.abs(curr - val) < Math.abs(prev - val) ? curr : prev
  );
}

function trackGradient(val: number, snapIdx: number): string {
  const pct = val;
  let leftAlpha = 0.2;
  let rightAlpha = 0.2;
  if (snapIdx < 2) {
    leftAlpha = 0.2 + ((2 - snapIdx) / 2) * 0.5;
    rightAlpha = 0.08;
  } else if (snapIdx > 2) {
    rightAlpha = 0.2 + ((snapIdx - 2) / 2) * 0.5;
    leftAlpha = 0.08;
  }
  return `linear-gradient(to right, rgba(42,24,16,${leftAlpha}) 0%, rgba(42,24,16,${leftAlpha}) ${pct}%, rgba(42,24,16,${rightAlpha}) ${pct}%, rgba(42,24,16,${rightAlpha}) 100%)`;
}

export default function PreferencesPage() {
  const [current, setCurrent] = useState(0);
  // One slot per slider — keep in sync with `sliders` array length.
  const [values, setValues] = useState(() => sliders.map(() => 50));
  const [isDragging, setIsDragging] = useState(false);
  const [snapping, setSnapping] = useState(false);
  const router = useRouter();

  const s = sliders[current];
  const snappedVal = snap(values[current]);
  const selectedStop = STOPS.indexOf(snappedVal);
  const thumbSize = isDragging ? 31 : snapping ? 28 : 24;

  function advance() {
    window.frinqTrack?.("click", { page: "/preferences", element: "next_slider", slider: current, value: snappedVal });
    if (current + 1 >= sliders.length) {
      setQuizState("frinq_preferences", JSON.stringify(values));
      if (document.startViewTransition) {
        document.startViewTransition(() => { router.push("/last-question"); });
      } else {
        router.push("/last-question");
      }
    } else {
      setCurrent((c) => c + 1);
    }
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const next = [...values];
    next[current] = Number(e.target.value);
    setValues(next);
  }, [values, current]);

  const handleRelease = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    const snapped = [...values];
    snapped[current] = snap(values[current]);
    setValues(snapped);
    setSnapping(true);
    setTimeout(() => setSnapping(false), 300);
  }, [isDragging, values, current]);

  const labelLeft = `calc(${values[current]}% * 0.88 + 6%)`;

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <header className="flex items-center justify-between px-8 py-5 flex-shrink-0">
        <Image src="/fq-logo.png" alt="frinq" width={38} height={38} className="w-[38px] h-[38px]" />
        <div className="flex items-center gap-2">
          {sliders.map((_, i) => (
            <span
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === current ? 18 : 6,
                height: 6,
                background: i < current ? "#7C1C0B" : i === current ? "#2A1810" : "rgba(42,24,16,0.18)",
              }}
            />
          ))}
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center px-8 pb-16 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl w-full" key={current}>
          <h1
            className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.15] mb-3"
            style={{ fontSize: "clamp(20px, 4vw, 30px)" }}
          >
            {s.prompt}
          </h1>
          <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.2em] text-[#8B7355] mb-10">
            drag to where you land
          </p>

          {/* End-hint labels above slider */}
          <div className="flex justify-between mb-4 px-0.5">
            <span
              className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.28em] uppercase transition-all duration-200"
              style={{
                color: selectedStop < 2 ? "#7C1C0B" : "rgba(139,115,85,0.55)",
                transform: selectedStop < 2 ? "scale(1.08)" : "scale(1)",
              }}
            >
              {s.leftHint}
            </span>
            <span
              className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.28em] uppercase transition-all duration-200"
              style={{
                color: selectedStop > 2 ? "#7C1C0B" : "rgba(139,115,85,0.55)",
                transform: selectedStop > 2 ? "scale(1.08)" : "scale(1)",
              }}
            >
              {s.rightHint}
            </span>
          </div>

          {/* 5-stop dot indicators */}
          <div className="flex justify-between mb-3 px-0.5 relative">
            {STOPS.map((stop, i) => (
              <div key={stop} className="relative">
                <div
                  className="rounded-full"
                  style={{
                    width: i === selectedStop ? 10 : 8,
                    height: i === selectedStop ? 10 : 8,
                    background: i === selectedStop
                      ? snapping
                        ? "#2A1810"
                        : "#7C1C0B"
                      : "rgba(42,24,16,0.2)",
                    transform: i === selectedStop && snapping ? "scale(1.4)" : "scale(1)",
                    transition: "background 200ms ease, transform 200ms cubic-bezier(0.34,1.56,0.64,1)",
                  }}
                />
                {i === selectedStop && snapping && (
                  <div
                    className="absolute top-1/2 left-1/2 rounded-full pointer-events-none"
                    style={{
                      width: 10,
                      height: 10,
                      transform: "translate(-50%, -50%)",
                      border: "1.5px solid #7C1C0B",
                      animation: "fq-snap-ring 400ms ease-out forwards",
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Slider track + thumb */}
          <div className="relative mb-2">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={values[current]}
              onMouseDown={() => setIsDragging(true)}
              onTouchStart={() => setIsDragging(true)}
              onChange={handleChange}
              onMouseUp={handleRelease}
              onTouchEnd={handleRelease}
              className="fq-slider w-full cursor-pointer"
              style={{ background: trackGradient(values[current], selectedStop) }}
            />
            {/* Snap label below thumb */}
            <div
              className="pointer-events-none absolute"
              style={{ left: labelLeft, top: "14px", transform: "translateX(-50%)" }}
            >
              <span
                className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] whitespace-nowrap"
                style={{
                  color: "rgba(42,24,16,0.45)",
                  opacity: isDragging || snapping ? 1 : 0.6,
                  transition: "opacity 200ms ease",
                }}
              >
                {SNAP_LABELS[selectedStop]}
              </span>
            </div>
          </div>

          {/* Spacer for label */}
          <div className="h-5" />

          {/* Left / right labels — full opacity always (was 0.35 when not
              selected, was too faint to read on phones). The active side
              gets the brand red as additional emphasis. */}
          <div className="flex justify-between gap-4 mt-5">
            <span
              className="font-[family-name:var(--font-things)] text-[16px] leading-snug max-w-[44%] transition-colors duration-200"
              style={{ color: selectedStop < 2 ? "#7C1C0B" : "#2A1810" }}
            >
              {s.left}
            </span>
            <span
              className="font-[family-name:var(--font-things)] text-[16px] leading-snug max-w-[44%] text-right transition-colors duration-200"
              style={{ color: selectedStop > 2 ? "#7C1C0B" : "#2A1810" }}
            >
              {s.right}
            </span>
          </div>

          <button
            onClick={advance}
            className="mt-10 inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors group"
          >
            {current + 1 < sliders.length ? "next" : "done"}
            <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="transition-transform group-hover:translate-x-1">
              <path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      </main>

      <button
        onClick={() => {
          window.frinqTrack?.("back", { page: "/preferences" });
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

      <style>{`
        @keyframes fq-snap-ring {
          from { width: 10px; height: 10px; opacity: 0.9; }
          to   { width: 28px; height: 28px; opacity: 0; }
        }
        .fq-slider {
          height: 1px;
          appearance: none;
          outline: none;
          border: none;
          display: block;
        }
        .fq-slider::-webkit-slider-thumb {
          appearance: none;
          width: ${thumbSize}px;
          height: ${thumbSize}px;
          border-radius: 50%;
          background: #7C1C0B;
          box-shadow: 0 1px 4px rgba(124,28,11,0.25);
          cursor: grab;
          transition: width 150ms ease, height 150ms ease;
        }
        .fq-slider::-webkit-slider-thumb:active { cursor: grabbing; }
        .fq-slider::-moz-range-thumb {
          width: ${thumbSize}px;
          height: ${thumbSize}px;
          border-radius: 50%;
          background: #7C1C0B;
          border: none;
          box-shadow: 0 1px 4px rgba(124,28,11,0.25);
          cursor: grab;
          transition: width 150ms ease, height 150ms ease;
        }
      `}</style>
    </div>
  );
}
