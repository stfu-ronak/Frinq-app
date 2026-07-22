"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  value: string;                 // comma-separated string (storage format)
  onChange: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  flashKey?: string | null;      // when this value appears in tags, flash it
}

/**
 * Pill-style multi-tag input. Stores values as a comma-separated string
 * (so storage / API contract is unchanged), but renders each token as a
 * #hashtag chip inside the input. Used on hobbies, red-flags, and
 * last-question screens where users build a list by typing or by tapping
 * suggestion chips below.
 *
 * Backspace at empty cursor deletes the last chip.
 * Comma or Enter commits the current draft as a chip.
 */
export default function HashtagInput({ value, onChange, placeholder, autoFocus, flashKey }: Props) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const tags = value.split(",").map((s) => s.trim()).filter(Boolean);

  // autoFocus prop kept for API compat but intentionally NOT honored — was
  // popping the mobile keyboard the instant the page loaded, which the user
  // found irritating across hobbies / red-flags / show-up / last-question.
  // User taps the input themselves to focus. Suggestion chips below stay
  // tap-able without ever stealing focus.
  void autoFocus;

  function commit(text: string) {
    const t = text.trim().replace(/,$/, "");
    if (!t) return;
    if (tags.some((existing) => existing.toLowerCase() === t.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...tags, t].join(", "));
    setDraft("");
  }

  function removeAt(i: number) {
    const next = tags.filter((_, idx) => idx !== i).join(", ");
    onChange(next);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      e.preventDefault();
      removeAt(tags.length - 1);
    }
  }

  function onChangeRaw(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    // Allow user to paste / type a comma-separated list — split inline.
    if (v.includes(",")) {
      const parts = v.split(",").map((p) => p.trim()).filter(Boolean);
      const last = parts.pop() ?? "";
      for (const p of parts) commit(p);
      setDraft(last);
    } else {
      setDraft(v);
    }
  }

  return (
    <div
      className="w-full min-h-[3.25rem] border-b-2 py-2 cursor-text"
      style={{
        borderBottomColor: tags.length || draft ? "#2A1810" : "rgba(42,24,16,0.25)",
        transition: "border-color 200ms ease",
      }}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex flex-wrap items-center gap-2">
        {tags.map((tag, i) => {
          const isFlashing = flashKey === tag;
          return (
            <span
              key={`${tag}-${i}`}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full font-[family-name:var(--font-things)] text-[14px]"
              style={{
                background: isFlashing ? "rgba(124,28,11,0.22)" : "rgba(124,28,11,0.10)",
                color: "#7C1C0B",
                border: "1px solid rgba(124,28,11,0.42)",
                transform: isFlashing ? "scale(0.95)" : "scale(1)",
                transition: "transform 180ms cubic-bezier(0.34,1.56,0.64,1), background 220ms ease",
              }}
            >
              {tag}
              <button
                type="button"
                aria-label={`remove ${tag}`}
                onClick={(e) => { e.stopPropagation(); removeAt(i); }}
                className="ml-0.5 leading-none"
                style={{
                  fontFamily: "var(--font-motive), sans-serif",
                  fontSize: 14, color: "#7C1C0B", opacity: 0.6, padding: "0 2px",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          value={draft}
          onChange={onChangeRaw}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && commit(draft)}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent outline-none font-[family-name:var(--font-things)] text-[16px] text-[#2A1810] placeholder:text-[rgba(42,24,16,0.3)] py-1"
        />
      </div>
    </div>
  );
}
