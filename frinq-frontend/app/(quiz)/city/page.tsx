"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import QuestionLabel from "@/app/components/QuestionLabel";
import { getQuizState, setQuizState } from "@/app/lib/storage";

const CITIES = [
  "Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Pune", "Kolkata",
  "Ahmedabad", "Jaipur", "Surat", "Lucknow", "Kanpur", "Nagpur", "Indore",
  "Bhopal", "Patna", "Vadodara", "Ghaziabad", "Ludhiana", "Agra", "Nashik",
  "Faridabad", "Meerut", "Rajkot", "Varanasi", "Srinagar", "Aurangabad",
  "Dhanbad", "Amritsar", "Navi Mumbai", "Gurgaon", "Noida", "Chandigarh",
  "Coimbatore", "Kochi", "Visakhapatnam", "Mysuru", "Thiruvananthapuram",
  "Bhubaneswar", "Guwahati", "Dehradun", "Raipur", "Ranchi",
];

export default function CityPage() {
  const [value, setValue] = useState(() => getQuizState("frinq_city") ?? "");
  // Default is empty so the heading reads "where do you live?" while the
  // name loads from localStorage — never "where do you live, friend?".
  const [name] = useState(() => getQuizState("frinq_name") ?? "");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const filtered = value.trim().length > 0
    ? CITIES.filter((c) => c.toLowerCase().startsWith(value.toLowerCase())).slice(0, 5)
    : [];

  function select(city: string) {
    setValue(city);
    setOpen(false);
    setHighlighted(-1);
    window.frinqTrack?.("select_option", { page: "/city", choice: city });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      select(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setQuizState("frinq_city", value.trim());
    if (document.startViewTransition) {
      document.startViewTransition(() => { router.push("/age"); });
    } else {
      router.push("/age");
    }
  }

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <Header section="s0 · let's begin" backHref="/name" />

      <main className="flex-1 flex flex-col justify-center px-8 pt-20 pb-16 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl">
          <QuestionLabel>{name ? `where do you live, ${name}?` : "where do you live?"}</QuestionLabel>
          <div className="mb-6" />
          <form onSubmit={handleSubmit} autoComplete="off">
            <div ref={wrapRef} className="relative">
              <input
                className="frinq-input"
                placeholder="start typing a city..."
                value={value}
                onChange={(e) => { setValue(e.target.value); setOpen(true); setHighlighted(-1); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />

              {open && filtered.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#F5F0E8] border border-[rgba(42,24,16,0.15)] z-20">
                  {filtered.map((city, i) => (
                    <button
                      key={city}
                      type="button"
                      onMouseDown={() => select(city)}
                      className={`w-full text-left px-4 py-2.5 font-[family-name:var(--font-things)] text-[15px] transition-colors ${
                        i === highlighted ? "bg-[rgba(124,28,11,0.06)] text-[#7C1C0B]" : "text-[#2A1810] hover:bg-[rgba(42,24,16,0.04)]"
                      }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quick picks */}
            {!value && (
              <div className="mt-4 flex flex-wrap gap-2">
                {["Mumbai", "Delhi", "Bengaluru", "Gurgaon", "Hyderabad", "Pune"].map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => select(city)}
                    className="px-3 py-1.5 border border-[rgba(42,24,16,0.2)] font-[family-name:var(--font-motive)] text-[10px] tracking-[0.12em] text-[#8B7355] hover:border-[#2A1810] hover:text-[#2A1810] transition-colors"
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={!value.trim()}
              className="mt-10 inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors group disabled:opacity-30 disabled:cursor-not-allowed"
            >
              next
              <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="transition-transform group-hover:translate-x-1">
                <path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
