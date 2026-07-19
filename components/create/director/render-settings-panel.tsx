"use client";

/**
 * Right-rail render settings (mockup B, 1-1): width/height steppers, steps +
 * CFG sliders, negative prompt, and the lock-seed toggle. Shared by every
 * segment — consistent settings across segments are part of what makes
 * chained joins invisible.
 */

import { DirectorSettings } from "@/lib/types/director";
import { Model } from "@/lib/types/create";
import { randomSeed } from "@/lib/create/director-payload";

interface RenderSettingsPanelProps {
  settings: DirectorSettings;
  model: Model | null;
  onChange: (patch: Partial<DirectorSettings>) => void;
  /** The whole-video prompt lives here too — everything in this panel applies
   *  to ALL segments, in contrast to the per-segment panel above it. */
  globalPrompt: string;
  onGlobalPrompt: (p: string) => void;
}

function Stepper({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const snap = (v: number) => clamp(Math.round(v / step) * step);
  return (
    <div>
      <label className="mb-1 block text-[11px] text-[#8f8f99]">{label}</label>
      <div className="flex items-center overflow-hidden rounded-md border border-[#242429] bg-[#17171b]">
        <button type="button" onClick={() => onChange(snap(value - step))} className="h-[29px] w-7 text-[#8f8f99]">
          −
        </button>
        <input
          value={value}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (Number.isFinite(v)) onChange(clamp(v));
          }}
          onBlur={() => onChange(snap(value))}
          inputMode="numeric"
          className="w-full min-w-0 flex-1 bg-transparent text-center text-[12.5px] tabular-nums text-[#e9e9ec] outline-none"
        />
        <button type="button" onClick={() => onChange(snap(value + step))} className="h-[29px] w-7 text-[#8f8f99]">
          +
        </button>
      </div>
    </div>
  );
}

export function RenderSettingsPanel({
  settings,
  model,
  onChange,
  globalPrompt,
  onGlobalPrompt,
}: RenderSettingsPanelProps) {
  const w = model?.limits?.width ?? { min: 512, max: 1280, step: 64 };
  const h = model?.limits?.height ?? { min: 512, max: 1280, step: 64 };
  const st = model?.limits?.steps ?? { min: 4, max: 20 };
  const cfg = model?.limits?.cfgScale ?? { min: 1, max: 5 };

  return (
    <div className="rounded-[10px] border border-[#242429] bg-[#121215] p-4">
      <h3 className="mb-3 flex items-center gap-2">
        <span className="rounded border border-[#313138] bg-[#17171b] px-1.5 py-[1px] text-[9.5px] uppercase tracking-[0.08em] text-[#8f8f99]">
          All segments
        </span>
        <span className="text-[10px] text-[#5a5a64]">shared prompt &amp; settings</span>
      </h3>

      <div className="mb-3">
        <label className="mb-1 block text-[11px] text-[#8f8f99]">Global prompt</label>
        <textarea
          rows={3}
          value={globalPrompt}
          onChange={(e) => onGlobalPrompt(e.target.value)}
          className="w-full resize-y rounded-md border border-[#242429] bg-[#17171b] px-2.5 py-2 text-[12.5px] text-[#e9e9ec] outline-none focus:border-[#4a4a53]"
        />
      </div>

      <div className="mb-3">
        <label className="mb-1 block text-[11px] text-[#8f8f99]">Negative prompt</label>
        <textarea
          rows={2}
          value={settings.negativePrompt}
          onChange={(e) => onChange({ negativePrompt: e.target.value })}
          className="w-full resize-y rounded-md border border-[#242429] bg-[#17171b] px-2.5 py-1.5 text-[12px] text-[#e9e9ec] outline-none focus:border-[#4a4a53]"
        />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Stepper
          label="Width"
          value={settings.width}
          min={w.min}
          max={w.max}
          step={w.step ?? 64}
          onChange={(v) => onChange({ width: v })}
        />
        <Stepper
          label="Height"
          value={settings.height}
          min={h.min}
          max={h.max}
          step={h.step ?? 64}
          onChange={(v) => onChange({ height: v })}
        />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 flex justify-between text-[11px] text-[#8f8f99]">
            Steps <b className="tabular-nums text-[#e9e9ec]">{settings.steps}</b>
          </label>
          <input
            type="range"
            min={st.min}
            max={st.max}
            value={settings.steps}
            onChange={(e) => onChange({ steps: Number(e.target.value) })}
            className="w-full accent-[#f5b544]"
          />
        </div>
        <div>
          <label className="mb-1 flex justify-between text-[11px] text-[#8f8f99]">
            CFG <b className="tabular-nums text-[#e9e9ec]">{settings.cfgScale.toFixed(1)}</b>
          </label>
          <input
            type="range"
            min={cfg.min}
            max={cfg.max}
            step={0.5}
            value={settings.cfgScale}
            onChange={(e) => onChange({ cfgScale: Number(e.target.value) })}
            className="w-full accent-[#f5b544]"
          />
          {settings.cfgScale > 1 && (
            <p className="mt-0.5 text-[10px] text-[#f5b544]">distilled model — keep at 1</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border border-[#242429] bg-[#17171b] px-2.5 py-2">
        <span className="text-[12px] text-[#e9e9ec]">
          Lock seed
          <small className="block text-[10.5px] text-[#5a5a64]">one seed for every segment</small>
        </span>
        <button
          type="button"
          onClick={() => onChange({ lockSeed: !settings.lockSeed })}
          className={`relative h-[18px] w-[32px] flex-shrink-0 rounded-full transition-colors ${
            settings.lockSeed ? "bg-[#f5b544]" : "bg-[#313138]"
          }`}
        >
          <span
            className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-[#141414] transition-all ${
              settings.lockSeed ? "right-[2px]" : "left-[2px] bg-[#8f8f99]"
            }`}
          />
        </button>
      </div>

      {settings.lockSeed && (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-[#8f8f99]">
          <span>Seed</span>
          <input
            value={settings.seed ?? ""}
            onChange={(e) => onChange({ seed: e.target.value || undefined })}
            inputMode="numeric"
            className="h-[26px] min-w-0 flex-1 rounded-md border border-[#242429] bg-[#17171b] px-2 text-[11.5px] tabular-nums text-[#e9e9ec] outline-none placeholder:text-[#5a5a64]"
          />
          <button
            type="button"
            onClick={() => onChange({ seed: randomSeed() })}
            className="text-[#f5b544] hover:underline"
          >
            reroll
          </button>
        </div>
      )}
    </div>
  );
}
