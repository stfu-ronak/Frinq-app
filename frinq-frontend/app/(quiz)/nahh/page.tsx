import Header from "@/app/components/Header";
import ContinueBtn from "@/app/components/ContinueBtn";

export default function NahhPage() {
  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <Header backHref="/ready" />

      <main className="flex-1 flex flex-col items-center justify-center px-8 pb-16 text-center">
        <div className="animate-fade-up max-w-3xl">
          <h1
            className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[0.96] mb-6"
            style={{ fontSize: "clamp(32px, 6vw, 64px)" }}
          >
            we want to understand the real you. let&apos;s dive in.
          </h1>
          <div className="w-14 h-px bg-[#2A1810] mx-auto mb-5" />
          <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] mb-8">
            let&apos;s begin.
          </p>
          <ContinueBtn href="/social-type" />
        </div>
      </main>
    </div>
  );
}
