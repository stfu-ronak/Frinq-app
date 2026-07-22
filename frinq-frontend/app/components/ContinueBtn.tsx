"use client";

import { usePathname } from "next/navigation";
import NavLink from "./NavLink";

export default function ContinueBtn({ href, label = "tap to continue" }: { href: string; label?: string }) {
  const pathname = usePathname();
  return (
    <NavLink
      href={href}
      onClick={() => { window.frinqTrack?.("continue", { page: pathname }); }}
      className="inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] no-underline transition-all group px-4 py-2 rounded-full border border-transparent hover:bg-black/5 hover:border-black/10 hover:-translate-y-[1px]"
    >
      {label}
      <svg width="28" height="8" viewBox="0 0 28 8" fill="none" className="transition-transform group-hover:translate-x-1">
        <path d="M0 4H26M26 4L22.5 1M26 4L22.5 7" stroke="currentColor" strokeWidth="1" />
      </svg>
    </NavLink>
  );
}
