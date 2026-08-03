import type { ReactNode } from "react";
import { appColor } from "../lib/appTokens";

const MAROON = appColor.maroon;
const CREAM = appColor.cream;
const PEACH = appColor.peach;
const BROWN = appColor.brown;
const BROWN_SECONDARY = appColor.brownSecondary;
const BROWN_DISABLED = appColor.brownDisabled;


function Pill({ children, selected = false }: { children: ReactNode; selected?: boolean }) {
  return (
    <div
      style={{
        border: `1px solid ${MAROON}`,
        borderRadius: 999,
        padding: "10px 16px",
        color: selected ? CREAM : MAROON,
        background: selected ? MAROON : "transparent",
        fontFamily: "var(--font-motive)",
        fontSize: 12,
      }}
    >
      {children}
    </div>
  );
}

/** Card variant for singleChoiceCard — a bordered card with title + optional
 *  description, distinct from the flat pill list singleChoiceList/
 *  multiChoiceTags use. */
function ChoiceCard({ label, description }: { label: string; description?: string }) {
  return (
    <div style={{ border: `1px solid ${MAROON}`, borderRadius: 12, padding: "12px 14px" }}>
      <p style={{ fontFamily: "var(--font-things)", color: MAROON, fontSize: 14, margin: 0 }}>{label}</p>
      {!!description && (
        <p style={{ fontFamily: "var(--font-motive)", color: BROWN_SECONDARY, fontSize: 11, margin: "4px 0 0" }}>
          {description}
        </p>
      )}
    </div>
  );
}

function Wave() {
  return (
    <svg width="100%" height={20} viewBox="0 0 411.548 32" preserveAspectRatio="none" aria-hidden style={{ display: "block", marginTop: 6 }}>
      <defs>
        <linearGradient id="preview-wave" x1="0" y1="16" x2="411.548" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0.0564" stopColor={PEACH} />
          <stop offset="0.0962" stopColor={CREAM} />
        </linearGradient>
      </defs>
      <path
        d="M0.250409 0.5C120.798 70.25 125.498 0.5 205.75 0.5C286.003 0.5 319.179 68.7554 411.25 0.5"
        stroke="url(#preview-wave)"
        fill="none"
      />
    </svg>
  );
}

function BackChevron() {
  return (
    <svg width={16} height={13} viewBox="0 0 20 16" aria-hidden>
      <path d="M8 1.5L1.5 8L8 14.5M2 8H19" stroke={MAROON} strokeWidth={1.5} fill="none" />
    </svg>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <p style={{ fontFamily: "var(--font-things)", color: MAROON, fontSize: 20, margin: "10px 0" }}>{children}</p>;
}

/** Header + wave chrome every real quiz screen shares (QuizScreenFrame), so
 *  the preview reads as "the real screen" rather than a bare content block. */
function Header({ section }: { section?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <BackChevron />
      <span style={{ fontFamily: "var(--font-motive)", color: BROWN_SECONDARY, fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
        {section || "quiz"}
      </span>
      <span style={{ width: 16 }} />
    </div>
  );
}

/** The maroon Continue pill every quiz screen ends on. */
function ContinueButton({ label = "continue" }: { label?: string }) {
  return (
    <div style={{ marginTop: 16, alignSelf: "flex-start" }}>
      <Pill selected>{label}</Pill>
    </div>
  );
}

function RoundPosition({ index, total }: { index: number; total: number }) {
  if (total <= 1) return null;
  return (
    <p style={{ fontFamily: "var(--font-motive)", fontSize: 9, color: BROWN_DISABLED, margin: "0 0 6px" }}>
      {index + 1} of {total}
    </p>
  );
}

/**
 * Static, read-only approximation of how a question renders in the real
 * quiz — not pixel-perfect (the admin app doesn't carry the mobile brand's
 * Borel/Vastago Grotesk fonts, a licensing question for a follow-up, not an
 * engineering one), but the same chrome, colors, and full-round structure so
 * an admin can sanity-check a question before saving it. Multi-part kinds
 * (preferences/rapidFire/opinions) render every item in the round, not just
 * the first.
 */
export function QuestionPreview({ kind, fields }: { kind: string; fields: Record<string, unknown> }) {
  const prompt = (fields.prompt as string) || (fields.heading as string) || "";
  const section = fields.section as string | undefined;

  if (kind === "intro") {
    return (
      <div style={{ background: MAROON, borderRadius: 8, padding: "20px 18px" }}>
        <p style={{ fontFamily: "var(--font-things)", color: CREAM, fontSize: 22, margin: "0 0 8px" }}>
          {(fields.heading as string) || "heading"}
        </p>
        {!!fields.body && (
          <p style={{ fontFamily: "var(--font-motive)", fontSize: 12, color: CREAM, opacity: 0.85, margin: "0 0 16px" }}>
            {fields.body as string}
          </p>
        )}
        <div style={{ display: "inline-block" }}>
          <div
            style={{
              borderRadius: 999,
              padding: "10px 16px",
              color: BROWN,
              background: PEACH,
              fontFamily: "var(--font-motive)",
              fontSize: 12,
            }}
          >
            {(fields.ctaLabel as string) || "continue"}
          </div>
        </div>
      </div>
    );
  }

  let body: ReactNode = null;
  let continueLabel: string | undefined = "continue";

  switch (kind) {
    case "text":
    case "voiceOrText":
      body = (
        <>
          <Heading>{prompt || "heading"}</Heading>
          {kind === "voiceOrText" && !!fields.subtext && <p style={{ fontFamily: "var(--font-motive)", fontSize: 11, color: BROWN_SECONDARY }}>{fields.subtext as string}</p>}
          <div style={{ border: `1px solid ${MAROON}`, borderRadius: 8, padding: 10, minHeight: 48, color: BROWN_DISABLED, fontFamily: "var(--font-motive)", fontSize: 11 }}>
            {(fields.placeholder as string) || "..."}
          </div>
        </>
      );
      break;
    case "slider": {
      const leftLabel = fields.leftLabel as string | undefined;
      const leftHint = fields.leftHint as string | undefined;
      const rightLabel = fields.rightLabel as string | undefined;
      const rightHint = fields.rightHint as string | undefined;
      body = (
        <>
          <Heading>{prompt || "prompt"}</Heading>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} style={{ width: 14, height: 14, borderRadius: 999, border: `1px solid ${MAROON}`, background: i === 2 ? MAROON : "transparent" }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-motive)", fontSize: 10, color: BROWN_SECONDARY }}>
            <span>{leftLabel || "left"}</span>
            <span>{rightLabel || "right"}</span>
          </div>
          {(!!leftHint || !!rightHint) && (
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-motive)", fontSize: 9, color: BROWN_DISABLED, marginTop: 2 }}>
              <span>{leftHint || ""}</span>
              <span>{rightHint || ""}</span>
            </div>
          )}
        </>
      );
      break;
    }
    case "preferences": {
      const sliders = (Array.isArray(fields.sliders) ? fields.sliders : []) as { prompt?: string; leftLabel?: string; rightLabel?: string }[];
      body = sliders.length ? (
        <>
          {sliders.map((slider, i) => (
            <div key={i} style={{ marginBottom: i < sliders.length - 1 ? 14 : 0 }}>
              <RoundPosition index={i} total={sliders.length} />
              <Heading>{slider.prompt || "slider round"}</Heading>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
                {[0, 1, 2, 3, 4].map((d) => (
                  <div key={d} style={{ width: 14, height: 14, borderRadius: 999, border: `1px solid ${MAROON}`, background: d === 2 ? MAROON : "transparent" }} />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-motive)", fontSize: 10, color: BROWN_SECONDARY }}>
                <span>{slider.leftLabel || "left"}</span>
                <span>{slider.rightLabel || "right"}</span>
              </div>
            </div>
          ))}
        </>
      ) : (
        <Heading>slider round</Heading>
      );
      break;
    }
    case "singleChoiceCard":
    case "singleChoiceList":
    case "multiChoiceTags": {
      const rawOptions = (Array.isArray(fields.options) ? fields.options : []) as (string | { label?: string; description?: string })[];
      const parsed = (rawOptions.length ? rawOptions : ["option a", "option b"]).map((o) =>
        typeof o === "string" ? { label: o, description: undefined } : { label: o.label || "", description: o.description }
      );
      body = (
        <>
          <Heading>{prompt || "prompt"}</Heading>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {parsed.map((opt, i) =>
              kind === "singleChoiceCard" ? (
                <ChoiceCard key={i} label={opt.label} description={opt.description} />
              ) : (
                <Pill key={i}>{opt.label}</Pill>
              ),
            )}
          </div>
        </>
      );
      break;
    }
    case "rapidFire": {
      const pairs = (Array.isArray(fields.pairs) ? fields.pairs : []) as { a?: string; b?: string }[];
      body = pairs.length ? (
        <>
          <p style={{ fontFamily: "var(--font-things)", color: MAROON, fontSize: 16, margin: "4px 0" }}>rapid fire round</p>
          {pairs.map((pair, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <RoundPosition index={i} total={pairs.length} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Pill>{pair.a || "option a"}</Pill>
                <Pill>{pair.b || "option b"}</Pill>
              </div>
            </div>
          ))}
          <p style={{ fontFamily: "var(--font-motive)", fontSize: 9, color: BROWN_DISABLED, marginTop: 6 }}>timed — {(fields.secondsPerPair as string) || "5"}s per pair</p>
        </>
      ) : (
        <p style={{ fontFamily: "var(--font-things)", color: MAROON, fontSize: 16, margin: "4px 0" }}>rapid fire round</p>
      );
      continueLabel = undefined; // rapid fire advances on pick, no Continue bar
      break;
    }
    case "opinions": {
      const pairs = (Array.isArray(fields.pairs) ? fields.pairs : []) as { prompt?: string; a?: string; b?: string; whyPrompt?: string }[];
      body = pairs.length ? (
        <>
          <p style={{ fontFamily: "var(--font-things)", color: MAROON, fontSize: 16, margin: "4px 0" }}>this-or-that round</p>
          {pairs.map((pair, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <RoundPosition index={i} total={pairs.length} />
              <Heading>{pair.prompt || "prompt"}</Heading>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Pill>{pair.a || "option a"}</Pill>
                <Pill>{pair.b || "option b"}</Pill>
              </div>
              {!!pair.whyPrompt && (
                <p style={{ fontFamily: "var(--font-motive)", fontSize: 10, color: BROWN_SECONDARY, marginTop: 8 }}>
                  then asks (text + voice): &ldquo;{pair.whyPrompt}&rdquo;
                </p>
              )}
            </div>
          ))}
        </>
      ) : (
        <p style={{ fontFamily: "var(--font-things)", color: MAROON, fontSize: 16, margin: "4px 0" }}>this-or-that round</p>
      );
      break;
    }
    default:
      body = <p style={{ fontFamily: "var(--font-motive)", fontSize: 11, color: BROWN_DISABLED }}>no preview for this question type</p>;
      continueLabel = undefined;
  }

  return (
    <div style={{ background: CREAM, border: "1px solid rgba(42,24,16,0.12)", borderRadius: 8, padding: "14px 16px", overflow: "hidden" }}>
      <Header section={section} />
      <Wave />
      <div style={{ marginTop: 12 }}>{body}</div>
      {!!continueLabel && <ContinueButton label={continueLabel} />}
    </div>
  );
}
