"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getIdentity } from "@/app/lib/identity";

declare global {
  interface Window {
    frinqTrack?: (label: string, metadata?: Record<string, unknown>) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

function getSession(): string {
  let s = sessionStorage.getItem("frinq_session");
  if (!s) {
    s = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("frinq_session", s);
  }
  return s;
}

function sendTrack(payload: Record<string, unknown>) {
  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

export default function Tracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  const clarityTagged = useRef(false);

  // Expose global click tracker
  useEffect(() => {
    window.frinqTrack = (label: string, metadata?: Record<string, unknown>) => {
      try {
        const session = getSession();
        const identity = getIdentity();
        sendTrack({
          session,
          page: window.location.pathname,
          action: "click",
          element: label,
          identity,
          data: metadata,
        });
      } catch {}
    };
    return () => { window.frinqTrack = undefined; };
  }, []);

  // Page view tracking + Clarity identity
  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    try {
      const session = getSession();
      const identity = getIdentity();

      sendTrack({ session, page: pathname, action: "view", identity });

      // Tag Clarity once per session when phone is known
      if (!clarityTagged.current && identity.phone && window.clarity) {
        window.clarity("set", "phone", identity.phone);
        window.clarity("identify", identity.phone);
        clarityTagged.current = true;
      }
    } catch {}
  }, [pathname]);

  return null;
}
