"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import QuestionLabel from "@/app/components/QuestionLabel";
import { getQuizState, setQuizState } from "@/app/lib/storage";
import { apiFetch } from "@/app/lib/api";

type RecordState = "idle" | "recording" | "uploading" | "done" | "failed";

export default function StoryPage() {
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [pulseSize, setPulseSize] = useState(1);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const pendingBlobRef = useRef<Blob | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulseRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const router = useRouter();

  useEffect(() => {
    return () => {
      timerRef.current && clearInterval(timerRef.current);
      pulseRef.current && clearInterval(pulseRef.current);
      mediaRef.current?.state === "recording" && mediaRef.current.stop();
    };
  }, []);

  async function uploadBlob(blob: Blob): Promise<boolean> {
    // Await the upload (not fire-and-forget). On mobile, navigation often
    // killed the in-flight request before `keepalive` could finish, leaving
    // the admin with the "[voice response]" placeholder and no audio row.
    const submissionId = getQuizState("frinq_submission_id");
    if (!submissionId) { setUploadError("no submission id — please retry"); return false; }
    if (blob.size === 0) { setUploadError("empty recording"); return false; }
    const fd = new FormData();
    fd.append("submission_id", submissionId);
    fd.append("question_key", "story");
    fd.append("duration_sec", String(secondsRef.current));
    fd.append("audio", blob, "story.webm");
    try {
      const res = await apiFetch("/api/v1/voice", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        setUploadError(`upload failed (${res.status}) ${body.slice(0, 80)}`);
        return false;
      }
      setUploadError(null);
      return true;
    } catch (err) {
      setUploadError(`network error: ${err instanceof Error ? err.message : "unknown"}`);
      return false;
    }
  }

  async function retryUpload() {
    const blob = pendingBlobRef.current;
    if (!blob) return;
    setRecordState("uploading");
    const ok = await uploadBlob(blob);
    setRecordState(ok ? "done" : "failed");
  }

  async function startRecording() {
    window.frinqTrack?.("click", { page: "/story", element: "start_recording" });
    setUploadError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        pendingBlobRef.current = blob;
        setRecordState("uploading");
        const ok = await uploadBlob(blob);
        setRecordState(ok ? "done" : "failed");
      };
      mr.start();
      mediaRef.current = mr;
      setRecordState("recording");
      setSeconds(0);
      secondsRef.current = 0;
      timerRef.current = setInterval(() => setSeconds((s) => {
        secondsRef.current = s + 1;
        return s + 1;
      }), 1000);
      pulseRef.current = setInterval(() => {
        setPulseSize((p) => (p === 1 ? 1.15 : 1));
      }, 600);
    } catch {
      // mic denied — fall through to text mode
    }
  }

  function stopRecording() {
    window.frinqTrack?.("click", { page: "/story", element: "stop_recording", duration: seconds });
    timerRef.current && clearInterval(timerRef.current);
    pulseRef.current && clearInterval(pulseRef.current);
    setPulseSize(1);
    mediaRef.current?.stop();
  }

  function goNext() {
    const usedVoice = recordState === "done";
    window.frinqTrack?.("submit", { page: "/story", mode: usedVoice ? "voice" : "text" });
    // Store transcript if typed; otherwise mark voice. The placeholder
    // "[voice response]" is the admin's signal to look in the voice_clips
    // table for the actual audio.
    setQuizState("frinq_story", transcript || (usedVoice ? "[voice response]" : ""));
    if (document.startViewTransition) {
      document.startViewTransition(() => { router.push("/connection"); });
    } else {
      router.push("/connection");
    }
  }

  // Block "next" while uploading. Allow next on either successful upload
  // (done) or a typed transcript. Failed upload requires retry.
  const canProceed = recordState === "done" || (recordState !== "uploading" && transcript.trim().length > 0);

  function fmt(s: number) {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col">
      <Header section="s2 · what would you do" backHref="/meeting-style" />

      <main className="flex-1 flex flex-col justify-center px-8 pt-20 pb-16 md:px-[min(12vw,180px)]">
        <div className="animate-fade-up max-w-2xl">
          <QuestionLabel>think of a time you made a friend unexpectedly.</QuestionLabel>
          <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[14px] mb-10">
            how did it happen? speak or type briefly.
          </p>

          {/* Voice recorder */}
          <div className="flex flex-col items-center gap-6 mb-8">
            {recordState === "idle" && (
              <button
                onClick={startRecording}
                className="flex flex-col items-center gap-3 group"
              >
                <div className="w-16 h-16 rounded-full border border-[rgba(42,24,16,0.2)] flex items-center justify-center bg-white/50 hover:bg-white/80 hover:border-[rgba(42,24,16,0.4)] transition-all duration-200 group-hover:scale-105">
                  <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
                    <rect x="6" y="1" width="8" height="14" rx="4" stroke="#2A1810" strokeWidth="1.2" />
                    <path d="M2 11c0 4.4 3.6 8 8 8s8-3.6 8-8" stroke="#2A1810" strokeWidth="1.2" strokeLinecap="round" />
                    <line x1="10" y1="19" x2="10" y2="23" stroke="#2A1810" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.18em] text-[#8B7355]">
                  tap to speak
                </span>
              </button>
            )}

            {recordState === "recording" && (
              <button onClick={stopRecording} className="flex flex-col items-center gap-3">
                <div
                  className="w-16 h-16 rounded-full bg-[#7C1C0B] flex items-center justify-center transition-transform duration-500"
                  style={{ transform: `scale(${pulseSize})` }}
                >
                  {/* waveform bars */}
                  <div className="flex gap-[3px] items-center h-5">
                    {[3, 5, 8, 5, 3].map((h, i) => (
                      <div
                        key={i}
                        className="w-[3px] rounded-full bg-white animate-pulse"
                        style={{ height: `${h * 2}px`, animationDelay: `${i * 100}ms` }}
                      />
                    ))}
                  </div>
                </div>
                <span className="font-[family-name:var(--font-motive)] text-[11px] tracking-[0.16em] text-[#7C1C0B]">
                  {fmt(seconds)} · tap to stop
                </span>
              </button>
            )}

            {recordState === "uploading" && (
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full border border-[rgba(42,24,16,0.2)] bg-white/60 flex items-center justify-center">
                  <span className="block w-4 h-4 rounded-full border-2 border-[#7C1C0B] border-t-transparent animate-spin" />
                </div>
                <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.18em] text-[#7C1C0B]">
                  saving voice…
                </span>
              </div>
            )}

            {recordState === "done" && (
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full border border-[#7C1C0B] bg-[rgba(124,28,11,0.06)] flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3 9l4.5 4.5L15 4.5" stroke="#7C1C0B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.18em] text-[#7C1C0B]">
                  {fmt(seconds)} saved
                </span>
                <button
                  onClick={startRecording}
                  className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] text-[#8B7355] hover:text-[#2A1810] transition-colors underline underline-offset-2"
                >
                  record again
                </button>
              </div>
            )}

            {recordState === "failed" && (
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full border border-red-500 bg-red-50 flex items-center justify-center">
                  <span className="text-red-600 font-bold text-lg">!</span>
                </div>
                <span className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.18em] text-red-600 text-center max-w-[240px]">
                  {uploadError || "upload failed"}
                </span>
                <div className="flex gap-3">
                  <button onClick={retryUpload}
                    className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] text-[#7C1C0B] underline underline-offset-2">
                    retry upload
                  </button>
                  <button onClick={startRecording}
                    className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.14em] text-[#8B7355] underline underline-offset-2">
                    record again
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-[rgba(42,24,16,0.1)]" />
            <span className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.2em] text-[#8B7355]">or type</span>
            <div className="flex-1 h-px bg-[rgba(42,24,16,0.1)]" />
          </div>

          <textarea
            className="w-full bg-transparent border-b border-[rgba(42,24,16,0.2)] focus:border-[#2A1810] focus:outline-none font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] placeholder:text-[rgba(42,24,16,0.2)] resize-none pb-2 transition-colors"
            rows={2}
            placeholder="we were both waiting for the same..."
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />

          <div className="flex gap-6 mt-6 items-center">
            <button
              onClick={goNext}
              disabled={!canProceed}
              className="inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors group disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {recordState === "uploading" ? "saving…" : "next"}
              <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="transition-transform group-hover:translate-x-1">
                <path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
