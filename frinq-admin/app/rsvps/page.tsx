"use client";

import { useState, useEffect, useCallback } from "react";
import { adminFetch } from "@/app/lib/adminFetch";
import { useAdminAuth } from "@/app/components/AdminShell";
import PasswordModal from "@/app/components/PasswordModal";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

type Responder = { phone: string; name: string; status: string; at: string | null };
type Message = {
  phone: string; name: string; body: string | null;
  button_text: string | null; choice: string | null; at: string | null;
};
type Inbox = {
  counts: Record<string, number>;
  responders: Responder[];
  messages: Message[];
  total_responded: number;
  total_messages: number;
};
type ThreadMsg = {
  direction: "in" | "out"; body: string;
  status: string | null; error_code: number | null; at: string | null;
};
type Recipient = {
  phone: string; name: string; delivery: string | null; read: boolean;
  responded: boolean; rsvp: string | null; errors: string[]; last: string | null;
};
type Campaign = {
  funnel: { audience: number; delivered: number; read: number; responded: number; failed: number };
  delivered_no_reply: number; read_no_reply: number; messages_received: number;
  error_breakdown: Record<string, number>; rsvp_counts: Record<string, number>;
  recipients: Recipient[]; error?: string | null;
};

const ERR_LABEL: Record<string, string> = {
  "63049": "Marketing cap (resets ~24h)",
  "63016": "Outside 24h window",
  "63021": "Blocked / invalid number",
  "63032": "Not on WhatsApp / undeliverable",
  "63024": "Invalid message",
  "30008": "Unknown delivery error",
};

function deliveryBadge(d: string | null): { label: string; cls: string } {
  if (d === "read") return { label: "Read", cls: "bg-sky-100 text-sky-800 border-sky-200" };
  if (d === "delivered") return { label: "Delivered", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  if (d === "sent" || d === "queued" || d === "sending") return { label: "Sent", cls: "bg-stone-100 text-stone-600 border-stone-200" };
  if (d === "undelivered" || d === "failed") return { label: "Failed", cls: "bg-rose-100 text-rose-800 border-rose-200" };
  return { label: d || "—", cls: "bg-stone-100 text-stone-500 border-stone-200" };
}

type Stat = { label: string; emoji: string; cls: string };
const STATUS: Record<string, Stat> = {
  rsvp_yes: { label: "Attending", emoji: "✅", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  rsvp_no: { label: "Can’t make it", emoji: "❌", cls: "bg-rose-100 text-rose-800 border-rose-200" },
  rsvp_info: { label: "Needs info", emoji: "🤔", cls: "bg-amber-100 text-amber-800 border-amber-200" },
};

function statusOf(s: string | null): Stat | null {
  return s ? STATUS[s] ?? null : null;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function RsvpDashboard() {
  const { adminKey, logout } = useAdminAuth();
  const [data, setData] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [tab, setTab] = useState<"campaign" | "responders" | "messages">("campaign");

  // campaign / delivery analytics
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campFilter, setCampFilter] = useState<string>("all");

  // 1:1 chat panel
  const [chatWith, setChatWith] = useState<{ phone: string; name: string } | null>(null);
  const [thread, setThread] = useState<ThreadMsg[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [chatNote, setChatNote] = useState<string | null>(null);
  // Cached for this tab's session once entered correctly — sendReply is
  // now action-password-gated on the backend (Task 16 hardening).
  const [actionPassword, setActionPassword] = useState("");
  // Masked modal instead of window.prompt (which shows the password in
  // cleartext and is blocked in some hardened/embedded browsers) — same
  // pattern as the main dashboard + moderation views.
  const [pwdModal, setPwdModal] = useState<{ resolve: (p: string | null) => void } | null>(null);

  const requestPassword = useCallback((): Promise<string | null> => {
    if (actionPassword) return Promise.resolve(actionPassword);
    return new Promise<string | null>((resolve) => setPwdModal({ resolve }));
  }, [actionPassword]);

  const load = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/whatsapp/inbox`,
        { cache: "no-store" }, { key: adminKey });
      if (res.status === 401) { logout(); setData(null); return; }
      if (!res.ok) { setError(`Error ${res.status}`); return; }
      const json = (await res.json()) as Inbox & { error?: string | null };
      setData(json);
      setError(json.error ? `Server: ${json.error}` : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "network error");
    } finally {
      setLoading(false);
    }
  }, [adminKey, logout]);

  const loadCampaign = useCallback(async () => {
    if (!adminKey) return;
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/whatsapp/campaign`,
        { cache: "no-store" }, { key: adminKey });
      if (res.ok) setCampaign((await res.json()) as Campaign);
    } catch { /* keep last */ }
  }, [adminKey]);

  useEffect(() => {
    if (!adminKey) return;
    // Deferred a tick (not called directly in the effect body) so the
    // setLoading(true)/setError(null) at the top of load() don't run
    // synchronously as part of the effect itself — same reason the
    // interval's calls below were already fine.
    queueMicrotask(() => { load(); loadCampaign(); });
    const t = setInterval(() => { load(); loadCampaign(); }, 20000); // auto-refresh
    return () => clearInterval(t);
  }, [adminKey, load, loadCampaign]);

  function exportCsv() {
    const rows = campaign?.recipients ?? [];
    const head = ["name", "phone", "delivery", "read", "responded", "rsvp", "errors", "last_activity"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = rows.map((r) => [
      r.name, r.phone, r.delivery ?? "", r.read ? "yes" : "no",
      r.responded ? "yes" : "no", r.rsvp ?? "", r.errors.join("|"), r.last ?? "",
    ].map(esc).join(","));
    const csv = [head.join(","), ...body].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "frinq-campaign.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const loadThread = useCallback(async (phone: string) => {
    setThreadLoading(true);
    setChatNote(null);
    try {
      const res = await adminFetch(
        `${API_URL}/api/v1/admin/whatsapp/thread?phone=${encodeURIComponent(phone)}`,
        { cache: "no-store" }, { key: adminKey },
      );
      const j = await res.json();
      setThread(j.messages || []);
      if (j.error) setChatNote(`Could not load thread: ${j.error}`);
    } catch (e) {
      setChatNote(e instanceof Error ? e.message : "network error");
    } finally {
      setThreadLoading(false);
    }
  }, [adminKey]);

  function openChat(phone: string, name: string) {
    setChatWith({ phone, name });
    setReplyText("");
    setThread([]);
    loadThread(phone);
  }

  async function sendReply() {
    if (!chatWith || !replyText.trim() || sending) return;
    const pwd = await requestPassword();
    if (!pwd) return;
    setSending(true);
    setChatNote(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/whatsapp/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: chatWith.phone, body: replyText.trim() }),
      }, { key: adminKey, pwd });
      if (res.status === 403) {
        setActionPassword("");
        setChatNote("Wrong action password — try sending again.");
        return;
      }
      setActionPassword(pwd);
      const j = await res.json();
      if (j.ok) { setReplyText(""); await loadThread(chatWith.phone); }
      else setChatNote(`Send failed: ${j.error || res.status}. Free-form replies only work within 24h of their last message — otherwise they must message you first.`);
    } catch (e) {
      setChatNote(e instanceof Error ? e.message : "network error");
    } finally {
      setSending(false);
    }
  }

  const counts = data?.counts ?? {};
  const cards = [
    { key: "rsvp_yes", ...STATUS.rsvp_yes, n: counts.rsvp_yes ?? 0 },
    { key: "rsvp_no", ...STATUS.rsvp_no, n: counts.rsvp_no ?? 0 },
    { key: "rsvp_info", ...STATUS.rsvp_info, n: counts.rsvp_info ?? 0 },
  ];
  const responders = (data?.responders ?? []).filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Sunday Invite — RSVPs</h1>
            <p className="text-sm text-stone-500">
              {data ? `${data.total_responded} responded · ${data.total_messages} messages` : "Loading…"}
              {loading && <span className="ml-2 text-stone-400">refreshing…</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportCsv} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100">
              Export CSV
            </button>
            <button onClick={() => { load(); loadCampaign(); }} className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-100">
              Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {/* count cards */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {cards.map((c) => (
            <button
              key={c.key}
              onClick={() => { setTab("responders"); setFilter(filter === c.key ? "all" : c.key); }}
              className={`rounded-2xl border bg-white p-4 text-left transition ${
                filter === c.key ? "ring-2 ring-stone-400" : "hover:bg-stone-50"
              }`}
            >
              <div className="text-3xl font-bold tabular-nums">{c.n}</div>
              <div className="mt-1 text-sm text-stone-600">{c.emoji} {c.label}</div>
            </button>
          ))}
        </div>

        {/* tabs */}
        <div className="flex gap-1 mb-3 border-b border-stone-200">
          {(["campaign", "responders", "messages"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${
                tab === t ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-700"
              }`}
            >
              {t === "campaign" ? "Campaign" : t === "responders" ? "Who responded" : "Messages received"}
            </button>
          ))}
        </div>

        {tab === "campaign" && <CampaignView c={campaign} filter={campFilter} setFilter={setCampFilter} onOpen={openChat} />}

        {tab === "responders" && (
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-stone-500">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Name</th>
                  <th className="text-left font-medium px-4 py-2.5">Phone</th>
                  <th className="text-left font-medium px-4 py-2.5">Response</th>
                  <th className="text-left font-medium px-4 py-2.5">When</th>
                </tr>
              </thead>
              <tbody>
                {responders.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-stone-400">No responses yet.</td></tr>
                )}
                {responders.map((r, i) => {
                  const s = statusOf(r.status);
                  return (
                    <tr
                      key={`${r.phone}-${i}`}
                      onClick={() => openChat(r.phone, r.name)}
                      className="border-t border-stone-100 cursor-pointer hover:bg-stone-50"
                    >
                      <td className="px-4 py-2.5 font-medium">{r.name || "—"}</td>
                      <td className="px-4 py-2.5 text-stone-500 tabular-nums">{r.phone}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${s?.cls ?? "bg-stone-100 text-stone-600 border-stone-200"}`}>
                          {s ? `${s.emoji} ${s.label}` : r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-stone-500">
                        {fmtTime(r.at)}
                        <span className="ml-2 text-stone-300 group-hover:text-stone-400">›</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === "messages" && (
          <div className="space-y-2">
            {(data?.messages ?? []).length === 0 && (
              <div className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-center text-stone-400">
                No messages received yet.
              </div>
            )}
            {(data?.messages ?? []).map((m, i) => {
              const s = statusOf(m.choice);
              return (
                <div
                  key={i}
                  onClick={() => openChat(m.phone, m.name)}
                  className="rounded-2xl border border-stone-200 bg-white px-4 py-3 cursor-pointer hover:bg-stone-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">{m.name || m.phone}</span>
                      <span className="text-xs text-stone-400 tabular-nums">{m.phone}</span>
                      {s && (
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${s.cls}`}>
                          {s.emoji} {s.label}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-stone-400 shrink-0">{fmtTime(m.at)}</span>
                  </div>
                  <div className="mt-1 text-sm text-stone-700">
                    {m.button_text ? <span className="italic text-stone-500">tapped: {m.button_text}</span> : (m.body || "—")}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 1:1 chat drawer */}
      {chatWith && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/30"
          onClick={() => setChatWith(null)}
        >
          <div
            className="w-full max-w-md h-full bg-white shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <div>
                <div className="font-semibold">{chatWith.name || chatWith.phone}</div>
                <div className="text-xs text-stone-400 tabular-nums">{chatWith.phone}</div>
              </div>
              <button
                onClick={() => setChatWith(null)}
                className="text-stone-400 hover:text-stone-700 text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-stone-50">
              {threadLoading && <div className="text-center text-stone-400 text-sm py-6">Loading…</div>}
              {!threadLoading && thread.length === 0 && (
                <div className="text-center text-stone-400 text-sm py-6">No messages.</div>
              )}
              {thread.map((m, i) => (
                <div key={i} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                      m.direction === "out"
                        ? "bg-emerald-600 text-white"
                        : "bg-white border border-stone-200 text-stone-800"
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">
                      {m.body || <span className="italic opacity-70">(no text)</span>}
                    </div>
                    <div className={`mt-1 text-[10px] ${m.direction === "out" ? "text-emerald-100" : "text-stone-400"}`}>
                      {fmtTime(m.at)}
                      {m.direction === "out" && m.status ? ` · ${m.status}` : ""}
                      {m.error_code ? ` · err ${m.error_code}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {chatNote && (
              <div className="px-4 py-2 text-xs text-rose-700 bg-rose-50 border-t border-rose-200">{chatNote}</div>
            )}

            <div className="border-t border-stone-200 p-3 flex gap-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                rows={2}
                placeholder="Type a reply…  (Enter to send, Shift+Enter for newline)"
                className="flex-1 resize-none rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
              <button
                onClick={sendReply}
                disabled={sending || !replyText.trim()}
                className="rounded-lg bg-stone-900 text-white px-4 text-sm font-medium disabled:opacity-40 hover:bg-stone-800"
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
      <PasswordModal
        open={!!pwdModal}
        onSubmit={(p) => { setActionPassword(p); pwdModal?.resolve(p); setPwdModal(null); }}
        onCancel={() => { pwdModal?.resolve(null); setPwdModal(null); }}
      />
    </div>
  );
}

function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

function CampaignView({
  c, filter, setFilter, onOpen,
}: {
  c: Campaign | null;
  filter: string;
  setFilter: (f: string) => void;
  onOpen: (phone: string, name: string) => void;
}) {
  if (!c) return <div className="rounded-2xl border border-stone-200 bg-white px-4 py-10 text-center text-stone-400">Loading campaign…</div>;
  if (c.error) return <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Server: {c.error}</div>;

  const f = c.funnel;
  const funnel = [
    { label: "Audience", n: f.audience, sub: "messaged" },
    { label: "Delivered", n: f.delivered, sub: pct(f.delivered, f.audience) },
    { label: "Read", n: f.read, sub: pct(f.read, f.audience) },
    { label: "Responded", n: f.responded, sub: pct(f.responded, f.audience) },
  ];
  const engagement = [
    { label: "✅ Attending", n: c.rsvp_counts.rsvp_yes ?? 0, cls: "text-emerald-700" },
    { label: "❌ Can't", n: c.rsvp_counts.rsvp_no ?? 0, cls: "text-rose-700" },
    { label: "🤔 Needs info", n: c.rsvp_counts.rsvp_info ?? 0, cls: "text-amber-700" },
    { label: "👀 Seen & left", n: c.read_no_reply, cls: "text-sky-700" },
    { label: "📭 Delivered, no reply", n: c.delivered_no_reply, cls: "text-stone-700" },
    { label: "🚫 Not delivered", n: f.failed, cls: "text-rose-700" },
    { label: "💬 Messages received", n: c.messages_received, cls: "text-stone-700" },
  ];

  const match = (r: Recipient) => {
    if (filter === "all") return true;
    if (filter === "failed") return r.delivery === "failed" || r.delivery === "undelivered";
    if (filter === "no_reply") return (r.delivery === "delivered" || r.delivery === "read") && !r.responded;
    if (filter === "seen_left") return r.read && !r.responded;
    if (filter === "responded") return r.responded;
    return true;
  };
  const rows = c.recipients.filter(match);
  const chips = [
    { k: "all", label: `All (${c.recipients.length})` },
    { k: "responded", label: `Responded (${f.responded})` },
    { k: "seen_left", label: `Seen & left (${c.read_no_reply})` },
    { k: "no_reply", label: `No reply (${c.delivered_no_reply})` },
    { k: "failed", label: `Not delivered (${f.failed})` },
  ];

  return (
    <div className="space-y-5">
      {/* funnel */}
      <div className="grid grid-cols-4 gap-3">
        {funnel.map((s, i) => (
          <div key={s.label} className="rounded-2xl border border-stone-200 bg-white p-4 relative">
            <div className="text-3xl font-bold tabular-nums">{s.n}</div>
            <div className="text-sm text-stone-600 mt-1">{s.label}</div>
            <div className="text-xs text-stone-400">{s.sub}</div>
            {i > 0 && <div className="absolute -left-2 top-1/2 -translate-y-1/2 text-stone-300">→</div>}
          </div>
        ))}
      </div>

      {/* engagement breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {engagement.map((e) => (
          <div key={e.label} className="rounded-2xl border border-stone-200 bg-white p-3">
            <div className={`text-2xl font-bold tabular-nums ${e.cls}`}>{e.n}</div>
            <div className="text-xs text-stone-500 mt-0.5">{e.label}</div>
          </div>
        ))}
      </div>

      {/* why not delivered */}
      {Object.keys(c.error_breakdown).length > 0 && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="text-sm font-medium text-stone-700 mb-2">Why messages didn’t deliver</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(c.error_breakdown).sort((a, b) => b[1] - a[1]).map(([code, n]) => (
              <span key={code} className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs text-rose-700">
                <b className="tabular-nums">{n}</b> · {ERR_LABEL[code] || `error ${code}`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* filter chips */}
      <div className="flex flex-wrap gap-2">
        {chips.map((ch) => (
          <button
            key={ch.k}
            onClick={() => setFilter(ch.k)}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === ch.k ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-600 hover:bg-stone-100"
            }`}
          >
            {ch.label}
          </button>
        ))}
      </div>

      {/* recipient table */}
      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Name</th>
              <th className="text-left font-medium px-4 py-2.5">Phone</th>
              <th className="text-left font-medium px-4 py-2.5">Delivery</th>
              <th className="text-left font-medium px-4 py-2.5">Responded</th>
              <th className="text-left font-medium px-4 py-2.5">RSVP</th>
              <th className="text-left font-medium px-4 py-2.5">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-400">No recipients in this view.</td></tr>
            )}
            {rows.map((r, i) => {
              const b = deliveryBadge(r.delivery);
              const s = statusOf(r.rsvp);
              return (
                <tr key={`${r.phone}-${i}`} onClick={() => onOpen(r.phone, r.name)} className="border-t border-stone-100 cursor-pointer hover:bg-stone-50">
                  <td className="px-4 py-2.5 font-medium">{r.name || "—"}</td>
                  <td className="px-4 py-2.5 text-stone-500 tabular-nums">{r.phone}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${b.cls}`}>{b.label}</span>
                    {r.errors.length > 0 && (
                      <span className="ml-1 text-[10px] text-rose-500">{r.errors.map((e) => ERR_LABEL[e] || e).join(", ")}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{r.responded ? <span className="text-emerald-700">Yes</span> : <span className="text-stone-400">—</span>}</td>
                  <td className="px-4 py-2.5">
                    {s ? <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${s.cls}`}>{s.emoji} {s.label}</span> : <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-stone-500">{fmtTime(r.last)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
