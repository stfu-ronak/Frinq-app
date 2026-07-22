"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { apiUrl } from "@/app/lib/session";

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

// Straight to the backend — no local Node route, no PII. Never include
// phone/name/dob/quiz content here; Clarity identification (opaque user id
// only) happens once, at login, in verify/page.tsx — not here.
function sendTrack(payload: Record<string, unknown>) {
  fetch(apiUrl("/api/v1/track"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

export default function Tracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  // Expose global click tracker
  useEffect(() => {
    window.frinqTrack = (label: string, metadata?: Record<string, unknown>) => {
      try {
        sendTrack({
          session_id: getSession(),
          page: window.location.pathname,
          action: "click",
          element: label,
          data: metadata,
        });
      } catch {}
    };
    return () => { window.frinqTrack = undefined; };
  }, []);

  // Page view tracking
  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;
    try {
      sendTrack({ session_id: getSession(), page: pathname, action: "view" });
    } catch {}
  }, [pathname]);

  return null;
}
