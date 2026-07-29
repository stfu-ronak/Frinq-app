"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/app/lib/adminFetch";
import { useAdminAuth } from "@/app/components/AdminShell";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface CommunityRow {
  archetype_slug: string;
  name: string;
  description: string;
  member_count: number;
  message_count: number;
}

interface MessageAuthor {
  id: string;
  display_name: string | null;
  phone: string | null;
  banned: boolean;
  suspended: boolean;
}

interface MessageRow {
  id: number;
  body: string;
  created_at: string;
  author: MessageAuthor | null;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Full paginated chat browser for one community at a time — the
 *  complement to the "Reports" sub-tab's narrow few-messages-per-report
 *  view. Reuses the same ban/suspend/delete-message endpoints as Reports
 *  (admin.py's suspend_user/ban_user_moderation/delete_message_moderation),
 *  no new moderation logic. */
export function ChatBrowserView({ adminKey, onRequestPassword, onWrongPassword }: {
  adminKey: string;
  onRequestPassword: () => Promise<string | null>;
  onWrongPassword: () => void;
}) {
  const { logout } = useAdminAuth();
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [communitiesError, setCommunitiesError] = useState<string | null>(null);
  const [slug, setSlug] = useState<string>("");

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const [actionBusy, setActionBusy] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Every load bumps this; a response is only applied if it's still the
  // most recent request issued — guards against a slow "load more" on
  // community A landing after the admin has already switched to B/C.
  const requestSeq = useRef(0);

  useEffect(() => {
    queueMicrotask(async () => {
      try {
        const res = await adminFetch(`${API_URL}/api/v1/admin/communities`, {}, { key: adminKey });
        if (res.status === 401) { logout(); return; }
        if (!res.ok) { setCommunitiesError(`error ${res.status}`); return; }
        const data = await res.json();
        setCommunities(data.communities || []);
        if (data.communities?.length) setSlug((prev) => prev || data.communities[0].archetype_slug);
      } catch (e) {
        setCommunitiesError(e instanceof Error ? e.message : "network error");
      }
    });
  }, [adminKey, logout]);

  const loadMessages = useCallback(async (s: string, beforeId?: number) => {
    if (!s) return;
    const seq = ++requestSeq.current;
    if (beforeId === undefined) setLoading(true); else setLoadingMore(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (beforeId !== undefined) params.set("before_id", String(beforeId));
      const res = await adminFetch(`${API_URL}/api/v1/admin/communities/${s}/messages?${params}`, {}, { key: adminKey });
      if (seq !== requestSeq.current) return; // superseded by a newer request
      if (res.status === 401) { logout(); return; }
      if (!res.ok) { setListError(`error ${res.status}`); return; }
      const data = await res.json();
      const batch: MessageRow[] = data.messages || [];
      setMessages((prev) => (beforeId === undefined ? batch : [...prev, ...batch]));
      setHasMore(batch.length === 50);
    } catch (e) {
      if (seq === requestSeq.current) setListError(e instanceof Error ? e.message : "network error");
    } finally {
      if (seq === requestSeq.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [adminKey, logout]);

  const refreshLatest = useCallback(async (s: string) => {
    if (!s || document.visibilityState !== "visible") return;
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/communities/${s}/messages?limit=50`, {}, { key: adminKey });
      if (res.status === 401) { logout(); return; }
      if (!res.ok) return;
      const data = await res.json();
      const batch: MessageRow[] = data.messages || [];
      setMessages((previous) => {
        const byId = new Map<number, MessageRow>();
        [...previous, ...batch].forEach((message) => byId.set(message.id, message));
        return Array.from(byId.values()).sort((a, b) => b.id - a.id);
      });
      setLastSync(new Date());
    } catch {
      // Background sync is best-effort; visible list remains usable.
    }
  }, [adminKey, logout]);

  useEffect(() => {
    if (!slug) return;
    queueMicrotask(() => {
      setMessages([]);
      setHasMore(true);
      loadMessages(slug);
    });
  }, [slug, loadMessages]);

  useEffect(() => {
    if (!slug) return;
    const poll = () => { void refreshLatest(slug); };
    const interval = window.setInterval(poll, 5000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [slug, refreshLatest]);

  async function runAction(path: string, body: Record<string, unknown>, successMsg: string, onOk?: () => void) {
    const pwd = await onRequestPassword();
    if (!pwd) return;
    setActionBusy(true);
    setActionFeedback(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin${path}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
        { key: adminKey, pwd });
      if (res.status === 401) { logout(); return; }
      if (res.status === 403) {
        onWrongPassword();
        setActionFeedback("wrong action password — try again");
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setActionFeedback(`failed: ${d.detail || res.status}`);
        return;
      }
      setActionFeedback(successMsg);
      onOk?.();
    } catch (e) {
      setActionFeedback(e instanceof Error ? e.message : "network error");
    } finally {
      setActionBusy(false);
      setTimeout(() => setActionFeedback(null), 5000);
    }
  }

  function deleteMessage(m: MessageRow) {
    void runAction(`/messages/${m.id}/delete`, { reason: "violates community guidelines" }, "message deleted",
      () => setMessages((prev) => prev.filter((x) => x.id !== m.id)));
  }

  // Patches the author's badge in place across every message currently
  // loaded, rather than refetching — a refetch would collapse any
  // "load more" pages already pulled in back down to just the first 50.
  function patchAuthorFlag(userId: string, patch: Partial<MessageAuthor>) {
    setMessages((prev) => prev.map((x) => (x.author?.id === userId ? { ...x, author: { ...x.author!, ...patch } } : x)));
  }

  function suspendSender(m: MessageRow) {
    if (!m.author) return;
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    void runAction(`/users/${m.author.id}/suspend`, { reason: "repeated violations", until }, "user suspended 7 days",
      () => patchAuthorFlag(m.author!.id, { suspended: true }));
  }

  function banSender(m: MessageRow) {
    if (!m.author) return;
    void runAction(`/users/${m.author.id}/ban`, { reason: "severe or repeated violations" }, "user banned",
      () => patchAuthorFlag(m.author!.id, { banned: true }));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6 items-center" role="group" aria-label="community picker">
        <select value={slug} onChange={(e) => setSlug(e.target.value)}
          aria-label="community"
          className="font-[family-name:var(--font-motive)] text-[11px] px-2 py-1.5 border border-[rgba(42,24,16,0.18)] bg-transparent text-[#2A1810]">
          {communities.map((c) => (
            <option key={c.archetype_slug} value={c.archetype_slug}>
              {c.name} ({c.message_count} messages, {c.member_count} members)
            </option>
          ))}
        </select>
        <button onClick={() => loadMessages(slug)} disabled={loading}
          className="font-[family-name:var(--font-motive)] text-[11px] px-2.5 py-1.5 border border-[rgba(42,24,16,0.18)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-40">
          {loading ? "refreshing…" : "refresh"}
        </button>
        {lastSync && <span className="font-[family-name:var(--font-motive)] text-[9px] text-[rgba(42,24,16,0.35)]">live · {lastSync.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
      </div>

      {communitiesError && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B] mb-4">{communitiesError}</p>}
      {listError && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B] mb-4">{listError}</p>}
      {actionFeedback && (
        <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#2A7810] mb-4" role="status">{actionFeedback}</p>
      )}

      <div className="space-y-2">
        {messages.map((m) => (
          <div key={m.id} className="border border-[rgba(42,24,16,0.12)] rounded-md px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px]">
                {m.author?.display_name || m.author?.phone || "unknown"}
              </span>
              {m.author?.banned && <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">banned</span>}
              {m.author?.suspended && <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">suspended</span>}
              <span className="font-[family-name:var(--font-motive)] text-[9px] text-[rgba(42,24,16,0.35)] ml-auto">{fmt(m.created_at)}</span>
            </div>
            <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[13px] mb-2">{m.body}</p>
            <div className="flex flex-wrap gap-2">
              <button disabled={actionBusy} onClick={() => deleteMessage(m)}
                className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] disabled:opacity-40">
                delete message
              </button>
              {m.author && !m.author.suspended && (
                <button disabled={actionBusy} onClick={() => suspendSender(m)}
                  className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] disabled:opacity-40">
                  suspend sender 7 days
                </button>
              )}
              {m.author && !m.author.banned && (
                <button disabled={actionBusy} onClick={() => banSender(m)}
                  className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(124,28,11,0.5)] text-[#F5F0E8] bg-[#7C1C0B] disabled:opacity-40">
                  ban sender
                </button>
              )}
            </div>
          </div>
        ))}
        {!loading && messages.length === 0 && (
          <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#8B7355]">no messages in this community yet.</p>
        )}
      </div>

      {hasMore && messages.length > 0 && (
        <div className="mt-6 text-center">
          <button disabled={loadingMore} onClick={() => loadMessages(slug, messages[messages.length - 1].id)}
            className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(42,24,16,0.18)] text-[#8B7355] hover:text-[#2A1810] disabled:opacity-40">
            {loadingMore ? "loading…" : "load more"}
          </button>
        </div>
      )}
    </div>
  );
}
