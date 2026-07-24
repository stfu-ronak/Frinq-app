"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UrlMask from "@/app/components/UrlMask";
import QuizProgressTracker from "@/app/components/QuizProgressTracker";
import { restoreSession, loadPendingLegalAcceptance } from "@/app/lib/session";

type GateState = "checking" | "ready" | "redirecting";

export default function QuizLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Gates every quiz page (name/city/phone/verify/vibe-box/...) behind
      // a recorded-or-pending Terms/Privacy acceptance — closes the bypass
      // where a deep link or a resumed local session skips /terms/accept
      // entirely. A pending acceptance (set at /terms/accept, not yet
      // POSTed) or an existing authenticated session (acceptance already
      // recorded server-side at signup) both count as gated-through.
      if (loadPendingLegalAcceptance()) {
        if (!cancelled) setState("ready");
        return;
      }
      const { authenticated } = await restoreSession();
      if (cancelled) return;
      if (authenticated) {
        setState("ready");
      } else {
        setState("redirecting");
        router.replace("/terms/accept");
      }
    })();

    return () => { cancelled = true; };
  }, [router]);

  if (state !== "ready") {
    return (
      <div className="h-dvh flex items-center justify-center bg-[#F5F0E8]">
        <span
          className="w-2 h-2 rounded-full bg-[#7C1C0B]"
          style={{ animation: "fqGatePulse 1400ms ease-in-out infinite" }}
        />
        <style>{`
          @keyframes fqGatePulse {
            0%, 100% { opacity: 0.35; transform: scale(1); }
            50%      { opacity: 1;    transform: scale(1.3); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <UrlMask />
      <QuizProgressTracker />
      {children}
    </>
  );
}
