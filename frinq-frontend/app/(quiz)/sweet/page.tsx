import Header from "@/app/components/Header";
import ContinueBtn from "@/app/components/ContinueBtn";

export default function SweetPage() {
  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <Header backHref="/interests" />

      <main className="flex-1 flex flex-col items-center justify-center px-8 pb-16 text-center">
        <div className="animate-fade-up max-w-3xl">
          <h1
            className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[0.96] mb-6"
            style={{ fontSize: "clamp(36px, 7vw, 72px)" }}
          >
            now let&apos;s really get to know you...
          </h1>
          <div className="w-14 h-px bg-[#2A1810] mx-auto mb-6" />
          <ContinueBtn href="/trip" />
        </div>
      </main>
    </div>
  );
}
