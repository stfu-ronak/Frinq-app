export const metadata = { title: "community rules — frinq" };

export default function CommunityRulesPage() {
  return (
    <div className="px-8 py-14 max-w-2xl mx-auto">
      <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.2em] uppercase text-[#7C1C0B] mb-4">
        draft — not reviewed by counsel
      </p>
      <h1 className="font-[family-name:var(--font-things)] text-[#2A1810] text-[28px] mb-6">
        community rules
      </h1>
      <ul className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] leading-relaxed mb-4 flex flex-col gap-2 list-disc pl-5">
        <li>be kind — this is a small, text-only space for real conversation.</li>
        <li>no spam, harassment, hate speech, or sexual content.</li>
        <li>no impersonation of other members, moderators, or the frinq team.</li>
        <li>report anything that concerns you — reports are reviewed by a real person.</li>
      </ul>
      <p className="font-[family-name:var(--font-things)] text-[#5E4636] text-[13px] mb-4">
        this is placeholder text pending full legal/product review.
      </p>
      <p className="font-[family-name:var(--font-things)] text-[#5E4636] text-[13px]">
        version: draft-1
      </p>
    </div>
  );
}
