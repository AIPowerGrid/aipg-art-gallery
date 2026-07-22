import "@testing-library/jest-dom";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useState } from "react";
import { StudioRail, StudioTab } from "@/components/create/studio-rail";
import { StylesConfig, AdvancedSettings } from "@/lib/types/create";
import { GridStyle } from "@/types/models";

/**
 * Coverage for the vertical rail:
 *  - modality (Image/Video) is the first layer and filters the model list
 *  - empty groups (Style with no styles for the modality) are omitted
 *  - Advanced is a superset of Basic, grouped into collapsible accordions so the
 *    rail stays short; which groups appear follows the model's capabilities
 */

const IMAGE_MODEL = {
  id: "z-image-turbo",
  name: "Z-Image Turbo",
  description: "Fast turbo image generation",
  type: "image",
  enabled: true,
  default: true,
  settings: { steps: 8, cfgScale: 1.5, sampler: "euler" },
  limits: { steps: { min: 4, max: 16 }, cfgScale: { min: 1, max: 3 } },
};

const VIDEO_MODEL = {
  id: "LTX-2.3",
  name: "LTX-2.3 Video",
  description: "Text/image-to-video",
  type: "video",
  enabled: true,
  default: false,
  settings: { steps: 12, cfgScale: 3, sampler: "euler", length: 96, fps: 24, width: 768, height: 512 },
  limits: {
    steps: { min: 4, max: 20 },
    cfgScale: { min: 1, max: 5 },
    width: { min: 512, max: 1280, step: 64 },
    height: { min: 512, max: 1280, step: 64 },
    length: { min: 24, max: 192, step: 24 },
  },
};

const I2V_MODEL = {
  id: "LTX-2.3 Audio",
  name: "LTX-2.3 Audio",
  description: "Image-to-video with audio",
  type: "video",
  enabled: true,
  default: false,
  requiresImage: true,
  settings: { cfgScale: 3, length: 96, fps: 24, width: 768, height: 512 },
  limits: {
    cfgScale: { min: 1, max: 5 },
    width: { min: 512, max: 1280, step: 64 },
    height: { min: 512, max: 1280, step: 64 },
    length: { min: 24, max: 240, step: 24 },
  },
};

const STYLES: StylesConfig = {
  models: [IMAGE_MODEL, VIDEO_MODEL, I2V_MODEL],
  dimensions: [
    { id: 3, width: 1024, height: 1024, label: "Square", aspectRatio: "1:1" },
    { id: 4, width: 896, height: 1152, label: "Portrait", aspectRatio: "3:4" },
  ],
  defaultDimensionId: 4,
  defaults: { steps: 28, cfgScale: 3.5, sampler: "euler", scheduler: "normal" },
};

// Only image styles exist — video has none (exercises the "omit empty Style" path).
const GRID_STYLES: GridStyle[] = [
  { id: "anime", name: "Anime", description: "", model: "z-image-turbo", job_type: "image", aspect: "1:1", locked: [] },
];

function Harness({ initialModelId = "z-image-turbo" }: { initialModelId?: string }) {
  const [modelId, setModelId] = useState(initialModelId);
  const [tab, setTab] = useState<StudioTab>("basic");
  const [dim, setDim] = useState(4);
  const [batch, setBatch] = useState(false);
  const [adv, setAdv] = useState<AdvancedSettings>({});
  const [styleId, setStyleId] = useState<string | null>(null);
  const model = STYLES.models.find((m) => m.id === modelId) ?? null;

  return (
    <StudioRail
      styles={STYLES}
      gridStyles={GRID_STYLES}
      selectedModel={model}
      onModelChange={setModelId}
      dimensionId={dim}
      onDimensionChange={setDim}
      batchMode={batch}
      onBatchModeChange={setBatch}
      authenticated={true}
      selectedStyleId={styleId}
      onStyleSelect={(s) => setStyleId(s?.id ?? null)}
      lora={null}
      onLoraChange={() => {}}
      advancedSettings={adv}
      onAdvancedSettingsChange={setAdv}
      activeTab={tab}
      onActiveTabChange={setTab}
    />
  );
}

// Modality tabs are plain buttons — a click is enough.
const selectModality = (name: RegExp) => fireEvent.click(screen.getByRole("tab", { name }));

// Radix Basic/Advanced tabs use automatic activation (switch on focus); jsdom's
// click doesn't move focus. Returns the active panel to scope queries (Radix
// keeps the visited Basic panel mounted-but-hidden).
function openAdvanced() {
  const tab = screen.getByRole("tab", { name: /advanced/i });
  fireEvent.focus(tab);
  fireEvent.click(tab);
  return screen.getByRole("tabpanel");
}

describe("StudioRail", () => {
  it("offers modality tabs and filters the model list to the active modality", () => {
    render(<Harness />);
    expect(screen.getByRole("tab", { name: /image/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /video/i })).toBeInTheDocument();
    expect(screen.getByText("Z-Image Turbo")).toBeInTheDocument();
    expect(screen.queryByText("LTX-2.3 Video")).not.toBeInTheDocument();

    selectModality(/video/i);
    expect(screen.getByText("LTX-2.3 Video")).toBeInTheDocument();
    expect(screen.queryByText("Z-Image Turbo")).not.toBeInTheDocument();
  });

  it("Basic shows Aspect + Style for image, omits both for video", () => {
    render(<Harness />);
    expect(screen.getByText("Aspect ratio")).toBeInTheDocument();
    expect(screen.getByText("Style")).toBeInTheDocument();
    expect(screen.getByText("Batch")).toBeInTheDocument();

    selectModality(/video/i);
    expect(screen.queryByText("Aspect ratio")).not.toBeInTheDocument();
    expect(screen.queryByText("Style")).not.toBeInTheDocument();
    expect(screen.getByText("Batch")).toBeInTheDocument();
  });

  it("Advanced opens Composition + Sampling by default and keeps Batch reachable", () => {
    render(<Harness />);
    const panel = openAdvanced();
    expect(within(panel).getByText("Sampling")).toBeInTheDocument();
    expect(within(panel).getByText("Steps")).toBeInTheDocument();
    expect(within(panel).getByText("CFG scale")).toBeInTheDocument();
    expect(within(panel).getByText(/Negative prompt/i)).toBeInTheDocument();
    expect(within(panel).getByText("Style")).toBeInTheDocument(); // image → style group present
    expect(within(panel).getByText("Batch")).toBeInTheDocument();
  });

  it("keeps a video model compact: Motion is collapsed until opened, then reveals w/h/duration", () => {
    render(<Harness />);
    selectModality(/video/i);
    const panel = openAdvanced();
    expect(within(panel).getByText("Motion")).toBeInTheDocument();
    expect(within(panel).queryByText("Duration")).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByText("Motion"));
    expect(within(panel).getByText("Duration")).toBeInTheDocument();
    expect(within(panel).getByText("Width")).toBeInTheDocument();
    expect(within(panel).getByText("Height")).toBeInTheDocument();
    // image-only groups gone for video
    expect(within(panel).queryByText("Add-ons")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Style")).not.toBeInTheDocument();
  });

  it("hides the Steps knob when the model declares no steps band", () => {
    render(<Harness />);
    selectModality(/video/i);
    fireEvent.click(screen.getByText("LTX-2.3 Audio"));
    const panel = openAdvanced();
    expect(within(panel).getByText("CFG scale")).toBeInTheDocument();
    expect(within(panel).queryByText("Steps")).not.toBeInTheDocument();
  });

  it("flags a mandatory source image on the i2v model row", () => {
    render(<Harness />);
    selectModality(/video/i);
    const row = screen.getByText("LTX-2.3 Audio").closest("button")!;
    expect(within(row).getByText(/needs image/i)).toBeInTheDocument();
  });

  it("surfaces a Reset control once an Advanced value is edited", () => {
    render(<Harness />);
    const panel = openAdvanced();
    expect(within(panel).queryByText(/Reset advanced/i)).not.toBeInTheDocument();
    fireEvent.change(within(panel).getByPlaceholderText("Random"), { target: { value: "999" } });
    expect(within(panel).getByText(/Reset advanced/i)).toBeInTheDocument();
  });
});
