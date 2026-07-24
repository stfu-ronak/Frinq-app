export const metadata = { title: "privacy policy — frinq" };

export default function PrivacyPage() {
  return (
    <div className="px-8 py-14 max-w-2xl mx-auto">
      <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.2em] uppercase text-[#7C1C0B] mb-4">
        draft — not reviewed by counsel
      </p>
      <h1 className="font-[family-name:var(--font-things)] text-[#2A1810] text-[28px] mb-6">
        privacy policy
      </h1>
      <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] leading-relaxed mb-4">
        this is placeholder text. frinq&apos;s real Privacy Policy — including what
        data is collected, how long it&apos;s retained, who processes it, and how to
        delete your account — will be written and reviewed by counsel before this
        app is available to the public. nothing on this page should be relied on
        as a legal document.
      </p>
      <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] leading-relaxed mb-4">
        you can delete your account and its data at any time — see{" "}
        <a href="/delete-account/" className="underline underline-offset-2">
          account deletion
        </a>.
      </p>
      <h2 className="font-[family-name:var(--font-things)] text-[#2A1810] text-[18px] mt-8 mb-3">
        what we collect
      </h2>
      <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[13px] mb-4">
        draft data inventory — pending full legal/product review, not a final compliance document.
      </p>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-left font-[family-name:var(--font-things)] text-[13px] text-[#2A1810]">
          <thead>
            <tr className="text-[#8B7355]">
              <th className="pr-4 pb-2">field</th>
              <th className="pr-4 pb-2">purpose</th>
              <th className="pr-4 pb-2">processor</th>
              <th className="pr-4 pb-2">retention</th>
              <th className="pb-2">on deletion</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["phone number", "login, OTP verification", "frinq + Twilio", "until account deletion", "deleted"],
              ["quiz answers", "generate your vibe result & matching", "frinq + AI provider", "until account deletion", "deleted"],
              ["display name", "shown to other members in chat", "frinq", "until account deletion", "deleted"],
              ["chat messages", "community conversation", "frinq", "until account deletion", "kept, unlinked from you"],
              ["reports/moderation actions", "trust & safety", "frinq", "until account deletion", "kept, unlinked from you"],
              ["anonymous usage events (opt-in)", "product analytics", "frinq", "indefinite", "kept, never linked to your account (collected with no phone or identifier attached)"],
            ].map((row) => (
              <tr key={row[0]} className="border-t border-[rgba(42,24,16,0.08)]">
                {row.map((cell, i) => (
                  <td key={i} className="pr-4 py-2 align-top">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[13px]">
        version: draft-1
      </p>
    </div>
  );
}
