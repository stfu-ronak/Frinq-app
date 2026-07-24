"use client";

import { useEffect, useState } from "react";
import { isAnalyticsEnabled, setAnalyticsEnabled } from "@/app/lib/analytics";

export default function PrivacySettingsPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => setEnabled(isAnalyticsEnabled()))();
  }, []);

  function toggle() {
    if (enabled === null) return;
    const next = !enabled;
    setAnalyticsEnabled(next);
    setEnabled(next);
  }

  return (
    <div className="px-8 pt-14">
      <h1
        className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.05] mb-8"
        style={{ fontSize: "clamp(24px, 6vw, 32px)" }}
      >
        privacy
      </h1>

      <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[13px] mb-6">
        anonymous usage analytics (screen views, quiz progress, chat activity) help us fix bugs
        and improve frinq. off by default — never your phone, messages, or quiz answers.
      </p>

      <button
        type="button"
        role="switch"
        aria-checked={enabled ?? false}
        onClick={toggle}
        style={{ minHeight: 44 }}
        className="flex items-center justify-between w-full py-3 border-b border-[rgba(42,24,16,0.08)]"
      >
        <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px]">
          share anonymous usage analytics
        </span>
        <span
          aria-hidden="true"
          className="relative inline-block w-10 h-6 rounded-full transition-colors"
          style={{ background: enabled ? "#7C1C0B" : "rgba(42,24,16,0.15)" }}
        >
          <span
            className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform"
            style={{ transform: enabled ? "translateX(18px)" : "translateX(2px)" }}
          />
        </span>
      </button>
    </div>
  );
}
