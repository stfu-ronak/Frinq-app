"use client";

import { useState } from "react";
import { apiFetch } from "@/app/lib/api";
import { track } from "@/app/lib/analytics";

export default function BlockDialog({
  authorId, authorDisplayName, onClose, onBlocked,
}: {
  authorId: string;
  authorDisplayName: string | null;
  onClose: () => void;
  onBlocked: (authorId: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/users/${authorId}/block`, { method: "POST" });
      if (!res.ok) {
        setError("couldn't block, try again");
        return;
      }
      track("block_created");
      onBlocked(authorId);
    } catch {
      setError("network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="block user"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(42,24,16,0.45)" }}
      onClick={onClose}
    >
      <div className="bg-[#F5F0E8] w-full max-w-sm rounded-2xl p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.2em] uppercase text-[#7C1C0B] mb-2">
          block {authorDisplayName || "this user"}?
        </p>
        <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[14px] mb-5">
          you won&apos;t see each other&apos;s messages in this community anymore. this takes
          effect immediately.
        </p>
        {error && (
          <p role="alert" className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B] mb-3">{error}</p>
        )}
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            style={{ minHeight: 44 }}
            className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] px-3 text-[#8B7355]"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={submitting}
            style={{ minHeight: 44 }}
            className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] px-3 bg-[#7C1C0B] text-[#F5F0E8] disabled:opacity-40"
          >
            {submitting ? "blocking…" : "block"}
          </button>
        </div>
      </div>
    </div>
  );
}
