"use client";

// Page 2 detailed summary screen — Figma node `353:2484` ("iPhone 17 - 31"),
// 402x3486 canonical entry state. See
// docs/quiz-upgrades/track-2-summary/figma-page-2-handoff/README-FOR-CLAUDE.md.
// Built as normal responsive document flow (not an absolutely-positioned
// 3486px canvas) — the Figma y-values only informed section order/typography.
//
// Staged reveal: only the greeting + envelope render at first. Everything
// from the card stack down (the type card + the four quick-read cards, the
// portrait, the RSVP block) is hidden until the envelope is fully opened,
// then fades/slides in — the envelope is the whole first moment, not one
// section among several.

import Image from "next/image";
import { useEffect, useState } from "react";
import CardStack from "./CardStack";
import type { StackCard } from "./CardStack";
import SummaryEnvelopeFlow from "./SummaryEnvelopeFlow";
import RsvpModal from "./RsvpModal";
import RsvpPhotoBlock from "./RsvpPhotoBlock";
import NavLink from "../NavLink";
import type { SummaryPageData } from "./types";

const ASSET = (name: string) => `/quiz-summary/${name}`;
const PAGE_PAD = 20; // px — mobile side gutter; RsvpPhotoBlock bleeds by this amount.

const QUICK_ROW_LABELS = [
  { key: "bring", label: "what you bring to the table" },
  { key: "notice", label: "what you notice about people" },
  { key: "connect", label: "how you get close to people" },
  { key: "care", label: "what you care about in friendship" },
] as const;

function displaySentence(text: string) {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

export default function SummaryPage2({ data }: { data: SummaryPageData }) {
  const [readOpened, setReadOpened] = useState(false);
  const [envelopeVisible, setEnvelopeVisible] = useState(true);
  const [mainEntered, setMainEntered] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!readOpened) return;
    const frame = requestAnimationFrame(() => setMainEntered(true));
    // Let the type card settle into the report before the longer reading
    // fades in. It turns the envelope moment into a clear beginning rather
    // than a jump between two unrelated screens.
    const revealTimer = window.setTimeout(() => setRevealed(true), 720);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(revealTimer);
    };
  }, [readOpened]);

  const cards: StackCard[] = [
    {
      key: "type",
      label: "your type",
      title: data.typeName,
      text: data.typeDefinition,
      shareCaption: data.shareCaption,
    },
    ...QUICK_ROW_LABELS.map(({ key, label }) => ({
      key,
      label,
      text: data.quickRows[key],
      shareCaption: `my frinq type is ${data.typeName}. ${data.quickRows[key]}`,
    })),
  ];
  const portrait = data.portrait.map(displaySentence);

  return (
    <>
    {readOpened && (
    // No `overflow` here on purpose. It used to be `overflow: hidden`
    // (defensive, for RsvpPhotoBlock's full-bleed negative margins) but any
    // ancestor with overflow other than visible breaks `position: sticky`
    // for descendants — that was the actual cause of CardStack's sticky
    // stage going blank partway through the scroll. Safe to drop: the
    // bleed is bounded within the 454px-max column below, which never
    // exceeds the viewport, so there's nothing for it to actually clip.
    <div style={{ position: "relative", background: "var(--qs-page, #fffbf7)" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ASSET("page-background.svg")}
        alt=""
        aria-hidden="true"
        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "auto", zIndex: 0 }}
      />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 454, margin: "0 auto", padding: `${PAGE_PAD}px ${PAGE_PAD}px 0` }}>
        {/* Header — same small square logo, top-left, as every other quiz
            page (see Header.tsx) rather than this page's own wordmark. */}
        <div style={{ opacity: mainEntered ? 1 : 0, transform: mainEntered ? "translateY(0)" : "translateY(-12px)", transition: "opacity 360ms ease, transform 520ms cubic-bezier(0.22,1,0.36,1)" }}>
          <NavLink href="/" className="no-underline inline-block">
            <Image src="/fq-logo.png" alt="frinq" width={38} height={38} className="w-[38px] h-[38px]" />
          </NavLink>
        </div>

        {/* Eyebrow + greeting */}
        <p style={{
          marginTop: 34, fontFamily: "var(--font-motive), sans-serif", fontWeight: 400,
          fontSize: 15, color: "var(--qs-red, #86201b)", letterSpacing: "0.02em", opacity: mainEntered ? 1 : 0, transition: "opacity 360ms ease 80ms",
        }}>
          Your Type
        </p>
        <h1 style={{
          margin: "8px 0 0", fontFamily: "var(--font-motive), sans-serif", fontWeight: 400,
          fontSize: 34, lineHeight: 1.05, color: "#2A1810", opacity: mainEntered ? 1 : 0, transform: mainEntered ? "translateY(0)" : "translateY(-10px)", transition: "opacity 400ms ease 100ms, transform 540ms cubic-bezier(0.22,1,0.36,1) 100ms",
        }}>
          Hey {data.firstName || "friend"},
        </h1>
        <p style={{
          margin: "6px 0 0", fontFamily: "var(--font-urbanist), var(--font-motive), sans-serif",
          fontWeight: 400, fontSize: 15, color: "var(--qs-warm-gray, #725f55)", opacity: mainEntered ? 1 : 0, transition: "opacity 400ms ease 160ms",
        }}>
          Here&apos;s how you show up with people.
        </p>

        {/* The type card is the first page of the read. It already rose out
            of the envelope in the preceding moment; here it settles into a
            calm, usable deck with room to swipe, share, and keep reading. */}
        <div style={{ marginTop: 56, marginBottom: 76, opacity: mainEntered ? 1 : 0, transform: mainEntered ? "translateY(0) scale(1)" : "translateY(-86px) scale(.96)", transformOrigin: "50% 0", transition: "opacity 380ms ease 110ms, transform 720ms cubic-bezier(0.22,1,0.36,1) 110ms" }}>
          <CardStack cards={cards} />
        </div>

        <div
          style={{
            opacity: revealed ? 1 : 0,
            transform: revealed ? "translateY(0)" : "translateY(28px)",
            transition: "opacity 520ms cubic-bezier(0.22,1,0.36,1), transform 520ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
            {/* Detailed opening — an editorial pull-quote block (left border
                accent + tinted background + serif italic) so it reads as a
                deliberate callout between the card stack and the portrait,
                not a floating unstyled line. Kept free of a decorative quote
                glyph on purpose — the portrait's drop-cap right below is
                already the one oversized-letter moment on this page; a
                second one here would compete with it instead of framing it. */}
            <div style={{
              marginTop: 20, padding: "18px 22px", borderRadius: "4px 14px 14px 4px",
              borderLeft: "4px solid var(--qs-red-deep, #621407)",
              background: "rgba(98,20,7,0.05)",
            }}>
              <p style={{
                margin: 0, fontFamily: "var(--font-things), Georgia, serif", fontStyle: "italic", fontWeight: 400,
                fontSize: 21, lineHeight: 1.48, color: "var(--qs-red-deep, #621407)",
              }}>
                {displaySentence(data.detailedOpening)}
              </p>
            </div>

            {/* Long portrait — a small section label + a drop-cap on the
                opening paragraph and thin dividers between the rest, so this
                reads as one considered piece of writing rather than a plain
                stack of paragraphs. Max-width keeps line length readable. */}
            <p style={{
              marginTop: 36, fontFamily: "var(--font-urbanist), var(--font-motive), sans-serif", fontWeight: 500,
              fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--qs-warm-gray, #725f55)",
            }}>
              The Bigger Picture
            </p>
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", maxWidth: 560, paddingBottom: 48 }}>
              {portrait.map((p, i) => (
                <div key={i}>
                  {i > 0 && (
                    <div aria-hidden="true" style={{
                      width: 28, height: 1, margin: "20px 0", background: "rgba(58,40,31,0.18)",
                    }} />
                  )}
                  <p style={{
                    margin: 0, fontFamily: "var(--font-motive), sans-serif", fontWeight: 400,
                    fontSize: 15, lineHeight: 1.7, color: "#3a281f",
                  }}>
                    {i === 0 && (
                      <span style={{
                        float: "left", fontFamily: "var(--font-things), Georgia, serif", fontWeight: 400,
                        fontSize: 46, lineHeight: 0.8, margin: "4px 6px 0 0", color: "var(--qs-red-deep, #621407)",
                      }}>
                        {p.charAt(0)}
                      </span>
                    )}
                    {i === 0 ? p.slice(1) : p}
                  </p>
                </div>
              ))}
            </div>
        </div>
      </div>

      {/* Bottom photo RSVP block — full-bleed within the page column.
          Paid users don't see this at all (not even a "you're on the
          list" version) — the RSVP ask is only relevant pre-payment. */}
      {!data.isPaid && (
        <div style={{
          position: "relative", zIndex: 1, maxWidth: 454, margin: "0 auto", padding: `${PAGE_PAD}px ${PAGE_PAD}px 0`,
          opacity: revealed ? 1 : 0, transition: "opacity 520ms cubic-bezier(0.22,1,0.36,1)",
        }}>
          <RsvpPhotoBlock rsvpUrl={data.rsvpUrl} isPaid={data.isPaid} bleed={PAGE_PAD} />
        </div>
      )}

      <RsvpModal rsvpUrl={data.rsvpUrl} isPaid={data.isPaid} active={readOpened} />
    </div>
    )}

    {/* Keep the report mounted underneath for the final part of the envelope
        animation. The two scenes now overlap and crossfade, so there is no
        empty cream screen between the rising card and the full read. */}
    {envelopeVisible && (
      <div style={{ position: "fixed", inset: 0, zIndex: 100, overflow: "hidden" }}>
        <SummaryEnvelopeFlow
          firstName={data.firstName}
          cards={cards}
          onRevealStart={() => setReadOpened(true)}
          onRevealComplete={() => setEnvelopeVisible(false)}
        />
      </div>
    )}
    </>
  );
}
