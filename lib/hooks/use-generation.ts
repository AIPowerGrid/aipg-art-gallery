import { useState, useCallback } from "react";
import { createJob, addToGallery, enhancePrompt } from "@/lib/api";
import { useJobStore } from "@/lib/stores/job-store";
import { generateTagsFromPrompt, DisplayCreation } from "@/lib/storage";
import {
  StylesConfig,
  Model,
  Dimension,
  AdvancedSettings,
} from "@/lib/types/create";
import { fitVideoDimensions } from "@/lib/create/build-job-payload";
import { acceptsSourceImage } from "@/lib/create/capabilities";

interface GenerationState {
  isGenerating: boolean;
  isEnhancing: boolean;
  error: string | null;
  regeneratingJobId: string | null;
}

interface UseGenerationOptions {
  styles: StylesConfig | null;
  selectedModel: Model | null;
  selectedDimension: Dimension | null;
  batchMode: boolean;
  ownerIdentifier?: string;
  authenticated: boolean;
  advancedSettings?: AdvancedSettings;
  /** Curated grid style id, or null. The grid expands prompt + locks params. */
  selectedStyleId?: string | null;
  /** data: URI of an img2img source image, or null. */
  sourceImage?: string | null;
  /** Optional CivitAI LoRA to inject. */
  lora?: {
    name: string;
    model?: number;
    clip?: number;
    is_version?: boolean;
  } | null;
  onCreationAdded: (creation: DisplayCreation) => void;
  onShowAuthModal: () => void;
}

interface UseGenerationReturn extends GenerationState {
  generate: (prompt: string) => Promise<boolean>;
  regenerate: (creation: DisplayCreation) => Promise<void>;
  enhance: (prompt: string) => Promise<string | null>;
  clearError: () => void;
}

/**
 * Hook to handle image generation logic
 */
export function useGeneration({
  styles,
  selectedModel,
  selectedDimension,
  batchMode,
  ownerIdentifier,
  authenticated,
  advancedSettings = {},
  selectedStyleId = null,
  sourceImage = null,
  lora = null,
  onCreationAdded,
  onShowAuthModal,
}: UseGenerationOptions): UseGenerationReturn {
  const [state, setState] = useState<GenerationState>({
    isGenerating: false,
    isEnhancing: false,
    error: null,
    regeneratingJobId: null,
  });

  const { addJob } = useJobStore();

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  /**
   * Generate a new image
   */
  const generate = useCallback(
    async (prompt: string): Promise<boolean> => {
      if (!prompt.trim() || !selectedModel || !selectedDimension || !styles) {
        return false;
      }

      // Validation checks
      if (!authenticated) {
        setError("Sign in with Google or a wallet to generate.");
        onShowAuthModal();
        return false;
      }

      setState((prev) => ({ ...prev, isGenerating: true, error: null }));

      try {
        if (selectedModel.requiresImage && !sourceImage) {
          setError(`${selectedModel.name} requires a source image.`);
          setState((prev) => ({ ...prev, isGenerating: false }));
          return false;
        }
        if (sourceImage && !acceptsSourceImage(selectedModel)) {
          setError(`${selectedModel.name} does not accept a source image.`);
          setState((prev) => ({ ...prev, isGenerating: false }));
          return false;
        }

        // Omit steps for recipes that do not expose that control.
        const supportsSteps = Boolean(selectedModel.limits?.steps);
        const steps =
          advancedSettings.steps ??
          selectedModel.settings?.steps ??
          styles.defaults.steps ??
          28;
        const cfgScale =
          advancedSettings.cfgScale ??
          selectedModel.settings?.cfgScale ??
          styles.defaults.cfgScale ??
          3.5;
        const seed = advancedSettings.seed || undefined;

        const isVideo = selectedModel.type === "video";
        const sourceProcessing = sourceImage
          ? isVideo
            ? "img2video"
            : "img2img"
          : isVideo
            ? "txt2video"
            : "txt2img";

        let width = isVideo
          ? (advancedSettings.width ??
            selectedModel.settings?.width ??
            selectedDimension.width)
          : selectedDimension.width;
        let height = isVideo
          ? (advancedSettings.height ??
            selectedModel.settings?.height ??
            selectedDimension.height)
          : selectedDimension.height;
        if (isVideo) {
          ({ width, height } = fitVideoDimensions(width, height));
        }
        const batchN = authenticated && batchMode ? (isVideo ? 2 : 4) : 1;

        const resp = await createJob({
          modelId: selectedModel.id,
          prompt: prompt.trim(),
          negativePrompt: advancedSettings.negativePrompt ?? "",
          nsfw: false,
          public: true,
          mediaType: isVideo ? "video" : "image",
          sourceProcessing,
          ...(selectedStyleId ? { style: selectedStyleId } : {}),
          ...(sourceImage ? { sourceImage } : {}),
          ...(lora ? { loras: [lora] } : {}),
          params: {
            width,
            height,
            ...(supportsSteps ? { steps } : {}),
            cfgScale,
            sampler:
              selectedModel.settings?.sampler ??
              styles.defaults.sampler ??
              "euler",
            scheduler: styles.defaults.scheduler ?? "normal",
            n: batchN,
            ...(isVideo
              ? {
                  length:
                    advancedSettings.length ??
                    selectedModel.settings?.length ??
                    96,
                  fps: selectedModel.settings?.fps ?? 24,
                }
              : {}),
            ...(seed ? { seed } : {}),
          },
        });

        const jobType = selectedModel.type === "video" ? "video" : "image";
        const batchSize = batchN;

        // Create placeholder
        const placeholder: DisplayCreation = {
          jobId: resp.jobId,
          modelId: selectedModel.id,
          modelName: selectedModel.name,
          prompt: prompt.trim(),
          type: jobType,
          createdAt: Date.now(),
          generations: [],
          tags: generateTagsFromPrompt(prompt.trim()),
          walletAddress: ownerIdentifier,
          isGenerating: true,
          progress: 0,
          status: "queued",
          width: selectedDimension.width,
          height: selectedDimension.height,
          expectedGenerations: batchSize,
          params: {
            width: selectedDimension.width,
            height: selectedDimension.height,
            steps,
            cfgScale,
            sampler: selectedModel.settings?.sampler ?? styles.defaults.sampler,
            scheduler: styles.defaults.scheduler,
            ...(seed ? { seed } : {}),
          },
        };

        onCreationAdded(placeholder);

        // Add to job store for tracking
        addJob({
          jobId: resp.jobId,
          modelId: selectedModel.id,
          modelName: selectedModel.name,
          prompt: prompt.trim(),
          type: jobType,
          isNsfw: false,
          isPublic: false,
          walletAddress: ownerIdentifier,
          width: selectedDimension.width,
          height: selectedDimension.height,
          expectedGenerations: batchSize,
        });

        // Save to server for authenticated users
        if (authenticated) {
          try {
            await addToGallery({
              jobId: resp.jobId,
              modelId: selectedModel.id,
              modelName: selectedModel.name,
              prompt: prompt.trim(),
              type: jobType,
              isNsfw: false,
              isPublic: false,
              walletAddress: ownerIdentifier,
              params: {
                width: selectedDimension.width,
                height: selectedDimension.height,
                steps,
                cfgScale,
                sampler:
                  selectedModel.settings?.sampler ?? styles.defaults.sampler,
                scheduler: styles.defaults.scheduler,
                ...(seed ? { seed } : {}),
              },
              mediaUrls: [],
            });
          } catch (err) {
            console.error("Failed to save job to gallery:", err);
          }
        }

        // Reset generating state on success
        setState((prev) => ({ ...prev, isGenerating: false }));
        return true;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to create job";
        setError(message);
        setState((prev) => ({ ...prev, isGenerating: false }));
        return false;
      }
    },
    [
      selectedModel,
      selectedDimension,
      styles,
      batchMode,
      ownerIdentifier,
      authenticated,
      advancedSettings,
      selectedStyleId,
      sourceImage,
      lora,
      addJob,
      onCreationAdded,
      onShowAuthModal,
      setError,
    ],
  );

  /**
   * Regenerate an existing creation with the same seed
   */
  const regenerate = useCallback(
    async (creation: DisplayCreation): Promise<void> => {
      if (!creation.params?.seed) {
        setError("Cannot regenerate: no seed found");
        return;
      }

      if (!authenticated) {
        setError("Please sign in to regenerate");
        onShowAuthModal();
        return;
      }

      setState((prev) => ({
        ...prev,
        regeneratingJobId: creation.jobId,
        error: null,
      }));

      // Find correct model ID
      let modelId = creation.modelId;
      if (styles?.models) {
        const matchingModel = styles.models.find(
          (m) =>
            m.name === creation.modelName ||
            m.name === creation.modelId ||
            m.id === creation.modelId,
        );
        if (matchingModel) {
          modelId = matchingModel.id;
        }
      }

      try {
        const resp = await createJob({
          modelId,
          prompt: creation.prompt,
          negativePrompt: "",
          nsfw: false,
          public: false,
          mediaType: creation.type,
          sourceProcessing: "txt2img",
          params: {
            width: creation.params?.width || creation.width || 896,
            height: creation.params?.height || creation.height || 1152,
            steps: creation.params?.steps || 5,
            cfgScale: creation.params?.cfgScale || 1.5,
            sampler: creation.params?.sampler || "euler",
            scheduler: creation.params?.scheduler || "normal",
            seed: creation.params.seed,
            n: 1,
          },
        });

        const placeholder: DisplayCreation = {
          jobId: resp.jobId,
          modelId: creation.modelId,
          modelName: creation.modelName,
          prompt: creation.prompt,
          type: creation.type,
          createdAt: Date.now(),
          generations: [],
          tags: generateTagsFromPrompt(creation.prompt),
          walletAddress: ownerIdentifier,
          isGenerating: true,
          progress: 0,
          status: "queued",
          width: creation.params?.width || creation.width,
          height: creation.params?.height || creation.height,
          expectedGenerations: 1,
          params: { ...creation.params, seed: creation.params.seed },
        };

        onCreationAdded(placeholder);

        addJob({
          jobId: resp.jobId,
          modelId: creation.modelId,
          modelName: creation.modelName,
          prompt: creation.prompt,
          type: creation.type,
          isNsfw: false,
          isPublic: false,
          walletAddress: ownerIdentifier,
          width: creation.params?.width || creation.width,
          height: creation.params?.height || creation.height,
          expectedGenerations: 1,
        });

        try {
          await addToGallery({
            jobId: resp.jobId,
            modelId: creation.modelId,
            modelName: creation.modelName,
            prompt: creation.prompt,
            type: creation.type,
            isNsfw: false,
            isPublic: false,
            walletAddress: ownerIdentifier,
            params: {
              width: creation.params?.width || creation.width,
              height: creation.params?.height || creation.height,
              steps: creation.params?.steps,
              cfgScale: creation.params?.cfgScale,
              sampler: creation.params?.sampler,
              scheduler: creation.params?.scheduler,
              seed: creation.params.seed,
            },
            mediaUrls: [],
          });
        } catch (err) {
          console.error("Failed to save regenerated job:", err);
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to regenerate";
        setError(message);
      } finally {
        setState((prev) => ({ ...prev, regeneratingJobId: null }));
      }
    },
    [
      ownerIdentifier,
      authenticated,
      styles,
      addJob,
      onCreationAdded,
      onShowAuthModal,
      setError,
    ],
  );

  /**
   * Enhance a prompt using AI
   */
  const enhance = useCallback(
    async (prompt: string): Promise<string | null> => {
      if (!prompt.trim()) return null;
      if (!authenticated) {
        setError("Sign in to enhance prompts.");
        onShowAuthModal();
        return null;
      }

      setState((prev) => ({ ...prev, isEnhancing: true, error: null }));

      try {
        const result = await enhancePrompt({
          prompt: prompt.trim(),
          type: selectedModel?.type === "video" ? "video" : "image",
        });
        return result.enhancedPrompt;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to enhance prompt";
        setError(message);
        return null;
      } finally {
        setState((prev) => ({ ...prev, isEnhancing: false }));
      }
    },
    [authenticated, selectedModel, onShowAuthModal, setError],
  );

  return {
    ...state,
    generate,
    regenerate,
    enhance,
    clearError,
  };
}
