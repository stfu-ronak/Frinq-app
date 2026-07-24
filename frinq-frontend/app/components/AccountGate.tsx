"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { restoreSession } from "@/app/lib/session";
import { apiFetch } from "@/app/lib/api";

type GateState = "checking" | "ready" | "redirecting";

/**
 * Gates the authenticated app shell ((app)/layout.tsx) behind the real
 * server-side account state — never renders children for anything but
 * onboarding_state="active". Same routing table as app/page.tsx and
 * verify/page.tsx, applied on every app-route mount (not just login).
 */
export default function AccountGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    let cancelled = false;

    function redirectTo(path: string) {
      if (cancelled) return;
      setState("redirecting");
      router.replace(path);
    }

    (async () => {
      const { authenticated } = await restoreSession();
      if (!authenticated) {
        redirectTo("/");
        return;
      }

      try {
        const res = await apiFetch("/api/v1/users/me");
        if (!res.ok) {
          redirectTo("/");
          return;
        }
        const user = await res.json();
        if (user.onboarding_state === "active") {
          const legalRes = await apiFetch("/api/v1/legal/current");
          if (legalRes.ok) {
            const legal = await legalRes.json();
            if (
              user.terms_version !== legal.terms_version ||
              user.privacy_version !== legal.privacy_version
            ) {
              redirectTo("/terms/accept");
              return;
            }
          }
          if (!cancelled) setState("ready");
        } else if (user.onboarding_state === "profile_processing") {
          redirectTo("/vibe-box");
        } else if (user.onboarding_state === "error") {
          redirectTo("/vibe-box?state=error");
        } else {
          // quiz_in_progress (or unknown) — not an active account yet.
          redirectTo("/");
        }
      } catch {
        redirectTo("/");
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

  return <>{children}</>;
}
