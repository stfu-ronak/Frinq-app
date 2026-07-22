import Image from "next/image";
import NavLink from "@/app/components/NavLink";
import ContinueBtn from "@/app/components/ContinueBtn";

export default function PreferencesIntroPage() {
  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col relative">
      <header className="flex items-center justify-between px-8 py-5 flex-shrink-0">
        <NavLink href="/" className="no-underline inline-block">
          <Image src="/fq-logo.png" alt="frinq" width={38} height={38} className="w-[38px] h-[38px]" />
        </NavLink>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 pb-16 text-center">
        <div className="animate-fade-up max-w-3xl">
          <h1
            className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[0.96] mb-6"
            style={{ fontSize: "clamp(30px, 6vw, 60px)" }}
          >
            four quick questions about how you actually move through the world.
          </h1>
          <div className="w-14 h-px bg-[#2A1810] mx-auto mb-5" />
          <p
            className="font-[family-name:var(--font-things)] text-[#2A1810] mb-8"
            style={{ fontSize: "clamp(14px, 2vw, 17px)" }}
          >
            use the slider. no wrong answers.
          </p>
          <ContinueBtn href="/preferences" />
        </div>
      </main>

      <NavLink
        href="/opinions"
        className="fixed bottom-8 left-8 flex items-center gap-2 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] no-underline hover:text-[#7C1C0B] transition-colors z-50"
      >
        <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
          <path d="M19 4H1M1 4L4.5 1M1 4L4.5 7" stroke="currentColor" strokeWidth="1" />
        </svg>
        back
      </NavLink>
    </div>
  );
}
