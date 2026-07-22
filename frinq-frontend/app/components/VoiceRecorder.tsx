"use client";

import { useEffect, useRef, useState } from "react";
import { getQuizState } from "@/app/lib/storage";
import { apiFetch } from "@/app/lib/api";

interface Props {
  /** Called when the user finishes a recording AND it has been successfully
   *  uploaded. Parent should only count this as a valid voice answer after
   *  this fires. Value: total seconds. */
  onComplete?: (seconds: number) => void;
  /** Called whenever recording state changes — parent can disable other inputs
   *  and gate "next" on `uploading` / `failed`. */
  onStateChange?: (state: RecorderState) => void;
  /** Compact layout (smaller mic button, single line of meta). */
  compact?: boolean;
  /** Persistent key for backend upload (e.g. "story", "opinion_why_0").
   *  When set, the recording blob is uploaded to /api/v1/voice on stop so
   *  admin can play it back later. Without it, nothing is uploaded. */
  questionKey?: string;
}

export type RecorderState = "idle" | "recording" | "uploading" | "done" | "failed";

/**
 * Reusable voice recorder. Used on /story (full-size) and /opinions-why
 * (compact). Falls back to no-op if mic permission denied — parent should
 * also expose a text input.
 */
export default function VoiceRecorder({ onComplete, onStateChange, compact = false, questionKey }: Props) {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [pulse, setPulse] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pendingBlobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);

  useEffect(() => { onStateChange?.(state); }, [state, onStateChange]);

  useEffect(() => () => {
    timerRef.current && clearInterval(timerRef.current);
    pulseRef.current && clearInterval(pulseRef.current);
    mediaRef.current?.state === "recording" && mediaRef.current.stop();
  }, []);

  async function uploadBlob(blob: Blob): Promise<boolean> {
    // Fire-and-forget was masking real errors and dropping uploads on
    // mobile when the page navigated. Await it instead, surface the
    // real error, and let the parent gate "next" via onStateChange.
    if (!questionKey) { setErrorMsg("not configured"); return false; }
    const submissionId = getQuizState("frinq_submission_id");
    if (!submissionId) { setErrorMsg("no submission id"); return false; }
    if (blob.size === 0) { setErrorMsg("empty recording"); return false; }
    const fd = new FormData();
    fd.append("submission_id", submissionId);
    fd.append("question_key", questionKey);
    fd.append("duration_sec", String(secondsRef.current));
    fd.append("audio", blob, `${questionKey}.webm`);
    try {
      const res = await apiFetch("/api/v1/voice", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        setErrorMsg(`upload ${res.status}: ${body.slice(0, 60)}`);
        return false;
      }
      setErrorMsg(null);
      return true;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "network error");
      return false;
    }
  }

  async function retry() {
    if (!pendingBlobRef.current) return;
    setState("uploading");
    const ok = await uploadBlob(pendingBlobRef.current);
    setState(ok ? "done" : "failed");
    if (ok) onComplete?.(secondsRef.current);
  }

  async function start() {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        pendingBlobRef.current = blob;
        setState("uploading");
        const ok = await uploadBlob(blob);
        setState(ok ? "done" : "failed");
        if (ok) onComplete?.(secondsRef.current);
      };
      mr.start();
      mediaRef.current = mr;
      setState("recording");
      setSeconds(0);
      secondsRef.current = 0;
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          secondsRef.current = s + 1;
          return s + 1;
        });
      }, 1000);
      pulseRef.current = setInterval(() => setPulse((p) => (p === 1 ? 1.15 : 1)), 600);
    } catch { /* mic denied — parent's text input still works */ }
  }

  function stop() {
    timerRef.current && clearInterval(timerRef.current);
    pulseRef.current && clearInterval(pulseRef.current);
    setPulse(1);
    mediaRef.current?.stop();
    // onComplete fires only AFTER successful upload (in onstop handler above)
    // so the parent can't navigate before the audio is persisted.
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const btnSize = compact ? 44 : 64;
  const iconSize = compact ? 14 : 20;

  return (
    <div className={`flex ${compact ? "flex-row items-center gap-3" : "flex-col items-center gap-3"}`}>
      {state === "idle" && (
        <button type="button" onClick={start} className="group inline-flex items-center gap-2">
          <span
            className="rounded-full border border-[rgba(42,24,16,0.25)] flex items-center justify-center bg-white/60 group-hover:bg-white/90 group-hover:border-[rgba(42,24,16,0.5)] transition-all duration-200 group-hover:scale-105"
            style={{ width: btnSize, height: btnSize }}
          >
            <svg width={iconSize} height={iconSize * 1.2} viewBox="0 0 20 24" fill="none">
              <rect x="6" y="1" width="8" height="14" rx="4" stroke="#2A1810" strokeWidth="1.2" />
              <path d="M2 11c0 4.4 3.6 8 8 8s8-3.6 8-8" stroke="#2A1810" strokeWidth="1.2" strokeLinecap="round" />
              <line x1="10" y1="19" x2="10" y2="23" stroke="#2A1810" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.18em] text-[#8B7355]">
            {compact ? "say it" : "tap to speak"}
          </span>
        </button>
      )}
      {state === "recording" && (
        <button type="button" onClick={stop} className="inline-flex items-center gap-2">
          <span
            className="rounded-full bg-[#7C1C0B] flex items-center justify-center transition-transform duration-500"
            style={{ width: btnSize, height: btnSize, transform: `scale(${pulse})` }}
          >
            <div className="flex gap-[3px] items-center" style={{ height: compact ? 14 : 20 }}>
              {[3, 5, 8, 5, 3].map((h, i) => (
                <div key={i} className="w-[3px] rounded-full bg-white animate-pulse"
                  style={{ height: `${h * 2}px`, animationDelay: `${i * 100}ms` }} />
              ))}
            </div>
          </span>
          <span className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.16em] text-[#7C1C0B]">
            {fmt(seconds)} · tap to stop
          </span>
        </button>
      )}
      {state === "uploading" && (
        <div className="inline-flex items-center gap-2">
          <span className="rounded-full border border-[rgba(42,24,16,0.2)] bg-white/60 flex items-center justify-center"
            style={{ width: btnSize, height: btnSize }}>
            <span className="block w-3.5 h-3.5 rounded-full border-2 border-[#7C1C0B] border-t-transparent animate-spin" />
          </span>
          <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.18em] text-[#7C1C0B]">
            saving voice…
          </span>
        </div>
      )}
      {state === "done" && (
        <div className="inline-flex items-center gap-2">
          <span className="rounded-full border border-[#7C1C0B] bg-[rgba(124,28,11,0.06)] flex items-center justify-center"
            style={{ width: btnSize, height: btnSize }}>
            <svg width={iconSize} height={iconSize} viewBox="0 0 18 18" fill="none">
              <path d="M3 9l4.5 4.5L15 4.5" stroke="#7C1C0B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.18em] text-[#7C1C0B]">
              {fmt(seconds)} saved
            </span>
            <button type="button" onClick={start} className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] text-[#8B7355] hover:text-[#2A1810] transition-colors underline underline-offset-2 self-start">
              record again
            </button>
          </div>
        </div>
      )}
      {state === "failed" && (
        <div className="inline-flex items-start gap-2 max-w-[240px]">
          <span className="rounded-full border border-red-500 bg-red-50 flex items-center justify-center flex-shrink-0"
            style={{ width: btnSize, height: btnSize }}>
            <span className="text-red-600 font-bold text-lg">!</span>
          </span>
          <div className="flex flex-col gap-0.5">
            <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] text-red-600 leading-tight">
              {errorMsg || "upload failed"}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={retry} className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] text-[#7C1C0B] underline">retry</button>
              <button type="button" onClick={start} className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] text-[#8B7355] underline">re-record</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
