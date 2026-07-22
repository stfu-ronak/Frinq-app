"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setQuizState } from "@/app/lib/storage";

export default function SocialVerifyPage() {
  const [linkedin, setLinkedin] = useState("");
  const [instagram, setInstagram] = useState("");
  const router = useRouter();

  function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setQuizState("frinq_linkedin_url", linkedin.trim());
    setQuizState("frinq_instagram", instagram.trim());
    setQuizState("frinq_social_verified", linkedin.trim() ? "pending" : "skipped");
    if (document.startViewTransition) {
      document.startViewTransition(() => router.push("/city"));
    } else {
      router.push("/city");
    }
  }

return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <header className="flex items-center px-8 py-5 flex-shrink-0">
        <Image src="/fq-logo.png" alt="frinq" width={38} height={38} className="w-[38px] h-[38px]" />
      </header>

      <main className="flex-1 flex flex-col justify-center px-8 pb-20 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-lg">

          {/* Shield icon */}
          <div className="mb-7">
            <svg width="32" height="36" viewBox="0 0 36 40" fill="none">
              <path
                d="M18 2L3 8v12c0 9.8 6.5 18.9 15 21 8.5-2.1 15-11.2 15-21V8L18 2z"
                stroke="#2A1810"
                strokeWidth="1.4"
                fill="rgba(124,28,11,0.06)"
              />
              <path
                d="M12 20l4 4 8-8"
                stroke="#7C1C0B"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1
            className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.1] mb-3"
            style={{ fontSize: "clamp(20px, 4vw, 32px)" }}
          >
            safety matters here.
          </h1>
          <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[14px] leading-relaxed mb-8">
            we verify every person manually, men and women alike. a profile link is
            all we need to confirm you&apos;re real. we won&apos;t show it to matches.
          </p>

          <form onSubmit={handleContinue} className="flex flex-col gap-6">
            {/* LinkedIn */}
            <div>
              <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.2em] text-[#8B7355] mb-2 uppercase">
                linkedin profile url
              </p>
              <input
                className="frinq-input"
                placeholder="linkedin.com/in/yourname"
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
              />
            </div>

            {/* Instagram */}
            <div>
              <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.2em] text-[#8B7355] mb-2 uppercase">
                instagram handle
              </p>
              <div
                className="flex items-center gap-2 border-b border-[rgba(42,24,16,0.25)] focus-within:border-[#7C1C0B] transition-colors"
                style={{ paddingTop: "0.5rem", paddingBottom: "0.5rem" }}
              >
                <span className="font-[family-name:var(--font-things)] text-[#8B7355] text-[16px] leading-none select-none">
                  @
                </span>
                <input
                  className="flex-1 bg-transparent border-0 outline-none font-[family-name:var(--font-motive)] text-[1rem] font-light text-[#2A1810] placeholder:text-[rgba(42,24,16,0.35)]"
                  placeholder="yourhandle"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value.replace(/^@/, ""))}
                />
              </div>
            </div>

            <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.1em] text-[rgba(42,24,16,0.4)] leading-relaxed -mt-2">
              our team reviews this within 24 hours. unverified profiles are shown lower in matches.
            </p>

            <div className="flex items-center gap-6 mt-2">
              <button
                type="submit"
                className="inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors group"
              >
                continue
                <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="transition-transform group-hover:translate-x-1">
                  <path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  window.frinqTrack?.("click", { page: "/social-verify", element: "skip" });
                  setQuizState("frinq_social_verified", "skipped");
                  if (document.startViewTransition) {
                    document.startViewTransition(() => router.push("/city"));
                  } else {
                    router.push("/city");
                  }
                }}
                className="text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#8B7355] underline underline-offset-2 hover:text-[#2A1810] transition-colors"
              >
                skip
              </button>
            </div>
          </form>
        </div>
      </main>

      <button
        onClick={() => { window.frinqTrack?.("back", { page: "/social-verify" }); router.back(); }}
        className="fixed bottom-8 left-8 flex items-center gap-2 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors z-50"
      >
        <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
          <path d="M19 4H1M1 4L4.5 1M1 4L4.5 7" stroke="currentColor" strokeWidth="1" />
        </svg>
        back
      </button>
    </div>
  );
}
