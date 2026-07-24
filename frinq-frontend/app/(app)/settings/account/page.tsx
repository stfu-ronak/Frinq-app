"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import { clearRefreshToken } from "@/app/lib/session";
import { track } from "@/app/lib/analytics";

type Step = "confirm" | "otp_sent" | "type_delete" | "deleting";

const RESEND_COOLDOWN = 30;

export default function DeleteAccountPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("confirm");
  const [code, setCode] = useState("");
  const [reauthToken, setReauthToken] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  async function requestCode() {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/v1/auth/reverify/request", { method: "POST" });
      if (!res.ok) {
        setError("couldn't send a code, try again");
        setBusy(false);
        return;
      }
      setStep("otp_sent");
      setCooldown(RESEND_COOLDOWN);
      const timer = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) { clearInterval(timer); return 0; }
          return c - 1;
        });
      }, 1000);
    } catch {
      setError("network error, try again");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!code) return;
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/v1/auth/reverify/verify", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || "wrong code — check your whatsapp and retype");
        setBusy(false);
        return;
      }
      setReauthToken(data.reauth_token);
      setStep("type_delete");
    } catch {
      setError("network error, try again");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!reauthToken || confirmText !== "DELETE") return;
    setStep("deleting");
    setError("");
    try {
      const res = await apiFetch("/api/v1/users/me", {
        method: "DELETE",
        body: JSON.stringify({ reauth_token: reauthToken }),
      });
      if (!res.ok) {
        setError("couldn't delete your account, try again from the start");
        setStep("type_delete");
        return;
      }
      track("account_deleted");
      await clearRefreshToken();
      router.replace("/");
    } catch {
      setError("network error, try again from the start");
      setStep("type_delete");
    }
  }

  return (
    <div className="px-8 pt-14 pb-14 max-w-2xl mx-auto">
      <h1
        className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.05] mb-6"
        style={{ fontSize: "clamp(24px, 6vw, 32px)" }}
      >
        delete account
      </h1>

      <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] leading-relaxed mb-2">
        this permanently deletes your account, profile, and quiz results. it can&apos;t be undone.
      </p>
      <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[13px] mb-8">
        your past chat messages stay visible to others in the community, no longer linked to you.
      </p>

      {error && (
        <p role="alert" className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B] mb-4">
          {error}
        </p>
      )}

      {step === "confirm" && (
        <button
          type="button"
          onClick={requestCode}
          disabled={busy}
          style={{ minHeight: 44 }}
          className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.18em] uppercase text-[#7C1C0B] disabled:opacity-40"
        >
          {busy ? "sending code…" : "send verification code"}
        </button>
      )}

      {step === "otp_sent" && (
        <div className="flex flex-col gap-4">
          <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[14px]">
            enter the code we sent to your whatsapp to confirm it&apos;s you.
          </p>
          <input
            type="text"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            style={{ minHeight: 44, fontSize: 16 }}
            className="border border-[rgba(42,24,16,0.2)] rounded px-4 font-[family-name:var(--font-things)] text-[#2A1810]"
          />
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={verifyCode}
              disabled={busy || !code}
              style={{ minHeight: 44 }}
              className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.18em] uppercase text-[#7C1C0B] disabled:opacity-40"
            >
              {busy ? "verifying…" : "verify code"}
            </button>
            <button
              type="button"
              onClick={requestCode}
              disabled={busy || cooldown > 0}
              style={{ minHeight: 44 }}
              className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.14em] text-[#8B7355] disabled:opacity-40"
            >
              {cooldown > 0 ? `resend in ${cooldown}s` : "resend code"}
            </button>
          </div>
        </div>
      )}

      {(step === "type_delete" || step === "deleting") && (
        <div className="flex flex-col gap-4">
          <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[14px]">
            type <strong>DELETE</strong> to confirm.
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            style={{ minHeight: 44, fontSize: 16 }}
            className="border border-[rgba(42,24,16,0.2)] rounded px-4 font-[family-name:var(--font-things)] text-[#2A1810]"
          />
          <button
            type="button"
            onClick={deleteAccount}
            disabled={confirmText !== "DELETE" || step === "deleting"}
            style={{ minHeight: 44 }}
            className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.18em] uppercase text-white bg-[#7C1C0B] rounded px-4 disabled:opacity-40"
          >
            {step === "deleting" ? "deleting…" : "permanently delete my account"}
          </button>
        </div>
      )}
    </div>
  );
}
