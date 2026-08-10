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
            className={`group flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all duration-150 ${
              active
                ? "border-primary/55 bg-primary/12 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
                : "border-border bg-card/50 hover:border-edge hover:bg-accent"
            }`}
            style={{ transitionTimingFunction: "var(--ease)" }}
          >
            {/* Radio indicator */}
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                active ? "border-primary" : "border-edge"
              }`}
            >
              {active && <span className="h-2 w-2 rounded-full bg-primary" />}
            </span>
            <span className={`flex-1 truncate text-[13px] font-medium ${active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}>
              {model.name}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {model.status === "offline" && (
                <span className="badge badge-neutral text-[9.5px]" title="No workers are online for this model">
                  offline
                </span>
              )}
              {model.requiresImage && (
                <span className="badge text-[9.5px]" style={{ backgroundColor: "hsl(var(--warning) / 0.15)", color: "hsl(var(--warning))" }} title="This model needs a source image">
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
