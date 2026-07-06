/**
 * Types for the Create page and related components
 */

export interface ModelSettings {
  steps?: number;
  cfgScale?: number;
  sampler?: string;
  scheduler?: string;
  length?: number; // video: frame count
  fps?: number;    // video: frames per second
}

export interface ModelLimits {
  steps?: { min: number; max: number };
  cfgScale?: { min: number; max: number };
}

export interface Model {
  id: string;
  name: string;
  description: string;
  type: string;
  enabled: boolean;
  default: boolean;
  settings?: ModelSettings;
  limits?: ModelLimits;
}

export interface AdvancedSettings {
  seed?: string;
  steps?: number;
  cfgScale?: number;
}

export interface Dimension {
  id: number;
  width: number;
  height: number;
  label: string;
  aspectRatio: string;
}

export interface StylesConfig {
  models: Model[];
  dimensions: Dimension[];
  defaultDimensionId: number;
  defaults: {
    steps: number;
    cfgScale: number;
    sampler: string;
    scheduler: string;
  };
}

export interface GenerationParams {
  width: number;
  height: number;
  steps?: number;
  cfgScale?: number;
  sampler?: string;
  scheduler?: string;
  seed?: string;
  n?: number;
}

export interface GenerateOptions {
  prompt: string;
  model: Model;
  dimension: Dimension;
  batchMode: boolean;
  walletAddress?: string;
  defaults: StylesConfig['defaults'];
}

export interface RegenerateOptions {
  creation: import('@/lib/storage').DisplayCreation;
  walletAddress?: string;
  models?: Model[];
}
