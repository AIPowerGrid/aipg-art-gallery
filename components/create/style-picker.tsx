"use client";

import { GridStyle } from "@/types/models";

interface StylePickerProps {
  styles: GridStyle[];
  selectedStyleId: string | null;
  onSelect: (style: GridStyle | null) => void;
  /** Only show styles matching the current media type (image|video). */
  modelType?: string;
  /** Render just the chips (no outer card/header) — for nesting inside a group. */
  bare?: boolean;
}

function chip(active: boolean) {
  // Match the shared chip vocabulary (small radius, accent-tint selected state).
  return `chip${active ? " chip-active" : ""}`;
}

export function StylePicker({ styles, selectedStyleId, onSelect, modelType = "image", bare = false }: StylePickerProps) {
  const visible = styles.filter((s) => s.job_type === modelType);
  if (visible.length === 0) return null;

  const chips = (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onSelect(null)} className={chip(selectedStyleId === null)}>
        None
      </button>
      {visible.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s)}
          title={s.description}
          className={chip(selectedStyleId === s.id)}
        >
          {s.name}
        </button>
      ))}
    </div>
  );

  if (bare) return chips;

  return (
    <div className="border border-border rounded-2xl p-5 bg-secondary/30">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
        <span>Style</span>
        <span className="text-tertiary">— curated prompt + settings (locks the right knobs)</span>
      </div>
      {chips}
    </div>
  );
}
