"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/api";

const MIN_LEN = 2;
const MAX_LEN = 40;

const ERROR_MESSAGES: Record<string, string> = {
  display_name_too_short: `name must be at least ${MIN_LEN} characters`,
  display_name_too_long: `name must be ${MAX_LEN} characters or fewer`,
  display_name_empty_after_normalization: "name can't be empty",
  display_name_control_characters: "that name contains characters that aren't allowed",
  display_name_excessive_repetition: "too many repeated characters",
  display_name_too_many_urls: "links aren't allowed in your name",
  display_name_reserved_term: "that name isn't available",
  display_name_blocked_term: "that name isn't allowed",
};

function mapServerError(detail: unknown): string {
  const text = JSON.stringify(detail ?? "");
  for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
    if (text.includes(code)) return message;
  }
  return "couldn't save — try a different name";
}

export default function EditProfilePage() {
  const router = useRouter();
  const [original, setOriginal] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/v1/users/me");
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setOriginal(data.display_name ?? "");
            setValue(data.display_name ?? "");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const dirty = original !== null && value.trim() !== original;

  function handleCancel() {
    if (dirty && !window.confirm("discard your changes?")) return;
    router.replace("/profile/");
  }

  async function handleSave() {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/v1/users/me", {
        method: "PATCH",
        body: JSON.stringify({ display_name: value.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(mapServerError(body.detail));
        return;
      }
      // Optimistic UI only after server acceptance — navigate back only
      // once the server has actually confirmed the new name.
      router.replace("/profile/");
    } catch {
      setError("network error, try again");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-8 pt-14">
        <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[15px]">loading…</p>
      </div>
    );
  }

  return (
    <div className="px-8 pt-14">
      <h1
        className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.05] mb-8"
        style={{ fontSize: "clamp(24px, 6vw, 32px)" }}
      >
        edit profile
      </h1>

      <label htmlFor="display-name" className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.16em] uppercase text-[#8B7355] mb-2 block">
        display name
      </label>
      <input
        id="display-name"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={MAX_LEN + 20} // headroom so an over-limit paste still shows the count/error rather than silently truncating
        style={{ fontSize: 16 }}
        className="frinq-input w-full mb-1"
      />
      <p className="font-[family-name:var(--font-motive)] text-[10px] text-[rgba(42,24,16,0.4)] mb-4">
        {value.trim().length}/{MAX_LEN}
      </p>

      {error && (
        <p role="alert" className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B] mb-4">{error}</p>
      )}

      <div className="flex gap-4">
        <button
          type="button"
          onClick={handleCancel}
          style={{ minHeight: 44 }}
          className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.14em] uppercase text-[#8B7355] px-4"
        >
          cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          style={{ minHeight: 44 }}
          className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.14em] uppercase text-[#F5F0E8] bg-[#7C1C0B] px-4 disabled:opacity-40"
        >
          {saving ? "saving…" : "save"}
        </button>
      </div>
    </div>
  );
}
