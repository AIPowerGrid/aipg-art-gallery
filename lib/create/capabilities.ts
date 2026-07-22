/**
 * Model capabilities — the single source of truth for *which* adaptive control
 * groups the Studio's Advanced panel renders for a given model.
 *
 * The redesign's core promise is that adding a new model or modality is additive:
 * the create page never hardcodes "show a duration slider here". Instead each
 * model *declares* what it supports (via its `type`, `limits`, and flags in
 * config/styles.json + the on-chain ModelVault), and this pure function maps that
 * declaration to a capability set the UI switches on. A future model that, say,
 * exposes a new knob only needs a new field here + a group that reads it — no
 * layout surgery.
 *
 * Kept pure and dependency-free so it's trivially unit-testable (see
 * __tests__/capabilities.test.ts) and reusable from both the rail and the
 * generation path.
 */
import { Model } from '@/lib/types/create';

export interface ModelCapabilities {
  /** Video recipe (motion controls apply; image dimension picker does not). */
  isVideo: boolean;
  /** Model declares a steps band — otherwise steps is inert and hidden. */
  hasSteps: boolean;
  /** CFG scale is meaningful. Currently every model exposes it. */
  hasCfg: boolean;
  /** Duration control applies (video only). */
  hasMotion: boolean;
  /** Width/height sliders apply (video that declares width/height bands). */
  hasMotionSize: boolean;
  /** CivitAI LoRA injection is supported (image models only today). */
  supportsLora: boolean;
  /** Aspect-ratio picker applies (image models; video size lives under Motion). */
  supportsSize: boolean;
  /** A source image is mandatory (i2v-only recipes) — not merely optional. */
  requiresImage: boolean;
}

export function getModelCapabilities(model: Model | null): ModelCapabilities {
  const isVideo = model?.type === 'video';
  return {
    isVideo,
    hasSteps: !!model?.limits?.steps,
    hasCfg: true,
    hasMotion: isVideo,
    hasMotionSize: isVideo && (!!model?.limits?.width || !!model?.limits?.height),
    supportsLora: !!model && model.type !== 'video',
    supportsSize: !!model && !isVideo,
    requiresImage: !!model?.requiresImage,
  };
}

/**
 * The distinct media types across enabled models, in first-seen order — the
 * top-level "what do you want to make" choice (Image / Video / …). Derived from
 * the catalog rather than hardcoded, so a future modality (audio, 3d) becomes a
 * tab automatically.
 */
export function listModalities(models: Model[]): string[] {
  const seen: string[] = [];
  for (const m of models) {
    if (m.enabled && !seen.includes(m.type)) seen.push(m.type);
  }
  return seen;
}

/**
 * The model to select when the user switches to a modality: the one flagged
 * `default` for that type, else the first enabled model of that type.
 */
export function defaultModelIdForType(models: Model[], type: string): string | null {
  const ofType = models.filter((m) => m.enabled && m.type === type);
  const preferred = ofType.find((m) => m.default) ?? ofType[0];
  return preferred?.id ?? null;
}
