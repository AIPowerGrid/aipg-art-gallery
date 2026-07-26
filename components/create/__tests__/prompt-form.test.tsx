import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { PromptForm } from "@/components/create/prompt-form";
import type { Model } from "@/lib/types/create";

const BASE_MODEL: Model = {
  id: "model",
  name: "Model",
  description: "",
  type: "image",
  enabled: true,
  default: true,
};

function renderPrompt(model: Model) {
  render(
    <PromptForm
      prompt=""
      onPromptChange={() => {}}
      onGenerate={async () => false}
      onEnhance={async () => null}
      isGenerating={false}
      isEnhancing={false}
      error={null}
      selectedModel={model}
      batchMode={false}
      onSourceChange={() => {}}
    />,
  );
}

describe("PromptForm source image gate", () => {
  it("hides source upload for text-only image models", () => {
    renderPrompt({ ...BASE_MODEL, capabilities: ["txt2img"] });
    expect(screen.queryByTitle(/add a source image/i)).not.toBeInTheDocument();
  });

  it("shows source upload for approved img2img models", () => {
    renderPrompt({
      ...BASE_MODEL,
      capabilities: ["txt2img", "img2img"],
    });
    expect(screen.getByTitle(/add a source image/i)).toBeInTheDocument();
  });
});
