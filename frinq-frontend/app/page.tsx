"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import FadeUp from "@/app/components/motion/FadeUp";
import StaggerWords from "@/app/components/motion/StaggerWords";
import Float from "@/app/components/motion/Float";
import { getQuizState, clearQuizState, hardResetQuizState, syncDevFlagFromURL, isDevMode } from "@/app/lib/storage";
import { getIdentity } from "@/app/lib/identity";
import { restoreSession } from "@/app/lib/session";
import { apiFetch } from "@/app/lib/api";

const DEV_PHONE = process.env.NEXT_PUBLIC_DEV_PHONE ?? "";

// force-dynamic is unsupported under output: "export" (static export) and
// would fail the build — this page reads localStorage and routes on mount
// entirely client-side, so it doesn't need it: the exported HTML is just a
// static shell, all the actual routing logic runs after hydration.

export default function SplashPage() {
  const router = useRouter();
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    function navigate(path: string) {
      if (document.startViewTransition) {
        document.startViewTransition(() => router.replace(path));
      } else {
        router.replace(path);
      }
    }

    function resumeLocalPageIfAny() {
      // No authoritative session — fall back to the local last-visited-page
      // heuristic (pre-account quiz progress, never for active/processing
      // accounts, which are always routed from server state below).
      const currentPage = getQuizState("frinq_current_page");
      if (currentPage && currentPage !== "/" && currentPage !== "/vibe-box") {
        navigate(currentPage);
      }
    }

    // Sync ?dev=1 / ?dev=0 from URL into localStorage flag FIRST so all
    // subsequent dev checks see the current value.
    syncDevFlagFromURL();

    const params = new URLSearchParams(window.location.search);
    if (params.get("start") === "fresh") {
      hardResetQuizState();
      return;
    }
    if (isDevMode()) {
      clearQuizState();
      return;
    }
    const identity = getIdentity();
    if (DEV_PHONE && identity.phone === DEV_PHONE) {
      clearQuizState();
      return;
    }

    (async () => {
      const { authenticated } = await restoreSession();
      if (!authenticated) {
        resumeLocalPageIfAny();
        return;
      }

      try {
        const res = await apiFetch("/api/v1/users/me");
        if (!res.ok) {
          resumeLocalPageIfAny();
          return;
        }
        const user = await res.json();
        if (user.onboarding_state === "active") {
          navigate("/community");
        } else if (user.onboarding_state === "profile_processing") {
          navigate("/vibe-box");
        } else if (user.onboarding_state === "error") {
          navigate("/vibe-box?state=error");
        } else {
          // quiz_in_progress — resume locally, same as an unauthenticated visitor.
          resumeLocalPageIfAny();
        }
      } catch {
        // Network failure reaching /users/me — stay on splash rather than
        // guess; the user can still tap through manually.
      }
    })();
  }, [router]);

  function go() {
    if (document.startViewTransition) document.startViewTransition(() => router.push("/s0"));
    else router.push("/s0");
  }

  return (
    <main style={{ position: "relative", height: "100dvh", background: "#F5F0E8", overflow: "hidden" }}>
      {/* Full-stage tap target */}
      <button
        onClick={go}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        style={{ position: "absolute", inset: 0, background: "transparent", border: "none", padding: 0, cursor: "pointer", zIndex: 5 }}
        aria-label="begin"
      />

      {/* Masthead */}
      <FadeUp delay={0} style={{ padding: "22px 26px 0", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 10, pointerEvents: "none" }}>
        <Image src="/fq-logo.png" alt="frinq" width={32} height={32} priority />
      </FadeUp>

      <FadeUp delay={100} style={{ padding: "10px 26px 0", pointerEvents: "none" }}>
        <div style={{ height: 1, background: "rgba(42,24,16,0.15)" }} />
      </FadeUp>

      {/* Hero text */}
      <div style={{ padding: "28px 26px 0", position: "relative", zIndex: 8, pointerEvents: "none" }}>
        <FadeUp delay={200}>
          <span style={{ fontFamily: "var(--font-motive)", fontSize: 10, letterSpacing: "0.28em", color: "#8B7355", display: "block", marginBottom: 16 }}>
            a quiet experiment in friendship
          </span>
        </FadeUp>

        <StaggerWords
          text="find your"
          delay={380}
          gap={110}
          size="clamp(24px, 7vw, 30px)"
          style={{ color: "#8B7355", lineHeight: 1.0, marginBottom: 0 }}
        />

        <div style={{ position: "relative", display: "inline-block", marginTop: 4 }}>
          <StaggerWords
            text="frinq."
            delay={700}
            gap={0}
            size="clamp(62px, 18vw, 88px)"
            style={{ color: "#2A1810", lineHeight: 0.95, letterSpacing: "-0.01em" }}
          />
          <span style={{
            position: "absolute", right: 2, bottom: 10,
            width: 13, height: 13, borderRadius: "50%", background: "#7C1C0B",
            animation: "fqDotPop 480ms cubic-bezier(0.34,1.56,0.64,1) 1050ms both",
          }} />
        </div>

        <FadeUp delay={1200} style={{ marginTop: 16, maxWidth: 270 }}>
          <p style={{ fontFamily: "var(--font-motive)", fontWeight: 300, fontSize: 13, lineHeight: 1.6, color: "#2A1810", margin: 0 }}>
            ten quiet minutes. we read the gaps between your answers and find the people who already get you.
          </p>
        </FadeUp>
      </div>

      {/* Duck bottom-right */}
      <Float amp={5} period={5000} style={{ position: "absolute", bottom: -8, right: -10, zIndex: 4, pointerEvents: "none" }}>
        <Image
          src="/illustrations/landing-ducks.png"
          alt=""
          width={400}
          height={460}
          priority
          style={{ width: 200, height: "auto", display: "block", animation: "fqSplashRise 900ms cubic-bezier(0.34,1.56,0.64,1) 200ms both" }}
        />
      </Float>

      {/* "tap anywhere" pill */}
      <div style={{ position: "absolute", bottom: 88, left: 26, pointerEvents: "none", zIndex: 8 }}>
        <FadeUp delay={1600}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            padding: "8px 14px",
            border: "1px solid rgba(42,24,16,0.18)", borderRadius: 999,
            background: pressed ? "rgba(124,28,11,0.08)" : "rgba(245,240,232,0.8)",
            transform: pressed ? "scale(0.97)" : "scale(1)",
            transition: "transform 160ms ease, background 200ms ease",
          }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: "#7C1C0B", flexShrink: 0, animation: "fqPulse 1600ms ease-in-out infinite" }} />
            <span style={{ fontFamily: "var(--font-motive)", fontSize: 10, letterSpacing: "0.20em", color: "#2A1810" }}>
              tap anywhere to begin
            </span>
          </div>
        </FadeUp>
      </div>

      {/* "start over" link removed per request — users with a prior session
          will be auto-resumed by the splash useEffect; if they want a fresh
          start they can still visit /?start=fresh manually or use ?dev=1. */}

      <style>{`
        @keyframes fqDotPop {
          from { opacity: 0; transform: translateY(-6px) scale(0.4); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fqSplashRise {
          from { opacity: 0; transform: translate(16px, 60px) rotate(-3deg); }
          to   { opacity: 1; transform: translate(0, 0) rotate(0); }
        }
        @keyframes fqPulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50%       { opacity: 1; transform: scale(1.3); }
        }
      `}</style>
    </main>
  );
}
