"use client";

import { ReactNode } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import * as Accordion from "@radix-ui/react-accordion";
import { StylesConfig, Model, AdvancedSettings } from "@/lib/types/create";
import { GridStyle } from "@/types/models";
import { getModelCapabilities, listModalities, defaultModelIdForType } from "@/lib/create/capabilities";
import { ControlGroup } from "./control-group";
import { ModelPicker } from "./model-picker";
import { SizePicker } from "./size-picker";
import { BatchToggle } from "./batch-toggle";
import { SamplingControls, MotionControls } from "./fine-controls";
import { StylePicker } from "./style-picker";
import { LoraInput, LoraSpec } from "./lora-input";

export type StudioTab = "basic" | "advanced";

interface StudioRailProps {
  styles: StylesConfig | null;
  gridStyles: GridStyle[];
  selectedModel: Model | null;
  onModelChange: (modelId: string) => void;
  dimensionId: number;
  onDimensionChange: (id: number) => void;
  batchMode: boolean;
  onBatchModeChange: (enabled: boolean) => void;
  batchAvailable: boolean;
  authenticated: boolean;
  selectedStyleId: string | null;
  onStyleSelect: (style: GridStyle | null) => void;
  lora: LoraSpec | null;
  onLoraChange: (lora: LoraSpec | null) => void;
  advancedSettings: AdvancedSettings;
  onAdvancedSettingsChange: (settings: AdvancedSettings) => void;
  /** Controlled Basic/Advanced tab (lifted so "Edit in Studio" can open Advanced). */
  activeTab: StudioTab;
  onActiveTabChange: (tab: StudioTab) => void;
}

/** Collapsible section for the Advanced panel — keeps the rail short. */
function AccItem({
  value,
  title,
  badge,
  badgeTone = "default",
  children,
}: {
  value: string;
  title: string;
  badge?: string;
  badgeTone?: "default" | "warn";
  children: ReactNode;
}) {
  return (
    <Accordion.Item value={value} className="border-b border-border last:border-b-0">
      <Accordion.Header className="m-0">
        <Accordion.Trigger className="group w-full flex items-center justify-between py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded">
          <span className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${badgeTone === "warn" ? "bg-amber-400" : "bg-primary"}`} />
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground">{title}</span>
            {badge && (
              <span className="text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">{badge}</span>
            )}
          </span>
          <svg className="w-4 h-4 text-tertiary transition-transform group-data-[state=open]:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="pb-4">{children}</Accordion.Content>
    </Accordion.Item>
  );
}

/**
 * The Studio's vertical control rail.
 *
 * First layer is the modality (Image / Video / …, derived from the catalog) — it
 * narrows the model list to a handful that fits without scrolling. Below, a
 * persistent Basic/Advanced tab: Basic is the reduced essentials; Advanced is a
 * strict superset whose fine-control groups are collapsible accordions, so the
 * rail stays short even for a many-knob model. Which controls appear follows the
 * model's declared capabilities, and any group with nothing to show (e.g. Style
 * when the grid serves no styles for this modality) is omitted, not left blank.
 */
export function StudioRail({
  styles,
  gridStyles,
  selectedModel,
  onModelChange,
  dimensionId,
  onDimensionChange,
  batchMode,
  onBatchModeChange,
  batchAvailable,
  authenticated,
  selectedStyleId,
  onStyleSelect,
  lora,
  onLoraChange,
  advancedSettings,
  onAdvancedSettingsChange,
  activeTab,
  onActiveTabChange,
}: StudioRailProps) {
  const models = styles?.models ?? [];
  const caps = getModelCapabilities(selectedModel);
  const modalities = listModalities(models);
  const activeModality = selectedModel?.type ?? modalities[0] ?? "image";
  const modelsForModality = models.filter((m) => m.enabled && m.type === activeModality);
  const dimensions = styles?.dimensions ?? [];
  const defaults = styles?.defaults ?? { steps: 28, cfgScale: 3.5, sampler: "euler", scheduler: "normal" };

  // Only offer Style when the grid actually serves styles for this modality.
  const hasStyles = gridStyles.some((s) => s.job_type === activeModality);
  const showSize = caps.supportsSize && dimensions.length > 0;

  const hasCustom =
    !!advancedSettings.seed ||
    advancedSettings.steps !== undefined ||
    advancedSettings.cfgScale !== undefined ||
    !!advancedSettings.negativePrompt ||
    advancedSettings.width !== undefined ||
    advancedSettings.height !== undefined ||
    advancedSettings.length !== undefined;

  const switchModality = (type: string) => {
    if (type === activeModality) return;
    const id = defaultModelIdForType(models, type);
    if (id) onModelChange(id);
    onStyleSelect(null); // styles are per-media-type; clear on category switch
  };

  const styleChips = (
    <StylePicker styles={gridStyles} selectedStyleId={selectedStyleId} onSelect={onStyleSelect} modelType={activeModality} bare />
  );

  return (
    <aside className="w-full md:w-[360px] shrink-0 border border-border rounded-2xl p-5 bg-card/40 self-start md:sticky md:top-4">
      {/* First layer: what do you want to make? */}
      {modalities.length > 1 && (
        <div role="tablist" aria-label="Media type" className="flex gap-1 p-1 mb-4 bg-secondary border border-border rounded-lg">
          {modalities.map((m) => {
            const active = m === activeModality;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchModality(m)}
                className={`flex-1 py-1.5 rounded-md text-[12.5px] font-semibold capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>
      )}

      {/* Model — filtered to the active modality */}
      <ControlGroup title="Model">
        <ModelPicker models={modelsForModality} selectedModel={selectedModel} onModelChange={onModelChange} />
        {selectedModel?.description && (
          <p className="mt-2 text-[11px] leading-relaxed text-tertiary">{selectedModel.description}</p>
        )}
      </ControlGroup>

      <Tabs.Root value={activeTab} onValueChange={(v) => onActiveTabChange(v as StudioTab)}>
        <Tabs.List className="flex gap-1 p-1 mb-4 bg-secondary border border-border rounded-lg">
          {(["basic", "advanced"] as const).map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="flex-1 py-1.5 rounded-md text-[12.5px] font-semibold capitalize text-muted-foreground transition-colors data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {tab}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* ---- Basic: essentials only ---- */}
        <Tabs.Content value="basic" className="focus:outline-none">
          {showSize && (
            <ControlGroup title="Aspect ratio">
              <SizePicker dimensions={dimensions} selectedId={dimensionId} onChange={onDimensionChange} />
            </ControlGroup>
          )}
          {hasStyles && <ControlGroup title="Style">{styleChips}</ControlGroup>}
          {batchAvailable && (
            <ControlGroup title="Batch">
              <BatchToggle
                batchMode={batchMode}
                onBatchModeChange={onBatchModeChange}
                authenticated={authenticated}
              />
            </ControlGroup>
          )}
        </Tabs.Content>

        {/* ---- Advanced: superset, grouped into collapsible sections ---- */}
        <Tabs.Content value="advanced" className="focus:outline-none">
          <Accordion.Root type="multiple" defaultValue={["composition", "sampling"]}>
            <AccItem value="composition" title="Composition">
              {showSize && (
                <div className="mb-4">
                  <SizePicker dimensions={dimensions} selectedId={dimensionId} onChange={onDimensionChange} />
                </div>
              )}
              <label className="block text-xs text-muted-foreground mb-1.5">
                Negative prompt <span className="text-tertiary">(optional)</span>
              </label>
              <textarea
                value={advancedSettings.negativePrompt || ""}
                onChange={(e) => onAdvancedSettingsChange({ ...advancedSettings, negativePrompt: e.target.value || undefined })}
                placeholder="Things to avoid in the result…"
                rows={2}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-white placeholder:text-tertiary focus:outline-none focus:border-primary/50 resize-none"
              />
            </AccItem>

            {hasStyles && (
              <AccItem value="style" title="Style">
                {styleChips}
              </AccItem>
            )}

            <AccItem value="sampling" title="Sampling">
              <SamplingControls selectedModel={selectedModel} settings={advancedSettings} onChange={onAdvancedSettingsChange} defaults={defaults} caps={caps} />
            </AccItem>

            {caps.hasMotion && (
              <AccItem value="motion" title="Motion" badge="video" badgeTone="warn">
                <MotionControls selectedModel={selectedModel} settings={advancedSettings} onChange={onAdvancedSettingsChange} defaults={defaults} caps={caps} />
              </AccItem>
            )}

            {caps.supportsLora && (
              <AccItem value="addons" title="Add-ons">
                <LoraInput
                  value={lora}
                  onChange={onLoraChange}
                  bare
                  hint={
                    selectedModel?.id?.toLowerCase().includes("klein")
                      ? "CivitAI link/version id — use Flux.2 Klein 4B LoRAs only"
                      : "CivitAI link/version id — z-image LoRAs work best"
                  }
                />
              </AccItem>
            )}
          </Accordion.Root>

          {batchAvailable && (
            <div className="mt-4 pt-4 border-t border-border">
              <ControlGroup title="Batch">
                <BatchToggle
                  batchMode={batchMode}
                  onBatchModeChange={onBatchModeChange}
                  authenticated={authenticated}
                />
              </ControlGroup>
            </div>
          )}

          {hasCustom && (
            <button
              type="button"
              onClick={() => onAdvancedSettingsChange({})}
              className="btn btn-outline btn-sm mt-4 w-full"
            >
              Reset advanced to defaults
            </button>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
