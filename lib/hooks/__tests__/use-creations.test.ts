// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: AI Power Grid
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCreations } from '../use-creations';
import { useJobStore, type TrackedJob } from '@/lib/stores/job-store';
import { fetchMyGallery } from '@/lib/api';

jest.mock('@/lib/api', () => ({ fetchMyGallery: jest.fn() }));

const fetchMine = jest.mocked(fetchMyGallery);
const empty = { items: [], count: 0, wallet: 'a' };

function job(owner: string, id: string): TrackedJob {
  return {
    jobId: id, walletAddress: owner, modelId: 'fixture', modelName: 'Fixture',
    prompt: id, type: 'image', isNsfw: false, isPublic: false,
    status: 'completed', submittedAt: Date.now(),
    result: { jobId: id, status: 'completed', faulted: false, waitTime: 0,
      queuePosition: 0, processing: 0, finished: 1, waiting: 0, generations: [
      { id, seed: '1', kind: 'image', url: `https://images.aipg.art/${id}.png` },
    ] },
  };
}

beforeEach(() => {
  localStorage.clear();
  useJobStore.getState().stopPolling();
  useJobStore.setState({ jobs: [], requests: [], activeOwner: 'a' });
  fetchMine.mockReset();
  fetchMine.mockResolvedValue(empty);
});

it('never shows another account completion from shared browser storage', async () => {
  useJobStore.setState({ jobs: [job('a', 'mine'), job('b', 'private-b')] });
  const { result } = renderHook(() => useCreations('a'));
  await waitFor(() => expect(result.current.isLoaded).toBe(true));
  expect(result.current.creations.map(c => c.jobId)).toEqual(['mine']);
});

it('hides all cached history while signed out without deleting recovery handles', async () => {
  useJobStore.setState({ jobs: [job('a', 'private-a')] });
  const { result } = renderHook(() => useCreations(undefined));
  await waitFor(() => expect(result.current.isLoaded).toBe(true));
  expect(result.current.creations).toEqual([]);
  expect(fetchMine).not.toHaveBeenCalled();
  expect(useJobStore.getState().jobs).toHaveLength(1);
});

it('clears old history immediately on account switch and ignores late fetches', async () => {
  let resolveOld!: (value: Awaited<ReturnType<typeof fetchMyGallery>>) => void;
  fetchMine.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  useJobStore.setState({ jobs: [job('a', 'old'), job('b', 'new')] });
  const { result, rerender } = renderHook(({ owner }) => useCreations(owner), {
    initialProps: { owner: 'a' },
  });
  act(() => { useJobStore.setState({ activeOwner: 'b' }); rerender({ owner: 'b' }); });
  expect(result.current.creations.some(c => c.jobId === 'old')).toBe(false);
  await waitFor(() => expect(result.current.creations.map(c => c.jobId)).toEqual(['new']));
  await act(async () => { resolveOld(empty); });
  expect(result.current.creations.map(c => c.jobId)).toEqual(['new']);
  expect(fetchMine).toHaveBeenCalledTimes(2);
});

it('ignores foreign completions arriving after mount', async () => {
  const { result } = renderHook(() => useCreations('a'));
  await waitFor(() => expect(result.current.isLoaded).toBe(true));
  act(() => useJobStore.setState({ jobs: [job('b', 'late-foreign')] }));
  expect(result.current.creations).toEqual([]);
});

it('only reports current account active work', async () => {
  useJobStore.setState({ jobs: [{ ...job('b', 'foreign-active'), status: 'processing' }] });
  const { result } = renderHook(() => useCreations('a'));
  await waitFor(() => expect(result.current.isLoaded).toBe(true));
  expect(result.current.hasActiveJobs).toBe(false);
});

it('still renders current-account completion and its Core receipt', async () => {
  const mine = { ...job('a', 'mine'), result: {
    ...job('a', 'mine').result!, gridJobId: 'core-receipt',
  } };
  useJobStore.setState({ jobs: [{ ...mine, status: 'processing' }] });
  const { result } = renderHook(() => useCreations('a'));
  await waitFor(() => expect(result.current.isLoaded).toBe(true));
  expect(result.current.hasActiveJobs).toBe(true);
  act(() => useJobStore.setState({ jobs: [mine] }));
  expect(result.current.hasActiveJobs).toBe(false);
  expect(result.current.creations[0]).toMatchObject({
    jobId: 'mine', isGenerating: false, gridJobId: 'core-receipt',
  });
});

it('does not delete foreign persisted jobs through the visible history action', async () => {
  useJobStore.setState({ jobs: [job('b', 'foreign')] });
  const { result } = renderHook(() => useCreations('a'));
  await waitFor(() => expect(result.current.isLoaded).toBe(true));
  act(() => result.current.removeCreation('foreign'));
  expect(useJobStore.getState().jobs.map(j => j.jobId)).toEqual(['foreign']);
});
