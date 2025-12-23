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
  apiKey?: string;
  nsfw?: boolean;
  public?: boolean;
  /** Wallet address of the user submitting the job */
  walletAddress?: string;
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
  };
  sourceImage?: string;
  sourceMask?: string;
  sourceProcessing?: "txt2img" | "img2img" | "inpainting" | "txt2video" | "img2video";
  mediaType?: "image" | "video";
}

export interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "faulted";
  faulted: boolean;
  waitTime: number;
  queuePosition: number;
  /** Number of jobs currently being processed */
  processing: number;
  /** Number of finished generations */
  finished: number;
  /** Number of generations still waiting */
  waiting: number;
  generations: GenerationView[];
}

export interface GenerationView {
  id: string;
  seed: string;
  kind: "image" | "video";
  mimeType?: string;
  url?: string;
  base64?: string;
}

