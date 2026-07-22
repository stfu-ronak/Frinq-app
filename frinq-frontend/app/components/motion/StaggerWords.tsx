"use client";
import { useEffect, useState, CSSProperties, ElementType } from "react";

export default function StaggerWords({
  text, delay = 0, gap = 60, style, as: As = "h1" as ElementType, size, className,
}: { text: string; delay?: number; gap?: number; style?: CSSProperties; as?: ElementType; size?: string; className?: string }) {
  const words = String(text).split(" ");
  const [shown, setShown] = useState(0);

  // Restart the stagger from 0 whenever text/delay/gap change while this
  // instance stays mounted. Adjusted during render (React's documented
  // pattern for resetting state on prop change) rather than in the effect
  // below, so there's no frame where the old text renders fully "shown"
  // before the reset catches up.
  const [animKey, setAnimKey] = useState({ text, delay, gap });
  if (animKey.text !== text || animKey.delay !== delay || animKey.gap !== gap) {
    setAnimKey({ text, delay, gap });
    setShown(0);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      let i = 0;
      const tick = () => { i += 1; setShown(i); if (i < words.length) setTimeout(tick, gap); };
      tick();
    }, delay);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, delay, gap]);

  return (
    <As
      className={className}
      style={{
        fontFamily: "var(--font-things), Georgia, serif",
        color: "var(--color-brown, #2A1810)",
        fontWeight: 400,
        margin: 0,
        lineHeight: 1.05,
        fontSize: size || "clamp(28px, 8vw, 44px)",
        ...style,
      }}
    >
      {words.map((w, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            opacity: i < shown ? 1 : 0,
            transform: i < shown ? "translateY(0)" : "translateY(18px)",
            transition: "opacity 420ms cubic-bezier(0.4,0,0.2,1), transform 420ms cubic-bezier(0.34,1.56,0.64,1)",
            marginRight: "0.28em",
          }}
        >
          {w}
        </span>
      ))}
    </As>
  );
}
