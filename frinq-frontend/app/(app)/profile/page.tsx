"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/app/lib/api";

interface Profile {
  display_name: string | null;
  phone: string | null;
  gender: string | null;
  age: number | null;
  ncr_zone: string | null;
  community_slug: string | null;
}

function maskPhone(phone: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "").slice(-10);
  if (digits.length < 10) return "—";
  return `+91 ${digits.slice(0, 2)}**** **${digits.slice(-2)}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 border-b border-[rgba(42,24,16,0.08)]">
      <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.16em] uppercase text-[#8B7355]">
        {label}
      </span>
      <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px]">
        {value}
      </span>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/v1/users/me");
        if (!res.ok) { if (!cancelled) setError(true); return; }
        const data = await res.json();
        if (!cancelled) setProfile(data);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="px-8 pt-14">
        <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px]">
          couldn&apos;t load your profile.
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="px-8 pt-14">
        <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[15px]">loading…</p>
      </div>
    );
  }

  return (
    <div className="px-8 pt-14">
      <h1
        className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.05] mb-8"
        style={{ fontSize: "clamp(24px, 6vw, 32px)" }}
      >
        {profile.display_name || "your profile"}
      </h1>
      <div>
        <Row label="phone" value={maskPhone(profile.phone)} />
        <Row label="gender" value={profile.gender || "—"} />
        <Row label="age" value={profile.age ? String(profile.age) : "—"} />
        <Row label="area" value={profile.ncr_zone ? profile.ncr_zone.replace(/_/g, " ") : "—"} />
        <Row label="community" value={profile.community_slug ? profile.community_slug.replace(/-/g, " ") : "—"} />
      </div>
    </div>
  );
}
