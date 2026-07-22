"use client";

import Image from "next/image";

const ACTIONS = [
  {
    key: "waitlist",
    label: "join the waitlist",
    sub: "we'll match you when the next batch opens.",
    arrow: true,
  },
  {
    key: "event",
    label: "come to a frinq night",
    sub: "irl events in delhi, mumbai, bengaluru.",
    arrow: true,
  },
  {
    key: "share",
    label: "tell a friend",
    sub: "one share = one more weirdo we want to meet.",
    arrow: true,
  },
];

export default function WhatNextPage() {
  function handleAction(key: string) {
    window.frinqTrack?.("click", { page: "/what-next", element: key });
    if (key === "share" && navigator.share) {
      navigator.share({ title: "frinq", text: "find your frinq. a quiet experiment in friendship.", url: window.location.origin }).catch(() => {});
    }
  }

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <header className="flex items-center px-8 py-5 flex-shrink-0">
        <Image src="/fq-logo.png" alt="frinq" width={38} height={38} className="w-[38px] h-[38px]" />
      </header>

      <main className="flex-1 flex flex-col justify-center px-8 pb-16 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl">
          <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.2em] text-[#8B7355] mb-3">
            you&apos;re in
          </p>
          <h1
            className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.05] mb-10"
            style={{ fontSize: "clamp(24px, 5vw, 40px)" }}
          >
            here&apos;s how this works.
          </h1>

          <div className="flex flex-col gap-0">
            {ACTIONS.map((a, i) => (
              <button
                key={a.key}
                onClick={() => handleAction(a.key)}
                className="group flex items-start gap-5 py-5 border-b border-[rgba(42,24,16,0.12)] text-left w-full"
                style={{
                  transition: "transform 200ms ease, border-color 200ms ease",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateX(4px)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "translateX(0)"; }}
              >
                <span className="font-[family-name:var(--font-things)] text-[#7C1C0B] text-[13px] w-5 flex-shrink-0 mt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[17px] leading-snug group-hover:text-[#7C1C0B] transition-colors">
                    {a.label}
                  </p>
                  <p className="font-[family-name:var(--font-motive)] text-[#8B7355] text-[11px] mt-1 font-light">
                    {a.sub}
                  </p>
                </div>
                <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="flex-shrink-0 mt-2 opacity-40 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                  <path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" />
                </svg>
              </button>
            ))}
          </div>

        </div>
      </main>
    </div>
  );
}
