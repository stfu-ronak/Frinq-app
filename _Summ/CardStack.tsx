"use client";

import { useRef, useState } from "react";
import { toBlob } from "html-to-image";

// The "stacked insight preview" — Figma node `357:2853` ("three layered red
// pattern cards behind the foreground 367x390 card"). Swipeable deck: all
// cards live in the same compact slot, the top card can be dragged/swiped
// away, and a plain tap or the arrow buttons advance it too.
//
// This deck is meant to be embedded directly inside EnvelopeCard's growing
// box — it emerges as part of the envelope opening, not as a separate
// section lower on the page. Card 0 (the type card) keeps the cream
// `#ffffd9` frame the envelope's reveal always had; cards 1+ don't.
//
// Share renders the actual card to a PNG (html-to-image, already a project
// dependency — see the original ShareCard.tsx) and hands it to the Web
// Share API as a file, so it shares as an image (WhatsApp/Instagram/etc.),
// the way Spotify's "share as a card" does — not a plain-text share.

const ASSET = (name: string) => `/quiz-summary/${name}`;
const SWIPE_THRESHOLD = 80; // px
const TAP_MAX_MOVEMENT = 6; // px — below this, a pointerup is a tap, not a drag
const DECK_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function displaySentence(text: string) {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

export interface StackCard {
  key: string;
  label: string;
  title?: string;
  text: string;
  shareCaption: string;
  /** Body font override. Motive is a display face — good for the short
   *  quick-row lines on the quiz report, too wide/quirky for the longer
   *  running copy on the squad cards. Defaults to Motive so the existing
   *  quiz Page 2 is untouched. */
  bodyFontFamily?: string;
  // Existing callers (the Page 2 type/quick-row cards) rely on the
  // label/title being title-cased even though the source strings are
  // lowercase ("your type" -> "Your Type") — that's fine for short
  // phrases. A caller whose `title` is a full sentence (not a short
  // label) needs the source casing preserved, or "Energy When A Plan
  // Needs A Reset..." is what renders. Opt-in, default preserves every
  // existing caller unchanged.
  preserveCase?: boolean;
}

// `navigator.share` and `navigator.clipboard` both require a "secure
// context" — https, or literally the string "localhost". Testing over a
// LAN IP (e.g. http://192.168.x.x:3210 from a phone on the same wifi as the
// dev machine, the normal way to test a live layout on a real device) is
// NOT a secure context, so both APIs are simply `undefined` there — every
// branch of the old version silently failed and the button did nothing
// visible. Final fallback below (open the image in a new tab) uses only
// `URL.createObjectURL`, which has no such restriction and always works.
async function shareCardImage(node: HTMLElement, caption: string): Promise<"shared" | "copied" | "opened" | "failed"> {
  let blob: Blob | null = null;
  try {
    blob = await toBlob(node, { pixelRatio: 2, backgroundColor: undefined });
  } catch { /* html-to-image failed (e.g. a cross-origin font it couldn't embed) — still try text-only share below */ }

  if (blob) {
    try {
      const file = new File([blob], "frinq-read.png", { type: "image/png" });
      if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "frinq", text: caption });
        return "shared";
      }
    } catch { /* share sheet closed/cancelled — try the guaranteed fallback below instead of giving up */ }
  }

  if (typeof navigator !== "undefined" && navigator.share) {
    try { await navigator.share({ title: "frinq", text: caption }); return "shared"; } catch { /* cancelled */ }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try { await navigator.clipboard.writeText(caption); return "copied"; } catch { /* denied */ }
  }

  // Guaranteed last resort: open the rendered card as an image in a new
  // tab so it can be long-pressed/saved and shared manually. No special
  // permission or secure-context requirement.
  if (blob) {
    try {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return "opened";
    } catch { /* fall through */ }
  }
  return "failed";
}

function CardFace({ card, isActive, isFirst }: { card: StackCard; isActive: boolean; isFirst: boolean }) {
  const captureRef = useRef<HTMLDivElement | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleShare() {
    if (!captureRef.current) return;
    const result = await shareCardImage(captureRef.current, card.shareCaption);
    const message = {
      shared: null, // native share sheet already gave its own feedback
      copied: "copied to clipboard",
      opened: "opened as an image — tap and hold to save",
      failed: "couldn't share — try a screenshot instead",
    }[result];
    if (message) {
      setFeedback(message);
      setTimeout(() => setFeedback(null), 3000);
    }
  }

  return (
    <>
      {isFirst && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 32,
          border: "clamp(5px, 2.8vw, 9px) solid #ffffd9", boxShadow: "0 4px 9px rgba(0,0,0,0.25)",
          pointerEvents: "none", zIndex: 2,
        }} />
      )}
      <div ref={captureRef} style={{ position: "absolute", inset: 0, borderRadius: 32, overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ASSET("summary-card-top-pattern.svg")} alt="" aria-hidden="true"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        <div style={{ position: "relative", padding: "26px 24px 22px" }}>
          <p style={{
            fontFamily: "var(--font-urbanist), var(--font-motive), sans-serif", fontWeight: 500,
            color: "var(--qs-peach, #ffcead)", fontSize: 13, lineHeight: 1.24,
            textTransform: card.preserveCase ? "none" : "capitalize", margin: 0,
          }}>
            {card.label}
          </p>
          {card.title && (
            <h3 style={{
              margin: "10px 0 0", fontFamily: "var(--font-motive), sans-serif", fontWeight: 400,
              color: "#fff", fontSize: "clamp(24px, 7vw, 30px)", lineHeight: 1.1, letterSpacing: "-0.02em",
              textTransform: card.preserveCase ? "none" : "capitalize",
            }}>
              {card.title}
            </h3>
          )}
          {/* Both sizes now clamp() — the non-title (quickRow) cards used a
              flat 22px with no responsive floor, which combined with the
              card's fixed aspect-ratio box overflowed and got clipped by
              this container's own `overflow: hidden` on narrower phones,
              with the share button (previously position:absolute at a
              fixed bottom offset) visibly overlapping the cut-off text. */}
          <p style={{
            fontFamily: card.bodyFontFamily || "var(--font-motive), sans-serif",
            fontWeight: card.bodyFontFamily ? 400 : 300, color: "#fff",
            fontSize: card.title ? "clamp(14px, 3.8vw, 16px)" : "clamp(14px, 3.9vw, 16px)",
            lineHeight: card.title ? 1.48 : 1.48,
            marginTop: card.title ? 10 : 14, marginBottom: 0, overflowWrap: "anywhere",
          }}>
            {displaySentence(card.text)}
          </p>
          {isActive && (
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
          {/* stopPropagation on pointerdown, not just onClick — the card
              itself listens for onPointerDown/Up to detect a tap-to-advance,
              and pointer events bubble, so without this, tapping "share"
              also registered as a tap on the card underneath it and
              immediately advanced to the next one. */}
          <button type="button" onClick={handleShare} onPointerDown={(e) => e.stopPropagation()}
            aria-label="share this read as a card"
            style={{ display: "inline-flex", width: 44, height: 44, marginLeft: -10, alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ASSET("share-icon.svg")} alt="" style={{ width: 24, height: 24 }} />
          </button>
              {feedback && (
                <span style={{ fontFamily: "var(--font-urbanist), sans-serif", fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
                  {feedback}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function CardStack({ cards, interactive = true, softShadow = false }: {
  cards: StackCard[];
  interactive?: boolean;
  /** Use a tight shadow instead of the default 0 20px 40px.
   *
   *  The default spreads 40px of blur in every direction. Inside the quiz
   *  report's padded column that reads as depth, but on the squad detail
   *  page — a full-bleed 402px canvas — it tinted the entire band around
   *  the card, which looked like the page background changing colour
   *  partway down. Opt-in so the quiz report is untouched. */
  softShadow?: boolean;
}) {
  const [active, setActive] = useState(0);
  const [exitDir, setExitDir] = useState<"left" | "right" | null>(null);
  // Set right before the newly-revealed card's first paint, cleared two
  // frames later — the double-rAF forces the browser to actually commit the
  // "just off to the side" starting position before switching to the
  // transitioned resting style, which is what makes it animate in instead
  // of just appearing. `goBack` previously had no animation at all.
  const [enterDir, setEnterDir] = useState<"left" | "right" | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ startX: number; dx: number; dragging: boolean } | null>(null);
  const isLast = active >= cards.length - 1;

  function advance(dir: "left" | "right") {
    if (isLast || exitDir) {
      if (topRef.current) topRef.current.style.transform = "translateX(0) rotate(0deg)";
      return;
    }
    setExitDir(dir);
    setTimeout(() => {
      setActive((i) => Math.min(cards.length - 1, i + 1));
      setExitDir(null);
      if (topRef.current) topRef.current.style.transform = "translateX(0) rotate(0deg)";
    }, 300);
  }

  function goBack() {
    if (active === 0) return;
    // Cards always exit to the left (tap-to-advance) or whichever way they
    // were swiped — reappear from that same side for continuity.
    setActive((i) => Math.max(0, i - 1));
    setEnterDir("left");
    requestAnimationFrame(() => requestAnimationFrame(() => setEnterDir(null)));
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!interactive || active >= cards.length - 1) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, dx: 0, dragging: true };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!interactive || !drag.current?.dragging || !topRef.current) return;
    const dx = e.clientX - drag.current.startX;
    drag.current.dx = dx;
    topRef.current.style.transform = `translateX(${dx}px) rotate(${dx * 0.04}deg)`;
    topRef.current.style.transition = "none";
  }
  function onPointerUp() {
    if (!interactive || !drag.current?.dragging || !topRef.current) return;
    const { dx } = drag.current;
    topRef.current.style.transition = "";
    drag.current = null;
    if (Math.abs(dx) > TAP_MAX_MOVEMENT && Math.abs(dx) > SWIPE_THRESHOLD) {
      advance(dx < 0 ? "left" : "right");
    } else if (Math.abs(dx) <= TAP_MAX_MOVEMENT) {
      advance("left");
    } else {
      topRef.current.style.transform = "translateX(0) rotate(0deg)";
    }
  }

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 346, margin: "0 auto" }}>
      {/* Three layered pattern cards behind the foreground card — exact
          Figma composition (357:2853), not a fabricated stand-in. These are
          purely decorative depth cues and rendered unconditionally, which
          was a real bug: on the actual LAST card there's nothing left
          behind it, but these three still showed, reading as "there's
          another card under this one" when there isn't. Fade them out once
          there's truly nothing left in the deck. */}
      <div style={{ opacity: isLast ? 0 : 1, transition: "opacity 320ms ease" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ASSET("summary-pattern-small.svg")} alt="" aria-hidden="true"
          style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", width: "82%" }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ASSET("summary-pattern-medium.svg")} alt="" aria-hidden="true"
          style={{ position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)", width: "90%" }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ASSET("summary-pattern-large.svg")} alt="" aria-hidden="true"
          style={{ position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)", width: "96%" }} />
      </div>

      <div style={{ position: "relative", width: "100%", aspectRatio: "367 / 440" }}>
        {cards.map((card, i) => {
          const depth = i - active;
          if (depth < 0) return null;
          const isTop = depth === 0;
          const isExiting = isTop && exitDir;
          const isEntering = isTop && enterDir;
          const style: React.CSSProperties = isExiting
            ? {
                transform: `translateX(${exitDir === "left" ? -116 : 116}%) rotate(${exitDir === "left" ? -7 : 7}deg)`,
                opacity: 0, transition: `transform 300ms ${DECK_EASE}, opacity 240ms ease`,
              }
            : isEntering
              ? {
                  // Starting position for the double-rAF entrance trick —
                  // no transition here, this has to paint once as-is before
                  // `enterDir` clears and the transitioned resting style
                  // below takes over, or there's nothing to animate FROM.
                  transform: `translateX(${enterDir === "left" ? -36 : 36}px) rotate(${enterDir === "left" ? -2 : 2}deg)`,
                  opacity: 0, transition: "none",
                }
              : isTop
                ? { transform: "translateX(0) rotate(0deg)", transition: `transform 340ms ${DECK_EASE}, opacity 260ms ease` }
                : {
                    transform: `translateY(${depth * 9}px) scale(${1 - depth * 0.038})`,
                    opacity: Math.max(0, 0.62 - depth * 0.27),
                    transition: `transform 340ms ${DECK_EASE}, opacity 260ms ease`,
                  };
          return (
            <div
              key={card.key}
              ref={isTop ? topRef : undefined}
              onPointerDown={isTop ? onPointerDown : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? onPointerUp : undefined}
              onPointerCancel={isTop ? onPointerUp : undefined}
              style={{
                position: "absolute", inset: 0, borderRadius: 32, overflow: "visible",
                background: "linear-gradient(165deg, #bc5752 0%, #82201f 52%, #621407 100%)",
                boxShadow: softShadow ? "0 6px 14px rgba(98,20,7,0.13)" : "0 20px 40px rgba(98,20,7,0.22)",
                zIndex: 10 - depth, touchAction: isTop && interactive ? "pan-y" : undefined,
                cursor: isTop && interactive ? "grab" : undefined, willChange: "transform, opacity",
                ...style,
              }}
            >
              <CardFace card={card} isActive={isTop && interactive} isFirst={i === 0} />
            </div>
          );
        })}
      </div>

      {interactive && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginTop: 16 }}>
          <button type="button" onClick={goBack} disabled={active === 0} aria-label="previous card"
            style={{
              width: 36, height: 36, borderRadius: 18, border: "1px solid rgba(98,20,7,0.3)", background: "transparent",
              color: "var(--qs-red-deep, #621407)", opacity: active === 0 ? 0.3 : 1, cursor: active === 0 ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >‹</button>
          <div style={{ display: "flex", gap: 6 }}>
            {cards.map((card, i) => (
              <div key={card.key} aria-hidden="true" style={{
                width: i === active ? 16 : 6, height: 6, borderRadius: 3,
                background: i === active ? "var(--qs-red-deep, #621407)" : "rgba(98,20,7,0.25)",
                transition: "width 300ms ease, background 300ms ease",
              }} />
            ))}
          </div>
          <button type="button" onClick={() => advance("left")} disabled={active >= cards.length - 1} aria-label="next card"
            style={{
              width: 36, height: 36, borderRadius: 18, border: "1px solid rgba(98,20,7,0.3)", background: "transparent",
              color: "var(--qs-red-deep, #621407)", opacity: active >= cards.length - 1 ? 0.3 : 1,
              cursor: active >= cards.length - 1 ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >›</button>
        </div>
      )}
    </div>
  );
}
