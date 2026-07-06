"use client";

import { useState, ReactNode } from "react";

interface CollapsibleSectionProps {
  title: string;
  /** Short status hint shown next to the title (e.g. the active selection). */
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A one-line disclosure that expands its content inline. Used on the create page
 * to keep secondary controls (styles, reference image, LoRA) collapsed by
 * default so the prompt stays the focus.
 */
export function CollapsibleSection({
  title,
  hint,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-zinc-700/60 rounded-xl bg-zinc-800/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-700/30 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="font-medium">{title}</span>
          {hint && !open && (
            <span className="text-xs text-zinc-400 truncate max-w-[200px]">{hint}</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-zinc-700/40">{children}</div>
      )}
    </div>
  );
}
