"use client";

import Image from "next/image";

export interface ShareCardStats {
  social_energy: number;
  peak_time: string;
  group_role: string;
  group_effect: number;
  secret_edge: string;
  rarity: string;
}

export interface ShareCardData {
  archetype: string;          // e.g. "Quiet Anchor"
  archetype_slug: string;     // e.g. "quiet-anchor" — used for illustration filename
  nickname: string;           // e.g. "the quiet one"
  description: string;        // 2-3 sentence social-species paragraph
  pull_quote: string;         // "line one.\nline two.\nline three."
  stats: ShareCardStats;
  name?: string;              // user's first name from sessionStorage
}

type Variant = "post" | "story";  // 1080×1080 IG post  |  1080×1920 IG story

/**
 * Shareable Instagram card. Two variants, same data shape.
 *
 * Rendered off-screen by the vibe-box page and captured via html-to-image.
 * Do NOT add position:fixed / transforms — the capture lib needs stable layout.
 */
export default function ShareCard({ data, variant = "post" }: { data: ShareCardData; variant?: Variant }) {
  return variant === "story" ? <StoryCard data={data} /> : <PostCard data={data} />;
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

const CREAM = "#F5F0E8";
const INK = "#7C1C0B";
const INK_SOFT = "rgba(124,28,11,0.18)";
const PAPER_BORDER = "rgba(124,28,11,0.55)";

function SketchyFrame({ children, padding }: { children: React.ReactNode; padding: number }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 28,
        border: `2px solid ${PAPER_BORDER}`,
        borderRadius: 14,
        boxShadow: `inset 0 0 0 1px ${INK_SOFT}, inset 0 0 12px rgba(124,28,11,0.03)`,
        padding,
      }}
    >
      {children}
    </div>
  );
}

function NameBubble({ name }: { name: string }) {
  // Pull the first word only — handles "Ronak Pruthi" → "Ronak" so the bubble
  // doesn't overflow on longer full names. If empty (name page skipped) drop
  // to "this one" which reads cleanly with "is…".
  const first = (name || "").trim().split(/\s+/)[0] || "this one";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px 30px",
        border: `2px solid ${PAPER_BORDER}`,
        borderRadius: "50%/55%",
        background: CREAM,
        fontFamily: "var(--font-things), Georgia, serif",
        color: INK,
        fontSize: 28,
        lineHeight: 1.1,
      }}
    >
      {first} <span style={{ fontStyle: "italic", marginLeft: 8 }}>is…</span>
    </div>
  );
}

function LogoMark({ size = 56 }: { size?: number }) {
  return (
    <div
      style={{
        width: size, height: size,
        background: INK, borderRadius: 8,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: CREAM,
        fontFamily: "var(--font-things), Georgia, serif",
        fontSize: size * 0.55, fontWeight: 700,
      }}
    >
      fq
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  // Auto-scale the value font down for longer text so things like
  // "The Catalyst" / "The Sanctuary" don't punch through the rounded
  // pill edge when captured via html-to-image. Threshold values chosen
  // empirically from the longest archetype labels in archetypes.py.
  const valueStr = String(value);
  const valueFontSize = valueStr.length <= 8 ? 24 : valueStr.length <= 12 ? 21 : 18;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "12px 22px",
        border: `1.5px solid ${PAPER_BORDER}`,
        borderRadius: 999,
        background: CREAM,
        minWidth: 0,
      }}
    >
      <span style={{
        fontFamily: "var(--font-motive), system-ui, sans-serif",
        fontSize: 17, letterSpacing: "0.12em",
        color: INK, textTransform: "uppercase", fontWeight: 400,
        whiteSpace: "nowrap", flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "var(--font-things), Georgia, serif",
        fontSize: valueFontSize, color: INK,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        minWidth: 0, textAlign: "right",
      }}>
        {value}
      </span>
    </div>
  );
}

function PullQuote({ lines }: { lines: string[] }) {
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
      <span style={{
        fontFamily: "Georgia, serif",
        fontSize: 100, lineHeight: 0.7,
        color: INK, opacity: 0.85, marginTop: -10,
      }}>
        &ldquo;
      </span>
      <div style={{
        fontFamily: "var(--font-things), Georgia, serif",
        fontStyle: "italic", color: INK, fontSize: 30, lineHeight: 1.35,
      }}>
        {lines.map((line, i) => <div key={i}>{line}</div>)}
      </div>
    </div>
  );
}

function CertifiedFooter() {
  return (
    <div style={{
      display: "flex", justifyContent: "center", alignItems: "center", gap: 12,
      fontFamily: "var(--font-motive), system-ui, sans-serif",
      fontSize: 13, letterSpacing: "0.22em",
      color: INK, opacity: 0.7, textTransform: "uppercase",
    }}>
      certified by the vibe audit · <span style={{ fontFamily: "var(--font-things), Georgia, serif", fontStyle: "italic", letterSpacing: 0, fontSize: 16 }}>fq</span>
    </div>
  );
}

function illustrationSrc(slug: string): string {
  return `/illustrations/archetypes/${slug}.png`;
}

// ─── Post variant (1080×1080) ────────────────────────────────────────────────

function PostCard({ data }: { data: ShareCardData }) {
  const lines = (data.pull_quote || "").split("\n").filter(Boolean);
  return (
    <div style={{
      width: 1080, height: 1080, background: CREAM,
      position: "relative", overflow: "hidden",
      fontFamily: "var(--font-things), Georgia, serif",
    }}>
      <SketchyFrame padding={56}>
        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
          {/* Top: name bubble + logo */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <NameBubble name={data.name || ""} />
            <LogoMark size={64} />
          </div>

          {/* Duck illustration centered */}
          <div style={{ position: "relative", height: 360, marginTop: 8 }}>
            <Image
              src={illustrationSrc(data.archetype_slug)}
              alt={data.archetype}
              fill
              style={{ objectFit: "contain", mixBlendMode: "multiply" }}
              priority
            />
          </div>

          {/* Title */}
          <h1 style={{
            textAlign: "center", color: INK, fontSize: 72, fontWeight: 400,
            margin: "0 0 8px", letterSpacing: "0.01em", textTransform: "uppercase",
          }}>
            the {data.archetype.toLowerCase()}
          </h1>

          {/* Divider */}
          <div style={{ height: 2, background: PAPER_BORDER, margin: "8px 0 22px" }} />

          {/* Stats grid — 6 rows in 2 columns */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 30 }}>
            <StatRow label="social energy" value={data.stats.social_energy} />
            <StatRow label="peak time" value={data.stats.peak_time} />
            <StatRow label="group role" value={data.stats.group_role} />
            <StatRow label="group effect" value={`${data.stats.group_effect}%`} />
            <StatRow label="secret edge" value={data.stats.secret_edge} />
            <StatRow label="rarity" value={data.stats.rarity} />
          </div>

          {/* Pull quote */}
          <div style={{ marginTop: "auto", marginBottom: 18 }}>
            <PullQuote lines={lines.length ? lines : ["a rare kind", "of person."]} />
          </div>

          <CertifiedFooter />
        </div>
      </SketchyFrame>
    </div>
  );
}

// ─── Story variant (1080×1920) ───────────────────────────────────────────────

function StoryCard({ data }: { data: ShareCardData }) {
  const lines = (data.pull_quote || "").split("\n").filter(Boolean);
  return (
    <div style={{
      width: 1080, height: 1920, background: CREAM,
      position: "relative", overflow: "hidden",
      fontFamily: "var(--font-things), Georgia, serif",
    }}>
      <SketchyFrame padding={64}>
        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
          {/* Top: name bubble + logo */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <NameBubble name={data.name || ""} />
            <LogoMark size={72} />
          </div>

          {/* Hero: duck (left) + nickname (right) */}
          <div style={{ display: "flex", gap: 30, alignItems: "center", marginTop: 60, marginBottom: 36 }}>
            <div style={{
              position: "relative", width: 360, height: 320,
              border: `2px solid ${PAPER_BORDER}`, borderRadius: 16,
              padding: 12, flexShrink: 0,
            }}>
              <Image
                src={illustrationSrc(data.archetype_slug)}
                alt={data.archetype}
                fill
                style={{ objectFit: "contain", mixBlendMode: "multiply", padding: 12 }}
                priority
              />
            </div>
            <div style={{
              fontFamily: "var(--font-things), Georgia, serif",
              color: INK, fontSize: 64, lineHeight: 1.05,
              fontStyle: "italic",
            }}>
              &lsquo;{data.nickname || "the rare one"}&rsquo;
            </div>
          </div>

          {/* Pull quote FIRST (per user) — punchy line before paragraph */}
          <div style={{ marginBottom: 32 }}>
            <PullQuote lines={lines.length ? lines : ["a rare kind", "of person."]} />
          </div>

          {/* Divider */}
          <div style={{ height: 1.5, background: PAPER_BORDER, marginBottom: 26 }} />

          {/* Description AFTER the quote */}
          <div style={{
            padding: "26px 28px", borderRadius: 16,
            background: "rgba(124,28,11,0.42)",
            color: CREAM,
            fontFamily: "var(--font-motive), system-ui, sans-serif",
            fontSize: 26, lineHeight: 1.45, fontWeight: 300,
            marginBottom: 40,
          }}>
            {data.description}
          </div>

          {/* Stats — single column for story */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 36 }}>
            <StatRow label="social energy" value={data.stats.social_energy} />
            <StatRow label="peak time" value={data.stats.peak_time} />
            <StatRow label="group role" value={data.stats.group_role} />
            <StatRow label="group effect" value={`${data.stats.group_effect}%`} />
            <StatRow label="secret edge" value={data.stats.secret_edge} />
            <StatRow label="rarity" value={data.stats.rarity} />
          </div>

          <div style={{ marginTop: "auto" }}>
            <CertifiedFooter />
          </div>
        </div>
      </SketchyFrame>
    </div>
  );
}
