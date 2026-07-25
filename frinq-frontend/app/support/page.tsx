export const metadata = { title: "support — frinq" };

// PLACEHOLDER contact details — replace with the real owner-supplied
// support email/business identity before any real launch.
const SUPPORT_EMAIL = "support@frinq.in";

export default function SupportPage() {
  return (
    <div className="px-8 py-14 max-w-2xl mx-auto">
      <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.2em] uppercase text-[#7C1C0B] mb-4">
        draft — placeholder contact details
      </p>
      <h1 className="font-[family-name:var(--font-things)] text-[#2A1810] text-[28px] mb-6">
        support
      </h1>
      <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] leading-relaxed mb-4">
        need help, have a question, or want to report a problem? reach us at:
      </p>
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="font-[family-name:var(--font-things)] text-[#7C1C0B] text-[16px] underline underline-offset-2 mb-8 inline-block"
      >
        {SUPPORT_EMAIL}
      </a>
      <p className="font-[family-name:var(--font-things)] text-[#5E4636] text-[13px] mb-2">
        want to delete your account? see{" "}
        <a href="/delete-account/" className="underline underline-offset-2">account deletion</a>.
      </p>
      <p className="font-[family-name:var(--font-things)] text-[#5E4636] text-[13px]">
        read our{" "}
        <a href="/terms/" className="underline underline-offset-2">terms</a>,{" "}
        <a href="/privacy/" className="underline underline-offset-2">privacy policy</a>, or{" "}
        <a href="/community-rules/" className="underline underline-offset-2">community rules</a>.
      </p>
    </div>
  );
}
