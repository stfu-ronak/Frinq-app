"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/app/lib/analytics";

declare global {
  interface Window {
    // Legacy generic click tracker — intentionally never assigned anymore.
    // Old call sites (window.frinqTrack?.(...)) across the quiz flow sent
    // free-text quiz answers/choices as `data`, which isn't allowed in the
    // new event allowlist (see app/lib/analytics.ts). Left as a no-op type
    // rather than touching every one of those call sites.
    frinqTrack?: (label: string, metadata?: Record<string, unknown>) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

export default function Tracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    track("screen_view");
  }, [pathname]);

  return null;
}
