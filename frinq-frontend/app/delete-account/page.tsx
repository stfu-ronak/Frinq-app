export const metadata = { title: "delete account — frinq" };

export default function DeleteAccountInfoPage() {
  return (
    <div className="px-8 py-14 max-w-2xl mx-auto">
      <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.2em] uppercase text-[#7C1C0B] mb-4">
        draft — placeholder contact details
      </p>
      <h1 className="font-[family-name:var(--font-things)] text-[#2A1810] text-[28px] mb-6">
        delete your account
      </h1>

      <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] leading-relaxed mb-4">
        you can permanently delete your frinq account and its data at any time. deletion removes
        your profile, quiz answers, and vibe result. your past chat messages stay visible to other
        members but are no longer linked to your name or profile — this can&apos;t be undone.
      </p>

      <h2 className="font-[family-name:var(--font-things)] text-[#2A1810] text-[18px] mb-3">
        in the app
      </h2>
      <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] leading-relaxed mb-6">
        open frinq, go to <strong>settings → delete account</strong>, verify with a code sent to
        your whatsapp number, then type &quot;DELETE&quot; to confirm.
      </p>

      <h2 className="font-[family-name:var(--font-things)] text-[#2A1810] text-[18px] mb-3">
        without the app
      </h2>
      <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] leading-relaxed mb-6">
        email{" "}
        <a href="mailto:support@frinq.in" className="underline underline-offset-2 text-[#7C1C0B]">
          support@frinq.in
        </a>{" "}
        from the address or phone number on your account and ask us to delete it. we&apos;ll
        confirm your identity before deleting.
      </p>

      <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[13px]">
        read our{" "}
        <a href="/terms/" className="underline underline-offset-2">terms</a>{" "}
        or{" "}
        <a href="/privacy/" className="underline underline-offset-2">privacy policy</a>.
      </p>
    </div>
  );
}
