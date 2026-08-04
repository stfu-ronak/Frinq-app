"use client";

import { useEffect, useRef, useState } from "react";
import CardStack from "./CardStack";
import type { StackCard } from "./CardStack";

const TOTAL_MS = 3600;
const EASE_OUT = "cubic-bezier(.22,1,.36,1)";
const EASE_IN_OUT = "cubic-bezier(.65,0,.35,1)";
const EASE_SPRING = "cubic-bezier(.18,.72,.24,1.02)";
const ASSET = (name: string) => `/quiz-summary/${name}`;

/**
 * The Page 2 hand-off follows the live envelope interaction: the deck begins
 * inside the pocket, the flap folds behind it, and the card is pulled upward.
 * It is a separate full-screen moment so the reader understands that the
 * longer, personal read is about to begin.
 */
export default function SummaryEnvelopeFlow({
  firstName,
  cards,
  onRevealStart,
  onRevealComplete,
}: {
  firstName: string;
  cards: StackCard[];
  onRevealStart: () => void;
  onRevealComplete: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const [pocketOpen, setPocketOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const flapRef = useRef<HTMLDivElement | null>(null);
  const flapLayerRef = useRef<HTMLDivElement | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);
  const sealRef = useRef<HTMLDivElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const washRef = useRef<HTMLDivElement | null>(null);
  const revealStartRef = useRef(onRevealStart);
  const revealCompleteRef = useRef(onRevealComplete);

  useEffect(() => {
    revealStartRef.current = onRevealStart;
    revealCompleteRef.current = onRevealComplete;
  }, [onRevealStart, onRevealComplete]);

  useEffect(() => {
    if (!opening) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const startTimer = window.setTimeout(() => revealStartRef.current(), 20);
      const finishTimer = window.setTimeout(() => revealCompleteRef.current(), 180);
      return () => {
        window.clearTimeout(startTimer);
        window.clearTimeout(finishTimer);
      };
    }

    const anim = (node: Element | null, frames: Keyframe[]) =>
      node?.animate(frames, { duration: TOTAL_MS, fill: "both" });
    // The opening deck has a different rendered height on each phone. Use
    // its real dimensions so "half out" and "fully out" mean the same thing
    // on a narrow phone and on a larger screen recording.
    const sceneHeight = sceneRef.current?.getBoundingClientRect().height || 267;
    const deckHeight = deckRef.current?.getBoundingClientRect().height || 440;
    const deckTop = sceneHeight * 0.16;
    const halfPull = Math.round(deckHeight * 0.42);
    const fullPull = Math.round(deckHeight + deckTop + 8);
    // Mount the report underneath before this full-screen scene fades away.
    // The overlap removes the blank frame that used to sit between the card
    // leaving the envelope and the detailed summary appearing.
    const root = anim(rootRef.current, [
      { offset: 0, opacity: 1, easing: "linear" },
      { offset: .84, opacity: 1, easing: EASE_OUT },
      { offset: 1, opacity: 0, easing: EASE_OUT },
    ]);
    const scene = anim(sceneRef.current, [
      { offset: 0, opacity: 1, transform: "translateY(0) scale(1)", easing: "linear" },
      // Hold the envelope until the card has completely cleared it. The
      // scene then quietly recedes underneath the card instead of cutting.
      { offset: .91, opacity: 1, transform: "translateY(0) scale(1)", easing: EASE_OUT },
      { offset: 1, opacity: 0, transform: "translateY(20px) scale(.98)", easing: EASE_OUT },
    ]);
    const glow = anim(glowRef.current, [
      { offset: 0, opacity: 0, transform: "translate(-50%, -50%) scale(.55)", easing: "linear" },
      { offset: .22, opacity: .3, transform: "translate(-50%, -50%) scale(.75)", easing: EASE_OUT },
      { offset: .61, opacity: 1, transform: "translate(-50%, -50%) scale(1.13)", easing: EASE_OUT },
      { offset: .86, opacity: .8, transform: "translate(-50%, -50%) scale(1.28)", easing: EASE_OUT },
      { offset: 1, opacity: 0, transform: "translate(-50%, -50%) scale(1.36)" },
    ]);
    const flap = anim(flapRef.current, [
      { offset: 0, transform: "rotateX(0deg)", easing: "linear" },
      { offset: .16, transform: "rotateX(0deg)", easing: EASE_IN_OUT },
      { offset: .43, transform: "rotateX(-172deg)", easing: EASE_OUT },
      { offset: 1, transform: "rotateX(-172deg)" },
    ]);
    const deck = anim(deckRef.current, [
      { offset: 0, opacity: 0, transform: "translateY(0) scale(.9)", easing: "linear" },
      { offset: .24, opacity: 0, transform: "translateY(0) scale(.92)", easing: EASE_OUT },
      { offset: .33, opacity: 1, transform: "translateY(0) scale(.92)", easing: EASE_SPRING },
      // First stop: clearly half inside the envelope, half visible above it.
      { offset: .53, opacity: 1, transform: `translateY(-${halfPull}px) scale(1.01)`, easing: EASE_SPRING },
      { offset: .62, opacity: 1, transform: `translateY(-${halfPull}px) scale(1)`, easing: "linear" },
      // Second move: pull the same card completely clear of the pocket.
      { offset: .82, opacity: 1, transform: `translateY(-${fullPull}px) scale(1.01)`, easing: EASE_SPRING },
      { offset: .91, opacity: 1, transform: `translateY(-${fullPull}px) scale(1)`, easing: "linear" },
      { offset: 1, opacity: 0, transform: `translateY(-${fullPull}px) scale(.985)`, easing: EASE_OUT },
    ]);
    const seal = anim(sealRef.current, [
      { offset: 0, opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
      { offset: .1, opacity: 1, transform: "translate(-50%, -50%) scale(1.08)", easing: EASE_OUT },
      { offset: .24, opacity: .75, transform: "translate(-50%, calc(-50% + 16px)) scale(.92)", easing: EASE_OUT },
      { offset: .34, opacity: 0, transform: "translate(-50%, calc(-50% + 48px)) scale(.6)" },
      { offset: 1, opacity: 0, transform: "translate(-50%, calc(-50% + 48px)) scale(.6)" },
    ]);
    const wash = anim(washRef.current, [
      { offset: 0, opacity: 0, transform: "scale(.3)" },
      { offset: .91, opacity: 0, transform: "scale(.3)", easing: EASE_OUT },
      { offset: 1, opacity: 1, transform: "scale(1.3)", easing: EASE_OUT },
    ]);
    const flip = window.setTimeout(() => {
      if (flapLayerRef.current) flapLayerRef.current.style.zIndex = "1";
    }, 1020);
    // Keep the sealed envelope completely clean. The pocket mouth appears
    // only once the top flap has begun to lift, just before the card shows.
    const pocketTimer = window.setTimeout(() => setPocketOpen(true), 900);
    const revealStart = window.setTimeout(() => revealStartRef.current(), TOTAL_MS * .83);
    const revealComplete = window.setTimeout(() => revealCompleteRef.current(), TOTAL_MS);
    return () => {
      [root, scene, glow, flap, deck, seal, wash].forEach((a) => a?.cancel());
      window.clearTimeout(flip);
      window.clearTimeout(pocketTimer);
      window.clearTimeout(revealStart);
      window.clearTimeout(revealComplete);
    };
  }, [opening]);

  return (
    <div ref={rootRef} style={{ minHeight: "100dvh", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column", background: "#fffbf7", willChange: "opacity" }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 47%, rgba(212,164,65,.18), rgba(255,251,247,0) 40%)" }} />
      <header style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 24px" }}>
        <span style={{ fontFamily: "var(--font-borel), cursive", fontSize: 24, color: "#621407" }}>frinq</span>
        <span style={{ fontFamily: "var(--font-urbanist), sans-serif", fontSize: 11, color: "#725f55", letterSpacing: ".08em", textTransform: "uppercase" }}>Your read is ready</span>
      </header>

      <main style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px 74px", textAlign: "center" }}>
        <div style={{ opacity: opening ? 0 : 1, transform: opening ? "translateY(-10px)" : "translateY(0)", transition: "opacity 300ms ease, transform 300ms ease", maxWidth: 320 }}>
          <p style={{ margin: 0, fontFamily: "var(--font-motive), sans-serif", color: "#86201b", fontSize: 14, letterSpacing: ".04em" }}>Hi {firstName || "friend"},</p>
          <h1 style={{ margin: "12px 0 0", fontFamily: "var(--font-things), Georgia, serif", color: "#2a1810", fontWeight: 400, fontSize: "clamp(28px, 8vw, 37px)", lineHeight: 1.08 }}>
            Frinq has read between your lines.
          </h1>
          <p style={{ margin: "12px 0 0", fontFamily: "var(--font-urbanist), sans-serif", color: "#725f55", fontSize: 15, lineHeight: 1.5 }}>
            Open the envelope to see the friend you are when it really counts.
          </p>
        </div>

        <div ref={sceneRef} style={{ position: "relative", width: "min(86vw, 346px)", aspectRatio: "345 / 267", marginTop: opening ? 0 : 48, perspective: 1300, willChange: "transform, opacity" }}>
          <div aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: -28, width: "76%", height: 34, transform: "translateX(-50%)", background: "radial-gradient(ellipse, rgba(80,35,12,.25), transparent 68%)", filter: "blur(3px)" }} />
          {/* The light begins inside the envelope and grows with the card,
              not as a generic page flash. */}
          <div ref={glowRef} aria-hidden="true" style={{ position: "absolute", zIndex: 1, left: "50%", top: "48%", width: "135%", aspectRatio: "1", borderRadius: "50%", pointerEvents: "none", opacity: 0, transform: "translate(-50%, -50%) scale(.55)", background: "radial-gradient(circle, rgba(255,239,160,.95) 0%, rgba(229,177,61,.52) 24%, rgba(170,90,21,.16) 51%, transparent 71%)", filter: "blur(2px)", willChange: "transform, opacity" }} />

          {/* This deck is deliberately NOT inside an overflow-hidden box.
              While it is in the pocket, the front panels cover it. Once it
              moves upward it is free to clear the envelope as one complete
              card instead of being cropped in half. */}
          {/* The back wall is visible through the open mouth. That small
              piece of depth is what makes the card read as being inside the
              envelope rather than simply travelling behind a flat picture. */}
          <div aria-hidden="true" style={{ position: "absolute", zIndex: 0, inset: 0, borderRadius: 8, background: "linear-gradient(145deg, #faf7f1 0%, #e8dfd0 100%)", border: "1px solid rgba(98,70,42,.16)", boxShadow: "0 18px 32px rgba(98,20,7,.2)" }} />

          {/* This mask intentionally reaches far above the envelope but ends
              exactly at its bottom. The card can therefore leave upward,
              but no part of it can ever appear underneath the envelope. */}
          <div aria-hidden="true" style={{ position: "absolute", zIndex: 2, left: 0, right: 0, top: -720, bottom: 0, overflow: "hidden", pointerEvents: "none" }}>
            <div ref={deckRef} style={{ position: "absolute", left: "11%", top: "calc(720px + 16%)", width: "78%", opacity: 0, willChange: "transform, opacity" }}>
              <CardStack cards={cards} interactive={false} />
            </div>
          </div>

          {/* Back wall and front pocket. It covers the deck only within the
              envelope's bounds, exactly like a physical paper pocket. */}
          <div style={{ position: "absolute", zIndex: 3, inset: 0, pointerEvents: "none" }}>
            {/* The upper centre is intentionally left open. Once the flap
                lifts, the reader sees the card already sitting in this
                pocket before it begins to travel upward. */}
            <div style={{ position: "absolute", zIndex: 3, inset: 0, background: "#e6e0d5", clipPath: pocketOpen ? "polygon(0 25%, 0 100%, 50% 52%)" : "polygon(0 0, 0 100%, 50% 52%)", transition: "clip-path 180ms ease" }} />
            <div style={{ position: "absolute", zIndex: 3, inset: 0, background: "#e1dacd", clipPath: pocketOpen ? "polygon(100% 25%, 100% 100%, 50% 52%)" : "polygon(100% 0, 100% 100%, 50% 52%)", transition: "clip-path 180ms ease" }} />
            <div style={{ position: "absolute", zIndex: 3, inset: 0, background: "#d9d0c2", clipPath: "polygon(0 100%, 100% 100%, 50% 52%)" }} />
            <div aria-hidden="true" style={{ position: "absolute", zIndex: 4, left: "10%", right: "10%", top: "25%", height: 10, borderTop: "1px solid rgba(90,62,37,.18)", background: "linear-gradient(180deg, rgba(94,67,41,.13), transparent)", pointerEvents: "none", opacity: pocketOpen ? 1 : 0, transition: "opacity 160ms ease" }} />
          </div>

          <div ref={flapLayerRef} style={{ position: "absolute", inset: 0, zIndex: 5, perspective: 900, clipPath: "polygon(0 0, 100% 0, 50% 52%)" }}>
            <div ref={flapRef} style={{ position: "absolute", inset: 0, transformOrigin: "50% 0%", background: "linear-gradient(160deg, #fbf9f5, #e8e0d3)", borderTopLeftRadius: 8, borderTopRightRadius: 8, backfaceVisibility: "hidden", willChange: "transform" }} />
          </div>
          <div ref={sealRef} style={{ position: "absolute", zIndex: 7, left: "50%", top: "52%", width: "20%", aspectRatio: "1", transform: "translate(-50%, -50%)", willChange: "transform, opacity" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ASSET("envelope-seal.svg")} alt="" aria-hidden="true" style={{ width: "100%", height: "100%" }} />
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "white", fontFamily: "var(--font-borel), cursive", fontSize: 12 }}>frinq</span>
          </div>
          <button type="button" onClick={() => setOpening(true)} disabled={opening} aria-label="Open your friend read" style={{ position: "absolute", inset: 0, zIndex: 9, border: 0, background: "transparent", cursor: opening ? "default" : "pointer" }} />
        </div>

        <div style={{ marginTop: 28, opacity: opening ? 0 : 1, transition: "opacity 240ms ease" }}>
          <button type="button" onClick={() => setOpening(true)} disabled={opening} style={{ border: 0, background: "transparent", color: "#621407", fontFamily: "var(--font-urbanist), sans-serif", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer" }}>
            Open your read →
          </button>
        </div>
      </main>
      <div ref={washRef} aria-hidden="true" style={{ position: "absolute", zIndex: 10, width: "150vmax", height: "150vmax", left: "50%", top: "50%", borderRadius: "50%", transform: "translate(-50%, -50%) scale(.3)", pointerEvents: "none", background: "#fffbf7", opacity: 0, willChange: "transform, opacity" }} />
    </div>
  );
}
