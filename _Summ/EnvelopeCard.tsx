"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import CardStack from "./CardStack";
import type { StackCard } from "./CardStack";

// Card component state machine. The envelope itself is now built from plain
// CSS `clip-path` triangles (an envelope-unfold diagram: four flaps meeting
// at a center point, front one folded down on top) instead of compositing
// three separate exported SVG panels — those needed exact mirroring/inset
// math to align, and a sizing bug (`<img>` is a "replaced element": with
// only `left`/`right` set and no explicit width/height, it sizes from its
// own intrinsic dimensions instead of stretching — CSS 2.1 §10.3.7) made
// the mirrored panel float outside the envelope entirely. clip-path on
// plain divs has no equivalent failure mode — it's always exactly the
// shape you tell it to be. The seal is still the real asset (its own
// shading/shadow is correct); only the flat panels were replaced.
//
// The growing box that used to show just the type-card now embeds the
// whole swipeable CardStack — the deck emerges from the envelope as one
// piece, not as a separate reveal followed by a second section further
// down the page.

type EnvState = "closed" | "flapOpen" | "cardRising" | "open";

const EASE = {
  bouncy: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  quick: "cubic-bezier(0.4, 0, 0.2, 1)",
  gentle: "cubic-bezier(0.22, 1, 0.36, 1)",
};

// The old sequence copied seven tiny Figma prototype states. In a browser it
// felt like a card repeatedly changing its mind. This is deliberately three
// physical beats instead: lift the flap, pull the deck out, let it settle.
// It uses only transform and opacity so it remains smooth on modest phones.
const TRANSITIONS: Record<Exclude<EnvState, "open">, { to: EnvState; duration: number; ease: string }> = {
  closed: { to: "flapOpen", duration: 340, ease: EASE.gentle },
  flapOpen: { to: "cardRising", duration: 520, ease: EASE.gentle },
  cardRising: { to: "open", duration: 220, ease: EASE.quick },
};

// Convergence point where all four "flaps" of the envelope-unfold diagram
// meet — also where the wax seal sits.
const APEX_X = 50;
const APEX_Y = 52;

// Warm glow gradient revealed at the envelope's neck once the flap lifts.
const GLOW_GAP = { top: -39.29, right: 0.06, bottom: 63.07, left: 0.06 };
function inset(box: { top: number; right: number; bottom: number; left: number }): React.CSSProperties {
  return { top: `${box.top}%`, right: `${box.right}%`, bottom: `${box.bottom}%`, left: `${box.left}%` };
}

// ── Growing box — the deck emerges at this size/position; only transform
// (scale) and opacity ever animate, never width/height/top/left, so the
// browser never has to re-run layout mid-transition (the GTA6-style rule:
// animate transform/opacity only, everything else forces a layout pass).
// centerYPct nudged down from Figma's exact 42.98 (to ~47) and heightPct
// trimmed slightly (156.28 → 146) — the literal Figma numbers push the top
// of the deck up over the "hey {name}," greeting above the envelope. Paired
// with the extra top margin in SummaryPage2, this keeps the "burst out"
// feel without covering text.
const CARD_FINAL = { widthPct: 90.99, heightPct: 165, centerXPct: 50, centerYPct: 51 };
const DECK_KEYFRAMES: Record<EnvState, { scale: number; opacity: number; y: number }> = {
  closed: { scale: 0.86, opacity: 0, y: 48 },
  flapOpen: { scale: 0.86, opacity: 0, y: 48 },
  cardRising: { scale: 1.015, opacity: 1, y: -5 },
  open: { scale: 1, opacity: 1, y: 0 },
};

// Envelope-front (flap/wedges/seal) opacity per state.
const ENVELOPE_FRONT_OPACITY: Record<EnvState, number> = {
  closed: 1, flapOpen: 1, cardRising: 0.28, open: 0,
};
// Flap lift progress 0→1 (0 = closed/flat, 1 = fully folded open via rotateX).
const FLAP_LIFT: Record<EnvState, number> = {
  closed: 0, flapOpen: 1, cardRising: 1, open: 1,
};
const GLOW_OPACITY: Record<EnvState, number> = {
  closed: 0, flapOpen: 0.85, cardRising: 0.22, open: 0,
};

const ASSET = (name: string) => `/quiz-summary/${name}`;

function subscribeReducedMotion(callback: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function getReducedMotionServerSnapshot() {
  return false;
}
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot, getReducedMotionServerSnapshot);
}

export default function EnvelopeCard({
  typeName,
  cards,
  onOpened,
}: {
  typeName: string;
  cards: StackCard[];
  onOpened?: () => void;
}) {
  const [state, setState] = useState<EnvState>("closed");
  const [motion, setMotion] = useState({ duration: 0, ease: EASE.quick });
  const reducedMotion = usePrefersReducedMotion();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedFired = useRef(false);

  const advanceFrom = (from: Exclude<EnvState, "open">) => {
    const t = TRANSITIONS[from];
    if (!t) return;
    setMotion({ duration: t.duration, ease: t.ease });
    setState(t.to);
  };

  useEffect(() => {
    if (state === "closed" || state === "open") return;
    // Wait for the incoming beat to finish before starting the next one.
    // This gives CSS a committed frame for each state without adding a pause.
    timerRef.current = setTimeout(() => advanceFrom(state), motion.duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [state, motion.duration]);

  useEffect(() => {
    if (state === "open" && !openedFired.current) {
      openedFired.current = true;
      onOpened?.();
    }
  }, [state, onOpened]);

  function handleActivate() {
    if (state !== "closed") return; // already playing or finished — the whole sequence is one tap
    if (reducedMotion) {
      setMotion({ duration: 0, ease: EASE.quick });
      setState("open");
      return;
    }
    advanceFrom("closed");
  }

  const box = DECK_KEYFRAMES[state];
  const flapLift = FLAP_LIFT[state];
  const frontOpacity = ENVELOPE_FRONT_OPACITY[state];
  const glowOpacity = GLOW_OPACITY[state];
  // Keep the envelope on the compositor: `all` also animates layout and
  // creates a visible snap on low-end mobile devices.
  const transition = `transform ${motion.duration}ms ${motion.ease}, opacity ${motion.duration}ms ${motion.ease}, filter ${motion.duration}ms ${motion.ease}`;
  const isComplete = state === "open";
  const isAnimating = state !== "closed" && !isComplete;

  const hintText = isComplete ? typeName : "Tap on the envelope to open your frinq summary";

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative mx-auto"
        style={{ width: "min(86%, 346px)", aspectRatio: "345.34 / 267.5" }}
      >
        {/* ── Envelope front — plain CSS clip-path, an envelope-unfold
            diagram: four triangular flaps meeting at APEX_X/APEX_Y, front
            one folded down on top. Different shades per flap read as the
            fold creases (no separate hairline assets needed). */}
        <div style={{
          position: "absolute", inset: 0, opacity: frontOpacity, transition, zIndex: 1,
          borderRadius: 6, overflow: "hidden",
          boxShadow: "0 14px 22px rgba(98,20,7,0.22)",
        }}>
          {/* Base/back of the envelope */}
          <div style={{ position: "absolute", inset: 0, background: "#ece7de" }} />
          {/* Bottom flap (folded first, sits lowest) */}
          <div style={{
            position: "absolute", inset: 0, background: "#ded7ca",
            clipPath: `polygon(0% 100%, 100% 100%, ${APEX_X}% ${APEX_Y}%)`,
          }} />
          {/* Left + right flaps (folded over the bottom one) */}
          <div style={{
            position: "absolute", inset: 0, background: "#e6e0d5",
            clipPath: `polygon(0% 0%, 0% 100%, ${APEX_X}% ${APEX_Y}%)`,
          }} />
          <div style={{
            position: "absolute", inset: 0, background: "#e6e0d5",
            clipPath: `polygon(100% 0%, 100% 100%, ${APEX_X}% ${APEX_Y}%)`,
          }} />

          {/* Warm glow at the neck as the flap lifts */}
          <img src={ASSET("envelope-glow-gap.svg")} alt="" aria-hidden="true" draggable={false}
            style={{ position: "absolute", width: "100%", height: "100%", opacity: glowOpacity, transition, zIndex: 2, ...inset(GLOW_GAP) }} />

          {/* Seal + "frinq" text (the seal SVG's own shading is real, kept as-is) */}
          <div style={{
            position: "absolute", zIndex: 4, left: `${APEX_X}%`, top: `${APEX_Y}%`,
            transform: `translate(-50%, -50%) scale(${state === "flapOpen" ? 1.08 : 1})`, width: "19%", height: "24%", transition,
          }}>
            <img src={ASSET("envelope-seal.svg")} alt="" aria-hidden="true" draggable={false}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-borel), cursive", color: "#fff", fontSize: 13, whiteSpace: "nowrap",
            }}>
              frinq
            </div>
          </div>

          {/* Front flap — the one piece that animates, a real 3D hinge fold:
              fixed box spanning the top down to the apex, rotating about
              its own top edge via `rotateX` + perspective on the parent.
              Positive rotateX (not negative) is what tips the flap's far
              (bottom) edge AWAY from the viewer, back over the top of the
              envelope — the actual "opening" motion. Negative rotated it
              toward the viewer instead, which read as folding forward/
              wrong. Also fades its own opacity as it passes the midpoint,
              well before backface concerns, and casts a real shadow (via
              `filter: drop-shadow`, which follows the clip-path'd shape,
              unlike `box-shadow`) so it visibly lifts off the paper. */}
          <div style={{
            position: "absolute", inset: 0, zIndex: 3, perspective: 700,
            clipPath: `polygon(0% 0%, 100% 0%, ${APEX_X}% ${APEX_Y}%)`,
            opacity: Math.max(0, 1 - Math.max(0, flapLift - 0.5) * 2),
            transition,
          }}>
            <div style={{
              position: "absolute", inset: 0, transformOrigin: "50% 0%", transformStyle: "preserve-3d", transition,
              transform: `rotateX(${flapLift * 148}deg)`,
              background: `linear-gradient(160deg, #fbf9f5 0%, #efe9df 100%)`,
              filter: `drop-shadow(0 ${flapLift * 10}px ${flapLift * 14}px rgba(74,50,30,${0.32 * flapLift}))`,
              backfaceVisibility: "hidden",
            }} />
          </div>
        </div>

        {/* ── The deck emerges here — always rendered at its final size;
            only scale + opacity animate. Not interactive until fully open. */}
        <div
          style={{
            position: "absolute", zIndex: 8, transition,
            left: `${CARD_FINAL.centerXPct}%`, top: `${CARD_FINAL.centerYPct}%`,
            width: `${CARD_FINAL.widthPct}%`, height: `${CARD_FINAL.heightPct}%`,
            transform: `translate(-50%, -50%) translateY(${box.y}px) scale(${box.scale})`,
            opacity: box.opacity,
            willChange: "transform, opacity",
          }}
        >
          <CardStack cards={cards} interactive={isComplete} />
        </div>

        <button
          type="button"
          onClick={handleActivate}
          disabled={isComplete || isAnimating}
          aria-label={isComplete ? `your friend type: ${typeName}` : "tap to open your frinq summary"}
          className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
          style={{
            position: "absolute", inset: 0, zIndex: 9, background: "transparent", border: "none", padding: 0,
            cursor: isComplete || isAnimating ? "default" : "pointer",
            outlineColor: "#86201b",
            pointerEvents: isComplete ? "none" : "auto",
          }}
        />
      </div>

      <p
        aria-live="polite"
        style={{
          marginTop: 18, fontFamily: "var(--font-urbanist), var(--font-motive), sans-serif",
          fontStyle: isComplete ? "normal" : "italic", fontSize: 12, color: "var(--qs-warm-gray, #725f55)",
          textAlign: "center", maxWidth: 280, opacity: isComplete ? 0 : 1, transition: "opacity 300ms ease",
          height: isComplete ? 0 : "auto", overflow: "hidden",
        }}
      >
        {hintText}
      </p>
    </div>
  );
}
