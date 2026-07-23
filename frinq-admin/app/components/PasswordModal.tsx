"use client";

import { useState } from "react";

/** Inline password prompt modal. Resolves with the entered password,
 *  or null if the user cancelled. Callers cache the resolved password
 *  after first successful entry so subsequent destructive actions in the
 *  same session don't re-prompt. */
export default function PasswordModal({ open, onSubmit, onCancel }: {
  open: boolean;
  onSubmit: (pwd: string) => void;
  onCancel: () => void;
}) {
  const [pwd, setPwd] = useState("");
  // Clear the entered password whenever the modal transitions closed.
  // Adjusted during render (not in an effect) so there's no stale-pwd
  // frame between the transition and a passive effect flushing.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setPwd("");
  }
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(42,24,16,0.45)" }}
      onClick={onCancel}>
      <div className="bg-[#F5F0E8] w-full max-w-sm rounded-2xl p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.22em] uppercase text-[#7C1C0B] mb-2">
          action password required
        </p>
        <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] mb-5">
          this action is destructive. enter the password to continue.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); if (pwd) onSubmit(pwd); }}>
          <input type="password" autoFocus value={pwd} onChange={(e) => setPwd(e.target.value)}
            placeholder="password"
            className="frinq-input w-full mb-4" />
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onCancel}
              className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] px-3 py-1.5 text-[#8B7355]">
              cancel
            </button>
            <button type="submit" disabled={!pwd}
              className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] px-3 py-1.5 bg-[#7C1C0B] text-[#F5F0E8] disabled:opacity-40">
              confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
