"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import { clearRefreshToken } from "@/app/lib/session";

// Notification controls (Task 29) and account-deletion controls (Task 24)
// are intentionally not rendered here yet — not stubbed/disabled, just
// absent, so nothing dead ships ahead of those tasks landing.

export default function SettingsPage() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await apiFetch("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Even if the server call fails, still clear the local session —
      // the user asked to log out, don't strand them signed in locally.
    }
    await clearRefreshToken();
    router.replace("/");
  }

  return (
    <div className="px-8 pt-14">
      <h1
        className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.05] mb-8"
        style={{ fontSize: "clamp(24px, 6vw, 32px)" }}
      >
        settings
      </h1>

      <div className="flex flex-col gap-4 mb-10">
        <a
          href="/privacy/"
          className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] underline underline-offset-2"
        >
          privacy policy
        </a>
        <a
          href="/terms/"
          className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] underline underline-offset-2"
        >
          terms of service
        </a>
      </div>

      <button
        onClick={logout}
        disabled={loggingOut}
        className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.18em] uppercase text-[#7C1C0B] disabled:opacity-40"
      >
        {loggingOut ? "logging out…" : "log out"}
      </button>
    </div>
  );
}
