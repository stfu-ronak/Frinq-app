/** Tailwind `animate-pulse` placeholder blocks — no new CSS. Renders `rows`
 *  bars of `height` stacked with a gap, standing in for content that hasn't
 *  loaded yet so the layout doesn't jump once it does. */
export function Skeleton({ rows = 3, height = 16, className = "" }: { rows?: number; height?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="animate-pulse rounded bg-[rgba(42,24,16,0.08)]" style={{ height }} />
      ))}
    </div>
  );
}
