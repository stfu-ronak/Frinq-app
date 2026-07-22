import Image from "next/image";
import NavLink from "@/app/components/NavLink";

export default function DonePage() {
  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col relative">
      <header className="flex items-center justify-between px-8 py-5 flex-shrink-0">
        <NavLink href="/" className="no-underline inline-block">
          <Image src="/fq-logo.png" alt="frinq" width={38} height={38} className="w-[38px] h-[38px]" />
        </NavLink>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 pb-4 text-center">
        <div className="animate-fade-up max-w-xl">
          <p className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.2em] text-[#8B7355] mb-4">
            that&apos;s a wrap.
          </p>
          <h1
            className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.05] mb-6"
            style={{ fontSize: "clamp(30px, 6vw, 56px)" }}
          >
            you did the thing.<br />we&apos;ll take it from here.
          </h1>
          <div className="w-12 h-px bg-[#2A1810] mx-auto mb-4" />
          <p
            className="font-[family-name:var(--font-things)] text-[#2A1810] mb-8"
            style={{ fontSize: "clamp(13px, 2vw, 16px)" }}
          >
            your frinq is out there. probably overthinking too.
          </p>
          <NavLink
            href="/"
            className="inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] no-underline hover:text-[#7C1C0B] transition-colors group"
          >
            start over
            <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="transition-transform group-hover:translate-x-1">
              <path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" />
            </svg>
          </NavLink>
        </div>
      </main>

      <div className="absolute bottom-0 right-0 w-32 md:w-48 pointer-events-none select-none">
        <Image src="/illustrations/done-ducks.png" alt="" width={400} height={380} className="w-full h-auto object-contain object-bottom" />
      </div>
    </div>
  );
}
