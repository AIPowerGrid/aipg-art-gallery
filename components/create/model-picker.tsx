"use client";

import { Model } from "@/lib/types/create";

interface ModelPickerProps {
  /** Already filtered to the active modality by the rail. */
  models: Model[];
  selectedModel: Model | null;
  onModelChange: (modelId: string) => void;
}

/**
 * Model list for the active modality as compact selectable rows. The modality
 * tab has already narrowed the set to a handful, so the list fits without
 * scrolling — no max-height clamp.
 */
export function ModelPicker({ models, selectedModel, onModelChange }: ModelPickerProps) {
  return (
    <div className="space-y-1.5">
      {models.map((model) => {
        const active = model.id === selectedModel?.id;
        return (
          <button
            key={model.id}
            type="button"
            onClick={() => onModelChange(model.id)}
            title={model.description}
            aria-pressed={active}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
              active
                ? "border-indigo-500/60 bg-indigo-600/15"
                : "border-zinc-700 bg-zinc-800/40 hover:border-zinc-600"
            }`}
          >
            <span className="text-[13px] font-medium text-white truncate">{model.name}</span>
            <span className="flex shrink-0 items-center gap-1">
              {model.status === "offline" && (
                <span
                  className="text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-500/15 text-red-400"
                  title="No workers are online for this model"
                >
                  offline
                </span>
              )}
              {model.requiresImage && (
                <span
                  className="text-[9.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400"
                  title="This model needs a source image"
                >
                  needs image
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
