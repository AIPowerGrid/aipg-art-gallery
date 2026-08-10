"use client";

import type { ReactNode } from "react";

interface CoachTipProps {
  id: string;
  label: "Start here" | "Required" | "Ready";
  children: ReactNode;
  className?: string;
}

export function CoachTip({ id, label, children, className = "" }: CoachTipProps) {
  return (
    <div
      id={id}
      role="status"
      className={`relative mb-2 rounded-md border border-primary/55 bg-primary/10 px-2.5 py-2 text-[11.5px] leading-4 text-foreground shadow-[0_8px_24px_rgba(0,0,0,0.28)] ${className}`}
    >
      <span className="mr-1.5 font-semibold text-primary">{label}:</span>
      {children}
    </div>
  );
}
