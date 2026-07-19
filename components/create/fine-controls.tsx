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
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-zinc-400">{label}</label>
        <span className="text-xs text-zinc-300 font-mono tabular-nums">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
      />
      <div className="flex justify-between text-[10px] text-zinc-500 mt-1 tabular-nums">
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
        <label className="block text-xs text-zinc-400 mb-1.5">
          Seed <span className="text-zinc-500">(optional)</span>
        </label>
        <input
          type="text"
          value={settings.seed || ""}
          onChange={(e) => onChange({ ...settings, seed: e.target.value || undefined })}
          placeholder="Random"
          className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500/50"
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
