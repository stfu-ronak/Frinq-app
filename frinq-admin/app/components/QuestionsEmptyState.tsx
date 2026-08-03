"use client";

import { appColor } from "../lib/appTokens";

/** Landing-screen-styled placeholder shown when no question is open —
 *  mirrors frinq-mobile's LandingScreen.tsx (maroon background, centered
 *  cursive wordmark, arrow-in-a-circle button) so the admin panel's empty
 *  state carries the same brand moment instead of a bare hint. The arrow
 *  opens "add question" — a real action, not decoration. */
export function QuestionsEmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-6 rounded-md py-16"
      style={{ background: appColor.maroon }}
    >
      <p className="font-[family-name:var(--font-things)] text-[40px]" style={{ color: appColor.cream }}>frinq</p>
      <button
        type="button"
        onClick={onCreateNew}
        aria-label="Add a new question"
        className="flex items-center justify-center w-16 h-16 rounded-full border transition-opacity hover:opacity-80"
        style={{ borderColor: appColor.cream }}
      >
        <svg width="28" height="20" viewBox="0 0 20 16" aria-hidden>
          <path d="M2 8H18M18 8L11 2M18 8L11 14" stroke={appColor.cream} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.08em] text-center" style={{ color: appColor.cream, opacity: 0.85 }}>
        pick a question below to edit it, or start a new one
      </p>
    </div>
  );
}
