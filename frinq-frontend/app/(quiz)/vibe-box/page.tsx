"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import NavLink from "@/app/components/NavLink";
import { getQuizState, setQuizState } from "@/app/lib/storage";
import { apiFetch } from "@/app/lib/api";
import { track } from "@/app/lib/analytics";

// force-dynamic removed for static export (Task 13) — unsupported under
// output: "export" and would fail the build. See app/page.tsx.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

interface Insight { label: string; text: string; }

interface ShareCardServer {
  archetype?: string;
  archetype_slug?: string;
  nickname?: string;
  description?: string;
  archetype_desc?: string;
  headline?: string;
  pull_quote?: string;
  share_quote?: string;
  tags?: string[];
  stats?: {
    social_energy: number; peak_time: string; group_role: string;
    group_effect: number; secret_edge: string; rarity: string;
  };
}

interface SignalTrait { label: string; text: string; }
interface ReadNote { label: string; text: string; }
interface Snapshot {
  first_read: string; after_time: string; under_stress: string; what_wins_you: string;
}

// The "know more" report — matches the frinq vibe report design. Every
// field carries a hard word-count cap set server-side (see
// app/core/ai/openai_client.py) so it fits its fixed-size box without
// overflowing into a wall of text.
interface DeepSummary {
  report_quote?: string;
  signal_trait?: SignalTrait;
  signal_archetype_text?: string;
  narrative?: string[];
  mirror?: string;
  first_impression?: string;
  hidden_pattern?: string;
  unspoken_need?: string;
  read_notes?: ReadNote[];
  closing_line?: string;
  snapshot?: Snapshot;
}

interface SummaryData {
  name?: string | null;
  headline: string;
  archetype: string;
  archetype_desc: string;
  share_quote: string;
  spirit_animal?: string;
  spirit_desc?: string;
  insights: Insight[];
  tags: string[];
  share_card?: ShareCardServer | null;
  deep_summary?: DeepSummary | null;
}

// ─── Loading / opening animations (unchanged from prior build) ───────────────

// Longer pool — Claude can take 15-25s on the first call. Static or
// short rotations made the wait feel longer than it is. Each line shows
// for ~2.4s and the LAST line ("nearly there...") sticks once reached.
const LOADER_LINES = [
  "frinq is reading between the lines",
  "noticing what you didn't say out loud",
  "cross-referencing your rapid-fires",
  "the contradictions are the interesting part",
  "connecting the dots",
  "writing the field guide entry on you",
  "finding the one quiet thing nobody's told you",
  "polishing the headline",
  "nearly there",
];

/**
 * Envelope opens; a card slides up out of the envelope, then grows to fill
 * the screen, transitioning into the full ProfileReveal.
 *
 * Phases (in order):
 *   closed: envelope sealed (brief)
 *   flap:   top flap rotates open
 *   card:   small card peeks above the envelope, then slides up
 *   grow:   card grows toward full-screen size
 *   fade:   crossfade hands off to ProfileReveal
 */
function EnvelopeOpening({ onDone, archetypeName }: { onDone: () => void; archetypeName?: string }) {
  const [phase, setPhase] = useState<"closed" | "flap" | "card" | "grow" | "fade">("closed");

  useEffect(() => {
    // rAF wrapper so the browser commits the initial closed-state layout
    // BEFORE the transitions start. Without it, some Android Chrome builds
    // skip the first transition entirely (envelope just jumps open).
    const raf = requestAnimationFrame(() => {
      const t1 = setTimeout(() => setPhase("flap"), 200);
      const t2 = setTimeout(() => setPhase("card"), 1000);
      const t3 = setTimeout(() => setPhase("grow"), 1900);
      const t4 = setTimeout(() => setPhase("fade"), 2700);
      const t5 = setTimeout(onDone, 3100);
      return () => { [t1, t2, t3, t4, t5].forEach(clearTimeout); };
    });
    return () => cancelAnimationFrame(raf);
  }, [onDone]);

  // Card slides out and grows: progress 0 → 1 mapped to vertical position
  // and size scale.
  const cardBottom = phase === "closed" || phase === "flap"
    ? 30  // hidden behind envelope back
    : phase === "card"
    ? 130  // peeked out above the envelope
    : phase === "grow"
    ? 240
    : 360;

  const cardScale = phase === "grow" || phase === "fade" ? 4 : 1;
  const cardOpacity = phase === "fade" ? 0 : 1;
  const envelopeOpacity = phase === "grow" || phase === "fade" ? 0 : 1;

  return (
    <div className="flex flex-col items-center justify-center bg-[#F5F0E8]" style={{ height: "100dvh", overflow: "hidden" }}>
      <div className="relative" style={{ width: 220, height: 320, perspective: "800px" }}>
        {/* Envelope body — back + flap */}
        <svg
          width="220" height="170" viewBox="0 0 220 170" fill="none"
          className="absolute left-0"
          style={{
            bottom: 0,
            opacity: envelopeOpacity,
            transition: "opacity 380ms ease",
          }}
        >
          {/* Back of envelope */}
          <rect x="3" y="3" width="214" height="164" rx="6" stroke="#2A1810" strokeWidth="1.8" fill="#FFFBF5" />
          {/* V-fold lines */}
          <path d="M3 167L110 90L217 167" stroke="#2A1810" strokeWidth="1.4" />
          <path d="M3 3L110 90" stroke="#2A1810" strokeWidth="1.4" opacity="0.5" />
          <path d="M217 3L110 90" stroke="#2A1810" strokeWidth="1.4" opacity="0.5" />
        </svg>

        {/* Top flap — rotates open */}
        <svg
          width="220" height="100" viewBox="0 0 220 100" fill="none"
          className="absolute left-0"
          style={{
            bottom: 140,
            transformOrigin: "110px 100px",
            transform: phase === "closed" ? "rotateX(0deg)" : "rotateX(-175deg)",
            transition: "transform 700ms cubic-bezier(0.4,0,0.2,1)",
            opacity: envelopeOpacity,
            transitionProperty: "transform, opacity",
            transitionDuration: "700ms, 380ms",
          }}
        >
          <path d="M3 3L110 90L217 3" stroke="#2A1810" strokeWidth="1.8" fill="#F0EBE0" />
        </svg>

        {/* The card — slides out, then grows, then fades into reveal */}
        <div
          className="absolute left-1/2"
          style={{
            bottom: cardBottom,
            width: 160,
            height: 200,
            transform: `translateX(-50%) scale(${cardScale})`,
            transformOrigin: "center center",
            opacity: cardOpacity,
            transition: phase === "grow"
              ? "bottom 600ms cubic-bezier(0.4,0,0.2,1), transform 600ms cubic-bezier(0.4,0,0.2,1)"
              : phase === "fade"
              ? "opacity 400ms ease"
              : "bottom 700ms cubic-bezier(0.34,1.2,0.64,1)",
            willChange: "bottom, transform, opacity",
          }}
        >
          <div style={{
            width: "100%", height: "100%",
            background: "#F5F0E8",
            border: "1.5px solid rgba(124,28,11,0.45)",
            borderRadius: 10,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: 14, gap: 8,
            boxShadow: "0 8px 24px rgba(124,28,11,0.18)",
          }}>
            <span style={{
              fontFamily: "var(--font-motive), sans-serif",
              fontSize: 8, letterSpacing: "0.32em",
              color: "#7C1C0B", textTransform: "uppercase",
            }}>you are a</span>
            <span style={{
              fontFamily: "var(--font-things), Georgia, serif",
              fontSize: 22, lineHeight: 1.05,
              color: "#7C1C0B", textAlign: "center", textTransform: "uppercase",
            }}>{archetypeName || "rare kind"}</span>
            <div style={{ width: 28, height: 1.5, background: "rgba(124,28,11,0.45)", margin: "4px 0" }} />
            <span style={{
              fontFamily: "var(--font-things), Georgia, serif",
              fontSize: 9, color: "#8B7355",
              letterSpacing: "0.16em", textTransform: "uppercase",
            }}>vibe audit · fq</span>
          </div>
        </div>

        {/* Wax seal — visible on closed envelope only */}
        {(phase === "closed") && (
          <svg width="220" height="100" viewBox="0 0 220 100" fill="none" className="absolute left-0"
            style={{ bottom: 140, opacity: phase === "closed" ? 1 : 0, transition: "opacity 240ms ease" }}>
            <circle cx="110" cy="50" r="16" fill="#7C1C0B" />
            <text x="110" y="55" textAnchor="middle" fill="#F5F0E8" fontSize="10" fontFamily="serif" fontWeight="bold">fq</text>
          </svg>
        )}
      </div>
    </div>
  );
}

function LoaderScreen() {
  const [lineIdx, setLineIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const lineTimer = setInterval(() => setLineIdx((i) => Math.min(i + 1, LOADER_LINES.length - 1)), 2400);
    const elapsedTimer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => { clearInterval(lineTimer); clearInterval(elapsedTimer); };
  }, []);

  // Multi-ring pulse + 3 concentric expanding rings + floating dots.
  // Heavier visual than before because Claude latency on first call can
  // be 20-30s and the previous single-pulse felt static.
  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col items-center justify-center px-8 select-none gap-10 relative">
      {/* Floating particles in the background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              width: 4 + (i % 3) * 2,
              height: 4 + (i % 3) * 2,
              background: "#7C1C0B",
              opacity: 0.16 + (i % 3) * 0.05,
              left: `${15 + i * 14}%`,
              top: `${20 + ((i * 23) % 60)}%`,
              animation: `fq-particle-drift ${5 + i * 0.8}s ease-in-out ${i * 0.3}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Triple ring + center dot */}
      <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
        <span className="absolute rounded-full" style={{
          width: 14, height: 14, background: "#7C1C0B",
          animation: "fq-loader-pulse 1.6s ease-in-out infinite",
        }}/>
        <span className="absolute rounded-full" style={{
          width: 14, height: 14, border: "1.5px solid #7C1C0B",
          animation: "fq-loader-ring 1.6s ease-out infinite",
        }}/>
        <span className="absolute rounded-full" style={{
          width: 14, height: 14, border: "1.5px solid #7C1C0B",
          animation: "fq-loader-ring 1.6s ease-out 0.55s infinite",
        }}/>
        <span className="absolute rounded-full" style={{
          width: 14, height: 14, border: "1.5px solid #7C1C0B",
          animation: "fq-loader-ring 1.6s ease-out 1.1s infinite",
        }}/>
      </div>

      <div className="flex flex-col items-center gap-3 relative" style={{ zIndex: 1 }}>
        <p
          key={lineIdx}
          className="font-[family-name:var(--font-things)] text-[#2A1810] text-center max-w-sm"
          style={{
            fontSize: "clamp(16px, 3vw, 22px)",
            animation: "fq-loader-fade 600ms ease-out",
          }}
        >
          {LOADER_LINES[lineIdx]}
        </p>
        {/* Reassurance once it's clear AI is slow */}
        {elapsed > 12 && (
          <p
            className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.18em] text-[#8B7355] uppercase mt-1"
            style={{ animation: "fq-loader-fade 600ms ease-out" }}
          >
            hang tight — good things take a sec
          </p>
        )}
      </div>
      <style>{`
        @keyframes fq-loader-pulse {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50%       { opacity: 1;   transform: scale(1.1); }
        }
        @keyframes fq-loader-ring {
          0%   { opacity: 0.7; transform: scale(0.5); }
          100% { opacity: 0;   transform: scale(4.5); }
        }
        @keyframes fq-loader-fade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fq-particle-drift {
          0%, 100% { transform: translate(0, 0); }
          50%      { transform: translate(8px, -14px); }
        }
      `}</style>
    </div>
  );
}

// Rotating sealed-envelope copy. Title above envelope, subtitle below.
const SEALED_VARIANTS: Array<{ title: string; subtitle: string }> = [
  {
    title: "frinq is ready to read between your lines.",
    subtitle: "tap the envelope when you are.",
  },
  {
    title: "let's see what frinq finds between the lines.",
    subtitle: "tap the envelope to open it.",
  },
  {
    title: "let's see what's inside.",
    subtitle: "tap the envelope to open it.",
  },
  {
    title: "let's see what's beneath the surface.",
    subtitle: "tap the envelope to open it.",
  },
];

function SealedEnvelope({ name, onOpen }: { name: string; onOpen: () => void }) {
  const [visible, setVisible] = useState(false);
  // Pick a variant once per mount so the copy doesn't change mid-screen.
  const [copy] = useState(() => SEALED_VARIANTS[Math.floor(Math.random() * SEALED_VARIANTS.length)]);
  useEffect(() => { setTimeout(() => setVisible(true), 60); }, []);
  return (
    <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col" style={{ opacity: visible ? 1 : 0, transition: "opacity 500ms ease" }}>
      <header className="flex items-center justify-between px-8 py-5">
        <NavLink href="/" className="no-underline inline-block">
          <Image src="/fq-logo.png" alt="frinq" width={38} height={38} className="w-[38px] h-[38px]" />
        </NavLink>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-8 pb-24 pt-6 text-center">
        <div className="flex flex-col items-center gap-8 max-w-sm">
          <button onClick={onOpen} className="cursor-pointer focus:outline-none" aria-label="open your profile">
            <svg width="160" height="120" viewBox="0 0 160 120" fill="none">
              <rect x="2" y="2" width="156" height="116" rx="5" stroke="#2A1810" strokeWidth="1.8" fill="white" fillOpacity="0.5" />
              <path d="M2 118L80 66L158 118" stroke="#2A1810" strokeWidth="1.4" />
              <path d="M2 2L80 66" stroke="#2A1810" strokeWidth="1.4" opacity="0.4" />
              <path d="M158 2L80 66" stroke="#2A1810" strokeWidth="1.4" opacity="0.4" />
              <path d="M2 2L80 62L158 2" stroke="#2A1810" strokeWidth="1.8" fill="#F0EBE0" />
              <circle cx="80" cy="68" r="14" fill="#7C1C0B" />
              <text x="80" y="72" textAnchor="middle" fill="white" fontSize="9" fontFamily="serif" fontWeight="bold">fq</text>
            </svg>
          </button>
          {name && (
            <p className="font-[family-name:var(--font-things)] text-[#2A1810]" style={{ fontSize: "clamp(20px, 4vw, 30px)" }}>
              {name},
            </p>
          )}
          <div className="flex flex-col items-center gap-2">
            <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[17px] leading-snug">
              {copy.title}
            </p>
            <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[15px]">
              {copy.subtitle}
            </p>
          </div>
          <button onClick={onOpen} className="mt-1 inline-flex items-center gap-3 text-[11px] font-[family-name:var(--font-motive)] tracking-[0.16em] text-[#2A1810] hover:text-[#7C1C0B] transition-colors group">
            open
            <svg width="20" height="8" viewBox="0 0 20 8" fill="none" className="transition-transform group-hover:translate-x-1.5">
              <path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      </main>
    </div>
  );
}

// ─── "frinq vibe report" — the full summary page design ─────────────────────
// Ported from the user-approved static mockup (SUmmary/character-card.html).
// Palette + serif "Things" headings match the reference. Body/label text uses
// the brand sans "Motive" (loaded in globals.css) instead of the mockup's
// placeholder system-monospace — `mono` is kept as the key name but resolves
// to the Motive stack so every report label/paragraph renders in Motive.

const RPT = {
  cream: "#f4eee2",
  ink: "#201a15",
  red: "#8a2018",
  muted: "#6b5d4a",
  line: "#d8cbb6",
  lineSoft: "rgba(216,203,182,.72)",
  paper: "rgba(248,242,231,.28)",
  mono: "var(--font-motive), system-ui, sans-serif",
} as const;

function ReportLabel({ children }: { children: React.ReactNode }) {
  return (
    <>
      <p style={{ fontFamily: RPT.mono, fontSize: 11, letterSpacing: "0.12em", textTransform: "lowercase", color: RPT.red, fontWeight: 700 }}>
        {children}
      </p>
      <div style={{ height: 1, background: RPT.line, marginTop: 10 }} />
    </>
  );
}

function SignalCard({ label, text }: { label: string; text: string }) {
  return (
    <div style={{
      display: "flex", minHeight: 94, flexDirection: "column", justifyContent: "center",
      background: RPT.red, color: RPT.cream, borderRadius: 14, padding: "16px 14px",
      overflowWrap: "anywhere",
    }}>
      <strong style={{ fontFamily: "var(--font-things), Georgia, serif", fontSize: 22, fontWeight: 400, lineHeight: 1.08, display: "block" }}>
        {label}
      </strong>
      <span style={{ display: "block", marginTop: 7, fontFamily: RPT.mono, fontSize: 10.5, lineHeight: 1.45, color: "rgba(244,238,226,.72)" }}>
        {text}
      </span>
    </div>
  );
}

function BreakCard({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ border: `1px solid ${RPT.line}`, borderRadius: 14, padding: "17px 18px", marginTop: 14, background: RPT.paper, overflowWrap: "anywhere" }}>
      <h3 style={{ fontFamily: "var(--font-things), Georgia, serif", fontWeight: 400, fontSize: 23, marginBottom: 9, color: RPT.red }}>{title}</h3>
      <p style={{ fontFamily: RPT.mono, fontSize: 12.5, lineHeight: 1.63, color: RPT.ink }}>{text}</p>
    </div>
  );
}

const READ_NOTE_ICONS = [
  <path key="a" d="M4 21V5l8 3 8-4v13M4 13l8 3 8-4" />,
  <path key="b" d="M12 21c-4-6-6-8-6-12a6 6 0 0 1 12 0c0 4-2 6-6 12zM12 3v6" />,
  <path key="c" d="M6 16a4 4 0 0 1 0-8 5 5 0 0 1 9.5-1.5A4 4 0 0 1 18 16z" />,
];

function ReadNoteRow({ note, icon }: { note: ReadNote; icon: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 11, alignItems: "flex-start" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke={RPT.red} strokeWidth={1.6} style={{ width: 19, height: 19, marginTop: 2 }}>{icon}</svg>
      <div>
        <strong style={{ display: "block", marginBottom: 2, fontFamily: RPT.mono, fontSize: 11, color: RPT.red, letterSpacing: "0.07em", textTransform: "lowercase" }}>
          {note.label}
        </strong>
        <p style={{ fontFamily: RPT.mono, fontSize: 11.5, lineHeight: 1.58, color: RPT.ink }}>{note.text}</p>
      </div>
    </div>
  );
}

function SnapshotRow({ name, text, first, last }: { name: string; text: string; first?: boolean; last?: boolean }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "118px 1fr", gap: 14, alignItems: "start",
      paddingTop: first ? 2 : 12, paddingBottom: last ? 2 : 12,
      borderBottom: last ? "none" : `1px solid ${RPT.lineSoft}`,
    }}>
      <div style={{ fontFamily: RPT.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "lowercase", color: RPT.red }}>{name}</div>
      <p style={{ fontFamily: RPT.mono, fontSize: 12.2, lineHeight: 1.55, color: RPT.ink }}>{text}</p>
    </div>
  );
}

// ─── Defensive coercion ─────────────────────────────────────────────────────
// The generation model is not perfectly
// schema-stable: a field the UI expects as a plain string sometimes arrives
// as {text, label} or an array. Rendering an object as a React child throws
// and takes down the whole report, so every value is funneled through asText/
// asPair before it reaches JSX. This is belt-and-braces with the server-side
// normalizer in openai_client.py.

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(" ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.text === "string") return o.text;
    if (typeof o.label === "string") return o.label;
    return Object.values(o).filter((x) => typeof x === "string").join(" ");
  }
  return String(v);
}

function asPair(v: unknown): { label: string; text: string } {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return { label: asText(o.label), text: asText(o.text) };
  }
  // A bare string can't be split into label+text — put it in text.
  return { label: "", text: asText(v) };
}

function VibeReport({ ds, archetype, quote }: { ds: DeepSummary; archetype: string; quote: string }) {
  // Normalize once — every downstream render reads clean strings only.
  const signalArchetypeText = asText(ds.signal_archetype_text);
  const signalTrait = ds.signal_trait ? asPair(ds.signal_trait) : null;
  const narrative = Array.isArray(ds.narrative) ? ds.narrative.map(asText).filter(Boolean) : [];
  const mirror = asText(ds.mirror);
  const firstImpression = asText(ds.first_impression);
  const hiddenPattern = asText(ds.hidden_pattern);
  const unspokenNeed = asText(ds.unspoken_need);
  const readNotes = Array.isArray(ds.read_notes) ? ds.read_notes.map(asPair).filter((n) => n.label || n.text) : [];
  const closingLine = asText(ds.closing_line);
  const snap = ds.snapshot;

  const hiddenPatternUnspokenNeed = (
    <>
      {hiddenPattern && <BreakCard title="hidden pattern" text={hiddenPattern} />}
      {unspokenNeed && <BreakCard title="unspoken need" text={unspokenNeed} />}
    </>
  );

  return (
    <div>
      <div className="relative grid grid-cols-1 md:grid-cols-2 md:gap-x-10">
        <div className="hidden md:block absolute top-0 bottom-0 left-1/2 w-px" style={{ background: RPT.line }} />

        {/* Left column (mobile: whole thing, in order) */}
        <div>
          {/* Archetype title + decorative rule + opening quote */}
          <h2 style={{ fontFamily: "var(--font-things), Georgia, serif", fontSize: "clamp(35px, 9vw, 43px)", lineHeight: 1.02, color: RPT.ink, margin: "8px 0 0", overflowWrap: "anywhere" }}>
            the {archetype.toLowerCase()}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0 10px" }}>
            <span style={{ height: 1, width: 56, background: RPT.line }} />
            <span style={{ color: RPT.red, fontFamily: "var(--font-things), Georgia, serif" }}>&#10022;</span>
          </div>
          {quote && (
            <div style={{ marginTop: 10, overflowWrap: "anywhere" }}>
              <span style={{ color: RPT.red, fontFamily: "var(--font-things), Georgia, serif", fontSize: 17 }}>&ldquo;</span>
              <span style={{ fontFamily: "var(--font-things), Georgia, serif", fontStyle: "italic", fontSize: 15.5, lineHeight: 1.42, color: RPT.ink }}>{quote}</span>
              <span style={{ color: RPT.red, fontFamily: "var(--font-things), Georgia, serif", fontSize: 17, marginLeft: 2 }}>&rdquo;</span>
            </div>
          )}

          {(signalArchetypeText || signalTrait) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 18, overflow: "hidden", borderRadius: 16, boxShadow: "0 12px 30px rgba(138,32,24,.08)" }}>
              {signalArchetypeText && <SignalCard label={archetype.toLowerCase()} text={signalArchetypeText} />}
              {signalTrait && (signalTrait.label || signalTrait.text) && <SignalCard label={signalTrait.label || archetype.toLowerCase()} text={signalTrait.text} />}
            </div>
          )}

          {narrative.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12, maxWidth: "42em" }}>
              {narrative.map((p, i) => (
                <p key={i} style={{ fontFamily: RPT.mono, fontSize: 12.5, lineHeight: 1.72, color: RPT.ink, textAlign: "left" }}>{p}</p>
              ))}
            </div>
          )}

          <div className="mt-7">
            <ReportLabel>who you are, when no one&apos;s watching</ReportLabel>
            {mirror && <BreakCard title="mirror" text={mirror} />}
            {firstImpression && <BreakCard title="first impression" text={firstImpression} />}
            <div className="md:hidden">{hiddenPatternUnspokenNeed}</div>
          </div>
        </div>

        {/* Right column (desktop only — on mobile this content just continues below) */}
        <div className="mt-7 md:mt-0">
          <div className="hidden md:block">{hiddenPatternUnspokenNeed}</div>

          {readNotes.length > 0 && (
            <div className="mt-7">
              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 13 }}>
                {readNotes.map((note, i) => (
                  <ReadNoteRow key={i} note={note} icon={READ_NOTE_ICONS[i % READ_NOTE_ICONS.length]} />
                ))}
              </div>
            </div>
          )}

          {closingLine && (
            <div className="mt-7" style={{
              background: RPT.red, color: RPT.cream, borderRadius: 14, padding: 22,
              fontFamily: "var(--font-things), Georgia, serif", fontSize: 21, lineHeight: 1.38,
              boxShadow: "0 12px 28px rgba(138,32,24,.1)", overflowWrap: "anywhere",
            }}>
              {closingLine}
            </div>
          )}

          {snap && (
            <div className="mt-7">
              <div style={{ border: `1px solid ${RPT.line}`, borderRadius: 14, padding: "17px 16px", background: RPT.paper }}>
                <SnapshotRow name="first read" text={asText(snap.first_read)} first />
                <SnapshotRow name="after time" text={asText(snap.after_time)} />
                <SnapshotRow name="under stress" text={asText(snap.under_stress)} />
                <SnapshotRow name="what wins you" text={asText(snap.what_wins_you)} last />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileReveal({ data }: { data: SummaryData }) {
  const sc = data.share_card || {};
  const ds = data.deep_summary || null;
  const archetypeSlug = sc.archetype_slug || data.archetype.toLowerCase().replace(/[^a-z]+/g, "-");
  // Personalize the tape — "an insight into dhairya, by frinq". API name wins
  // (correct for previews of other users); falls back to the local quiz name.
  const firstName = (data.name || getQuizState<string>("frinq_name") || "")
    .trim().split(/\s+/)[0]?.toLowerCase() || "";
  // The italic opening quote under the archetype title. Prefer the dedicated
  // report_quote; fall back to the headline / share_quote so the slot always
  // fills even for summaries generated before report_quote existed.
  const quote = asText(ds?.report_quote) || data.headline || data.share_quote || "";

  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // Land the reader at the top of the report. The preceding WhatsNextScreen
    // can be scrolled down when the user taps through, and the browser may
    // restore that offset after this mounts — so we reset now and again on
    // the next frame (after layout) to defeat scroll restoration.
    window.scrollTo(0, 0);
    const raf = requestAnimationFrame(() => window.scrollTo(0, 0));
    const t = setTimeout(() => setVisible(true), 60);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, []);

  return (
    <div
      className="min-h-dvh"
      style={{
        opacity: visible ? 1 : 0, transition: "opacity 700ms ease",
        background: "linear-gradient(180deg,#f4eee2,#f1e8d9 72%,#f4eee2)",
        color: RPT.ink,
      }}
    >
      <div className="mx-auto w-full px-5 py-6 md:px-11 md:py-10 max-w-[454px] md:max-w-[1080px]">
        {/* Top bar: logo + tagline */}
        <div className="flex items-center justify-between gap-3">
          <NavLink href="/" className="no-underline inline-block">
            <Image src="/fq-logo.png" alt="frinq" width={40} height={40} className="w-[40px] h-[40px]" style={{ borderRadius: 11 }} />
          </NavLink>
          <div style={{ fontFamily: RPT.mono, fontSize: 10, letterSpacing: "0.06em", color: RPT.red, textAlign: "right", lineHeight: 1.5, fontWeight: 700 }}>
            know your pattern.<br />live your story.
          </div>
        </div>

        {/* Hero row: title + duck + tape */}
        <div className="flex flex-col items-center gap-2 mt-4 md:flex-row md:justify-between md:items-center md:mt-6" style={{ animation: "fq-slide-up 600ms ease 60ms both" }}>
          <h1 style={{ fontFamily: "var(--font-things), Georgia, serif", fontWeight: 400, fontSize: "clamp(28px, 7vw, 44px)", lineHeight: 1.04, letterSpacing: "0.01em" }}>
            frinq <span style={{ color: RPT.red }}>vibe</span> report
          </h1>
          <div className="flex flex-col items-center gap-2">
            <div className="relative" style={{ width: "min(46%, 168px)" }}>
              <Image
                src={`/illustrations/archetypes/${archetypeSlug}.png`}
                alt={data.archetype} width={184} height={184}
                className="w-full h-auto block"
                style={{ mixBlendMode: "multiply", filter: "drop-shadow(0 10px 16px rgba(32,26,21,.08))" }}
                priority
                onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.25"; }}
              />
            </div>
            <span style={{ display: "inline-block", maxWidth: "100%", background: "#ece0c9", border: "1px dashed #c9b58c", fontFamily: RPT.mono, fontSize: 12, lineHeight: 1.35, color: RPT.muted, padding: "7px 13px", textAlign: "center", overflowWrap: "anywhere" }}>
              an insight into {firstName || "you"}, by frinq
            </span>
          </div>
        </div>

        <div style={{ height: 1, background: RPT.line, margin: "22px 0" }} className="md:my-[30px]" />

        {/* The report */}
        {ds ? (
          <VibeReport ds={ds} archetype={data.archetype} quote={quote} />
        ) : (
          <p style={{ fontFamily: "var(--font-things), Georgia, serif", color: RPT.muted, fontSize: 15, textAlign: "center", padding: "48px 0" }}>
            still putting your deeper read together — check back on this page shortly.
          </p>
        )}
      </div>

      <style>{`
        @keyframes fq-slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
// ─── "What's next" interstitial ──────────────────────────────────────────────

/**
 * Shown after the envelope opens, BEFORE the profile reveal. Sets the
 * expectation that frinq is invite-only / Delhi-NCR-only, communication
 * will happen on WhatsApp, and the launch is gated on the first 100
 * users. Also fires the templated WhatsApp send (idempotent — backend
 * tracks whatsapp_sent_at). User taps "show me my read" to continue.
 */
function WhatsNextScreen({ name, archetype, onContinue }: { name: string; archetype: string; onContinue: () => void }) {
  const [visible, setVisible] = useState(false);
  const firstName = (name || "").trim().split(/\s+/)[0] || "friend";
  useEffect(() => { setTimeout(() => setVisible(true), 60); }, []);

  // Fire the WhatsApp send once on mount. Idempotent server-side, so a
  // double-render or remount won't double-message. Fire-and-forget is
  // fine here — the UX doesn't depend on the response and any failure
  // is logged in DO for ronak to action manually.
  useEffect(() => {
    const sid = getQuizState("frinq_submission_id");
    if (!sid || !API_URL) return;
    fetch(`${API_URL}/api/v1/whatsapp/notify/${sid}`, { method: "POST", keepalive: true })
      .catch(() => { /* non-fatal */ });
  }, []);

  const bullets = [
    {
      label: "YOUR PLAN IS GETTING READY",
      text: "we will find you the right events, meetups and fun activities to go to with a person or group that fits your vibe.",
    },
    {
      label: "WHEN",
      text: "we're reviewing profiles now. once we hit 100 the first matches go out. expect it in 2-3 weeks.",
    },
    {
      label: "HOW YOU'LL HEAR FROM US",
      text: "everything on whatsapp. invites, your match, the plan. no app to download. just save the number.",
    },
    {
      label: "WHY YOU'RE HERE",
      text: "this isn't a waitlist. we read every quiz. you're here because your answers were worth reading.",
    },
  ];

  return (
    <div className="min-h-dvh bg-[#F5F0E8] flex flex-col" style={{ opacity: visible ? 1 : 0, transition: "opacity 600ms ease" }}>
      <header className="flex items-center justify-between px-8 py-5 flex-shrink-0">
        <Image src="/fq-logo.png" alt="frinq" width={38} height={38} className="w-[38px] h-[38px]" />
      </header>
      <main className="flex-1 flex flex-col items-center px-6 pt-4 pb-32 md:px-[min(10vw,160px)]">
        <div className="max-w-md w-full">
          {/* Header — addressed by name */}
          <div style={{ animation: "fq-slide-up 600ms ease 60ms both" }}>
            <h1 className="font-[family-name:var(--font-things)] text-[#2A1810] leading-[1.05]"
              style={{ fontSize: "clamp(28px, 6vw, 42px)" }}>
              {firstName}, your profile is ready.
            </h1>
            <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[16px] mt-3 leading-snug">
              not everyone who took the quiz makes it through. sit tight while we go through it and deeply understand you. here&apos;s what happens next;
            </p>
          </div>

          {/* Four numbered facts */}
          <div className="mt-10 flex flex-col gap-5">
            {bullets.map((b, i) => (
              <div key={b.label}
                className="flex gap-4 items-start"
                style={{ animation: `fq-slide-up 600ms ease ${160 + i * 120}ms both` }}>
                <span className="font-[family-name:var(--font-things)] text-[#7C1C0B] flex-shrink-0 leading-none pt-1"
                  style={{ fontSize: 14 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1 border-l border-[rgba(124,28,11,0.25)] pl-4">
                  <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.22em] uppercase text-[#8B7355] mb-1">
                    {b.label}
                  </p>
                  <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] leading-[1.5]">
                    {b.text}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* WhatsApp confirmation strip — softer wording, no marketing voice */}
          <div className="mt-10 p-4 rounded-xl border border-[rgba(124,28,11,0.25)] bg-[rgba(124,28,11,0.04)]"
            style={{ animation: "fq-slide-up 600ms ease 600ms both" }}>
            <div className="flex items-start gap-3">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5">
                <path d="M20.52 3.48A11.93 11.93 0 0 0 12.04 0C5.46 0 .1 5.36.1 11.94c0 2.1.55 4.16 1.6 5.97L0 24l6.27-1.64a11.93 11.93 0 0 0 5.77 1.47h.01c6.58 0 11.94-5.36 11.94-11.94 0-3.19-1.24-6.19-3.47-8.41ZM12.05 21.8h-.01a9.85 9.85 0 0 1-5.02-1.38l-.36-.21-3.72.98 1-3.63-.24-.37a9.84 9.84 0 0 1-1.52-5.25c0-5.46 4.45-9.91 9.93-9.91 2.65 0 5.15 1.04 7.02 2.91a9.86 9.86 0 0 1 2.9 7.02c-.01 5.46-4.47 9.84-9.98 9.84Zm5.45-7.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5-.89-.79-1.5-1.77-1.67-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.03 1-1.03 2.45s1.06 2.84 1.21 3.04c.15.2 2.09 3.2 5.07 4.49.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" fill="#7C1C0B"/>
              </svg>
              <div>
                <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[14px] leading-snug">
                  check your whatsapp. we sent you something.
                </p>
                <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[12px] mt-1 leading-snug">
                  save that number for regular updates.
                </p>
              </div>
            </div>
          </div>

          {/* Continue button */}
          <div className="mt-10" style={{ animation: "fq-slide-up 600ms ease 880ms both" }}>
            <button onClick={onContinue}
              className="w-full py-4 bg-[#2A1810] text-[#F5F0E8] font-[family-name:var(--font-motive)] text-[11px] tracking-[0.22em] uppercase hover:bg-[#7C1C0B] transition-colors rounded-full">
              SHOW ME MY RESULTS
            </button>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes fq-slide-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}


// ─── Top-level page state machine ─────────────────────────────────────────────

export default function VibeBoxPage() {
  // Capture ?preview=<id> during the first render — the quiz layout's UrlMask
  // rewrites the address bar to "/" in its mount effect, which fires before
  // this page's effect, so reading the query string later returns nothing.
  const [previewId] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("preview")
      : null,
  );
  // Phase flow (in order):
  //   loading → "frinq is thinking…" while Claude builds the profile
  //   sealed  → SealedEnvelope ("ready, tap to open") shown once profile exists
  //   opening → envelope animation (card emerges)
  //   reveal  → ProfileReveal (the actual card + know-more)
  // We START at loading unconditionally (not resuming-aware) — this must
  // match on both server and client render, since `previewId` and any
  // localStorage read are window-dependent and would otherwise diverge
  // between SSR and hydration. The resuming → "sealed" transition happens
  // client-only, in the mount effect below.
  const [phase, setPhase] = useState<"loading" | "sealed" | "opening" | "whats_next" | "reveal" | "error">("loading");
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [name] = useState(() => getQuizState("frinq_name") || "");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittedRef = useRef(false);

  const pollForSummary = useCallback((submissionId: string) => {
    const maxWait = 90000;
    const started = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - started > maxWait) {
        clearInterval(pollRef.current!);
        setPhase("error");
        return;
      }
      try {
        const r = await apiFetch(`/api/v1/quiz/summary/${submissionId}`);
        if (!r.ok) return;
        const d = await r.json();
        if (d.status === "done" && d.insights?.length > 0) {
          clearInterval(pollRef.current!);
          setSummary(d);
          // Profile built → reveal the sealed envelope. User taps it to
          // trigger the opening animation. We do NOT auto-advance — the
          // tap is the moment of intent.
          track("result_viewed");
          setPhase("sealed");
        } else if (d.status === "error") {
          clearInterval(pollRef.current!);
          setPhase("error");
        }
      } catch { /* keep polling */ }
    }, 2000);
  }, []);

  function buildAnswers() {
    const safeJson = (key: string, fallback: unknown = []) => {
      try { return JSON.parse(getQuizState(key) ?? JSON.stringify(fallback)); }
      catch { return fallback; }
    };
    const sceneRaw = safeJson("frinq_scene", []);
    return {
      name: getQuizState("frinq_name") || "",
      phone: getQuizState("frinq_phone") || "",
      city: getQuizState("frinq_city") || "",
      dob: getQuizState("frinq_dob") || "",
      social_type: getQuizState("frinq_social_type") || "",
      saturday: getQuizState("frinq_saturday") || "",
      scene: sceneRaw,
      substance_scene: Array.isArray(sceneRaw) ? sceneRaw.join(", ") : String(sceneRaw || ""),
      hobbies: getQuizState("frinq_hobbies") || "",
      interests: safeJson("frinq_interests", []),
      connection: getQuizState("frinq_connection") || "",
      trip: getQuizState("frinq_trip") || "",
      // Event-organizing block (#13) — used by the matching engine to
      // suggest plans both users would say yes to. dream_plan was removed
      // as it duplicated event_yes signal.
      travel_style: getQuizState("frinq_travel_style") || "",
      connection_mode: getQuizState("frinq_connection_mode") || "",
      event_yes: safeJson("frinq_event_yes", []),
      event_no: safeJson("frinq_event_no", []),
      would_rather: getQuizState("frinq_would_rather") || "",
      meeting_style: getQuizState("frinq_meeting_style") || "",
      show_up: getQuizState("frinq_show_up") || "",
      red_flags: safeJson("frinq_red_flags", []),
      rapid: safeJson("frinq_rapid", []),
      opinions: safeJson("frinq_opinions", []),
      opinions_why: safeJson("frinq_opinions_why", []),
      preferences: safeJson("frinq_preferences", [50, 50, 50, 50]),
      story: getQuizState("frinq_story") || "",
      looking_for: getQuizState("frinq_looking_for") || "",
      linkedin_url: getQuizState("frinq_linkedin_url") || "",
      instagram: getQuizState("frinq_instagram") || "",
      social_verified: getQuizState("frinq_social_verified") || "skipped",
    };
  }

  const submitAndPoll = useCallback(async () => {
    if (submittedRef.current) return;  // prevent double-submit on rerender
    submittedRef.current = true;
    // No setPhase("loading") here: this is only ever called from the
    // mount effect's non-resuming branch, where initial phase state is
    // already "loading" (see the phase useState above) — setting it again
    // would be a same-value no-op.
    const answers = buildAnswers();
    const phone = answers.phone || null;
    try {
      let submissionId: string | null = getQuizState("frinq_submission_id");
      if (submissionId) {
        const res = await apiFetch(`/api/v1/quiz/complete/${submissionId}`, {
          method: "PATCH",
          body: JSON.stringify({ phone, answers, is_complete: true }),
        });
        if (!res.ok) submissionId = null;
      }
      if (!submissionId) {
        const res = await apiFetch("/api/v1/quiz/submit", {
          method: "POST",
          body: JSON.stringify({ phone, answers, is_complete: true }),
        });
        if (res.ok) {
          const data = await res.json();
          submissionId = data.submission_id;
          setQuizState("frinq_submission_id", submissionId!);
        }
      }
      if (!submissionId) { setPhase("error"); return; }
      track("quiz_completed");
      pollForSummary(submissionId);
    } catch { setPhase("error"); }
  }, [pollForSummary]);

  // Auto-start the build flow on mount.
  //
  // Resume signal is server-authoritative now: a submission id existing at
  // all (from a prior /quiz/start, OTP-verify's prior_session, or a
  // previous visit) means the backend already has a row — check its real
  // status directly instead of trusting a separately-tracked local flag.
  // Returning users with an existing profile should NOT see the "frinq is
  // thinking…" loader again; a single direct fetch goes straight to the
  // sealed envelope as soon as the data is in hand. The loader is only for
  // the brand-new build flow where the AI is actually working.
  useEffect(() => {
    // verify/page.tsx routes onboarding_state="error" here with ?state=error
    // — the backend's durable AI job already failed, no need to fetch again.
    const params = new URLSearchParams(window.location.search);
    if (params.get("state") === "error") {
      submittedRef.current = true;
      queueMicrotask(() => setPhase("error"));
      return;
    }

    // Preview mode (previewId captured at first render, see above): jump
    // straight to an already-generated summary without filling the quiz.
    const existingId = previewId || getQuizState("frinq_submission_id");
    if (existingId) {
      submittedRef.current = true;  // never submit on resume
      // Skip the LoaderScreen entirely — go to a blank cream background
      // while the single fetch completes (~150-400ms typical), then jump
      // straight to the sealed envelope so the only animation they see
      // is the envelope opening. Deferred a tick (not a direct call in
      // the effect body) for the same reason as the else-branch below;
      // still resolves within the same frame in practice.
      queueMicrotask(() => setPhase("sealed"));
      apiFetch(`/api/v1/quiz/summary/${existingId}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (d && d.status === "done" && d.insights?.length > 0) {
            setSummary(d);
            track("result_viewed");
          } else if (d && d.status === "error") {
            setPhase("error");
          } else {
            // Not ready yet (still processing, or the fetch failed) — fall
            // back to polling.
            setPhase("loading");
            pollForSummary(existingId);
          }
        })
        .catch(() => {
          setPhase("loading");
          pollForSummary(existingId);
        });
    } else {
      // Deferred a tick — not called directly in the effect body — so the
      // state updates inside submitAndPoll aren't treated as synchronous
      // effect-body updates (same reasoning as the resuming branch above).
      queueMicrotask(() => { submitAndPoll(); });
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // Intentionally empty deps — run exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "loading") return <LoaderScreen />;
  if (phase === "sealed") return (
    <SealedEnvelope
      name={name}
      onOpen={() => {
        // Defensive: don't advance until summary actually loaded.
        // For resuming users, this races with the single fetch above —
        // typically resolves in <500ms so the tap is fine, but if they
        // tap before the response lands, we wait a beat.
        if (summary) setPhase("opening");
        else { /* swallow the tap; user can re-tap once summary loads */ }
      }}
    />
  );
  if (phase === "opening") return <EnvelopeOpening onDone={() => setPhase("whats_next")} archetypeName={summary?.archetype} />;
  if (phase === "whats_next") return <WhatsNextScreen name={name} archetype={summary?.archetype || ""} onContinue={() => setPhase("reveal")} />;
  if (phase === "error") {
    return (
      <div className="h-dvh overflow-hidden bg-[#F5F0E8] flex flex-col items-center justify-center px-8 text-center gap-6">
        <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[20px]">
          something went wrong building your profile.
        </p>
        <p className="font-[family-name:var(--font-things)] text-[#8B7355] text-[15px]">
          your answers are saved. we&apos;ll process your profile and reach out on your number.
        </p>
        <NavLink href="/" className="text-[11px] font-[family-name:var(--font-motive)] tracking-[0.14em] text-[#2A1810] no-underline">
          go home
        </NavLink>
      </div>
    );
  }
  return <ProfileReveal data={summary!} />;
}
