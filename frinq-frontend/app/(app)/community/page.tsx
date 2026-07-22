"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/app/lib/api";

type ViewState = "loading" | "ready" | "no-membership" | "offline";

function humanize(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[calc(100dvh-6rem)] flex flex-col items-center justify-center gap-4 px-8 text-center">
      {children}
    </div>
  );
}

export default function CommunityPage() {
  const [state, setState] = useState<ViewState>("loading");
  const [communitySlug, setCommunitySlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await apiFetch("/api/v1/users/me");
      if (!res.ok) {
        setState("offline");
        return;
      }
      const user = await res.json();
      if (user.community_slug) {
        setCommunitySlug(user.community_slug);
        setState("ready");
      } else {
        setState("no-membership");
      }
    } catch {
      setState("offline");
    }
  }, []);

  useEffect(() => {
    // Deferred a tick — matches the pattern in vibe-box/page.tsx — so
    // load()'s setState calls aren't treated as synchronous effect-body
    // updates.
    queueMicrotask(() => { load(); });
  }, [load]);

  if (state === "loading") {
    return (
      <Centered>
        <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[15px]">
          finding your community…
        </p>
      </Centered>
    );
  }

  if (state === "offline") {
    return (
      <Centered>
        <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[16px]">
          couldn&apos;t load your community.
        </p>
        <button
          onClick={load}
          className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.14em] text-[#7C1C0B] underline underline-offset-2"
        >
          retry
        </button>
      </Centered>
    );
  }

  if (state === "no-membership") {
    return (
      <Centered>
        <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[16px]">
          no community assigned yet.
        </p>
        <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[13px]">
          check back soon — we&apos;ll place you once your profile is ready.
        </p>
      </Centered>
    );
  }

  return (
    <div className="px-8 pt-14">
      <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.22em] uppercase text-[#8B7355] mb-2">
        your community
      </p>
      <h1
        className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.05]"
        style={{ fontSize: "clamp(28px, 7vw, 40px)" }}
      >
        {humanize(communitySlug!)}
      </h1>
    </div>
  );
}
