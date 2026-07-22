"use client";

import { usePathname } from "next/navigation";
import NavLink from "@/app/components/NavLink";

interface Tab {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const TABS: Tab[] = [
  {
    href: "/community",
    label: "community",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="17" cy="9" r="2.4" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M14.5 15c2.5.3 4.5 2.4 4.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "profile",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "settings",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4M17.7 17.7l-1.4-1.4M7.7 7.7L6.3 6.3"
          stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export default function AppTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="main"
      className="fixed bottom-0 left-0 right-0 z-50 flex bg-[#F5F0E8] border-t border-[rgba(42,24,16,0.12)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        return (
          <NavLink
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            aria-label={tab.label}
            className="flex-1 flex flex-col items-center justify-center gap-1 no-underline transition-colors"
            style={{ minHeight: 44, color: active ? "#7C1C0B" : "#8B7355" }}
          >
            {tab.icon}
            <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase">
              {tab.label}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}
