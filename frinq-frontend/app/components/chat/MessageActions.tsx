"use client";

import { useState } from "react";
import ReportDialog from "./ReportDialog";
import BlockDialog from "./BlockDialog";

export default function MessageActions({
  messageId, authorId, authorDisplayName, onBlocked,
}: {
  messageId: number;
  authorId: string;
  authorDisplayName: string | null;
  onBlocked: (authorId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"report" | "block" | null>(null);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="message actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ minWidth: 44, minHeight: 44 }}
        className="flex items-center justify-center text-[#8B7355] hover:text-[#2A1810]"
      >
        <svg width="14" height="4" viewBox="0 0 14 4" fill="currentColor" aria-hidden="true">
          <circle cx="2" cy="2" r="1.6" />
          <circle cx="7" cy="2" r="1.6" />
          <circle cx="12" cy="2" r="1.6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="message actions"
          className="absolute right-0 z-10 mt-1 bg-[#F5F0E8] border border-[rgba(42,24,16,0.15)] rounded-xl shadow-sm overflow-hidden min-w-[140px]"
        >
          <button
            role="menuitem"
            onClick={() => { setDialog("report"); setOpen(false); }}
            style={{ minHeight: 44 }}
            className="w-full text-left px-4 font-[family-name:var(--font-motive)] text-[11px] tracking-[0.06em] text-[#2A1810] hover:bg-[rgba(42,24,16,0.05)]"
          >
            report
          </button>
          <button
            role="menuitem"
            onClick={() => { setDialog("block"); setOpen(false); }}
            style={{ minHeight: 44 }}
            className="w-full text-left px-4 font-[family-name:var(--font-motive)] text-[11px] tracking-[0.06em] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)]"
          >
            block
          </button>
        </div>
      )}

      {dialog === "report" && (
        <ReportDialog messageId={messageId} onClose={() => setDialog(null)} />
      )}
      {dialog === "block" && (
        <BlockDialog
          authorId={authorId}
          authorDisplayName={authorDisplayName}
          onClose={() => setDialog(null)}
          onBlocked={(id) => { onBlocked(id); setDialog(null); }}
        />
      )}
    </div>
  );
}
