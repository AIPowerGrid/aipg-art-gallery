import { acceptsSourceImage, supportsImageBatch, supportsImageSize, getModelCapabilities, listModalities, defaultModelIdForType } from '@/lib/create/capabilities';
import { Model } from '@/lib/types/create';

const base: Model = {
  id: 'm',
  name: 'M',
  description: '',
  type: 'image',
  enabled: true,
  default: false,
};

describe('supportsImageBatch', () => {
  it.each(['z-image-turbo', 'FLUX.2 Klein 4B FP8', 'Krea 2 Turbo'])('admits qualified online %s', id => {
    expect(supportsImageBatch({ ...base, id, status: 'online' }, false)).toBe(true);
  });

  it('fails closed for unknown, offline, disabled, video and source-conditioned models', () => {
    const model: Model = { ...base, id: 'Krea 2 Turbo', status: 'online' };
    expect(supportsImageBatch(null, false)).toBe(false);
    expect(supportsImageBatch({ ...model, id: 'unknown' }, false)).toBe(false);
    expect(supportsImageBatch({ ...model, status: 'offline' }, false)).toBe(false);
    expect(supportsImageBatch({ ...model, status: undefined }, false)).toBe(false);
    expect(supportsImageBatch({ ...model, enabled: false }, false)).toBe(false);
    expect(supportsImageBatch({ ...model, type: 'video' }, false)).toBe(false);
    expect(supportsImageBatch({ ...model, requiresImage: true }, false)).toBe(false);
    expect(supportsImageBatch(model, true)).toBe(false);
  });
});

describe('getModelCapabilities', () => {
  it('keeps MOSS source-image controls but hides unqualified LoRA and batch controls', () => {
    const moss: Model = { ...base, id: 'MOSS Image SFT BF16', status: 'online',
      supportsLora: false, capabilities: ['txt2img', 'img2img'] };
    expect(getModelCapabilities(moss).acceptsImage).toBe(true);
    expect(getModelCapabilities(moss).supportsLora).toBe(false);
    expect(supportsImageBatch(moss, false)).toBe(false);
  });
  it('returns a safe empty capability set for null (no model loaded yet)', () => {
    const caps = getModelCapabilities(null);
    expect(caps).toEqual({
      isVideo: false,
      hasSteps: false,
      hasCfg: true,
      hasMotion: false,
      hasMotionSize: false,
      supportsLora: false,
      supportsSize: false,
      requiresImage: false,
      acceptsImage: false,
    });
  });

  it('exposes size + lora but no motion for a plain image model', () => {
    const caps = getModelCapabilities({
      ...base,
      type: 'image',
      limits: { steps: { min: 4, max: 16 }, cfgScale: { min: 1, max: 3 } },
    });
    expect(caps.supportsSize).toBe(true);
    expect(caps.supportsLora).toBe(true);
    expect(caps.hasSteps).toBe(true);
    expect(caps.hasMotion).toBe(false);
    expect(caps.hasMotionSize).toBe(false);
    expect(caps.isVideo).toBe(false);
  });

  it('hides the steps knob when the model declares no steps band', () => {
    // e.g. LTX-2.3 Audio: sampling fixed via baked sigmas, steps is inert.
    const caps = getModelCapabilities({
      ...base,
      type: 'video',
      limits: { cfgScale: { min: 1, max: 5 } },
    });
    expect(caps.hasSteps).toBe(false);
  });

  it('exposes motion (duration) but not lora for a video model', () => {
    const caps = getModelCapabilities({
      ...base,
      type: 'video',
      limits: { steps: { min: 4, max: 20 }, cfgScale: { min: 1, max: 5 } },
    });
    expect(caps.isVideo).toBe(true);
    expect(caps.hasMotion).toBe(true);
    expect(caps.supportsLora).toBe(false);
    expect(caps.supportsSize).toBe(false);
    expect(caps.hasMotionSize).toBe(false); // no width/height bands declared
  });

  it('exposes motion-size only when the video model declares width/height bands', () => {
    const caps = getModelCapabilities({
      ...base,
      type: 'video',
      limits: {
        steps: { min: 4, max: 20 },
        cfgScale: { min: 1, max: 5 },
        width: { min: 512, max: 1280, step: 64 },
        height: { min: 512, max: 1280, step: 64 },
      },
    });
    expect(caps.hasMotionSize).toBe(true);
  });

  it('flags a mandatory source image for i2v-only recipes', () => {
    const caps = getModelCapabilities({ ...base, type: 'video', requiresImage: true });
    expect(caps.requiresImage).toBe(true);
    expect(caps.acceptsImage).toBe(true);
  });

  it('only accepts source images for declared img2img/img2video modes', () => {
    expect(acceptsSourceImage({ ...base, capabilities: ["txt2img"] })).toBe(false);
    expect(acceptsSourceImage({ ...base, capabilities: ["txt2img", "img2img"] })).toBe(true);
    expect(
      acceptsSourceImage({
        ...base,
        type: "video",
        capabilities: ["txt2video", "img2video"],
      }),
    ).toBe(true);
  });
});

describe('supportsImageSize', () => {
  const moss: Model = { ...base, limits: {
    width: { min: 512, max: 1344, step: 64 },
    height: { min: 512, max: 1344, step: 64 },
  } };
  const dimension = { id: 1, label: 'Wide', aspectRatio: '16:9', width: 1344, height: 768 };
  it('keeps the tested landscape, portrait and square sizes', () => {
    expect(supportsImageSize(moss, dimension)).toBe(true);
    expect(supportsImageSize(moss, { ...dimension, width: 768, height: 1344 })).toBe(true);
    expect(supportsImageSize(moss, { ...dimension, width: 1024, height: 1024 })).toBe(true);
  });
  it.each([{ width: 1536 }, { height: 1536 }, { width: 500 }, { width: 1000 }])(
    'rejects an unavailable dimension without altering it: %j', patch => {
      expect(supportsImageSize(moss, { ...dimension, ...patch })).toBe(false);
    },
  );
  it('preserves the existing unrestricted fallback when no model bands exist', () => {
    expect(supportsImageSize(base, { ...dimension, width: 1536 })).toBe(true);
    expect(supportsImageSize(null, dimension)).toBe(true);
  });
});

describe('listModalities', () => {
  it('returns distinct enabled types in first-seen order', () => {
    const models: Model[] = [
      { ...base, id: 'a', type: 'image', enabled: true },
      { ...base, id: 'b', type: 'video', enabled: true },
      { ...base, id: 'c', type: 'image', enabled: true },
      { ...base, id: 'd', type: 'audio', enabled: false }, // disabled → excluded
    ];
    expect(listModalities(models)).toEqual(['image', 'video']);
  });

  it('surfaces a brand-new modality automatically once enabled', () => {
    const models: Model[] = [
      { ...base, id: 'a', type: 'image', enabled: true },
      { ...base, id: 'b', type: '3d', enabled: true },
    ];
    expect(listModalities(models)).toEqual(['image', '3d']);
  });
});

describe('defaultModelIdForType', () => {
  const models: Model[] = [
    { ...base, id: 'img-1', type: 'image', enabled: true },
    { ...base, id: 'img-default', type: 'image', enabled: true, default: true },
    { ...base, id: 'vid-1', type: 'video', enabled: true },
    { ...base, id: 'vid-off', type: 'video', enabled: false },
  ];

  it('prefers the default-flagged model of the type', () => {
    expect(defaultModelIdForType(models, 'image')).toBe('img-default');
  });

  it('falls back to the first enabled model of the type', () => {
    expect(defaultModelIdForType(models, 'video')).toBe('vid-1');
  });

  it('returns null when no enabled model of the type exists', () => {
    expect(defaultModelIdForType(models, 'audio')).toBeNull();
  });
});
