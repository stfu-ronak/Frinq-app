"use client";
import { ReactNode, useEffect, useState, CSSProperties } from "react";

export default function FadeUp({
  children, delay = 0, distance = 16, duration = 400, style, className,
}: { children: ReactNode; delay?: number; distance?: number; duration?: number; style?: CSSProperties; className?: string }) {
  const [m, setM] = useState(false);
  useEffect(() => { const t = setTimeout(() => setM(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div
      className={className}
      style={{
        opacity: m ? 1 : 0,
        transform: m ? "translateY(0)" : `translateY(${distance}px)`,
        transition: `opacity ${duration}ms cubic-bezier(0.4,0,0.2,1), transform ${duration}ms cubic-bezier(0.4,0,0.2,1)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
