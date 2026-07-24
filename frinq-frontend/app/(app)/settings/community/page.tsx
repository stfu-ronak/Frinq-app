"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/app/lib/api";

export default function CommunitySettingsPage() {
  const [muted, setMuted] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/v1/community/me");
        if (!res.ok) { if (!cancelled) setError("couldn't load your preferences"); return; }
        const data = await res.json();
        if (!cancelled) setMuted(data.muted);
      } catch {
        if (!cancelled) setError("couldn't load your preferences");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function toggle() {
    if (muted === null || saving) return;
    const next = !muted;
    setSaving(true);
    setError(null);
    // Optimistic — only reverted if the server rejects it.
    setMuted(next);
    try {
      const res = await apiFetch("/api/v1/community/preferences", {
        method: "PATCH",
        body: JSON.stringify({ muted: next }),
      });
      if (!res.ok) {
        setMuted(!next);
        setError("couldn't save, try again");
      }
    } catch {
      setMuted(!next);
      setError("network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-8 pt-14">
      <h1
        className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.05] mb-8"
        style={{ fontSize: "clamp(24px, 6vw, 32px)" }}
      >
        community notifications
      </h1>

      <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[13px] mb-6">
        this only affects push notifications for new messages — it never changes your
        membership or hides messages in the app itself.
      </p>

      {error && (
        <p role="alert" className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B] mb-4">{error}</p>
      )}

      {muted === null ? (
        <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[14px]">loading…</p>
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={!muted}
          onClick={toggle}
          disabled={saving}
          style={{ minHeight: 44 }}
          className="flex items-center justify-between w-full py-3 border-b border-[rgba(42,24,16,0.08)] disabled:opacity-50"
        >
          <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px]">
            notify me about new messages
          </span>
          <span
            aria-hidden="true"
            className="relative inline-block w-10 h-6 rounded-full transition-colors"
            style={{ background: !muted ? "#7C1C0B" : "rgba(42,24,16,0.15)" }}
          >
            <span
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
              style={{ transform: !muted ? "translateX(18px)" : "translateX(2px)" }}
            />
          </span>
        </button>
      )}
    </div>
  );
}
