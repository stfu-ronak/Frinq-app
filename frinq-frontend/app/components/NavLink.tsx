"use client";

import { useRouter } from "next/navigation";
import { ReactNode, MouseEvent, CSSProperties } from "react";

interface Props {
  href: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  replace?: boolean;
  onClick?: () => void;
  "aria-current"?: "page";
  "aria-label"?: string;
}

export default function NavLink({
  href, children, className, style, replace, onClick,
  "aria-current": ariaCurrent, "aria-label": ariaLabel,
}: Props) {
  const router = useRouter();

  function navigate(e: MouseEvent) {
    e.preventDefault();
    onClick?.();
    const go = replace ? router.replace.bind(router) : router.push.bind(router);
    if (!document.startViewTransition) {
      go(href);
      return;
    }
    document.startViewTransition(() => { go(href); });
  }

  return (
    <a
      href={href}
      onClick={navigate}
      className={className}
      style={style}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  );
}
