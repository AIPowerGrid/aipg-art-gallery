import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useDirector,
  useDirectorSync,
  __setDirectorOfflineForTests,
} from '@/lib/hooks/use-director';
import { useDirectorStore } from '@/lib/stores/director-store';
import { useJobStore } from '@/lib/stores/job-store';
import { StylesConfig } from '@/lib/types/create';

jest.mock('@/lib/api', () => ({
  createJob: jest.fn(() => Promise.resolve({ jobId: 'dir-job-1', status: 'queued' })),
  addToGallery: jest.fn(() => Promise.resolve({})),
  fetchJobStatus: jest.fn(() =>
    Promise.resolve({
      jobId: 'dir-job-1',
      status: 'queued',
      faulted: false,
      waitTime: 0,
      queuePosition: 0,
      generations: [],
    })
  ),
  updateGalleryItem: jest.fn(() => Promise.resolve({})),
}));
jest.mock('@/lib/utils/video-frames', () => ({
  extractFrame: jest.fn(() => Promise.resolve('data:image/jpeg;base64,LASTFRAME')),
}));
// jsdom has no real Image decode — pass frames through untouched.
jest.mock('@/lib/utils/crop-image', () => ({
  cropImageToRenderSize: jest.fn((uri: string) => Promise.resolve(uri)),
}));
import { createJob } from '@/lib/api';
import { extractFrame } from '@/lib/utils/video-frames';
import { cropImageToRenderSize } from '@/lib/utils/crop-image';

const STYLES: StylesConfig = {
  models: [
    {
      id: 'LTX Director 2.0',
      name: 'LTX Director 2.0',
      description: '',
      type: 'video',
      enabled: true,
      default: false,
      settings: { steps: 8, cfgScale: 1, sampler: 'euler', length: 120, fps: 24 },
      limits: { steps: { min: 4, max: 20 }, cfgScale: { min: 1, max: 5 } },
    },
  ],
  dimensions: [],
  defaultDimensionId: 0,
  defaults: { steps: 20, cfgScale: 3, sampler: 'euler', scheduler: 'normal' },
};

function setup() {
  return renderHook(() => {
    const director = useDirector({
      styles: STYLES,
      authenticated: true,
      onAuthRequired: jest.fn(),
    });
    useDirectorSync(director.renderSegment);
    return director;
  });
}

afterEach(() => {
  useJobStore.getState().stopPolling();
  useJobStore.setState({ jobs: [] });
  useDirectorStore.getState().reset();
  __setDirectorOfflineForTests(false);
  jest.clearAllMocks();
});

describe('useDirector', () => {
  it('does not submit a render without an authenticated session', async () => {
    const id = useDirectorStore.getState().addSegment();
    useDirectorStore.getState().updateSegment(id, {
      startImage: 'data:image/jpeg;base64,IMG',
      prompt: 'ride',
    });
    const onAuthRequired = jest.fn();
    const { result } = renderHook(() =>
      useDirector({
        styles: STYLES,
        authenticated: false,
        onAuthRequired,
      }),
    );

    await act(async () => {
      expect(await result.current.renderSegment(id)).toBe(false);
    });

    expect(onAuthRequired).toHaveBeenCalledTimes(1);
    expect(createJob).not.toHaveBeenCalled();
  });

  it('does not submit when live Grid status has no compatible worker', async () => {
    const id = useDirectorStore.getState().addSegment();
    useDirectorStore.getState().updateSegment(id, {
      startImage: 'data:image/jpeg;base64,IMG',
      prompt: 'ride',
    });
    const { result } = renderHook(() =>
      useDirector({
        styles: STYLES,
        authenticated: true,
        modelAvailability: { checked: true, director: false, fallback: false, krea: true },
        onAuthRequired: jest.fn(),
      }),
    );

    await act(async () => {
      expect(await result.current.renderSegment(id)).toBe(false);
    });

    expect(result.current.error).toMatch(/no compatible.*worker/i);
    expect(createJob).not.toHaveBeenCalled();
  });

  it('uses the advertised fallback without first submitting to an offline Director model', async () => {
    const id = useDirectorStore.getState().addSegment();
    useDirectorStore.getState().updateSegment(id, {
      startImage: 'data:image/jpeg;base64,IMG',
      prompt: 'ride',
    });
    const { result } = renderHook(() =>
      useDirector({
        styles: STYLES,
        authenticated: true,
        modelAvailability: { checked: true, director: false, fallback: true, krea: true },
        onAuthRequired: jest.fn(),
      }),
    );

    await act(async () => {
      expect(await result.current.renderSegment(id)).toBe(true);
    });

    expect(createJob).toHaveBeenCalledTimes(1);
    expect((createJob as jest.Mock).mock.calls[0][0].modelId).toBe('LTX-2.3 Audio');
  });

  it('renders a segment as one Director-recipe job with a locked shared seed', async () => {
    const store = useDirectorStore.getState();
    store.setGlobalPrompt('desert journey');
    const id = store.addSegment();
    store.updateSegment(id, { startImage: 'data:image/jpeg;base64,IMG', prompt: 'ride' });

    const { result } = setup();
    let ok = false;
    await act(async () => {
      ok = await result.current.renderSegment(id);
    });

    expect(ok).toBe(true);
    const payload = (createJob as jest.Mock).mock.calls[0][0];
    expect(payload.modelId).toBe('LTX Director 2.0');
    expect(payload.params.seed).toBeDefined();
    // lockSeed minted a shared seed for subsequent segments
    expect(useDirectorStore.getState().settings.seed).toBe(payload.params.seed);
    expect(useDirectorStore.getState().segments[0].status).toBe('queued');
    expect(useDirectorStore.getState().segments[0].jobId).toBe('dir-job-1');
  });

  it('refuses a segment with no start image', async () => {
    const store = useDirectorStore.getState();
    store.setGlobalPrompt('x');
    const id = store.addSegment();

    const { result } = setup();
    let ok = true;
    await act(async () => {
      ok = await result.current.renderSegment(id);
    });
    expect(ok).toBe(false);
    expect(createJob).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/start image/i);
  });

  it('generates and reconciles a private Krea first frame without using the video job id', async () => {
    const store = useDirectorStore.getState();
    const id = store.addSegment();
    store.updateSegment(id, {
      prompt: 'a luminous train crosses the desert',
      startImageGridJobId: 'stale-frame-receipt',
    });
    (createJob as jest.Mock).mockResolvedValueOnce({ jobId: 'krea-job-1', status: 'queued' });
    (cropImageToRenderSize as jest.Mock).mockResolvedValueOnce('data:image/jpeg;base64,KREA');

    const { result } = setup();
    await act(async () => {
      expect(await result.current.generateFirstFrame(id)).toBe(true);
    });

    const payload = (createJob as jest.Mock).mock.calls[0][0];
    expect(payload.modelId).toBe('Krea 2 Turbo');
    expect(payload.public).toBe(false);
    expect(payload.params).toMatchObject({ width: 768, height: 512, steps: 8 });
    let segment = useDirectorStore.getState().segments[0];
    expect(segment.startImageJobId).toBe('krea-job-1');
    expect(segment.startImageGridJobId).toBeUndefined();
    expect(segment.jobId).toBeUndefined();

    act(() => {
      useJobStore.setState((state) => ({
        jobs: state.jobs.map((job) =>
          job.jobId === 'krea-job-1'
            ? {
                ...job,
                status: 'completed' as const,
                result: {
                  jobId: 'krea-job-1',
                  status: 'completed',
                  faulted: false,
                  waitTime: 0,
                  queuePosition: 0,
                  processing: 0,
                  finished: 1,
                  waiting: 0,
                  gridJobId: 'grid-frame-1',
                  generations: [
                    {
                      id: 'frame',
                      seed: '7',
                      kind: 'image' as const,
                      url: 'https://media.aipg.art/image/frame.webp',
                    },
                  ],
                },
              }
            : job
        ),
      }));
    });

    await waitFor(() => {
      segment = useDirectorStore.getState().segments[0];
      expect(segment.startImage).toBe('data:image/jpeg;base64,KREA');
      expect(segment.startImageStatus).toBe('done');
      expect(segment.startImageUrl).toBe('https://media.aipg.art/image/frame.webp');
      expect(segment.startImageGridJobId).toBe('grid-frame-1');
      expect(segment.jobId).toBeUndefined();
    });
    expect(cropImageToRenderSize).toHaveBeenCalledWith(
      '/api/download?url=https%3A%2F%2Fmedia.aipg.art%2Fimage%2Fframe.webp',
      768,
      512
    );
  });

  it('mirrors completion, extracts the last frame, and backfills the chained segment', async () => {
    const store = useDirectorStore.getState();
    store.setGlobalPrompt('x');
    const a = store.addSegment();
    const b = store.addSegment(); // chained by default
    store.updateSegment(a, {
      startImage: 'data:image/jpeg;base64,IMG',
      gridJobId: 'stale-video-receipt',
    });

    const { result } = setup();
    await act(async () => {
      await result.current.renderSegment(a);
    });
    expect(useDirectorStore.getState().segments[0].gridJobId).toBeUndefined();

    // Simulate the shared job store reporting completion.
    act(() => {
      useJobStore.setState((s) => ({
        jobs: s.jobs.map((j) =>
          j.jobId === 'dir-job-1'
            ? {
                ...j,
                status: 'completed' as const,
                result: {
                  jobId: 'dir-job-1',
                  status: 'completed',
                  faulted: false,
                  waitTime: 0,
                  queuePosition: 0,
                  processing: 0,
                  finished: 1,
                  waiting: 0,
                  gridJobId: 'grid-video-1',
                  generations: [{ id: 'g', seed: '1', kind: 'video' as const, url: 'https://cdn/x.mp4' }],
                },
              }
            : j
        ),
      }));
    });

    await waitFor(() => {
      const segs = useDirectorStore.getState().segments;
      expect(segs[0].status).toBe('done');
      expect(segs[0].outputUrl).toBe('https://cdn/x.mp4');
      expect(segs[0].gridJobId).toBe('grid-video-1');
      expect(segs[0].lastFrame).toBe('data:image/jpeg;base64,LASTFRAME');
      // chained backfill: b's start image is a's last frame
      expect(segs.find((s) => s.id === b)!.startImage).toBe('data:image/jpeg;base64,LASTFRAME');
    });
    expect(extractFrame).toHaveBeenCalledWith('https://cdn/x.mp4', 'last');
  });

  it('async Director-recipe 404 re-queues ONCE via the fallback recipe (no retry loop)', async () => {
    const store = useDirectorStore.getState();
    store.setGlobalPrompt('x');
    const a = store.addSegment();
    store.updateSegment(a, { startImage: 'data:image/jpeg;base64,IMG' });

    const { result } = setup();
    await act(async () => {
      await result.current.renderSegment(a);
    });
    expect((createJob as jest.Mock).mock.calls[0][0].modelId).toBe('LTX Director 2.0');

    // The 404 arrives ASYNCHRONOUSLY via job polling (202+poll bridge).
    (createJob as jest.Mock).mockResolvedValueOnce({ jobId: 'dir-job-2', status: 'queued' });
    act(() => {
      useJobStore.setState((s) => ({
        jobs: s.jobs.map((j) =>
          j.jobId === 'dir-job-1'
            ? { ...j, status: 'faulted' as const, error: "grid video generation failed (404): Model 'LTX Director 2.0' is not available" }
            : j
        ),
      }));
    });

    // Sync resets the segment to idle once; the armed queue resubmits via fallback.
    act(() => {
      result.current.renderPending();
    });
    await waitFor(() => {
      expect((createJob as jest.Mock).mock.calls.length).toBe(2);
      expect((createJob as jest.Mock).mock.calls[1][0].modelId).toBe('LTX-2.3 Audio');
      expect(useDirectorStore.getState().segments[0].autoFellBack).toBe(true);
    });

    // A SECOND fault (fallback also failing) must NOT resubmit — no loop.
    act(() => {
      useJobStore.setState((s) => ({
        jobs: s.jobs.map((j) =>
          j.jobId === 'dir-job-2'
            ? { ...j, status: 'faulted' as const, error: 'worker exploded' }
            : j
        ),
      }));
    });
    await waitFor(() => {
      expect(useDirectorStore.getState().segments[0].status).toBe('error');
    });
    expect((createJob as jest.Mock).mock.calls.length).toBe(2);
    expect(useDirectorStore.getState().queueActive).toBe(false);
  });

  it('render queue submits segments in order and disarms when done', async () => {
    const store = useDirectorStore.getState();
    store.setGlobalPrompt('x');
    const a = store.addSegment();
    store.updateSegment(a, { startImage: 'data:image/jpeg;base64,IMG' });

    const { result } = setup();
    act(() => {
      result.current.renderPending();
    });

    await waitFor(() => {
      expect(createJob).toHaveBeenCalledTimes(1);
      expect(useDirectorStore.getState().segments[0].status).toBe('queued');
    });
  });
});
