"use client";

import { Model, AdvancedSettings } from "@/lib/types/create";
import { ModelCapabilities } from "@/lib/create/capabilities";

interface ControlsProps {
  selectedModel: Model | null;
  settings: AdvancedSettings;
  onChange: (settings: AdvancedSettings) => void;
  defaults: { steps: number; cfgScale: number };
  caps: ModelCapabilities;
}

/** Labeled slider row (title + live value + min/max ticks). */
function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-muted-foreground">{label}</label>
        <span className="numeric rounded-md bg-secondary px-1.5 py-0.5 text-xs text-foreground">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="range-brand cursor-pointer"
        style={{
          background: `linear-gradient(to right, hsl(var(--primary)) ${pct}%, hsl(var(--border-strong)) ${pct}%)`,
        }}
      />
      <div className="mt-1.5 flex justify-between text-[10px] text-tertiary numeric">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

/**
 * Sampling knobs (steps / CFG / seed). Which appear is driven by `caps` + the
 * model's declared `limits` — no per-model branching. Rendered raw (no section
 * wrapper) so the rail's accordion owns the header.
 */
export function SamplingControls({ selectedModel, settings, onChange, defaults, caps }: ControlsProps) {
  const limits = selectedModel?.limits ?? { steps: { min: 1, max: 50 }, cfgScale: { min: 1, max: 20 } };
  const currentSteps = settings.steps ?? selectedModel?.settings?.steps ?? defaults.steps;
  const currentCfg = settings.cfgScale ?? selectedModel?.settings?.cfgScale ?? defaults.cfgScale;

  return (
    <>
      {/* Steps — omitted for recipes with no declared steps band (inert knob). */}
      {caps.hasSteps && limits.steps && (
        <Slider
          label="Steps"
          value={currentSteps}
          display={String(currentSteps)}
          min={limits.steps.min}
          max={limits.steps.max}
          step={1}
          onChange={(v) => onChange({ ...settings, steps: Math.round(v) })}
        />
      )}

      <Slider
        label="CFG scale"
        value={currentCfg}
        display={currentCfg.toFixed(1)}
        min={limits.cfgScale?.min ?? 1}
        max={limits.cfgScale?.max ?? 20}
        step={0.5}
        onChange={(v) => onChange({ ...settings, cfgScale: v })}
      />

      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">
          Seed <span className="text-tertiary">(optional)</span>
        </label>
        <input
          type="text"
          value={settings.seed || ""}
          onChange={(e) => onChange({ ...settings, seed: e.target.value || undefined })}
          placeholder="Random"
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-tertiary focus:outline-none focus:border-primary/50"
        />
      </div>
    </>
  );
}

/**
 * Motion knobs for video (duration / width / height). The frame-count ↔ seconds
 * math matches what the generation hook expects. Rendered raw for the accordion.
 */
export function MotionControls({ selectedModel, settings, onChange }: ControlsProps) {
  const limits = selectedModel?.limits ?? {};
  const fps = selectedModel?.settings?.fps ?? 24;
  const currentWidth = settings.width ?? selectedModel?.settings?.width ?? 768;
  const currentHeight = settings.height ?? selectedModel?.settings?.height ?? 512;
  const currentLength = settings.length ?? selectedModel?.settings?.length ?? 121;
  const currentSeconds = currentLength / fps;
  const lengthLimits = limits.length ?? { min: 24, max: 192, step: 24 };
  const secondsMin = lengthLimits.min / fps;
  const secondsMax = lengthLimits.max / fps;
  const secondsStep = lengthLimits.step / fps;

  return (
    <>
      <Slider
        label="Duration"
        value={currentSeconds}
        display={`${currentSeconds.toFixed(1)}s`}
        min={secondsMin}
        max={secondsMax}
        step={secondsStep}
        onChange={(v) => onChange({ ...settings, length: Math.round(v * fps) })}
      />

      {limits.width && (
        <Slider
          label="Width"
          value={currentWidth}
          display={`${currentWidth}px`}
          min={limits.width.min}
          max={limits.width.max}
          step={limits.width.step}
          onChange={(v) => onChange({ ...settings, width: Math.round(v) })}
        />
      )}

      {limits.height && (
        <Slider
          label="Height"
          value={currentHeight}
          display={`${currentHeight}px`}
          min={limits.height.min}
          max={limits.height.max}
          step={limits.height.step}
          onChange={(v) => onChange({ ...settings, height: Math.round(v) })}
        />
      )}
    </>
  );
}
