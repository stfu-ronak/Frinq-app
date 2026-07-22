"use client";
import { ReactNode, useId, CSSProperties } from "react";

export default function Float({
  children, amp = 6, period = 4000, style, className,
}: { children: ReactNode; amp?: number; period?: number; style?: CSSProperties; className?: string }) {
  // useId() is stable across the server render and client hydration, unlike
  // Math.random() which produced a different keyframe name on each side and
  // caused a hydration mismatch. Strip the colons useId() includes since
  // they aren't valid in a CSS @keyframes identifier.
  const id = "fq-float-" + useId().replace(/:/g, "");
  return (
    <>
      <style>{`
        @keyframes ${id} {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50%       { transform: translateY(-${amp}px) rotate(0.4deg); }
        }
      `}</style>
      <div style={{ animation: `${id} ${period}ms ease-in-out infinite`, ...style }} className={className}>
        {children}
      </div>
    </>
  );
}
