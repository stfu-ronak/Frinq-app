"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/app/lib/adminFetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface AccountRow {
  id: string;
  phone: string | null;
  display_name: string | null;
  onboarding_state: string;
  banned: boolean;
  banned_reason: string | null;
  suspended_until: string | null;
  created_at: string | null;
  last_seen_at: string | null;
}

interface AccountDetail extends AccountRow {
  gender: string | null;
  age: number | null;
  banned_at: string | null;
  updated_at: string | null;
  active_sessions: number;
  submission_count: number;
  moderation_action_count: number;
}

type StatusFilter = "all" | "active" | "banned" | "suspended";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function isSuspended(u: { suspended_until: string | null }): boolean {
  return !!u.suspended_until && new Date(u.suspended_until) > new Date();
}

function statusBadge(u: AccountRow) {
  if (u.banned) return <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">banned</span>;
  if (isSuspended(u)) return <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">suspended</span>;
  return <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">active</span>;
}

/** Real accounts (the `users` table — bans/sessions/onboarding_state), not
 *  quiz submissions. Ban/suspend/unban/unsuspend/force-logout all already
 *  existed on the backend (admin.py:1726-1980) with no admin screen calling
 *  them — this is that wiring. */
export function AccountsView({ adminKey, onRequestPassword, onWrongPassword }: {
  adminKey: string;
  onRequestPassword: () => Promise<string | null>;
  onWrongPassword: () => void;
}) {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Guards async responses below against a stale overwrite — e.g. clicking
  // account A, then B before A's detail fetch resolves must not let A's
  // late response blank out B's panel.
  const expandedIdRef = useRef<string | null>(null);
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [suspendDays, setSuspendDays] = useState("7");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
      if (q.trim()) params.set("q", q.trim());
      if (status !== "all") params.set("status", status);
      const res = await adminFetch(`${API_URL}/api/v1/admin/users?${params}`, {}, { key: adminKey });
      if (!res.ok) { setListError(`error ${res.status}`); return; }
      const data = await res.json();
      setRows(data.users || []);
      setTotal(data.total || 0);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "network error");
    } finally {
      setLoading(false);
    }
  }, [adminKey, q, status, offset]);

  useEffect(() => {
    // Deferred a tick — same pattern as app/moderation/page.tsx's load() effect.
    queueMicrotask(() => { load(); });
  }, [load]);

  const openDetail = useCallback(async (id: string) => {
    if (expandedId === id) { setExpandedId(null); expandedIdRef.current = null; setDetail(null); return; }
    setExpandedId(id);
    expandedIdRef.current = id;
    setDetail(null);
    setReason("");
    setSuspendDays("7");
    setDetailLoading(true);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/users/${id}`, {}, { key: adminKey });
      if (res.ok) {
        const data = await res.json();
        if (expandedIdRef.current === id) setDetail(data);
      }
    } finally {
      if (expandedIdRef.current === id) setDetailLoading(false);
    }
  }, [adminKey, expandedId]);

  function errorDetailToString(d: unknown): string {
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((e) => (e && typeof e === "object" && "msg" in e ? String(e.msg) : JSON.stringify(e))).join("; ");
    if (d && typeof d === "object") return JSON.stringify(d);
    return "unknown error";
  }

  async function runAction(id: string, path: string, body: Record<string, unknown>, successMsg: string) {
    const pwd = await onRequestPassword();
    if (!pwd) return;
    setActionBusy(true);
    setActionFeedback(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin${path}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
        { key: adminKey, pwd });
      if (res.status === 403) {
        onWrongPassword();
        setActionFeedback("wrong action password — try again");
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setActionFeedback(`failed: ${d.detail ? errorDetailToString(d.detail) : res.status}`);
        return;
      }
      setActionFeedback(successMsg);
      setReason("");
      const detailRes = await adminFetch(`${API_URL}/api/v1/admin/users/${id}`, {}, { key: adminKey });
      if (detailRes.ok) {
        const data = await detailRes.json();
        if (expandedIdRef.current === id) setDetail(data);
      }
      await load();
    } catch (e) {
      setActionFeedback(e instanceof Error ? e.message : "network error");
    } finally {
      setActionBusy(false);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  }

  const canAct = reason.trim().length > 0 && !actionBusy;
  const canSuspend = canAct && suspendDays.trim().length > 0 && Number(suspendDays) >= 1;

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6" role="group" aria-label="filters">
        <input
          value={q}
          onChange={(e) => { setOffset(0); setQ(e.target.value); }}
          placeholder="search phone / name / id"
          className="frinq-input flex-1 min-w-[200px]"
        />
        <select value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value as StatusFilter); }}
          aria-label="status filter"
          className="font-[family-name:var(--font-motive)] text-[11px] px-2 py-1.5 border border-[rgba(42,24,16,0.18)] bg-transparent text-[#2A1810]">
          <option value="all">all statuses</option>
          <option value="active">active</option>
          <option value="banned">banned</option>
          <option value="suspended">suspended</option>
        </select>
        <button onClick={load} disabled={loading}
          className="font-[family-name:var(--font-motive)] text-[11px] px-2.5 py-1.5 border border-[rgba(42,24,16,0.18)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-40">
          {loading ? "refreshing…" : "refresh"}
        </button>
      </div>

      {listError && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B] mb-4">{listError}</p>}
      {actionFeedback && (
        <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#2A7810] mb-4" role="status">{actionFeedback}</p>
      )}

      <div className="space-y-2">
        {rows.map((u) => (
          <div key={u.id} className="border border-[rgba(42,24,16,0.12)] rounded-md">
            <button onClick={() => openDetail(u.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[rgba(42,24,16,0.03)]">
              <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[13px] flex-1 truncate">
                {u.display_name || "unnamed"} <span className="text-[#8B7355] text-[11px]">{u.phone}</span>
              </span>
              {statusBadge(u)}
              <span className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355]">{u.onboarding_state}</span>
              <span className="font-[family-name:var(--font-motive)] text-[9px] text-[rgba(42,24,16,0.35)]">{fmt(u.created_at)}</span>
            </button>

            {expandedId === u.id && (
              <div className="px-4 py-3 border-t border-[rgba(42,24,16,0.08)] bg-[rgba(42,24,16,0.02)]">
                {detailLoading && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#8B7355]">loading…</p>}
                {detail && detail.id === u.id && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 font-[family-name:var(--font-motive)] text-[10px] text-[#8B7355]">
                      <span>gender: {detail.gender ?? "—"}</span>
                      <span>age: {detail.age ?? "—"}</span>
                      <span>active sessions: {detail.active_sessions}</span>
                      <span>quiz submissions: {detail.submission_count}</span>
                      <span>moderation actions: {detail.moderation_action_count}</span>
                      <span>last seen: {fmt(detail.last_seen_at)}</span>
                      {detail.banned && <span className="col-span-2 text-[#7C1C0B]">banned: {detail.banned_reason} ({fmt(detail.banned_at)})</span>}
                      {isSuspended(detail) && <span className="col-span-2 text-amber-700">suspended until {fmt(detail.suspended_until)}</span>}
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="reason for this action (required)"
                        className="frinq-input flex-1 min-w-[220px]"
                      />
                      <input
                        type="number"
                        min={1}
                        value={suspendDays}
                        onChange={(e) => setSuspendDays(e.target.value)}
                        aria-label="suspend days"
                        className="frinq-input w-20"
                      />
                      <span className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355]">days</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!detail.banned && (
                        <button disabled={!canAct}
                          onClick={() => runAction(u.id, `/users/${u.id}/ban`, { reason: reason.trim() }, "user banned")}
                          className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(124,28,11,0.5)] text-[#F5F0E8] bg-[#7C1C0B] disabled:opacity-40">
                          ban
                        </button>
                      )}
                      {detail.banned && (
                        <button disabled={!canAct}
                          onClick={() => runAction(u.id, `/users/${u.id}/unban`, { reason: reason.trim() }, "user unbanned")}
                          className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(42,24,16,0.18)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-40">
                          unban
                        </button>
                      )}
                      {!isSuspended(detail) && (
                        <button disabled={!canSuspend}
                          onClick={() => {
                            const until = new Date(Date.now() + Number(suspendDays) * 24 * 60 * 60 * 1000).toISOString();
                            void runAction(u.id, `/users/${u.id}/suspend`, { reason: reason.trim(), until }, `user suspended ${suspendDays} days`);
                          }}
                          className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] disabled:opacity-40">
                          suspend
                        </button>
                      )}
                      {isSuspended(detail) && (
                        <button disabled={!canAct}
                          onClick={() => runAction(u.id, `/users/${u.id}/unsuspend`, { reason: reason.trim() }, "suspension lifted")}
                          className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(42,24,16,0.18)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-40">
                          unsuspend
                        </button>
                      )}
                      <button disabled={!canAct}
                        onClick={() => runAction(u.id, `/users/${u.id}/force-logout`, { reason: reason.trim() }, "sessions revoked")}
                        className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(42,24,16,0.18)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-40">
                        force logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#8B7355]">no accounts match this filter.</p>
        )}
      </div>

      <div className="flex items-center justify-between mt-6 font-[family-name:var(--font-motive)] text-[10px] text-[#8B7355]">
        <span>{total} total</span>
        <div className="flex gap-2">
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            className="px-2.5 py-1 border border-[rgba(42,24,16,0.18)] disabled:opacity-40">prev</button>
          <button disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}
            className="px-2.5 py-1 border border-[rgba(42,24,16,0.18)] disabled:opacity-40">next</button>
        </div>
      </div>
    </div>
  );
}
