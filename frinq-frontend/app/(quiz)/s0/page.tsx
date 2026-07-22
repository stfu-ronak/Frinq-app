import Image from "next/image";
import Link from "next/link";
import Header from "@/app/components/Header";
import ContinueBtn from "@/app/components/ContinueBtn";

export default function S0Page() {
  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col relative">
      <Header backHref="/" />

      <main className="flex-1 flex flex-col items-center justify-center px-8 pb-16 text-center relative z-10">
        <div className="animate-fade-up max-w-3xl">
          <h1
            className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.06] mb-6"
            style={{ fontSize: "clamp(32px, 7vw, 64px)" }}
          >
            let&apos;s get to know you.
          </h1>
          <div className="w-14 h-px bg-[#2A1810] mx-auto mb-4" />
          <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] mb-8">
            a few questions. no right answers.
          </p>
          <ContinueBtn href="/name" />
        </div>
      </main>

      <div className="absolute bottom-0 right-0 w-40 md:w-[260px] pointer-events-none select-none">
        <Image src="/illustrations/s0-car.png" alt="" width={520} height={340} className="w-full h-auto object-contain object-bottom" style={{ mixBlendMode: "darken" }} />
      </div>

      <Link
        href="/"
        className="fixed bottom-8 left-8 flex items-center gap-2 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors z-50 no-underline"
      >
        <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
          <path d="M19 4H1M1 4L4.5 1M1 4L4.5 7" stroke="currentColor" strokeWidth="1" />
        </svg>
        back
      </Link>
    </div>
  );
}
