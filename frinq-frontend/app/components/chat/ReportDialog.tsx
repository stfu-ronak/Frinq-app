"use client";

import { useState } from "react";
import { apiFetch } from "@/app/lib/api";
import { track } from "@/app/lib/analytics";

const REASONS = [
  "spam", "harassment", "hate", "sexual", "self_harm", "violence", "impersonation", "privacy", "other",
] as const;
type Reason = (typeof REASONS)[number];

const REASON_LABELS: Record<Reason, string> = {
  spam: "spam",
  harassment: "harassment",
  hate: "hate speech",
  sexual: "sexual content",
  self_harm: "self-harm",
  violence: "violence",
  impersonation: "impersonation",
  privacy: "privacy violation",
  other: "other",
};

export default function ReportDialog({
  messageId, onClose,
}: {
  messageId: number;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/v1/messages/${messageId}/report`, {
        method: "POST",
        body: JSON.stringify({ reason, details: details.trim() || undefined }),
      });
      if (!res.ok) {
        setError("couldn't submit report, try again");
        return;
      }
      // Neutral acknowledgement only — never promise a specific
      // enforcement outcome (the backend is idempotent on retries too).
      track("report_submitted");
      setDone(true);
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
      aria-label="report message"
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(42,24,16,0.45)" }}
      onClick={onClose}
    >
      <div className="bg-[#F5F0E8] w-full max-w-sm rounded-2xl p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <>
            <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] mb-5">
              thanks — we&apos;ve received your report and will look into it.
            </p>
            <button
              onClick={onClose}
              style={{ minHeight: 44 }}
              className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.1em] text-[#7C1C0B]"
            >
              close
            </button>
          </>
        ) : (
          <>
            <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.2em] uppercase text-[#7C1C0B] mb-4">
              report message
            </p>
            <fieldset className="flex flex-col gap-0.5 mb-4">
              <legend className="sr-only">reason</legend>
              {REASONS.map((r) => (
                <label
                  key={r}
                  style={{ minHeight: 44 }}
                  className="flex items-center gap-2 font-[family-name:var(--font-things)] text-[#2A1810] text-[14px]"
                >
                  <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                  {REASON_LABELS[r]}
                </label>
              ))}
            </fieldset>
            <label htmlFor="report-details" className="sr-only">additional details</label>
            <textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="additional details (optional)"
              className="frinq-input w-full mb-4"
            />
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
                onClick={submit}
                disabled={!reason || submitting}
                style={{ minHeight: 44 }}
                className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] px-3 bg-[#7C1C0B] text-[#F5F0E8] disabled:opacity-40"
              >
                {submitting ? "submitting…" : "submit"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
