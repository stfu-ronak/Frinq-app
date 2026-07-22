import Image from "next/image";
import NavLink from "./NavLink";

interface Props {
  // Kept for API compatibility — no longer rendered. User asked for the
  // section pill ("s1 · who you are" etc) to be removed from every screen.
  section?: string;
  logoVariant?: "text" | "box";
  variant?: "light" | "dark";
  backHref?: string;
}

export default function Header({ variant = "light", backHref }: Props) {
  const bgColor = variant === "dark" ? "#7C1C0B" : "#F5F0E8";
  const inkColor = variant === "dark" ? "#F5F0E8" : "#2A1810";
  const hoverBg = variant === "dark" ? "rgba(245,240,232,0.10)" : "rgba(124,28,11,0.06)";

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-8 py-5"
        style={{ backgroundColor: bgColor }}
      >
        {/* Back on LEFT (mobile convention: back-left, forward-right).
            Inline placement keeps it above the iOS keyboard so it always
            stays tappable. Icon-only with rounded hit area to feel native. */}
        {backHref && (
          <NavLink
            href={backHref}
            aria-label="back"
            className="flex items-center justify-center w-8 h-8 -ml-2 rounded-full no-underline transition-colors"
            style={{ background: "transparent" }}
            // hover via inline style would need :hover pseudo so we use a small className shim:
          >
            <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
              <path d="M19 4H1M1 4L4.5 1M1 4L4.5 7" stroke={inkColor} strokeWidth="1" />
            </svg>
          </NavLink>
        )}

        <NavLink href="/" className="flex items-center no-underline">
          <Image
            src="/fq-logo.png"
            alt="frinq"
            width={38}
            height={38}
            className="w-[38px] h-[38px]"
            priority
          />
        </NavLink>

        {/* Hover style for the back hit area, scoped to keep specificity local */}
        <style>{`
          header > a[aria-label="back"]:hover { background: ${hoverBg}; }
        `}</style>
      </header>
    </>
  );
}
