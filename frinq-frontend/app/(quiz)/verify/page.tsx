"use client";

import Image from "next/image";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { getQuizState, setQuizState, isDevMode } from "@/app/lib/storage";
import { setIdentityField } from "@/app/lib/identity";
import { apiUrl, saveRefreshToken, setAccessToken, loadPendingLegalAcceptance, clearPendingLegalAcceptance } from "@/app/lib/session";
import { apiFetch } from "@/app/lib/api";
import { track } from "@/app/lib/analytics";

const DEV_PHONE = process.env.NEXT_PUBLIC_DEV_PHONE ?? "";

function platform(): "ios" | "android" | "web" {
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android" ? p : "web";
}

// last_page values that are part of the pre-OTP auth flow itself — routing
// back to one of these would loop (verify → phone → verify → ...).
const AUTH_PAGES = ["/", "/s0", "/name", "/phone", "/verify"];
const RESEND_COOLDOWN = 30; // seconds

/** Rotating loading copy + animated dots — replaces the static "verifying..."
 *  so the wait for Twilio's WhatsApp verify (which legitimately takes 2-4s)
 *  feels like progress instead of a freeze. */
function VerifyingIndicator() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const msg = seconds < 2
    ? "verifying with whatsapp"
    : seconds < 5
    ? "almost there"
    : "still working — twilio is being slow today";
  return (
    <div className="mt-2 mb-6 flex items-center gap-2">
      <span className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.14em] text-[#8B7355]">
        {msg}
      </span>
      <span className="inline-flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1 h-1 rounded-full bg-[#7C1C0B]"
            style={{
              animation: `fq-verify-dot 1100ms ease-in-out ${i * 220}ms infinite`,
            }}
          />
        ))}
      </span>
      <style>{`
        @keyframes fq-verify-dot {
          0%, 80%, 100% { opacity: 0.25; }
          40%           { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// localStorage key → answer key mapping for session restore
const RESTORE_MAP: Record<string, string> = {
  frinq_name: "name",
  frinq_city: "city",
  frinq_dob: "dob",
  frinq_social_type: "social_type",
  frinq_saturday: "saturday",
  frinq_hobbies: "hobbies",
  frinq_connection: "connection",
  frinq_trip: "trip",
  frinq_show_up: "show_up",
  frinq_story: "story",
  frinq_looking_for: "looking_for",
};
const JSON_KEYS: Record<string, string> = {
  frinq_interests: "interests",
  frinq_red_flags: "red_flags",
  frinq_rapid: "rapid",
  frinq_opinions: "opinions",
  frinq_opinions_why: "opinions_why",
  frinq_scene: "scene",
};

function restoreQuizAnswers(answers: Record<string, unknown>) {
  for (const [lsKey, ansKey] of Object.entries(RESTORE_MAP)) {
    const v = answers[ansKey];
    if (v !== undefined && v !== null && v !== "") {
      setQuizState(lsKey, String(v));
    }
  }
  for (const [lsKey, ansKey] of Object.entries(JSON_KEYS)) {
    const v = answers[ansKey];
    if (v !== undefined && v !== null) {
      setQuizState(lsKey, JSON.stringify(v));
    }
  }
}

export default function VerifyPage() {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const router = useRouter();
  const phone = typeof window !== "undefined" ? getQuizState("frinq_phone") || "" : "";

  // Countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const submit = useCallback(async (code: string) => {
    if (loading) return;
    setLoading(true);
    setError("");

    // OTP verify is the gate — it MUST succeed before we navigate anywhere.
    // If it times out / errors, user stays on this page and retries; we
    // never force-navigate past a failed OTP.
    const verifyController = new AbortController();
    const verifyTimer = setTimeout(() => verifyController.abort(), 12000);

    try {
      const res = await fetch(apiUrl("/api/v1/otp/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, platform: platform() }),
        signal: verifyController.signal,
      });
      clearTimeout(verifyTimer);

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Surface the actual backend detail + status code so the user
        // (and I) can see WHAT Twilio is saying. Auto-resend was previously
        // here but suspected of loop-ing — removed. User must manually tap
        // "resend code" below if the code is rejected.
        let msg = data.detail || "couldn't verify, try again";
        if (res.status === 504) msg = "verification is taking too long. tap any digit to retry.";
        else if (res.status === 410) msg = "that code is no longer valid — tap 'resend code' below";
        else if (res.status === 400) msg = data.detail || "wrong code — check your whatsapp and retype";
        // In debug mode (?debug=1) include the Twilio raw response for diagnosis
        if (typeof window !== "undefined" && window.location.search.includes("debug=1")) {
          msg = `[${res.status}] ${msg}`;
        }
        setError(msg);
        setDigits(["", "", "", "", "", ""]);
        inputRefs.current[0]?.focus();
        setLoading(false);
        return;
      }

      // OTP verified. Persist the rotating session, then route from the
      // server-authoritative user.onboarding_state — never from a client
      // heuristic. Identify analytics with the opaque backend user id only.
      await saveRefreshToken(data.refresh_token);
      setAccessToken(data.access_token);
      track("otp_verified");
      setIdentityField("phone", phone);
      if (window.clarity && data.user?.id) {
        window.clarity("identify", data.user.id);
      }

      // Persist the /terms/accept acceptance recorded before this account
      // existed. If it fails (network) or the server rejects it (versions
      // changed since), route back to accept the current versions rather
      // than let the user into the quiz/chat unaccepted.
      const pendingLegal = loadPendingLegalAcceptance();
      if (pendingLegal) {
        try {
          const legalRes = await apiFetch("/api/v1/legal/accept", {
            method: "POST",
            body: JSON.stringify({
              terms_version: pendingLegal.termsVersion,
              privacy_version: pendingLegal.privacyVersion,
              locale: pendingLegal.locale,
              source: platform(),
            }),
          });
          if (!legalRes.ok) {
            setLoading(false);
            router.replace("/terms/accept");
            return;
          }
          clearPendingLegalAcceptance();
        } catch {
          setLoading(false);
          router.replace("/terms/accept");
          return;
        }
      }

      const isDev = isDevMode() || (DEV_PHONE && phone === DEV_PHONE);
      const ps = data.prior_session;
      if (ps?.submission_id) setQuizState("frinq_submission_id", ps.submission_id);
      if (ps?.answers && Object.keys(ps.answers).length > 0) restoreQuizAnswers(ps.answers);

      // Routing (strict, in priority order):
      //   1. Dev mode (URL flag or env match) → always /social-verify fresh
      //   2. onboarding_state === "active"             → /community
      //   3. onboarding_state === "profile_processing"  → /vibe-box
      //   4. onboarding_state === "error"               → /vibe-box?state=error
      //   5. onboarding_state === "quiz_in_progress"    → saved last_page or /social-verify
      let route = "/social-verify";
      const onboardingState: string | undefined = data.user?.onboarding_state;

      if (isDev) {
        route = "/social-verify";
      } else if (onboardingState === "active") {
        route = "/community";
      } else if (onboardingState === "profile_processing") {
        route = "/vibe-box";
      } else if (onboardingState === "error") {
        route = "/vibe-box?state=error";
      } else {
        // quiz_in_progress (or unknown/legacy) — resume at last_page unless
        // that's one of the pre-OTP auth pages themselves (would loop).
        const lp = ps?.last_page;
        route = (lp && !AUTH_PAGES.includes(lp)) ? lp : "/social-verify";

        if (!ps || Object.keys(ps.answers ?? {}).length === 0) {
          // No usable prior session — create the partial tracking row in
          // the background. Fire-and-forget with its own timeout so it
          // can't block navigation.
          const startController = new AbortController();
          setTimeout(() => startController.abort(), 6000);
          fetch(apiUrl("/api/v1/quiz/start"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone }),
            signal: startController.signal,
            keepalive: true,
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => { if (d?.submission_id) setQuizState("frinq_submission_id", d.submission_id); })
            .catch(() => { /* non-fatal */ });
        }
      }

      setLoading(false);
      if (document.startViewTransition) {
        document.startViewTransition(() => router.push(route));
      } else {
        router.push(route);
      }
    } catch (err) {
      clearTimeout(verifyTimer);
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      setError(isAbort
        ? "verification timed out — check your connection and try again"
        : "couldn't verify, try again");
      // Re-enable input so user can retry; do NOT navigate.
      setLoading(false);
      setDigits(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    }
  }, [loading, phone, router]);

  function handleInput(i: number, val: string) {
    const char = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = char;
    setDigits(next);
    setError("");

    if (char && i < 5) {
      inputRefs.current[i + 1]?.focus();
    }
    if (char && i === 5) {
      const code = next.join("");
      if (code.length === 6) submit(code);
    }
    // Handle full paste into first box
    if (val.length > 1) {
      const pasted = val.replace(/\D/g, "").slice(0, 6).split("");
      const filled = [...digits];
      pasted.forEach((d, idx) => { filled[idx] = d; });
      setDigits(filled);
      const focusAt = Math.min(pasted.length, 5);
      inputRefs.current[focusAt]?.focus();
      if (pasted.length === 6) submit(pasted.join(""));
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    }
  }

  async function resend() {
    if (resendCooldown > 0 || resending) return;
    setResending(true);
    setError("");
    try {
      await fetch(apiUrl("/api/v1/otp/send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
    } catch { /* ignore */ }
    setResending(false);
    setResendCooldown(RESEND_COOLDOWN);
    setDigits(["", "", "", "", "", ""]);
    inputRefs.current[0]?.focus();
  }

  const maskedPhone = phone
    ? `+91 ${phone.slice(0, 2)}**** **${phone.slice(-2)}`
    : "+91 **********";

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <header className="flex items-center gap-4 px-8 py-5 flex-shrink-0">
        {/* Back on LEFT (mobile convention: back-left, forward-right). The
            inline placement next to the logo keeps it above the iOS
            keyboard so it stays tappable. */}
        <button
          onClick={() => router.back()}
          aria-label="back"
          className="flex items-center justify-center w-8 h-8 -ml-2 rounded-full hover:bg-[rgba(124,28,11,0.06)] transition-colors"
        >
          <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
            <path d="M19 4H1M1 4L4.5 1M1 4L4.5 7" stroke="#2A1810" strokeWidth="1" />
          </svg>
        </button>
        <Image src="/fq-logo.png" alt="frinq" width={38} height={38} className="w-[38px] h-[38px]" />
      </header>

      <main className="flex-1 flex flex-col justify-center px-8 pb-24 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-sm">
          {/* WhatsApp icon mark */}
          <div className="mb-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "rgba(37,211,102,0.10)", border: "1px solid rgba(37,211,102,0.35)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M20.5 3.5A11.5 11.5 0 003.5 19l-1.4 5.1 5.2-1.4A11.5 11.5 0 1020.5 3.5zM12 21a9 9 0 01-4.6-1.3l-.3-.2-3.1.8.8-3-.2-.3A9 9 0 1112 21z" fill="#25D366"/>
              <path d="M17.4 14.4c-.3-.2-1.7-.8-1.9-.9-.3-.1-.5-.2-.7.1l-.9 1.1c-.2.2-.3.3-.6.1-.8-.4-1.5-.7-2.2-1.6-.6-.7-1-1.5-1.1-1.8-.1-.3 0-.4.1-.5l.4-.4c.1-.2.2-.3.3-.5.1-.2 0-.3 0-.5 0-.1-.6-1.6-.9-2.1-.2-.5-.5-.5-.6-.5h-.6c-.2 0-.5.1-.7.4-.3.3-1 .9-1 2.2 0 1.3 1 2.6 1.1 2.8.1.2 2 3 4.7 4.1 1.7.7 2.3.8 3.1.7.5-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3z" fill="#25D366"/>
            </svg>
            <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.12em] uppercase" style={{ color: "#1F8A4D" }}>
              sent via whatsapp
            </span>
          </div>
          <h1
            className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.1] mb-3"
            style={{ fontSize: "clamp(22px, 4vw, 34px)" }}
          >
            check your whatsapp
          </h1>
          <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[14px] mb-10">
            we sent a 6-digit code to {maskedPhone}
          </p>

          {/* 6-digit input */}
          <div className="flex gap-3 mb-4">
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={d}
                autoFocus={i === 0}
                onChange={(e) => handleInput(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-11 h-14 text-center border-b-2 bg-transparent font-[family-name:var(--font-things)] text-[#2A1810] text-[22px] focus:outline-none transition-colors"
                style={{
                  borderColor: error
                    ? "#7C1C0B"
                    : d
                    ? "#2A1810"
                    : "rgba(42,24,16,0.2)",
                }}
              />
            ))}
          </div>

          {error && (
            <p className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.1em] text-[#7C1C0B] mb-6">
              {error}
            </p>
          )}

          {/* Auto-submits on the 6th digit. Progressive copy so the user
              sees that something is actively happening (Twilio's WhatsApp
              verify path averages ~2-4s — silence felt like a freeze). */}
          {loading && <VerifyingIndicator />}

          {/* Resend */}
          <div className="mt-8 flex items-center gap-2">
            <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.12em] text-[rgba(42,24,16,0.4)]">
              didn&apos;t get it?
            </span>
            {resendCooldown > 0 ? (
              <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.12em] text-[rgba(42,24,16,0.35)]">
                resend in {resendCooldown}s
              </span>
            ) : (
              <button
                onClick={resend}
                disabled={resending}
                className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.12em] text-[#8B7355] hover:text-[#2A1810] transition-colors underline underline-offset-2 disabled:opacity-40"
              >
                {resending ? "sending..." : "resend code"}
              </button>
            )}
          </div>
        </div>
      </main>

    </div>
  );
}
