"use client";

import { Dimension } from "@/lib/types/create";

interface SizePickerProps {
  dimensions: Dimension[];
  selectedId: number;
  onChange: (id: number) => void;
}

/**
 * Aspect-ratio picker as a compact wrapping row of chips — each shows a tiny
 * proportional box + its ratio, so the whole set of ~9 ratios fits in two short
 * rows instead of a tall card grid. Reads `styles.dimensions`; the selected id
 * flows straight into the generation params.
 */
export function SizePicker({ dimensions, selectedId, onChange }: SizePickerProps) {
  if (dimensions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {dimensions.map((d) => {
        const active = d.id === selectedId;
        // Tiny proportional glyph: longest side maps to 14px.
        const max = Math.max(d.width, d.height);
        const w = (d.width / max) * 14;
        const h = (d.height / max) * 14;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onChange(d.id)}
            aria-pressed={active}
            title={`${d.label} — ${d.width} × ${d.height}`}
            className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors ${
              active
                ? "border-primary/60 bg-primary/15 text-white"
                : "border-border bg-card/60 text-foreground hover:border-edge"
            }`}
          >
            <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
              <span
                className={`rounded-[2px] border ${active ? "border-primary bg-primary/25" : "border-edge"}`}
                style={{ width: `${w}px`, height: `${h}px` }}
              />
            </span>
            <span className="tabular-nums">{d.aspectRatio}</span>
          </button>
        );
      })}
    </div>
  );
}
