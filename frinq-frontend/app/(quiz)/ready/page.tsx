import Image from "next/image";
import Header from "@/app/components/Header";
import ContinueBtn from "@/app/components/ContinueBtn";

export default function ReadyPage() {
  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col relative">
      <Header backHref="/age" />

      <main className="flex-1 flex flex-col items-center justify-center px-8 pb-16 text-center relative z-10">
        <div className="animate-fade-up max-w-3xl">
          <h1
            className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[0.96] mb-6"
            style={{ fontSize: "clamp(36px, 7vw, 72px)" }}
          >
            are you ready?
          </h1>
          <div className="w-14 h-px bg-[#2A1810] mx-auto mb-6" />
          <ContinueBtn href="/nahh" />
        </div>
      </main>

      <div className="absolute left-0 bottom-0 w-44 md:w-[260px] pointer-events-none select-none">
        <Image src="/illustrations/ready-duck.png" alt="" width={380} height={480} className="w-full h-auto object-contain object-bottom" style={{ mixBlendMode: "darken" }} />
      </div>
    </div>
  );
}
