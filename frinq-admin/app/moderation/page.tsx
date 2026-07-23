"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, loadAdminKey, saveAdminKey, clearAdminKey } from "@/app/lib/adminFetch";
import PasswordModal from "@/app/components/PasswordModal";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type ReportStatus = "open" | "resolved" | "dismissed";
type Age = "all" | "24h" | "7d";

interface ReportRow {
  id: string;
  message_id: number;
  reporter_user_id: string | null;
  reason: string;
  details: string | null;
  status: ReportStatus;
  created_at: string;
  community_slug: string;
  author_id: string | null;
}

interface ReportDetail {
  id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  reporter_user_id: string | null;
  message: {
    id: number;
    body: string;
    created_at: string;
    author: { id: string; display_name: string | null } | null;
  };
  context: { id: number; user_id: string | null; body: string; created_at: string }[];
  prior_action_count: number;
}

const REASONS = [
  "spam", "harassment", "hate", "sexual", "self_harm", "violence", "impersonation", "privacy", "other",
] as const;

function withinAge(createdAt: string, age: Age): boolean {
  if (age === "all") return true;
  const ms = Date.parse(createdAt);
  const hours = age === "24h" ? 24 : 24 * 7;
  return Date.now() - ms <= hours * 60 * 60 * 1000;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function ModerationPage() {
  const [adminKey, setAdminKey] = useState(() => loadAdminKey());
  const [keyInput, setKeyInput] = useState("");
  const [loginError, setLoginError] = useState("");

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReportStatus>("open");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [ageFilter, setAgeFilter] = useState<Age>("all");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [actionPassword, setActionPassword] = useState("");
  const [pwdModal, setPwdModal] = useState<{ resolve: (p: string | null) => void } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const requestPassword = useCallback((): Promise<string | null> => {
    if (actionPassword) return Promise.resolve(actionPassword);
    return new Promise<string | null>((resolve) => setPwdModal({ resolve }));
  }, [actionPassword]);

  const load = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ status: statusFilter });
      if (categoryFilter) params.set("reason", categoryFilter);
      const res = await adminFetch(`${API_URL}/api/v1/admin/reports?${params}`, {}, { key: adminKey });
      if (res.status === 401) { clearAdminKey(); setAdminKey(""); return; }
      if (!res.ok) { setListError(`error ${res.status}`); return; }
      const data = await res.json();
      setReports(data.reports || []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "network error");
    } finally {
      setLoading(false);
    }
  }, [adminKey, statusFilter, categoryFilter]);

  useEffect(() => {
    if (!adminKey) return;
    // Deferred a tick so load()'s own setState calls aren't synchronous
    // effect-body updates — same pattern used throughout this codebase.
    queueMicrotask(() => { load(); });
  }, [adminKey, load]);

  async function openDetail(reportId: string) {
    if (expandedId === reportId) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(reportId);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/reports/${reportId}`, {}, { key: adminKey });
      if (res.ok) setDetail(await res.json());
    } finally {
      setDetailLoading(false);
    }
  }

  async function runAction(path: string, body: Record<string, unknown>, successMsg: string) {
    const pwd = await requestPassword();
    if (!pwd) return;
    setActionBusy(true);
    setActionFeedback(null);
    try {
      const res = await adminFetch(
        `${API_URL}/api/v1/admin${path}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
        { key: adminKey, pwd },
      );
      if (res.status === 403) {
        setActionPassword("");
        setActionFeedback("wrong action password — try again");
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setActionFeedback(`failed: ${d.detail || res.status}`);
        return;
      }
      setActionPassword(pwd);
      setActionFeedback(successMsg);
      setExpandedId(null);
      setDetail(null);
      await load();
    } catch (e) {
      setActionFeedback(e instanceof Error ? e.message : "network error");
    } finally {
      setActionBusy(false);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  }

  const visibleReports = reports.filter((r) => withinAge(r.created_at, ageFilter));

  if (!adminKey) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#F5F0E8", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ maxWidth: 360, width: "100%" }}>
          <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-2xl mb-1">moderation queue</p>
          <p className="font-[family-name:var(--font-motive)] text-[#8B7355] text-[11px] tracking-[0.1em] mb-8">enter your admin key to continue</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!keyInput.trim()) return;
              saveAdminKey(keyInput.trim());
              setAdminKey(keyInput.trim());
              setLoginError("");
            }}
            className="flex flex-col gap-4"
          >
            <input type="password" className="frinq-input" placeholder="admin key" value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)} autoFocus />
            {loginError && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B]">{loginError}</p>}
            <button type="submit"
              className="inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors">
              enter
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, overflowY: "auto", overflowX: "hidden", background: "#F5F0E8" }}>
      <header className="border-b border-[rgba(42,24,16,0.1)] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#F5F0E8] z-20">
        <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-lg">moderation queue</span>
        <button onClick={() => { clearAdminKey(); setAdminKey(""); }}
          className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] px-2.5 py-1 border border-[rgba(42,24,16,0.18)] text-[#8B7355] hover:text-[#2A1810] transition-colors">
          sign out
        </button>
      </header>

      <main className="px-6 py-6 max-w-3xl mx-auto">
        <div className="flex flex-wrap gap-3 mb-6" role="group" aria-label="filters">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ReportStatus)}
            aria-label="status filter"
            className="font-[family-name:var(--font-motive)] text-[11px] px-2 py-1.5 border border-[rgba(42,24,16,0.18)] bg-transparent text-[#2A1810]">
            <option value="open">open</option>
            <option value="resolved">resolved</option>
            <option value="dismissed">dismissed</option>
          </select>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="category filter"
            className="font-[family-name:var(--font-motive)] text-[11px] px-2 py-1.5 border border-[rgba(42,24,16,0.18)] bg-transparent text-[#2A1810]">
            <option value="">all categories</option>
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={ageFilter} onChange={(e) => setAgeFilter(e.target.value as Age)}
            aria-label="age filter"
            className="font-[family-name:var(--font-motive)] text-[11px] px-2 py-1.5 border border-[rgba(42,24,16,0.18)] bg-transparent text-[#2A1810]">
            <option value="all">any age</option>
            <option value="24h">last 24h</option>
            <option value="7d">last 7 days</option>
          </select>
          <button onClick={load} disabled={loading}
            className="font-[family-name:var(--font-motive)] text-[11px] px-2.5 py-1.5 border border-[rgba(42,24,16,0.18)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-40">
            {loading ? "refreshing…" : "refresh"}
          </button>
        </div>

        {actionFeedback && (
          <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#2A7810] mb-4" role="status">{actionFeedback}</p>
        )}
        {listError && (
          <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B] mb-4" role="alert">{listError}</p>
        )}

        {visibleReports.length === 0 && !loading && (
          <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[14px]">no reports match these filters.</p>
        )}

        <div className="flex flex-col gap-2">
          {visibleReports.map((r) => (
            <div key={r.id} className="border border-[rgba(42,24,16,0.1)] bg-white/50">
              <button
                onClick={() => openDetail(r.id)}
                aria-expanded={expandedId === r.id}
                className="w-full text-left px-4 py-3 flex items-center justify-between gap-3"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#7C1C0B]">{r.reason}</span>
                  <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[13px]">{r.community_slug} · {fmt(r.created_at)}</span>
                </span>
                <span className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355]">{expandedId === r.id ? "▲" : "▼"}</span>
              </button>

              {expandedId === r.id && (
                <div className="border-t border-[rgba(42,24,16,0.08)] px-4 py-4">
                  {detailLoading && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#8B7355]">loading…</p>}
                  {detail && (
                    <div className="flex flex-col gap-4">
                      {r.details && (
                        <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[13px]">
                          <span className="text-[#8B7355]">reporter note: </span>{r.details}
                        </p>
                      )}
                      <div className="bg-white/70 border border-[rgba(42,24,16,0.1)] p-3">
                        <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355] mb-1">
                          reported message · {detail.message.author?.display_name || "unknown"}
                        </p>
                        <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[14px]">{detail.message.body}</p>
                        <p className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355] mt-1">{fmt(detail.message.created_at)}</p>
                      </div>

                      {detail.context.length > 1 && (
                        <div>
                          <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] uppercase text-[#8B7355] mb-2">nearby messages, same community</p>
                          <div className="flex flex-col gap-1.5">
                            {detail.context.map((c) => (
                              <p key={c.id} className="font-[family-name:var(--font-things)] text-[12px]"
                                style={{ color: c.id === detail.message.id ? "#7C1C0B" : "#2A1810" }}>
                                {c.body}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="font-[family-name:var(--font-motive)] text-[10px] text-[#8B7355]">
                        prior moderation actions against this user: {detail.prior_action_count}
                      </p>

                      {r.status === "open" && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => runAction(`/reports/${r.id}/resolve`, { reason: "reviewed, no action needed" }, "resolved")}
                            disabled={actionBusy}
                            className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(42,24,16,0.15)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-40">
                            resolve, no action
                          </button>
                          <button
                            onClick={() => runAction(`/messages/${detail.message.id}/delete`, { reason: "violates guidelines", report_id: r.id }, "message deleted")}
                            disabled={actionBusy}
                            className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] disabled:opacity-40">
                            delete message
                          </button>
                          <button
                            onClick={() => {
                              const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                              if (!detail.message.author) return;
                              void runAction(`/users/${detail.message.author.id}/suspend`, { reason: "repeated violations", until, report_id: r.id }, "user suspended 7 days");
                            }}
                            disabled={actionBusy || !detail.message.author}
                            className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] disabled:opacity-40">
                            suspend 7 days
                          </button>
                          <button
                            onClick={() => {
                              if (!detail.message.author) return;
                              void runAction(`/users/${detail.message.author.id}/ban`, { reason: "severe or repeated violations", report_id: r.id }, "user banned");
                            }}
                            disabled={actionBusy || !detail.message.author}
                            className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(124,28,11,0.5)] text-[#F5F0E8] bg-[#7C1C0B] disabled:opacity-40">
                            permanent ban
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      <PasswordModal
        open={!!pwdModal}
        onSubmit={(p) => { setActionPassword(p); pwdModal?.resolve(p); setPwdModal(null); }}
        onCancel={() => { pwdModal?.resolve(null); setPwdModal(null); }}
      />
    </div>
  );
}
