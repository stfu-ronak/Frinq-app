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
}

export default function NavLink({ href, children, className, style, replace, onClick }: Props) {
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
    <a href={href} onClick={navigate} className={className} style={style}>
      {children}
    </a>
  );
}
