"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import { getQuizState, setQuizState, clearQuizState, isDevMode } from "@/app/lib/storage";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
const DEV_PHONE = process.env.NEXT_PUBLIC_DEV_PHONE ?? "";

export default function PhonePage() {
  const [value, setValue] = useState(() => getQuizState("frinq_phone") ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const digits = value.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("enter a valid 10-digit number");
      return;
    }

    setLoading(true);
    setError("");

    if (isDevMode() || (DEV_PHONE && digits === DEV_PHONE)) {
      clearQuizState();
    }

    setQuizState("frinq_phone", digits);

    try {
      const res = await fetch(`${API_URL}/api/v1/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });

      if (res.status === 429) {
        setError("too many attempts, wait an hour and try again");
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || "couldn't send OTP, try again");
        setLoading(false);
        return;
      }
    } catch {
      setError("network error, check your connection");
      setLoading(false);
      return;
    }

    // Create a quiz_submissions row NOW (before OTP verify) so users who
    // drop off between OTP-sent and OTP-entered still show up in admin.
    // Fire-and-forget; if it fails, /verify will retry.
    if (API_URL) {
      fetch(`${API_URL}/api/v1/quiz/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.submission_id) setQuizState("frinq_submission_id", d.submission_id);
        })
        .catch(() => {});
    }

    setLoading(false);
    if (document.startViewTransition) {
      document.startViewTransition(() => router.push("/verify"));
    } else {
      router.push("/verify");
    }
  }

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <Header section="s0 · let's begin" backHref="/name" />

      <main className="flex-1 flex flex-col justify-center px-8 pt-20 pb-16 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl">
          <p className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.18em] text-[#8B7355] mb-3">
            before we start
          </p>
          <h1
            className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.1] mb-2"
            style={{ fontSize: "clamp(24px, 4.5vw, 40px)" }}
          >
            what&apos;s your whatsapp number?
          </h1>
          <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[14px] mb-8">
            we&apos;ll send a 6-digit code to your whatsapp.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="relative mb-2">
              <span className="absolute left-0 top-1/2 -translate-y-1/2 font-[family-name:var(--font-things)] text-[#2A1810] text-[22px]">
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                autoFocus
                value={value}
                onChange={(e) => { setValue(e.target.value); setError(""); }}
                maxLength={10}
                placeholder="98765 43210"
                className="w-full pl-12 pb-3 pt-1 bg-transparent border-b border-[rgba(42,24,16,0.25)] focus:border-[#2A1810] focus:outline-none font-[family-name:var(--font-things)] text-[#2A1810] text-[22px] tracking-wider placeholder:text-[rgba(42,24,16,0.25)] transition-colors"
              />
            </div>
            {error && (
              <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B] tracking-[0.1em] mb-4">
                {error}
              </p>
            )}
            <div className="mt-8">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors group disabled:opacity-40"
              >
                {loading ? "sending..." : "continue"}
                {!loading && (
                  <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="transition-transform group-hover:translate-x-1">
                    <path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" />
                  </svg>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
