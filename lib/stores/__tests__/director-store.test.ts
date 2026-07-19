import { useDirectorStore } from '@/lib/stores/director-store';
import { MAX_SEGMENT_FRAMES, MIN_SEGMENT_FRAMES } from '@/lib/types/director';

beforeEach(() => {
  useDirectorStore.getState().reset();
  useDirectorStore.setState({ projects: [], activeProjectId: null, activeProjectName: 'Project 1' });
});

describe('director store', () => {
  it('appends segments chained-by-default after the first', () => {
    const s = useDirectorStore.getState();
    const a = s.addSegment();
    const b = s.addSegment();
    const segs = useDirectorStore.getState().segments;
    expect(segs.map((x) => x.id)).toEqual([a, b]);
    expect(segs[0].chained).toBe(false);
    expect(segs[1].chained).toBe(true);
  });

  it('clamps segment length to the per-job band', () => {
    const s = useDirectorStore.getState();
    const id = s.addSegment();
    s.updateSegment(id, { lengthFrames: 10_000 });
    expect(useDirectorStore.getState().segments[0].lengthFrames).toBe(MAX_SEGMENT_FRAMES);
    s.updateSegment(id, { lengthFrames: 1 });
    expect(useDirectorStore.getState().segments[0].lengthFrames).toBe(MIN_SEGMENT_FRAMES);
  });

  it('never leaves segment 0 chained after remove/move', () => {
    const s = useDirectorStore.getState();
    const a = s.addSegment();
    s.addSegment();
    s.removeSegment(a); // former #2 (chained) becomes #1
    const segs = useDirectorStore.getState().segments;
    expect(segs).toHaveLength(1);
    expect(segs[0].chained).toBe(false);
  });

  it('invalidates chained backfill on move (joins changed)', () => {
    const s = useDirectorStore.getState();
    s.addSegment();
    const b = s.addSegment();
    const c = s.addSegment();
    s.updateSegment(b, { startImage: 'data:frame-of-a', sourceJobId: 'job-a' });
    s.updateSegment(c, { startImage: 'data:frame-of-b', sourceJobId: 'job-b' });
    s.moveSegment(c, -1); // order: a, c, b
    const segs = useDirectorStore.getState().segments;
    expect(segs.map((x) => x.id)[1]).toBe(c);
    const moved = segs.find((x) => x.id === c)!;
    expect(moved.startImage).toBeNull(); // must re-backfill from its NEW predecessor
  });

  it('projects: new/open round-trips the working state; delete active resets', () => {
    const s = useDirectorStore.getState();
    s.setGlobalPrompt('project one prompt');
    s.addSegment();
    s.newProject();

    let st = useDirectorStore.getState();
    expect(st.segments).toHaveLength(0);
    expect(st.globalPrompt).toBe('');
    expect(st.projects).toHaveLength(1);
    const firstId = st.projects[0].id;
    expect(st.projects[0].segments).toHaveLength(1);
    expect(st.activeProjectId).not.toBe(firstId);

    st.setGlobalPrompt('project two');
    st.openProject(firstId);
    st = useDirectorStore.getState();
    expect(st.globalPrompt).toBe('project one prompt');
    expect(st.segments).toHaveLength(1);
    // project two got auto-saved on switch
    expect(st.projects.some((p) => p.globalPrompt === 'project two')).toBe(true);

    st.deleteProject(firstId);
    st = useDirectorStore.getState();
    expect(st.projects.find((p) => p.id === firstId)).toBeUndefined();
    expect(st.segments).toHaveLength(0); // active was deleted → fresh workspace
  });

  it('startProjectFromClip saves current work and seeds a fresh project', () => {
    const s = useDirectorStore.getState();
    s.setGlobalPrompt('old work');
    s.addSegment();
    s.startProjectFromClip({ image: 'data:image/jpeg;base64,LAST', name: 'my clip' });

    const st = useDirectorStore.getState();
    expect(st.segments).toHaveLength(1);
    expect(st.segments[0].startImage).toBe('data:image/jpeg;base64,LAST');
    expect(st.segments[0].chained).toBe(false);
    expect(st.activeProjectName).toBe('my clip');
    expect(st.projects.some((p) => p.globalPrompt === 'old work')).toBe(true);
  });

  it('duplicate copies content but not render state; chained copy re-backfills', () => {
    const s = useDirectorStore.getState();
    s.addSegment();
    const b = s.addSegment();
    s.updateSegment(b, {
      prompt: 'orbit',
      startImage: 'data:frame',
      status: 'done',
      jobId: 'j1',
      outputUrl: 'https://x/1.mp4',
    });
    const copy = s.duplicateSegment(b)!;
    const seg = useDirectorStore.getState().segments.find((x) => x.id === copy)!;
    expect(seg.prompt).toBe('orbit');
    expect(seg.status).toBe('idle');
    expect(seg.jobId).toBeUndefined();
    expect(seg.startImage).toBeNull(); // chained → backfills from its predecessor
  });
});
