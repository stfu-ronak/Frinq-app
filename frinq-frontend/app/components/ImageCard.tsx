"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { getQuizState, setQuizState } from "@/app/lib/storage";

interface Card {
  title: string;
  body: string;
  imgSrc?: string;
  icon?: React.ReactNode;
}

interface Props {
  cards: Card[];
  nextHref: string;
  storageKey?: string;
}

function CardMedia({ card, sizes }: { card: Card; sizes: string }) {
  const [imgError, setImgError] = useState(false);
  const showImg = card.imgSrc && !imgError;
  return (
    <>
      {showImg ? (
        <Image
          src={card.imgSrc!}
          alt={card.title}
          fill
          className="object-contain"
          sizes={sizes}
          onError={() => setImgError(true)}
          // `darken` keeps the darker of bg/image pixel — hides white PNG bg
          // against the cream container without dulling the brown ink like `multiply` does.
          style={{ mixBlendMode: "darken" }}
        />
      ) : card.icon ? (
        <div className="text-[#2A1810] opacity-60">{card.icon}</div>
      ) : null}
    </>
  );
}

export default function ImageCardGrid({ cards, nextHref, storageKey }: Props) {
  const [selected, setSelected] = useState<number | null>(() => {
    if (!storageKey) return null;
    const saved = getQuizState(storageKey);
    if (!saved) return null;
    const idx = cards.findIndex(c => c.title === saved);
    return idx !== -1 ? idx : null;
  });
  const [tapping, setTapping] = useState<number | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  function pick(i: number) {
    setSelected(i);
    setTapping(i);
    if (storageKey) setQuizState(storageKey, cards[i].title);
    window.frinqTrack?.("select_card", { page: pathname, choice: cards[i].title });
    setTimeout(() => setTapping(null), 200);
    setTimeout(() => {
      if (document.startViewTransition) {
        document.startViewTransition(() => { router.push(nextHref); });
      } else {
        router.push(nextHref);
      }
    }, 320);
  }

  function cardStyle(i: number): React.CSSProperties {
    const isSelected = selected === i;
    const isTapping = tapping === i;
    return {
      border: isSelected ? "2px solid #2A1810" : "1px solid rgba(42,24,16,0.12)",
      transform: isSelected && !isTapping ? "scale(1.02)" : "scale(1)",
      animation: isTapping ? "fqBounce 200ms ease-out forwards" : undefined,
      opacity: selected !== null && !isSelected ? 0.42 : 1,
      transition: isTapping
        ? "opacity 200ms ease, border 200ms ease, background 200ms ease"
        : "transform 200ms ease-out, opacity 200ms ease, background 200ms ease, border 200ms ease",
      background: isSelected ? "rgba(42,24,16,0.04)" : "transparent",
    };
  }

  return (
    <>
      {/* Mobile: 2×2 grid */}
      <div className="grid grid-cols-2 gap-3 w-full md:hidden pb-20">
        {cards.map((card, i) => (
          <button
            key={i}
            onClick={() => pick(i)}
            className="frinq-card text-left flex flex-col overflow-hidden w-full relative"
            style={cardStyle(i)}
          >
            <div
              className="relative w-full flex items-center justify-center flex-shrink-0"
              style={{ aspectRatio: "1/1", background: "#F5F0E8" }}
            >
              <CardMedia card={card} sizes="50vw" />
            </div>
            <div className="px-2.5 pt-2 pb-3 flex flex-col gap-1 flex-shrink-0">
              <div className="w-full h-px bg-[rgba(42,24,16,0.12)] mb-1.5" />
              <p className="font-[family-name:var(--font-motive)] text-[9px] tracking-[0.16em] uppercase"
                style={{ color: selected === i ? "#2A1810" : "#8B7355" }}>
                {card.title}
              </p>
              <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[11.5px] leading-snug mt-0.5">
                {card.body}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Desktop: 2×2 grid */}
      <div className="hidden md:grid grid-cols-2 gap-4 max-w-2xl w-full pb-20">
        {cards.map((card, i) => (
          <button
            key={i}
            onClick={() => pick(i)}
            className="frinq-card text-left flex flex-col gap-0 overflow-hidden relative"
            style={cardStyle(i)}
          >
            <div
              className="relative w-full flex-shrink-0"
              style={{ aspectRatio: "4/3", background: "#F5F0E8" }}
            >
              <CardMedia card={card} sizes="280px" />
            </div>
            <div className="px-5 pt-4 pb-5 flex flex-col gap-1.5">
              <div className="w-full h-px bg-[rgba(42,24,16,0.12)] mb-1" />
              <p className="font-[family-name:var(--font-motive)] text-[10px] tracking-[0.16em] uppercase"
                style={{ color: selected === i ? "#2A1810" : "#8B7355" }}>
                {card.title}
              </p>
              <p className="font-[family-name:var(--font-things)] text-[#2A1810] text-[15px] leading-snug mt-0.5">
                {card.body}
              </p>
            </div>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes fqBounce {
          0%   { transform: scale(1); }
          35%  { transform: scale(0.98); }
          100% { transform: scale(1.02); }
        }
      `}</style>
    </>
  );
}
