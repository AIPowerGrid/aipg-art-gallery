export type ModelCapability = "txt2img" | "img2img" | "txt2video" | "img2video";

export interface ModelLimits {
  width?: RangeField;
  height?: RangeField;
  steps?: RangeField;
  cfgScale?: RangeFieldFloat;
  length?: RangeField;
  fps?: RangeField;
}

export interface RangeField {
  min: number;
  max: number;
  step: number;
}

export interface RangeFieldFloat {
  min: number;
  max: number;
  step: number;
}

export interface ModelDefaults {
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  sampler?: string;
  scheduler?: string;
  denoise?: number;
  length?: number;
  fps?: number;
  tiling?: boolean;
  hiresFix?: boolean;
}

/**
 * Blockchain-derived generation constraints from the ModelVault contract.
 * These take precedence over preset limits when present.
 */
export interface ChainConstraints {
  stepsMin?: number;
  stepsMax?: number;
  cfgMin?: number;
  cfgMax?: number;
  clipSkip?: number;
}

export interface GalleryModel {
  id: string;
  displayName: string;
  type: "image" | "video";
  description: string;
  tags: string[];
  capabilities: ModelCapability[];
  samplers: string[];
  schedulers: string[];
  status: "online" | "offline";
  onlineWorkers: number;
  queueLength: number;
  estimatedWaitSeconds: number;
  defaults: ModelDefaults;
  limits: ModelLimits;
  /** Whether this model is registered on the blockchain */
  onChain: boolean;
  /** Blockchain-derived constraints (if model is on-chain) */
  constraints?: ChainConstraints;
}

/** Response from /api/models endpoint */
export interface ModelsResponse {
  models: GalleryModel[];
  /** Whether models were fetched from blockchain */
  chainSource: boolean;
}

export interface CreateJobRequest {
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  nsfw?: boolean;
  public?: boolean;
  params: {
    width?: number;
    height?: number;
    steps?: number;
    cfgScale?: number;
    sampler?: string;
    scheduler?: string;
    seed?: string;
    denoise?: number;
    length?: number;
    fps?: number;
    tiling?: boolean;
    hiresFix?: boolean;
    n?: number; // Number of images to generate in batch (1-4)
  };
  sourceImage?: string;
  /** End-frame anchor for first-last-frame "fill-between" video recipes (backend passthrough wired in P3). */
  sourceImageEnd?: string;
  /**
   * LTX Director timeline (Director recipes only): the serialized editor state —
   * keyframe images ride inline as base64 inside segment objects.
   */
  timelineData?: string;
  /** Director prompt relay: "|"-delimited per-segment prompts. */
  localPrompts?: string;
  /** Director prompt relay: ","-delimited per-segment frame counts. */
  segmentLengths?: string;
  /** Director image guides: ","-delimited strengths. */
  guideStrength?: string;
  sourceMask?: string;
  sourceProcessing?:
    "txt2img" | "img2img" | "inpainting" | "txt2video" | "img2video";
  mediaType?: "image" | "video";
  /** Curated style id (from GET /api/styles/grid); the grid expands it server-side. */
  style?: string;
  /** CivitAI LoRAs to inject (grid gates + downloads them). */
  loras?: Array<{
    name: string;
    model?: number;
    clip?: number;
    is_version?: boolean;
  }>;
}

export interface CreateAudioJobRequest {
  prompt: string;
  lyrics?: string;
  seconds: number;
  inferenceSteps?: number;
  seed?: number;
}

/** One curated style from GET /api/styles/grid (grid-served creative presets). */
export interface GridStyle {
  id: string;
  name: string;
  description: string;
  model: string;
  job_type: string;
  aspect: string;
  locked: string[];
}

export interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "faulted";
  faulted: boolean;
  /** The grid's actual failure message when faulted (e.g. the 404 model-not-available detail). */
  error?: string;
  waitTime: number;
  queuePosition: number;
  /** Number of jobs currently being processed */
  processing: number;
  /** Number of finished generations */
  finished: number;
  /** Number of generations still waiting */
  waiting: number;
  /** Real worker progress 0-100 while processing (null until first report). */
  progress?: number | null;
  generations: GenerationView[];
  /** Per-job provenance from the grid: worker that ran it + wall-clock seconds. */
  worker?: string;
  genTime?: number;
  model?: string;
}

export interface GenerationView {
  id: string;
  seed: string;
  kind: "image" | "video" | "audio";
  mimeType?: string;
  url?: string;
  base64?: string;
  workerId?: string;
  workerName?: string;
}
