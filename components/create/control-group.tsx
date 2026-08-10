"use client";

import { ReactNode } from "react";

interface ControlGroupProps {
  title: string;
  /** Optional pill after the title (e.g. "video only"). */
  badge?: string;
  /** Amber accent for capability-gated groups (e.g. Motion). */
  badgeTone?: "default" | "warn";
  children: ReactNode;
}

/**
 * A labeled section inside the Studio rail — a small dot, an uppercase title,
 * and its controls. Grouping controls by *what they affect* (Composition,
 * Sampling, Motion, Add-ons) is what lets the Advanced panel grow with new
 * models without becoming a flat wall of sliders.
 */
export function ControlGroup({ title, badge, badgeTone = "default", children }: ControlGroupProps) {
  return (
    <section className="mb-6 last:mb-0">
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-1.5 rounded-full ${badgeTone === "warn" ? "bg-warning" : "bg-primary"}`} />
        <span className="eyebrow">{title}</span>
        {badge && (
          <span
            className={`text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
              badgeTone === "warn" ? "bg-amber-500/15 text-amber-400" : "bg-primary/20 text-primary"
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
