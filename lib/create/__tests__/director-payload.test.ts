import {
  buildSegmentPayload,
  buildSegmentTimeline,
  buildSegmentFallbackPayload,
  buildFirstFramePayload,
  isModelUnavailableError,
  segmentBlockers,
  DIRECTOR_MODEL_ID,
  FALLBACK_MODEL_ID,
  FIRST_FRAME_MODEL_ID,
} from '@/lib/create/director-payload';
import { newSegment } from '@/lib/stores/director-store';
import { DEFAULT_DIRECTOR_SETTINGS } from '@/lib/types/director';

const SETTINGS = { ...DEFAULT_DIRECTOR_SETTINGS };

describe('buildSegmentPayload', () => {
  const segment = {
    ...newSegment(),
    prompt: 'the camera orbits the rider',
    lengthFrames: 96, // 4s
    startImage: 'data:image/jpeg;base64,KEY',
    startImageName: 'bike.jpg',
    strength: 0.8,
  };

  it('compiles one segment into one Director-recipe job', () => {
    const p = buildSegmentPayload({
      segment,
      offsetFrames: 72,
      globalPrompt: 'a mountain biker at golden hour',
      settings: SETTINGS,
      seed: '42',
    });

    expect(p.modelId).toBe(DIRECTOR_MODEL_ID);
    expect(p.prompt).toBe('a mountain biker at golden hour');
    expect(p.localPrompts).toBe('the camera orbits the rider');
    expect(p.segmentLengths).toBe('96'); // FRAMES, matching local_prompts 1:1
    expect(p.guideStrength).toBe('0.80');
    expect(p.params.length).toBe(96);
    expect(p.params.fps).toBe(24);
    expect(p.params.seed).toBe('42');
    expect(p.params.cfgScale).toBe(1);
    expect(p.params.steps).toBe(8);

    const t = JSON.parse(p.timelineData!);
    expect(t.global_prompt).toBe(''); // top-level prompt wins on the grid
    expect(t.normalDurationFrames).toBe(97); // frames + 1
    expect(t.segments).toHaveLength(1);
    expect(t.segments[0]).toMatchObject({
      start: 0,
      length: 96,
      type: 'image',
      imageB64: 'data:image/jpeg;base64,KEY',
      guideStrength: 0.8,
    });
    expect(t.audioSegments).toEqual([]);
  });

  it('per-segment negative prompt overrides the shared one', () => {
    const withOverride = buildSegmentPayload({
      segment: { ...segment, negativePrompt: 'no sand' },
      offsetFrames: 0,
      globalPrompt: 'g',
      settings: { ...SETTINGS, negativePrompt: 'blurry' },
    });
    expect(withOverride.negativePrompt).toBe('no sand');
    const withoutOverride = buildSegmentPayload({
      segment,
      offsetFrames: 0,
      globalPrompt: 'g',
      settings: { ...SETTINGS, negativePrompt: 'blurry' },
    });
    expect(withoutOverride.negativePrompt).toBe('blurry');
  });

  it('omits the relay pair when the segment has no own prompt', () => {
    const p = buildSegmentPayload({
      segment: { ...segment, prompt: '  ' },
      offsetFrames: 0,
      globalPrompt: 'global only',
      settings: SETTINGS,
    });
    expect(p.localPrompts).toBeUndefined();
    expect(p.segmentLengths).toBeUndefined();
    expect(p.prompt).toBe('global only');
  });

  it('slices the audio track via trimStart at the segment offset', () => {
    const json = buildSegmentTimeline({
      segment,
      offsetFrames: 120,
      globalPrompt: '',
      settings: SETTINGS,
      audios: [{ audioB64: 'data:audio/wav;base64,BEAT', fileName: 'beat.wav' }],
    });
    const t = JSON.parse(json);
    expect(t.audioSegments).toEqual([
      {
        audioB64: 'data:audio/wav;base64,BEAT',
        audioFile: 'beat.wav', // truthy audioFile REQUIRED (inpaint-mask gotcha)
        fileName: 'beat.wav',
        start: 0,
        length: 96,
        trimStart: 120, // this segment's window into the track
      },
    ]);
  });

  it('adds the audio crop-in point to every trimStart', () => {
    const json = buildSegmentTimeline({
      segment,
      offsetFrames: 120,
      globalPrompt: '',
      settings: SETTINGS,
      audios: [{
        audioB64: 'data:audio/wav;base64,BEAT',
        fileName: 'beat.wav',
        durationSec: 30,
        trimStartSec: 2.5, // crop 2.5s (60 frames) off the head of the file
        trimEndSec: 20,
      }],
    });
    const t = JSON.parse(json);
    expect(t.audioSegments[0].trimStart).toBe(60 + 120);
  });

  it('maps a segment window across multiple audio slices (breakpoints)', () => {
    const json = buildSegmentTimeline({
      segment, // 96 frames
      offsetFrames: 96,
      globalPrompt: '',
      settings: SETTINGS,
      audios: [{
        audioB64: 'data:audio/wav;base64,BEAT',
        fileName: 'beat.wav',
        durationSec: 30,
        // clip A: file 0–5s at timeline 0s (frames 0–120)
        // clip B: file 10–20s at timeline 5s (frames 120–360)
        slices: [
          { id: 'a', timelineStartSec: 0, trimStartSec: 0, trimEndSec: 5 },
          { id: 'b', timelineStartSec: 5, trimStartSec: 10, trimEndSec: 20 },
        ],
      }],
    });
    const t = JSON.parse(json);
    // Segment covers timeline frames 96–192 → tail of A, head of B.
    expect(t.audioSegments).toHaveLength(2);
    expect(t.audioSegments[0]).toMatchObject({ start: 0, length: 24, trimStart: 96 });
    expect(t.audioSegments[1]).toMatchObject({ start: 24, length: 72, trimStart: 240 });
    // audioFile stays truthy on every slice (inpaint-mask gotcha).
    expect(t.audioSegments.every((a: { audioFile: string }) => a.audioFile)).toBe(true);
  });

  it('layers multiple audio tracks — every track contributes its overlap', () => {
    const json = buildSegmentTimeline({
      segment, // 96 frames at offset 0
      offsetFrames: 0,
      globalPrompt: '',
      settings: SETTINGS,
      audios: [
        {
          id: 'track-one',
          audioB64: 'data:audio/wav;base64,MUSIC',
          fileName: 'music.mp3',
          durationSec: 30,
          slices: [{ id: 'm', timelineStartSec: 0, trimStartSec: 0, trimEndSec: 30 }],
        },
        {
          id: 'track-two',
          audioB64: 'data:audio/wav;base64,VOICE',
          fileName: 'voice.wav',
          durationSec: 10,
          slices: [{ id: 'v', timelineStartSec: 0, trimStartSec: 5, trimEndSec: 8 }],
        },
      ],
    });
    const t = JSON.parse(json);
    expect(t.audioSegments).toHaveLength(2);
    expect(t.audioSegments[0]).toMatchObject({
      audioB64: 'data:audio/wav;base64,MUSIC',
      start: 0,
      length: 96,
      trimStart: 0,
    });
    // Track 2's 3s slice covers timeline frames 0–72 from file offset 5s.
    expect(t.audioSegments[1]).toMatchObject({
      audioB64: 'data:audio/wav;base64,VOICE',
      start: 0,
      length: 72,
      trimStart: 120,
    });
    // Track-id prefix keeps audioFile unique across same-named uploads.
    expect(t.audioSegments[0].audioFile).toBe('track-on_music.mp3');
    expect(t.audioSegments[1].audioFile).toBe('track-tw_voice.wav');
  });

  it('honours gaps — a segment falling in a silence gets no audio', () => {
    const track = {
      id: 't',
      audioB64: 'data:audio/wav;base64,BEAT',
      fileName: 'beat.wav',
      durationSec: 30,
      // clip sits at timeline 5s (frames 120+) — timeline 0–5s is a silent gap.
      slices: [{ id: 'c', timelineStartSec: 5, trimStartSec: 0, trimEndSec: 4 }],
    };
    // Segment fully inside the gap (frames 0–96) → no audio.
    const gapJson = buildSegmentTimeline({ segment, offsetFrames: 0, globalPrompt: '', settings: SETTINGS, audios: [track] });
    expect(JSON.parse(gapJson).audioSegments).toHaveLength(0);
    // Segment over the clip (frames 120–216) → audio, from the file start.
    const hitJson = buildSegmentTimeline({ segment, offsetFrames: 120, globalPrompt: '', settings: SETTINGS, audios: [track] });
    const hit = JSON.parse(hitJson).audioSegments;
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ start: 0, length: 96, trimStart: 0 });
  });
});

describe('first-frame payload', () => {
  it('uses Krea 2 Turbo privately at the Director render geometry', () => {
    const payload = buildFirstFramePayload(
      {
        ...newSegment(),
        prompt: 'a rider enters a neon canyon',
        negativePrompt: 'text',
      },
      'cinematic science fiction',
      SETTINGS
    );

    expect(payload).toMatchObject({
      modelId: FIRST_FRAME_MODEL_ID,
      prompt: 'cinematic science fiction. a rider enters a neon canyon',
      negativePrompt: 'text',
      public: false,
      mediaType: 'image',
      sourceProcessing: 'txt2img',
      params: {
        width: SETTINGS.width,
        height: SETTINGS.height,
        steps: 8,
        cfgScale: 1,
        sampler: 'er_sde',
        scheduler: 'simple',
        n: 1,
      },
    });
  });
});

describe('fallback payload (Director recipe offline)', () => {
  it('compiles the segment for the plain i2v recipe with merged prompts', () => {
    const p = buildSegmentFallbackPayload({
      segment: {
        ...newSegment(),
        prompt: 'the rider jumps',
        lengthFrames: 96,
        startImage: 'data:image/jpeg;base64,KEY',
      },
      offsetFrames: 0,
      globalPrompt: 'a biker in the desert',
      settings: SETTINGS,
      seed: '7',
    });
    expect(p.modelId).toBe(FALLBACK_MODEL_ID);
    expect(p.prompt).toBe('a biker in the desert. the rider jumps');
    expect(p.sourceImage).toBe('data:image/jpeg;base64,KEY');
    expect(p.sourceProcessing).toBe('img2video');
    expect(p.timelineData).toBeUndefined();
    expect(p.params.steps).toBeUndefined(); // recipe has no steps var
    expect(p.params.length).toBe(96);
  });

  it('classifies model-unavailable errors', () => {
    expect(isModelUnavailableError(new Error("Model 'LTX Director 2.0' is not available"))).toBe(true);
    expect(isModelUnavailableError(new Error('unknown model: LTX Director 2.0'))).toBe(true);
    expect(isModelUnavailableError(new Error('network timeout'))).toBe(false);
  });
});

describe('segmentBlockers', () => {
  it('requires an image and some prompt', () => {
    const seg = { ...newSegment(), startImage: null, prompt: '' };
    expect(segmentBlockers(seg, 0, '')).toHaveLength(2);
    expect(segmentBlockers(seg, 0, 'global')).toHaveLength(1);
    expect(segmentBlockers({ ...seg, startImage: 'data:x' }, 0, 'global')).toHaveLength(0);
  });

  it('describes a chained segment as waiting on its source', () => {
    const seg = { ...newSegment(), chained: true, startImage: null, prompt: 'p' };
    expect(segmentBlockers(seg, 1, '')[0]).toMatch(/previous segment/);
  });

  it('blocks video submission while its generated start frame is in flight', () => {
    const seg = {
      ...newSegment(),
      startImage: 'data:image/jpeg;base64,OLD',
      startImageStatus: 'generating' as const,
      prompt: 'p',
    };
    expect(segmentBlockers(seg, 0, '')).toContain('is still generating its start image');
  });
});
