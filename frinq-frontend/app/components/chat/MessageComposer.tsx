"use client";

import { useState } from "react";

export default function MessageComposer({
  onSend, disabled, disabledReason,
}: {
  onSend: (body: string) => void;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = value.trim();
    if (!body || disabled) return;
    onSend(body);
    setValue("");
  }

  return (
    <form
      onSubmit={submit}
      className="flex items-end gap-2 px-4 py-3 border-t border-[rgba(42,24,16,0.1)]"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <label htmlFor="chat-composer" className="sr-only">message</label>
      <textarea
        id="chat-composer"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // isComposing guards IME candidate confirmation (CJK input) —
          // that Enter should commit the composition, not submit the form.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit(e);
          }
        }}
        placeholder={disabled ? (disabledReason ?? "reconnecting…") : "message your community"}
        disabled={disabled}
        rows={1}
        maxLength={1000}
        aria-label="message"
        // 16px minimum avoids iOS Safari auto-zoom on focus.
        style={{ fontSize: 16, minHeight: 44, maxHeight: 120 }}
        className="flex-1 resize-none bg-transparent outline-none font-[family-name:var(--font-things)] text-[#2A1810] placeholder:text-[rgba(42,24,16,0.35)] border border-[rgba(42,24,16,0.15)] rounded-2xl px-3.5 py-2.5 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="send message"
        style={{ minWidth: 44, minHeight: 44 }}
        className="flex items-center justify-center rounded-full bg-[#2A1810] text-[#F5F0E8] disabled:opacity-30 transition-opacity motion-reduce:transition-none"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M2 10h14M10 4l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  );
}
