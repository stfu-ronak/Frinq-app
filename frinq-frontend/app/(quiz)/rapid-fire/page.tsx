"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import { setQuizState } from "@/app/lib/storage";

const TIMER = 10;

const questions = [
  { a: "confront immediately", b: "take time to process" },
  { a: "deep 2 am talks", b: "random bakchodi" },
  { a: "home early", b: "home late" },
  { a: "mountain person", b: "beach person" },
  { a: "i make the plans", b: "i join the plans" },
  { a: "need regular catch-ups", b: "pick up where we left off" },
  { a: "new cultures", b: "deeper into my own" },
  { a: "hiking with strangers", b: "poker with strangers" },
  { a: "i'm always the host", b: "i'm never the host" },
  { a: "call everyday", b: "call once a week" },
];

export default function RapidFirePage() {
  const [current, setCurrent] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER);
  const [autoPicked, setAutoPicked] = useState(false);
  const [chosen, setChosen] = useState<"a" | "b" | null>(null);
  const answersRef = useRef<string[]>([]);
  const pickedRef = useRef(false);
  const currentRef = useRef(0);
  const router = useRouter();

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  function pick(choice: "a" | "b", auto = false) {
    if (pickedRef.current) return;
    pickedRef.current = true;
    setChosen(choice);
    if (auto) setAutoPicked(true);
    const cur = currentRef.current;
    const val = questions[cur][choice];
    if (!auto) window.frinqTrack?.("select_option", { page: "/rapid-fire", choice: val, q: cur, auto: false });
    answersRef.current = [...answersRef.current, val];
    const dwell = auto ? 700 : 450;
    if (cur + 1 >= questions.length) {
      setQuizState("frinq_rapid", JSON.stringify(answersRef.current));
      setTimeout(() => {
        if (document.startViewTransition) {
          document.startViewTransition(() => { router.push("/glorious"); });
        } else {
          router.push("/glorious");
        }
      }, auto ? 800 : 500);
    } else {
      setTimeout(() => {
        setAutoPicked(false);
        setChosen(null);
        pickedRef.current = false;
        setTimeLeft(TIMER);
        setCurrent(cur + 1);
      }, dwell);
    }
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(interval);
          pick(Math.random() > 0.5 ? "a" : "b", true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const q = questions[current];
  const pct = (timeLeft / TIMER) * 100;

  return (
    <div className="h-dvh overflow-hidden bg-[#7C1C0B] flex flex-col">
      <Header variant="dark" section={`choose one · ${current + 1}/${questions.length}`} />

      <main className="flex-1 flex flex-col min-h-0 relative">
        <button
          onClick={() => pick("a")}
          disabled={chosen !== null}
          className="flex-1 flex items-center justify-center px-8 relative"
          style={{
            background: chosen === "a" ? "rgba(245,240,232,0.18)" : "transparent",
            opacity: chosen === null ? 1 : chosen === "a" ? 1 : 0.25,
            transition: "background 220ms ease, opacity 220ms ease",
          }}
        >
          <span
            className="leading-tight text-center"
            style={{
              fontFamily: "var(--font-things), Georgia, serif",
              fontWeight: 400,
              fontSize: "clamp(24px, 5.5vw, 48px)",
              color: chosen === "a" ? "#F5F0E8" : "white",
              transform: chosen === "a" ? "scale(1.05)" : "scale(1)",
              transition: "transform 260ms cubic-bezier(0.34,1.56,0.64,1), color 200ms ease",
            }}
          >
            {q.a}
          </span>
          {chosen === "a" && (
            <span
              className="absolute"
              style={{
                top: 18, right: 18,
                width: 8, height: 8, borderRadius: "50%",
                background: "#F5F0E8",
                animation: "fq-pick-pulse 480ms ease-out forwards",
              }}
            />
          )}
        </button>

        <div className="flex-shrink-0 relative h-10 flex items-center overflow-hidden">
          <div
            className="absolute left-0 top-0 bottom-0 bg-white/15"
            style={{ width: `${pct}%`, transition: timeLeft === TIMER ? "none" : "width 1s linear" }}
          />
          <div className="relative w-full flex items-center justify-center gap-2">
            <span
              className="text-white tabular-nums"
              style={{ fontFamily: "var(--font-things), Georgia, serif", fontSize: "clamp(18px, 3vw, 24px)" }}
            >
              {timeLeft}
            </span>
          </div>
        </div>

        <button
          onClick={() => pick("b")}
          disabled={chosen !== null}
          className="flex-1 flex items-center justify-center px-8 relative"
          style={{
            background: chosen === "b" ? "rgba(245,240,232,0.18)" : "transparent",
            opacity: chosen === null ? 1 : chosen === "b" ? 1 : 0.25,
            transition: "background 220ms ease, opacity 220ms ease",
          }}
        >
          <span
            className="leading-tight text-center"
            style={{
              fontFamily: "var(--font-things), Georgia, serif",
              fontWeight: 400,
              fontSize: "clamp(24px, 5.5vw, 48px)",
              color: chosen === "b" ? "#F5F0E8" : "white",
              transform: chosen === "b" ? "scale(1.05)" : "scale(1)",
              transition: "transform 260ms cubic-bezier(0.34,1.56,0.64,1), color 200ms ease",
            }}
          >
            {q.b}
          </span>
          {chosen === "b" && (
            <span
              className="absolute"
              style={{
                top: 18, right: 18,
                width: 8, height: 8, borderRadius: "50%",
                background: "#F5F0E8",
                animation: "fq-pick-pulse 480ms ease-out forwards",
              }}
            />
          )}
        </button>

        {/* Auto-picked toast */}
        {autoPicked && (
          <div
            className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none"
            style={{ animation: "fqAutoPick 700ms ease both" }}
          >
            <div className="bg-white/10 backdrop-blur-sm px-5 py-3 rounded-full">
              <p className="font-[family-name:var(--font-motive)] text-white/80 text-[11px] tracking-[0.18em]">
                time&apos;s up, auto-picked
              </p>
            </div>
          </div>
        )}
      </main>

      <button
        onClick={() => {
          window.frinqTrack?.("back", { page: "/rapid-fire" });
          if (current === 0) router.back();
          else { pickedRef.current = false; setTimeLeft(TIMER); setCurrent(c => c - 1); }
        }}
        className="fixed bottom-6 left-7 flex items-center gap-2 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-white/50 hover:text-white transition-colors z-50"
      >
        <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
          <path d="M19 4H1M1 4L4.5 1M1 4L4.5 7" stroke="currentColor" strokeWidth="1" />
        </svg>
        back
      </button>

      <style>{`
        @keyframes fqAutoPick {
          0% { opacity: 0; transform: translateY(-40%) scale(0.9); }
          20% { opacity: 1; transform: translateY(-50%) scale(1); }
          80% { opacity: 1; transform: translateY(-50%) scale(1); }
          100% { opacity: 0; transform: translateY(-60%) scale(0.95); }
        }
        @keyframes fq-pick-pulse {
          from { transform: scale(0.4); opacity: 0; }
          to   { transform: scale(2.4); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
