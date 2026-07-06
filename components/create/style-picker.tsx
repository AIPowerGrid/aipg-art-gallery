"use client";

import { GridStyle } from "@/types/models";

interface StylePickerProps {
  styles: GridStyle[];
  selectedStyleId: string | null;
  onSelect: (style: GridStyle | null) => void;
  /** Only show styles matching the current media type (image|video). */
  modelType?: string;
}

function chip(active: boolean) {
  return [
    "px-3 py-1.5 rounded-full text-sm border transition-colors",
    active
      ? "bg-indigo-600 border-indigo-500 text-white"
      : "bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:border-zinc-500",
  ].join(" ");
}

export function StylePicker({ styles, selectedStyleId, onSelect, modelType = "image" }: StylePickerProps) {
  const visible = styles.filter((s) => s.job_type === modelType);
  if (visible.length === 0) return null;

  return (
    <div className="border border-zinc-700 rounded-2xl p-5 bg-zinc-800/30">
      <div className="flex items-center gap-2 text-xs text-zinc-400 mb-3">
        <span>Style</span>
        <span className="text-zinc-600">— curated prompt + settings (locks the right knobs)</span>
      </div>
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
    </div>
  );
}
