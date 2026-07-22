"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";

// force-dynamic removed for static export (Task 13) — unsupported under
// output: "export". This page is "use client" and fetches its data
// client-side regardless, so a static shell is fine.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// Comma-separated phone numbers (10-digit, no +91) that should be treated
// as test/dev accounts and hidden from the main users tab. Falls back to
// NEXT_PUBLIC_DEV_PHONE if not set so existing deploys keep working.
const TEST_PHONES: string[] = (process.env.NEXT_PUBLIC_TEST_PHONES
  || process.env.NEXT_PUBLIC_DEV_PHONE
  || ""
)
  .split(",")
  .map((p) => p.replace(/\D/g, "").replace(/^91/, ""))
  .filter((p) => p.length >= 10)
  .map((p) => p.slice(-10));

function isTestPhone(phone: string | null): boolean {
  if (!phone) return false;
  const last10 = phone.replace(/\D/g, "").slice(-10);
  return TEST_PHONES.includes(last10);
}

/** Authenticated fetch for admin endpoints. Sends the admin key as a
 *  Bearer token in the Authorization header and the action password (if
 *  provided) in X-Action-Password — neither value ever appears in the
 *  URL, so it can't leak via browser history, server access logs, the
 *  Referer header, or screenshots. */
async function adminFetch(
  url: string,
  opts: RequestInit = {},
  auth: { key: string; pwd?: string } = { key: "" },
): Promise<Response> {
  const headers = new Headers(opts.headers || {});
  if (auth.key) headers.set("Authorization", `Bearer ${auth.key}`);
  if (auth.pwd) headers.set("X-Action-Password", auth.pwd);
  return fetch(url, { ...opts, headers });
}

/** Audio player for a voice clip. Fetches the audio bytes with the
 *  Authorization header (instead of the old ?key= URL approach which
 *  leaked the admin key everywhere the <audio src> string went) and
 *  hands the resulting blob to the <audio> element via URL.createObjectURL.
 *  Blob URLs are opaque (no key inside) so right-clicking 'copy audio
 *  URL' or screenshotting reveals nothing useful. */
function VoiceAudio({ submissionId, questionKey, adminKey }: {
  submissionId: string; questionKey: string; adminKey: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const res = await adminFetch(
          `${API_URL}/api/v1/admin/voice/${submissionId}/${questionKey}/stream`,
          {}, { key: adminKey },
        );
        if (!res.ok) { setErr(`audio ${res.status}`); return; }
        const blob = await res.blob();
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setSrc(createdUrl);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "network error");
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [submissionId, questionKey, adminKey]);

  if (err) return <span className="font-[family-name:var(--font-motive)] text-[9px] text-red-500">{err}</span>;
  if (!src) return <span className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355]">loading…</span>;
  return (
    <audio controls preload="auto" src={src} className="w-full h-8" style={{ accentColor: "#7C1C0B" }} />
  );
}

/** Test row = env-var phone match OR admin manually flagged it via UI. */
function isTestRow(s: Submission): boolean {
  return s.is_test || isTestPhone(s.phone);
}

/** Inline password prompt modal. Resolves with the entered password,
 *  or null if the user cancelled. Cached at the top level after first
 *  successful entry so subsequent destructive actions don't re-prompt. */
function PasswordModal({ open, onSubmit, onCancel }: {
  open: boolean;
  onSubmit: (pwd: string) => void;
  onCancel: () => void;
}) {
  const [pwd, setPwd] = useState("");
  // Clear the entered password whenever the modal transitions closed.
  // Adjusted during render (not in an effect) so there's no stale-pwd
  // frame between the transition and a passive effect flushing.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setPwd("");
  }
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(42,24,16,0.45)" }}
      onClick={onCancel}>
      <div className="bg-[#F5F0E8] w-full max-w-sm rounded-2xl p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.22em] uppercase text-[#7C1C0B] mb-2">
          action password required
        </p>
        <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] mb-5">
          this action is destructive. enter the password to continue.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); if (pwd) onSubmit(pwd); }}>
          <input type="password" autoFocus value={pwd} onChange={(e) => setPwd(e.target.value)}
            placeholder="password"
            className="frinq-input w-full mb-4" />
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onCancel}
              className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] px-3 py-1.5 text-[#8B7355]">
              cancel
            </button>
            <button type="submit" disabled={!pwd}
              className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] px-3 py-1.5 bg-[#7C1C0B] text-[#F5F0E8] disabled:opacity-40">
              confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const RAPID_LABELS = [
  ["confront immediately", "take time to process"],
  ["deep 2am talks", "random bakchodi"],
  ["home early", "home late"],
  ["mountain person", "beach person"],
  ["i make the plans", "i join the plans"],
  ["need regular catch-ups", "pick up where we left off"],
  ["new cultures", "deeper into my own"],
  ["hiking with strangers", "poker with strangers"],
  ["i'm always the host", "i'm never the host"],
  ["call everyday", "call once a week"],
];
const OPINION_LABELS = [
  "on ai taking over",
  "when it comes to truth",
  "you respect people who",
  "on how people show up",
];

// Sliders rewritten — 4 introspective questions, see preferences/page.tsx.
// Old labels (depth / fun-get-me / frequency) no longer match the data.
const SLIDER_LABELS = [
  { left: "see", right: "sense" },          // you trust more
  { left: "heart", right: "head" },         // you decide with
  { left: "deeper", right: "wider" },       // you grow from
  { left: "kind", right: "honest" },        // you'd rather be
];

function sliderSummary(prefs: number[]): string {
  // Each value is 0-100. Express as "left X%  /  right (100-X)%" or
  // just show the snapped position so admin can scan quickly.
  return SLIDER_LABELS
    .map((lbl, i) => {
      const v = prefs[i];
      if (v == null) return null;
      const side = v < 40 ? lbl.left : v > 60 ? lbl.right : "balanced";
      return `${lbl.left}/${lbl.right}: ${side} (${v})`;
    })
    .filter(Boolean)
    .join(" · ");
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Insight { label: string; text: string; }
interface Submission {
  id: string; phone: string | null; is_complete: boolean; status: string;
  headline: string | null; spirit_animal: string | null; tags: string[];
  insights: Insight[]; answers: Record<string, unknown>;
  last_page: string | null;
  archetype: string | null;
  admin_notes: string | null;
  is_test: boolean;
  is_approved: boolean;
  whatsapp_sent_at: string | null;
  followup_sent_at: string | null;
  created_at: string | null; completed_at: string | null; error_msg: string | null;
}
interface Analytics {
  totals: {
    all_submissions: number; complete: number; drop_off: number;
    ai_done: number; ai_processing: number; ai_error: number;
    this_week: number; last_week: number; week_delta: number;
    linkedin_verified: number; instagram_verified: number; social_pct: number;
  };
  rates: { quiz_completion_pct: number; ai_success_pct: number };
  timing: { avg_ai_seconds: number | null };
  daily_last_30: { day: string; submissions: number; completions: number }[];
  hourly: { hour: number; count: number }[];
  spirit_animals: { name: string; count: number }[];
  top_tags: { tag: string; count: number }[];
  cities: { city: string; count: number }[];
  social_types: { type: string; count: number }[];
  funnel: { step: string; count: number }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskPhone(p: string | null) {
  // Admin needs full phone numbers to contact users — was masked for
  // privacy, but the admin dashboard is auth-gated already and the
  // admin needs to copy the number to whatsapp/call.
  if (!p) return "—";
  const d = p.replace(/\D/g, "");
  if (d.length >= 10) return `+91 ${d}`;
  return p;
}
function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function delta(n: number) {
  if (n === 0) return null;
  return n > 0 ? `+${n} vs last week` : `${n} vs last week`;
}

// ─── Micro components ─────────────────────────────────────────────────────────

function Stat({ label, value, sub, color }: { label: string; value: string | number; sub?: string | null; color?: string }) {
  return (
    <div className="bg-white/60 border border-[rgba(42,24,16,0.08)] px-4 py-4 flex flex-col gap-1">
      <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.18em] text-[#8B7355] uppercase">{label}</p>
      <p className="font-[family-name:var(--font-things)] text-2xl" style={{ color: color || "#2A1810" }}>{value}</p>
      {sub && <p className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355] tracking-[0.08em]">{sub}</p>}
    </div>
  );
}

function Badge({ status, complete }: { status: string; complete: boolean }) {
  if (!complete) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(42,24,16,0.06)] text-[#8B7355] whitespace-nowrap">dropped</span>;
  if (status === "done") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 whitespace-nowrap">done</span>;
  if (status === "processing") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap">processing</span>;
  if (status === "error") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 whitespace-nowrap">ai error</span>;
  return <span className="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(42,24,16,0.06)] text-[#8B7355] whitespace-nowrap">{status}</span>;
}

function ARow({ label, value }: { label: string; value: unknown }) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  let display: string;
  if (Array.isArray(value)) display = value.join(", ");
  else if (typeof value === "object") display = JSON.stringify(value);
  else display = String(value);
  if (!display.trim()) return null;
  return (
    <div className="flex gap-3 py-1.5 border-b border-[rgba(42,24,16,0.05)] last:border-0">
      <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] text-[#8B7355] uppercase flex-shrink-0 w-28 pt-0.5">{label}</span>
      <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[13px] leading-snug break-all">{display}</span>
    </div>
  );
}

function BarChart({ data, labelKey, valueKey, color = "#7C1C0B" }: {
  data: Record<string, unknown>[]; labelKey: string; valueKey: string; color?: string;
}) {
  const max = Math.max(...data.map(d => Number(d[valueKey])), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px] w-32 truncate flex-shrink-0">{String(d[labelKey])}</span>
          <div className="flex-1 h-2 bg-[rgba(42,24,16,0.07)] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(Number(d[valueKey]) / max) * 100}%`, background: color }} />
          </div>
          <span className="font-[family-name:var(--font-motive)] text-[#8B7355] text-[10px] w-6 text-right flex-shrink-0">{String(d[valueKey])}</span>
        </div>
      ))}
    </div>
  );
}

function DailyChart({ days }: { days: Analytics["daily_last_30"] }) {
  const slice = [...days].reverse().slice(-14);
  const max = Math.max(...slice.map(d => d.submissions), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {slice.map((d) => (
        <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5 group min-w-0">
          <div className="w-full flex flex-col-reverse" style={{ height: 80 }}>
            <div className="w-full bg-[#7C1C0B] rounded-sm opacity-80 group-hover:opacity-100 transition-opacity"
              style={{ height: `${Math.round((d.completions / max) * 100)}%`, minHeight: d.completions > 0 ? 2 : 0 }}
              title={`${d.completions} complete`} />
            <div className="w-full bg-[rgba(42,24,16,0.12)] rounded-sm"
              style={{ height: `${Math.round(((d.submissions - d.completions) / max) * 100)}%`, minHeight: (d.submissions - d.completions) > 0 ? 2 : 0 }}
              title={`${d.submissions - d.completions} dropped`} />
          </div>
          <span className="font-[family-name:var(--font-motive)] text-[7px] text-[#8B7355]">{fmtDate(d.day).split(" ")[0]}</span>
        </div>
      ))}
    </div>
  );
}

function HourChart({ hourly }: { hourly: Analytics["hourly"] }) {
  const full: { hour: number; count: number }[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: hourly.find(r => r.hour === h)?.count || 0,
  }));
  const max = Math.max(...full.map(h => h.count), 1);
  return (
    <div className="flex items-end gap-0.5 h-16">
      {full.map(({ hour, count }) => (
        <div key={hour} className="flex-1 flex flex-col items-center gap-0.5 group min-w-0" title={`${hour}:00 — ${count} users`}>
          <div className="w-full rounded-sm transition-all" style={{ height: `${Math.round((count / max) * 52)}px`, background: count > 0 ? "#7C1C0B" : "rgba(42,24,16,0.08)", minHeight: 2 }} />
          {hour % 6 === 0 && <span className="font-[family-name:var(--font-motive)] text-[7px] text-[#8B7355]">{hour}h</span>}
        </div>
      ))}
    </div>
  );
}

function FunnelChart({ funnel }: { funnel: Analytics["funnel"] }) {
  const max = Math.max(...funnel.map(f => f.count), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {funnel.map((f, i) => {
        const pct = Math.round((f.count / max) * 100);
        const prev = i > 0 ? funnel[i - 1].count : f.count;
        const drop = prev > 0 ? Math.round(((prev - f.count) / prev) * 100) : 0;
        return (
          <div key={f.step} className="flex items-center gap-3">
            <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] text-[#8B7355] uppercase w-24 flex-shrink-0">{f.step}</span>
            <div className="flex-1 h-5 bg-[rgba(42,24,16,0.06)] rounded overflow-hidden relative">
              <div className="h-full bg-[#7C1C0B] opacity-80 rounded transition-all duration-500" style={{ width: `${pct}%` }} />
              <span className="absolute inset-0 flex items-center px-2 font-[family-name:var(--font-things)] text-[11px] text-[#2A1810]">{f.count}</span>
            </div>
            {i > 0 && drop > 0 && (
              <span className="font-[family-name:var(--font-motive)] text-[9px] text-red-500 w-14 text-right flex-shrink-0">-{drop}%</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface VoiceClip {
  question_key: string;
  mime_type: string;
  duration_sec: number | null;
  bytes: number;
  created_at: string | null;
}

function UserDetail({ s, adminKey, onRetry, onRequestPassword, onFlagsChanged }: {
  s: Submission;
  adminKey: string;
  onRetry: (id: string) => void;
  /** Returns the cached or freshly-entered action password, or null if cancelled. */
  onRequestPassword: () => Promise<string | null>;
  /** Called after a flag/notes patch so parent can refresh its local cache. */
  onFlagsChanged: (id: string, patch: Partial<Submission>) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [voiceClips, setVoiceClips] = useState<VoiceClip[]>([]);
  const [notes, setNotes] = useState(s.admin_notes || "");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSavedAt, setNotesSavedAt] = useState<number | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [flagBusy, setFlagBusy] = useState<"test" | "approved" | null>(null);

  async function patchFlags(patch: Partial<Pick<Submission, "admin_notes" | "is_test" | "is_approved">>) {
    const res = await adminFetch(`${API_URL}/api/v1/admin/submissions/${s.id}/flags`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) },
      { key: adminKey });
    if (res.ok) onFlagsChanged(s.id, patch);
    return res.ok;
  }

  async function saveNotes() {
    setNotesSaving(true);
    const ok = await patchFlags({ admin_notes: notes });
    setNotesSaving(false);
    if (ok) {
      setNotesSavedAt(Date.now());
      setTimeout(() => setNotesSavedAt(null), 2000);
    }
  }

  async function toggleTest() {
    setFlagBusy("test");
    await patchFlags({ is_test: !s.is_test });
    setFlagBusy(null);
  }

  async function toggleApproved() {
    setFlagBusy("approved");
    await patchFlags({ is_approved: !s.is_approved });
    setFlagBusy(null);
  }

  async function resendWhatsApp() {
    const pwd = await onRequestPassword();
    if (!pwd) return;
    setResending(true);
    setResendMsg(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/submissions/${s.id}/resend-whatsapp`,
        { method: "POST" }, { key: adminKey, pwd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setResendMsg(data.sid ? `sent · ${data.sid.slice(0, 12)}…` : "sent");
        onFlagsChanged(s.id, { whatsapp_sent_at: new Date().toISOString() });
      } else if (data.skipped) {
        setResendMsg(`skipped: ${data.reason}`);
      } else {
        setResendMsg(`failed: ${data.error || data.detail || "unknown"}`);
      }
    } catch (err) {
      setResendMsg(err instanceof Error ? err.message : "network error");
    }
    setResending(false);
    setTimeout(() => setResendMsg(null), 4000);
  }

  async function sendFollowup() {
    const pwd = await onRequestPassword();
    if (!pwd) return;
    setResending(true);
    setResendMsg(null);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/submissions/${s.id}/send-followup`,
        { method: "POST" }, { key: adminKey, pwd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setResendMsg(data.already_sent ? "already sent" : data.sid ? `sent · ${data.sid.slice(0, 12)}…` : "sent");
        onFlagsChanged(s.id, { followup_sent_at: new Date().toISOString() });
      } else if (data.skipped) {
        setResendMsg(`skipped: ${data.reason}`);
      } else {
        setResendMsg(`failed: ${data.error || data.detail || "unknown"}`);
      }
    } catch (err) {
      setResendMsg(err instanceof Error ? err.message : "network error");
    }
    setResending(false);
    setTimeout(() => setResendMsg(null), 4000);
  }
  const a = s.answers;
  const rapid = (a.rapid as string[] | null) || [];
  const opinions = (a.opinions as string[] | null) || [];
  const opinionsWhy = (a.opinions_why as string[] | null) || [];
  const prefs = (a.preferences as number[] | null) || [];

  // Load voice clips when this detail expands.
  useEffect(() => {
    let cancelled = false;
    adminFetch(`${API_URL}/api/v1/admin/voice/${s.id}`, {}, { key: adminKey })
      .then((r) => r.ok ? r.json() : { clips: [] })
      .then((d) => { if (!cancelled) setVoiceClips(d.clips || []); })
      .catch(() => { /* no clips */ });
    return () => { cancelled = true; };
  }, [s.id, adminKey]);

  async function copyPhone() {
    if (!s.phone) return;
    await navigator.clipboard.writeText(s.phone).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function retry() {
    setRetrying(true);
    try {
      await adminFetch(`${API_URL}/api/v1/admin/submissions/${s.id}/retry-ai`, { method: "POST" }, { key: adminKey });
      onRetry(s.id);
    } catch { /* ignore */ }
    setTimeout(() => setRetrying(false), 3000);
  }

  // Download this user's RAW responses (exact questions + answers, no AI) as an
  // Excel file. Fetched as a blob with the Bearer header so the admin key never
  // appears in the URL (same reasoning as VoiceAudio).
  async function downloadExport() {
    setExporting(true);
    try {
      const res = await adminFetch(
        `${API_URL}/api/v1/admin/submissions/${s.id}/export.xlsx`,
        {}, { key: adminKey });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const name = String((s.answers?.name as string) || "user")
        .replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "user";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `frinq-${name}-${s.id.slice(0, 8)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch { /* ignore — admin can retry */ }
    setExporting(false);
  }

  return (
    <div className="border-t border-[rgba(42,24,16,0.08)] bg-[rgba(245,240,232,0.5)] px-5 py-5">

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <button onClick={copyPhone} className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(42,24,16,0.15)] text-[#8B7355] hover:text-[#2A1810] transition-colors">
          {copied ? "copied!" : "copy phone"}
        </button>
        {/* Export this user's raw responses (exact Q&A, no AI) as Excel */}
        <button onClick={downloadExport} disabled={exporting}
          className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(42,24,16,0.15)] text-[#8B7355] hover:text-[#2A1810] transition-colors disabled:opacity-40">
          {exporting ? "exporting…" : "export responses"}
        </button>
        {(s.status === "error" || s.status === "pending") && s.is_complete && (
          <button onClick={retry} disabled={retrying}
            className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] transition-colors disabled:opacity-40">
            {retrying ? "retrying..." : "retry AI"}
          </button>
        )}

        {/* Approve / reject — drives the 'inside the 100' gatekeeping */}
        <button onClick={toggleApproved} disabled={flagBusy === "approved"}
          className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border transition-colors disabled:opacity-40"
          style={{
            borderColor: s.is_approved ? "#2A7810" : "rgba(42,24,16,0.15)",
            background: s.is_approved ? "rgba(42,120,16,0.08)" : "transparent",
            color: s.is_approved ? "#2A7810" : "#8B7355",
          }}>
          {flagBusy === "approved" ? "…" : s.is_approved ? "✓ approved" : "approve for 100"}
        </button>

        {/* Manual test flag — complements env-based filter */}
        <button onClick={toggleTest} disabled={flagBusy === "test"}
          className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border transition-colors disabled:opacity-40"
          style={{
            borderColor: s.is_test ? "#7C1C0B" : "rgba(42,24,16,0.15)",
            background: s.is_test ? "rgba(124,28,11,0.08)" : "transparent",
            color: s.is_test ? "#7C1C0B" : "#8B7355",
          }}>
          {flagBusy === "test" ? "…" : s.is_test ? "✓ marked test" : "mark as test"}
        </button>

        {/* Resend launch-notice WhatsApp (password-gated, completed users) */}
        {s.is_complete && (
          <button onClick={resendWhatsApp} disabled={resending}
            className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(37,211,102,0.5)] text-[#1f7a3a] hover:bg-[rgba(37,211,102,0.06)] transition-colors disabled:opacity-40">
            {resending ? "sending…" : s.whatsapp_sent_at ? "re-send WhatsApp" : "send WhatsApp"}
          </button>
        )}

        {/* First follow-up WhatsApp (password-gated, drop-off users) */}
        {!s.is_complete && s.phone && (
          <button onClick={sendFollowup} disabled={resending}
            className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(124,28,11,0.4)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] transition-colors disabled:opacity-40">
            {resending ? "sending…" : s.followup_sent_at ? "re-send follow-up" : "send follow-up"}
          </button>
        )}

        {resendMsg && (
          <span className="font-[family-name:var(--font-motive)] text-[9px] text-[#2A7810]">{resendMsg}</span>
        )}

        {s.error_msg && (
          <span className="font-[family-name:var(--font-motive)] text-[9px] text-red-500 self-center max-w-xs truncate">{s.error_msg}</span>
        )}
      </div>

      {/* Admin notes — free-text annotations for analysis. Auto-collapses
          when empty to keep the detail panel compact. */}
      <div className="mb-5 p-3 bg-white/60 border border-[rgba(42,24,16,0.08)]">
        <div className="flex items-center justify-between mb-2">
          <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.2em] text-[#8B7355] uppercase">admin notes</p>
          <div className="flex items-center gap-3">
            {notesSavedAt && <span className="font-[family-name:var(--font-motive)] text-[9px] text-[#2A7810]">saved</span>}
            <button onClick={saveNotes} disabled={notesSaving || notes === (s.admin_notes || "")}
              className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-2 py-0.5 text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] disabled:opacity-30">
              {notesSaving ? "saving…" : "save"}
            </button>
          </div>
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
          placeholder="annotations only you see · what stood out, follow-up, etc."
          className="w-full bg-transparent outline-none font-[family-name:var(--font-things)] text-[#2A1810] text-[13px] placeholder:text-[rgba(42,24,16,0.25)] resize-y"
        />
      </div>

      {/* AI output */}
      {s.headline && (
        <div className="mb-5 p-4 bg-white/70 border border-[rgba(42,24,16,0.1)]">
          <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.2em] text-[#8B7355] mb-2 uppercase">ai profile</p>
          <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] mb-1">{s.headline}</p>
          {s.spirit_animal && <p className="font-[family-name:var(--font-things)] text-[#7C1C0B] text-[13px] mb-2">{s.spirit_animal}</p>}
          {s.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {s.tags.map((t, i) => <span key={i} className="px-2.5 py-1 border border-[rgba(42,24,16,0.15)] rounded-full font-[family-name:var(--font-things)] text-[11px] text-[#2A1810]">{t}</span>)}
            </div>
          )}
          {s.insights.length > 0 && (
            <div className="flex flex-col gap-2 mt-3">
              {s.insights.map((ins, i) => (
                <div key={i}>
                  <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] text-[#8B7355] uppercase">{ins.label}</p>
                  <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px] leading-snug">{ins.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Voice recordings */}
      {voiceClips.length > 0 && (
        <div className="mb-5 p-4 bg-white/70 border border-[rgba(42,24,16,0.1)]">
          <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.2em] text-[#8B7355] mb-3 uppercase">
            voice recordings · {voiceClips.length}
          </p>
          <div className="flex flex-col gap-3">
            {voiceClips.map((clip) => (
              <div key={clip.question_key} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px] font-[family-name:var(--font-motive)] text-[#8B7355]">
                  <span className="tracking-[0.14em] uppercase">{clip.question_key}</span>
                  <span className="text-[#7C1C0B]">
                    {clip.duration_sec ? `${clip.duration_sec}s` : ""} · {Math.round(clip.bytes / 1024)}KB
                  </span>
                </div>
                <VoiceAudio submissionId={s.id} questionKey={clip.question_key} adminKey={adminKey} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Answers grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
        <div>
          <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.2em] text-[#8B7355] mb-2 uppercase">profile</p>
          <ARow label="name" value={a.name} />
          <ARow label="phone" value={maskPhone(s.phone)} />
          <ARow label="city" value={a.city} />
          <ARow label="dob" value={a.dob} />
          <ARow label="social type" value={a.social_type} />
          <ARow label="scene" value={a.scene || a.substance_scene} />
          <ARow label="saturday" value={a.saturday} />
          <ARow label="hobbies" value={a.hobbies} />
          <ARow label="interests" value={a.interests} />
          <ARow label="linkedin" value={a.linkedin_url} />
          <ARow label="instagram" value={a.instagram} />
          <ARow label="social verified" value={a.social_verified} />
        </div>
        <div>
          <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.2em] text-[#8B7355] mb-2 uppercase">values</p>
          <ARow label="connection" value={a.connection} />
          <ARow label="trip" value={a.trip} />
          {/* Event-organizing block — added in Batch 5. Renders the 6 new
              answers used by the matching engine to suggest plans. */}
          <ARow label="travel style" value={a.travel_style} />
          <ARow label="connection mode" value={a.connection_mode} />
          <ARow label="would say yes to" value={a.event_yes} />
          <ARow label="would say no to" value={a.event_no} />
          <ARow label="would rather" value={a.would_rather} />
          <ARow label="meeting style" value={a.meeting_style} />
          <ARow label="show up" value={a.show_up} />
          <ARow label="red flags" value={a.red_flags} />
          <ARow label="looking for" value={a.looking_for} />
          <ARow label="story" value={a.story} />
          {prefs.length >= 1 && (
            <ARow label="sliders" value={sliderSummary(prefs)} />
          )}
          {opinions.length > 0 && (
            <div className="mt-3">
              <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.2em] text-[#8B7355] mb-1 uppercase">opinions</p>
              {opinions.map((ans, i) => (
                <div key={i} className="py-1 border-b border-[rgba(42,24,16,0.05)] last:border-0">
                  <span className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355]">{OPINION_LABELS[i] ?? `q${i + 1}`}: </span>
                  <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[12px]">{ans}</span>
                  {opinionsWhy[i] && <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[11px] mt-0.5 leading-snug">&ldquo;{opinionsWhy[i]}&rdquo;</p>}
                </div>
              ))}
            </div>
          )}
          {rapid.length > 0 && (
            <div className="mt-3">
              <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.2em] text-[#8B7355] mb-1 uppercase">rapid fire</p>
              {rapid.map((ans, i) => (
                <div key={i} className="py-0.5 flex gap-2 items-start">
                  <span className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355] flex-shrink-0 w-28 leading-tight pt-0.5">{RAPID_LABELS[i]?.[0] ?? `q${i + 1}`}</span>
                  <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[11px]">{ans}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Views ────────────────────────────────────────────────────────────────────

type Tab = "overview" | "users" | "testing" | "analytics" | "insights" | "funnel" | "journey";

interface TrackingEvent {
  id: number;
  session_id: string;
  phone: string | null;
  name: string | null;
  page: string;
  action: string;
  element: string | null;
  data: unknown;
  created_at: string;
}

function JourneyView({ adminKey }: { adminKey: string }) {
  const [search, setSearch] = useState("");
  const [events, setEvents] = useState<TrackingEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchJourney() {
    if (!search.trim()) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      const digits = search.replace(/\D/g, "");
      if (digits.length >= 8) {
        params.set("phone", digits);
      } else {
        params.set("name", search.trim());
      }
      const res = await adminFetch(`${API_URL}/api/v1/admin/journey?${params}`, {}, { key: adminKey });
      if (res.status === 404 || res.status === 400) { setError("no events found"); setEvents(null); setLoading(false); return; }
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setEvents(data.events);
    } catch {
      setError("could not load events");
    } finally {
      setLoading(false);
    }
  }

  const ACTION_COLOR: Record<string, string> = {
    view: "#8B7355", click: "#2A7810", select: "#7C1C0B", select_card: "#7C1C0B",
    select_option: "#7C1C0B", submit: "#2A1810", back: "rgba(42,24,16,0.4)",
  };

  return (
    <div>
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <input
          className="frinq-input max-w-xs text-[13px]"
          placeholder="phone number or name"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && fetchJourney()}
        />
        <button
          onClick={fetchJourney}
          disabled={loading || !search.trim()}
          className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(42,24,16,0.18)] text-[#8B7355] hover:text-[#2A1810] transition-colors disabled:opacity-40"
        >
          {loading ? "searching..." : "search"}
        </button>
      </div>

      {error && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B] mb-4">{error}</p>}

      {events && events.length === 0 && (
        <p className="font-[family-name:var(--font-motive)] text-[#8B7355] text-sm">no events found</p>
      )}

      {events && events.length > 0 && (
        <div>
          <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.18em] text-[#8B7355] mb-4 uppercase">
            {events.length} events · {events[0]?.name || events[0]?.phone || "—"}
          </p>
          <div className="border border-[rgba(42,24,16,0.08)] bg-white/50">
            {events.map((evt) => (
              <div key={evt.id} className="flex gap-4 px-4 py-3 border-b border-[rgba(42,24,16,0.05)] last:border-0">
                <span className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355] flex-shrink-0 w-28 pt-0.5">
                  {new Date(evt.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span
                  className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.12em] uppercase flex-shrink-0 w-16 pt-0.5"
                  style={{ color: ACTION_COLOR[evt.action] ?? "#2A1810" }}
                >
                  {evt.action}
                </span>
                <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[13px] flex-1 min-w-0">
                  {evt.page}
                  {evt.element ? <span className="text-[#8B7355] ml-1">→ {evt.element}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DropoffFunnel({ funnel }: { funnel: Analytics["funnel"] }) {
  if (!funnel || funnel.length === 0) return null;
  const max = Math.max(...funnel.map(f => f.count), 1);
  // Find the step with the biggest absolute drop
  let biggestDropIdx = 1;
  let biggestDrop = 0;
  for (let i = 1; i < funnel.length; i++) {
    const d = funnel[i - 1].count - funnel[i].count;
    if (d > biggestDrop) { biggestDrop = d; biggestDropIdx = i; }
  }
  const hotspot = funnel[biggestDropIdx];
  const hotspotPrev = funnel[biggestDropIdx - 1];
  const hotspotPct = hotspotPrev.count > 0 ? Math.round((biggestDrop / hotspotPrev.count) * 100) : 0;

  return (
    <div className="bg-white/50 border border-[rgba(42,24,16,0.08)] p-5">
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.18em] text-[#8B7355] uppercase">where users drop off</p>
        {biggestDrop > 0 && (
          <div className="flex items-center gap-2 bg-[rgba(124,28,11,0.06)] border border-[rgba(124,28,11,0.15)] px-3 py-1.5">
            <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] text-[#7C1C0B] uppercase">biggest drop</span>
            <span className="font-[family-name:var(--font-things)] text-[#7C1C0B] text-[13px]">{hotspot.step}</span>
            <span className="font-[family-name:var(--font-motive)] text-[9px] text-[#7C1C0B]">−{biggestDrop} users ({hotspotPct}%)</span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {funnel.map((f, i) => {
          const prev = i > 0 ? funnel[i - 1].count : f.count;
          const drop = Math.max(0, prev - f.count);
          const dropPct = prev > 0 ? Math.round((drop / prev) * 100) : 0;
          const pct = Math.round((f.count / max) * 100);
          const isBiggest = i === biggestDropIdx && drop > 0;
          return (
            <div key={f.step} className="flex items-center gap-3">
              <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.08em] uppercase flex-shrink-0 w-24"
                style={{ color: isBiggest ? "#7C1C0B" : "#8B7355" }}>{f.step}</span>
              <div className="flex-1 h-5 bg-[rgba(42,24,16,0.05)] rounded overflow-hidden relative">
                <div className="h-full rounded transition-all duration-500"
                  style={{ width: `${pct}%`, background: isBiggest ? "#7C1C0B" : "rgba(42,24,16,0.25)" }} />
                <span className="absolute inset-0 flex items-center px-2 font-[family-name:var(--font-things)] text-[11px] text-[#2A1810]">{f.count}</span>
              </div>
              {drop > 0 && (
                <span className="font-[family-name:var(--font-motive)] text-[9px] w-16 text-right flex-shrink-0"
                  style={{ color: dropPct > 25 ? "#7C1C0B" : "#8B7355" }}>−{drop} ({dropPct}%)</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="font-[family-name:var(--font-motive)] text-[8px] text-[rgba(42,24,16,0.35)] mt-3">
        inferred from partial answers saved as users progress through the quiz
      </p>
    </div>
  );
}

function OverviewView({ analytics: a, submissions }: { analytics: Analytics; submissions: Submission[] }) {
  const t = a.totals;
  const r = a.rates;
  return (
    <div className="flex flex-col gap-6">
      {/* Row 1: core counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="total users" value={t.all_submissions} sub={delta(t.week_delta)} />
        <Stat label="completed quiz" value={t.complete} sub={`${r.quiz_completion_pct}% rate`} />
        <Stat label="drop-offs" value={t.drop_off} color="#7C1C0B" sub={t.drop_off > 0 ? `${100 - r.quiz_completion_pct}% of total` : "none"} />
        <Stat label="this week" value={t.this_week} sub={delta(t.week_delta)} />
      </div>

      {/* Drop-off funnel — prominent, always visible */}
      <DropoffFunnel funnel={a.funnel} />

      {/* Row 2: AI + social */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="ai profiles done" value={t.ai_done} sub={`${r.ai_success_pct}% success`} />
        <Stat label="ai processing" value={t.ai_processing} />
        <Stat label="ai errors" value={t.ai_error} color={t.ai_error > 0 ? "#7C1C0B" : "#2A1810"} />
        <Stat label="social verified" value={`${t.social_pct}%`} sub={`${t.linkedin_verified} linkedin · ${t.instagram_verified} ig`} />
      </div>

      {/* Daily chart */}
      <div className="bg-white/50 border border-[rgba(42,24,16,0.08)] p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.18em] text-[#8B7355] uppercase">submissions last 14 days</p>
          <div className="flex gap-4">
            <span className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355] flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#7C1C0B] rounded-sm inline-block opacity-80" />complete
            </span>
            <span className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355] flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[rgba(42,24,16,0.12)] rounded-sm inline-block" />dropped
            </span>
          </div>
        </div>
        <DailyChart days={a.daily_last_30} />
      </div>

      {/* Hour + recent users */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white/50 border border-[rgba(42,24,16,0.08)] p-5">
          <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.18em] text-[#8B7355] uppercase mb-4">activity by hour (IST)</p>
          <HourChart hourly={a.hourly} />
          <p className="font-[family-name:var(--font-motive)] text-[8px] text-[rgba(42,24,16,0.35)] mt-2">last 30 days</p>
        </div>
        <div className="bg-white/50 border border-[rgba(42,24,16,0.08)] p-5">
          <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.18em] text-[#8B7355] uppercase mb-4">recent signups</p>
          <div className="flex flex-col gap-2">
            {submissions.filter(s => s.is_complete).slice(0, 6).map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3">
                <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[13px] truncate">{String(s.answers.name || "unnamed")}</span>
                <span className="font-[family-name:var(--font-motive)] text-[#8B7355] text-[10px] flex-shrink-0">{fmt(s.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function UsersView({ submissions, adminKey, onRetry, onDelete, onBulkDelete, onRequestPassword, onFlagsChanged, mode = "users" }: {
  submissions: Submission[];
  adminKey: string;
  onRetry: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onRequestPassword: () => Promise<string | null>;
  onFlagsChanged: (id: string, patch: Partial<Submission>) => void;
  /** "users" = hide test rows. "testing" = ONLY show test rows. */
  mode?: "users" | "testing";
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "done" | "dropped" | "error" | "approved">("all");
  const [archetypeFilter, setArchetypeFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkSendResult, setBulkSendResult] = useState<string | null>(null);

  async function handleBulkSendFollowup() {
    const pwd = await onRequestPassword();
    if (!pwd) return;
    // Target: all drop-offs in the currently filtered set that haven't
    // been messaged yet. The backend re-checks these guards too.
    const targets = filtered.filter(s => !s.is_complete && s.phone && !s.followup_sent_at);
    if (targets.length === 0) { setBulkSendResult("nothing to send"); setTimeout(() => setBulkSendResult(null), 3000); return; }
    if (!confirm(`Send first_follow_up WhatsApp to ${targets.length} drop-off users?`)) return;
    setBulkSending(true);
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/send-followups-bulk`,
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: targets.map(s => s.id) }) },
        { key: adminKey, pwd });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setBulkSendResult(`sent ${data.sent ?? 0} · skipped ${data.skipped ?? 0} · failed ${data.failed ?? 0}`);
        // Mark all successfully sent rows in local state.
        const sentIds = new Set((data.results || []).filter((r: { ok?: boolean; id: string }) => r.ok).map((r: { id: string }) => r.id));
        targets.forEach(s => { if (sentIds.has(s.id)) onFlagsChanged(s.id, { followup_sent_at: new Date().toISOString() }); });
      } else if (res.status === 401) {
        setBulkSendResult("wrong password");
      } else {
        setBulkSendResult(`failed: ${data.detail || res.status}`);
      }
    } catch (err) {
      setBulkSendResult(err instanceof Error ? err.message : "network error");
    } finally {
      setBulkSending(false);
      setTimeout(() => setBulkSendResult(null), 6000);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try { await onDelete(id); }
    finally { setDeleting(null); setConfirmDelete(null); if (expanded === id) setExpanded(null); }
  }

  async function handleBulkDelete() {
    if (!confirm(`Delete all ${visibleSubmissions.length} test rows? This can't be undone.`)) return;
    setBulkDeleting(true);
    try { await onBulkDelete(visibleSubmissions.map((s) => s.id)); }
    finally { setBulkDeleting(false); }
  }

  const visibleSubmissions = submissions.filter(s => mode === "testing" ? isTestRow(s) : !isTestRow(s));

  // Unique archetypes from visible submissions — for the dropdown filter.
  const archetypes = Array.from(new Set(
    visibleSubmissions.map((s) => s.archetype || s.spirit_animal || "").filter(Boolean)
  )).sort();

  const filtered = visibleSubmissions.filter(s => {
    if (filter === "done" && s.status !== "done") return false;
    if (filter === "dropped" && s.is_complete) return false;
    if (filter === "error" && s.status !== "error") return false;
    if (filter === "approved" && !s.is_approved) return false;
    if (archetypeFilter && (s.archetype || s.spirit_animal) !== archetypeFilter) return false;
    if (search) {
      const name = String(s.answers.name || "").toLowerCase();
      const city = String(s.answers.city || "").toLowerCase();
      const phone = String(s.phone || "").toLowerCase();
      const tags = s.tags.join(" ").toLowerCase();
      const spirit = String(s.spirit_animal || "").toLowerCase();
      const q = search.toLowerCase();
      if (!name.includes(q) && !city.includes(q) && !phone.includes(q) && !tags.includes(q) && !spirit.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sortBy === "oldest") return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
    if (sortBy === "name") return String(a.answers.name || "").localeCompare(String(b.answers.name || ""));
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  return (
    <div>
      {/* Filters bar */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          className="frinq-input max-w-xs text-[13px]"
          placeholder="search name / city / phone / tag / spirit..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-2 flex-wrap">
          {(["all", "done", "approved", "dropped", "error"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-[10px] font-[family-name:var(--font-motive)] tracking-[0.1em] transition-colors ${filter === f ? "bg-[#2A1810] text-[#F5F0E8]" : "border border-[rgba(42,24,16,0.18)] text-[#8B7355] hover:text-[#2A1810]"}`}>
              {f}
            </button>
          ))}
        </div>
        {archetypes.length > 0 && (
          <select
            value={archetypeFilter}
            onChange={e => setArchetypeFilter(e.target.value)}
            className="text-[10px] font-[family-name:var(--font-motive)] tracking-[0.1em] text-[#8B7355] bg-transparent border border-[rgba(42,24,16,0.18)] px-2 py-1 focus:outline-none"
          >
            <option value="">all archetypes</option>
            {archetypes.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="text-[10px] font-[family-name:var(--font-motive)] tracking-[0.1em] text-[#8B7355] bg-transparent border border-[rgba(42,24,16,0.18)] px-2 py-1 focus:outline-none"
        >
          <option value="newest">newest first</option>
          <option value="oldest">oldest first</option>
          <option value="name">by name</option>
        </select>
        {mode === "testing" && visibleSubmissions.length > 0 && (
          <button onClick={handleBulkDelete} disabled={bulkDeleting}
            className="ml-auto font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(124,28,11,0.4)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] transition-colors disabled:opacity-40">
            {bulkDeleting ? "deleting..." : `delete all ${visibleSubmissions.length} test rows`}
          </button>
        )}
        {mode === "users" && filter === "dropped" && (
          <button onClick={handleBulkSendFollowup} disabled={bulkSending}
            className="ml-auto font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-3 py-1.5 border border-[rgba(124,28,11,0.4)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] transition-colors disabled:opacity-40">
            {bulkSending ? "sending…" : `send follow-up to ${filtered.filter(s => !s.is_complete && s.phone && !s.followup_sent_at).length} drop-offs`}
          </button>
        )}
        {bulkSendResult && (
          <span className="font-[family-name:var(--font-motive)] text-[9px] text-[#2A7810] ml-2">{bulkSendResult}</span>
        )}
      </div>

      {mode === "testing" && (
        <p className="font-[family-name:var(--font-motive)] text-[10px] text-[#8B7355] tracking-[0.1em] mb-3">
          rows for phones in <code className="text-[#7C1C0B]">NEXT_PUBLIC_TEST_PHONES</code> (or DEV_PHONE). hidden from the main users tab.
        </p>
      )}

      {/* Table with horizontal scroll */}
      <div className="overflow-x-auto border border-[rgba(42,24,16,0.08)] bg-white/50">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-[rgba(42,24,16,0.08)]">
              {["name", "phone", "city", "spirit animal", "status", "dropped at", "tags", "submitted", ""].map((h, i) => (
                <th key={i} className="text-left px-4 py-3 font-[family-name:var(--font-motive)] text-[9px] tracking-[0.18em] text-[#8B7355] uppercase font-normal whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center font-[family-name:var(--font-motive)] text-[#8B7355] text-sm">no users found</td></tr>
            )}
            {filtered.map(s => {
              const isExp = expanded === s.id;
              const isDeleting = deleting === s.id;
              const isConfirming = confirmDelete === s.id;
              return (
                <Fragment key={s.id}>
                  <tr onClick={() => setExpanded(isExp ? null : s.id)}
                    className="border-b border-[rgba(42,24,16,0.05)] last:border-0 cursor-pointer hover:bg-white/70 transition-colors">
                    <td className="px-4 py-3 font-[family-name:var(--font-things)] text-[#2A1810] text-[13px] whitespace-nowrap">{String(s.answers.name || "unnamed")}</td>
                    <td className="px-4 py-3 font-[family-name:var(--font-motive)] text-[#8B7355] text-[11px] whitespace-nowrap">{maskPhone(s.phone)}</td>
                    <td className="px-4 py-3 font-[family-name:var(--font-motive)] text-[#2A1810] text-[11px] whitespace-nowrap">{String(s.answers.city || "—")}</td>
                    <td className="px-4 py-3 font-[family-name:var(--font-things)] text-[#7C1C0B] text-[12px] whitespace-nowrap max-w-[140px] truncate">{s.spirit_animal || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Badge status={s.status} complete={s.is_complete} />
                        {s.is_approved && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[rgba(42,120,16,0.1)] text-[#2A7810] font-[family-name:var(--font-motive)] tracking-[0.1em] uppercase">
                            ✓100
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-[family-name:var(--font-motive)] text-[11px] whitespace-nowrap"
                        style={{ color: !s.is_complete && s.last_page ? "#7C1C0B" : "#8B7355" }}>
                      {!s.is_complete ? (s.last_page || "—") : "—"}
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <div className="flex flex-wrap gap-1">
                        {s.tags.slice(0, 2).map((tag, i) => (
                          <span key={i} className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355] bg-[rgba(42,24,16,0.05)] px-1.5 py-0.5 rounded whitespace-nowrap">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-[family-name:var(--font-motive)] text-[#8B7355] text-[10px] whitespace-nowrap">{fmt(s.created_at)}</td>
                    <td className="px-2 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {isConfirming ? (
                        <div className="flex gap-1.5 items-center">
                          <button onClick={() => handleDelete(s.id)} disabled={isDeleting}
                            className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] px-2 py-1 bg-[#7C1C0B] text-[#F5F0E8] disabled:opacity-50">
                            {isDeleting ? "..." : "confirm"}
                          </button>
                          <button onClick={() => setConfirmDelete(null)}
                            className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] px-2 py-1 text-[#8B7355]">
                            cancel
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(s.id)}
                          className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] px-2.5 py-1 border border-[rgba(124,28,11,0.3)] text-[#7C1C0B] hover:bg-[rgba(124,28,11,0.05)] transition-colors">
                          delete
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExp && (
                    <tr key={`${s.id}-detail`} className="border-b border-[rgba(42,24,16,0.08)]">
                      <td colSpan={9} className="p-0">
                        <UserDetail s={s} adminKey={adminKey}
                          onRetry={id => { setExpanded(null); void id; }}
                          onRequestPassword={onRequestPassword}
                          onFlagsChanged={onFlagsChanged}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="font-[family-name:var(--font-motive)] text-[9px] text-[#8B7355] mt-2 tracking-[0.1em]">
        {filtered.length} of {visibleSubmissions.length} · click row to expand
      </p>
    </div>
  );
}

function AnalyticsView({ analytics: a }: { analytics: Analytics }) {
  const t = a.totals;
  return (
    <div className="flex flex-col gap-6">

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="completion rate" value={`${a.rates.quiz_completion_pct}%`} />
        <Stat label="ai success rate" value={`${a.rates.ai_success_pct}%`} />
        <Stat label="avg ai time" value={a.timing.avg_ai_seconds ? `${a.timing.avg_ai_seconds}s` : "—"} />
        <Stat label="linkedin provided" value={t.linkedin_verified} sub={`${Math.round(t.linkedin_verified / Math.max(t.complete, 1) * 100)}% of complete`} />
        <Stat label="instagram provided" value={t.instagram_verified} sub={`${Math.round(t.instagram_verified / Math.max(t.complete, 1) * 100)}% of complete`} />
        <Stat label="this vs last week" value={t.week_delta >= 0 ? `+${t.week_delta}` : `${t.week_delta}`} color={t.week_delta >= 0 ? "#2A7810" : "#7C1C0B"} />
      </div>

      {/* City */}
      {a.cities.length > 0 && (
        <div className="bg-white/50 border border-[rgba(42,24,16,0.08)] p-5">
          <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.18em] text-[#8B7355] mb-4 uppercase">by city</p>
          <BarChart data={a.cities as Record<string, unknown>[]} labelKey="city" valueKey="count" />
        </div>
      )}

      {/* Social type */}
      {a.social_types.length > 0 && (
        <div className="bg-white/50 border border-[rgba(42,24,16,0.08)] p-5">
          <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.18em] text-[#8B7355] mb-4 uppercase">social type breakdown</p>
          <BarChart data={a.social_types as Record<string, unknown>[]} labelKey="type" valueKey="count" color="#8B7355" />
        </div>
      )}
    </div>
  );
}

function InsightsView({ analytics: a }: { analytics: Analytics }) {
  return (
    <div className="flex flex-col gap-6">

      {/* Spirit animals */}
      {a.spirit_animals.length > 0 && (
        <div className="bg-white/50 border border-[rgba(42,24,16,0.08)] p-5">
          <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.18em] text-[#8B7355] mb-4 uppercase">spirit animals leaderboard</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {a.spirit_animals.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="font-[family-name:var(--font-things)] text-[#7C1C0B] text-[11px] w-5 flex-shrink-0">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-[13px] flex-1">{s.name}</span>
                <span className="font-[family-name:var(--font-motive)] text-[#8B7355] text-[10px]">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top tags */}
      {a.top_tags.length > 0 && (
        <div className="bg-white/50 border border-[rgba(42,24,16,0.08)] p-5">
          <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.18em] text-[#8B7355] mb-4 uppercase">most common personality tags</p>
          <div className="flex flex-wrap gap-2">
            {a.top_tags.map((t, i) => (
              <span key={i}
                className="px-3 py-1.5 border border-[rgba(42,24,16,0.15)] font-[family-name:var(--font-things)] text-[#2A1810] text-[12px]"
                style={{ opacity: 1 - (i / a.top_tags.length) * 0.5, fontSize: `${Math.max(10, 14 - i * 0.3)}px` }}
              >
                {t.tag} <span className="text-[#8B7355] text-[9px]">{t.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FunnelView({ analytics: a }: { analytics: Analytics }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white/50 border border-[rgba(42,24,16,0.08)] p-5">
        <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.18em] text-[#8B7355] mb-2 uppercase">quiz completion funnel</p>
        <p className="font-[family-name:var(--font-motive)] text-[8px] text-[rgba(42,24,16,0.4)] mb-5">inferred from which answer fields are present</p>
        <FunnelChart funnel={a.funnel} />
      </div>

      {/* Drop-off table */}
      <div className="bg-white/50 border border-[rgba(42,24,16,0.08)] p-5">
        <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.18em] text-[#8B7355] mb-4 uppercase">step-by-step drop analysis</p>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(42,24,16,0.08)]">
              {["step", "users reached", "dropped here", "drop %"].map(h => (
                <th key={h} className="text-left px-2 py-2 font-[family-name:var(--font-motive)] text-[9px] tracking-[0.14em] text-[#8B7355] uppercase font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.funnel.map((f, i) => {
              const prev = i > 0 ? a.funnel[i - 1].count : f.count;
              const dropped = Math.max(0, prev - f.count);
              const dropPct = prev > 0 ? Math.round((dropped / prev) * 100) : 0;
              return (
                <tr key={f.step} className="border-b border-[rgba(42,24,16,0.04)] last:border-0">
                  <td className="px-2 py-2 font-[family-name:var(--font-motive)] text-[10px] tracking-[0.1em] text-[#8B7355] uppercase">{f.step}</td>
                  <td className="px-2 py-2 font-[family-name:var(--font-things)] text-[#2A1810] text-[13px]">{f.count}</td>
                  <td className="px-2 py-2 font-[family-name:var(--font-things)] text-[13px]" style={{ color: dropped > 0 ? "#7C1C0B" : "#8B7355" }}>{dropped > 0 ? `-${dropped}` : "—"}</td>
                  <td className="px-2 py-2 font-[family-name:var(--font-motive)] text-[10px]" style={{ color: dropPct > 20 ? "#7C1C0B" : "#8B7355" }}>{dropPct > 0 ? `${dropPct}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main admin page ──────────────────────────────────────────────────────────

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savedKey = useRef("");
  // Mirrors savedKey.current for the JSX below — refs can't be read during
  // render, only from callbacks/effects, so anything passed as a rendered
  // prop needs the state copy instead.
  const [adminKey, setAdminKey] = useState("");

  // Cached action password — once user enters correctly for any
  // destructive action this session, we re-use it for the rest
  // instead of re-prompting on every click.
  const [actionPassword, setActionPassword] = useState<string>("");
  const [pwdModal, setPwdModal] = useState<{ resolve: (p: string | null) => void } | null>(null);

  // Returns the cached password if present, else opens the modal and
  // resolves with the entered password (or null if cancelled).
  const requestPassword = useCallback((): Promise<string | null> => {
    if (actionPassword) return Promise.resolve(actionPassword);
    return new Promise<string | null>((resolve) => {
      setPwdModal({ resolve });
    });
  }, [actionPassword]);

  const fetchData = useCallback(async (k: string, silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [aRes, sRes] = await Promise.all([
        adminFetch(`${API_URL}/api/v1/admin/analytics`, {}, { key: k }),
        adminFetch(`${API_URL}/api/v1/admin/submissions?limit=500`, {}, { key: k }),
      ]);
      if (aRes.status === 401) { setError("invalid key"); return false; }
      if (!aRes.ok || !sRes.ok) { setError("connection failed"); return false; }
      const aData = await aRes.json();
      const sData = await sRes.json();
      setAnalytics(aData);
      setSubmissions(sData.submissions || []);
      setLastRefresh(new Date());
      return true;
    } catch {
      if (!silent) setError("could not reach backend");
      return false;
    } finally {
      setRefreshing(false);
    }
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setError("");
    const ok = await fetchData(key);
    if (ok) { savedKey.current = key; setAdminKey(key); setAuthed(true); }
    setLoading(false);
  }

  useEffect(() => {
    if (autoRef.current) clearInterval(autoRef.current);
    if (autoRefresh && authed) {
      autoRef.current = setInterval(() => fetchData(savedKey.current, true), 60000);
    }
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [autoRefresh, authed, fetchData]);

  async function exportCSV() {
    // Fetch with header auth + trigger download via a synthetic anchor.
    // Previous version used window.open(URL?key=...) which wrote the
    // admin key to browser history and to the new tab's URL bar.
    try {
      const res = await adminFetch(`${API_URL}/api/v1/admin/export/csv`,
        {}, { key: savedKey.current });
      if (!res.ok) { setError(`export failed (${res.status})`); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `frinq-submissions-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "export failed");
    }
  }

  // Hard-delete a submission. voice_clips cascades automatically.
  // Asks for action password (cached after first entry).
  const deleteSubmission = useCallback(async (id: string) => {
    if (!id) {
      await fetchData(savedKey.current, true);
      return;
    }
    const pwd = await requestPassword();
    if (!pwd) return;
    const res = await adminFetch(`${API_URL}/api/v1/admin/submissions/${id}`,
      { method: "DELETE" }, { key: savedKey.current, pwd });
    if (res.ok) {
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
    } else if (res.status === 401) {
      // Wrong password — clear cache so the next attempt re-prompts.
      setActionPassword("");
      alert("wrong action password");
    }
  }, [fetchData, requestPassword]);

  // Bulk-delete (called from testing tab toolbar). Password-gated too.
  const bulkDelete = useCallback(async (ids: string[]) => {
    const pwd = await requestPassword();
    if (!pwd) return;
    const res = await adminFetch(`${API_URL}/api/v1/admin/submissions/bulk-delete`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) },
      { key: savedKey.current, pwd });
    if (res.ok) {
      setSubmissions((prev) => prev.filter((s) => !ids.includes(s.id)));
    } else if (res.status === 401) {
      setActionPassword("");
      alert("wrong action password");
    }
  }, [requestPassword]);

  // Locally merge a flags PATCH so the UI updates instantly without a refetch.
  const handleFlagsChanged = useCallback((id: string, patch: Partial<Submission>) => {
    setSubmissions((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  }, []);

  if (!authed) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#F5F0E8", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" }}>
        <div style={{ maxWidth: 360, width: "100%" }}>
          <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-2xl mb-1">frinq admin</p>
          <p className="font-[family-name:var(--font-motive)] text-[#8B7355] text-[11px] tracking-[0.1em] mb-8">enter your admin key to continue</p>
          <form onSubmit={login} className="flex flex-col gap-4">
            <input type="password" className="frinq-input" placeholder="admin key" value={key} onChange={e => setKey(e.target.value)} autoFocus />
            {error && <p className="font-[family-name:var(--font-motive)] text-[11px] text-[#7C1C0B]">{error}</p>}
            <button type="submit" disabled={loading}
              className="inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors group disabled:opacity-40">
              {loading ? "connecting..." : "enter"}
              {!loading && <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="transition-transform group-hover:translate-x-1"><path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" /></svg>}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Counts split test vs real so the tab labels reflect what's actually shown.
  // A row is "test" if its phone matches NEXT_PUBLIC_TEST_PHONES OR admin
  // manually flagged it via the 'mark as test' button.
  const realCount = submissions.filter(s => !isTestRow(s)).length;
  const testCount = submissions.filter(s => isTestRow(s)).length;
  const approvedCount = submissions.filter(s => s.is_approved && !isTestRow(s)).length;

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "overview" },
    { id: "users", label: `users (${realCount}${approvedCount > 0 ? ` · ${approvedCount} ✓` : ""})` },
    { id: "testing", label: `testing (${testCount})` },
    { id: "analytics", label: "analytics" },
    { id: "insights", label: "insights" },
    { id: "funnel", label: "funnel" },
    { id: "journey", label: "user journey" },
  ];

  const drops = analytics?.totals.drop_off || 0;

  return (
    <div style={{ position: "fixed", inset: 0, overflowY: "auto", overflowX: "hidden", background: "#F5F0E8" }}>
      {/* Header */}
      <header className="border-b border-[rgba(42,24,16,0.1)] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#F5F0E8] z-20">
        <div className="flex items-center gap-4">
          <span className="font-[family-name:var(--font-things)] text-[#2A1810] text-lg">frinq admin</span>
          {drops > 0 && (
            <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] px-2 py-0.5 bg-[rgba(124,28,11,0.08)] text-[#7C1C0B] rounded-full">
              {drops} dropped
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {lastRefresh && (
            <span className="font-[family-name:var(--font-motive)] text-[9px] text-[rgba(42,24,16,0.35)] hidden md:block">
              refreshed {lastRefresh.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={`font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] px-2.5 py-1 border transition-colors ${autoRefresh ? "bg-[#2A1810] text-[#F5F0E8] border-[#2A1810]" : "border-[rgba(42,24,16,0.18)] text-[#8B7355]"}`}
          >
            auto-refresh
          </button>
          <button
            onClick={() => fetchData(savedKey.current)}
            disabled={refreshing}
            className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] px-2.5 py-1 border border-[rgba(42,24,16,0.18)] text-[#8B7355] hover:text-[#2A1810] transition-colors disabled:opacity-40"
          >
            {refreshing ? "refreshing..." : "refresh"}
          </button>
          <button
            onClick={exportCSV}
            className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.1em] px-2.5 py-1 border border-[rgba(42,24,16,0.18)] text-[#8B7355] hover:text-[#2A1810] transition-colors"
          >
            export CSV
          </button>
        </div>
      </header>

      {/* Tab nav */}
      <div className="border-b border-[rgba(42,24,16,0.1)] px-6 flex gap-0 overflow-x-auto sticky top-[57px] bg-[#F5F0E8] z-10">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? "text-[#2A1810] border-[#2A1810]" : "text-[#8B7355] border-transparent hover:text-[#2A1810]"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <main className="px-6 py-6 max-w-5xl mx-auto">
        {analytics && tab === "overview" && <OverviewView analytics={analytics} submissions={submissions} />}
        {tab === "users" && (
          <UsersView mode="users" submissions={submissions} adminKey={adminKey}
            onRetry={() => fetchData(savedKey.current, true)}
            onDelete={deleteSubmission}
            onBulkDelete={bulkDelete}
            onRequestPassword={requestPassword}
            onFlagsChanged={handleFlagsChanged}
          />
        )}
        {tab === "testing" && (
          <UsersView mode="testing" submissions={submissions} adminKey={adminKey}
            onRetry={() => fetchData(savedKey.current, true)}
            onDelete={deleteSubmission}
            onBulkDelete={bulkDelete}
            onRequestPassword={requestPassword}
            onFlagsChanged={handleFlagsChanged}
          />
        )}
        {analytics && tab === "analytics" && <AnalyticsView analytics={analytics} />}
        {analytics && tab === "insights" && <InsightsView analytics={analytics} />}
        {analytics && tab === "funnel" && <FunnelView analytics={analytics} />}
        {tab === "journey" && <JourneyView adminKey={adminKey} />}
      </main>

      <PasswordModal
        open={!!pwdModal}
        onSubmit={(p) => { setActionPassword(p); pwdModal?.resolve(p); setPwdModal(null); }}
        onCancel={() => { pwdModal?.resolve(null); setPwdModal(null); }}
      />
    </div>
  );
}
