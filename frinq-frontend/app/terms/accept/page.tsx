"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { apiUrl, savePendingLegalAcceptance, getAccessToken } from "@/app/lib/session";
import { apiFetch } from "@/app/lib/api";

function platform(): "ios" | "android" | "web" {
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android" ? p : "web";
}

export default function AcceptTermsPage() {
  const router = useRouter();
  const [termsVersion, setTermsVersion] = useState<string | null>(null);
  const [privacyVersion, setPrivacyVersion] = useState<string | null>(null);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [legalAgreed, setLegalAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl("/api/v1/legal/current"));
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setTermsVersion(data.terms_version);
          setPrivacyVersion(data.privacy_version);
        }
      } catch {
        // Stay on this page — continue is disabled until versions load.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleContinue() {
    if (!ageConfirmed || !legalAgreed || !termsVersion || !privacyVersion) return;
    const locale = typeof navigator !== "undefined" ? navigator.language || "en-IN" : "en-IN";

    // A returning, already-authenticated user landed here because their
    // acceptance is stale (AccountGate redirect) — accept immediately and
    // return to the app rather than routing through the pre-auth quiz flow.
    if (getAccessToken()) {
      setSubmitting(true);
      setError("");
      try {
        const res = await apiFetch("/api/v1/legal/accept", {
          method: "POST",
          body: JSON.stringify({
            terms_version: termsVersion,
            privacy_version: privacyVersion,
            locale,
            source: platform(),
          }),
        });
        if (!res.ok) {
          setError("couldn't save, try again");
          setSubmitting(false);
          return;
        }
        router.replace("/community");
      } catch {
        setError("couldn't save, try again");
        setSubmitting(false);
      }
      return;
    }

    savePendingLegalAcceptance({ termsVersion, privacyVersion, locale });
    router.push("/s0");
  }

  const canContinue = ageConfirmed && legalAgreed && !!termsVersion && !!privacyVersion;

  return (
    <div className="h-dvh flex flex-col justify-center px-8 bg-[#F5F0E8]">
      <p className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.18em] text-[#8B7355] mb-3">
        before we start
      </p>
      <h1
        className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.1] mb-6"
        style={{ fontSize: "clamp(24px, 5vw, 34px)" }}
      >
        a couple of things first
      </h1>

      <label className="flex items-start gap-3 mb-4" style={{ minHeight: 44 }}>
        <input
          type="checkbox"
          checked={ageConfirmed}
          onChange={(e) => setAgeConfirmed(e.target.checked)}
          className="mt-1"
          style={{ width: 20, height: 20 }}
        />
        <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[14px]">
          I confirm I am 18 years of age or older.
        </span>
      </label>

      <label className="flex items-start gap-3 mb-8" style={{ minHeight: 44 }}>
        <input
          type="checkbox"
          checked={legalAgreed}
          onChange={(e) => setLegalAgreed(e.target.checked)}
          className="mt-1"
          style={{ width: 20, height: 20 }}
        />
        <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[14px]">
          I agree to the{" "}
          <a href="/terms/" target="_blank" rel="noreferrer" className="underline underline-offset-2 text-[#7C1C0B]">
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy/" target="_blank" rel="noreferrer" className="underline underline-offset-2 text-[#7C1C0B]">
            Privacy Policy
          </a>.
        </span>
      </label>

      {error && (
        <p className="font-[family-name:var(--font-things)] text-[#7C1C0B] text-[13px] mb-3">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleContinue}
        disabled={!canContinue || submitting}
        style={{ minHeight: 44 }}
        className="inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors disabled:opacity-40 self-start"
      >
        {submitting ? "saving..." : "continue"}
        <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
          <path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}
