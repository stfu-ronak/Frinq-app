"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NavLink from "@/app/components/NavLink";
import Header from "@/app/components/Header";

export default function RapidIntroPage() {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [pressed, setPressed] = useState(false);
  const router = useRouter();

  function begin() {
    window.frinqTrack?.("click", { page: "/rapid-intro", element: "begin_rapid_fire" });
    setStarted(true);
    setCountdown(3);
  }

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      if (document.startViewTransition) {
        document.startViewTransition(() => router.push("/rapid-fire"));
      } else {
        router.push("/rapid-fire");
      }
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 900);
    return () => clearTimeout(t);
  }, [countdown, router]);

  // Background transitions smoothly cream → dark → red across the
  // 3-2-1 countdown. CSS transition is 900ms (matches the countdown step
  // duration) so each colour change crossfades rather than snaps.
  const bgColor = countdown === null
    ? "#F5F0E8"
    : countdown === 3
    ? "#3D1F12"
    : countdown === 2
    ? "#5A1208"
    : "#7C1C0B";

  const textColor = countdown === null ? "#2A1810" : "#F5F0E8";

  return (
    <div
      className="h-dvh overflow-hidden flex flex-col relative"
      style={{ background: bgColor, transition: "background 900ms cubic-bezier(0.4,0,0.2,1)", position: "relative" }}
    >
      {/* Full-stage tap target */}
      {!started && (
        <button
          onClick={begin}
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
          onPointerLeave={() => setPressed(false)}
          style={{ position: "absolute", inset: 0, background: "transparent", border: "none", padding: 0, cursor: "pointer", zIndex: 5 }}
          aria-label="begin"
        />
      )}

      <Header variant={countdown !== null ? "dark" : "light"} section={!started ? "rapid fire" : undefined} />

      <main className="flex-1 flex flex-col items-center justify-center px-8 pb-16 text-center" style={{ position: "relative", zIndex: 10, pointerEvents: "none" }}>
        {!started ? (
          <div className="animate-fade-up max-w-3xl">
            <h1
              className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[0.96] mb-6"
              style={{ fontSize: "clamp(30px, 6vw, 60px)" }}
            >
              okay, that was heavy. let&apos;s dial it back.
            </h1>
            <div className="w-14 h-px bg-[#2A1810] mx-auto mb-5" />
            <p
              className="font-[family-name:var(--font-things)] text-[#2A1810] mb-10"
              style={{ fontSize: "clamp(14px, 2vw, 17px)" }}
            >
              rapid fire. 10 seconds each. go with your gut.
            </p>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 14px",
                border: "1px solid rgba(42,24,16,0.18)",
                borderRadius: 999,
                background: pressed ? "rgba(124,28,11,0.08)" : "rgba(245,240,232,0.8)",
                transform: pressed ? "scale(0.97)" : "scale(1)",
                transition: "transform 160ms ease, background 200ms ease",
                pointerEvents: "none",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 999, background: "#7C1C0B", flexShrink: 0, animation: "fqPulse 1600ms ease-in-out infinite" }} />
              <span style={{ fontFamily: "var(--font-motive)", fontSize: 10, letterSpacing: "0.20em", color: "#2A1810" }}>
                tap anywhere to begin
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <span
              key={countdown}
              className="font-[family-name:var(--font-things)]"
              style={{
                color: textColor,
                fontSize: "clamp(80px, 20vw, 140px)",
                lineHeight: 1,
                animation: "fqCountPop 800ms cubic-bezier(0.34,1.56,0.64,1) both",
                transition: "color 400ms ease",
              }}
            >
              {countdown === 0 ? "go" : countdown}
            </span>
            <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.2em]" style={{ color: `${textColor}99` }}>
              {countdown === 0 ? "here we go" : "get ready"}
            </p>
          </div>
        )}
      </main>

      {!started && (
        <NavLink
          href="/show-up"
          className="fixed bottom-8 left-8 flex items-center gap-2 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] no-underline hover:text-[#7C1C0B] transition-colors z-50"
        >
          <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
            <path d="M19 4H1M1 4L4.5 1M1 4L4.5 7" stroke="currentColor" strokeWidth="1" />
          </svg>
          back
        </NavLink>
      )}

      <style>{`
        @keyframes fqCountPop {
          0%   { opacity: 0; transform: scale(0.4); filter: blur(8px); }
          40%  { opacity: 1; transform: scale(1.12); filter: blur(0); }
          75%  { transform: scale(1); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes fqPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%       { opacity: 1; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
}
