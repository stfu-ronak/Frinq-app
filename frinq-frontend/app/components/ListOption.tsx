"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface Option {
  label: string;
  icon?: React.ReactNode;
}

interface Props {
  options: Option[];
  nextHref: string;
}

export default function ListOptions({ options, nextHref }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  function pick(i: number) {
    setSelected(i);
    window.frinqTrack?.("select_option", { page: pathname, choice: options[i].label });
    setTimeout(() => {
      if (document.startViewTransition) {
        document.startViewTransition(() => { router.push(nextHref); });
      } else {
        router.push(nextHref);
      }
    }, 320);
  }

  return (
    <div className="w-full max-w-2xl">
      {options.map((opt, i) => (
        <div
          key={i}
          className={`frinq-list-option ${selected === i ? "selected" : ""}`}
          onClick={() => pick(i)}
        >
          {opt.icon && (
            <span className="w-6 text-[#2A1810] flex-shrink-0">{opt.icon}</span>
          )}
          <span className="font-[family-name:var(--font-motive)] text-[15px] md:text-[16px] font-light">
            {opt.label}
          </span>
        </div>
      ))}
    </div>
  );
}
