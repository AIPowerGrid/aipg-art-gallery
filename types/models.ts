export type ModelCapability = "txt2img" | "img2img" | "txt2video";

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
}

export interface CreateJobRequest {
  modelId: string;
  prompt: string;
  negativePrompt?: string;
  apiKey?: string;
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
  };
  sourceImage?: string;
  sourceMask?: string;
  sourceProcessing?: "img2img" | "inpainting";
}

export interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "faulted";
  faulted: boolean;
  waitTime: number;
  queuePosition: number;
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

