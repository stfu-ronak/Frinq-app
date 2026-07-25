import Image from "next/image";

// Task 43: the quiz/OTP/account flow lives only in the native app now. This
// page is a minimal download landing page — no client-side routing logic,
// no local quiz-state resume, no session/auth reads. Real App Store / Play
// Store links are DRAFT placeholders until the app is actually published
// (same treatment as Task 41's store metadata) — update once live.
const APP_STORE_URL = "#"; // DRAFT — replace with the real App Store listing URL once published
const PLAY_STORE_URL = "#"; // DRAFT — replace with the real Play Store listing URL once published

export default function LandingPage() {
  return (
    <main className="relative min-h-dvh bg-[#F5F0E8] flex flex-col">
      <div className="px-8 pt-10">
        <Image src="/fq-logo.png" alt="frinq" width={32} height={32} priority />
      </div>

      <div className="flex-1 flex flex-col justify-center px-8 max-w-md">
        <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.28em] uppercase text-[#5E4636] mb-4 block">
          a quiet experiment in friendship
        </span>
        <h1 className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[0.95] text-[clamp(48px,14vw,72px)]">
          find your frinq.
        </h1>
        <p className="font-[family-name:var(--font-motive)] font-light text-[#2A1810] text-[15px] leading-relaxed mt-4 max-w-[320px]">
          Ten quiet minutes. We read the gaps between your answers and find the people who already
          get you. Frinq is a native app — download it to get started.
        </p>

        <div className="flex flex-col gap-3 mt-8 max-w-[260px]">
          <a
            href={APP_STORE_URL}
            className="font-[family-name:var(--font-motive)] text-[13px] text-center tracking-[0.08em] text-[#F5F0E8] bg-[#2A1810] rounded-full py-3 px-6"
          >
            Get it on the App Store
          </a>
          <a
            href={PLAY_STORE_URL}
            className="font-[family-name:var(--font-motive)] text-[13px] text-center tracking-[0.08em] text-[#F5F0E8] bg-[#2A1810] rounded-full py-3 px-6"
          >
            Get it on Google Play
          </a>
        </div>
      </div>

      <nav className="flex justify-center gap-6 pb-8">
        {(
          [
            ["terms", "/terms/"],
            ["privacy", "/privacy/"],
            ["community rules", "/community-rules/"],
            ["support", "/support/"],
          ] as const
        ).map(([label, href]) => (
          <a
            key={href}
            href={href}
            className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] text-[#5E4636] underline underline-offset-2"
          >
            {label}
          </a>
        ))}
      </nav>
    </main>
  );
}
