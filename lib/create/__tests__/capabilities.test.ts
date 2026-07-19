import { getModelCapabilities, listModalities, defaultModelIdForType } from '@/lib/create/capabilities';
import { Model } from '@/lib/types/create';

const base: Model = {
  id: 'm',
  name: 'M',
  description: '',
  type: 'image',
  enabled: true,
  default: false,
};

describe('getModelCapabilities', () => {
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
