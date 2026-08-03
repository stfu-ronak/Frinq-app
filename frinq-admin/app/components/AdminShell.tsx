"use client";

import { createContext, Suspense, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { adminFetch, loadAdminKey, saveAdminKey, clearAdminKey, setUnauthorizedHandler } from "@/app/lib/adminFetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// The shell's own nav bar height (see `h-[${NAV_HEIGHT_PX}px]` below) — pages
// with their own sticky sub-headers (app/page.tsx) import this instead of
// duplicating the pixel value, so the two can't silently drift apart.
export const NAV_HEIGHT_PX = 53;

interface AdminAuthValue {
  adminKey: string;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthValue>({ adminKey: "", logout: () => {} });

/** Every admin page reads its key from here instead of keeping its own
 *  sessionStorage-backed copy — there is now exactly one login gate
 *  (below), not one per route. */
export function useAdminAuth(): AdminAuthValue {
  return useContext(AdminAuthContext);
}

// Top-level IA. "Questions"/"Events" are added by later phases (they don't
// exist yet — no dead links in the meantime).
//
// Items whose group spans multiple `?tab=` values carry `group`/`defaultTab`
// so NavLinks can self-link to whichever tab in the group is CURRENT rather
// than always resetting to the group's default — otherwise clicking
// "analytics" while on `?tab=funnel` silently jumps back to `overview`.
const NAV_ITEMS: {
  label: string;
  href: string;
  isActive: (pathname: string, tab: string | null) => boolean;
  group?: string[];
  defaultTab?: string;
}[] = [
  {
    label: "analytics",
    href: "/?tab=overview",
    isActive: (p, t) => p === "/" && (!t || ["overview", "analytics", "insights", "funnel"].includes(t)),
    group: ["overview", "analytics", "insights", "funnel"],
    defaultTab: "overview",
  },
  {
    label: "users",
    href: "/?tab=users",
    isActive: (p, t) => p === "/" && ["users", "testing", "accounts"].includes(t ?? ""),
    group: ["users", "testing", "accounts"],
    defaultTab: "users",
  },
  { label: "community", href: "/moderation", isActive: (p) => p === "/moderation" },
  {
    label: "journey",
    href: "/?tab=journey",
    isActive: (p, t) => p === "/" && t === "journey",
  },
  { label: "events", href: "/events", isActive: (p) => p === "/events" },
  { label: "model config", href: "/model-config", isActive: (p) => p === "/model-config" },
  { label: "questions", href: "/questions", isActive: (p) => p === "/questions" },
];

function NavLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname, tab);
        // Self-link: if we're already on a tab within this item's group,
        // keep linking to that same tab instead of the group's default.
        const href = item.group && tab && item.group.includes(tab) ? `/?tab=${tab}` : item.href;
        return (
          <Link
            key={item.label}
            href={href}
            className={`font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${active ? "text-[#2A1810] border-[#2A1810]" : "text-[#8B7355] border-transparent hover:text-[#2A1810]"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

type AuthStatus = "checking" | "unauthed" | "authed";

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [adminKey, setAdminKeyState] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Returns true (valid), false (genuinely bad key — safe to evict), or
  // null (transient failure — leave any persisted key alone, same
  // distinction the pre-shell per-page login gates already made).
  const verify = useCallback(async (k: string): Promise<boolean | null> => {
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/analytics`, {}, { key: k });
      if (res.status === 401) return false;
      if (!res.ok) return null;
      return true;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    // Deferred a tick so this effect's own setState calls aren't synchronous
    // effect-body updates — same pattern used elsewhere in this codebase
    // (see app/moderation/page.tsx's load() effect).
    queueMicrotask(async () => {
      const stored = loadAdminKey();
      if (!stored) {
        setStatus("unauthed");
        return;
      }
      setKeyInput(stored);
      const ok = await verify(stored);
      if (ok) {
        setAdminKeyState(stored);
        setStatus("authed");
      } else {
        if (ok === false) clearAdminKey();
        setStatus("unauthed");
      }
    });
  }, [verify]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!keyInput.trim()) return;
    setLoggingIn(true);
    setLoginError("");
    const trimmed = keyInput.trim();
    const ok = await verify(trimmed);
    if (ok) {
      saveAdminKey(trimmed);
      setAdminKeyState(trimmed);
      setStatus("authed");
    } else if (ok === false) {
      setLoginError("invalid key");
    } else {
      setLoginError("could not reach backend");
    }
    setLoggingIn(false);
  }

  const logout = useCallback(() => {
    clearAdminKey();
    setAdminKeyState("");
    setKeyInput("");
    setStatus("unauthed");
  }, []);

  // Wired only once authed — the pre-login key-verify probe (`verify`, used
  // by both the initial mount check and the login form) handles its own 401
  // via its return value, and shouldn't also fire this while there's no
  // `logout` state to unwind yet.
  useEffect(() => {
    if (status !== "authed") return;
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [status, logout]);

  if (status === "checking") return null;

  if (status !== "authed") {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#F5F0E8", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ maxWidth: 360, width: "100%" }}>
          <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-2xl mb-1">frinq admin</p>
          <p className="font-[family-name:var(--font-motive)] text-[#8B7355] text-[11px] tracking-[0.1em] mb-8">enter your admin key to continue</p>
          <form onSubmit={login} className="flex flex-col gap-4">
            <input type="password" className="frinq-input" placeholder="admin key" value={keyInput} onChange={e => setKeyInput(e.target.value)} autoFocus />
            {loginError && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B]">{loginError}</p>}
            <button type="submit" disabled={loggingIn}
              className="inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors group disabled:opacity-40">
              {loggingIn ? "connecting..." : "enter"}
              {!loggingIn && <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="transition-transform group-hover:translate-x-1"><path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" /></svg>}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <AdminAuthContext.Provider value={{ adminKey, logout }}>
      <div style={{ minHeight: "100dvh", background: "#F5F0E8" }}>
        {/* Tailwind's JIT scanner needs a literal class string — it can't see
            through a template-literal interpolation of NAV_HEIGHT_PX, so the
            height is set via inline style instead; NAV_HEIGHT_PX stays the
            single source of truth for both this and page.tsx's offset. */}
        <div
          style={{ height: NAV_HEIGHT_PX }}
          className="border-b border-[rgba(42,24,16,0.1)] px-6 flex items-center justify-between sticky top-0 bg-[#F5F0E8] z-30"
        >
          <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-lg">frinq admin</span>
          <div className="flex gap-0 overflow-x-auto">
            <Suspense fallback={null}>
              <NavLinks />
            </Suspense>
          </div>
          <button
            onClick={logout}
            className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] px-2.5 py-1 border border-[rgba(42,24,16,0.18)] text-[#8B7355] hover:text-[#2A1810] transition-colors"
          >
            sign out
          </button>
        </div>
        {children}
      </div>
    </AdminAuthContext.Provider>
  );
}
