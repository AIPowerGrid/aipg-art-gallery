import { useState, useCallback } from 'react';
import { createJob, addToGallery, enhancePrompt } from '@/lib/api';
import { useJobStore } from '@/lib/stores/job-store';
import { generateTagsFromPrompt, DisplayCreation } from '@/lib/storage';
import { getRemainingGenerations, recordAnonGeneration } from '@/lib/generation-limits';
import { isAuthenticated } from '@/lib/auth';
import { StylesConfig, Model, Dimension, AdvancedSettings } from '@/lib/types/create';

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
  walletAddress?: string;
  isConnected: boolean;
  advancedSettings?: AdvancedSettings;
  /** Curated grid style id, or null. The grid expands prompt + locks params. */
  selectedStyleId?: string | null;
  /** data: URI of an img2img source image, or null. */
  sourceImage?: string | null;
  /** Optional CivitAI LoRA to inject. */
  lora?: { name: string; model?: number; clip?: number; is_version?: boolean } | null;
  onCreationAdded: (creation: DisplayCreation) => void;
  onShowAuthModal: () => void;
  onRemainingGensChange: (remaining: number) => void;
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
  walletAddress,
  isConnected,
  advancedSettings = {},
  selectedStyleId = null,
  sourceImage = null,
  lora = null,
  onCreationAdded,
  onShowAuthModal,
  onRemainingGensChange,
}: UseGenerationOptions): UseGenerationReturn {
  const [state, setState] = useState<GenerationState>({
    isGenerating: false,
    isEnhancing: false,
    error: null,
    regeneratingJobId: null,
  });

  const { addJob } = useJobStore();

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error }));
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  /**
   * Generate a new image
   */
  const generate = useCallback(async (prompt: string): Promise<boolean> => {
    if (!prompt.trim() || !selectedModel || !selectedDimension || !styles) {
      return false;
    }

    const authenticated = isConnected && isAuthenticated();

    // Validation checks
    if (!authenticated && batchMode) {
      setError("Batch generation is only available for members. Please connect your wallet.");
      onShowAuthModal();
      return false;
    }

    if (!authenticated && selectedModel.type === "video") {
      setError("Video generation is only available for members. Please connect your wallet.");
      onShowAuthModal();
      return false;
    }

    const generationsNeeded = batchMode ? 4 : 1;
    if (!authenticated && getRemainingGenerations() < generationsNeeded) {
      setError("Not enough free generations remaining.");
      onShowAuthModal();
      return false;
    }

    setState(prev => ({ ...prev, isGenerating: true, error: null }));

    try {
      // Use advanced settings if provided, otherwise fall back to model/defaults
      const steps = advancedSettings.steps ?? selectedModel.settings?.steps ?? styles.defaults.steps ?? 28;
      const cfgScale = advancedSettings.cfgScale ?? selectedModel.settings?.cfgScale ?? styles.defaults.cfgScale ?? 3.5;
      const seed = advancedSettings.seed || undefined;

      const isVideo = selectedModel.type === "video";
      const sourceProcessing = sourceImage
        ? (isVideo ? "img2video" : "img2img")
        : (isVideo ? "txt2video" : "txt2img");

      // Video guards: LTX clamps each side to [512,1280]; scale to fit (keep
      // aspect), round to /32. And video batch is capped at 2 grid-side.
      let width = selectedDimension.width;
      let height = selectedDimension.height;
      if (isVideo) {
        const CAP = 1280, FLOOR = 512;
        const longest = Math.max(width, height);
        if (longest > CAP) { const s = CAP / longest; width = Math.round(width * s); height = Math.round(height * s); }
        const fit = (v: number) => Math.max(FLOOR, Math.min(CAP, Math.round(v / 32) * 32));
        width = fit(width); height = fit(height);
      }
      const batchN = authenticated && batchMode ? (isVideo ? 2 : 4) : 1;

      const resp = await createJob({
        modelId: selectedModel.id,
        prompt: prompt.trim(),
        negativePrompt: "",
        nsfw: false,
        public: true,
        walletAddress,
        mediaType: isVideo ? "video" : "image",
        sourceProcessing,
        ...(selectedStyleId ? { style: selectedStyleId } : {}),
        ...(sourceImage ? { sourceImage } : {}),
        ...(lora ? { loras: [lora] } : {}),
        params: {
          width,
          height,
          steps,
          cfgScale,
          sampler: selectedModel.settings?.sampler ?? styles.defaults.sampler ?? "euler",
          scheduler: styles.defaults.scheduler ?? "normal",
          n: batchN,
          ...(isVideo ? { length: selectedModel.settings?.length ?? 96, fps: selectedModel.settings?.fps ?? 24 } : {}),
          ...(seed ? { seed } : {}),
        },
      });

      // Record generation for anonymous users
      if (!authenticated) {
        recordAnonGeneration(resp.jobId, 1);
        onRemainingGensChange(getRemainingGenerations());
      }

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
        walletAddress,
        isGenerating: true,
        progress: 0,
        status: 'queued',
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
        walletAddress,
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
            walletAddress,
            params: {
              width: selectedDimension.width,
              height: selectedDimension.height,
              steps,
              cfgScale,
              sampler: selectedModel.settings?.sampler ?? styles.defaults.sampler,
              scheduler: styles.defaults.scheduler,
              ...(seed ? { seed } : {}),
            },
            mediaUrls: [],
          });
        } catch (err) {
          console.error('Failed to save job to gallery:', err);
        }
      }

      // Reset generating state on success
      setState(prev => ({ ...prev, isGenerating: false }));
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create job";
      setError(message);
      setState(prev => ({ ...prev, isGenerating: false }));
      return false;
    }
  }, [selectedModel, selectedDimension, styles, batchMode, walletAddress, isConnected, advancedSettings, selectedStyleId, sourceImage, lora, addJob, onCreationAdded, onShowAuthModal, onRemainingGensChange, setError]);

  /**
   * Regenerate an existing creation with the same seed
   */
  const regenerate = useCallback(async (creation: DisplayCreation): Promise<void> => {
    if (!creation.params?.seed) {
      setError("Cannot regenerate: no seed found");
      return;
    }

    const authenticated = isConnected && isAuthenticated();
    if (!authenticated) {
      setError("Please connect your wallet to regenerate");
      onShowAuthModal();
      return;
    }

    setState(prev => ({ ...prev, regeneratingJobId: creation.jobId, error: null }));

    // Find correct model ID
    let modelId = creation.modelId;
    if (styles?.models) {
      const matchingModel = styles.models.find(
        m => m.name === creation.modelName || m.name === creation.modelId || m.id === creation.modelId
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
        walletAddress,
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
        walletAddress,
        isGenerating: true,
        progress: 0,
        status: 'queued',
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
        walletAddress,
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
          walletAddress,
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
        console.error('Failed to save regenerated job:', err);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to regenerate";
      setError(message);
    } finally {
      setState(prev => ({ ...prev, regeneratingJobId: null }));
    }
  }, [walletAddress, isConnected, styles, addJob, onCreationAdded, onShowAuthModal, setError]);

  /**
   * Enhance a prompt using AI
   */
  const enhance = useCallback(async (prompt: string): Promise<string | null> => {
    if (!prompt.trim()) return null;

    setState(prev => ({ ...prev, isEnhancing: true, error: null }));

    try {
      const result = await enhancePrompt({
        prompt: prompt.trim(),
        type: selectedModel?.type === "video" ? "video" : "image",
      });
      return result.enhancedPrompt;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to enhance prompt";
      setError(message);
      return null;
    } finally {
      setState(prev => ({ ...prev, isEnhancing: false }));
    }
  }, [selectedModel, setError]);

  return {
    ...state,
    generate,
    regenerate,
    enhance,
    clearError,
  };
}
