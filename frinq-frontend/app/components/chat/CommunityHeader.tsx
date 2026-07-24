"use client";

import type { ConnectionState } from "@/app/lib/realtime";

const STATE_COPY: Record<ConnectionState, string> = {
  disconnected: "not connected",
  connecting: "connecting…",
  connected: "connected",
  retrying: "reconnecting…",
  offline: "you're offline",
  auth_expired: "session expired — sign in again",
  suspended: "your account is suspended",
  banned: "your account has been banned",
};

function humanize(slug: string): string {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default function CommunityHeader({
  communitySlug, connectionState,
}: {
  communitySlug: string;
  connectionState: ConnectionState;
}) {
  const showBanner = connectionState !== "connected";
  return (
    <header className="px-4 pt-4 pb-2 border-b border-[rgba(42,24,16,0.08)]">
      <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.2em] uppercase text-[#8B7355] mb-0.5">
        your community
      </p>
      <h1 className="font-[family-name:var(--font-things)] text-[#2A1810] text-[22px] leading-tight">
        {humanize(communitySlug)}
      </h1>
      {/* Single aria-live region for connection-state changes only — never
          per-message, per the accessibility requirement that incoming
          messages must not be announced individually. */}
      <p
        aria-live="polite"
        className={showBanner
          ? "font-[family-name:var(--font-motive)] text-[10px] text-[#7C1C0B] mt-1"
          : "sr-only"}
      >
        {STATE_COPY[connectionState]}
      </p>
    </header>
  );
}
